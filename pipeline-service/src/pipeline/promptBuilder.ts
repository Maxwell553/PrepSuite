/**
 * Prompt construction for Gemini report generation.
 * Ported from SearchScreen.tsx lines 26-50 (stratifiedSample) and 652-947 (prompt + schema).
 *
 * Optimised 2026-02: removed redundant PGN section, reduced sample sizes,
 * formatted stats as text, and condensed instructions (~136KB → ~35KB).
 */

import type {
  ResolvedIdentity,
  GameData,
  OpeningStat,
  MoveSequence,
  GameAnalysis,
} from '../lib/types.js';
import {
  parsePGNMoves,
  formatMoveSequence,
} from './moveSequenceExtractor.js';

// Prompt size limits: keep token count manageable while retaining statistical coverage
const MAX_GAME_METADATA_IN_PROMPT = 20;
const MAX_MOVE_LIST_IN_PROMPT = 40;

/** Stratified sample: pick games from each opening group for diversity. Preserves per-opening representation. */
export function stratifiedSample<T>(
  games: T[],
  getOpeningKey: (g: T) => string,
  maxSize: number,
): T[] {
  if (games.length <= maxSize) return games;
  const byOpening: Record<string, T[]> = {};
  games.forEach((g) => {
    const k = getOpeningKey(g);
    if (!byOpening[k]) byOpening[k] = [];
    byOpening[k].push(g);
  });
  const groups = Object.values(byOpening);
  const perGroup = Math.max(1, Math.floor(maxSize / groups.length));
  const sampled: T[] = [];
  const used = new Set<T>();
  groups.forEach((group) => {
    const pick = Math.min(perGroup, group.length);
    const shuffled = [...group].sort(() => Math.random() - 0.5);
    for (let i = 0; i < pick && i < shuffled.length; i++) {
      if (!used.has(shuffled[i])) {
        sampled.push(shuffled[i]);
        used.add(shuffled[i]);
      }
    }
  });
  const remaining = games.filter((g) => !used.has(g));
  for (let i = 0; sampled.length < maxSize && i < remaining.length; i++) {
    sampled.push(remaining[i]);
  }
  return sampled;
}

/** Format engine analysis into prompt text */
function formatEngineAnalysis(engineAnalysis: GameAnalysis[], allGames: GameData[]): string {
  if (engineAnalysis.length === 0) return '';

  // Group by opening
  const analysesByOpening: Record<string, { games: GameData[]; analyses: GameAnalysis[] }> = {};
  const gameMap = new Map(allGames.map((g) => [g.id, g]));

  for (const analysis of engineAnalysis) {
    const game = gameMap.get(analysis.gameId);
    const eco = game?.eco || 'Unknown';
    const openingKey = eco.split('-')[0] || eco;
    if (!analysesByOpening[openingKey]) {
      analysesByOpening[openingKey] = { games: [], analyses: [] };
    }
    if (game) analysesByOpening[openingKey].games.push(game);
    analysesByOpening[openingKey].analyses.push(analysis);
  }

  const openingInsights: string[] = [];
  Object.entries(analysesByOpening).forEach(([eco, data]) => {
    if (data.analyses.length >= 3) {
      const openingName = data.games[0]?.eco || eco;
      const totalMistakes = data.analyses.reduce((sum, a) => sum + a.criticalMistakes.length, 0);
      const avgEndgameAccuracy =
        data.analyses.reduce((sum, a) => sum + a.endgameAccuracy, 0) / data.analyses.length;
      const avgEvaluation =
        data.analyses.reduce((sum, a) => sum + a.averageEvaluation, 0) / data.analyses.length;
      const mistakesPerGame = (totalMistakes / data.analyses.length).toFixed(2);

      openingInsights.push(
        `${openingName} (${data.analyses.length}g): mistakes=${totalMistakes} (${mistakesPerGame}/g), endgame=${avgEndgameAccuracy.toFixed(1)}%, eval=${avgEvaluation > 0 ? '+' : ''}${(avgEvaluation / 100).toFixed(2)}`,
      );
    }
  });

  const totalMistakes = engineAnalysis.reduce((sum, a) => sum + a.criticalMistakes.length, 0);
  const avgEndgameAccuracy =
    engineAnalysis.reduce((sum, a) => sum + a.endgameAccuracy, 0) / engineAnalysis.length;
  const mistakesPerGame =
    engineAnalysis.length > 0 ? (totalMistakes / engineAnalysis.length).toFixed(2) : '0';

  return `
ENGINE ANALYSIS (${engineAnalysis.length} games):
Total mistakes (>150cp): ${totalMistakes} (${mistakesPerGame}/game), Endgame accuracy: ${avgEndgameAccuracy.toFixed(1)}%
${openingInsights.length > 0 ? 'By opening:\n' + openingInsights.join('\n') : ''}
  `.trim();
}

/** Format opening stats as compact text instead of raw JSON */
function formatOpeningStats(stats: OpeningStat[]): string {
  return (
    stats
      .map(
        (s) =>
          `${s.name} (${s.eco || '?'}): ${s.totalGames}g, W${s.wins}/D${s.draws}/L${s.losses}, WR=${((s.winRate ?? 0) * 100).toFixed(0)}%, freq=${((s.frequency ?? 0) * 100).toFixed(0)}%`,
      )
      .join('\n') || 'None'
  );
}

export interface BuildReportPromptOpts {
  identity: ResolvedIdentity;
  allGames: GameData[];
  whiteStats: OpeningStat[];
  blackStats: OpeningStat[];
  moveSequences: { white: MoveSequence[]; black: MoveSequence[] };
  engineAnalysis: GameAnalysis[];
  targetUsername: string;
}

export function buildReportPrompt(opts: BuildReportPromptOpts): string {
  const { identity, allGames, whiteStats, blackStats, moveSequences, engineAnalysis } = opts;

  const chessComUser = identity.chessComUsername;
  const lichessUser = identity.lichessUsername;
  const totalGamesCount = allGames.length;
  const gamesWithPGN = allGames.filter((g) => g.pgn && g.pgn.trim().length > 20);

  const getOpeningKey = (g: GameData) =>
    (g.openingName || g.eco || 'Unknown').split(/[-:]/)[0].trim();

  const metadataSample =
    allGames.length <= MAX_GAME_METADATA_IN_PROMPT
      ? allGames
      : stratifiedSample(allGames, getOpeningKey, MAX_GAME_METADATA_IN_PROMPT);
  const moveListSample =
    gamesWithPGN.length <= MAX_MOVE_LIST_IN_PROMPT
      ? gamesWithPGN
      : stratifiedSample(gamesWithPGN, getOpeningKey, MAX_MOVE_LIST_IN_PROMPT);

  const chessComGames = allGames.filter((g) => g.source === 'chess.com');
  const lichessGames = allGames.filter((g) => g.source === 'lichess');

  const dateRange =
    allGames.length > 0
      ? {
        earliest: allGames.reduce((e, g) =>
          new Date(g.playedAt) < new Date(e.playedAt) ? g : e,
        ).playedAt,
        latest: allGames.reduce((l, g) =>
          new Date(g.playedAt) > new Date(l.playedAt) ? g : l,
        ).playedAt,
      }
      : null;

  const engineText = formatEngineAnalysis(engineAnalysis, allGames);
  const dateRangeStr = dateRange
    ? `${new Date(dateRange.earliest).toLocaleDateString()} to ${new Date(dateRange.latest).toLocaleDateString()}`
    : 'N/A';

  return `
CHESS SCOUTING REPORT FOR: "${identity.verifiedName}"

RULES (apply to entire response):
- Always refer to the player as "${identity.verifiedName}" (never usernames "${chessComUser || 'N/A'}" / "${lichessUser || 'N/A'}").
- Cite exact game counts for every claim: "in X of Y games" or "X% of games".
- Only generalise ("often"/"typically") for patterns in 10+ games. For <10 say "appeared in X games".
- Do not reference specific game numbers ("Game 19"). Use aggregate language only.
- Do not use ** (bold markdown). Use * only for bullet points.
- whiteOpenings = what ${identity.verifiedName} PLAYS as White. blackDefenses = what they PLAY as Black. Never confuse.
- Use human opening names only, never ECO codes like "B20-B29" in text.
- Weight all games equally regardless of date.
- winRate/frequency are decimals 0.0-1.0. totalGames must = wins+draws+losses. Never return NaN/null.
- Response MUST be complete, valid JSON. Every { must close with }.

DATA SUMMARY (${totalGamesCount} games):
Chess.com: ${chessComGames.length} | Lichess: ${lichessGames.length}
Decisive: ${allGames.filter((g) => g.result === '1-0' || g.result === '0-1').length} | Draws: ${allGames.filter((g) => g.result === '1/2-1/2').length}
${dateRange ? `Date range: ${dateRangeStr}` : ''}

IDENTITY:
FIDE: ${identity.fideProfile?.rating ?? 'N/A'} (${identity.fideProfile?.title || 'No title'}) | USCF: ${identity.uscfProfile?.rating ?? 'N/A'}
Chess.com: ${chessComUser || 'N/A'} | Lichess: ${lichessUser || 'N/A'}

WHITE OPENINGS (all ${totalGamesCount} games, 10+ each):
${formatOpeningStats(whiteStats)}

BLACK DEFENSES (all ${totalGamesCount} games, 10+ each):
${formatOpeningStats(blackStats)}

MOST PLAYED LINES:
White: ${(moveSequences.white || []).map((l, i) => `${i + 1}. ${l.notation} (${l.games}g)`).join(' | ') || 'None'}
Black: ${(moveSequences.black || []).map((l, i) => `${i + 1}. ${l.notation} (${l.games}g)`).join(' | ') || 'None'}

GAME METADATA (${metadataSample.length} of ${totalGamesCount}, stratified):
${metadataSample
      .map(
        (g, idx) =>
          `${idx + 1}. ${g.source} ${g.white} v ${g.black} ${g.result} ${g.eco} ${new Date(g.playedAt).toLocaleDateString()} ${g.timeControl}`,
      )
      .join('\n')}

MOVE SEQUENCES (${moveListSample.length} of ${totalGamesCount}, up to 20 moves, stratified):
${(() => {
      const maxMovesPerGame = 20;
      return moveListSample
        .map((g, idx) => {
          const moves = g.pgn && g.pgn.trim().length > 20 ? parsePGNMoves(g.pgn) : [];
          const movesToShow =
            moves.length > maxMovesPerGame ? moves.slice(0, maxMovesPerGame) : moves;
          const line =
            movesToShow.length > 0
              ? formatMoveSequence(movesToShow) +
              (moves.length > maxMovesPerGame ? ' ...' : '')
              : '(no PGN)';
          return `${idx + 1}. ${line}`;
        })
        .join('\n');
    })()}

${engineText ? `${engineText}\n` : ''}
TASK: Generate a ScoutingReport JSON object.

Required fields:
- player: { name, fideId, country, titles[], currentRating, uscfRating, platforms: { chessCom, lichess } }
- whiteOpenings[]: { name, eco, frequency, winRate, wins, draws, losses, totalGames, trend } — copy directly from data above, include ALL openings
- blackDefenses[]: same structure — copy directly from data above, include ALL defenses
- strategicSummary: comprehensive White+Black analysis
- blackStrategicSummary: Black repertoire ONLY (do NOT mention White openings)
- preparationSummary: White repertoire ONLY (do NOT mention Black defenses)
- tacticalProfile, endgameReliability: detailed text
- strengths[3], weaknesses[3]: evidence from 10+ games each, using engine analysis where available
- specificVulnerability, tacticalRecommendation: actionable, citing game counts
- suggestedLines[3]: prefer lines with 10+ games and 5-6 moves. Format: "1.e4 c5 2.Nf3 d6... (Xg, Y% WR)"
- mostPlayedLines: { white[], black[] } each { moves[], frequency, games }
- repertoireReliability: number 0-1

Opening names: QGD=1.d4 d5 2.c4 e6 only. 1.d4 Nf6=Indian defenses. Caro-Kann=1.e4 c6. French=1.e4 e6. Sicilian=1.e4 c5.
      `;
}

/** Gemini JSON response schema for the ScoutingReport (Gemini REST API format) */
export const reportResponseSchema = {
  type: 'OBJECT',
  properties: {
    id: { type: 'STRING' },
    player: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' },
        fideId: { type: 'STRING' },
        country: { type: 'STRING' },
        titles: { type: 'ARRAY', items: { type: 'STRING' } },
        currentRating: { type: 'NUMBER' },
        uscfRating: { type: 'NUMBER' },
        platforms: {
          type: 'OBJECT',
          properties: {
            chessCom: { type: 'STRING' },
            lichess: { type: 'STRING' },
          },
        },
      },
    },
    whiteOpenings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          eco: { type: 'STRING' },
          frequency: { type: 'NUMBER' },
          winRate: { type: 'NUMBER' },
          wins: { type: 'NUMBER' },
          draws: { type: 'NUMBER' },
          losses: { type: 'NUMBER' },
          totalGames: { type: 'NUMBER' },
          trend: { type: 'STRING' },
        },
      },
    },
    blackDefenses: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          eco: { type: 'STRING' },
          frequency: { type: 'NUMBER' },
          winRate: { type: 'NUMBER' },
          wins: { type: 'NUMBER' },
          draws: { type: 'NUMBER' },
          losses: { type: 'NUMBER' },
          totalGames: { type: 'NUMBER' },
          trend: { type: 'STRING' },
        },
      },
    },
    strategicSummary: { type: 'STRING' },
    blackStrategicSummary: { type: 'STRING' },
    tacticalProfile: { type: 'STRING' },
    endgameReliability: { type: 'STRING' },
    strengths: { type: 'ARRAY', items: { type: 'STRING' } },
    weaknesses: { type: 'ARRAY', items: { type: 'STRING' } },
    specificVulnerability: { type: 'STRING' },
    tacticalRecommendation: { type: 'STRING' },
    preparationSummary: { type: 'STRING' },
    suggestedLines: { type: 'ARRAY', items: { type: 'STRING' } },
    repertoireReliability: { type: 'NUMBER' },
    mostPlayedLines: {
      type: 'OBJECT',
      properties: {
        white: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              moves: { type: 'ARRAY', items: { type: 'STRING' } },
              frequency: { type: 'NUMBER' },
              games: { type: 'NUMBER' },
            },
          },
        },
        black: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              moves: { type: 'ARRAY', items: { type: 'STRING' } },
              frequency: { type: 'NUMBER' },
              games: { type: 'NUMBER' },
            },
          },
        },
      },
    },
  },
  required: [
    'id',
    'player',
    'whiteOpenings',
    'blackDefenses',
    'strengths',
    'weaknesses',
    'specificVulnerability',
    'tacticalRecommendation',
    'preparationSummary',
    'suggestedLines',
  ],
};
