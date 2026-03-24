/**
 * Browser client for the Cloud Run Pipeline Service.
 * Opens a fetch to the pipeline, reads SSE events, calls callbacks.
 * Adds Sentry breadcrumbs for pipeline phase transitions.
 */

import * as Sentry from '@sentry/react';
import type { ScoutingReport, PlayerMetadata, OpeningStat, MoveSequence } from '../types';

export interface PipelineParams {
  name: string;
  fideId?: string;
  uscfId?: string;
  chessComUsername?: string;
  lichessUsername?: string;
  gameLimit?: number;
  onlineLimit?: number;
  otbLimit?: number;
  /** Premium: customizable 7–20; free uses default */
  engineDepth?: number;
}

/** The pipeline now returns a complete ScoutingReport */
export interface PipelineResult {
  report: ScoutingReport;
  creditsDeducted?: number;
}

/** Chat message for conversation history */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Chat context sent to /api/chat */
export interface ChatContext {
  player: PlayerMetadata;
  whiteOpenings?: OpeningStat[];
  blackDefenses?: OpeningStat[];
  mostPlayedLines?: {
    white: MoveSequence[];
    black: MoveSequence[];
  };
  preparationSummary?: string;
  blackStrategicSummary?: string;
  /** Games for tool access (get_game, get_pgn). */
  games?: Array<{
    id?: string;
    white: string;
    black: string;
    result: string;
    eco: string;
    pgn?: string;
    playedAt: string;
    source?: string;
    timeControl?: string;
    openingName?: string;
  }>;
}

/** Partial player data streamed after identity phase */
export interface IdentityEventData {
  player: Partial<PlayerMetadata>;
}

/** Partial report data streamed after parsing phase */
export interface ParsingEventData {
  whiteOpenings?: OpeningStat[];
  blackDefenses?: OpeningStat[];
  mostPlayedLines?: { white: MoveSequence[]; black: MoveSequence[] };
  games?: Array<{
    id?: string;
    white: string;
    black: string;
    result: string;
    eco: string;
    pgn?: string;
    playedAt: string;
    source?: string;
    timeControl?: string;
    openingName?: string;
  }>;
}

export interface PipelineCallbacks {
  onPhase?: (
    phase: string,
    status: string,
    durationMs?: number,
    extra?: { gameCount?: number; gamesAnalyzed?: number; message?: string },
  ) => void;
  onProgress?: (phase: string, current: number, total: number) => void;
  onError?: (error: string, phase?: string) => void;
  /** Called when identity is resolved (FIDE, USCF, platforms, etc.) */
  onIdentity?: (data: IdentityEventData) => void;
  /** Called when games are parsed and opening stats are ready */
  onParsing?: (data: ParsingEventData) => void;
}

/**
 * Run the pipeline via the Cloud Run service.
 * Returns a promise that resolves with a complete ScoutingReport.
 */
export async function runPipeline(
  params: PipelineParams,
  accessToken: string,
  callbacks: PipelineCallbacks = {},
): Promise<PipelineResult> {
  // Default to same-origin when served from the pipeline service
  const baseUrl = import.meta.env.VITE_PIPELINE_SERVICE_URL || '';

  const url = `${baseUrl}/api/analyze`;

  const pipelineStartMs = Date.now();
  const PIPELINE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(PIPELINE_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorBody.error || `Pipeline service error: ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Pipeline service returned no body');
  }

  return new Promise<PipelineResult>((resolve, reject) => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: PipelineResult | null = null;
    let currentEvent = ''; // Persists across chunk boundaries

    function processLines() {
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          try {
            const data = JSON.parse(dataStr);
            handleEvent(currentEvent, data);
          } catch (e) {
            console.warn(`[Pipeline] Failed to parse SSE data for event "${currentEvent}":`,
              (e as Error).message, `(data length: ${dataStr.length})`);
          }
        }
      }
    }

    function handleEvent(event: string, data: Record<string, unknown>) {
      switch (event) {
        case 'phase': {
          const phase = data.phase as string;
          const status = data.status as string;
          const durationMs = data.durationMs as number | undefined;
          const extra = {
            gameCount: data.gameCount as number | undefined,
            gamesAnalyzed: data.gamesAnalyzed as number | undefined,
            message: data.message as string | undefined,
          };
          Sentry.addBreadcrumb({
            category: 'pipeline',
            message: `Pipeline ${phase}: ${status}`,
            data: { phase, status, durationMs, ...extra },
          });
          callbacks.onPhase?.(phase, status, durationMs, extra);
          break;
        }
        case 'progress': {
          // Defer so each update runs in its own macrotask. Otherwise hundreds of `progress`
          // lines parsed in one `read()` chunk trigger React state updates in one synchronous
          // turn and React 18 batches them — the UI often stays stuck at (0/N).
          const phase = data.phase as string;
          const current = data.current as number;
          const total = data.total as number;
          setTimeout(() => {
            callbacks.onProgress?.(phase, current, total);
          }, 0);
          break;
        }
        case 'complete':
          result = data as unknown as PipelineResult;
          break;
        case 'identity':
          callbacks.onIdentity?.(data as unknown as IdentityEventData);
          break;
        case 'parsing':
          callbacks.onParsing?.(data as unknown as ParsingEventData);
          break;
        case 'error':
          callbacks.onError?.(data.error as string, data.phase as string | undefined);
          reject(new Error(data.error as string));
          break;
      }
    }

    function read() {
      reader
        .read()
        .then(({ done, value }) => {
          if (value) {
            buffer += decoder.decode(value, { stream: !done });
            processLines();
          }
          if (done) {
            // Process any remaining buffer — add trailing newline so
            // processLines() treats the last line as complete
            if (buffer.trim()) {
              buffer += '\n';
              processLines();
            }
            if (result) {
              const durationMs = Date.now() - pipelineStartMs;
              console.log(`[Pipeline] Generation complete in ${(durationMs / 1000).toFixed(1)}s (${durationMs}ms)`);
              resolve(result);
            } else {
              reject(new Error('Pipeline stream ended without complete event'));
            }
            return;
          }
          read();
        })
        .catch(reject);
    }

    read();
  });
}

const GUEST_MAX_GAMES = 500;

/**
 * Run the guest pipeline (no auth required, 500-game cap).
 * Hits /api/analyze-guest which is rate-limited by IP.
 */
export async function runGuestPipeline(
  params: PipelineParams,
  callbacks: PipelineCallbacks = {},
): Promise<PipelineResult> {
  const baseUrl = import.meta.env.VITE_PIPELINE_SERVICE_URL || '';
  const url = `${baseUrl}/api/analyze-guest`;

  const cappedParams = {
    ...params,
    gameLimit: Math.min(params.gameLimit ?? GUEST_MAX_GAMES, GUEST_MAX_GAMES),
    onlineLimit: Math.min(params.onlineLimit ?? 250, GUEST_MAX_GAMES),
    otbLimit: Math.min(params.otbLimit ?? 250, GUEST_MAX_GAMES),
  };
  // Ensure split adds up
  if (cappedParams.onlineLimit + cappedParams.otbLimit !== cappedParams.gameLimit) {
    cappedParams.onlineLimit = Math.min(cappedParams.onlineLimit, cappedParams.gameLimit);
    cappedParams.otbLimit = cappedParams.gameLimit - cappedParams.onlineLimit;
  }

  const pipelineStartMs = Date.now();
  const PIPELINE_TIMEOUT_MS = 10 * 60 * 1000;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cappedParams),
    signal: AbortSignal.timeout(PIPELINE_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorBody.error || `Pipeline service error: ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Pipeline service returned no body');
  }

  return new Promise<PipelineResult>((resolve, reject) => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: PipelineResult | null = null;
    let currentEvent = '';

    function processLines() {
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          try {
            const data = JSON.parse(dataStr);
            handleEvent(currentEvent, data);
          } catch (e) {
            console.warn(`[GuestPipeline] Failed to parse SSE data for event "${currentEvent}":`,
              (e as Error).message);
          }
        }
      }
    }

    function handleEvent(event: string, data: Record<string, unknown>) {
      switch (event) {
        case 'phase': {
          const phase = data.phase as string;
          const status = data.status as string;
          const durationMs = data.durationMs as number | undefined;
          const extra = {
            gameCount: data.gameCount as number | undefined,
            gamesAnalyzed: data.gamesAnalyzed as number | undefined,
            message: data.message as string | undefined,
          };
          callbacks.onPhase?.(phase, status, durationMs, extra);
          break;
        }
        case 'progress': {
          const phase = data.phase as string;
          const current = data.current as number;
          const total = data.total as number;
          setTimeout(() => callbacks.onProgress?.(phase, current, total), 0);
          break;
        }
        case 'complete':
          result = data as unknown as PipelineResult;
          break;
        case 'identity':
          callbacks.onIdentity?.(data as unknown as IdentityEventData);
          break;
        case 'parsing':
          callbacks.onParsing?.(data as unknown as ParsingEventData);
          break;
        case 'error':
          callbacks.onError?.(data.error as string, data.phase as string | undefined);
          reject(new Error(data.error as string));
          break;
      }
    }

    function read() {
      reader.read().then(({ done, value }) => {
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          processLines();
        }
        if (done) {
          if (buffer.trim()) { buffer += '\n'; processLines(); }
          if (result) {
            const durationMs = Date.now() - pipelineStartMs;
            console.log(`[GuestPipeline] Complete in ${(durationMs / 1000).toFixed(1)}s`);
            resolve(result);
          } else {
            reject(new Error('Pipeline stream ended without complete event'));
          }
          return;
        }
        read();
      }).catch(reject);
    }

    read();
  });
}

/** Client-side ceiling for chat; server uses SSE keepalive so long multi-tool replies complete reliably */
const CHAT_CLIENT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Parse a full SSE body (used when Content-Type is missing/wrong but body is still SSE — common behind proxies).
 */
function parseSseChatFullText(body: string): string {
  let currentEvent = '';
  for (const line of body.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      const dataStr = line.slice(6);
      try {
        const data = JSON.parse(dataStr) as { text?: string; error?: string };
        if (currentEvent === 'chat_text') {
          return data.text ?? '';
        }
        if (currentEvent === 'error') {
          throw new Error(data.error || 'Chat error');
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  throw new Error('Chat stream ended without a response');
}

/**
 * Read POST /api/chat (or /api/support-chat) body: SSE with event `chat_text` or `error`, or legacy JSON.
 */
async function readChatResponse(response: Response): Promise<string> {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorBody.error || `Chat service error: ${response.status}`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/event-stream')) {
    return readChatSseBody(response);
  }

  const raw = await response.text();
  const trimmed = raw.trimStart();
  if (
    trimmed.startsWith('event:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith(':')
  ) {
    return parseSseChatFullText(raw);
  }

  try {
    const data = JSON.parse(raw) as { text?: string; error?: string };
    if (data.error) throw new Error(data.error);
    return data.text || '';
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error('Invalid chat response from server');
    }
    throw e;
  }
}

function readChatSseBody(response: Response): Promise<string> {
  if (!response.body) {
    return Promise.reject(new Error('Chat service returned no body'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

    function settleError(err: Error) {
      if (settled) return;
      settled = true;
      void reader.cancel().catch(() => {});
      reject(err);
    }

    function settleOk(text: string) {
      if (settled) return;
      settled = true;
      void reader.cancel().catch(() => {});
      resolve(text);
    }

    function processLines() {
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line || line.startsWith(':')) continue;
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          try {
            const data = JSON.parse(dataStr) as { text?: string; error?: string };
            if (currentEvent === 'chat_text') {
              settleOk(data.text ?? '');
              return;
            }
            if (currentEvent === 'error') {
              settleError(new Error(data.error || 'Chat error'));
              return;
            }
          } catch {
            // ignore malformed chunk
          }
        }
      }
    }

    function read() {
      reader
        .read()
        .then(({ done, value }) => {
          if (value) {
            buffer += decoder.decode(value, { stream: !done });
            processLines();
            if (settled) return;
          }
          if (done) {
            if (buffer.trim()) {
              buffer += '\n';
              processLines();
            }
            if (!settled) {
              settleError(new Error('Chat stream ended without a response'));
            }
            return;
          }
          read();
        })
        .catch((e) => settleError(e instanceof Error ? e : new Error(String(e))));
    }

    read();
  });
}

/**
 * Send a chat request to the pipeline service.
 * Supports conversation history and tools (get_game, get_pgn, run_stockfish).
 * Returns the AI response text.
 */
export async function chatWithPipeline(
  report: ChatContext,
  messages: ChatMessage[],
  accessToken: string,
): Promise<string> {
  const baseUrl = import.meta.env.VITE_PIPELINE_SERVICE_URL || '';
  const url = `${baseUrl}/api/chat`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ report, messages }),
    signal: AbortSignal.timeout(CHAT_CLIENT_TIMEOUT_MS),
  });

  return readChatResponse(response);
}

/** Support category for filtering */
export type SupportCategory = 'question' | 'bug' | 'feature';

/** Support chat: bug reports, feature requests, site questions. No report context. */
export async function supportChatWithPipeline(
  messages: ChatMessage[],
  accessToken: string,
  category?: SupportCategory,
): Promise<string> {
  const baseUrl = import.meta.env.VITE_PIPELINE_SERVICE_URL || '';
  const url = `${baseUrl}/api/support-chat`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ messages, category }),
    signal: AbortSignal.timeout(CHAT_CLIENT_TIMEOUT_MS),
  });

  return readChatResponse(response);
}

