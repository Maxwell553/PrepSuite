/**
 * Gemini API caller for structured JSON report generation.
 * Uses Vertex AI with JSON schema mode, retries, and JSON repair.
 * Supports parallel generation (4 prompts in parallel) for faster reports.
 */

import { logger } from '../lib/logger.js';
import { getAccessToken, getVertexUrl, invalidateAccessTokenCache } from '../lib/vertexAuth.js';
import { parseLLMJson } from '../lib/jsonRepair.js';
import type { ScoutingReport } from '../lib/types.js';
import { buildReportPromptsParallel, reportPartialSchemas } from './promptBuilder.js';
import type { BuildReportPromptOpts } from './promptBuilder.js';

/** Analysis model chain: Pro → Flash-Lite → 2.5 Pro → 2.5 Flash */
const GEMINI_ANALYSIS_MODELS = [
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
] as const;
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
 * Model chain: 3.1-pro → flash-lite → 2.5-pro → 2.5-flash.
 */
export async function generateReport(
  prompt: string,
  schema: Record<string, unknown>,
): Promise<ScoutingReport> {
  for (let i = 0; i < GEMINI_ANALYSIS_MODELS.length; i++) {
    const model = GEMINI_ANALYSIS_MODELS[i];
    try {
      return await generateReportWithModel(prompt, schema, model);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = (err as { status?: number }).status;
      const errorText = (err as { errorText?: string }).errorText ?? msg;
      const shouldTryNext = status ? shouldFallbackTo25(status, errorText) : /404|501|model.*not found/i.test(msg);
      if (shouldTryNext && i < GEMINI_ANALYSIS_MODELS.length - 1) {
        logger.warn({ model, nextModel: GEMINI_ANALYSIS_MODELS[i + 1], err: msg }, '[GeminiReport] Model failed, trying next in chain');
        continue;
      }
      throw err;
    }
  }

  throw new Error('Gemini report generation failed');
}

/**
 * Generate report in parallel: 3 Gemini calls (strategicSummary, strengths, weaknesses) run concurrently.
 * ONLY these are generated per Strategic Profile Analysis UI: summary paragraph, core strengths[3], strategic weaknesses[3].
 * All other report fields (tacticalProfile, endgameReliability, timeControlInsights, repertoireReliability,
 * tacticalRecommendation, specificVulnerability, suggestedLines, etc.) are empty defaults.
 * Model chain: 3.1-pro → flash-lite → 2.5-pro → 2.5-flash.
 */
export async function generateReportParallel(opts: BuildReportPromptOpts): Promise<ScoutingReport> {
  const prompts = buildReportPromptsParallel(opts);

  let strategicSummary: Record<string, unknown> | undefined;
  let strengths: Record<string, unknown> | undefined;
  let weaknesses: Record<string, unknown> | undefined;

  for (let i = 0; i < GEMINI_ANALYSIS_MODELS.length; i++) {
    const model = GEMINI_ANALYSIS_MODELS[i];
    try {
      [strategicSummary, strengths, weaknesses] = await Promise.all([
        generatePartialWithModel(prompts.strategicSummary, reportPartialSchemas.strategicSummary, model),
        generatePartialWithModel(prompts.strengths, reportPartialSchemas.strengths, model),
        generatePartialWithModel(prompts.weaknesses, reportPartialSchemas.weaknesses, model),
      ]);
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = (err as { status?: number }).status;
      const errorText = (err as { errorText?: string })?.errorText ?? msg;
      const shouldTryNext = status ? shouldFallbackTo25(status, errorText) : /404|501|model.*not found/i.test(msg);
      if (shouldTryNext && i < GEMINI_ANALYSIS_MODELS.length - 1) {
        logger.warn({ model, nextModel: GEMINI_ANALYSIS_MODELS[i + 1], err: msg }, '[GeminiReport] Model failed, trying next in chain');
        continue;
      }
      throw err;
    }
  }

  if (!strategicSummary || !strengths || !weaknesses) {
    throw new Error('Gemini report generation failed');
  }

  const merged: ScoutingReport = {
    id: `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    player: { name: opts.identity.verifiedName, platforms: {} },
    whiteOpenings: [],
    blackDefenses: [],
    strategicSummary: String(strategicSummary.strategicSummary ?? ''),
    blackStrategicSummary: '',
    tacticalProfile: '',
    endgameReliability: '',
    timeControlInsights: '',
    strengths: Array.isArray(strengths.strengths) ? strengths.strengths : [],
    weaknesses: Array.isArray(weaknesses.weaknesses) ? weaknesses.weaknesses : [],
    specificVulnerability: '',
    tacticalRecommendation: '',
    preparationSummary: '',
    suggestedLines: [],
    repertoireReliability: 0,
    mostPlayedLines: { white: [], black: [] },
    lastUpdated: new Date().toISOString(),
  };

  logger.info('[GeminiReport] Parallel generation complete, merged 3 partial responses');
  return merged;
}

async function generatePartialWithModel(
  prompt: string,
  schema: Record<string, unknown>,
  model: string,
): Promise<Record<string, unknown>> {
  const geminiUrl = getVertexUrl(model);
  const requestBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.7,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

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

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'unable to read');
    throw new Error(`Gemini API error: ${res.status} - ${errorText.slice(0, 200)}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error('Gemini returned no candidates');

  const parts = candidate.content?.parts || [];
  let text = '';
  for (const part of parts) {
    if (part.text) text += part.text;
  }
  if (!text) throw new Error('Gemini returned empty response');

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const repaired = parseLLMJson<Record<string, unknown>>(text);
    if (repaired) return repaired;
    throw new Error('Failed to parse Gemini partial response');
  }
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
