/**
 * OTB PGN Import Script
 *
 * Streams a large PGN file, parses games, and inserts into Supabase otb_games.
 * Run from pipeline-service: npm run import:otb
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Path: OTB_PGN_PATH or first CLI arg (default: ~/Desktop/OTB.pgn)
 */

import { createReadStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import { createClient } from '@supabase/supabase-js';
import { parse } from '@mliebelt/pgn-parser';
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.local', override: true });

const BATCH_SIZE = 500;
const TABLE = 'otb_games';

function getTag(tags: Record<string, string> | undefined, key: string): string | null {
  if (!tags || typeof tags !== 'object') return null;
  const v = tags[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function parseDate(s: string | null): string | null {
  if (!s || s.trim() === '') return null;
  const parts = s.trim().split('.');
  if (parts.length < 1 || parts[0] === '????' || !/^\d{4}$/.test(parts[0])) return null;
  const y = parts[0];
  const year = parseInt(y, 10);
  if (year < 1900 || year > 2100) return null;
  const mo = parts[1] && /^\d{2}$/.test(parts[1]) ? parts[1] : '01';
  const d = parts[2] && /^\d{2}$/.test(parts[2]) ? parts[2] : '01';
  const month = parseInt(mo, 10);
  const day = parseInt(d, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${mo}-${d}`;
}

function parseIntOrNull(s: string | null): number | null {
  if (!s || !/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

interface OtbRow {
  white_fide_id: string | null;
  black_fide_id: string | null;
  white: string;
  black: string;
  result: string | null;
  eco: string | null;
  event: string | null;
  site: string | null;
  game_date: string | null;
  white_elo: number | null;
  black_elo: number | null;
  pgn: string;
  source: string;
}

function extractRow(pgnBlock: string): OtbRow | null {
  try {
    const parsed = parse(pgnBlock, { startRule: 'game' }) as { tags?: Record<string, string> };
    const tags = parsed?.tags;
    if (!tags) return null;

    const white = getTag(tags, 'White') || '?';
    const black = getTag(tags, 'Black') || '?';
    if (white === '?' && black === '?') return null;

    const whiteFideId = getTag(tags, 'WhiteFideId') ?? getTag(tags, 'WhiteID') ?? null;
    const blackFideId = getTag(tags, 'BlackFideId') ?? getTag(tags, 'BlackID') ?? null;

    const result = getTag(tags, 'Result');
    const eco = getTag(tags, 'ECO');
    const event = getTag(tags, 'Event');
    const site = getTag(tags, 'Site');
    const dateStr = getTag(tags, 'Date') ?? getTag(tags, 'EventDate');
    const gameDate = parseDate(dateStr);
    const whiteElo = parseIntOrNull(getTag(tags, 'WhiteElo') ?? getTag(tags, 'WhiteRating'));
    const blackElo = parseIntOrNull(getTag(tags, 'BlackElo') ?? getTag(tags, 'BlackRating'));

    return {
      white_fide_id: whiteFideId,
      black_fide_id: blackFideId,
      white,
      black,
      result,
      eco,
      event,
      site,
      game_date: gameDate,
      white_elo: whiteElo,
      black_elo: blackElo,
      pgn: pgnBlock.trim(),
      source: 'otb',
    };
  } catch {
    return null;
  }
}

async function* streamPgnGames(filePath: string): AsyncGenerator<string> {
  const stream = createReadStream(filePath, {
    encoding: 'utf8',
    highWaterMark: 2 * 1024 * 1024, // 2MB chunks
  });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let buffer = '';
  for await (const line of rl) {
    const trimmed = line.trimEnd();
    if (/^\[Event\s/.test(trimmed) && buffer.trim().length > 20) {
      yield buffer.trim();
      buffer = line;
      continue;
    }
    buffer += (buffer ? '\n' : '') + line;
  }
  if (buffer.trim().length > 20) {
    yield buffer.trim();
  }
}

async function main() {
  const filePath =
    process.argv[2] ||
    process.env.OTB_PGN_PATH ||
    `${process.env.HOME || '/Users/maxingargiola'}/Desktop/OTB.pgn`;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set in pipeline-service/.env');
    process.exit(1);
  }

  if (!existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('OTB PGN Import');
  console.log('File:', filePath);
  console.log('Batch size:', BATCH_SIZE);
  console.log('');

  const start = Date.now();
  let total = 0;
  let inserted = 0;
  let skipped = 0;
  let batch: OtbRow[] = [];

  for await (const pgnBlock of streamPgnGames(filePath)) {
    total++;
    if (total % 10000 === 0) {
      console.log(`Parsed ${total.toLocaleString()} games, inserted ${inserted.toLocaleString()}...`);
    }

    const row = extractRow(pgnBlock);
    if (!row) {
      skipped++;
      continue;
    }

    batch.push(row);

    if (batch.length >= BATCH_SIZE) {
      const { error } = await supabase.from(TABLE).insert(batch);
      if (error) {
        console.error('Insert error:', error.message);
        skipped += batch.length;
      } else {
        inserted += batch.length;
      }
      batch = [];
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from(TABLE).insert(batch);
    if (error) {
      console.error('Insert error (final):', error.message);
      skipped += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log('');
  console.log('Done.');
  console.log(`Total parsed: ${total.toLocaleString()}`);
  console.log(`Inserted: ${inserted.toLocaleString()}`);
  console.log(`Skipped: ${skipped.toLocaleString()}`);
  console.log(`Duration: ${duration}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
