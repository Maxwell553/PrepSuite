#!/usr/bin/env npx tsx
/**
 * Import OTB games from PGN files into Supabase otb_games table.
 * Uses streaming for large files (7GB+).
 *
 * Usage:
 *   npx tsx scripts/import-otb-pgn.ts <path-to-pgn-or-dir>
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env or .env.local
 */

import { config } from 'dotenv';
config();
config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';
import { parse, type ParseTree } from '@mliebelt/pgn-parser';

const TABLE = 'otb_games';
const BATCH_SIZE = 500;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  return createClient(url, key);
}

function collectPgnPaths(input: string): string[] {
  const stat = fs.statSync(input);
  if (stat.isFile()) {
    return input.toLowerCase().endsWith('.pgn') ? [input] : [];
  }
  if (stat.isDirectory()) {
    const files: string[] = [];
    for (const name of fs.readdirSync(input)) {
      const full = path.join(input, name);
      if (fs.statSync(full).isFile() && name.toLowerCase().endsWith('.pgn')) {
        files.push(full);
      }
    }
    return files.sort();
  }
  return [];
}

interface ParsedGame {
  fideIdWhite: string;
  fideIdBlack: string;
  white: string;
  black: string;
  result: string;
  eco: string | null;
  event: string | null;
  date: string | null;
  pgn: string;
  whiteElo: number | null;
  blackElo: number | null;
}

function parseGameFromString(gameStr: string): ParsedGame | null {
  try {
    const tree = parse(gameStr.trim(), { startRule: 'game' }) as ParseTree;
    const tags = tree.tags as Record<string, string>;
    if (!tags) return null;

    const fideWhite = tags.WhiteFideId || tags.WhiteFIDEID || tags.FIDEID?.split('/')[0]?.trim();
    const fideBlack = tags.BlackFideId || tags.BlackFIDEID || tags.FIDEID?.split('/')[1]?.trim();
    if (!fideWhite || !fideBlack) return null;

    const whiteElo = tags.WhiteElo ? parseInt(tags.WhiteElo, 10) : null;
    const blackElo = tags.BlackElo ? parseInt(tags.BlackElo, 10) : null;

    return {
      fideIdWhite: String(fideWhite).trim(),
      fideIdBlack: String(fideBlack).trim(),
      white: (tags.White || '?').trim(),
      black: (tags.Black || '?').trim(),
      result: (tags.Result || '*').trim(),
      eco: tags.ECO?.trim() || null,
      event: tags.Event?.trim() || null,
      date: tags.Date?.trim() || null,
      pgn: gameStr.trim(),
      whiteElo: Number.isNaN(whiteElo) ? null : whiteElo,
      blackElo: Number.isNaN(blackElo) ? null : blackElo,
    };
  } catch {
    return null;
  }
}

/** Stream games from a PGN file. Each game starts with [Event; next [Event = new game. */
async function* streamGames(filePath: string): AsyncGenerator<string> {
  const stream = createReadStream(filePath, {
    encoding: 'utf-8',
    highWaterMark: 4 * 1024 * 1024, // 4MB chunks
  });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let buffer = '';
  for await (const line of rl) {
    if (line.startsWith('[Event ') && buffer.trim()) {
      const game = buffer.replace(/\n\n\s*\[Event\s[^\]]*\].*$/s, '').trim();
      if (game) yield game;
      buffer = line + '\n';
    } else {
      buffer += (buffer ? '\n' : '') + line;
    }
  }
  const last = buffer.replace(/\n\n\s*\[Event\s[^\]]*\].*$/s, '').trim();
  if (last) yield last;
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: npx tsx scripts/import-otb-pgn.ts <path-to-pgn-or-dir>');
    process.exit(1);
  }

  const pgnPaths = collectPgnPaths(inputPath);
  if (pgnPaths.length === 0) {
    console.error('No .pgn files found at', inputPath);
    process.exit(1);
  }

  console.log('Found', pgnPaths.length, 'PGN file(s)');
  const supabase = getSupabase();

  let totalParsed = 0;
  let totalSkipped = 0;
  let totalInserted = 0;

  for (const pgnPath of pgnPaths) {
    console.log('\nProcessing:', pgnPath);
    let fileParsed = 0;
    let fileSkipped = 0;
    const batch: ParsedGame[] = [];

    let gamesSeen = 0;
    for await (const gameStr of streamGames(pgnPath)) {
      gamesSeen++;
      if (gamesSeen % 50000 === 0) {
        process.stdout.write(`\r  Read ${gamesSeen} games, parsed ${fileParsed}, inserted ${totalInserted}...`);
      }
      const game = parseGameFromString(gameStr);
      if (game) {
        batch.push(game);
        fileParsed++;
      } else {
        fileSkipped++;
      }

      if (batch.length >= BATCH_SIZE) {
        const rows = batch.map((g) => ({
          fide_id_white: g.fideIdWhite,
          fide_id_black: g.fideIdBlack,
          white: g.white,
          black: g.black,
          result: g.result,
          eco: g.eco,
          event: g.event,
          date: g.date,
          pgn: g.pgn,
          white_elo: g.whiteElo,
          black_elo: g.blackElo,
          source: 'lumbras_gigabase',
        }));
        const { error } = await supabase.from(TABLE).insert(rows);
        if (error) {
          console.error('Insert error:', error.message);
        } else {
          totalInserted += rows.length;
          process.stdout.write(`\r  Inserted ${totalInserted} games...`);
        }
        batch.length = 0;
      }
    }

    if (batch.length > 0) {
      const rows = batch.map((g) => ({
        fide_id_white: g.fideIdWhite,
        fide_id_black: g.fideIdBlack,
        white: g.white,
        black: g.black,
        result: g.result,
        eco: g.eco,
        event: g.event,
        date: g.date,
        pgn: g.pgn,
        white_elo: g.whiteElo,
        black_elo: g.blackElo,
        source: 'lumbras_gigabase',
      }));
      const { error } = await supabase.from(TABLE).insert(rows);
      if (error) {
        console.error('Insert error:', error.message);
      } else {
        totalInserted += rows.length;
      }
    }

    totalParsed += fileParsed;
    totalSkipped += fileSkipped;
    console.log(`\n  Parsed: ${fileParsed}, skipped (no FIDE ID): ${fileSkipped}`);
  }

  console.log('\nDone. Total inserted:', totalInserted, '| Skipped:', totalSkipped);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
