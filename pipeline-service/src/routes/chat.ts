/**
 * POST /api/chat — Follow-up chat about a scouting report.
 * Supports conversation history, memory, and tools (get_game, get_pgn, run_stockfish).
 */

import { Hono } from 'hono';
import { logger } from '../lib/logger.js';
import { getAccessToken, getVertexUrl, invalidateAccessTokenCache } from '../lib/vertexAuth.js';
import { validateChatRequest } from '../lib/validation.js';
import type { ChatContext } from '../lib/types.js';
import { getGame, getPgn, runStockfish, getOpeningBreakdown, lookupOpening } from '../lib/chatTools.js';

// Same models as identity (geminiFallback) and report generation (geminiReport)
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-001'] as const;
const GEMINI_TIMEOUT_MS = 90_000;
const MAX_TOOL_ROUNDS = 5;

/** Fall back to next model on 400/404/501/429 (model/request/rate-limit issues) or when error suggests model problem */
function shouldTryNextModel(status: number, errorText: string): boolean {
  if (status === 404 || status === 501 || status === 429) return true;
  if (status === 400) return true;
  if (/model|not found|unavailable|not supported|resource exhausted/i.test(errorText)) return true;
  return false;
}

/** Gemini function declarations for chat tools */
const CHAT_TOOLS = {
  functionDeclarations: [
    {
      name: 'get_game',
      description: 'Get metadata for a specific game by its 1-based index (e.g. Game 1 = first game). Use when the user asks about a particular game, wants to reference a game, or needs game details.',
      parameters: {
        type: 'object',
        properties: {
          gameIndex: {
            type: 'integer',
            description: '1-based game index (1 = first game, 2 = second game, etc.)',
          },
        },
        required: ['gameIndex'],
      },
    },
    {
      name: 'get_pgn',
      description: 'Get the full PGN (Portable Game Notation) for a specific game by its 1-based index. Use when the user wants to see the moves, analyze a game, or needs the complete game score.',
      parameters: {
        type: 'object',
        properties: {
          gameIndex: {
            type: 'integer',
            description: '1-based game index (1 = first game, 2 = second game, etc.)',
          },
        },
        required: ['gameIndex'],
      },
    },
    {
      name: 'run_stockfish',
      description: 'Run Stockfish engine analysis on a chess position given as FEN. Use when the user asks for engine evaluation, best move, or wants to analyze a specific position.',
      parameters: {
        type: 'object',
        properties: {
          fen: {
            type: 'string',
            description: 'FEN string of the position to analyze (e.g. "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1")',
          },
          depth: {
            type: 'integer',
            description: 'Search depth (default 14). Higher = more accurate but slower.',
          },
        },
        required: ['fen'],
      },
    },
    {
      name: 'get_opening_breakdown',
      description: 'Get performance breakdown by opponent response to an opening. Use when the user asks how the player performs against specific Black/White responses (e.g. "How does he do with the English vs 1...e5 vs 1...c5 vs 1...Nf6?"). Uses the ECO opening book to match games. Analyzes actual games to compute wins, draws, losses, and score % for each variation.',
      parameters: {
        type: 'object',
        properties: {
          moveSequence: {
            type: 'array',
            items: { type: 'string' },
            description: 'Opening moves played by the player, e.g. ["c4"] for 1.c4 (English), ["e4","c5"] for 1.e4 c5 (Sicilian as Black)',
          },
          side: {
            type: 'string',
            enum: ['white', 'black'],
            description: 'Which color the player has when playing this opening',
          },
        },
        required: ['moveSequence', 'side'],
      },
    },
    {
      name: 'lookup_opening',
      description: 'Look up an opening in the ECO opening book (12,000+ openings). Use when the user asks "what opening is 1.c4?", "what is the Sicilian?", "what ECO does the English have?", or similar. Cross-reference the book for accurate opening names and ECO codes.',
      parameters: {
        type: 'object',
        properties: {
          moveSequence: {
            type: 'array',
            items: { type: 'string' },
            description: 'Move sequence (e.g. ["c4","e5"] for 1.c4 e5)',
          },
          ecoCode: {
            type: 'string',
            description: 'ECO code (e.g. "B20" for Sicilian)',
          },
        },
      },
    },
  ],
};

export const chatRoute = new Hono();

/** Build system context from report (injected as first user message or system instruction) */
function buildSystemContext(report: ChatContext): string {
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

  const gamesInfo = report.games?.length
    ? `\n\nYou have access to ALL ${report.games.length} games. Use these tools:
- get_game, get_pgn: reference any game by 1-based index (1 to ${report.games.length})
- run_stockfish: engine analysis on FEN positions
- get_opening_breakdown: when the user asks about performance against specific opponent responses, use moveSequence and side. Uses the ECO opening book to match games.
- lookup_opening: when the user asks "what opening is X?", "what is the Sicilian?", or needs ECO/opening names, use this to query the ECO book (12,000+ openings).`
    : '';

  return `You are an expert chess analyst helping to understand ${playerName}'s repertoire.

⚠️ CRITICAL OPENING PER COLOR:
- "White Openings" = what ${playerName} PLAYS when they have the WHITE pieces (e.g. 1.e4, 1.c4, 1.d4). If they open with 1.c4 as White, that is the English Opening for them.
- "Black Defenses" = what they PLAY when they have the BLACK pieces (e.g. 1...e5, 1...c5, 1...Nf6). NEVER confuse White Openings with Black Defenses.

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
${gamesInfo}

Instructions:
1. Answer based on the data above. Use tools when relevant: get_game/get_pgn for specific games, run_stockfish for engine analysis, and get_opening_breakdown when the user asks about performance against specific opponent responses to an opening (e.g. English vs 1...e5 vs 1...c5 vs 1...Nf6).
2. Provide COMPREHENSIVE, DETAILED answers. Cite specific openings, lines, and game counts.
3. Statistical significance: Only use "often", "typically", "usually" when a pattern appears in 10+ games. For 1–2 games, say "played once/twice".
4. Use chess notation (e.g. 1.e4 c5 2.Nf3 d6) when discussing lines.
5. When referencing games, use the tools to fetch actual data—do not invent game numbers or PGNs.
6. FORMATTING: Do NOT use ** for bold. Use * only for bullet points. Plain text.`;
}

/** Build contents: conversation messages only (system context goes in systemInstruction) */
function buildContents(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content }] });
    } else {
      contents.push({ role: 'model', parts: [{ text: msg.content }] });
    }
  }
  return contents;
}

/** Execute a tool and return the result */
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  report: ChatContext,
): Promise<string> {
  switch (name) {
    case 'get_game': {
      const gameIndex = Number(args.gameIndex);
      if (!Number.isInteger(gameIndex) || gameIndex < 1) {
        return 'Error: gameIndex must be a positive integer.';
      }
      return getGame(report, gameIndex);
    }
    case 'get_pgn': {
      const gameIndex = Number(args.gameIndex);
      if (!Number.isInteger(gameIndex) || gameIndex < 1) {
        return 'Error: gameIndex must be a positive integer.';
      }
      return getPgn(report, gameIndex);
    }
    case 'run_stockfish': {
      const fen = String(args.fen ?? '').trim();
      const depth = typeof args.depth === 'number' ? Math.min(22, Math.max(1, args.depth)) : 14;
      return runStockfish(fen, depth);
    }
    case 'get_opening_breakdown': {
      const moveSequence = Array.isArray(args.moveSequence)
        ? (args.moveSequence as unknown[]).map((m) => String(m ?? '').trim()).filter(Boolean)
        : [];
      const side = String(args.side ?? '').toLowerCase();
      if (side !== 'white' && side !== 'black') {
        return 'Error: side must be "white" or "black".';
      }
      return getOpeningBreakdown(report, moveSequence, side);
    }
    case 'lookup_opening': {
      const moveSequence = Array.isArray(args.moveSequence)
        ? (args.moveSequence as unknown[]).map((m) => String(m ?? '').trim()).filter(Boolean)
        : undefined;
      const ecoCode = typeof args.ecoCode === 'string' ? args.ecoCode.trim() : undefined;
      return lookupOpening(moveSequence, ecoCode);
    }
    default:
      return `Error: Unknown tool "${name}".`;
  }
}

chatRoute.post('/chat', async (c) => {
  const requestId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  logger.info({ requestId }, '[Chat] Request received');

  let input: { report: ChatContext; messages?: Array<{ role: 'user' | 'assistant'; content: string }>; question?: string };
  try {
    const body = await c.req.json();
    input = validateChatRequest(body) as typeof input;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    logger.warn({ requestId, error: message }, '[Chat] Validation failed');
    return c.json({ error: message }, 400);
  }

  const report = input.report as ChatContext;

  // Build messages array: use history if provided, else single question
  let messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  if (input.messages && input.messages.length > 0) {
    messages = input.messages;
  } else if (input.question && input.question.trim()) {
    messages = [{ role: 'user', content: input.question.trim() }];
  } else {
    return c.json({ error: 'Either messages or question is required' }, 400);
  }

  // Exclude initial assistant greeting (frontend placeholder) — it confuses the model
  const apiMessages =
    messages.length > 0 && messages[0].role === 'assistant'
      ? messages.slice(1)
      : messages;

  if (apiMessages.length === 0) {
    logger.warn({ requestId }, '[Chat] No user messages after excluding greeting');
    return c.json({ error: 'At least one user message is required' }, 400);
  }

  logger.info(
    {
      requestId,
      messageCount: apiMessages.length,
      gamesCount: report.games?.length ?? 0,
      lastUserMessage: apiMessages.filter((m) => m.role === 'user').pop()?.content?.slice(0, 80),
    },
    '[Chat] Request validated',
  );

  const systemContext = buildSystemContext(report);
  const contents = buildContents(apiMessages);
  const requestBody: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: systemContext }] },
    contents,
    tools: [CHAT_TOOLS],
    generationConfig: {
      maxOutputTokens: 16384,
      temperature: 0.7,
    },
  };

  logger.debug(
    {
      requestId,
      contentTurns: contents.length,
      firstContentRole: contents[0]?.role,
      firstContentPreview: (JSON.stringify(contents[0]?.parts?.[0]) ?? '').slice(0, 150),
    },
    '[Chat] Request body prepared',
  );

  let lastError = '';
  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const model = GEMINI_MODELS[i];
    logger.info({ requestId, model }, '[Chat] Calling Gemini API');
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
          logger.warn({ requestId, authRetries: authRetries + 1, max: MAX_AUTH_RETRIES }, '[Chat] Auth token invalid (401), refreshing and retrying');
          invalidateAccessTokenCache();
          authRetries++;
          continue;
        }

        if (!res.ok) {
          const errorText = await res.text().catch(() => 'unable to read');
          lastError = `Vertex AI ${model}: ${res.status} - ${errorText.slice(0, 150)}`;
          logger.error({ requestId, model, status: res.status, errorText: errorText.slice(0, 300) }, '[Chat] Gemini API error');
          if (shouldTryNextModel(res.status, errorText) && i < GEMINI_MODELS.length - 1) {
            logger.warn({ requestId, model, nextModel: GEMINI_MODELS[i + 1] }, '[Chat] Model failed, trying next');
            break;
          }
          return c.json({ error: `AI service error: ${res.status}. ${errorText.slice(0, 100)}` }, 502);
        }
        break;
      }

      if (!res.ok) continue;

      let data = await res.json();
      let round = 0;

      // Tool-calling loop
      while (round < MAX_TOOL_ROUNDS) {
        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        let text = '';
        let functionCall: { name: string; args: Record<string, unknown> } | null = null;

        logger.debug(
          { requestId, round, partCount: parts.length, finishReason: candidate?.finishReason },
          '[Chat] Gemini response received',
        );

        for (const part of parts) {
          if (part.text) text += part.text;
          const fc = part.functionCall ?? part.function_call;
          if (fc) {
            functionCall = fc as { name: string; args: Record<string, unknown> };
          }
        }

        if (functionCall) {
          logger.info(
            { requestId, round, tool: functionCall.name, args: functionCall.args },
            '[Chat] Tool call requested',
          );
          const result = await executeTool(functionCall.name, functionCall.args, report);
          logger.info(
            { requestId, round, tool: functionCall.name, resultLength: result.length, resultPreview: result.slice(0, 120) },
            '[Chat] Tool executed',
          );
          // Append function call and response to contents, call model again
          contents.push({
            role: 'model',
            parts: [{ functionCall: { name: functionCall.name, args: functionCall.args } }],
          });
          contents.push({
            role: 'user',
            parts: [{ functionResponse: { name: functionCall.name, response: { result } } }],
          });
          requestBody.contents = contents;

          res = await fetch(getVertexUrl(model), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${await getAccessToken()}`,
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
          });

          if (!res.ok) {
            const errorText = await res.text().catch(() => '');
            lastError = `Vertex AI ${model}: ${res.status} - ${errorText.slice(0, 150)}`;
            logger.error({ requestId, model, status: res.status, errorText }, '[Chat] Tool-round API error');
            return c.json({ error: `AI service error: ${res.status}` }, 502);
          }
          data = await res.json();
          round++;
          continue;
        }

        if (!text) {
          logger.warn(
            { requestId, round, parts: JSON.stringify(parts).slice(0, 500), candidate: JSON.stringify(candidate).slice(0, 300) },
            '[Chat] AI returned empty text',
          );
          return c.json({ error: 'AI returned empty response' }, 502);
        }

        logger.info(
          { requestId, textLength: text.length, textPreview: text.slice(0, 150) },
          '[Chat] Final response ready',
        );
        text = text.replace(/\*\*/g, '');
        return c.json({ text });
      }

      logger.warn({ requestId, rounds: MAX_TOOL_ROUNDS }, '[Chat] Exceeded max tool rounds');
      return c.json({ error: 'AI exceeded maximum tool rounds' }, 502);
    } catch (err: unknown) {
      const errObj = err as { name?: string; message?: string };
      lastError = errObj.message ?? String(err);
      if (errObj.name === 'AbortError' || errObj.name === 'TimeoutError') {
        logger.warn({ requestId }, '[Chat] Request timed out');
        return c.json({ error: 'AI request timed out' }, 504);
      }
      if (i < GEMINI_MODELS.length - 1 && /404|501|model|not found/i.test(errObj.message ?? '')) {
        logger.warn({ requestId, model, err: errObj.message, nextModel: GEMINI_MODELS[i + 1] }, '[Chat] Model failed, trying next');
        continue;
      }
      logger.error({ requestId, model, err }, '[Chat] Error');
      return c.json({ error: `Chat request failed: ${lastError.slice(0, 100)}` }, 500);
    }
  }

  return c.json({ error: `AI service unavailable. Last error: ${lastError.slice(0, 150)}` }, 502);
});
