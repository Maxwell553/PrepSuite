/**
 * Consolidated JSON repair for LLM outputs.
 * Handles: markdown code fences, truncated strings/arrays/objects, trailing commas.
 */

/** Strip markdown code fences and find the JSON object */
function stripMarkdown(raw: string): string {
  let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const startIdx = s.indexOf('{');
  if (startIdx >= 0) s = s.slice(startIdx);
  return s;
}

/** Close unclosed strings, brackets, and braces */
function closeStructures(s: string): string {
  if (/}\s*$/.test(s)) return s; // Already closed
  if (!s || s.length === 0) return s;

  let inString = false;
  let openBraces = 0;
  let openBrackets = 0;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && s[i - 1] !== '\\') inString = !inString;
    if (!inString) {
      if (c === '{') openBraces++;
      if (c === '}') openBraces--;
      if (c === '[') openBrackets++;
      if (c === ']') openBrackets--;
    }
  }

  if (inString) s += '"';
  s += ']'.repeat(Math.max(0, openBrackets));
  s += '}'.repeat(Math.max(0, openBraces));
  return s;
}

/** Remove trailing commas before } or ] */
function removeTrailingCommas(s: string): string {
  return s.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
}

/**
 * Attempt to repair and parse JSON from an LLM response.
 * Returns the parsed object or null if repair fails.
 */
export function repairJson(raw: string): string {
  let s = stripMarkdown(raw);
  s = closeStructures(s);
  s = removeTrailingCommas(s);
  return s;
}

/**
 * Parse JSON from an LLM response with repair.
 * Returns the parsed object or null if all attempts fail.
 */
export function parseLLMJson<T = unknown>(raw: string): T | null {
  if (!raw || raw.trim().length === 0) return null;

  const repaired = repairJson(raw);
  if (!repaired || repaired.trim().length === 0) return null;

  try {
    return JSON.parse(repaired) as T;
  } catch {
    // Last attempt: aggressive trailing comma removal
    try {
      const cleaned = removeTrailingCommas(repaired);
      return JSON.parse(cleaned) as T;
    } catch {
      return null;
    }
  }
}
