/**
 * Gemini API caller for structured JSON report generation.
 * Uses Vertex AI with JSON schema mode, retries, and JSON repair.
 */

import { logger } from '../lib/logger.js';
import { getAccessToken, getVertexUrl, invalidateAccessTokenCache } from '../lib/vertexAuth.js';
import { parseLLMJson } from '../lib/jsonRepair.js';
import type { ScoutingReport } from '../lib/types.js';

const GEMINI_MODEL_PRIMARY = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK = 'gemini-2.0-flash-001';
// 4 min timeout: Vertex AI can be slow in production (cold starts, large prompts).
// Cloud Run request timeout is 300s; keep under that.
const GEMINI_TIMEOUT_MS = 240_000;
const MAX_RETRIES = 2;

/** Errors that indicate the model may not be available (try fallback) */
function shouldFallbackTo25(status: number, errorText: string): boolean {
  if (status === 404) return true;
  if (status === 501) return true;
  if (status === 429) return true; // Resource exhausted — try fallback model
  if (status === 400 && /model|not found|unavailable/i.test(errorText)) return true;
  return false;
}

/**
 * Call Vertex AI Gemini with JSON schema mode to generate a scouting report.
 * Tries gemini-2.5-flash first, falls back to gemini-2.0-flash-001 if unavailable.
 */
export async function generateReport(
  prompt: string,
  schema: Record<string, unknown>,
): Promise<ScoutingReport> {
  const models = [GEMINI_MODEL_PRIMARY, GEMINI_MODEL_FALLBACK];

  for (const model of models) {
    try {
      return await generateReportWithModel(prompt, schema, model);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = (err as { status?: number }).status;
      const errorText = (err as { errorText?: string }).errorText ?? msg;
      if (model === GEMINI_MODEL_PRIMARY && (status ? shouldFallbackTo25(status, errorText) : /404|501|model.*not found/i.test(msg))) {
        logger.warn({ model: GEMINI_MODEL_PRIMARY, err: msg }, '[GeminiReport] Primary model failed, falling back to 2.0');
        continue;
      }
      throw err;
    }
  }

  throw new Error('Gemini report generation failed');
}

async function generateReportWithModel(
  prompt: string,
  schema: Record<string, unknown>,
  model: string,
): Promise<ScoutingReport> {
  const geminiUrl = getVertexUrl(model);

  const requestBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 65536,
      temperature: 0.7,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoffMs = 5000 * attempt + Math.random() * 2000;
      logger.info({ attempt, backoffMs: Math.round(backoffMs) }, '[GeminiReport] Retrying');
      await new Promise((r) => setTimeout(r, backoffMs));
    }

    // Get a fresh token on each attempt (uses cache internally)
    const accessToken = await getAccessToken();

    let res: Response;
    try {
      res = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      });
    } catch (err: unknown) {
      const errObj = err as { name?: string; message?: string };
      if (errObj.name === 'AbortError' || errObj.name === 'TimeoutError') {
        logger.warn({ attempt }, '[GeminiReport] Request timed out');
        if (attempt < MAX_RETRIES) continue;
        throw new Error('Gemini report generation timed out');
      }
      if (attempt < MAX_RETRIES) continue;
      throw new Error(`Gemini API request failed: ${errObj.message}`);
    }

    if (res.status === 503 && attempt < MAX_RETRIES) {
      logger.warn('[GeminiReport] Model overloaded (503), retrying');
      continue;
    }

    if (res.status === 429) {
      logger.warn('[GeminiReport] Rate limited (429)');
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 10_000));
        continue;
      }
      const err = new Error('Gemini API rate limited') as Error & { status?: number; errorText?: string };
      err.status = 429;
      err.errorText = 'Resource exhausted';
      throw err;
    }

    if (res.status === 401 && attempt < MAX_RETRIES) {
      logger.warn('[GeminiReport] Auth token invalid (401), refreshing and retrying');
      invalidateAccessTokenCache();
      continue;
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'unable to read');
      logger.error(
        { status: res.status, errorText: errorText.slice(0, 300) },
        '[GeminiReport] API error',
      );
      const err = new Error(`Gemini API error: ${res.status}`) as Error & { status?: number; errorText?: string };
      err.status = res.status;
      err.errorText = errorText;
      throw err;
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];

    if (!candidate) {
      logger.error({ data: JSON.stringify(data).slice(0, 500) }, '[GeminiReport] No candidates');
      throw new Error('Gemini returned no candidates');
    }

    // Check for MAX_TOKENS truncation
    const finishReason = candidate.finishReason;
    const parts = candidate.content?.parts || [];
    let text = '';
    for (const part of parts) {
      if (part.text) text += part.text;
    }

    if (!text) {
      logger.warn({ finishReason }, '[GeminiReport] Empty response text');
      if (attempt < MAX_RETRIES) continue;
      throw new Error('Gemini returned empty response');
    }

    // Try direct JSON parse first
    try {
      return JSON.parse(text) as ScoutingReport;
    } catch {
      // If truncated (MAX_TOKENS), attempt JSON repair
      if (finishReason === 'MAX_TOKENS') {
        logger.warn('[GeminiReport] Response truncated (MAX_TOKENS), attempting repair');
      }
      const repaired = parseLLMJson<ScoutingReport>(text);
      if (repaired) {
        logger.info('[GeminiReport] JSON repair successful');
        return repaired;
      }
      logger.error(
        { textLength: text.length, finishReason },
        '[GeminiReport] Failed to parse response',
      );
      if (attempt < MAX_RETRIES) continue;
      throw new Error('Failed to parse Gemini report response');
    }
  }

  throw new Error('Gemini report generation failed after all retries');
}
