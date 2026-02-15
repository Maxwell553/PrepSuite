import { logger } from '../lib/logger.js';
import { getAccessToken, getVertexUrl } from '../lib/vertexAuth.js';
import { parseLLMJson } from '../lib/jsonRepair.js';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 55000;
const MAX_RETRIES = 2;

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

  const geminiUrl = getVertexUrl(GEMINI_MODEL);

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
        return '';
      }
    }
  }

  return '';
}

/**
 * Search for FIDE/USCF IDs via Gemini with Google Search.
 */
export async function searchIdsViaGemini(
  playerName: string,
): Promise<GeminiIdResult> {
  const prompt = `You have to find the USCF and FIDE IDs of this player: "${playerName}". Search the web using ONLY these site-specific queries:
- site:ratings.fide.com "${playerName}"
- site:ratings.uschess.org "${playerName}"

Find the FIDE/USCF IDs and use the age and rating of the player to cross reference and verify it's the correct player. Return ONLY raw JSON with no markdown or code blocks: {"fideId":number or null,"uscfId":number or null}`;

  logger.info({ playerName }, '[GeminiFallback] Searching for IDs');
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

  const prompt = `Search for this chess player's Chess.com and Lichess accounts: "${playerName}"${idContext ? ` (${idContext})` : ''}.

CHESS.COM: Use Google Search with site:chess.com/members. Find the player in question, then select the most fitting match (correct name, rating, country). Extract the username from the profile URL (chess.com/member/USERNAME or chess.com/player/USERNAME).

LICHESS: Use Google Search with site:lichess.org to find the player's profile. Extract the username from lichess.org/@/USERNAME URLs.

Do NOT guess or infer usernames from the name - only return usernames you found in actual search results.
Return JSON: {"chessComCandidates":["username or []"],"lichessCandidates":["username or []"]}. Use empty array [] if no account found for that platform.`;

  logger.info({ playerName }, '[GeminiFallback] Searching for usernames');
  const text = await callGemini(prompt, true);

  if (!text) return { chessComCandidates: [], lichessCandidates: [] };

  const parsed = parseLLMJson<{
    chessComCandidates?: string[];
    lichessCandidates?: string[];
  }>(text);

  if (!parsed) return { chessComCandidates: [], lichessCandidates: [] };

  // Extract usernames from URLs if Gemini returned full URLs
  const extractUsername = (items: string[], platform: 'chess.com' | 'lichess'): string[] => {
    return items
      .map((item) => {
        if (platform === 'chess.com') {
          const urlMatch = item.match(/chess\.com\/(?:pub\/player|member|player|players)\/([a-z0-9_-]+)/i);
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
  };

  return {
    chessComCandidates: extractUsername(parsed.chessComCandidates || [], 'chess.com'),
    lichessCandidates: extractUsername(parsed.lichessCandidates || [], 'lichess'),
  };
}
