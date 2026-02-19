import { Hono } from 'hono';
import { logger } from '../lib/logger.js';
import { validateAnalyzeRequest } from '../lib/validation.js';
import { SSEStream } from '../lib/sse.js';
import type { ResolvedIdentity } from '../lib/types.js';
import type { GameData } from '../lib/types.js';
import { resolveIdentity } from '../pipeline/identity.js';
import { fetchGames } from '../pipeline/gameFetcher.js';
import { parseChessComGames, parseLichessGames } from '../pipeline/gameParser.js';
import { identifyOpeningsBatch } from '../pipeline/openingClassifier.js';
import { generateStats } from '../pipeline/statsAggregator.js';
import { extractMostPlayedLines } from '../pipeline/moveSequenceExtractor.js';
import { StockfishPool } from '../pipeline/enginePool.js';
import { sampleGamesForAnalysis } from '../pipeline/engineSampler.js';
import { buildReportPrompt, reportResponseSchema } from '../pipeline/promptBuilder.js';
import { generateReport } from '../pipeline/geminiReport.js';
import { postProcessReport } from '../pipeline/reportPostProcessor.js';

export const analyzeRoute = new Hono();

/** Pick the identity username that appears in the most games. Prevents empty stats when platform usernames differ. */
function resolveTargetUsername(games: GameData[], identity: ResolvedIdentity): string {
  const candidates = [
    identity.chessComUsername,
    identity.lichessUsername,
    identity.verifiedName,
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

analyzeRoute.post('/analyze', async (c) => {
  // Validate input
  let input;
  try {
    const body = await c.req.json();
    input = validateAnalyzeRequest(body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request';
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
      // ── Phase 1: Identity ──────────────────────────────────
      const identityStart = Date.now();
      sse.sendPhase({ phase: 'identity', status: 'started' });

      const identity = await resolveIdentity(
        input.name,
        input.fideId || '',
        input.uscfId || '',
        input.chessComUsername || undefined,
        input.lichessUsername || undefined,
      );

      sse.sendPhase({
        phase: 'identity',
        status: 'complete',
        durationMs: Date.now() - identityStart,
      });

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

      if (!identity.chessComUsername && !identity.lichessUsername) {
        const msg = 'Could not find Chess.com or Lichess username. Please provide usernames manually.';
        logger.warn({ name: identity.verifiedName }, '[Analyze] No platform usernames found');
        sse.sendError({ error: msg });
        return;
      }

      // ── Phase 2: Game Fetching ─────────────────────────────
      const gameLimit = input.gameLimit || 1000;
      const gameResult = await fetchGames(
        identity.chessComUsername,
        identity.lichessUsername,
        gameLimit,
        sse,
      );

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
      // Merge, sort by most recent, trim to gameLimit (parallel fetch can return up to 2*gameLimit)
      const merged = [...chessComGames, ...lichessGames].sort(
        (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime(),
      );
      const allGames = merged.slice(0, gameLimit);

      logger.info(
        { chessCom: chessComGames.length, lichess: lichessGames.length, merged: merged.length, trimmed: allGames.length },
        '[Analyze] Games parsed',
      );

      // Enrich with ECO library opening names
      const openingResults = await identifyOpeningsBatch(
        allGames.map((g) => ({ pgn: g.pgn, eco: g.eco })),
      );
      for (const [idx, result] of openingResults) {
        if (result && allGames[idx]) {
          allGames[idx].openingName = result.name;
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

      logger.info(
        { whiteOpenings: whiteStats.length, blackOpenings: blackStats.length },
        '[Analyze] Stats generated',
      );

      // ── Phase 4: Engine Analysis ───────────────────────────
      const engineStart = Date.now();
      sse.sendPhase({ phase: 'engine', status: 'started' });

      let engineAnalysis: import('../lib/types.js').GameAnalysis[] = [];

      const sampled = sampleGamesForAnalysis(allGames, 80);
      if (sampled.length > 0) {
        let pool: StockfishPool | null = null;
        try {
          pool = new StockfishPool({ workerCount: 4, depth: 10 });
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



      const prompt = buildReportPrompt({
        identity,
        allGames,
        whiteStats,
        blackStats,
        moveSequences,
        engineAnalysis,
        targetUsername,
      });

      logger.info(
        { promptLength: prompt.length },
        '[Analyze] Built report prompt',
      );

      const rawReport = await generateReport(prompt, reportResponseSchema);

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

      // ── Complete ───────────────────────────────────────────
      sse.sendComplete({ report });

      logger.info('[Analyze] Pipeline complete, sent complete event');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pipeline error';
      logger.error({ err }, '[Analyze] Pipeline error');
      sse.sendError({ error: message });
    } finally {
      sse.close();
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
