/**
 * Browser client for the Cloud Run Pipeline Service.
 * Opens a fetch to the pipeline, reads SSE events, calls callbacks.
 * Feature-flagged via VITE_USE_PIPELINE_SERVICE.
 */

import type { ScoutingReport, PlayerMetadata, OpeningStat, MoveSequence } from '../types';

export interface PipelineParams {
  name: string;
  fideId?: string;
  uscfId?: string;
  chessComUsername?: string;
  lichessUsername?: string;
  gameLimit?: number;
}

/** The pipeline now returns a complete ScoutingReport */
export interface PipelineResult {
  report: ScoutingReport;
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
}

export interface PipelineCallbacks {
  onPhase?: (phase: string, status: string, durationMs?: number, extra?: { gameCount?: number; gamesAnalyzed?: number }) => void;
  onProgress?: (phase: string, current: number, total: number) => void;
  onError?: (error: string, phase?: string) => void;
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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(params),
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
        case 'phase':
          callbacks.onPhase?.(
            data.phase as string,
            data.status as string,
            data.durationMs as number | undefined,
            {
              gameCount: data.gameCount as number | undefined,
              gamesAnalyzed: data.gamesAnalyzed as number | undefined,
            },
          );
          break;
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
 * Send a chat question to the pipeline service.
 * Returns the AI response text.
 */
export async function chatWithPipeline(
  report: ChatContext,
  question: string,
  accessToken: string,
): Promise<string> {
  // Default to same-origin when served from the pipeline service
  const baseUrl = import.meta.env.VITE_PIPELINE_SERVICE_URL || '';

  const url = `${baseUrl}/api/chat`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ report, question }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorBody.error || `Chat service error: ${response.status}`);
  }

  const data = await response.json();
  return data.text || '';
}

