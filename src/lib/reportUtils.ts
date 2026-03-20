/**
 * Utilities for creating and merging scouting reports during progressive loading.
 */

import type { ScoutingReport, PlayerMetadata } from '../types';

const EMPTY_STRINGS = [
  'strategicSummary',
  'blackStrategicSummary',
  'tacticalProfile',
  'endgameReliability',
  'timeControlInsights',
  'specificVulnerability',
  'tacticalRecommendation',
  'preparationSummary',
] as const;

/**
 * Create an empty report shell with just the player name.
 * Used when user clicks Analyze - we show this immediately and fill in as data streams.
 */
export function createEmptyReport(playerName: string): ScoutingReport {
  const id = crypto.randomUUID?.() ?? `report-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const now = new Date().toISOString();

  const report: ScoutingReport = {
    id,
    player: {
      name: playerName,
      platforms: {},
    },
    whiteOpenings: [],
    blackDefenses: [],
    strategicSummary: '',
    blackStrategicSummary: '',
    tacticalProfile: '',
    endgameReliability: '',
    timeControlInsights: '',
    strengths: [],
    weaknesses: [],
    specificVulnerability: '',
    tacticalRecommendation: '',
    preparationSummary: '',
    suggestedLines: [],
    repertoireReliability: 0,
    mostPlayedLines: { white: [], black: [] },
    lastUpdated: now,
  };

  return report;
}

/**
 * Deep merge a partial report into the base report.
 * Used when identity, parsing, or complete data streams in.
 */
export function mergeReport(base: ScoutingReport, partial: Partial<ScoutingReport>): ScoutingReport {
  const merged = { ...base };

  if (partial.player) {
    merged.player = {
      ...base.player,
      ...partial.player,
      platforms: { ...base.player.platforms, ...(partial.player.platforms ?? {}) },
    };
  }

  if (partial.whiteOpenings && partial.whiteOpenings.length > 0) {
    merged.whiteOpenings = partial.whiteOpenings;
  }
  if (partial.blackDefenses && partial.blackDefenses.length > 0) {
    merged.blackDefenses = partial.blackDefenses;
  }
  if (partial.mostPlayedLines) {
    merged.mostPlayedLines = {
      white: partial.mostPlayedLines.white ?? base.mostPlayedLines.white,
      black: partial.mostPlayedLines.black ?? base.mostPlayedLines.black,
    };
  }
  if (partial.games && partial.games.length > 0) {
    merged.games = partial.games;
  }

  // Override any non-empty string fields
  for (const key of EMPTY_STRINGS) {
    const val = partial[key];
    if (typeof val === 'string' && val.length > 0) {
      (merged as Record<string, unknown>)[key] = val;
    }
  }

  if (partial.strengths && partial.strengths.length > 0) {
    merged.strengths = partial.strengths;
  }
  if (partial.weaknesses && partial.weaknesses.length > 0) {
    merged.weaknesses = partial.weaknesses;
  }
  if (partial.suggestedLines && partial.suggestedLines.length > 0) {
    merged.suggestedLines = partial.suggestedLines;
  }
  if (typeof partial.repertoireReliability === 'number') {
    merged.repertoireReliability = partial.repertoireReliability;
  }
  if (partial.lastUpdated) {
    merged.lastUpdated = partial.lastUpdated;
  }
  if (partial.engineDepth != null) {
    merged.engineDepth = partial.engineDepth;
  }
  if (partial.engineStats) {
    merged.engineStats = partial.engineStats;
  }
  if (partial.timeManagement) {
    merged.timeManagement = partial.timeManagement;
  }
  if (typeof partial.timeManagementAdvice === 'string' && partial.timeManagementAdvice.trim()) {
    merged.timeManagementAdvice = partial.timeManagementAdvice;
  }

  return merged;
}
