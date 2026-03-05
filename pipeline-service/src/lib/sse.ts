import type { PhaseEvent, ProgressEvent, CompleteEvent, ErrorEvent } from './types.js';
import { logger } from './logger.js';

/**
 * SSEStream wraps a ReadableStream for Server-Sent Events.
 * Usage:
 *   const sse = new SSEStream();
 *   // Return sse.response() immediately
 *   // Then call sse.sendPhase(), sse.sendProgress(), etc.
 *   // Finally call sse.close()
 */
/** Interval (ms) for SSE comment keepalive to prevent proxy/load balancer idle timeout */
const KEEPALIVE_INTERVAL_MS = 15_000;

export class SSEStream {
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private encoder = new TextEncoder();
  private stream: ReadableStream<Uint8Array>;
  private closed = false;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
        this.startKeepalive();
      },
      cancel: () => {
        logger.warn('[SSE] Stream cancelled by client');
        this.stopKeepalive();
        this.closed = true;
        this.controller = null;
      },
    });
  }

  private startKeepalive(): void {
    this.keepaliveTimer = setInterval(() => {
      if (this.closed || !this.controller) return;
      try {
        this.controller.enqueue(this.encoder.encode(': keepalive\n\n'));
      } catch {
        // Stream closed, ignore
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  /** Get the Response object to return to the client */
  response(): Response {
    return new Response(this.stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      },
    });
  }

  private send(event: string, data: unknown): void {
    if (this.closed || !this.controller) {
      logger.warn({ event, closed: this.closed, hasController: !!this.controller }, '[SSE] Cannot send, stream closed or no controller');
      return;
    }
    try {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      this.controller.enqueue(this.encoder.encode(payload));
    } catch (err) {
      logger.error({ err, event }, '[SSE] Failed to enqueue event');
    }
  }

  sendPhase(data: PhaseEvent): void {
    this.send('phase', data);
  }

  sendProgress(data: ProgressEvent): void {
    this.send('progress', data);
  }

  sendComplete(data: CompleteEvent): void {
    logger.info({ dataKeys: Object.keys(data as unknown as Record<string, unknown>) }, '[SSE] Sending complete event');
    this.send('complete', data);
  }

  sendError(data: ErrorEvent): void {
    this.send('error', data);
  }

  /** Send custom event for progressive report updates (identity, parsing) */
  sendEvent(eventName: string, data: unknown): void {
    this.send(eventName, data);
  }

  async close(): Promise<void> {
    if (this.closed || !this.controller) return;
    this.stopKeepalive();
    // Small delay to let the transport flush the final (potentially large) chunk
    await new Promise((resolve) => setTimeout(resolve, 200));
    logger.info('[SSE] Closing stream');
    this.closed = true;
    try {
      this.controller.close();
    } catch {
      // Already closed
    }
    this.controller = null;
  }
}

