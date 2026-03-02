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

/** Supabase/PostgREST default max rows per request; we paginate to fetch beyond this. */
const BATCH_SIZE = 1000;

/** Row shape from otb_games table (used for batch fetch typing) */
interface OtbRow {
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
}

/**
 * Fetch OTB games for a player by FIDE ID.
 * Paginates through the DB to return up to `limit` games (no artificial cap).
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
  const seen = new Set<string>();
  const games: GameData[] = [];

  const addGame = (row: OtbRow) => {
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

  const fetchBatch = async (
    column: 'white_fide_id' | 'black_fide_id',
    offset: number,
  ): Promise<{ rows: OtbRow[]; hasMore: boolean }> => {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, white, black, result, eco, event, game_date, white_elo, black_elo, pgn')
      .eq(column, fideId.trim())
      .order('game_date', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      logger.warn({ error, column }, '[OtbGames] Supabase query failed');
      return { rows: [], hasMore: false };
    }
    const rows = (data || []) as OtbRow[];
    return { rows, hasMore: rows.length >= BATCH_SIZE };
  };

  let whiteOffset = 0;
  let blackOffset = 0;
  let whiteHasMore = true;
  let blackHasMore = true;

  type BatchResult = { rows: OtbRow[]; hasMore: boolean };
  const emptyBatch: BatchResult = { rows: [], hasMore: false };
  while (games.length < limit && (whiteHasMore || blackHasMore)) {
    const batches: [BatchResult, BatchResult] = await Promise.all([
      whiteHasMore ? fetchBatch('white_fide_id', whiteOffset) : Promise.resolve(emptyBatch),
      blackHasMore ? fetchBatch('black_fide_id', blackOffset) : Promise.resolve(emptyBatch),
    ]);
    const whiteBatch = batches[0];
    const blackBatch = batches[1];

    for (const row of whiteBatch.rows) addGame(row);
    for (const row of blackBatch.rows) addGame(row);

    whiteOffset += whiteBatch.rows.length;
    blackOffset += blackBatch.rows.length;
    whiteHasMore = whiteBatch.hasMore;
    blackHasMore = blackBatch.hasMore;

    if (whiteBatch.rows.length === 0 && blackBatch.rows.length === 0) break;
  }

  games.sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
  const trimmed = games.slice(0, limit);

  logger.info(
    { fideId, requested: limit, fetched: trimmed.length, durationMs: Date.now() - start },
    '[OtbGames] Fetched OTB games',
  );

  return trimmed;
}
