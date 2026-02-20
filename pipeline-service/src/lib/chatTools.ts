/**
 * Chat tools for the repertoire analysis bot.
 * Allows the model to reference games, fetch PGNs, run Stockfish, and analyze opening breakdowns.
 */

import type { GameData } from './types.js';
import { evaluateFen } from './stockfishEval.js';
import { parsePGNMoves } from '../pipeline/moveSequenceExtractor.js';
import { lookupOpeningByMoves, lookupOpeningByEco } from '../pipeline/openingClassifier.js';

/** Report context passed to tools (subset with games + player) */
export interface ReportWithGames {
  games?: GameData[];
  player?: { name?: string; platforms?: { chessCom?: string; lichess?: string } };
}

/** Resolve which username appears in the most games (matches pipeline logic). */
function resolveTargetUsername(games: GameData[], player: ReportWithGames['player']): string | null {
  if (!player) return null;
  const candidates = [
    player.platforms?.chessCom,
    player.platforms?.lichess,
    player.name,
  ].filter(Boolean) as string[];

  if (candidates.length === 0) return null;
  if (games.length === 0) return candidates[0];

  const counts = new Map<string, number>();
  for (const c of candidates) counts.set(c, 0);

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

/**
 * Get game metadata by 1-based index.
 * Returns white, black, result, playedAt, eco, openingName, etc.
 */
export function getGame(report: ReportWithGames, gameIndex: number): string {
  const games = report.games ?? [];
  const idx = gameIndex - 1; // 1-based for users
  if (idx < 0 || idx >= games.length) {
    return `Error: Game ${gameIndex} not found. There are ${games.length} games (1–${games.length}).`;
  }
  const g = games[idx];
  const parts = [
    `Game ${gameIndex}:`,
    `White: ${g.white}`,
    `Black: ${g.black}`,
    `Result: ${g.result}`,
    `Played: ${g.playedAt}`,
    `ECO: ${g.eco}`,
    `Time control: ${g.timeControl ?? 'unknown'}`,
  ];
  if (g.openingName) parts.push(`Opening: ${g.openingName}`);
  return parts.join('\n');
}

/**
 * Get full PGN for a game by 1-based index.
 */
export function getPgn(report: ReportWithGames, gameIndex: number): string {
  const games = report.games ?? [];
  const idx = gameIndex - 1;
  if (idx < 0 || idx >= games.length) {
    return `Error: Game ${gameIndex} not found. There are ${games.length} games (1–${games.length}).`;
  }
  const g = games[idx];
  if (!g.pgn || !g.pgn.trim()) {
    return `Error: PGN not available for game ${gameIndex}.`;
  }
  return g.pgn.trim();
}

/**
 * Get performance breakdown by opponent response to an opening.
 * E.g. for 1.c4, returns stats vs 1...e5, 1...c5, 1...Nf6, etc.
 * Uses the ECO opening book to match games (no hardcoded openings).
 */
export async function getOpeningBreakdown(
  report: ReportWithGames,
  moveSequence: string[],
  side: 'white' | 'black',
): Promise<string> {
  const games = report.games ?? [];
  const player = report.player;
  if (!player) {
    return 'Error: Player context not available.';
  }

  const targetUsername = resolveTargetUsername(games, player);
  if (!targetUsername) {
    return 'Error: Player context not available for matching games (need platforms.chessCom, platforms.lichess, or name).';
  }

  const targetLower = targetUsername.toLowerCase().trim();
  const isPlayer = (name: string) => {
    const n = name.toLowerCase().trim();
    return n === targetLower || n.includes(targetLower) || targetLower.includes(n);
  };

  const relevant = games.filter((g) => {
    if (!g.pgn || g.pgn.trim().length < 10) return false;
    const playerIsWhite = isPlayer(g.white);
    const playerIsBlack = isPlayer(g.black);
    if (side === 'white' && !playerIsWhite) return false;
    if (side === 'black' && !playerIsBlack) return false;
    return true;
  });

  const seq = moveSequence.map((m) => m.toLowerCase().trim()).filter(Boolean);
  if (seq.length === 0) {
    return 'Error: moveSequence must contain at least one move (e.g. ["c4"] for 1.c4).';
  }

  /** Look up opening from ECO book for fallback matching */
  const bookOpening = await lookupOpeningByMoves(seq);
  const bookName = bookOpening?.name?.toLowerCase() ?? '';
  const bookEcoPrefix = bookOpening?.eco?.slice(0, 2) ?? '';

  /** Normalize move for comparison (e.g. c2-c4, c2c4 -> c4) */
  const norm = (m: string) => {
    const s = m.toLowerCase().trim();
    if (/^[a-h][1-8]$/.test(s)) return s;
    const match = s.match(/([a-h][1-8])$/);
    return match ? match[1] : s;
  };

  type Variation = { opponentMove: string; wins: number; draws: number; losses: number };
  const byVariation = new Map<string, Variation>();

  for (const g of relevant) {
    const moves = parsePGNMoves(g.pgn);
    const matchesByMoves =
      moves.length >= seq.length &&
      seq.every((s, i) => norm(moves[i] ?? '') === norm(s));

    const matchesByBook =
      bookOpening &&
      moves.length >= seq.length + 1 &&
      ((g.openingName && bookName && g.openingName.toLowerCase().includes(bookName)) ||
        (bookEcoPrefix && g.eco && g.eco.trim().toUpperCase().startsWith(bookEcoPrefix)));

    if (!matchesByMoves && !matchesByBook) continue;

    const opponentMoveIdx = seq.length;
    const opponentMove = moves[opponentMoveIdx] ?? '(game ended)';
    const existing = byVariation.get(opponentMove) ?? { opponentMove, wins: 0, draws: 0, losses: 0 };

    const playerIsWhite = isPlayer(g.white);
    const result = g.result;
    if (result === '1/2-1/2') {
      existing.draws++;
    } else if ((result === '1-0' && playerIsWhite) || (result === '0-1' && !playerIsWhite)) {
      existing.wins++;
    } else {
      existing.losses++;
    }
    byVariation.set(opponentMove, existing);
  }

  const total = Array.from(byVariation.values()).reduce(
    (s, v) => s + v.wins + v.draws + v.losses,
    0,
  );
  if (total === 0) {
    const seqNotation = seq.join(' ');
    return `No games found where ${player.name ?? 'the player'} played ${side} and the game started with ${seqNotation}. Try a different move sequence or check that games are available.`;
  }

  const lines: string[] = [
    `Opening breakdown for ${seq.join(' ')} (${player.name ?? 'player'} as ${side}):`,
    `${total} games total.`,
    '',
  ];

  const sorted = Array.from(byVariation.entries()).sort(
    (a, b) => (b[1].wins + b[1].draws + b[1].losses) - (a[1].wins + a[1].draws + a[1].losses),
  );

  for (const [oppMove, v] of sorted) {
    const n = v.wins + v.draws + v.losses;
    const winRate = n > 0 ? ((v.wins + v.draws * 0.5) / n) * 100 : 0;
    const oppNotation = side === 'white' ? `1...${oppMove}` : `1.${oppMove}`;
    lines.push(
      `* ${oppNotation}: ${n} games, ${v.wins}W ${v.draws}D ${v.losses}L (${winRate.toFixed(1)}% score)`,
    );
  }

  return lines.join('\n');
}

/**
 * Look up an opening in the ECO book by move sequence or ECO code.
 * Used when the user asks "what opening is 1.c4?" or "what is the Sicilian?"
 */
export async function lookupOpening(
  moveSequence?: string[],
  ecoCode?: string,
): Promise<string> {
  if (moveSequence && moveSequence.length > 0) {
    const result = await lookupOpeningByMoves(
      moveSequence.map((m) => String(m).trim()).filter(Boolean),
    );
    if (!result) {
      return `No opening found in the ECO book for move sequence: ${moveSequence.join(' ')}.`;
    }
    const lines = [
      `Opening: ${result.name}`,
      `ECO: ${result.eco}`,
      `Moves: ${result.moves || moveSequence.join(' ')}`,
    ];
    return lines.join('\n');
  }
  if (ecoCode && ecoCode.trim()) {
    const result = await lookupOpeningByEco(ecoCode.trim());
    if (!result) {
      return `No opening found in the ECO book for ECO code: ${ecoCode}.`;
    }
    const lines = [
      `Opening: ${result.name}`,
      `ECO: ${result.eco}`,
      result.moves ? `Moves: ${result.moves}` : '',
    ].filter(Boolean);
    return lines.join('\n');
  }
  return 'Error: Provide either moveSequence (e.g. ["c4","e5"]) or ecoCode (e.g. "B20").';
}

/**
 * Run Stockfish evaluation on a FEN position.
 * Returns evaluation (centipawns), best move, and principal variation.
 */
export async function runStockfish(fen: string, depth?: number): Promise<string> {
  try {
    const result = await evaluateFen(fen, depth ?? 14);
    const cp = result.evaluation;
    const evalStr = Math.abs(cp) >= 10000
      ? (cp > 0 ? 'White is winning (mate)' : 'Black is winning (mate)')
      : `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)} (centipawns, positive = white better)`;
    const lines = [
      `Evaluation: ${evalStr}`,
      `Depth: ${result.depth}`,
    ];
    if (result.bestMove) lines.push(`Best move: ${result.bestMove}`);
    if (result.pv && result.pv.length > 1) {
      lines.push(`Principal variation: ${result.pv.join(' ')}`);
    }
    return lines.join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error running Stockfish: ${msg}`;
  }
}
