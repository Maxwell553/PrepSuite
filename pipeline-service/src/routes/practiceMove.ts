/**
 * POST /api/practice-move — Get AI move that mimics opponent's playing style.
 * Premium feature: uses report data to suggest moves fitting the opponent's repertoire.
 */

import { Hono } from 'hono';
import { Chess } from 'chess.js';
import { logger } from '../lib/logger.js';
import { getAccessToken, getVertexUrl } from '../lib/vertexAuth.js';
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

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 15_000;

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
): { from: string; to: string; san: string } | null {
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
      return { from: move.from, to: move.to, san: move.san };
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

practiceMoveRoute.post('/practice-move', async (c) => {
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
    return c.json({ move: repertoireMove.from + repertoireMove.to, san: repertoireMove.san });
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
        return c.json({ move: from + to, san: move.san });
      }
      logger.warn({ bestMove: sfResult.bestMove }, '[PracticeMove] Stockfish bestMove not in legal moves');
    } else {
      logger.warn('[PracticeMove] Stockfish returned no bestMove');
    }
  } catch (err) {
    logger.warn({ err, message: err instanceof Error ? err.message : String(err) }, '[PracticeMove] Stockfish failed');
  }

  const summary = report.strategicSummary || '';
  const whiteOps = (report.whiteOpenings || []).slice(0, 5).map((o: { name?: string }) => o.name).join(', ');
  const blackOps = (report.blackDefenses || []).slice(0, 5).map((o: { name?: string }) => o.name).join(', ');
  const weaknesses = (report.weaknesses || []).join('; ');
  const recommendation = report.tacticalRecommendation || '';
  // Format most-played lines for the prompt (reuse linesForSide from above)
  const linesText = linesForSide
    .slice(0, 8)
    .map((seq: MoveSequence) => seq.notation || (seq.moves || []).join(' '))
    .filter(Boolean)
    .join('\n  - ');

  logger.info('[PracticeMove] Falling back to Gemini');

  const prompt = `You are simulating a chess opponent named "${report.player?.name || 'Opponent'}" (approx ${rating} Elo). Choose the ONE move they would most likely play based on their repertoire, most-played lines, and style.

OPPONENT PROFILE:
- Strategic summary: ${summary}
- White openings: ${whiteOps}
- Black defenses: ${blackOps}
- Weaknesses: ${weaknesses}
- Tactical recommendation: ${recommendation}

MOST-PLAYED LINES (as ${side}):
${linesText ? `  - ${linesText}` : '  (none)'}

PRIORITY: Prefer moves that continue or transpose into these lines. Match their opening choices and typical responses. Play at a level consistent with their rating.

CURRENT POSITION (FEN): ${fen}
It is ${side}'s turn to move.

Respond with ONLY the move in UCI format (e.g. e2e4, g8f6, e7e5). No explanation. One move only.`;

  try {
    const token = await getAccessToken();
    const url = getVertexUrl(GEMINI_MODEL);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 10,
          temperature: 0.3,
        },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.warn({ status: res.status, errText }, '[PracticeMove] Gemini failed');
      throw new Error(`Gemini error: ${res.status}`);
    }

    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    let text = '';
    for (const part of parts) {
      if (part.text) text += part.text;
    }
    text = text.trim();
    // Extract UCI move (e.g. e7e5 or e7e8q) - allow promotion suffix
    const moveMatch = text.match(/[a-h][1-8][a-h][1-8][qrbn]?/);
    const moveText = moveMatch ? moveMatch[0] : text.replace(/[^a-h0-8qrbn]/gi, '').slice(0, 5);
    logger.info(
      { rawText: text?.slice(0, 80), moveText, len: moveText.length, finishReason: candidate?.finishReason },
      '[PracticeMove] Gemini response',
    );
    if (moveText.length < 4) {
      logger.warn(
        { rawText: text, partsCount: parts.length, candidate: JSON.stringify(candidate).slice(0, 200) },
        '[PracticeMove] Gemini response too short or no move found, using first legal move',
      );
      const fallback = moves[0];
      return c.json({ move: fallback.from + fallback.to, san: fallback.san });
    }

    const from = moveText.slice(0, 2);
    const to = moveText.slice(2, 4);
    const promo = moveText.length >= 5 ? moveText[4].toLowerCase() : undefined;
    const move = chess.moves({ verbose: true }).find(
      (m) => m.from === from && m.to === to && (!promo || m.promotion === promo)
    );
    if (move) {
      logger.info({ move: from + to, san: move.san }, '[PracticeMove] Using Gemini move');
      return c.json({ move: from + to, san: move.san });
    }
    logger.warn({ moveText, from, to }, '[PracticeMove] Gemini move not legal');
  } catch (err) {
    logger.warn({ err, message: err instanceof Error ? err.message : String(err) }, '[PracticeMove] Gemini failed');
  }

  const fallback = moves[0];
  logger.info({ fallbackMove: fallback.from + fallback.to, san: fallback.san }, '[PracticeMove] Using first legal move (all methods exhausted)');
  return c.json({ move: fallback.from + fallback.to, san: fallback.san });
});
