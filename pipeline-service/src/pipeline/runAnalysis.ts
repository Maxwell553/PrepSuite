import { collectReportGames } from './collectReportGames.js';
import {randomUUID} from 'node:crypto';
import {reserveCredits,settleCredits} from '../lib/billingReservation.js';
import type {ScoutingReport} from '../lib/types.js';
import { evidenceContext } from "../lib/evidence.js";
import { workContext } from "../lib/workContext.js";
import { logger } from "../lib/logger.js";
import type { AnalyzeRequestInput } from "../lib/validation.js";
import { SSEStream } from "../lib/sse.js";
import type { ResolvedIdentity, PlayerMetadata } from "../lib/types.js";
import type { PartialIdentityUpdate } from "../pipeline/identity.js";
import type { GameData } from "../lib/types.js";
import { resolveIdentity } from "../pipeline/identity.js";
import { fetchGames } from "../pipeline/gameFetcher.js";
import { fetchOtbGames } from "../pipeline/otbGames.js";
import {
  parseChessComGames,
  parseLichessGames,
} from "../pipeline/gameParser.js";
import { validateAndRefetchPgn } from "../pipeline/pgnValidator.js";
import { identifyOpeningsBatch } from "../pipeline/openingClassifier.js";
import {
  generateStats,
  normalizeTargetGames,
} from "../pipeline/statsAggregator.js";
import { extractMostPlayedLines } from "../pipeline/moveSequenceExtractor.js";
// Engine analysis removed — engineStats were never displayed in the UI
import { generateReportParallel } from "../pipeline/geminiReport.js";
import { postProcessReport } from "../pipeline/reportPostProcessor.js";

/** Pick the identity username that appears in the most games. Prevents empty stats when platform usernames differ. */
function resolveTargetUsername(
  games: GameData[],
  identity: ResolvedIdentity,
): string {
  const candidates = [
    identity.chessComUsername,
    identity.lichessUsername,
    identity.verifiedName,
    identity.fideProfile?.name,
  ].filter(Boolean) as string[];

  if (candidates.length === 0) return "";
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
      if (
        w === cLower ||
        b === cLower ||
        w.includes(cLower) ||
        cLower.includes(w) ||
        b.includes(cLower) ||
        cLower.includes(b)
      ) {
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

export async function runAnalysis(input: AnalyzeRequestInput,sse:SSEStream,userId:string,guest=false,requestId=randomUUID()):Promise<void> {
 const billing=!guest && process.env.BILLING_ENABLED==='true';
 if(billing)await reserveCredits(requestId,userId,input.gameLimit||1500);
 try {
  const report=await evidenceContext.run(new Set(),()=>performAnalysis(input,sse,userId,guest));
  if(!report){if(billing)await settleCredits(requestId,0,false);return;}
  workContext.getStore()?.throwIfAborted();
  const creditsDeducted=billing?await settleCredits(requestId,report.games?.length||0,true):0;
  sse.sendComplete({report,creditsDeducted});
 }catch(error){
  if(billing)await settleCredits(requestId,0,false).catch(refundError=>logger.error({requestId,refundError},'[Billing] Refund deferred to expiry recovery'));
  throw error;
 }
}
async function performAnalysis(
  input: AnalyzeRequestInput,
  sse: SSEStream,
  userId: string,
  guest: boolean,
): Promise<ScoutingReport | undefined> {
  const gameLimit = input.gameLimit || 1500;
  const onlineLimit = input.onlineLimit ?? gameLimit;
  const otbLimit = input.otbLimit ?? 0;

  workContext.getStore()?.throwIfAborted();
  // ── Phase 1: Identity ──────────────────────────────────
  const identityStart = Date.now();
  sse.sendPhase({
    phase: "identity",
    status: "started",
    message: "Identifying player...",
  });

  const identityToPlayer = (
    partial: PartialIdentityUpdate,
  ): Partial<PlayerMetadata> => {
    const p: Partial<PlayerMetadata> = {};
    if (partial.verifiedName) p.name = partial.verifiedName;
    if (partial.fideId !== undefined) p.fideId = partial.fideId || undefined;
    const uscfId = partial.uscfProfile?.id ?? partial.uscfId;
    if (uscfId) p.uscfId = uscfId;
    if (partial.fideProfile?.federation)
      p.country = partial.fideProfile.federation;
    if (partial.fideProfile?.rating != null)
      p.currentRating = partial.fideProfile.rating;
    if (partial.uscfProfile?.rating != null)
      p.uscfRating = partial.uscfProfile.rating;
    const titles = [
      partial.fideProfile?.title,
      partial.uscfProfile?.title,
    ].filter((t): t is string => !!t && t.trim().length > 0);
    if (titles.length > 0) p.titles = titles;
    if (
      partial.chessComUsername !== undefined ||
      partial.lichessUsername !== undefined
    ) {
      p.platforms = {
        ...(partial.chessComUsername
          ? { chessCom: partial.chessComUsername }
          : {}),
        ...(partial.lichessUsername
          ? { lichess: partial.lichessUsername }
          : {}),
      };
    }
    return p;
  };

  const identity = await resolveIdentity(
    input.name,
    input.fideId || "",
    input.uscfId || "",
    input.chessComUsername || undefined,
    input.lichessUsername || undefined,
    (message) =>
      sse.sendPhase({ phase: "identity", status: "progress", message }),
    {
      skipOnlinePlatforms: onlineLimit === 0,
      onPartialIdentity: (partial) => {
        const player = identityToPlayer(partial);
        if (Object.keys(player).length > 0) {
          sse.sendEvent("identity", { player });
        }
      },
    },
  );

  const identityDurationMs = Date.now() - identityStart;
  sse.sendPhase({
    phase: "identity",
    status: "complete",
    durationMs: identityDurationMs,
  });

  // Final identity event (ensures complete state)
  const playerFromIdentity: PlayerMetadata = {
    name: identity.verifiedName,
    fideId: identity.fideId || undefined,
    uscfId: identity.uscfId || undefined,
    country: identity.fideProfile?.federation || undefined,
    currentRating: identity.fideProfile?.rating,
    uscfRating: identity.uscfProfile?.rating,
    titles: [identity.fideProfile?.title, identity.uscfProfile?.title].filter(
      (t): t is string => !!t && t.trim().length > 0,
    ),
    platforms: {
      chessCom: identity.chessComUsername || undefined,
      lichess: identity.lichessUsername || undefined,
    },
  };
  sse.sendEvent("identity", { player: playerFromIdentity });

  logger.info(
    {
      name: identity.verifiedName,
      chessCom: identity.chessComUsername,
      lichess: identity.lichessUsername,
      hasFide: !!identity.fideProfile,
      hasUscf: !!identity.uscfProfile,
    },
    "[Analyze] Identity resolved",
  );

  // Only treat as "has online" when user actually requested online games (onlineLimit > 0)
  let hasOnline =
    onlineLimit > 0 &&
    !!(identity.chessComUsername || identity.lichessUsername);
  let effectiveOtbLimit = otbLimit;
  let hasOtb = otbLimit > 0 && !!identity.fideId;

  // When we have FIDE ID but no Chess.com/Lichess: use OTB games instead of failing.
  // User may have requested online-only (otbLimit=0) but we can still deliver via OTB.
  if (!hasOnline && identity.fideId && gameLimit > 0) {
    effectiveOtbLimit = gameLimit;
    hasOtb = true;
    logger.info(
      { fideId: identity.fideId, effectiveOtbLimit },
      "[Analyze] No online platforms; using OTB games via FIDE ID",
    );
  }

  if (!hasOnline && !hasOtb) {
    const msg =
      "Could not find Chess.com, Lichess username, or FIDE ID. Please provide at least one.";
    logger.warn(
      { name: identity.verifiedName },
      "[Analyze] No platform usernames or FIDE ID found",
    );
    sse.sendError({ error: msg });
    return;
  }

  workContext.getStore()?.throwIfAborted();
  // ── Phase 2: Game Fetching ─────────────────────────────
  const gamesStart = Date.now();
  const sources: Parameters<typeof collectReportGames>[1] = [];
  if (hasOnline) sources.push({quota: onlineLimit, fetch: async limit => {
    const raw = await fetchGames(identity.chessComUsername || '', identity.lichessUsername || '', limit, sse);
    return {games: [...parseChessComGames(raw.chessComGames, identity.chessComUsername), ...parseLichessGames(raw.lichessGamesNdjson, identity.lichessUsername)], exhausted: raw.totalGames < limit};
  }});
  if (hasOtb) sources.push({quota: effectiveOtbLimit, fetch: async limit => {
    const games = await fetchOtbGames(identity.fideId, limit);
    return {games, exhausted: games.length < limit};
  }});
  const allGames = await collectReportGames(gameLimit, sources, async games => {
    const checked = await validateAndRefetchPgn(games, identity.chessComUsername || '', identity.lichessUsername || '');
    return checked.valid;
  });
  const gamesDurationMs = Date.now() - gamesStart;
  const parsingStart = Date.now();
  sse.sendPhase({phase: 'parsing', status: 'started'});
  const chessComGames = allGames.filter(g => g.source === 'chess.com');
  const lichessGames = allGames.filter(g => g.source === 'lichess');
  const otbGames = allGames.filter(g => g.source === 'otb');
  const otbSlice = otbGames;
  const onlineSlice = [...chessComGames,...lichessGames];
  if (allGames.length < gameLimit) {
    sse.sendProgress({phase:'games', current: allGames.length, total: gameLimit});
    logger.info({requested:gameLimit,available:allGames.length}, '[Analyze] Selected sources exhausted before requested total');
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
    "[Analyze] Games parsed",
  );

  // Enrich with ECO library opening names and codes
  const openingResults = await identifyOpeningsBatch(
    allGames.map((g) => ({ pgn: g.pgn, eco: g.eco })),
    {
      onProgress: (current, total) => {
        sse.sendProgress({ phase: "parsing", current, total });
      },
    },
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
  const statisticalGames = normalizeTargetGames(
    allGames,
    [
      identity.chessComUsername,
      identity.lichessUsername,
      identity.verifiedName,
      identity.fideProfile?.name || "",
    ].filter(Boolean),
    targetUsername,
  );
  const whiteStats = generateStats(statisticalGames, targetUsername, "white");
  const blackStats = generateStats(statisticalGames, targetUsername, "black");

  // Extract most-played lines
  const moveSequences = extractMostPlayedLines(
    statisticalGames,
    targetUsername,
    10,
    10,
  );

  const parsingDurationMs = Date.now() - parsingStart;
  sse.sendPhase({
    phase: "parsing",
    status: "complete",
    durationMs: parsingDurationMs,
    gameCount: allGames.length,
  });

  // Stream parsing result for progressive report filling (openings, games)
  sse.sendEvent("parsing", {
    whiteOpenings: whiteStats,
    blackDefenses: blackStats,
    mostPlayedLines: moveSequences,
    games: allGames,
  });

  logger.info(
    { whiteOpenings: whiteStats.length, blackOpenings: blackStats.length },
    "[Analyze] Stats generated",
  );

  workContext.getStore()?.throwIfAborted();
  // ── Phase 4: Report Generation ─────────────────────────
  const reportStart = Date.now();
  sse.sendPhase({ phase: "report", status: "started" });

  logger.info("[Analyze] Generating report (rule-based)");

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

  report.requestedGameCount = gameLimit;
  report.gameCount = allGames.length;
  const reportDurationMs = Date.now() - reportStart;
  sse.sendPhase({
    phase: "report",
    status: "complete",
    durationMs: reportDurationMs,
  });

  report.player.discoverySources = [
    ...(evidenceContext.getStore() || []),
  ].slice(0, 20);
  report.player.identityNote =
    input.chessComUsername || input.lichessUsername
      ? "Includes user-supplied account handles. Check that these accounts belong to the intended player."
      : "Accounts discovered from public evidence. Review linked profiles before preparing.";
  const totalDurationMs =
    identityDurationMs + gamesDurationMs + parsingDurationMs + reportDurationMs;
  logger.info(
    {
      reportId: report.id,
      phaseTimingMs: {
        identity: identityDurationMs,
        games: gamesDurationMs,
        parsing: parsingDurationMs,
        report: reportDurationMs,
      },
      totalMs: totalDurationMs,
    },
    "[Analyze] Report generated",
  );

  workContext.getStore()?.throwIfAborted();
  return report;
}
