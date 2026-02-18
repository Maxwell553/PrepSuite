/**
 * POST /api/chat — Follow-up chat about a scouting report.
 * Calls Gemini via Vertex AI in plain text mode (no schema).
 */

import { Hono } from 'hono';
import { logger } from '../lib/logger.js';
import { getAccessToken, getVertexUrl, invalidateAccessTokenCache } from '../lib/vertexAuth.js';
import { validateChatRequest } from '../lib/validation.js';
import type { ChatContext } from '../lib/types.js';

// Same models as identity (geminiFallback) and report generation (geminiReport)
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-001'] as const;
const GEMINI_TIMEOUT_MS = 60_000;

/** Fall back to next model on 400/404/501/429 (model/request/rate-limit issues) or when error suggests model problem */
function shouldTryNextModel(status: number, errorText: string): boolean {
  if (status === 404 || status === 501 || status === 429) return true;
  if (status === 400) return true; // 400 often means model not available or invalid request for this model
  if (/model|not found|unavailable|not supported|resource exhausted/i.test(errorText)) return true;
  return false;
}

export const chatRoute = new Hono();

/** Build the chat prompt from report context + user question */
function buildChatPrompt(report: ChatContext, question: string): string {
  const playerName = report.player?.name || 'Unknown Player';

  const whiteOpenings =
    report.whiteOpenings
      ?.slice(0, 10)
      .map(
        (op) =>
          `${op.name} (${op.totalGames} games, ${(op.winRate * 100).toFixed(1)}% win rate)`,
      )
      .join('\n') || 'No white openings data available';

  const blackDefenses =
    report.blackDefenses
      ?.slice(0, 10)
      .map(
        (def) =>
          `${def.name} (${def.totalGames} games, ${(def.winRate * 100).toFixed(1)}% win rate)`,
      )
      .join('\n') || 'No black defenses data available';

  const mostPlayedWhite =
    report.mostPlayedLines?.white
      ?.slice(0, 5)
      .map(
        (line) =>
          `${line.moves.join(' ')} (${line.games} games, ${(line.frequency * 100).toFixed(1)}% frequency)`,
      )
      .join('\n') || 'No white lines data available';

  const mostPlayedBlack =
    report.mostPlayedLines?.black
      ?.slice(0, 5)
      .map(
        (line) =>
          `${line.moves.join(' ')} (${line.games} games, ${(line.frequency * 100).toFixed(1)}% frequency)`,
      )
      .join('\n') || 'No black lines data available';

  return `You are an expert chess analyst helping to understand ${playerName}'s repertoire.

⚠️ CRITICAL: "White Openings" = what ${playerName} PLAYS when they have the WHITE pieces. "Black Defenses" = what they PLAY when they have the BLACK pieces. NEVER confuse these. If asked "what do they play as Black?", answer from Black Defenses only. If asked "what do they play as White?", answer from White Openings only.

Player Information:
- Name: ${playerName}
- FIDE Rating: ${report.player?.currentRating != null && report.player.currentRating > 0 ? report.player.currentRating : 'Not found'}
- USCF Rating: ${report.player?.uscfRating != null && report.player.uscfRating > 0 ? report.player.uscfRating : 'Not found'}
- Country: ${report.player?.country || 'Unknown'}

White Openings (what ${playerName} plays when they have WHITE):
${whiteOpenings}

Black Defenses (what ${playerName} plays when they have BLACK):
${blackDefenses}

Most Played White Lines:
${mostPlayedWhite}

Most Played Black Lines:
${mostPlayedBlack}

Strategic Summary:
${report.preparationSummary || 'No summary available'}

Black Strategic Summary:
${report.blackStrategicSummary || 'No summary available'}

User Question: ${question}

Instructions:
1. Answer the user's question about ${playerName}'s repertoire based on the data provided above
2. ⚠️ CRITICAL: Provide a COMPREHENSIVE, DETAILED answer. Do NOT be brief or concise. Expand on your answer with:
   - Specific examples from the data
   - Detailed explanations of patterns
   - Context about when and how the player uses certain openings/lines
   - Comparisons between different options
   - Strategic implications
   - Any relevant nuances or details
3. Be specific and cite actual openings/lines when possible
4. ⚠️ CRITICAL STATISTICAL SIGNIFICANCE RULES:
   - NEVER use words like "often", "typically", "usually", "frequently", "tends to", "prefers" unless the pattern appears in 10+ games. Do NOT cite lines that "appeared twice" - that is not a pattern.
   - If a line appears in ONLY 1 game, say "played once" or "appeared in one game" - DO NOT say "often plays" or "typically plays"
   - If a line appears in 2 games, say "played twice" or "appeared in 2 games" - DO NOT generalize
   - Only use generalization language when a pattern appears in at least 5+ games
   - Always cite actual game counts: "played X times in Y games" or "appears in Z% of games"
5. If the player has played a specific line, mention the EXACT frequency and win rate (e.g., "played 8 times in 30 games, with a 62.5% win rate")
6. If the player hasn't played a specific line, say so explicitly and suggest what they actually play instead (with game counts)
7. Use chess notation (e.g., 1.e4 c5 2.Nf3 d6) when discussing specific lines
8. If asked about a specific position, analyze what the player actually plays from similar positions and cite how many times it appeared
9. Do NOT reference specific game numbers (e.g. "Game 19", "Games 4, 10, 11"). Describe aggregate patterns and trends instead.
9. FORMATTING: DO NOT use ** (double asterisks) for bold text. ONLY use * (single asterisk) at the beginning of bullet points or list items. Write all text in plain format without markdown bold formatting.
10. Provide a thorough, detailed response that fully addresses the user's question. Do not truncate or abbreviate your answer.

Answer:`;
}

chatRoute.post('/chat', async (c) => {
  let input;
  try {
    const body = await c.req.json();
    input = validateChatRequest(body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    return c.json({ error: message }, 400);
  }

  const prompt = buildChatPrompt(input.report as ChatContext, input.question);
  const requestBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 16384,
      temperature: 0.7,
    },
  };

  let lastError = '';
  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const model = GEMINI_MODELS[i];
    const MAX_AUTH_RETRIES = 2;
    let authRetries = 0;
    let res: Response;
    try {
      for (;;) {
        const geminiUrl = getVertexUrl(model);
        const accessToken = await getAccessToken();

        res = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        });

        if (res.status === 401 && authRetries < MAX_AUTH_RETRIES) {
          logger.warn({ authRetries: authRetries + 1, max: MAX_AUTH_RETRIES }, '[Chat] Auth token invalid (401), refreshing and retrying');
          invalidateAccessTokenCache();
          authRetries++;
          continue;
        }

        if (!res.ok) {
          const errorText = await res.text().catch(() => 'unable to read');
          lastError = `Vertex AI ${model}: ${res.status} - ${errorText.slice(0, 150)}`;
          logger.error({ model, status: res.status, errorText: errorText.slice(0, 300) }, '[Chat] Gemini API error');
          if (shouldTryNextModel(res.status, errorText) && i < GEMINI_MODELS.length - 1) {
            logger.warn({ model, nextModel: GEMINI_MODELS[i + 1] }, '[Chat] Model failed, trying next');
            break; // exit inner loop to try next model
          }
          return c.json({ error: `AI service error: ${res.status}. ${errorText.slice(0, 100)}` }, 502);
        }
        break; // success
      }

      if (!res.ok) continue; // try next model

      const data = await res.json();
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      let text = '';
      for (const part of parts) {
        if (part.text) text += part.text;
      }

      if (!text) {
        return c.json({ error: 'AI returned empty response' }, 502);
      }

      // Strip ** bold markdown from response
      text = text.replace(/\*\*/g, '');

      return c.json({ text });
    } catch (err: unknown) {
      const errObj = err as { name?: string; message?: string };
      lastError = errObj.message ?? String(err);
      if (errObj.name === 'AbortError' || errObj.name === 'TimeoutError') {
        logger.warn('[Chat] Request timed out');
        return c.json({ error: 'AI request timed out' }, 504);
      }
      if (i < GEMINI_MODELS.length - 1 && /404|501|model|not found/i.test(errObj.message ?? '')) {
        logger.warn({ model, err: errObj.message, nextModel: GEMINI_MODELS[i + 1] }, '[Chat] Model failed, trying next');
        continue;
      }
      logger.error({ model, err }, '[Chat] Error');
      return c.json({ error: `Chat request failed: ${lastError.slice(0, 100)}` }, 500);
    }
  }

  return c.json({ error: `AI service unavailable. Last error: ${lastError.slice(0, 150)}` }, 502);
});
