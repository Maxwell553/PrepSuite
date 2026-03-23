/**
 * Generate 1-2 sentence advice on whether to complicate positions based on opponent's time usage.
 * Uses Gemini 3.1 Pro for accurate, data-consistent analysis.
 */

import { logger } from '../lib/logger.js';
import { getAccessToken, getVertexUrl } from '../lib/vertexAuth.js';
import type { TimeManagementStats } from '../lib/types.js';

const MODEL = 'gemini-3.1-pro-preview';
const TIMEOUT_MS = 10_000;

function formatSpeedForPrompt(speed: string): string {
  const num = parseInt(speed, 10);
  if (!Number.isNaN(num) && num >= 60 && num <= 3600) {
    const min = Math.round(num / 60);
    return `${min} min`;
  }
  return speed;
}

export async function generateTimeManagementAdvice(
  tm: TimeManagementStats,
): Promise<string> {
  const bySpeedStr = tm.bySpeed
    .map(
      (r) =>
        `- ${formatSpeedForPrompt(r.speed)}: ${r.games} games, ${r.lostOnTime} lost on time, ${r.wonOnTime} won on time`,
    )
    .join('\n');
  const flagPct =
    tm.lostOnTimeShareAmongFlagDecisive != null
      ? (tm.lostOnTimeShareAmongFlagDecisive * 100).toFixed(0)
      : null;

  const prompt = `You are a chess preparation assistant. Based on this opponent's time management stats from online games, write exactly 1-2 short sentences (max 25 words) advising whether to make the position complicated or keep it simple to exploit their time usage. Be direct and actionable. Use complete words only (e.g. say "scramble", never truncate mid-word).

CRITICAL: Base your advice strictly on the numbers. If they WON more often than LOST on time, do NOT say they struggle with time or lose on time—instead advise keeping things simple or avoiding time scrambles. Only advise complicating positions if they LOSE more often than WIN on time.

Stats:
- Lost on time: ${tm.lostOnTime}, Won on time: ${tm.wonOnTime}
${flagPct != null ? `- When games end by flag, they lost the clock ${flagPct}% of the time` : ''}
By time control:
${bySpeedStr}

Reply with only the advice, no preamble.`;

  let url: string;
  try {
    url = getVertexUrl(MODEL);
  } catch {
    logger.warn('[TimeManagementAdvice] Vertex config missing, skipping');
    return '';
  }

  try {
    const token = await getAccessToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 256,
          temperature: 0.4,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.warn({ status: res.status, err: errText.slice(0, 200) }, '[TimeManagementAdvice] API error');
      return '';
    }

    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text ?? '';
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[TimeManagementAdvice] Failed');
    return '';
  }
}
