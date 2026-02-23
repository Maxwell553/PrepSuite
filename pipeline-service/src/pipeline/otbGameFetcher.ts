/**
 * Fetch OTB games from Supabase by FIDE ID.
 * Games are pre-indexed by scripts/import-otb-pgn.ts from Lumbra Gigabase PGN.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../lib/logger.js';
import type { GameData } from '../lib/types.js';

const TABLE = 'otb_games';
const DEFAULT_LIMIT = 500;

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key);
  return client;
}

interface OtbRow {
  id: string;
  fide_id_white: string;
  fide_id_black: string;
  white: string;
  black: string;
  result: string;
  eco: string | null;
  event: string | null;
  date: string | null;
  pgn: string;
  white_elo: number | null;
  black_elo: number | null;
  source: string | null;
}

/**
 * Fetch OTB games where the player (by FIDE ID) played as white or black.
 * Returns normalized GameData[] with source: 'otb'.
 */
export async function fetchOtbGames(
  fideId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<GameData[]> {
  const supabase = getClient();
  if (!supabase) {
    logger.warn('[OtbFetcher] Supabase not configured, skipping OTB fetch');
    return [];
  }

  if (!fideId?.trim()) return [];

  const cleanId = fideId.trim();

  try {
    // Fetch games where player is white
    const { data: whiteData, error: whiteErr } = await supabase
      .from(TABLE)
      .select('*')
      .eq('fide_id_white', cleanId)
      .order('date', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (whiteErr) {
      logger.warn({ err: whiteErr.message }, '[OtbFetcher] White games query failed');
      return [];
    }

    // Fetch games where player is black
    const { data: blackData, error: blackErr } = await supabase
      .from(TABLE)
      .select('*')
      .eq('fide_id_black', cleanId)
      .order('date', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (blackErr) {
      logger.warn({ err: blackErr.message }, '[OtbFetcher] Black games query failed');
      return (whiteData || []).map(rowToGameData);
    }

    const whiteRows = (whiteData || []) as OtbRow[];
    const blackRows = (blackData || []) as OtbRow[];

    const seen = new Set<string>();
    const merged: OtbRow[] = [];

    let i = 0;
    let j = 0;
    while (merged.length < limit && (i < whiteRows.length || j < blackRows.length)) {
      const w = whiteRows[i];
      const b = blackRows[j];

      const wDate = w?.date || '';
      const bDate = b?.date || '';
      const takeWhite = !b || (w && wDate >= bDate);

      if (takeWhite && w && !seen.has(w.id)) {
        seen.add(w.id);
        merged.push(w);
        i++;
      } else if (b && !seen.has(b.id)) {
        seen.add(b.id);
        merged.push(b);
        j++;
      } else {
        if (takeWhite) i++;
        else j++;
      }
    }

    const games = merged.slice(0, limit).map(rowToGameData);
    logger.info({ fideId: cleanId, count: games.length }, '[OtbFetcher] Fetched OTB games');
    return games;
  } catch (err) {
    logger.warn({ err, fideId: cleanId }, '[OtbFetcher] Fetch failed');
    return [];
  }
}

function rowToGameData(row: OtbRow): GameData {
  return {
    id: row.id,
    source: 'otb',
    white: row.white,
    black: row.black,
    result: row.result,
    eco: row.eco || 'Unknown',
    pgn: row.pgn,
    playedAt: row.date ? `${row.date}T12:00:00Z` : new Date().toISOString(),
    timeControl: 'classical',
    openingName: undefined,
  };
}
