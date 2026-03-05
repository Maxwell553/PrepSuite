import { logger } from '../lib/logger.js';
import { getAccessToken, getVertexUrl, invalidateAccessTokenCache } from '../lib/vertexAuth.js';
import { parseLLMJson } from '../lib/jsonRepair.js';

const GEMINI_MODEL_PRIMARY = 'gemini-3.1-flash-lite-preview';
const GEMINI_MODEL_FALLBACK = 'gemini-2.5-flash';
/** Username search model chain: flash-lite → 2.5-pro → 2.5-flash */
const GEMINI_SEARCH_MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
] as const;
const GEMINI_TIMEOUT_MS = 55000;
const MAX_RETRIES = 2;

function shouldFallbackTo25(status: number, errorText: string): boolean {
  if (status === 404) return true;
  if (status === 501) return true;
  if (status === 429) return true; // Resource exhausted — try fallback model
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
 * Tries gemini-3.1-flash-lite-preview first, falls back to gemini-2.5-flash if unavailable.
 * @param forceModel - When set, use only this model (e.g. for username search where Search must work)
 */
async function callGemini(
  prompt: string,
  useGoogleSearch: boolean,
  forceModel?: string,
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

  const modelsToTry = forceModel ? [forceModel] : [GEMINI_MODEL_PRIMARY, GEMINI_MODEL_FALLBACK];
  for (const model of modelsToTry) {
    const result = await callGeminiWithModel(requestBody, model);
    if (result !== null) return result;
    if (model === GEMINI_MODEL_PRIMARY) {
      logger.warn({ model: GEMINI_MODEL_PRIMARY }, '[GeminiFallback] Primary model failed, falling back to 2.5-flash');
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

      if (res.status === 401 && attempt < MAX_RETRIES) {
        logger.warn('[GeminiFallback] Auth token invalid (401), refreshing and retrying');
        invalidateAccessTokenCache();
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
  _fideId: string | null,
  _uscfId: string | null,
): Promise<GeminiUsernameResult> {
  // Chess.com and Lichess discovery: Vertex/Google Search only. Use gemini-2.5-flash to guarantee Search grounding.
  const prompts = [
    `Search the web for this chess player's Chess.com and Lichess profiles: "${playerName}".

You MUST use Google Search. Perform these searches:

CHESS.COM:
- "${playerName}" chess.com
- site:chess.com/member "${playerName}"
- site:chess.com/members "${playerName}"
- "${playerName}" chess.com profile bio about
Players often put their real name in their profile bio or "about" section. Look for profile pages where "${playerName}" appears in the bio, about, or status.

LICHESS:
- "${playerName}" lichess
- site:lichess.org "${playerName}"
- lichess.org/@ "${playerName}"
Extract usernames from profile URLs (chess.com/member/USERNAME, chess.com/members/USERNAME, lichess.org/@/USERNAME).

Return ONLY usernames found in search results. Do NOT guess.
Return JSON: {"chessComCandidates":["username1","username2"] or [],"lichessCandidates":["username1"] or []}.`,

    `Find Chess.com and Lichess usernames for chess player "${playerName}".
Search: "${playerName}" chess.com, "${playerName}" lichess, site:chess.com/members "${playerName}", site:lichess.org "${playerName}".
Look for profile bios and about sections containing "${playerName}". Extract usernames from URLs. Return JSON: {"chessComCandidates":[],"lichessCandidates":[]}.`,
  ];

  for (let attempt = 0; attempt < prompts.length; attempt++) {
    let text = '';
    for (let m = 0; m < GEMINI_SEARCH_MODELS.length; m++) {
      const model = GEMINI_SEARCH_MODELS[m];
      logger.info(
        { playerName, attempt: attempt + 1, model },
        '[GeminiFallback] Searching for Chess.com/Lichess usernames via Vertex + Google Search',
      );
      text = await callGemini(prompts[attempt], true, model);
      if (text) break;
      if (m < GEMINI_SEARCH_MODELS.length - 1) {
        logger.warn({ model, nextModel: GEMINI_SEARCH_MODELS[m + 1] }, '[GeminiFallback] Model returned empty, trying next');
      }
    }
    if (!text) {
      logger.warn({ playerName, attempt: attempt + 1 }, '[GeminiFallback] Username search returned empty');
      continue;
    }

    const parsed = parseLLMJson<{
      chessComCandidates?: string[];
      lichessCandidates?: string[];
    }>(text);

    if (!parsed) {
      logger.warn({ playerName, attempt: attempt + 1 }, '[GeminiFallback] Failed to parse username JSON');
      continue;
    }

    const chessCom = extractUsername(parsed.chessComCandidates || [], 'chess.com');
    const lichess = extractUsername(parsed.lichessCandidates || [], 'lichess');

    if (chessCom.length > 0 || lichess.length > 0) {
      logger.info(
        { playerName, chessComCount: chessCom.length, lichessCount: lichess.length, chessCom, lichess },
        '[GeminiFallback] Username candidates found',
      );
      return { chessComCandidates: chessCom, lichessCandidates: lichess };
    }
    if (attempt < prompts.length - 1) {
      logger.info('[GeminiFallback] No usernames found, retrying with alternate search prompt');
    }
  }

  logger.warn({ playerName }, '[GeminiFallback] No Chess.com or Lichess usernames found after all attempts');
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
