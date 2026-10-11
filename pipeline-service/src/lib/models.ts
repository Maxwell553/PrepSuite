/** Stable models reviewed against Vertex lifecycle documentation on 2026-10-11.
 * Flash-Lite is supported through 2027-07-21 or later; 3.8 Flash has no announced
 * retirement. No model has perpetual availability. Keep overrides configurable
 * and a distinct fallback for model retirement/outage responses (404/410/5xx).
 * https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions
 */
export const models = {
  analysis: process.env.GEMINI_ANALYSIS_MODEL || "gemini-3.5-flash-lite",
  discovery: process.env.GEMINI_DISCOVERY_MODEL || "gemini-3.5-flash-lite",
  support: process.env.GEMINI_SUPPORT_MODEL || "gemini-3.5-flash-lite",
  fallback: process.env.GEMINI_FALLBACK_MODEL || "gemini-3.8-flash",
};
export const modelChain = (primary: string) => [
  ...new Set([primary, models.fallback]),
];

/** Use the lowest supported effort for each configured model. */
export function fastThinkingConfig(model: string) {
  if (model === 'gemini-3.8-flash') return { thinkingConfig: { thinkingLevel: 'low' } };
  if (model === 'gemini-3.5-flash-lite') return { thinkingConfig: { thinkingLevel: 'minimal' } };
  return {};
}
