/**
 * Opening classification — dual-tier approach:
 *   Tier 1: ECO library (@chess-openings/eco.json + chess.js)
 *   Tier 2: Hardcoded ECO-to-name mapping + move-based pattern matching
 *
 * Ported from:
 *   - src/services/openingService.ts (Tier 1)
 *   - src/services/analysis.worker.ts lines 20-630 (Tier 2)
 */

import { Chess } from 'chess.js';
import {
  openingBook,
  lookupByMoves,
  getPositionBook,
  getOpeningsByEco,
} from '@chess-openings/eco.json';
import { logger } from '../lib/logger.js';

// ── Tier 1: ECO library ───────────────────────────────────────────

export interface OpeningResult {
  name: string;
  eco: string;
  moves: string;
}

let cachedBook: Awaited<ReturnType<typeof openingBook>> | null = null;
let cachedPosBook: ReturnType<typeof getPositionBook> | null = null;

async function getOpeningBook() {
  if (!cachedBook) {
    logger.info('[OpeningClassifier] Loading ECO opening book...');
    cachedBook = await openingBook();
    cachedPosBook = getPositionBook(cachedBook);
    const count = Object.keys(cachedBook).length;
    logger.info({ count }, '[OpeningClassifier] ECO book loaded');
  }
  return { book: cachedBook, posBook: cachedPosBook! };
}

/** Normalize ECO code: "B20-B29" → "B20", "B20/1" → "B20", "B201" → "B20" */
export function normalizeEco(eco: string | undefined): string | null {
  if (!eco || eco === 'Unknown') return null;
  const trimmed = eco.trim().toUpperCase();
  const first = trimmed.split(/[-/]/)[0].trim();
  const match = first.match(/^([A-E])(\d{2})\d*$/);
  if (match) return match[1] + match[2];
  if (!first.match(/^[A-E]\d{2}$/)) return null;
  return first;
}

async function lookupByEcoCode(
  book: Awaited<ReturnType<typeof openingBook>>,
  ecoCode: string,
): Promise<string | null> {
  const openings = await getOpeningsByEco(ecoCode, book);
  if (!openings || openings.length === 0) {
    const prefix = ecoCode.slice(0, 2);
    const entries = Object.values(book) as Array<{ eco?: string; name?: string; isEcoRoot?: boolean }>;
    const byPrefix = entries.filter((o) => o.eco?.startsWith(prefix));
    if (byPrefix.length === 0) return null;
    const root = byPrefix.find((o) => o.isEcoRoot) ?? byPrefix[0];
    return root.name ?? null;
  }
  const root = openings.find((o: { isEcoRoot?: boolean }) => o.isEcoRoot) ?? openings[0];
  return (root as { name?: string }).name ?? null;
}

function extractMovetext(pgn: string): string | null {
  if (!pgn || pgn.trim().length < 5) return null;
  const stripped = pgn.replace(/\[.*?\]/g, '').replace(/\{.*?\}/g, '').trim();
  const parts = stripped.split(/\n\n+/);
  let movetext = (parts.length > 1 ? parts[1] : parts[0])?.trim();
  if (!movetext) movetext = stripped;
  if (!movetext || !/\d+\.\s*\S/.test(movetext)) return null;
  return movetext;
}

function normalizeToStandardPgn(movetext: string): string {
  return movetext.replace(/\s+\d+\.\.\.\s+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Batch identify openings using the ECO library.
 * Returns a Map from game index → OpeningResult | null.
 */
export async function identifyOpeningsBatch(
  games: Array<{ pgn: string; eco?: string }>,
): Promise<Map<number, OpeningResult | null>> {
  let book: Awaited<ReturnType<typeof openingBook>>;
  let posBook: ReturnType<typeof getPositionBook>;
  try {
    const result = await getOpeningBook();
    book = result.book;
    posBook = result.posBook;
  } catch (err) {
    logger.error({ err }, '[OpeningClassifier] ECO book load failed');
    return new Map(games.map((_, i) => [i, null]));
  }

  const results = new Map<number, OpeningResult | null>();
  let pgnMatchCount = 0;
  let ecoMatchCount = 0;
  let noMatchCount = 0;
  let parseFailCount = 0;

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    if (!g.pgn || g.pgn.trim().length < 10) {
      parseFailCount++;
      results.set(i, null);
      continue;
    }

    try {
      const chess = new Chess();
      const movetext = extractMovetext(g.pgn);
      if (!movetext) {
        parseFailCount++;
        results.set(i, null);
        continue;
      }

      const standardPgn = normalizeToStandardPgn(movetext);
      try {
        chess.loadPgn(`[White "?"]\n[Black "?"]\n\n${standardPgn}`);
      } catch {
        parseFailCount++;
        results.set(i, null);
        continue;
      }

      const result = lookupByMoves(chess, book, {
        positionBook: posBook,
        maxMovesBack: 30,
      });

      if (result.opening) {
        pgnMatchCount++;
        results.set(i, {
          name: result.opening.name,
          eco: result.opening.eco,
          moves: result.opening.moves || '',
        });
      } else {
        const ecoCode = normalizeEco(g.eco);
        if (ecoCode) {
          const name = await lookupByEcoCode(book, ecoCode);
          if (name) {
            ecoMatchCount++;
            results.set(i, { name, eco: ecoCode, moves: '' });
          } else {
            noMatchCount++;
            results.set(i, null);
          }
        } else {
          noMatchCount++;
          results.set(i, null);
        }
      }
    } catch {
      parseFailCount++;
      results.set(i, null);
    }
  }

  logger.info(
    { total: games.length, pgnMatch: pgnMatchCount, ecoMatch: ecoMatchCount, noMatch: noMatchCount, parseFail: parseFailCount },
    '[OpeningClassifier] Batch complete',
  );

  return results;
}

// ── Tier 2: Hardcoded fallback ────────────────────────────────────

const ECO_MAP: Record<string, string> = {
  B01: 'Scandinavian Defense',
  B06: 'Modern Defense',
  B07: 'Pirc Defense',
  B12: 'Caro-Kann Defense',
  B20: 'Sicilian Defense',
  B30: 'Sicilian Defense (Rossolimo)',
  B40: 'Sicilian Defense (Paulsen)',
  B50: 'Sicilian Defense',
  B90: 'Sicilian Najdorf',
  C00: 'French Defense',
  C11: 'French Defense (Classical)',
  C42: 'Petrov Defense',
  C45: 'Scotch Game',
  C50: 'Italian Game',
  C60: 'Ruy Lopez',
  C67: 'Ruy Lopez (Berlin)',
  C77: 'Ruy Lopez',
  C84: 'Ruy Lopez (Closed)',
  D02: "Queen's Pawn Game",
  D30: "Queen's Gambit Declined",
  D37: "Queen's Gambit Declined (Classical)",
  D50: "Queen's Gambit Declined",
  D55: "Queen's Gambit Declined",
  D70: 'Benoni Defense',
  D75: 'Benoni Defense',
  D85: 'Grunfeld Defense',
  E12: "Queen's Indian Defense",
  E60: "King's Indian Defense",
  E90: "King's Indian Defense",
};

/**
 * Identifies opening from first 15 PGN moves using hardcoded patterns.
 */
export function identifyOpeningFromMoves(pgn: string, _side: 'white' | 'black'): string {
  if (!pgn || pgn.trim().length === 0) return 'Unknown';

  const cleanPgn = pgn
    .replace(/\{.*?\}/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[?!+#]/g, '')
    .trim();

  const moves: string[] = [];
  const moveRegex = /\d+\.\s*([a-h1-8O-]+(?:\s+[a-h1-8O-]+)?)/g;
  let match;
  let moveCount = 0;

  while ((match = moveRegex.exec(cleanPgn)) !== null && moveCount < 15) {
    const movePair = match[1].trim().split(/\s+/);
    moves.push(...movePair.filter((m) => m && !m.match(/^\d+\.$/)));
    moveCount += movePair.length;
  }

  if (moves.length < 4) return 'Unknown';
  const nm = moves.map((m) => m.toLowerCase());

  // ── e4 openings ──
  if (nm[0] === 'e4') {
    if (nm[1] === 'e5') {
      if (nm.length > 2 && nm[2] === 'nf3') {
        if (nm.length > 3 && nm[3] === 'nc6') {
          if (nm.length > 4 && nm[4] === 'bb5') return 'Ruy Lopez';
          if (nm.length > 4 && nm[4] === 'bc4') return 'Italian Game';
          if (nm.length > 4 && (nm[4] === 'b5' || nm[4] === 'd4')) return 'Scotch Game';
          if (nm.length > 4 && nm[4] === 'nc3') return 'Three Knights Game';
          return 'Ruy Lopez';
        }
        if (nm.length > 3 && nm[3] === 'nf6') return 'Petrov Defense';
        if (nm.length > 3 && nm[3] === 'd6') return 'Philidor Defense';
        return "King's Knight Opening";
      }
      if (nm.length > 2 && nm[2] === 'bc4') return "Bishop's Opening";
      if (nm.length > 2 && nm[2] === 'nc3') return 'Vienna Game';
      if (nm.length > 2 && nm[2] === 'f4') return "King's Gambit";
      return "King's Pawn Game";
    }
    if (nm[1] === 'c5') return 'Sicilian Defense';
    if (nm[1] === 'c6') return 'Caro-Kann Defense';
    if (nm[1] === 'e6') return 'French Defense';
    if (nm[1] === 'd6') return 'Pirc Defense';
    if (nm[1] === 'd5') return 'Scandinavian Defense';
    if (nm[1] === 'g6') return 'Modern Defense';
    if (nm[1] === 'nf6') return 'Alekhine Defense';
    return 'Sicilian Defense'; // most common e4 response
  }

  // ── d4 openings ──
  if (nm[0] === 'd4') {
    if (nm[1] === 'nf6') {
      if (nm.length > 2 && nm[2] === 'c4') {
        if (nm.length > 3 && nm[3] === 'g6') return "King's Indian Defense";
        if (nm.length > 3 && nm[3] === 'e6') {
          if (nm.length > 5 && nm[5] === 'bb4') return 'Nimzo-Indian Defense';
          return 'Nimzo-Indian Defense';
        }
        if (nm.length > 3 && nm[3] === 'b6') return "Queen's Indian Defense";
        if (nm.length > 3 && nm[3] === 'c5') return 'Benoni Defense';
        if (nm.length >= 6) {
          if (nm.includes('g6')) return "King's Indian Defense";
          if (nm.includes('e6')) return 'Nimzo-Indian Defense';
          if (nm.includes('b6')) return "Queen's Indian Defense";
          return "King's Indian Defense";
        }
        return 'Indian Defense';
      }
      if (nm.length > 2 && nm[2] === 'nf3') {
        if (nm.length > 3 && nm[3] === 'g6') return "King's Indian Defense";
        if (nm.length > 3 && nm[3] === 'e6') return 'Nimzo-Indian Defense';
        if (nm.length > 3 && nm[3] === 'b6') return "Queen's Indian Defense";
        return "King's Indian Defense";
      }
      return "King's Indian Defense";
    }
    if (nm[1] === 'd5') {
      if (nm.length > 2 && nm[2] === 'c4') {
        if (nm.length > 3 && nm[3] === 'dxc4') return "Queen's Gambit Accepted";
        if (nm.length > 3 && nm[3] === 'e6') return "Queen's Gambit Declined";
        if (nm.length > 3 && nm[3] === 'c6') return 'Slav Defense';
        if (nm.length > 3 && nm[3] === 'nf6') return "Queen's Gambit Declined";
        return "Queen's Gambit Declined";
      }
      if (nm.length > 2 && nm[2] === 'nf3') return "Queen's Pawn Game";
      return "Queen's Pawn Game";
    }
    if (nm[1] === 'f5') return 'Dutch Defense';
    if (nm[1] === 'c5') return 'Benoni Defense';
    return "Queen's Pawn Opening";
  }

  // ── Flank openings ──
  if (nm[0] === 'c4') return 'English Opening';
  if (nm[0] === 'nf3') return 'Reti Opening';
  if (nm[0] === 'f4') return "Bird's Opening";
  if (nm[0] === 'b3') return 'Nimzo-Larsen Attack';
  if (nm[0] === 'g3') return "King's Indian Attack";
  if (nm[0] === 'b4') return 'Polish Opening';

  return 'Unknown';
}

/** ECO-to-name mapping for white games (more granular) */
export function identifyFromECOForWhite(eco: string): string {
  if (eco.includes('-')) eco = eco.split('-')[0].trim();
  const pre = eco.substring(0, 3);

  if (ECO_MAP[eco]) return ECO_MAP[eco];

  // B codes
  if (pre.match(/^B[2-9]\d$/)) return 'Sicilian Defense';
  if (pre.match(/^B1[2-9]$/)) return 'Caro-Kann Defense';
  if (pre.match(/^B0[7-9]$/)) return 'Pirc Defense';
  if (eco.startsWith('B01')) return 'Scandinavian Defense';
  if (eco.startsWith('B06')) return 'Modern Defense';
  if (pre.match(/^B0[2-5]$/)) return 'Alekhine Defense';

  // C codes
  if (pre.match(/^C[0-1]\d$/)) return 'French Defense';
  if (pre.match(/^C5[0-9]$/)) return 'Italian Game';
  if (pre.match(/^C[6-7]\d$/)) return 'Ruy Lopez';
  if (pre.match(/^C4[5-6]$/)) return 'Scotch Game';
  if (pre.match(/^C4[2-3]$/)) return 'Petrov Defense';
  if (pre.match(/^C[2-4]\d$/)) return "King's Pawn Game";

  // D codes
  if (pre.match(/^D0[0-9]$/)) return "Queen's Pawn Game";
  if (pre.match(/^D2[0-9]$/)) return "Queen's Gambit Accepted";
  if (pre.match(/^D1[0-9]$/)) return 'Slav Defense';
  if (pre.match(/^D[3-6]\d$/)) return "Queen's Gambit Declined";
  if (pre.match(/^D7\d$/)) return 'Benoni Defense';
  if (pre.match(/^D[8-9]\d$/)) return 'Grunfeld Defense';

  // E codes
  if (pre.match(/^E0[0-9]$/)) return 'Catalan Opening';
  if (pre.match(/^E1[0-9]$/)) return "Queen's Indian Defense";
  if (pre.match(/^E[2-5]\d$/)) return 'Nimzo-Indian Defense';
  if (pre.match(/^E[6-9]\d$/)) return "King's Indian Defense";

  return identifyFromECO(eco);
}

/** General ECO-to-name mapping */
export function identifyFromECO(eco: string): string {
  if (eco.includes('-')) eco = eco.split('-')[0].trim();
  const pre = eco.substring(0, 3);

  if (pre.match(/^B[2-9]\d$/)) return 'Sicilian Defense';
  if (pre.match(/^B1[2-9]$/)) return 'Caro-Kann Defense';
  if (pre.match(/^B0[7-9]$/)) return 'Pirc Defense';
  if (pre.startsWith('B01')) return 'Scandinavian Defense';
  if (pre.startsWith('B06')) return 'Modern Defense';
  if (pre.match(/^B0[2-5]$/)) return 'Alekhine Defense';

  if (pre.match(/^C[0-1]\d$/)) return 'French Defense';
  if (pre.match(/^C5[0-9]$/)) return 'Italian Game';
  if (pre.match(/^C[6-7]\d$/)) return 'Ruy Lopez';
  if (pre.match(/^C4[5-6]$/)) return 'Scotch Game';
  if (pre.match(/^C4[2-3]$/)) return 'Petrov Defense';
  if (pre.match(/^C[2-4]\d$/)) return "King's Pawn Game";

  if (pre.match(/^D0[0-9]$/)) return "Queen's Pawn Game";
  if (pre.match(/^D2[0-9]$/)) return "Queen's Gambit Accepted";
  if (pre.match(/^D1[0-9]$/)) return 'Slav Defense';
  if (pre.match(/^D[3-6]\d$/)) return "Queen's Gambit Declined";
  if (pre.match(/^D7\d$/)) return 'Benoni Defense';
  if (pre.match(/^D[8-9]\d$/)) return 'Grunfeld Defense';

  if (pre.match(/^E0[0-9]$/)) return 'Catalan Opening';
  if (pre.match(/^E1[0-9]$/)) return "Queen's Indian Defense";
  if (pre.match(/^E[2-5]\d$/)) return 'Nimzo-Indian Defense';
  if (pre.match(/^E[6-9]\d$/)) return "King's Indian Defense";

  if (ECO_MAP[eco]) return ECO_MAP[eco];

  const letter = eco[0];
  if (letter === 'A') {
    if (pre.startsWith('A00')) return 'Irregular Opening';
    if (pre.startsWith('A01')) return 'Nimzowitsch-Larsen Attack';
    if (pre.match(/^A0[2-3]$/)) return "Bird's Opening";
    if (pre.match(/^A0[4-6]$/) || pre.startsWith('A09')) return 'Reti Opening';
    if (pre.match(/^A0[7-8]$/)) return "King's Indian Attack";
    return 'Flank & Irregular Openings';
  }

  return 'Other Openings';
}

/**
 * Aggregate opening name for a game, using move-based + ECO-based classification.
 * Priority: Indian defense from moves → white ECO → general ECO → move-based → fallback.
 */
export function aggregateECO(eco: string, pgn?: string, side?: 'white' | 'black'): string {
  // Prefer move-based identification for Indian defenses (1.d4 Nf6)
  if (pgn && side) {
    const fromMoves = identifyOpeningFromMoves(pgn, side);
    if (fromMoves.includes('Indian') && fromMoves !== 'Unknown') return fromMoves;
  }

  // White-specific granular ECO
  if (side === 'white' && eco && eco !== 'Unknown') {
    const ecoBased = identifyFromECOForWhite(eco);
    if (ecoBased !== 'Other Openings' && ecoBased !== 'Unknown') return ecoBased;
  }

  // General ECO
  if (eco && eco !== 'Unknown') {
    const ecoBased = identifyFromECO(eco);
    if (
      ecoBased !== 'Other Openings' &&
      ecoBased !== 'Unknown' &&
      ecoBased !== "King's Pawn Game" &&
      ecoBased !== "Queen's Pawn Game" &&
      ecoBased !== "King's Pawn Opening" &&
      ecoBased !== "Queen's Pawn Opening"
    ) {
      return ecoBased;
    }
  }

  // Move-based fallback
  if (pgn && side) {
    const identified = identifyOpeningFromMoves(pgn, side);
    if (
      identified !== 'Unknown' &&
      identified !== "King's Pawn Game" &&
      identified !== "Queen's Pawn Game" &&
      identified !== "King's Pawn Opening" &&
      identified !== "Queen's Pawn Opening" &&
      identified !== "King's Knight Opening"
    ) {
      return identified;
    }
  }

  // Last resort ECO
  if (eco && eco !== 'Unknown') {
    const ecoBased = identifyFromECO(eco);
    if (ecoBased !== 'Other Openings' && ecoBased !== 'Unknown') return ecoBased;
  }

  // Last resort moves
  if (pgn && side) {
    const identified = identifyOpeningFromMoves(pgn, side);
    if (identified !== 'Unknown') return identified;
  }

  return 'Unknown';
}
