/**
 * Fetch OTB games from Supabase by FIDE ID.
 * Used when identity has a FIDE ID and otbLimit > 0.
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { logger } from '../lib/logger.js';
import type { GameData } from '../lib/types.js';
import { standardizePgnForBoard } from './gameParser.js';

const TABLE = 'otb_games';

/** Extract date from PGN [Date "..."] or [EventDate "..."] when DB game_date is null */
function extractDateFromPgn(pgn: string | null): string | null {
  if (!pgn) return null;
  const m = pgn.match(/\[(?:Date|EventDate)\s+"([^"]+)"\]/);
  if (!m) return null;
  const parts = m[1].trim().split('.');
  if (parts.length < 1 || parts[0] === '????' || !/^\d{4}$/.test(parts[0])) return null;
  const y = parts[0];
  const year = parseInt(y, 10);
  if (year < 1900 || year > 2100) return null;
  const mo = parts[1] && /^\d{2}$/.test(parts[1]) ? parts[1] : '01';
  const d = parts[2] && /^\d{2}$/.test(parts[2]) ? parts[2] : '01';
  return `${y}-${mo}-${d}`;
}

/** Extract title from PGN [WhiteTitle "..."] or [BlackTitle "..."] */
function extractTitleFromPgn(pgn: string | null, color: 'white' | 'black'): string | null {
  if (!pgn) return null;
  const tag = color === 'white' ? 'WhiteTitle' : 'BlackTitle';
  const m = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]+)"\\]`));
  return m ? m[1].trim() : null;
}

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Fetch OTB games for a player by FIDE ID.
 * Returns games where the player was white or black, sorted by date descending.
 */
export async function fetchOtbGames(fideId: string, limit: number): Promise<GameData[]> {
  if (!fideId?.trim() || limit <= 0) return [];

  const supabase = getClient();
  if (!supabase) {
    logger.warn('[OtbGames] Supabase not configured, skipping OTB fetch');
    return [];
  }

  const start = Date.now();

  const { data: asWhite, error: errWhite } = await supabase
    .from(TABLE)
    .select('id, white, black, result, eco, event, game_date, white_elo, black_elo, pgn')
    .eq('white_fide_id', fideId.trim())
    .order('game_date', { ascending: false })
    .limit(limit);

  const { data: asBlack, error: errBlack } = await supabase
    .from(TABLE)
    .select('id, white, black, result, eco, event, game_date, white_elo, black_elo, pgn')
    .eq('black_fide_id', fideId.trim())
    .order('game_date', { ascending: false })
    .limit(limit);

  if (errWhite || errBlack) {
    logger.warn({ errWhite, errBlack }, '[OtbGames] Supabase query failed');
    return [];
  }

  const seen = new Set<string>();
  const games: GameData[] = [];

  const addGame = (row: {
    id?: string;
    white: string;
    black: string;
    result: string | null;
    eco: string | null;
    event: string | null;
    game_date: string | null;
    white_elo: number | null;
    black_elo: number | null;
    pgn: string | null;
  }) => {
    const key = `${row.white}|${row.black}|${row.game_date || ''}`;
    if (seen.has(key)) return;
    seen.add(key);

    const dateStr = row.game_date || extractDateFromPgn(row.pgn);
    const playedAt = dateStr
      ? new Date(dateStr).toISOString()
      : new Date(0).toISOString(); // 1970-01-01 if unknown, not "now"

    const pgn = row.pgn ? standardizePgnForBoard(row.pgn) : undefined;
    const gameId = row.id || createHash('sha256').update(`${row.white}|${row.black}|${playedAt}`).digest('hex').slice(0, 12);

    games.push({
      id: `otb-${gameId}`,
      white: row.white,
      black: row.black,
      result: row.result || '*',
      eco: row.eco || 'Unknown',
      pgn: pgn || '',
      playedAt,
      source: 'otb',
      timeControl: '',
      openingName: undefined,
      event: row.event || undefined,
      whiteElo: row.white_elo ?? undefined,
      blackElo: row.black_elo ?? undefined,
      whiteTitle: extractTitleFromPgn(row.pgn, 'white') || undefined,
      blackTitle: extractTitleFromPgn(row.pgn, 'black') || undefined,
    });
  };

  for (const row of asWhite || []) addGame(row);
  for (const row of asBlack || []) addGame(row);

  games.sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
  const trimmed = games.slice(0, limit);

  logger.info(
    { fideId, fetched: trimmed.length, durationMs: Date.now() - start },
    '[OtbGames] Fetched OTB games',
  );

  return trimmed;
}
