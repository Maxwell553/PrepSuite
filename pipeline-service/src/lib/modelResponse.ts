import { z } from 'zod';
import { logger } from './logger.js';

export class ModelResponseError extends Error {
  constructor(public readonly reason: string, public readonly blocked = false) {
    super(`Model response check failed: ${reason}`);
  }
}
const moves = z.array(z.string().min(1).max(20)).max(100);
const toolArgs: Record<string, z.ZodTypeAny> = {
  get_game: z.object({ gameIndex: z.number().int().positive() }),
  get_pgn: z.object({ gameIndex: z.number().int().positive() }),
  run_stockfish: z.object({ fen: z.string().min(10).max(150), depth: z.number().int().min(1).max(30).optional() }),
  get_opening_breakdown: z.object({ moveSequence: moves, side: z.enum(['white', 'black']) }),
  lookup_opening: z.object({ moveSequence: moves.optional(), ecoCode: z.string().regex(/^[A-E]\d{2}$/).optional() }).refine(a => a.moveSequence?.length || a.ecoCode),
};
const partSchema = z.object({
  text: z.string().optional(), thought: z.boolean().optional(),
  functionCall: z.unknown().optional(), function_call: z.unknown().optional(),
}).passthrough();
const responseSchema = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).passthrough().optional(),
  candidates: z.array(z.object({
    finishReason: z.string(),
    safetyRatings: z.array(z.object({ blocked: z.boolean().optional() }).passthrough()).optional(),
    content: z.object({ parts: z.array(partSchema).max(100) }).optional(),
  }).passthrough()).optional(),
}).passthrough();

/** Run before displaying text or executing tools, including every follow-up round.
 * Checks provider safety/completion, response shape, and tool arguments. This is
 * not a factual accuracy guarantee or a second model judging its own answer.
 */
export function checkModelResponse(raw: unknown, context: { requestId: string; model: string; channel: 'repertoire' | 'support'; round?: number }) {
  try {
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success) throw new ModelResponseError('malformed_response');
    const data = parsed.data;
    const candidate = data.candidates?.[0];
    if ((data.promptFeedback?.blockReason && data.promptFeedback.blockReason !== 'BLOCK_REASON_UNSPECIFIED') || candidate?.safetyRatings?.some(r => r.blocked) || ['SAFETY','PROHIBITED_CONTENT','BLOCKLIST','SPII','RECITATION','IMAGE_SAFETY'].includes(candidate?.finishReason || '')) {
      throw new ModelResponseError('provider_blocked', true);
    }
    if (!candidate || candidate.finishReason !== 'STOP') throw new ModelResponseError(candidate?.finishReason === 'MAX_TOKENS' ? 'truncated_response' : 'incomplete_response');
    const parts = (candidate.content?.parts || []).filter(p => !p.thought);
    const functionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const modelPartsWithFc: Array<Record<string, unknown>> = [];
    let text = '';
    for (const part of parts) {
      text += part.text || '';
      const fc = part.functionCall ?? part.function_call;
      if (fc !== undefined) {
        const call = z.object({ name: z.string(), args: z.record(z.unknown()) }).safeParse(fc);
        if (context.channel !== 'repertoire' || !call.success || !Object.hasOwn(toolArgs, call.data.name) || !toolArgs[call.data.name].safeParse(call.data.args).success) throw new ModelResponseError('invalid_tool_call');
        functionCalls.push(call.data);
        modelPartsWithFc.push(part);
      }
    }
    text = text.trim();
    if (functionCalls.length > 8 || text.length > 65000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new ModelResponseError('invalid_content');
    if (!text && !functionCalls.length) throw new ModelResponseError('empty_response');
    logger.info({ ...context, check: 'passed', textLength: text.length, toolCount: functionCalls.length }, '[ModelResponse] Checked');
    return { text, functionCalls, modelPartsWithFc };
  } catch (error) {
    logger.warn({ ...context, check: 'failed', reason: error instanceof ModelResponseError ? error.reason : 'invalid_response' }, '[ModelResponse] Checked');
    throw error;
  }
}
