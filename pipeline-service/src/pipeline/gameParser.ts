import type { GameData } from '../lib/types.js';
import { logger } from '../lib/logger.js';

// ── Chess.com types ────────────────────────────────────────────────

interface ChessComGame {
  uuid?: string;
  white: { username: string; result: string };
  black: { username: string; result: string };
  eco?: string;
  pgn: string;
  end_time: number;
  time_control: string;
}

// ── Lichess types ──────────────────────────────────────────────────

interface LichessGame {
  id: string;
  players?: {
    white?: { user?: { name?: string }; userId?: string };
    black?: { user?: { name?: string }; userId?: string };
  };
  winner?: 'white' | 'black';
  pgn?: string;
  moves?: string | string[];
  createdAt: number;
  speed: string;
  opening?: { eco?: string; name?: string };
  eco?: string;
}

// ── Chess.com result resolution ────────────────────────────────────

function resolveResult(game: ChessComGame): string {
  const whiteResult = game.white.result?.toLowerCase();
  const blackResult = game.black.result?.toLowerCase();

  // White wins
  if (
    whiteResult === 'win' ||
    blackResult === 'checkmated' ||
    blackResult === 'resign' ||
    blackResult === 'timeout' ||
    blackResult === 'abandoned'
  ) {
    return '1-0';
  }

  // Black wins
  if (
    blackResult === 'win' ||
    whiteResult === 'checkmated' ||
    whiteResult === 'resign' ||
    whiteResult === 'timeout' ||
    whiteResult === 'abandoned'
  ) {
    return '0-1';
  }

  // Draw conditions
  if (
    whiteResult === 'agreed' ||
    whiteResult === 'stalemate' ||
    whiteResult === 'insufficient' ||
    whiteResult === 'repetition' ||
    whiteResult === '50move' ||
    blackResult === 'agreed' ||
    blackResult === 'stalemate' ||
    blackResult === 'insufficient' ||
    blackResult === 'repetition' ||
    blackResult === '50move'
  ) {
    return '1/2-1/2';
  }

  return '1/2-1/2';
}

// ── Lichess result resolution ──────────────────────────────────────

function resolveResultLichess(game: LichessGame): string {
  const winner = game.winner;
  if (!winner) return '1/2-1/2';
  if (winner === 'white') return '1-0';
  if (winner === 'black') return '0-1';
  return '1/2-1/2';
}

// ── ECO code extraction ────────────────────────────────────────────

function extractEco(raw: unknown): string {
  if (!raw) return 'Unknown';

  let eco: string;
  if (typeof raw === 'string') {
    eco = raw.split('/').pop() || raw;
  } else if (Array.isArray(raw) && raw.length > 0) {
    eco = String(raw[0]);
  } else {
    return 'Unknown';
  }

  eco = eco.trim().toUpperCase();
  if (eco.includes('-')) eco = eco.split('-')[0].trim();
  if (!eco.match(/^[A-E]\d{2,3}$/)) return 'Unknown';
  return eco;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Parse Chess.com raw JSON games into normalized GameData[].
 */
export function parseChessComGames(games: unknown[], _targetUsername: string): GameData[] {
  const typed = games as ChessComGame[];
  return typed.map((g) => ({
    id: g.uuid || Math.random().toString(36),
    source: 'chess.com' as const,
    white: g.white.username,
    black: g.black.username,
    result: resolveResult(g),
    eco: extractEco(g.eco),
    pgn: g.pgn || '',
    playedAt: new Date(g.end_time * 1000).toISOString(),
    timeControl: g.time_control || '',
  }));
}

/**
 * Parse Lichess NDJSON string into normalized GameData[].
 */
export function parseLichessGames(ndjson: string, _targetUsername: string): GameData[] {
  if (!ndjson) return [];

  const lines = ndjson.trim().split('\n');
  const results: GameData[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const g = JSON.parse(line) as LichessGame;

      // Extract PGN — construct from moves array if missing
      let pgn = g.pgn || '';
      if (!pgn) {
        const rawMoves = g.moves;
        if (rawMoves) {
          const moves: string[] = Array.isArray(rawMoves)
            ? rawMoves
            : typeof rawMoves === 'string'
              ? rawMoves.trim().split(/\s+/)
              : [];
          if (moves.length > 0) {
            const pairs: string[] = [];
            for (let j = 0; j < moves.length; j += 2) {
              const num = Math.floor(j / 2) + 1;
              const w = moves[j] || '';
              const b = moves[j + 1] || '';
              if (w) pairs.push(`${num}. ${w}${b ? ' ' + b : ''}`);
            }
            pgn = pairs.join(' ');
          }
        }
      }

      const whiteName =
        g.players?.white?.user?.name ?? g.players?.white?.userId ?? 'Anonymous';
      const blackName =
        g.players?.black?.user?.name ?? g.players?.black?.userId ?? 'Anonymous';

      results.push({
        id: g.id,
        source: 'lichess',
        white: whiteName,
        black: blackName,
        result: resolveResultLichess(g),
        eco: g.opening?.eco || g.eco || 'Unknown',
        pgn,
        playedAt: new Date(g.createdAt).toISOString(),
        timeControl: g.speed || '',
        openingName: g.opening?.name || undefined,
      });
    } catch (e) {
      logger.warn({ line: i, err: e }, '[GameParser] Failed to parse Lichess game');
    }
  }

  const withPGN = results.filter((g) => g.pgn && g.pgn.trim().length > 20).length;
  logger.info(
    { total: results.length, withPGN, pct: results.length > 0 ? ((withPGN / results.length) * 100).toFixed(1) : '0' },
    '[GameParser] Lichess parsing complete',
  );

  return results;
}
