/**
 * Post-process Gemini report output: validate, enrich, and normalize.
 * Ported from SearchScreen.tsx lines 956-1020.
 */

import type {
  ScoutingReport,
  ResolvedIdentity,
  OpeningStat,
  MoveSequence,
  GameData,
} from '../lib/types.js';
import { parsePGNMoves } from './moveSequenceExtractor.js';
import { aggregateOpeningsBySource } from './statsAggregator.js';
import { computeTimeManagementStats } from './timeManagementAggregator.js';
import { enrichChessComGamesFromPgn } from './gameParser.js';

/** Resolve target username from ONLINE games only. OTB uses FIDE names; online uses platform usernames. */
function resolveTargetUsernameForOnline(
  games: GameData[],
  identity: ResolvedIdentity,
  actualUsername?: string,
): string {
  const online = games.filter((g) => g.source === 'chess.com' || g.source === 'lichess');
  if (online.length === 0) return '';

  const candidates = [
    identity.chessComUsername,
    identity.lichessUsername,
    identity.verifiedName,
    actualUsername,
  ].filter(Boolean) as string[];

  if (candidates.length === 0) return '';

  const counts = new Map<string, number>();
  for (const c of candidates) counts.set(c, 0);

  for (const g of online) {
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
  return bestCount > 0 ? best : '';
}

export interface PostProcessOpts {
  identity: ResolvedIdentity;
  whiteStats: OpeningStat[];
  blackStats: OpeningStat[];
  moveSequences: { white: MoveSequence[]; black: MoveSequence[] };
  allGames: GameData[];
  /** Username that appears in games (for AnalysisBoard win/loss matching) */
  actualUsername?: string;
}

/** Validate opening stats: clamp winRate [0,1], ensure wins+draws+losses = totalGames */
function validateOpeningStats(openings: OpeningStat[]): OpeningStat[] {
  return openings.map((op) => {
    const wins = Math.round(typeof op.wins === 'number' && !isNaN(op.wins) ? op.wins : 0);
    const draws = Math.round(typeof op.draws === 'number' && !isNaN(op.draws) ? op.draws : 0);
    const losses = Math.round(
      typeof op.losses === 'number' && !isNaN(op.losses) ? op.losses : 0,
    );
    const totalGames = Math.max(
      wins + draws + losses,
      Math.round(typeof op.totalGames === 'number' && !isNaN(op.totalGames) ? op.totalGames : 0),
    );
    const winRate = totalGames > 0 ? wins / totalGames : 0;
    const clampedWinRate = Math.max(0, Math.min(1, winRate));
    return {
      ...op,
      wins,
      draws,
      losses,
      totalGames: totalGames || wins + draws + losses,
      winRate: clampedWinRate,
      frequency:
        typeof op.frequency === 'number' && !isNaN(op.frequency)
          ? Math.max(0, Math.min(1, op.frequency))
          : 0,
    };
  });
}

/**
 * Post-process the Gemini report:
 * - Generate ID if missing
 * - Merge identity data into player
 * - Validate and override opening stats with pipeline-computed values
 * - Override mostPlayedLines with pipeline-computed sequences
 * - Set defaults for empty string fields
 * - Attach games for AnalysisBoard
 */
export function postProcessReport(
  reportData: ScoutingReport,
  opts: PostProcessOpts,
): ScoutingReport {
  const { identity, whiteStats, blackStats, moveSequences, allGames, actualUsername } = opts;

  // Generate ID if missing
  if (!reportData.id || reportData.id.trim() === '') {
    reportData.id = `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Ensure player object exists
  if (!reportData.player) {
    reportData.player = {
      name: '',
      platforms: {},
    };
  }

  // Merge identity data
  reportData.player.name = identity.verifiedName;
  reportData.player.platforms = reportData.player.platforms || {};
  reportData.player.platforms.chessCom = identity.chessComUsername || '';
  reportData.player.platforms.lichess = identity.lichessUsername || '';
  reportData.player.currentRating = identity.fideProfile?.rating;
  reportData.player.uscfId = identity.uscfId || reportData.player.uscfId || '';
  reportData.player.uscfRating = identity.uscfProfile?.rating;
  reportData.player.fideId = identity.fideId || '';
  reportData.player.country =
    identity.fideProfile?.federation ||
    identity.uscfProfile?.name?.split(',')?.pop()?.trim() ||
    reportData.player.country ||
    '';

  // Username that appears in games (for AnalysisBoard win/loss matching)
  if (actualUsername) {
    (reportData.player as unknown as Record<string, unknown>).actualUsername = actualUsername;
  }

  // FIDE name (e.g. "Carlsen, Magnus") for OTB game matching in opening stats.
  // OTB games use FIDE format; online usernames don't match, causing empty OTB graphs.
  if (identity.fideProfile?.name) {
    (reportData.player as unknown as Record<string, unknown>).fideName = identity.fideProfile.name;
  }

  // Ensure required arrays exist
  reportData.strengths = reportData.strengths || [];
  reportData.weaknesses = reportData.weaknesses || [];
  reportData.suggestedLines = reportData.suggestedLines || [];
  reportData.mostPlayedLines = reportData.mostPlayedLines || { white: [], black: [] };

  // Override opening stats with pipeline-computed values
  reportData.whiteOpenings = validateOpeningStats(
    whiteStats && whiteStats.length > 0 ? whiteStats : reportData.whiteOpenings || [],
  );
  reportData.blackDefenses = validateOpeningStats(
    blackStats && blackStats.length > 0 ? blackStats : reportData.blackDefenses || [],
  );

  // Override mostPlayedLines with pipeline-computed sequences
  reportData.mostPlayedLines = moveSequences || { white: [], black: [] };

  // Set defaults for empty string fields
  reportData.strategicSummary = reportData.strategicSummary || 'Analysis pending...';
  reportData.blackStrategicSummary = reportData.blackStrategicSummary || 'Detailed analysis of black repertoire pending...';
  reportData.tacticalProfile = reportData.tacticalProfile || 'Analysis pending...';
  reportData.endgameReliability = reportData.endgameReliability || 'Analysis pending...';
  reportData.timeControlInsights = reportData.timeControlInsights || 'Analysis pending...';
  reportData.specificVulnerability = reportData.specificVulnerability || 'Analysis pending...';
  reportData.tacticalRecommendation = reportData.tacticalRecommendation || 'Analysis pending...';
  reportData.preparationSummary = reportData.preparationSummary || 'Detailed analysis of white repertoire pending...';
  reportData.repertoireReliability = reportData.repertoireReliability || 0;

  // Set timestamp
  reportData.lastUpdated = new Date().toISOString();

  // Enrich games with pre-computed history (avoids client-side PGN parsing)
  for (const g of allGames) {
    if (g.pgn && g.pgn.trim().length >= 10) {
      (g as GameData & { history?: string[] }).history = parsePGNMoves(g.pgn);
    }
  }

  // Attach games for AnalysisBoard
  reportData.games = allGames;

  // Pre-compute openings by source (online vs OTB) to avoid client aggregation
  const targetNames = [
    actualUsername,
    identity.verifiedName,
    identity.fideProfile?.name,
    identity.chessComUsername,
    identity.lichessUsername,
  ].filter(Boolean) as string[];
  if (allGames.length > 0 && targetNames.length > 0) {
    (reportData as ScoutingReport & { openingsBySource?: unknown }).openingsBySource =
      aggregateOpeningsBySource(allGames, targetNames);
  }

  {
    enrichChessComGamesFromPgn(allGames);
    const onlineUsername = resolveTargetUsernameForOnline(allGames, identity, actualUsername);
    const tm = computeTimeManagementStats(allGames, onlineUsername || actualUsername || '');
    if (tm) {
      reportData.timeManagement = tm;
    }
  }

  return reportData;
}
