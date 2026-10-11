import { workContext } from './workContext.js';
import { logger } from './logger.js';

/** Bound optional discovery work, including all retries and response-body reads. */
export async function boundedLookup<T>(label: string, timeoutMs: number, task: () => Promise<T>, fallback: T): Promise<T> {
  const parent = workContext.getStore();
  parent?.throwIfAborted();
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  let timer: ReturnType<typeof setTimeout>;
  let abort: () => void;
  const stopped = new Promise<T>(resolve => {
    abort = () => resolve(fallback);
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => controller.abort(), timeoutMs);
  });
  try {
    return await Promise.race([stopped, workContext.run(signal, async () => {
      try { return await task(); }
      catch (error) { logger.warn({label, error}, '[Discovery] Optional lookup unavailable'); return fallback; }
    })]);
  } finally {
    clearTimeout(timer!);
    signal.removeEventListener('abort', abort!);
    controller.abort();
    parent?.throwIfAborted();
  }
}
