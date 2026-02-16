import { logger } from '../lib/logger.js';
import { getAccessToken, getVertexUrl } from '../lib/vertexAuth.js';
import { parseLLMJson } from '../lib/jsonRepair.js';

const GEMINI_MODEL_PRIMARY = 'gemini-3-flash-preview';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 55000;
const MAX_RETRIES = 2;

function shouldFallbackTo25(status: number, errorText: string): boolean {
  if (status === 404) return true;
  if (status === 501) return true;
  if (status === 400 && /model|not found|unavailable/i.test(errorText)) return true;
  return false;
}

interface GeminiIdResult {
  fideId: string | null;
  uscfId: string | null;
}

interface GeminiUsernameResult {
  chessComCandidates: string[];
  lichessCandidates: string[];
}

/**
 * Call Vertex AI Gemini with optional Google Search grounding.
 * Tries gemini-3 first, falls back to gemini-2.5-flash if the model is unavailable.
 */
async function callGemini(
  prompt: string,
  useGoogleSearch: boolean,
): Promise<string> {
  const optimizedPrompt = `You are a chess database search agent. You MUST use Google Search to find the requested information.
1. Perform the search(es) specified in the prompt below (use the exact site: queries it mentions)
2. Extract information from the search results - do NOT guess or infer from your training data
3. Return ONLY raw JSON. Do NOT wrap in \`\`\`json or markdown code blocks.

${prompt}`;

  const requestBody: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: optimizedPrompt }] }],
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.0,
    },
  };

  if (useGoogleSearch) {
    requestBody.tools = [{ googleSearch: {} }];
  }

  for (const model of [GEMINI_MODEL_PRIMARY, GEMINI_MODEL_FALLBACK]) {
    const result = await callGeminiWithModel(requestBody, model);
    if (result !== null) return result;
    if (model === GEMINI_MODEL_PRIMARY) {
      logger.warn({ model: GEMINI_MODEL_PRIMARY }, '[GeminiFallback] Primary model failed, falling back to 2.5');
    }
  }
  return '';
}

async function callGeminiWithModel(
  requestBody: Record<string, unknown>,
  model: string,
): Promise<string | null> {
  const geminiUrl = getVertexUrl(model);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const backoffMs = 2000 * attempt + Math.random() * 1000;
        logger.info({ attempt, backoffMs: Math.round(backoffMs) }, '[GeminiFallback] Retrying');
        await new Promise((r) => setTimeout(r, backoffMs));
      }

      const accessToken = await getAccessToken();

      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      });

      if (res.status === 503 && attempt < MAX_RETRIES) {
        logger.warn('[GeminiFallback] Model overloaded (503), retrying');
        continue;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'unable to read');
        logger.error({ status: res.status, errorText: errorText.slice(0, 200) }, '[GeminiFallback] API error');
        if (shouldFallbackTo25(res.status, errorText)) return null;
        return '';
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      for (const part of parts) {
        if (part.text) return part.text;
      }

      return candidate?.content?.text || data.text || '';
    } catch (err: unknown) {
      const errObj = err as { name?: string; message?: string };
      if (errObj.name === 'AbortError' || errObj.name === 'TimeoutError') {
        logger.warn('[GeminiFallback] Request timed out');
        return '';
      }
      if (attempt === MAX_RETRIES) {
        logger.error({ err }, '[GeminiFallback] All retries exhausted');
        return null;
      }
    }
  }

  return null;
}

/**
 * Search for FIDE/USCF IDs via Gemini with Google Search.
 * Optional excludeIds: when retrying after a wrong match, exclude these IDs from results.
 */
export async function searchIdsViaGemini(
  playerName: string,
  excludeIds?: { fideId?: string; uscfId?: string },
): Promise<GeminiIdResult> {
  const excludeNote = excludeIds
    ? `\nIMPORTANT: The previous search returned wrong results (different person). EXCLUDE FIDE ID ${excludeIds.fideId || 'N/A'} and USCF ID ${excludeIds.uscfId || 'N/A'} from your results. Return ONLY IDs where the profile name matches "${playerName}".`
    : '';

  const prompt = `You have to find the USCF and FIDE IDs of this chess player: "${playerName}". Search the web using ONLY these site-specific queries:
- site:ratings.fide.com "${playerName}"
- site:ratings.uschess.org "${playerName}"

CRITICAL: The profile name on the FIDE/USCF page MUST match "${playerName}". If you find a different person (e.g. "Max Turner" when searching for "Max Ingargiola"), do NOT return that ID - return null for that field instead.
Use age and rating to cross-reference and verify it's the correct player.${excludeNote}

Return ONLY raw JSON with no markdown or code blocks: {"fideId":number or null,"uscfId":number or null}`;

  logger.info({ playerName, excludeIds }, '[GeminiFallback] Searching for IDs');
  const text = await callGemini(prompt, true);

  if (!text) return { fideId: null, uscfId: null };

  const parsed = parseLLMJson<{ fideId?: number | string | null; uscfId?: number | string | null }>(text);
  if (!parsed) return { fideId: null, uscfId: null };

  return {
    fideId: parsed.fideId ? String(parsed.fideId) : null,
    uscfId: parsed.uscfId ? String(parsed.uscfId) : null,
  };
}

/**
 * Search for platform usernames via Gemini with Google Search.
 * Tries up to 2 times with different search strategies if first attempt returns empty.
 */
export async function searchUsernamesViaGemini(
  playerName: string,
  fideId: string | null,
  uscfId: string | null,
): Promise<GeminiUsernameResult> {
  const idContext = [
    fideId ? `FIDE ID: ${fideId}` : null,
    uscfId ? `USCF ID: ${uscfId}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const prompts = [
    `Search for this chess player's Chess.com and Lichess accounts: "${playerName}"${idContext ? ` (${idContext})` : ''}.

CHESS.COM: Use Google Search with these queries:
- site:chess.com/member "${playerName}"
- site:chess.com/player "${playerName}"
- site:chess.com/members "${playerName}"
Extract the username from profile URLs (chess.com/member/USERNAME, chess.com/player/USERNAME, or chess.com/members/USERNAME). Match by name, rating, and country.

LICHESS: Use Google Search with:
- site:lichess.org "@${playerName}"
- site:lichess.org "${playerName}"
Extract the username from lichess.org/@/USERNAME URLs.

Return ONLY usernames found in search results. Do NOT guess.
Return JSON: {"chessComCandidates":["username1","username2"] or [],"lichessCandidates":["username1"] or []}.`,

    `Find Chess.com and Lichess usernames for chess player "${playerName}"${idContext ? ` (${idContext})` : ''}.
Search: "chess.com ${playerName}" and "lichess ${playerName}" and "lichess.org ${playerName}".
Extract usernames from URLs. Return JSON: {"chessComCandidates":[],"lichessCandidates":[]}.`,
  ];

  for (let attempt = 0; attempt < prompts.length; attempt++) {
    logger.info({ playerName, attempt: attempt + 1 }, '[GeminiFallback] Searching for usernames');
    const text = await callGemini(prompts[attempt], true);

    if (!text) continue;

    const parsed = parseLLMJson<{
      chessComCandidates?: string[];
      lichessCandidates?: string[];
    }>(text);

    if (!parsed) continue;

    const chessCom = extractUsername(parsed.chessComCandidates || [], 'chess.com');
    const lichess = extractUsername(parsed.lichessCandidates || [], 'lichess');

    if (chessCom.length > 0 || lichess.length > 0) {
      return { chessComCandidates: chessCom, lichessCandidates: lichess };
    }
    if (attempt < prompts.length - 1) {
      logger.info('[GeminiFallback] No usernames found, retrying with alternate search');
    }
  }

  return { chessComCandidates: [], lichessCandidates: [] };
}

function extractUsername(items: string[], platform: 'chess.com' | 'lichess'): string[] {
  return items
    .map((item) => {
      if (platform === 'chess.com') {
        const urlMatch = item.match(/chess\.com\/(?:pub\/player|member|members|player|players)\/([a-z0-9_-]+)/i);
        if (urlMatch) return urlMatch[1];
      } else {
        const urlMatch = item.match(/lichess\.org\/@\/([a-z0-9_-]+)/i);
        if (urlMatch) return urlMatch[1];
      }
      if (!item.includes('http') && !item.includes('/')) return item;
      const parts = item.split('/');
      const last = parts[parts.length - 1];
      if (last && !last.includes('http') && last.length > 0) return last;
      return null;
    })
    .filter((u): u is string => u !== null && u.length > 0);
}
