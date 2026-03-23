/**
 * POST /api/support-chat — General support chatbot for bug reports, feature requests,
 * and questions about PrepSuite. Uses Gemini with no report context.
 */

import { Hono } from 'hono';
import { logger } from '../lib/logger.js';
import { SSEStream } from '../lib/sse.js';
import { chatRateLimitMiddleware } from '../middleware/rateLimit.js';
import { getAccessToken, getVertexUrl, invalidateAccessTokenCache } from '../lib/vertexAuth.js';
import { z } from 'zod';

const GEMINI_MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash',
] as const;
const GEMINI_TIMEOUT_MS = 60_000;

const supportChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().max(4000),
      category: z.enum(['question', 'bug', 'feature']).optional(),
    })
  ).min(1),
  /** Category for the current user message (question, bug, feature) */
  category: z.enum(['question', 'bug', 'feature']).optional(),
});

const SUPPORT_SYSTEM_PROMPT = `You are a friendly support assistant for PrepSuite, a chess scouting platform that helps players prepare for opponents.

PrepSuite features:
- Search for opponents by name and optionally Chess.com username or Lichess username
- Generates AI-powered scouting reports with opening repertoires, game analysis, and strategic insights
- Uses Stockfish engine for position analysis
- Integrates with Chess.com, Lichess, FIDE, and USCF data sources
- Users can save reports to their history and chat with an AI about specific reports

/* MONETIZATION_DISABLED: Billing info commented out for deployment
Billing: PrepSuite uses a credit system. You are charged 1 credit per 5 games analyzed...
*/

IMPORTANT - When users ask why they can't find online games and haven't entered a Chess.com or Lichess username:
PrepSuite needs the player's platform username to fetch online games. If the user searched by name only and no online games appear, the most common reason is that the player has not put their real name in their profile bio on Chess.com or Lichess—PrepSuite matches the player's name to the bio to find their account. Ask if they can manually provide the player's Chess.com or Lichess username; they can add it to the search form to fetch online games.

Your role:
1. **Bug reports**: Acknowledge the issue, ask for details if helpful (browser, steps to reproduce), and thank the user. Be empathetic.
2. **Feature requests**: Thank them for the idea, briefly acknowledge how it could help, and note that the team will consider it.
3. **Questions about the site**: Answer based on the features above. Be concise and helpful. If unsure, suggest they reach out via the support channels.
4. Keep responses friendly, concise, and professional. Use plain text (no markdown bold).`;

function buildSystemPrompt(category?: 'question' | 'bug' | 'feature'): string {
  if (!category) return SUPPORT_SYSTEM_PROMPT;
  const hints: Record<string, string> = {
    question: '\n\n[Current context: The user is asking a question about PrepSuite.]',
    bug: '\n\n[Current context: The user is reporting a bug. Acknowledge it, ask for details if needed, and thank them.]',
    feature: '\n\n[Current context: The user is requesting a feature. Thank them and note the team will consider it.]',
  };
  return SUPPORT_SYSTEM_PROMPT + (hints[category] ?? '');
}

export const supportChatRoute = new Hono();

function buildContents(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content }] });
    } else {
      contents.push({ role: 'model', parts: [{ text: msg.content }] });
    }
  }
  return contents;
}

supportChatRoute.post('/support-chat', chatRateLimitMiddleware, async (c) => {
  const requestId = `support-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  logger.info({ requestId }, '[SupportChat] Request received');

  let input: { messages: Array<{ role: 'user' | 'assistant'; content: string; category?: string }>; category?: string };
  try {
    const body = await c.req.json();
    input = supportChatRequestSchema.parse(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    logger.warn({ requestId, error: message }, '[SupportChat] Validation failed');
    return c.json({ error: message }, 400);
  }

  const messages = input.messages;
  const apiMessages =
    messages.length > 0 && messages[0].role === 'assistant'
      ? messages.slice(1)
      : messages;

  if (apiMessages.length === 0 || apiMessages.every((m) => m.role !== 'user')) {
    return c.json({ error: 'At least one user message is required' }, 400);
  }

  const contents = buildContents(apiMessages);
  const category = input.category as 'question' | 'bug' | 'feature' | undefined;
  const requestBody = {
    systemInstruction: { parts: [{ text: buildSystemPrompt(category) }] },
    contents,
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.7,
    },
  };

  const sse = new SSEStream();

  void (async () => {
    try {
      let lastError = '';
      for (let i = 0; i < GEMINI_MODELS.length; i++) {
        const model = GEMINI_MODELS[i];
        logger.info({ requestId, model }, '[SupportChat] Calling Gemini');

        try {
          const geminiUrl = getVertexUrl(model);
          const accessToken = await getAccessToken();

          const res = await fetch(geminiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
          });

          if (res.status === 401) {
            invalidateAccessTokenCache();
            throw new Error('Auth token invalid');
          }

          if (!res.ok) {
            const errorText = await res.text().catch(() => '');
            lastError = `${model}: ${res.status} - ${errorText.slice(0, 150)}`;
            logger.error({ requestId, model, status: res.status }, '[SupportChat] API error');
            if (i < GEMINI_MODELS.length - 1) continue;
            sse.sendError({ error: `AI service error: ${res.status}` });
            return;
          }

          const data = (await res.json()) as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> };
              finishReason?: string;
            }>;
          };
          const candidate = data.candidates?.[0];
          const text = candidate?.content?.parts?.[0]?.text ?? '';

          // If blocked by safety filter, return a friendly message instead of error
          if (!text && candidate?.finishReason === 'SAFETY') {
            sse.sendEvent('chat_text', {
              text: "I couldn't generate a response for that. Please rephrase your message or try a different question.",
            });
            return;
          }

          if (!text) {
            sse.sendError({ error: 'AI returned empty response' });
            return;
          }

          sse.sendEvent('chat_text', { text: text.replace(/\*\*/g, '') });
          return;
        } catch (err) {
          const errObj = err as { name?: string; message?: string };
          lastError = errObj.message ?? String(err);
          if (errObj.name === 'AbortError' || errObj.name === 'TimeoutError') {
            sse.sendError({ error: 'Request timed out' });
            return;
          }
          if (i < GEMINI_MODELS.length - 1) continue;
          logger.error({ requestId, err }, '[SupportChat] Error');
          sse.sendError({ error: `Support chat failed: ${lastError.slice(0, 100)}` });
          return;
        }
      }

      sse.sendError({ error: `AI unavailable. ${lastError.slice(0, 150)}` });
    } catch (unexpected: unknown) {
      logger.error({ requestId, err: unexpected }, '[SupportChat] Unexpected error');
      sse.sendError({ error: 'Support chat failed unexpectedly' });
    } finally {
      sse.close();
    }
  })().catch((err) => {
    logger.error({ requestId, err }, '[SupportChat] Promise rejection');
    sse.sendError({ error: 'Support chat failed unexpectedly' });
    void sse.close();
  });

  return sse.response();
});
