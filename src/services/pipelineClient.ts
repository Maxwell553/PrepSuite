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
  /** Enables priority queue, higher limits */
  isPremium?: boolean;
}

/** The pipeline now returns a complete ScoutingReport */
export interface PipelineResult {
  report: ScoutingReport;
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

  const PIPELINE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
  if (params.isPremium) headers['X-Premium'] = 'true';
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
        case 'progress':
          callbacks.onProgress?.(
            data.phase as string,
            data.current as number,
            data.total as number,
          );
          break;
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
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorBody.error || `Chat service error: ${response.status}`);
  }

  const data = await response.json();
  return data.text || '';
}

