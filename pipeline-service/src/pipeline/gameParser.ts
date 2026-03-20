import type { GameData } from '../lib/types.js';
import { logger } from '../lib/logger.js';

/**
 * Standardize PGN for chess.js / board display.
 * Ensures Lichess and other sources produce board-compatible PGN.
 */
export function standardizePgnForBoard(pgn: string): string {
  if (!pgn || typeof pgn !== 'string') return '';
  let s = pgn.trim();
  // Replace numeric castling - chess.js requires O-O
  s = s.replace(/\b0-0-0\b/g, 'O-O-O');
  s = s.replace(/\b0-0\b/g, 'O-O');
  // Remove FEN/SetUp/CurrentPosition that can cause "castling availability is invalid"
  s = s.replace(/\[\s*FEN\s+"[^"]*"\s*\]/gi, '');
  s = s.replace(/\[\s*SetUp\s+"?[^"]*"?\s*\]/gi, '');
  s = s.replace(/\[\s*CurrentPosition\s+"[^"]*"\s*\]/gi, ''); // Chess.com-specific
  s = s.replace(/\[\s*GameId\s+"[^"]*"\s*\]/gi, ''); // Lichess export format
  s = s.replace(/\[\s*ECOUrl\s+"[^"]*"\s*\]/gi, ''); // Chess.com - long URLs
  s = s.replace(/\[\s*Link\s+"[^"]*"\s*\]/gi, ''); // Chess.com - long URLs
  // Remove NAGs and inline comments (Chess.com {[%clk ...]}, Lichess {[%eval ...]})
  s = s.replace(/\$\d+/g, '');
  while (/\{[^{}]*\}/.test(s)) {
    s = s.replace(/\{[^{}]*\}/g, '');
  }
  s = s.replace(/\[\s*%eval\s+[^\]]*\]/gi, '');
  s = s.replace(/\[\s*%clk\s+[^\]]*\]/gi, '');
  s = s.replace(/;[^\n]*/g, '');
  // Ensure blank line between headers and movetext (PGN spec)
  if (s.includes('[') && s.indexOf('\n\n') === -1) {
    const lastBracket = s.lastIndexOf(']');
    if (lastBracket !== -1 && lastBracket < s.length - 1) {
      const after = s.slice(lastBracket + 1).trim();
      if (after && !after.startsWith('\n\n')) {
        s = s.slice(0, lastBracket + 1) + '\n\n' + after;
      }
    }
  }
  return s.trim();
}

// ── Chess.com types ────────────────────────────────────────────────

interface ChessComGame {
  uuid?: string;
  white: { username: string; result: string; rating?: number };
  black: { username: string; result: string; rating?: number };
  eco?: string;
  pgn: string;
  end_time: number;
  time_control: string;
}

// ── Lichess types ──────────────────────────────────────────────────

interface LichessGame {
  id: string;
  /** mate, resign, outoftime, draw, stalemate, cheat, etc. */
  status?: string;
  players?: {
    white?: { user?: { name?: string; id?: string }; userId?: string; rating?: number };
    black?: { user?: { name?: string; id?: string }; userId?: string; rating?: number };
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

// ── PGN Termination fallback (when API omits white/black result) ───

/** Extract [White "X"] and [Black "Y"] from PGN. */
function extractWhiteBlackFromPgn(pgn: string): { white: string; black: string } {
  const wMatch = pgn.match(/\[\s*White\s+"([^"]*)"\s*\]/i);
  const bMatch = pgn.match(/\[\s*Black\s+"([^"]*)"\s*\]/i);
  return {
    white: (wMatch?.[1] ?? '').trim(),
    black: (bMatch?.[1] ?? '').trim(),
  };
}

/** Parse [Termination "X won by resignation"] from Chess.com PGN. Returns { whiteRes, blackRes } or null. */
function parseTerminationFromPgn(
  pgn: string,
  whiteUsername: string,
  blackUsername: string,
): { whiteRes: string; blackRes: string } | null {
  const match = pgn.match(/\[\s*Termination\s+"([^"]+)"\s*\]/i);
  if (!match) return null;
  const text = match[1].trim();
  const wonMatch = text.match(/^(.+?)\s+won\s+(?:by\s+)?(resignation|on\s+time|checkmate)/i);
  if (!wonMatch) return null;
  const winnerName = wonMatch[1].trim();
  const how = wonMatch[2].toLowerCase();
  const loserRes = how.includes('time') ? 'timeout' : how.includes('resignation') ? 'resign' : 'checkmated';

  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, '');
  const w = norm(whiteUsername);
  const b = norm(blackUsername);
  const wn = norm(winnerName);
  if (!wn) return null;

  if (w === wn || (w && (w.includes(wn) || wn.includes(w)))) {
    return { whiteRes: 'win', blackRes: loserRes };
  }
  if (b === wn || (b && (b.includes(wn) || wn.includes(b)))) {
    return { whiteRes: loserRes, blackRes: 'win' };
  }
  return null;
}

/**
 * Enrich Chess.com games with chessComWhiteResult/chessComBlackResult by parsing
 * [Termination "..."] from PGN. Uses PGN as primary source since Chess.com API
 * sometimes omits white/black result. Extracts usernames from [White]/[Black] when needed.
 */
export function enrichChessComGamesFromPgn(games: GameData[]): void {
  for (const g of games) {
    if (g.source !== 'chess.com') continue;
    if (!g.pgn || g.pgn.trim().length < 20) continue;

    const { white: pgnWhite, black: pgnBlack } = extractWhiteBlackFromPgn(g.pgn);
    const whiteUser = g.white || pgnWhite;
    const blackUser = g.black || pgnBlack;
    const parsed = parseTerminationFromPgn(g.pgn, whiteUser, blackUser);
    if (parsed) {
      g.chessComWhiteResult = parsed.whiteRes;
      g.chessComBlackResult = parsed.blackRes;
    }
  }
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

/** Extract username from Chess.com API white/black (object or URL string). */
function getChessComUsername(player: unknown): string {
  if (!player) return '';
  if (typeof player === 'string') {
    const m = player.match(/\/player\/([^/]+)\/?$/i);
    return m ? decodeURIComponent(m[1]) : '';
  }
  const p = player as { username?: string };
  return (p.username ?? '').trim();
}

/** Extract result from Chess.com API white/black. */
function getChessComResult(player: unknown): string {
  if (!player || typeof player === 'string') return '';
  return ((player as { result?: string }).result ?? '').toLowerCase().trim();
}

/**
 * Parse Chess.com raw JSON games into normalized GameData[].
 * Handles both object format (white: {username, result}) and URL string format.
 */
export function parseChessComGames(games: unknown[], _targetUsername: string): GameData[] {
  const typed = games as ChessComGame[];
  return typed.map((g) => {
    const pgn = standardizePgnForBoard(g.pgn || '');
    const { white: pgnWhite, black: pgnBlack } = extractWhiteBlackFromPgn(pgn);

    let whiteUsername = getChessComUsername(g.white) || pgnWhite;
    let blackUsername = getChessComUsername(g.black) || pgnBlack;

    let whiteElo = (g.white as { rating?: number })?.rating;
    let blackElo = (g.black as { rating?: number })?.rating;
    if ((whiteElo == null || blackElo == null) && pgn) {
      const we = pgn.match(/\[\s*WhiteElo\s+"(\d+)"\s*\]/i);
      const be = pgn.match(/\[\s*BlackElo\s+"(\d+)"\s*\]/i);
      if (whiteElo == null && we) whiteElo = parseInt(we[1], 10);
      if (blackElo == null && be) blackElo = parseInt(be[1], 10);
    }

    let whiteRes = getChessComResult(g.white);
    let blackRes = getChessComResult(g.black);
    if ((!whiteRes || !blackRes) && pgn) {
      const fromPgn = parseTerminationFromPgn(pgn, whiteUsername, blackUsername);
      if (fromPgn) {
        if (!whiteRes) whiteRes = fromPgn.whiteRes;
        if (!blackRes) blackRes = fromPgn.blackRes;
      }
    }

    let result = resolveResult(g);
    if (whiteRes === 'win') result = '1-0';
    else if (blackRes === 'win') result = '0-1';
    else if (result === '1/2-1/2' && pgn) {
      const resMatch = pgn.match(/\[\s*Result\s+"([^"]+)"\s*\]/i);
      if (resMatch && /^[01]-[01]|1\/2-1\/2$/.test(resMatch[1].trim())) {
        result = resMatch[1].trim();
      }
    }

    return {
      id: (g as { uuid?: string }).uuid || Math.random().toString(36),
      source: 'chess.com' as const,
      white: whiteUsername,
      black: blackUsername,
      result,
      eco: extractEco(g.eco),
      pgn,
      playedAt: new Date(g.end_time * 1000).toISOString(),
      timeControl: g.time_control || '',
      chessComWhiteResult: whiteRes || undefined,
      chessComBlackResult: blackRes || undefined,
      whiteElo: whiteElo ?? undefined,
      blackElo: blackElo ?? undefined,
    };
  });
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

      // Extract PGN — prefer API pgn field (full PGN with headers), fallback to moves
      let pgn = (g.pgn || '').trim();
      if (!pgn && g.moves) {
        const moves: string[] = Array.isArray(g.moves)
          ? g.moves
          : typeof g.moves === 'string'
            ? g.moves.trim().split(/\s+/)
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
      pgn = standardizePgnForBoard(pgn);

      const whiteName =
        g.players?.white?.user?.name ?? g.players?.white?.user?.id ?? g.players?.white?.userId ?? 'Anonymous';
      const blackName =
        g.players?.black?.user?.name ?? g.players?.black?.user?.id ?? g.players?.black?.userId ?? 'Anonymous';

      let whiteElo = g.players?.white?.rating;
      let blackElo = g.players?.black?.rating;
      if ((whiteElo == null || blackElo == null) && pgn) {
        const we = pgn.match(/\[\s*WhiteElo\s+"(\d+)"\s*\]/i);
        const be = pgn.match(/\[\s*BlackElo\s+"(\d+)"\s*\]/i);
        if (whiteElo == null && we) whiteElo = parseInt(we[1], 10);
        if (blackElo == null && be) blackElo = parseInt(be[1], 10);
      }

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
        lichessStatus: g.status ? g.status.toLowerCase() : undefined,
        openingName: g.opening?.name || undefined,
        whiteElo,
        blackElo,
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
