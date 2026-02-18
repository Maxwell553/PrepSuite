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
  reportData.player.uscfRating = identity.uscfProfile?.rating;
  reportData.player.fideId = identity.fideProfile ? String(identity.fideProfile.rating ? '' : '') : '';
  // Use the FIDE profile's name to extract fideId — we don't have the raw ID here,
  // so keep whatever Gemini returned or leave it
  reportData.player.country =
    identity.fideProfile?.federation ||
    identity.uscfProfile?.name?.split(',')?.pop()?.trim() ||
    reportData.player.country ||
    '';

  // Username that appears in games (for AnalysisBoard win/loss matching)
  if (actualUsername) {
    (reportData.player as Record<string, unknown>).actualUsername = actualUsername;
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
  reportData.blackStrategicSummary = reportData.blackStrategicSummary || 'Analysis pending...';
  reportData.tacticalProfile = reportData.tacticalProfile || 'Analysis pending...';
  reportData.endgameReliability = reportData.endgameReliability || 'Analysis pending...';
  reportData.timeControlInsights = reportData.timeControlInsights || 'Analysis pending...';
  reportData.specificVulnerability = reportData.specificVulnerability || 'Analysis pending...';
  reportData.tacticalRecommendation = reportData.tacticalRecommendation || 'Analysis pending...';
  reportData.preparationSummary = reportData.preparationSummary || 'Analysis pending...';
  reportData.repertoireReliability = reportData.repertoireReliability || 0;

  // Set timestamp
  reportData.lastUpdated = new Date().toISOString();

  // Attach games for AnalysisBoard
  reportData.games = allGames;

  return reportData;
}
