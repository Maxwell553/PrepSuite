/**
 * Gemini API caller for structured JSON report generation.
 * Uses Vertex AI with JSON schema mode, retries, and JSON repair.
 */

import { logger } from '../lib/logger.js';
import { getAccessToken, getVertexUrl } from '../lib/vertexAuth.js';
import { parseLLMJson } from '../lib/jsonRepair.js';
import type { ScoutingReport } from '../lib/types.js';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;

/**
 * Call Vertex AI Gemini with JSON schema mode to generate a scouting report.
 */
export async function generateReport(
  prompt: string,
  schema: Record<string, unknown>,
): Promise<ScoutingReport> {
  const geminiUrl = getVertexUrl(GEMINI_MODEL);

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
      throw new Error('Gemini API rate limited');
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'unable to read');
      logger.error(
        { status: res.status, errorText: errorText.slice(0, 300) },
        '[GeminiReport] API error',
      );
      throw new Error(`Gemini API error: ${res.status}`);
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
