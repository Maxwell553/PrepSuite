import { Hono } from 'hono';
import { logger } from '../lib/logger.js';
import { analyzeRateLimitMiddleware } from '../middleware/rateLimit.js';
import { validateAnalyzeRequest } from '../lib/validation.js';
import { SSEStream } from '../lib/sse.js';
import type { ResolvedIdentity, PlayerMetadata } from '../lib/types.js';
import type { PartialIdentityUpdate } from '../pipeline/identity.js';
import type { GameData } from '../lib/types.js';
import { resolveIdentity } from '../pipeline/identity.js';
import { fetchGames } from '../pipeline/gameFetcher.js';
import { fetchOtbGames } from '../pipeline/otbGames.js';
import { parseChessComGames, parseLichessGames, standardizePgnForBoard } from '../pipeline/gameParser.js';
import { fetchLichessPgnBatch } from '../pipeline/lichess.js';
import { validateAndRefetchPgn, isValidPgn } from '../pipeline/pgnValidator.js';
import { identifyOpeningsBatch } from '../pipeline/openingClassifier.js';
import { generateStats } from '../pipeline/statsAggregator.js';
import { extractMostPlayedLines } from '../pipeline/moveSequenceExtractor.js';
import { StockfishPool } from '../pipeline/enginePool.js';
import { sampleGamesForAnalysis } from '../pipeline/engineSampler.js';
import { generateReportParallel } from '../pipeline/geminiReport.js';
import { postProcessReport } from '../pipeline/reportPostProcessor.js';
// MONETIZATION_DISABLED: import { hasEnoughCredits, deductCredits } from '../lib/credits.js';

export const analyzeRoute = new Hono();

/** Pick the identity username that appears in the most games. Prevents empty stats when platform usernames differ. */
function resolveTargetUsername(games: GameData[], identity: ResolvedIdentity): string {
  const candidates = [
    identity.chessComUsername,
    identity.lichessUsername,
    identity.verifiedName,
    identity.fideProfile?.name,
  ].filter(Boolean) as string[];

  if (candidates.length === 0) return '';
  if (games.length === 0) return candidates[0];

  const counts = new Map<string, number>();
  for (const c of candidates) {
    counts.set(c, 0);
  }

  for (const g of games) {
    const w = g.white.toLowerCase().trim();
    const b = g.black.toLowerCase().trim();
    for (const c of candidates) {
      const cLower = c.toLowerCase().trim();
      if (w === cLower || b === cLower || w.includes(cLower) || cLower.includes(w) || b.includes(cLower) || cLower.includes(b)) {
        counts.set(c, (counts.get(c) ?? 0) + 1);
        break;
      }
    }
  }

  let best = candidates[0];
  let bestCount = counts.get(best) ?? 0;
  for (const c of candidates.slice(1)) {
    const n = counts.get(c) ?? 0;
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

analyzeRoute.post('/analyze', analyzeRateLimitMiddleware, async (c) => {
  // Validate input
  let input;
  try {
    const body = await c.req.json();
    input = validateAnalyzeRequest(body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    c.get('releaseAnalyzeSlot')?.();
    return c.json({ error: message }, 400);
  }

  const user = c.get('user');
  logger.info({ userId: user.sub, name: input.name }, '[Analyze] Starting pipeline');

  // Create SSE stream
  const sse = new SSEStream();

  // Create a promise that resolves when the pipeline finishes.
  // We must NOT return the response until we start piping, and
  // we must keep the async pipeline referenced so the stream stays open.
  const pipelinePromise = (async () => {
    try {
      const userId = user.sub;
      const gameLimit = input.gameLimit || 1000;
      const onlineLimit = input.onlineLimit ?? gameLimit;
      const otbLimit = input.otbLimit ?? 0;

      // MONETIZATION_DISABLED: Credit check bypassed for deployment
      // const creditsNeeded = Math.ceil(gameLimit / 5);
      // const enoughCredits = await hasEnoughCredits(userId, creditsNeeded);
      // if (!enoughCredits) { sse.sendError(...); return; }

      // ── Phase 1: Identity ──────────────────────────────────
      const identityStart = Date.now();
      sse.sendPhase({ phase: 'identity', status: 'started', message: 'Identifying player...' });

      const identityToPlayer = (partial: PartialIdentityUpdate): Partial<PlayerMetadata> => {
        const p: Partial<PlayerMetadata> = {};
        if (partial.verifiedName) p.name = partial.verifiedName;
        if (partial.fideId !== undefined) p.fideId = partial.fideId || undefined;
        const uscfId = partial.uscfProfile?.id ?? partial.uscfId;
        if (uscfId) p.uscfId = uscfId;
        if (partial.fideProfile?.federation) p.country = partial.fideProfile.federation;
        if (partial.fideProfile?.rating != null) p.currentRating = partial.fideProfile.rating;
        if (partial.uscfProfile?.rating != null) p.uscfRating = partial.uscfProfile.rating;
        const titles = [partial.fideProfile?.title, partial.uscfProfile?.title].filter((t): t is string => !!t && t.trim().length > 0);
        if (titles.length > 0) p.titles = titles;
        if (partial.chessComUsername !== undefined || partial.lichessUsername !== undefined) {
          p.platforms = {
            ...(partial.chessComUsername ? { chessCom: partial.chessComUsername } : {}),
            ...(partial.lichessUsername ? { lichess: partial.lichessUsername } : {}),
          };
        }
        return p;
      };

      const identity = await resolveIdentity(
        input.name,
        input.fideId || '',
        input.uscfId || '',
        input.chessComUsername || undefined,
        input.lichessUsername || undefined,
        (message) => sse.sendPhase({ phase: 'identity', status: 'progress', message }),
        {
          skipOnlinePlatforms: onlineLimit === 0,
          onPartialIdentity: (partial) => {
            const player = identityToPlayer(partial);
            if (Object.keys(player).length > 0) {
              sse.sendEvent('identity', { player });
            }
          },
        },
      );

      sse.sendPhase({
        phase: 'identity',
        status: 'complete',
        durationMs: Date.now() - identityStart,
      });

      // Final identity event (ensures complete state)
      const playerFromIdentity: PlayerMetadata = {
        name: identity.verifiedName,
        fideId: identity.fideId || undefined,
        uscfId: identity.uscfId || undefined,
        country: identity.fideProfile?.federation || undefined,
        currentRating: identity.fideProfile?.rating,
        uscfRating: identity.uscfProfile?.rating,
        titles: [identity.fideProfile?.title, identity.uscfProfile?.title].filter((t): t is string => !!t && t.trim().length > 0),
        platforms: {
          chessCom: identity.chessComUsername || undefined,
          lichess: identity.lichessUsername || undefined,
        },
      };
      sse.sendEvent('identity', { player: playerFromIdentity });

      logger.info(
        {
          name: identity.verifiedName,
          chessCom: identity.chessComUsername,
          lichess: identity.lichessUsername,
          hasFide: !!identity.fideProfile,
          hasUscf: !!identity.uscfProfile,
        },
        '[Analyze] Identity resolved',
      );

      // Only treat as "has online" when user actually requested online games (onlineLimit > 0)
      let hasOnline =
        onlineLimit > 0 && !!(identity.chessComUsername || identity.lichessUsername);
      let effectiveOtbLimit = otbLimit;
      let hasOtb = otbLimit > 0 && !!identity.fideId;

      // When we have FIDE ID but no Chess.com/Lichess: use OTB games instead of failing.
      // User may have requested online-only (otbLimit=0) but we can still deliver via OTB.
      if (!hasOnline && identity.fideId && gameLimit > 0) {
        effectiveOtbLimit = gameLimit;
        hasOtb = true;
        logger.info(
          { fideId: identity.fideId, effectiveOtbLimit },
          '[Analyze] No online platforms; using OTB games via FIDE ID',
        );
      }

      if (!hasOnline && !hasOtb) {
        const msg = 'Could not find Chess.com, Lichess username, or FIDE ID. Please provide at least one.';
        logger.warn({ name: identity.verifiedName }, '[Analyze] No platform usernames or FIDE ID found');
        sse.sendError({ error: msg });
        return;
      }

      // ── Phase 2: Game Fetching ─────────────────────────────
      let gameResult: Awaited<ReturnType<typeof fetchGames>> = {
        chessComGames: [],
        lichessGamesNdjson: '',
        totalGames: 0,
        durationMs: 0,
      };

      // 1. OTB first: wait for all OTB games to complete before any online fetch
      let otbGames: import('../lib/types.js').GameData[] = [];
      if (effectiveOtbLimit > 0 && identity.fideId) {
        otbGames = await fetchOtbGames(identity.fideId, effectiveOtbLimit);
      }

      // 2. Online only when requested; do NOT fill-in (preserve requested OTB/online split)
      const onlineFetchLimit = onlineLimit;

      if (onlineFetchLimit > 0 && hasOnline) {
        gameResult = await fetchGames(
          identity.chessComUsername || '',
          identity.lichessUsername || '',
          onlineFetchLimit,
          sse,
        );
      }

      logger.info(
        {
          chessComGames: gameResult.chessComGames.length,
          lichessGames: gameResult.lichessGamesNdjson
            ? gameResult.lichessGamesNdjson.split('\n').filter((l) => l.trim()).length
            : 0,
          durationMs: gameResult.durationMs,
        },
        '[Analyze] Games fetched',
      );

      // ── Phase 3: Parsing + Stats ───────────────────────────
      const parsingStart = Date.now();
      sse.sendPhase({ phase: 'parsing', status: 'started' });

      // Parse raw games into GameData[]
      const chessComGames = parseChessComGames(
        gameResult.chessComGames,
        identity.chessComUsername,
      );
      const lichessGames = parseLichessGames(
        gameResult.lichessGamesNdjson,
        identity.lichessUsername,
      );

      // Only refetch PGN for Lichess games that have invalid/missing notation (NDJSON often has usable PGN)
      if (lichessGames.length > 0) {
        const needPgn = lichessGames.filter((g) => !isValidPgn(g.pgn));
        if (needPgn.length > 0) {
          const lichessIds = needPgn.map((g) => g.id);
          const pgnMap = await fetchLichessPgnBatch(lichessIds);
          for (const g of needPgn) {
            const exportPgn = pgnMap.get(g.id);
            if (exportPgn) {
              g.pgn = standardizePgnForBoard(exportPgn);
            }
          }
          logger.info(
            { needed: needPgn.length, fetched: pgnMap.size },
            '[Analyze] Lichess PGN refetched for games with invalid notation',
          );
        }
      }

      // Respect OTB/online split: take up to otbLimit from OTB, up to onlineLimit from online, then combine
      const otbSlice = otbGames.slice(0, otbLimit);
      const onlineMerged = [...chessComGames, ...lichessGames].sort(
        (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime(),
      );
      let onlineSlice = onlineMerged.slice(0, onlineLimit);
      let allGames = [...otbSlice, ...onlineSlice].sort(
        (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime(),
      );

      // Validate PGN and refetch missing/invalid notation once. After one refetch attempt, drop games that still lack valid PGN.
      const validationResult = await validateAndRefetchPgn(
        allGames,
        identity.chessComUsername || '',
        identity.lichessUsername || '',
      );
      allGames = validationResult.valid;
      if (validationResult.invalidCount > 0) {
        logger.info(
          { dropped: validationResult.invalidCount },
          '[Analyze] Dropped games with no valid PGN after single refetch attempt',
        );
      }

      logger.info(
        {
          chessCom: chessComGames.length,
          lichess: lichessGames.length,
          otb: otbGames.length,
          otbSlice: otbSlice.length,
          onlineSlice: onlineSlice.length,
          total: allGames.length,
        },
        '[Analyze] Games parsed',
      );

      // Enrich with ECO library opening names and codes
      const openingResults = await identifyOpeningsBatch(
        allGames.map((g) => ({ pgn: g.pgn, eco: g.eco })),
      );
      for (const [idx, result] of openingResults) {
        if (result && allGames[idx]) {
          allGames[idx].openingName = result.name;
          allGames[idx].eco = result.eco || allGames[idx].eco;
        }
      }

      // Resolve target username: use the identity username that actually appears in games.
      // Prevents empty stats when e.g. chessCom is primary but all games are from Lichess.
      const targetUsername = resolveTargetUsername(allGames, identity);

      // Generate opening stats for both sides
      const whiteStats = generateStats(allGames, targetUsername, 'white');
      const blackStats = generateStats(allGames, targetUsername, 'black');

      // Extract most-played lines
      const moveSequences = extractMostPlayedLines(allGames, targetUsername, 10, 10);

      sse.sendPhase({
        phase: 'parsing',
        status: 'complete',
        durationMs: Date.now() - parsingStart,
        gameCount: allGames.length,
      });

      // Stream parsing result for progressive report filling (openings, games)
      sse.sendEvent('parsing', {
        whiteOpenings: whiteStats,
        blackDefenses: blackStats,
        mostPlayedLines: moveSequences,
        games: allGames,
      });

      logger.info(
        { whiteOpenings: whiteStats.length, blackOpenings: blackStats.length },
        '[Analyze] Stats generated',
      );

      // ── Phase 4: Engine Analysis ───────────────────────────
      const engineStart = Date.now();
      sse.sendPhase({ phase: 'engine', status: 'started' });

      let engineAnalysis: import('../lib/types.js').GameAnalysis[] = [];

      const sampled = sampleGamesForAnalysis(allGames, 80);
      const engineDepth = 7;
      if (sampled.length > 0) {
        let pool: StockfishPool | null = null;
        try {
          pool = new StockfishPool({ workerCount: 4, depth: engineDepth });
          await pool.initialize();

          engineAnalysis = await pool.analyzeGames(sampled, targetUsername, (current, total) => {
            sse.sendProgress({ phase: 'engine', current, total });
          });
        } catch (err) {
          logger.warn({ err }, '[Analyze] Engine analysis failed, continuing without it');
        } finally {
          if (pool) await pool.shutdown().catch(() => { });
        }
      }

      sse.sendPhase({
        phase: 'engine',
        status: 'complete',
        durationMs: Date.now() - engineStart,
        gamesAnalyzed: engineAnalysis.length,
      });

      logger.info(
        { gamesAnalyzed: engineAnalysis.length, durationMs: Date.now() - engineStart },
        '[Analyze] Engine analysis complete',
      );

      // ── Phase 5: Report Generation ─────────────────────────
      const reportStart = Date.now();
      sse.sendPhase({ phase: 'report', status: 'started' });



      logger.info('[Analyze] Generating report (rule-based + engine stats)');

      const rawReport = await generateReportParallel({
        identity,
        allGames,
        whiteStats,
        blackStats,
        moveSequences,
        engineAnalysis,
        targetUsername,
      });

      const report = postProcessReport(rawReport, {
        identity,
        whiteStats,
        blackStats,
        moveSequences,
        allGames,
        actualUsername: targetUsername,
      });

      sse.sendPhase({
        phase: 'report',
        status: 'complete',
        durationMs: Date.now() - reportStart,
      });

      logger.info(
        { reportId: report.id, durationMs: Date.now() - reportStart },
        '[Analyze] Report generated',
      );

      // MONETIZATION_DISABLED: Credit deduction bypassed for deployment
      // const creditsToDeduct = Math.ceil(allGames.length / 5);
      // const deducted = await deductCredits(userId, creditsToDeduct);
      // if (!deducted) { sse.sendError(...); return; }

      // ── Complete ───────────────────────────────────────────
      sse.sendComplete({ report /* creditsDeducted omitted when monetization disabled */ });

      logger.info('[Analyze] Pipeline complete, sent complete event');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pipeline error';
      logger.error({ err }, '[Analyze] Pipeline error');
      sse.sendError({ error: message });
    } finally {
      sse.close();
      c.get('releaseAnalyzeSlot')?.();
    }
  })();

  // Attach the pipeline promise to the response so node-server keeps
  // the connection alive until the async work (and stream writes) finish.
  const resp = sse.response();
  // Keep the pipeline referenced to prevent GC and ensure the stream stays open.
  // @hono/node-server will keep writing chunks as long as the ReadableStream is open.
  pipelinePromise.catch(() => { });  // Prevent unhandled rejection (errors go via SSE)
  return resp;
});
