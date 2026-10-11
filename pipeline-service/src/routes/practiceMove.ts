import {chatRateLimitMiddleware} from '../middleware/rateLimit.js';
/**
 * POST /api/practice-move — Rehearse known repertoire, then continue with Stockfish.
 * Premium feature: uses report data to suggest moves fitting the opponent's repertoire.
 */

import { Hono } from 'hono';
import { Chess } from 'chess.js';
import { logger } from '../lib/logger.js';
import { evaluateFen } from '../lib/stockfishEval.js';
import type { OpeningStat } from '../lib/types.js';

interface MoveSequence {
  moves?: string[];
  notation?: string;
  frequency?: number;
  games?: number;
}

interface PracticeReport {
  player?: { name?: string; currentRating?: number; uscfRating?: number };
  strategicSummary?: string;
  whiteOpenings?: OpeningStat[];
  blackDefenses?: OpeningStat[];
  weaknesses?: string[];
  tacticalRecommendation?: string;
  mostPlayedLines?: { white?: MoveSequence[]; black?: MoveSequence[] };
}


/** Normalize SAN for comparison: castling 0-0↔O-O, strip annotations, lowercase */
function normalizeSan(s: string): string {
  return s
    .replace(/[?!+#]$/, '')
    .replace(/^0-0$/, 'O-O')
    .replace(/^0-0-0$/, 'O-O-O')
    .toLowerCase();
}

/** Parse notation "1. e4 e5 2. Nf3" or "1.e4 e5 2.Nf3" to ["e4", "e5", "Nf3"] */
function notationToMoves(notation: string): string[] {
  if (!notation || !notation.trim()) return [];
  return notation
    .replace(/\d+\.\s*/g, ' ')
    .split(/\s+/)
    .map((s) => s.replace(/[?!+#]$/, '').replace(/^0-0$/, 'O-O').replace(/^0-0-0$/, 'O-O-O').trim())
    .filter((s) => s.length >= 2 && (s === 'O-O' || s === 'O-O-O' || s === '0-0' || s === '0-0-0' || /[a-h][1-8]/.test(s) || /[NBRQK]/.test(s)));
}

/** Try to find a move from repertoire that continues a matching line. Returns the move if found. */
function tryRepertoireMove(
  chess: Chess,
  lines: MoveSequence[],
  history: string[],
  side: 'white' | 'black',
): { from: string; to: string; san: string; promotion?: string } | null {
  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0) return null;

  // Sort by games (most played first), then by frequency
  const sorted = [...lines].sort((a, b) => {
    const gamesA = a.games ?? 0;
    const gamesB = b.games ?? 0;
    if (gamesB !== gamesA) return gamesB - gamesA;
    return (b.frequency ?? 0) - (a.frequency ?? 0);
  });

  const hNorm = history.map(normalizeSan);
  logger.info(
    { historyNorm: hNorm.join(' '), linesCount: sorted.length },
    '[PracticeMove] Trying repertoire match',
  );

  let firstMismatch: { linePreview: string; mismatchAt: number; historyAt: string; lineAt: string } | null = null;

  for (let idx = 0; idx < sorted.length; idx++) {
    const seq = sorted[idx];
    let lineMoves: string[];
    if (seq.notation) {
      lineMoves = notationToMoves(seq.notation);
    } else if (Array.isArray(seq.moves) && seq.moves.length > 0) {
      const first = seq.moves[0];
      lineMoves = typeof first === 'string' && first.includes('.') ? notationToMoves(first) : seq.moves as string[];
    } else {
      continue;
    }
    if (lineMoves.length <= history.length) continue;

    // Check if history matches the start of this line (normalize castling, annotations, case)
    const lNorm = lineMoves.map(normalizeSan);
    let match = true;
    let mismatchAt = -1;
    for (let i = 0; i < hNorm.length; i++) {
      if (hNorm[i] !== lNorm[i]) {
        match = false;
        mismatchAt = i;
        break;
      }
    }
    if (!match) {
      if (!firstMismatch) {
        firstMismatch = {
          linePreview: lNorm.slice(0, 8).join(' '),
          mismatchAt,
          historyAt: hNorm[mismatchAt] ?? '(none)',
          lineAt: lNorm[mismatchAt] ?? '(none)',
        };
      }
      continue;
    }

    // Next move in line is our candidate
    const nextSan = lineMoves[history.length];
    if (!nextSan) continue;

    // Try exact SAN match first
    let move = legalMoves.find(
      (m) => normalizeSan(m.san) === normalizeSan(nextSan)
    );
    // Fallback: chess.js accepts SAN with different disambiguation (e.g. Nd2 vs Nbd2)
    if (!move) {
      try {
        const played = chess.move(nextSan);
        if (played) {
          move = played;
          chess.undo();
        }
      } catch {
        // nextSan not legal in this position
      }
    }
    if (move) {
      logger.info({ nextSan }, '[PracticeMove] Using repertoire move');
      return { from: move.from, to: move.to, san: move.san, promotion: move.promotion };
    }
  }

  if (firstMismatch) {
    logger.info(
      firstMismatch,
      '[PracticeMove] Repertoire: first line mismatch (history vs line differ at move index)',
    );
  }
  return null;
}

export const practiceMoveRoute = new Hono();

practiceMoveRoute.post('/practice-move', chatRateLimitMiddleware, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { report, fen, side, moveHistory } = body as {
    report?: PracticeReport;
    fen?: string;
    side?: 'white' | 'black';
    moveHistory?: string[];
  };

  if (!report || !fen || !side) {
    return c.json({ error: 'report, fen, and side are required' }, 400);
  }

  const history = Array.isArray(moveHistory) ? moveHistory : [];

  logger.info(
    {
      side,
      historyLength: history.length,
      history: history.slice(0, 12).join(' '),
      hasMostPlayedLines: !!(report.mostPlayedLines?.white || report.mostPlayedLines?.black),
      whiteLines: report.mostPlayedLines?.white?.length ?? 0,
      blackLines: report.mostPlayedLines?.black?.length ?? 0,
    },
    '[PracticeMove] Request received',
  );

  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    logger.warn({ fen }, '[PracticeMove] Invalid FEN');
    return c.json({ error: 'Invalid FEN' }, 400);
  }

  const toMove = chess.turn();
  const sideToMove = toMove === 'w' ? 'white' : 'black';
  if (sideToMove !== side) {
    logger.warn({ sideToMove, side }, '[PracticeMove] Turn mismatch');
    return c.json({ error: `It is ${sideToMove}'s turn, not ${side}'s` }, 400);
  }

  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return c.json({ error: 'No legal moves' }, 400);
  }

  // 1. Repertoire-first: use most-played lines (by frequency/games) until no matching line
  const linesForSide = side === 'white' ? (report.mostPlayedLines?.white || []) : (report.mostPlayedLines?.black || []);
  const repertoireMove = linesForSide.length > 0 ? tryRepertoireMove(chess, linesForSide, history, side) : null;
  if (repertoireMove) {
    return c.json({ move: repertoireMove.from + repertoireMove.to + (repertoireMove.promotion || ''), san: repertoireMove.san, source: 'repertoire' });
  }

  logger.info(
    { side, historyLength: history.length, linesChecked: linesForSide.length },
    '[PracticeMove] No repertoire match, falling back to Stockfish',
  );

  // 2. No repertoire match: play at FIDE rating level via Stockfish (depth scales with rating)
  const rating = report.player?.currentRating ?? report.player?.uscfRating ?? 0;
  const stockfishDepth = rating > 0
    ? Math.max(5, Math.min(18, Math.round((rating - 800) / 120) + 6))
    : 10;
  logger.info({ rating, stockfishDepth }, '[PracticeMove] Calling Stockfish');
  try {
    const sfResult = await evaluateFen(chess.fen(), stockfishDepth);
    logger.info(
      { bestMove: sfResult?.bestMove ?? null, hasResult: !!sfResult },
      '[PracticeMove] Stockfish result',
    );
    if (sfResult?.bestMove) {
      const from = sfResult.bestMove.slice(0, 2);
      const to = sfResult.bestMove.slice(2, 4);
      const promo = sfResult.bestMove.length >= 5 ? sfResult.bestMove[4].toLowerCase() : undefined;
      const move = chess.moves({ verbose: true }).find(
        (m) => m.from === from && m.to === to && (!promo || m.promotion === promo)
      );
      if (move) {
        logger.info({ rating, stockfishDepth, bestMove: sfResult.bestMove }, '[PracticeMove] Using Stockfish (repertoire exhausted)');
        return c.json({ move: from + to + (move.promotion || ''), san: move.san, source: 'engine' });
      }
      logger.warn({ bestMove: sfResult.bestMove }, '[PracticeMove] Stockfish bestMove not in legal moves');
    } else {
      logger.warn('[PracticeMove] Stockfish returned no bestMove');
    }
  } catch (err) {
    logger.warn({ err, message: err instanceof Error ? err.message : String(err) }, '[PracticeMove] Stockfish failed');
  }

  return c.json({error: 'The practice engine is temporarily unavailable. Please retry.'},503);
});
