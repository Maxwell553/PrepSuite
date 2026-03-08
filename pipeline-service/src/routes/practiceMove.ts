/**
 * POST /api/practice-move — Get AI move that mimics opponent's playing style.
 * Premium feature: uses report data to suggest moves fitting the opponent's repertoire.
 */

import { Hono } from 'hono';
import { Chess } from 'chess.js';
import { logger } from '../lib/logger.js';
import { getAccessToken, getVertexUrl } from '../lib/vertexAuth.js';
import type { OpeningStat } from '../lib/types.js';

interface PracticeReport {
  player?: { name?: string };
  strategicSummary?: string;
  whiteOpenings?: OpeningStat[];
  blackDefenses?: OpeningStat[];
  weaknesses?: string[];
  tacticalRecommendation?: string;
}

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 15_000;

export const practiceMoveRoute = new Hono();

practiceMoveRoute.post('/practice-move', async (c) => {
  const isPremium = c.req.header('X-Premium') === 'true';
  if (!isPremium) {
    return c.json({ error: 'Practice opponent is a Premium feature' }, 403);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { report, fen, side } = body as {
    report?: PracticeReport;
    fen?: string;
    side?: 'white' | 'black';
  };

  if (!report || !fen || !side) {
    return c.json({ error: 'report, fen, and side are required' }, 400);
  }

  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return c.json({ error: 'Invalid FEN' }, 400);
  }

  const toMove = chess.turn();
  const sideToMove = toMove === 'w' ? 'white' : 'black';
  if (sideToMove !== side) {
    return c.json({ error: `It is ${sideToMove}'s turn, not ${side}'s` }, 400);
  }

  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return c.json({ error: 'No legal moves' }, 400);
  }

  const summary = report.strategicSummary || '';
  const whiteOps = (report.whiteOpenings || []).slice(0, 5).map((o: { name?: string }) => o.name).join(', ');
  const blackOps = (report.blackDefenses || []).slice(0, 5).map((o: { name?: string }) => o.name).join(', ');
  const weaknesses = (report.weaknesses || []).join('; ');
  const recommendation = report.tacticalRecommendation || '';

  const prompt = `You are simulating a chess opponent named "${report.player?.name || 'Opponent'}". Your task is to suggest ONE move that this opponent would likely play based on their repertoire and style.

OPPONENT PROFILE:
- Strategic summary: ${summary}
- White openings: ${whiteOps}
- Black defenses: ${blackOps}
- Weaknesses: ${weaknesses}
- Tactical recommendation: ${recommendation}

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

    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const moveText = text.replace(/[^a-h0-8]/g, '').slice(0, 4);
    if (moveText.length < 4) {
      const fallback = moves[0];
      return c.json({ move: fallback.from + fallback.to, san: fallback.san });
    }

    const from = moveText.slice(0, 2);
    const to = moveText.slice(2, 4);
    const move = chess.moves({ verbose: true }).find((m) => m.from === from && m.to === to);
    if (move) {
      chess.move(move);
      return c.json({ move: from + to, san: move.san });
    }
  } catch (err) {
    logger.warn({ err }, '[PracticeMove] Fallback to first legal move');
  }

  const fallback = moves[0];
  return c.json({ move: fallback.from + fallback.to, san: fallback.san });
});
