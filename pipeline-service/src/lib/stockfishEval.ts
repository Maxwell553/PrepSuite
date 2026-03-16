/**
 * One-off Stockfish evaluation for a FEN position.
 * Used by chat tools when the user asks for engine analysis.
 */

import { spawn } from 'node:child_process';

const STOCKFISH_BINARY = process.env.STOCKFISH_PATH || 'stockfish';
const DEFAULT_DEPTH = 14;
const TIMEOUT_MS = 15_000;

export interface StockfishEvalResult {
  evaluation: number; // centipawns, positive = white better
  bestMove?: string;
  pv?: string[];
  depth: number;
}

/**
 * Evaluate a FEN position with Stockfish.
 * Returns centipawn evaluation (positive = white advantage), best move, and principal variation.
 */
export async function evaluateFen(
  fen: string,
  depth: number = DEFAULT_DEPTH,
): Promise<StockfishEvalResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(STOCKFISH_BINARY, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '';
    let evaluation = 0;
    let bestMove: string | undefined;
    let pv: string[] = [];
    let ready = false;

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Stockfish evaluation timed out'));
    }, TIMEOUT_MS);

    const send = (cmd: string) => {
      if (proc.stdin?.writable) proc.stdin.write(cmd + '\n');
    };

    const flush = () => {
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      return lines;
    };

    proc.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = flush();
      for (const line of lines) {
        const t = line.trim();
        if (t === 'uciok' || t === 'readyok') ready = true;
        const cpMatch = t.match(/score cp (-?\d+)/);
        if (cpMatch) evaluation = parseInt(cpMatch[1], 10);
        const mateMatch = t.match(/score mate (-?\d+)/);
        if (mateMatch) evaluation = parseInt(mateMatch[1], 10) > 0 ? 10000 : -10000;
        // Match " pv " (space-pv-space) to avoid matching "multipv 1" which would capture "1"
        const pvMatch = t.match(/\spv\s+(.+)/);
        if (pvMatch) {
          const moves = pvMatch[1].trim().split(/\s+/).filter((m) => m && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m));
          if (moves.length > 0) {
            pv = moves;
            bestMove = moves[0];
          }
        }
        if (t.startsWith('bestmove ')) {
          const bmMatch = t.match(/bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?|none)/);
          if (bmMatch && bmMatch[1] !== 'none') bestMove = bmMatch[1];
          clearTimeout(timeout);
          proc.kill('SIGTERM');
          resolve({ evaluation, bestMove, pv, depth });
        }
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on('exit', (code) => {
      clearTimeout(timeout);
    });

    send('uci');
    send('isready');

    const trySendPosition = () => {
      const cleanFen = fen.trim();
      if (!cleanFen || cleanFen.length < 10) {
        clearTimeout(timeout);
        proc.kill('SIGTERM');
        reject(new Error('Invalid FEN position'));
        return;
      }
      send(`position fen ${cleanFen}`);
      send(`go depth ${depth}`);
    };

    setTimeout(trySendPosition, 500);
  });
}
