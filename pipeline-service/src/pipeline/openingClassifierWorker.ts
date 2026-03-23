/**
 * Worker entry: classifies a slice of games in parallel with other workers.
 * Loaded by openingClassifier.ts via node:worker_threads.
 */

import { parentPort } from 'node:worker_threads';
import { classifyOpeningTasksForWorker } from './openingClassifier.js';

parentPort?.on(
  'message',
  async (msg: { tasks?: Array<{ idx: number; pgn: string; eco?: string }> }) => {
    if (!msg?.tasks) {
      parentPort?.postMessage({ type: 'error', message: 'invalid worker payload' });
      return;
    }
    try {
      const results = await classifyOpeningTasksForWorker(msg.tasks, () => {
        parentPort?.postMessage({ type: 'progress' });
      });
      parentPort?.postMessage({ type: 'done', results });
    } catch (err) {
      parentPort?.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },
);
