/**
 * Opening classification service using the ECO library.
 * Uses @chess-openings/eco.json (12,000+ openings from lichess, SCID, etc.)
 * instead of hardcoded logic for accurate Caro-Kann, Sicilian, QGD, etc.
 */

import { Chess } from 'chess.js';
import {
  openingBook,
  lookupByMoves,
  getPositionBook,
  getOpeningsByEco,
} from '@chess-openings/eco.json';

const DEBUG = true;
const log = (...args: unknown[]) => {
  if (DEBUG) console.log('[OpeningService]', ...args);
};

let cachedBook: Awaited<ReturnType<typeof openingBook>> | null = null;
let cachedPosBook: ReturnType<typeof getPositionBook> | null = null;

async function getOpeningBook() {
  if (!cachedBook) {
    log('Loading ECO opening book from GitHub...');
    try {
      cachedBook = await openingBook();
      cachedPosBook = getPositionBook(cachedBook);
      const count = Object.keys(cachedBook).length;
      log(`ECO book loaded: ${count} positions`);
    } catch (err) {
      console.error('[OpeningService] Failed to load ECO book:', err);
      throw err;
    }
  }
  return { book: cachedBook, posBook: cachedPosBook! };
}

export interface OpeningResult {
  name: string;
  eco: string;
  moves: string;
}

/** Normalize ECO code for lookup - handles B20, B20-B29, B20/1, etc. */
function normalizeEco(eco: string | undefined): string | null {
  if (!eco || eco === 'Unknown') return null;
  const trimmed = eco.trim().toUpperCase();
  // Handle "B20-B29" or "B20/1" or "B201" -> take first 3 chars (letter + 2 digits)
  const first = trimmed.split(/[-/]/)[0].trim();
  const match = first.match(/^([A-E])(\d{2})\d*$/);
  if (match) return match[1] + match[2]; // "B20" or "B201" -> "B20"
  if (!first.match(/^[A-E]\d{2}$/)) return null;
  return first;
}

/** Look up opening name by ECO code - uses library's getOpeningsByEco for proper database lookup */
async function lookupByEcoCode(book: Awaited<ReturnType<typeof openingBook>>, ecoCode: string): Promise<string | null> {
  const openings = await getOpeningsByEco(ecoCode, book);
  if (!openings || openings.length === 0) {
    const prefix = ecoCode.slice(0, 2);
    const entries = Object.values(book) as Array<{ eco?: string; name?: string; isEcoRoot?: boolean }>;
    const byPrefix = entries.filter(o => o.eco?.startsWith(prefix));
    if (byPrefix.length === 0) return null;
    const root = byPrefix.find(o => o.isEcoRoot) ?? byPrefix[0];
    return root.name ?? null;
  }
  const root = openings.find((o: { isEcoRoot?: boolean }) => o.isEcoRoot) ?? openings[0];
  return (root as { name?: string }).name ?? null;
}

/** Extract movetext from PGN - handles headers, moves-only, Chess.com, Lichess formats */
function extractMovetext(pgn: string): string | null {
  if (!pgn || pgn.trim().length < 5) return null;
  const stripped = pgn.replace(/\[.*?\]/g, '').replace(/\{.*?\}/g, '').trim();
  const parts = stripped.split(/\n\n+/);
  let movetext = (parts.length > 1 ? parts[1] : parts[0])?.trim();
  if (!movetext) movetext = stripped;
  if (!movetext || !/\d+\.\s*\S/.test(movetext)) return null;
  return movetext;
}

/**
 * Convert Chess.com PGN format to standard PGN.
 * Chess.com uses "1. e4  1... e5  2. Nf3  2... Nc6" - chess.js expects "1. e4 e5 2. Nf3 Nc6".
 * Replace "  N... " (black move tags) with " " to merge black moves into the move pair.
 */
function normalizeToStandardPgn(movetext: string): string {
  return movetext.replace(/\s+\d+\.\.\.\s+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Identifies opening from PGN using the ECO library.
 * 1. Try lookupByMoves (PGN-based, most accurate)
 * 2. Fallback: lookupByEcoCode (database lookup by ECO) - still uses database, NOT hardcoded
 */
export async function identifyOpening(pgn: string, eco?: string): Promise<OpeningResult | null> {
  if (!pgn || pgn.trim().length < 10) return null;

  try {
    const { book, posBook } = await getOpeningBook();
    const chess = new Chess();

    const movetext = extractMovetext(pgn);
    if (!movetext) return null;

    const standardPgn = normalizeToStandardPgn(movetext);
    try {
      chess.loadPgn(`[White "?"]\n[Black "?"]\n\n${standardPgn}`);
    } catch {
      return null;
    }

    const result = lookupByMoves(chess, book, {
      positionBook: posBook,
      maxMovesBack: 30,
    });

    if (result.opening) {
      return {
        name: result.opening.name,
        eco: result.opening.eco,
        moves: result.opening.moves || '',
      };
    }

    const ecoCode = normalizeEco(eco);
    if (ecoCode) {
      const name = await lookupByEcoCode(book, ecoCode);
      if (name) return { name, eco: ecoCode, moves: '' };
    }
    return null;
  } catch (err) {
    log('identifyOpening error:', err);
    return null;
  }
}

/**
 * Identifies opening for many games in batch.
 * Uses ECO library: 1) PGN lookup, 2) ECO code lookup (database) - NO hardcoded fallback.
 */
export async function identifyOpeningsBatch(
  games: Array<{ pgn: string; eco?: string }>
): Promise<Map<number, OpeningResult | null>> {
  let book: Awaited<ReturnType<typeof openingBook>>;
  let posBook: ReturnType<typeof getPositionBook>;
  try {
    const result = await getOpeningBook();
    book = result.book;
    posBook = result.posBook;
  } catch (err) {
    console.error('[OpeningService] ECO book load failed - cannot classify openings:', err);
    return new Map(games.map((_, i) => [i, null]));
  }

  const results = new Map<number, OpeningResult | null>();
  let pgnMatchCount = 0;
  let ecoMatchCount = 0;
  let noMatchCount = 0;
  let parseFailCount = 0;
  const nameCounts: Record<string, number> = {};
  const failedEcos: string[] = [];
  const failedReasons: Record<string, number> = {};

  log(`Starting batch: ${games.length} games. Sample ECOs:`, games.slice(0, 5).map(g => g.eco));

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    if (!g.pgn || g.pgn.trim().length < 10) {
      parseFailCount++;
      failedReasons['no_pgn'] = (failedReasons['no_pgn'] ?? 0) + 1;
      results.set(i, null);
      continue;
    }

    try {
      const chess = new Chess();
      const movetext = extractMovetext(g.pgn);
      if (!movetext) {
        parseFailCount++;
        failedReasons['no_movetext'] = (failedReasons['no_movetext'] ?? 0) + 1;
        if (i < 5) log(`extractMovetext failed for game ${i}, pgn sample: ${g.pgn.slice(0, 120)}...`);
        results.set(i, null);
        continue;
      }

      const standardPgn = normalizeToStandardPgn(movetext);
      try {
        chess.loadPgn(`[White "?"]\n[Black "?"]\n\n${standardPgn}`);
      } catch (err) {
        parseFailCount++;
        failedReasons['loadPgn'] = (failedReasons['loadPgn'] ?? 0) + 1;
        if (i < 5) log(`loadPgn failed for game ${i}:`, (err as Error).message, 'movetext sample:', movetext.slice(0, 80) + '...');
        results.set(i, null);
        continue;
      }

      const result = lookupByMoves(chess, book, {
        positionBook: posBook,
        maxMovesBack: 30,
      });

      if (result.opening) {
        pgnMatchCount++;
        const name = result.opening.name;
        nameCounts[name] = (nameCounts[name] ?? 0) + 1;
        results.set(i, {
          name,
          eco: result.opening.eco,
          moves: result.opening.moves || '',
        });
      } else {
        const ecoCode = normalizeEco(g.eco);
        if (ecoCode) {
          const name = await lookupByEcoCode(book, ecoCode);
          if (name) {
            ecoMatchCount++;
            nameCounts[name] = (nameCounts[name] ?? 0) + 1;
            results.set(i, { name, eco: ecoCode, moves: '' });
          } else {
            noMatchCount++;
            if (failedEcos.length < 10) failedEcos.push(`${ecoCode} (raw: ${g.eco})`);
            results.set(i, null);
          }
        } else {
          noMatchCount++;
          failedReasons['bad_eco'] = (failedReasons['bad_eco'] ?? 0) + 1;
          if (i < 5) log(`normalizeEco rejected: ${g.eco}`);
          results.set(i, null);
        }
      }
    } catch (err) {
      parseFailCount++;
      if (i < 3) log(`Game ${i} error:`, err);
      results.set(i, null);
    }
  }

  log(`Batch complete: ${games.length} games | PGN match: ${pgnMatchCount} | ECO match: ${ecoMatchCount} | No match: ${noMatchCount} | Parse fail: ${parseFailCount}`);
  log(`Parse failures by reason:`, failedReasons);
  if (failedEcos.length > 0) log(`Sample ECOs with no DB match:`, failedEcos.slice(0, 5));
  const topNames = Object.entries(nameCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([n, c]) => `${n}:${c}`)
    .join(', ');
  log(`Top openings: ${topNames}`);

  return results;
}
