/**
 * Guest analyze endpoint — no JWT required.
 * Caps at 500 games, IP-based rate limiting (3 per hour).
 * Returns the same SSE format as the authenticated endpoint.
 */

import { Hono } from 'hono';
import { logger } from '../lib/logger.js';
import { validateAnalyzeRequest } from '../lib/validation.js';
import { SSEStream } from '../lib/sse.js';
import type { ResolvedIdentity, PlayerMetadata } from '../lib/types.js';
import type { PartialIdentityUpdate } from '../pipeline/identity.js';
import type { GameData } from '../lib/types.js';
import { resolveIdentity } from '../pipeline/identity.js';
import { fetchGames } from '../pipeline/gameFetcher.js';
import { fetchOtbGames } from '../pipeline/otbGames.js';
import { parseChessComGames, parseLichessGames } from '../pipeline/gameParser.js';
import { validateAndRefetchPgn } from '../pipeline/pgnValidator.js';
import { identifyOpeningsBatch } from '../pipeline/openingClassifier.js';
import { generateStats } from '../pipeline/statsAggregator.js';
import { extractMostPlayedLines } from '../pipeline/moveSequenceExtractor.js';
// Engine analysis removed — engineStats were never displayed in the UI
import { generateReportParallel } from '../pipeline/geminiReport.js';
import { postProcessReport } from '../pipeline/reportPostProcessor.js';
// TM advice skipped for guest reports

export const analyzeGuestRoute = new Hono();

const GUEST_MAX_GAMES = 500;
const GUEST_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const GUEST_RATE_MAX = 3;
const GUEST_CONCURRENT_MAX = 2;

interface GuestLimit {
  concurrent: number;
  windowStart: number;
  windowCount: number;
}

const guestLimits = new Map<string, GuestLimit>();

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

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
  for (const c of candidates) counts.set(c, 0);

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
    if (n > bestCount) { best = c; bestCount = n; }
  }
  return best;
}

analyzeGuestRoute.post('/analyze-guest', async (c) => {
  const ip = getClientIp(c);
  const now = Date.now();

  // Rate limiting by IP
  let limit = guestLimits.get(ip);
  if (!limit) {
    limit = { concurrent: 0, windowStart: now, windowCount: 0 };
    guestLimits.set(ip, limit);
  }
  if (now - limit.windowStart > GUEST_RATE_WINDOW_MS) {
    limit.windowStart = now;
    limit.windowCount = 0;
  }
  if (limit.concurrent >= GUEST_CONCURRENT_MAX) {
    return c.json({ error: 'Too many guest analyses in progress. Please wait for the current one to finish.' }, 429);
  }
  if (limit.windowCount >= GUEST_RATE_MAX) {
    return c.json({ error: `Guest rate limit exceeded. Maximum ${GUEST_RATE_MAX} analyses per hour. Sign up for unlimited access.` }, 429);
  }

  limit.concurrent++;
  limit.windowCount++;

  const releaseSlot = () => {
    limit!.concurrent = Math.max(0, limit!.concurrent - 1);
    // Cleanup stale entries
    for (const [key, val] of guestLimits.entries()) {
      if (now - val.windowStart > GUEST_RATE_WINDOW_MS * 2 && val.concurrent === 0) {
        guestLimits.delete(key);
      }
    }
  };

  let input;
  try {
    const body = await c.req.json();
    // Force guest limits before validation
    const capped = {
      ...body,
      gameLimit: Math.min(body.gameLimit ?? 500, GUEST_MAX_GAMES),
      onlineLimit: Math.min(body.onlineLimit ?? 250, GUEST_MAX_GAMES),
      otbLimit: Math.min(body.otbLimit ?? 250, GUEST_MAX_GAMES),
    };
    // Ensure split adds up to gameLimit
    const total = capped.gameLimit;
    if (capped.onlineLimit + capped.otbLimit !== total) {
      capped.onlineLimit = Math.min(capped.onlineLimit, total);
      capped.otbLimit = total - capped.onlineLimit;
    }
    input = validateAnalyzeRequest(capped);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    releaseSlot();
    return c.json({ error: message }, 400);
  }

  logger.info({ ip, name: input.name }, '[AnalyzeGuest] Starting guest pipeline');

  const sse = new SSEStream();

  const pipelinePromise = (async () => {
    try {
      const gameLimit = input.gameLimit || GUEST_MAX_GAMES;
      const onlineLimit = Math.min(input.onlineLimit ?? gameLimit, GUEST_MAX_GAMES);
      const otbLimit = Math.min(input.otbLimit ?? 0, GUEST_MAX_GAMES);

      // Phase 1: Identity
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

      const identityDurationMs = Date.now() - identityStart;
      sse.sendPhase({ phase: 'identity', status: 'complete', durationMs: identityDurationMs });

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

      let hasOnline = onlineLimit > 0 && !!(identity.chessComUsername || identity.lichessUsername);
      let effectiveOtbLimit = otbLimit;
      let hasOtb = otbLimit > 0 && !!identity.fideId;

      if (!hasOnline && identity.fideId && gameLimit > 0) {
        effectiveOtbLimit = gameLimit;
        hasOtb = true;
      }

      if (!hasOnline && !hasOtb) {
        sse.sendError({ error: 'Could not find Chess.com, Lichess username, or FIDE ID. Please provide at least one.' });
        return;
      }

      // Phase 2: Game Fetching
      const gamesStart = Date.now();
      let gameResult: Awaited<ReturnType<typeof fetchGames>> = {
        chessComGames: [],
        lichessGamesNdjson: '',
        totalGames: 0,
        durationMs: 0,
      };

      const onlineFetchLimit = onlineLimit;
      const otbPromise = (effectiveOtbLimit > 0 && identity.fideId)
        ? fetchOtbGames(identity.fideId, effectiveOtbLimit)
        : Promise.resolve([] as GameData[]);
      const onlinePromise = (onlineFetchLimit > 0 && hasOnline)
        ? fetchGames(identity.chessComUsername || '', identity.lichessUsername || '', onlineFetchLimit, sse)
        : Promise.resolve(gameResult);

      const [otbGames, onlineResult] = await Promise.all([otbPromise, onlinePromise]);
      gameResult = onlineResult;

      const gamesDurationMs = Date.now() - gamesStart;

      // Phase 3: Parsing + Stats
      const parsingStart = Date.now();
      sse.sendPhase({ phase: 'parsing', status: 'started' });

      const chessComGames = parseChessComGames(gameResult.chessComGames, identity.chessComUsername);
      const lichessGames = parseLichessGames(gameResult.lichessGamesNdjson, identity.lichessUsername);

      const otbSlice = otbGames.slice(0, otbLimit);
      const onlineMerged = [...chessComGames, ...lichessGames].sort(
        (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime(),
      );
      const onlineSlice = onlineMerged.slice(0, onlineLimit);
      let allGames = [...otbSlice, ...onlineSlice].sort(
        (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime(),
      );

      const validationResult = await validateAndRefetchPgn(
        allGames,
        identity.chessComUsername || '',
        identity.lichessUsername || '',
      );
      allGames = validationResult.valid;

      const openingResults = await identifyOpeningsBatch(
        allGames.map((g) => ({ pgn: g.pgn, eco: g.eco })),
        {
          onProgress: (current, total) => {
            sse.sendProgress({ phase: 'parsing', current, total });
          },
        },
      );
      for (const [idx, result] of openingResults) {
        if (result && allGames[idx]) {
          allGames[idx].openingName = result.name;
          allGames[idx].eco = result.eco || allGames[idx].eco;
        }
      }

      const targetUsername = resolveTargetUsername(allGames, identity);
      const whiteStats = generateStats(allGames, targetUsername, 'white');
      const blackStats = generateStats(allGames, targetUsername, 'black');
      const moveSequences = extractMostPlayedLines(allGames, targetUsername, 10, 10);

      const parsingDurationMs = Date.now() - parsingStart;
      sse.sendPhase({ phase: 'parsing', status: 'complete', durationMs: parsingDurationMs, gameCount: allGames.length });
      sse.sendEvent('parsing', { whiteOpenings: whiteStats, blackDefenses: blackStats, mostPlayedLines: moveSequences, games: allGames });

      // Phase 4: Report Generation
      const reportStart = Date.now();
      sse.sendPhase({ phase: 'report', status: 'started' });

      const rawReport = await generateReportParallel({
        identity,
        allGames,
        whiteStats,
        blackStats,
        moveSequences,
        engineAnalysis: [],
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

      // Skip TM advice for guest reports — saves a Gemini round-trip

      const reportDurationMs = Date.now() - reportStart;
      sse.sendPhase({ phase: 'report', status: 'complete', durationMs: reportDurationMs });

      sse.sendComplete({ report });
      logger.info({ ip, reportId: report.id }, '[AnalyzeGuest] Guest pipeline complete');

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pipeline error';
      logger.error({ err }, '[AnalyzeGuest] Pipeline error');
      sse.sendError({ error: message });
    } finally {
      sse.close();
      releaseSlot();
    }
  })();

  const resp = sse.response();
  pipelinePromise.catch(() => {});
  return resp;
});
