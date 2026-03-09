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
const MAX_GAME_METADATA_IN_PROMPT = 40;
const MAX_MOVE_LIST_IN_PROMPT = 20;
const MAX_OPENINGS_PER_COLOR = 20;

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

/** Format engine analysis into prompt text. Excludes mistakes-per-game and endgame-accuracy (poor skill metrics). */
function formatEngineAnalysis(engineAnalysis: GameAnalysis[], allGames: GameData[]): string {
  return formatEngineAnalysisForSide(engineAnalysis, allGames, null, null);
}

/** Format engine analysis filtered by games where target played the given side. Pass null for side to include all. */
function formatEngineAnalysisForSide(
  engineAnalysis: GameAnalysis[],
  allGames: GameData[],
  targetUsername: string | null,
  side: 'white' | 'black' | null,
): string {
  if (engineAnalysis.length === 0) return '';

  const gameMap = new Map(allGames.map((g) => [g.id, g]));
  const targetLower = targetUsername?.toLowerCase().trim() ?? '';

  const filteredAnalyses =
    side && targetLower
      ? engineAnalysis.filter((a) => {
          const game = gameMap.get(a.gameId);
          if (!game) return false;
          const isTargetWhite = game.white.toLowerCase().trim() === targetLower;
          return side === 'white' ? isTargetWhite : !isTargetWhite;
        })
      : engineAnalysis;

  const analysesByOpening: Record<string, { games: GameData[]; analyses: GameAnalysis[] }> = {};
  for (const analysis of filteredAnalyses) {
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
      const openingName = data.games[0]?.openingName || data.games[0]?.eco || eco;
      const avgEvaluation =
        data.analyses.reduce((sum, a) => sum + a.averageEvaluation, 0) / data.analyses.length;
      openingInsights.push(
        `${openingName} (${data.analyses.length}g): avg eval=${avgEvaluation > 0 ? '+' : ''}${(avgEvaluation / 100).toFixed(2)}`,
      );
    }
  });

  return `
ENGINE ANALYSIS (Stockfish): When available, CITE average evaluations (e.g. "avg eval +0.75 for White"). Do NOT cite sample count. Do NOT use "mistakes per game" or "endgame accuracy".
${openingInsights.length > 0 ? 'By opening:\n' + openingInsights.join('\n') : 'Use game results and opening stats instead.'}
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

/** Shared context for all parallel report prompts (avoids duplication) */
function buildSharedContext(opts: BuildReportPromptOpts): string {
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
  const otbGames = allGames.filter((g) => g.source === 'otb');
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
  const whiteStatsCapped = whiteStats.slice(0, MAX_OPENINGS_PER_COLOR);
  const blackStatsCapped = blackStats.slice(0, MAX_OPENINGS_PER_COLOR);

  return `
CHESS SCOUTING REPORT FOR: "${identity.verifiedName}"

RULES:
- Always refer to the player as "${identity.verifiedName}" (never usernames "${chessComUser || 'N/A'}" / "${lichessUser || 'N/A'}").
- Cite exact game counts for every claim. Only generalise for 10+ games.
- Do not use ** (bold). Use human opening names (Sicilian Defense, not B20).
- OPENING/DEFENSE wording (CRITICAL — apply to strategicSummary, strengths, weaknesses, tacticalRecommendation, specificVulnerability): DEFENSE = Black-initiated (Sicilian, French, Caro-Kann, Nimzo-Indian, Dutch, Queen's Indian, Modern, Pterodactyl, QGD). When ${identity.verifiedName} is Black → "plays the X Defense as Black". When White → "faces the X Defense as White". OPENING/ATTACK = White-initiated (Queen's Pawn Game, Italian Game, Ruy Lopez, English Opening, King's Indian Attack, Nimzowitsch-Larsen Attack). When ${identity.verifiedName} is White → "plays the X as White". When Black → "faces the X as Black". WRONG: "faces the Queen's Pawn Game as White" (White plays it). WRONG: "faces the Sicilian Defense as Black" (Black plays it). WRONG: "faces the Modern Defense as Black" (Black plays it).
- Response MUST be valid JSON.

DATA (${totalGamesCount} games):
Chess.com: ${chessComGames.length} | Lichess: ${lichessGames.length} | OTB: ${otbGames.length}
${otbGames.length === 0 ? 'WARNING: No OTB games. Do NOT make OTB claims.' : ''}
Decisive: ${allGames.filter((g) => g.result === '1-0' || g.result === '0-1').length} | Draws: ${allGames.filter((g) => g.result === '1/2-1/2').length}
${dateRange ? `Date range: ${dateRangeStr}` : ''}

WHITE OPENINGS:
${formatOpeningStats(whiteStatsCapped)}

BLACK DEFENSES:
${formatOpeningStats(blackStatsCapped)}

MOST PLAYED LINES:
White: ${(moveSequences.white || []).map((l, i) => `${i + 1}. ${l.notation} (${l.games}g)`).join(' | ') || 'None'}
Black: ${(moveSequences.black || []).map((l, i) => `${i + 1}. ${l.notation} (${l.games}g)`).join(' | ') || 'None'}

GAME METADATA (${metadataSample.length} of ${totalGamesCount}):
${metadataSample.map((g, idx) => `${idx + 1}. ${g.source} ${g.white} v ${g.black} ${g.result} ${g.eco}`).join('\n')}

MOVE SEQUENCES (${moveListSample.length} of ${totalGamesCount}):
${moveListSample
  .map((g, idx) => {
    const moves = g.pgn && g.pgn.trim().length > 20 ? parsePGNMoves(g.pgn) : [];
    const movesToShow = moves.length > 15 ? moves.slice(0, 15) : moves;
    const line = movesToShow.length > 0 ? formatMoveSequence(movesToShow) + (moves.length > 15 ? ' ...' : '') : '(no PGN)';
    return `${idx + 1}. ${line}`;
  })
  .join('\n')}

${engineText ? `${engineText}\n` : ''}`;
}

/** Context for WHITE repertoire ONLY — games, stats, and engine analysis where target played White */
function buildWhiteContext(opts: BuildReportPromptOpts): string {
  const { identity, allGames, whiteStats, moveSequences, engineAnalysis, targetUsername } = opts;
  const chessComUser = identity.chessComUsername;
  const lichessUser = identity.lichessUsername;
  const targetLower = targetUsername.toLowerCase().trim();
  const whiteGames = allGames.filter((g) => g.white.toLowerCase().trim() === targetLower);
  const gamesWithPGN = whiteGames.filter((g) => g.pgn && g.pgn.trim().length > 20);
  const getOpeningKey = (g: GameData) =>
    (g.openingName || g.eco || 'Unknown').split(/[-:]/)[0].trim();
  const metadataSample =
    whiteGames.length <= MAX_GAME_METADATA_IN_PROMPT
      ? whiteGames
      : stratifiedSample(whiteGames, getOpeningKey, MAX_GAME_METADATA_IN_PROMPT);
  const moveListSample =
    gamesWithPGN.length <= MAX_MOVE_LIST_IN_PROMPT
      ? gamesWithPGN
      : stratifiedSample(gamesWithPGN, getOpeningKey, MAX_MOVE_LIST_IN_PROMPT);
  const engineText = formatEngineAnalysisForSide(engineAnalysis, allGames, targetUsername, 'white');
  const whiteStatsCapped = whiteStats.slice(0, MAX_OPENINGS_PER_COLOR);

  return `
CHESS SCOUTING REPORT FOR: "${identity.verifiedName}" — WHITE REPERTOIRE ONLY

CRITICAL: Use ONLY games where ${identity.verifiedName} played as White. Do NOT use any Black games or blackDefenses data.

RULES:
- Always refer to the player as "${identity.verifiedName}" (never usernames "${chessComUser || 'N/A'}" / "${lichessUser || 'N/A'}").
- Cite exact game counts. Use human opening names (Sicilian Defense, not B20).
- Response MUST be valid JSON.

WHITE OPENINGS (games where ${identity.verifiedName} played White):
${formatOpeningStats(whiteStatsCapped)}

MOST PLAYED LINES (White only):
${(moveSequences.white || []).map((l, i) => `${i + 1}. ${l.notation} (${l.games}g)`).join(' | ') || 'None'}

GAME METADATA (${metadataSample.length} White games):
${metadataSample.map((g, idx) => `${idx + 1}. ${g.source} ${g.white} v ${g.black} ${g.result} ${g.eco}`).join('\n')}

MOVE SEQUENCES (${moveListSample.length} White games):
${moveListSample
  .map((g, idx) => {
    const moves = g.pgn && g.pgn.trim().length > 20 ? parsePGNMoves(g.pgn) : [];
    const movesToShow = moves.length > 15 ? moves.slice(0, 15) : moves;
    const line = movesToShow.length > 0 ? formatMoveSequence(movesToShow) + (moves.length > 15 ? ' ...' : '') : '(no PGN)';
    return `${idx + 1}. ${line}`;
  })
  .join('\n')}

${engineText ? `${engineText}\n` : ''}`;
}

/** Context for BLACK repertoire ONLY — games, stats, and engine analysis where target played Black */
function buildBlackContext(opts: BuildReportPromptOpts): string {
  const { identity, allGames, blackStats, moveSequences, engineAnalysis, targetUsername } = opts;
  const chessComUser = identity.chessComUsername;
  const lichessUser = identity.lichessUsername;
  const targetLower = targetUsername.toLowerCase().trim();
  const blackGames = allGames.filter((g) => g.black.toLowerCase().trim() === targetLower);
  const gamesWithPGN = blackGames.filter((g) => g.pgn && g.pgn.trim().length > 20);
  const getOpeningKey = (g: GameData) =>
    (g.openingName || g.eco || 'Unknown').split(/[-:]/)[0].trim();
  const metadataSample =
    blackGames.length <= MAX_GAME_METADATA_IN_PROMPT
      ? blackGames
      : stratifiedSample(blackGames, getOpeningKey, MAX_GAME_METADATA_IN_PROMPT);
  const moveListSample =
    gamesWithPGN.length <= MAX_MOVE_LIST_IN_PROMPT
      ? gamesWithPGN
      : stratifiedSample(gamesWithPGN, getOpeningKey, MAX_MOVE_LIST_IN_PROMPT);
  const engineText = formatEngineAnalysisForSide(engineAnalysis, allGames, targetUsername, 'black');
  const blackStatsCapped = blackStats.slice(0, MAX_OPENINGS_PER_COLOR);

  return `
CHESS SCOUTING REPORT FOR: "${identity.verifiedName}" — BLACK REPERTOIRE ONLY

CRITICAL: Use ONLY games where ${identity.verifiedName} played as Black. Do NOT use any White games or whiteOpenings data.

RULES:
- Always refer to the player as "${identity.verifiedName}" (never usernames "${chessComUser || 'N/A'}" / "${lichessUser || 'N/A'}").
- Cite exact game counts. Use human opening names (Sicilian Defense, not B20).
- Response MUST be valid JSON.

BLACK DEFENSES (games where ${identity.verifiedName} played Black):
${formatOpeningStats(blackStatsCapped)}

MOST PLAYED LINES (Black only):
${(moveSequences.black || []).map((l, i) => `${i + 1}. ${l.notation} (${l.games}g)`).join(' | ') || 'None'}

GAME METADATA (${metadataSample.length} Black games):
${metadataSample.map((g, idx) => `${idx + 1}. ${g.source} ${g.white} v ${g.black} ${g.result} ${g.eco}`).join('\n')}

MOVE SEQUENCES (${moveListSample.length} Black games):
${moveListSample
  .map((g, idx) => {
    const moves = g.pgn && g.pgn.trim().length > 20 ? parsePGNMoves(g.pgn) : [];
    const movesToShow = moves.length > 15 ? moves.slice(0, 15) : moves;
    const line = movesToShow.length > 0 ? formatMoveSequence(movesToShow) + (moves.length > 15 ? ' ...' : '') : '(no PGN)';
    return `${idx + 1}. ${line}`;
  })
  .join('\n')}

${engineText ? `${engineText}\n` : ''}`;
}

/** Partial prompts for parallel generation. Summary, strengths, weaknesses run in parallel. Tactical fields are not generated. */
export function buildReportPromptsParallel(opts: BuildReportPromptOpts): {
  strategicSummary: string;
  strengths: string;
  weaknesses: string;
} {
  const shared = buildSharedContext(opts);

  const openingWording = `
OPENING/DEFENSE WORDING (MANDATORY for strategicSummary, strengths, weaknesses, tacticalRecommendation, specificVulnerability — apply to ALL generated text):
- DEFENSE (Sicilian, French, Caro-Kann, Nimzo-Indian, Dutch, Queen's Indian, Modern, Pterodactyl, QGD, Neo-King's Indian) = Black chooses it. When ${opts.identity.verifiedName} is Black → "plays the X Defense as Black". When White → "faces the X Defense as White".
- OPENING/ATTACK (Queen's Pawn Game, Italian Game, Ruy Lopez, English Opening, King's Indian Attack, Nimzowitsch-Larsen Attack) = White chooses it. When ${opts.identity.verifiedName} is White → "plays the X as White". When Black → "faces the X as Black".
- WRONG: "faces the Queen's Pawn Game as White" (White plays it). WRONG: "faces the Sicilian Defense as Black" (Black plays it). WRONG: "faces the Modern Defense as Black" (Black plays it). WRONG: "plays the English Opening as Black" (Black faces it).
`;

  return {
    strategicSummary: `${shared}
${openingWording}
TASK: Generate JSON with strategicSummary ONLY — a comprehensive White+Black analysis paragraph.

LENGTH: Keep strategicSummary CONCISE — about half the length of a typical detailed analysis. Lead with key stats only (first move %, top 3–4 openings with win rates). Omit secondary lines unless critical. One focused paragraph for White, one for Black.

CONTENT QUALITY: For every opening mentioned, cite exact game counts and win rates. Include engine evals when available. Use "plays" when player initiated; "faces" when opponent initiated.`,

    strengths: `${shared}
${openingWording}
TASK: Generate JSON with strengths[3] — exactly 3 bullet points of core strengths.

CONTENT QUALITY: Each item must include opening name, color, game count, win rate. Use "plays" when player initiated; "faces" when opponent initiated. Example: "${opts.identity.verifiedName} faces the Caro-Kann Defense as White with exceptional success, achieving an 81% win rate across 16 games."`,

    weaknesses: `${shared}
${openingWording}
TASK: Generate JSON with weaknesses[3] — exactly 3 bullet points of strategic weaknesses.

CONTENT QUALITY: Each item must include opening name, color, game count, win rate. Use "plays" when player initiated; "faces" when opponent initiated. Example: "${opts.identity.verifiedName} plays the King's Indian Defense as Black with poor results, managing only a 31% win rate across 16 games."`,
  };
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
  const otbGames = allGames.filter((g) => g.source === 'otb');

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

  // Cap openings to top 20 by frequency (stats already sorted by frequency)
  const whiteStatsCapped = whiteStats.slice(0, MAX_OPENINGS_PER_COLOR);
  const blackStatsCapped = blackStats.slice(0, MAX_OPENINGS_PER_COLOR);

  return `
CHESS SCOUTING REPORT FOR: "${identity.verifiedName}"

RULES (apply to entire response):
- Always refer to the player as "${identity.verifiedName}" (never usernames "${chessComUser || 'N/A'}" / "${lichessUser || 'N/A'}").
- Cite exact game counts for every claim: "in X of Y games" or "X% of games".
- STRATEGIC SUMMARY FORMAT: Structure the strategicSummary as: "(Player Name) most often plays 1.(move) X% of the time (e.g. 1.e4 45%) and most often faces/plays openings X, Y, and Z, where he/she has a (win rate)% against X, (win rate)% against Y, and (win rate)% against Z. Same structure for Black." Use actual data from whiteOpenings/blackDefenses and MOST PLAYED LINES. Lead with the most frequent first move and its percentage, then the top 3–4 openings faced/played with their win rates.
- NEVER mention the engine analysis sample size (e.g. "80 analyzed games"). When citing blunders, mistakes, or tactical accuracy from engine analysis, use phrases like "in engine analysis" or "across analyzed positions" — never state how many games were engine-analyzed. The user requested ${totalGamesCount} games; do not imply fewer were analyzed.
- Only generalise ("often"/"typically") for patterns in 10+ games. For <10 say "appeared in X games".
- Do not reference specific game numbers ("Game 19"). Use aggregate language only.
- Do not use ** (bold markdown). Use * only for bullet points.
- CRITICAL — Opening/Defense wording (applies to strategicSummary, strengths, weaknesses, tacticalRecommendation, specificVulnerability). DEFENSE (Sicilian, French, Caro-Kann, Nimzo-Indian, Dutch, Queen's Indian, Modern, QGD, Neo-King's Indian) = Black-initiated. When ${identity.verifiedName} is Black → "plays the X Defense as Black". When White → "faces the X Defense as White". OPENING/ATTACK (Queen's Pawn Game, Italian Game, Ruy Lopez, English Opening, King's Indian Attack) = White-initiated. When ${identity.verifiedName} is White → "plays the X as White". When Black → "faces the X as Black". WRONG: "faces the Queen's Pawn Game as White" (White plays it). WRONG: "faces the Sicilian Defense as Black" (Black plays it). WRONG: "plays the English Opening as Black" (Black faces it).
- Use human opening names only (e.g. "Sicilian Defense", "Queen's Gambit"). Never use ECO codes (A05, B20, etc.) in narrative text — readers expect names like "King's Pawn Game", not "B00".
- Weight all games equally regardless of date.
- winRate/frequency are decimals 0.0-1.0. totalGames must = wins+draws+losses. Never return NaN/null.
- Response MUST be complete, valid JSON. Every { must close with }.

DATA SUMMARY (${totalGamesCount} games):
Chess.com: ${chessComGames.length} | Lichess: ${lichessGames.length} | OTB: ${otbGames.length}
${otbGames.length === 0 ? 'WARNING: No OTB games. Do NOT make claims about OTB repertoire, opening variety, or preparation against this player. State that OTB data is unavailable. Avoid generic phrases like "opponents cannot rely on specific opening preparation" or "frequently varies opening choices" when OTB=0.' : ''}
Decisive: ${allGames.filter((g) => g.result === '1-0' || g.result === '0-1').length} | Draws: ${allGames.filter((g) => g.result === '1/2-1/2').length}
${dateRange ? `Date range: ${dateRangeStr}` : ''}

IDENTITY:
FIDE: ${identity.fideProfile?.rating ?? 'N/A'} (${identity.fideProfile?.title || 'No title'}) | USCF: ${identity.uscfProfile?.rating ?? 'N/A'}
Chess.com: ${chessComUser || 'N/A'} | Lichess: ${lichessUser || 'N/A'}

WHITE OPENINGS (all ${totalGamesCount} games, top ${MAX_OPENINGS_PER_COLOR} by frequency):
${formatOpeningStats(whiteStatsCapped)}

BLACK DEFENSES (all ${totalGamesCount} games, top ${MAX_OPENINGS_PER_COLOR} by frequency):
${formatOpeningStats(blackStatsCapped)}

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

MOVE SEQUENCES (${moveListSample.length} of ${totalGamesCount}, up to 15 moves, stratified):
${(() => {
      const maxMovesPerGame = 15;
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
- whiteOpenings[]: { name, eco, frequency, winRate, wins, draws, losses, totalGames, trend } — copy directly from data above, include all openings listed
- blackDefenses[]: same structure — copy directly from data above, include all defenses listed
- strategicSummary: comprehensive White+Black analysis
- blackStrategicSummary: Black repertoire ONLY (do NOT mention White openings)
- preparationSummary: White repertoire ONLY (do NOT mention Black defenses)
- tacticalProfile, endgameReliability: focus on win rates, opening patterns, and concrete themes from game results. Do NOT cite "mistakes per game" or "endgame accuracy" — these metrics are unreliable for skill assessment.
- strengths[3], weaknesses[3]: evidence from 10+ games each. ALWAYS cite specific opening names, win rates, and game counts (e.g. "77% win rate in 175 games against the Caro-Kann Defense"). Use engine evaluation when available (e.g. "average evaluation of +6.61 across analyzed positions").
- specificVulnerability, tacticalRecommendation: CRITICAL — recommend SPECIFIC LINES AND OPENINGS with win rates and game counts. Example: "As Black, (Player) performs poorly against the Mieses Opening, indicated by an average evaluation of -0.64 across analyzed positions." Or: "Target the King's Indian Defense — (Player) has only 31% win rate in 13 games as Black." Never give generic advice; always name exact openings/variations and cite win rate or engine eval.
- suggestedLines[3]: prefer lines with 10+ games and 5-6 moves. Format: "1.e4 c5 2.Nf3 d6... (Xg, Y% WR)"
- mostPlayedLines: { white[], black[] } each { moves[], frequency, games }
- repertoireReliability: number 0-1

Opening names: Use human names. QGD=Queen's Gambit Declined. Sicilian=1.e4 c5. Caro-Kann=1.e4 c6. French=1.e4 e6. Indian defenses=1.d4 Nf6. Never write "A05", "B20" etc. in prose — use "King's Pawn Game", "Sicilian Defense", etc.

TACTICAL RECOMMENDATION (PRIMARY EMPHASIS): This is the most actionable field. It MUST name specific openings and variations (e.g. "Mieses Opening", "Trompowsky Attack: Raptor Variation") and cite quantitative performance: win rate with game count (e.g. "18% win rate in 11 games") or engine evaluation (e.g. "average evaluation of -0.64 for Black across analyzed positions"). Tell the user exactly which lines to prepare against. No generic advice.
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

/** Partial schemas for parallel generation */
export const reportPartialSchemas = {
  strategicSummary: {
    type: 'OBJECT',
    properties: { strategicSummary: { type: 'STRING' } },
    required: ['strategicSummary'],
  },
  strengths: {
    type: 'OBJECT',
    properties: { strengths: { type: 'ARRAY', items: { type: 'STRING' } } },
    required: ['strengths'],
  },
  weaknesses: {
    type: 'OBJECT',
    properties: { weaknesses: { type: 'ARRAY', items: { type: 'STRING' } } },
    required: ['weaknesses'],
  },
  white: {
    type: 'OBJECT',
    properties: { preparationSummary: { type: 'STRING' } },
    required: ['preparationSummary'],
  },
  black: {
    type: 'OBJECT',
    properties: { blackStrategicSummary: { type: 'STRING' } },
    required: ['blackStrategicSummary'],
  },
} as const;
