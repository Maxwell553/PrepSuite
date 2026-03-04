/**
 * Stockfish native engine pool.
 * Spawns N child processes communicating via UCI stdin/stdout protocol.
 * Distributes game analysis across workers for parallel processing.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { Chess } from 'chess.js';
import type { GameData, GameAnalysis } from '../lib/types.js';
import { logger } from '../lib/logger.js';

const STOCKFISH_BINARY = process.env.STOCKFISH_PATH || 'stockfish';
const DEFAULT_WORKER_COUNT = 4;
const DEFAULT_DEPTH = 7;
const EVAL_TIMEOUT_MS = 8000;
const INIT_TIMEOUT_MS = 5000;

// ── UCI Worker ─────────────────────────────────────────────────────

class StockfishWorker {
  private process: ChildProcess;
  private ready = false;
  private buffer = '';
  private resolveReady: (() => void) | null = null;
  private currentResolve: ((line: string) => void) | null = null;

  constructor() {
    this.process = spawn(STOCKFISH_BINARY, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout!.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        this.handleLine(line.trim());
      }
    });

    this.process.stderr!.on('data', (data: Buffer) => {
      logger.warn({ msg: data.toString().trim() }, '[Stockfish] stderr');
    });

    this.process.on('exit', (code) => {
      logger.info({ code }, '[Stockfish] Process exited');
      this.ready = false;
    });
  }

  private handleLine(line: string): void {
    if (line === 'uciok' && this.resolveReady) {
      this.ready = true;
      const cb = this.resolveReady;
      this.resolveReady = null;
      cb();
    }
    if (line === 'readyok' && this.resolveReady) {
      const cb = this.resolveReady;
      this.resolveReady = null;
      cb();
    }
    if (this.currentResolve) {
      this.currentResolve(line);
    }
  }

  private send(cmd: string): void {
    if (this.process.stdin?.writable) {
      this.process.stdin.write(cmd + '\n');
    }
  }

  async initialize(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Stockfish init timeout')), INIT_TIMEOUT_MS);
      this.resolveReady = () => {
        clearTimeout(timeout);
        // Now send isready and wait
        const timeout2 = setTimeout(() => reject(new Error('Stockfish isready timeout')), INIT_TIMEOUT_MS);
        this.resolveReady = () => {
          clearTimeout(timeout2);
          resolve();
        };
        this.send('isready');
      };
      this.send('uci');
    });
  }

  /**
   * Evaluate a position given UCI moves, at the specified depth.
   * Returns centipawn evaluation, best move, and principal variation.
   */
  async evaluatePosition(
    uciMoves: string[],
    depth: number,
  ): Promise<{ evaluation: number; bestMove?: string; pv?: string[] }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.currentResolve = null;
        reject(new Error('Stockfish eval timeout'));
      }, EVAL_TIMEOUT_MS);

      let evaluation = 0;
      let bestMove: string | undefined;
      let pv: string[] = [];
      let resolved = false;

      this.currentResolve = (line) => {
        if (resolved) return;

        // Parse score
        const cpMatch = line.match(/score cp (-?\d+)/);
        if (cpMatch) evaluation = parseInt(cpMatch[1], 10);

        const mateMatch = line.match(/score mate (-?\d+)/);
        if (mateMatch) {
          evaluation = parseInt(mateMatch[1], 10) > 0 ? 10000 : -10000;
        }

        // Parse PV
        const pvMatch = line.match(/pv\s+(.+)/);
        if (pvMatch) {
          const moveList = pvMatch[1].trim().split(/\s+/).filter((m) => m);
          if (moveList.length > 0) {
            bestMove = moveList[0];
            pv = moveList;
          }
        }

        if (line.startsWith('bestmove')) {
          resolved = true;
          this.currentResolve = null;
          clearTimeout(timeout);
          resolve({ evaluation, bestMove, pv });
        }
      };

      const posCmd =
        uciMoves.length > 0
          ? `position startpos moves ${uciMoves.join(' ')}`
          : 'position startpos';
      this.send(posCmd);
      this.send(`go depth ${depth}`);
    });
  }

  /** Send ucinewgame to reset hash tables */
  newGame(): void {
    this.send('ucinewgame');
  }

  shutdown(): void {
    this.send('quit');
    this.currentResolve = null;
    this.resolveReady = null;
    setTimeout(() => {
      if (!this.process.killed) this.process.kill();
    }, 1000);
  }
}

// ── PGN to UCI conversion ──────────────────────────────────────────

function pgnToUciMoves(pgn: string): string[] {
  if (!pgn || pgn.trim().length < 5) return [];

  try {
    const chess = new Chess();

    // Clean PGN: strip headers, comments, annotations
    let movetext = pgn
      .replace(/\[.*?\]/g, '')
      .replace(/\{.*?\}/g, '')
      .replace(/[?!+#]/g, '')
      .trim();

    // Normalize Chess.com format: "1. e4  1... e5" → "1. e4 e5"
    movetext = movetext.replace(/\s+\d+\.\.\.\s+/g, ' ').replace(/\s+/g, ' ').trim();

    // Remove result at end
    movetext = movetext.replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, '').trim();

    try {
      chess.loadPgn(`[White "?"]\n[Black "?"]\n\n${movetext}`);
    } catch {
      return [];
    }

    const history = chess.history({ verbose: true });
    return history.map((m) => m.from + m.to + (m.promotion || ''));
  } catch {
    return [];
  }
}

// ── Pool ───────────────────────────────────────────────────────────

export class StockfishPool {
  private workers: StockfishWorker[] = [];
  private workerCount: number;
  private depth: number;

  constructor(options?: { workerCount?: number; depth?: number }) {
    this.workerCount = options?.workerCount ?? DEFAULT_WORKER_COUNT;
    this.depth = options?.depth ?? DEFAULT_DEPTH;
  }

  async initialize(): Promise<void> {
    logger.info({ workerCount: this.workerCount, depth: this.depth }, '[StockfishPool] Initializing');

    const promises: Promise<void>[] = [];
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new StockfishWorker();
      this.workers.push(worker);
      promises.push(worker.initialize());
    }

    await Promise.all(promises);
    logger.info('[StockfishPool] All workers ready');
  }

  /**
   * Analyze a single game: evaluate key positions, detect mistakes.
   */
  async analyzeGame(
    game: GameData,
    targetUsername: string,
    worker: StockfishWorker,
  ): Promise<GameAnalysis> {
    if (!game.pgn || game.pgn.trim().length < 20) {
      return emptyAnalysis(game.id);
    }

    const uciMoves = pgnToUciMoves(game.pgn);
    if (uciMoves.length < 10) return emptyAnalysis(game.id);

    const isTargetWhite = game.white.toLowerCase() === targetUsername.toLowerCase();

    worker.newGame();

    // Key positions: moves 10, 20, 30, 40, 50, then every 10 after
    const keyPositions = [10, 20, 30, 40, 50];
    for (let pos = 60; pos < uciMoves.length; pos += 10) keyPositions.push(pos);
    const validPositions = keyPositions.filter((p) => p < uciMoves.length);

    const evaluations: number[] = [];
    const criticalMistakes: GameAnalysis['criticalMistakes'] = [];

    for (const moveIndex of validPositions) {
      try {
        const movesToPos = uciMoves.slice(0, moveIndex);
        const evalResult = await worker.evaluatePosition(movesToPos, this.depth);
        const adjustedEval = isTargetWhite ? evalResult.evaluation : -evalResult.evaluation;
        evaluations.push(adjustedEval);

        // Check for critical mistakes (>150cp swing)
        if (moveIndex > 0 && evaluations.length >= 2) {
          const prevEval = evaluations[evaluations.length - 2];
          const evalSwing = Math.abs(adjustedEval - prevEval);
          const isTargetMove = ((moveIndex - 1) % 2 === 0) === isTargetWhite;

          if (isTargetMove && evalSwing > 150) {
            criticalMistakes.push({
              moveNumber: Math.floor(moveIndex / 2) + 1,
              move: uciMoves[moveIndex - 1] || '',
              evaluationBefore: prevEval,
              evaluationAfter: adjustedEval,
              mistakeSeverity: Math.min(evalSwing / 100, 10),
            });
          }
        }
      } catch {
        // Skip position on error, continue with next
      }
    }

    if (evaluations.length === 0) return emptyAnalysis(game.id);

    const avgEval = evaluations.reduce((a, b) => a + b, 0) / evaluations.length;
    const firstHalf = evaluations.slice(0, Math.floor(evaluations.length / 2));
    const secondHalf = evaluations.slice(Math.floor(evaluations.length / 2));
    const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
    const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;
    const trend: GameAnalysis['evaluationTrend'] =
      secondAvg > firstAvg + 50 ? 'improving' : secondAvg < firstAvg - 50 ? 'declining' : 'stable';

    const endgameEvals = evaluations.slice(-5);
    const endgameAvg = endgameEvals.length > 0 ? endgameEvals.reduce((a, b) => a + b, 0) / endgameEvals.length : 0;
    const endgameAccuracy = Math.max(0, Math.min(100, 100 - Math.abs(endgameAvg) / 10));

    return {
      gameId: game.id,
      criticalMistakes: criticalMistakes.sort((a, b) => b.mistakeSeverity - a.mistakeSeverity).slice(0, 5),
      averageEvaluation: avgEval,
      evaluationTrend: trend,
      endgameAccuracy,
    };
  }

  /**
   * Analyze multiple games in parallel across the worker pool.
   */
  async analyzeGames(
    games: GameData[],
    targetUsername: string,
    onProgress?: (current: number, total: number) => void,
  ): Promise<GameAnalysis[]> {
    const total = games.length;
    logger.info({ total, workers: this.workers.length }, '[StockfishPool] Starting batch analysis');

    const results: GameAnalysis[] = new Array(total);
    let completed = 0;

    // Distribute games across workers using a simple task queue
    const queue = games.map((game, index) => ({ game, index }));
    let queueIndex = 0;

    const workerTasks = this.workers.map(async (worker) => {
      while (queueIndex < queue.length) {
        const taskIdx = queueIndex++;
        if (taskIdx >= queue.length) break;

        const { game, index } = queue[taskIdx];
        try {
          results[index] = await this.analyzeGame(game, targetUsername, worker);
        } catch (err) {
          logger.warn({ gameId: game.id, err }, '[StockfishPool] Game analysis failed');
          results[index] = emptyAnalysis(game.id);
        }

        completed++;
        if (onProgress) onProgress(completed, total);

        if (completed % 10 === 0 || completed === total) {
          logger.info({ completed, total }, '[StockfishPool] Progress');
        }
      }
    });

    await Promise.all(workerTasks);

    logger.info({ total: results.length }, '[StockfishPool] Batch analysis complete');
    return results;
  }

  async shutdown(): Promise<void> {
    logger.info('[StockfishPool] Shutting down');
    for (const worker of this.workers) {
      worker.shutdown();
    }
    this.workers = [];
  }
}

function emptyAnalysis(gameId: string): GameAnalysis {
  return {
    gameId,
    criticalMistakes: [],
    averageEvaluation: 0,
    evaluationTrend: 'stable',
    endgameAccuracy: 0,
  };
}
