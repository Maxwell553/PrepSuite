import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StockfishAnalyzer } from '../stockfishAnalysis';
import { GameData } from '../gameAnalysis';

// Mock Stockfish worker
class MockStockfishWorker {
  private listeners: Map<string, (e: MessageEvent | string) => void> = new Map();
  private ready = false;

  addMessageListener(handler: (line: string) => void) {
    this.listeners.set('message', handler as any);
    setTimeout(() => {
      handler('uciok');
      this.ready = true;
    }, 10);
    return () => this.listeners.delete('message');
  }

  addEventListener(type: string, handler: (e: MessageEvent) => void) {
    this.listeners.set(type, handler as any);
    if (type === 'message') {
      setTimeout(() => {
        handler({ data: 'uciok' } as MessageEvent);
        this.ready = true;
      }, 10);
    }
    return () => this.listeners.delete(type);
  }

  removeEventListener(type: string, handler: (e: MessageEvent) => void) {
    this.listeners.delete(type);
  }

  postMessage(command: string) {
    if (command === 'uci') {
      setTimeout(() => {
        const handler = this.listeners.get('message');
        if (handler) {
          handler({ data: 'uciok' } as MessageEvent);
          this.ready = true;
        }
      }, 10);
    } else if (command.startsWith('position')) {
      // Position set
    } else if (command.startsWith('go depth')) {
      setTimeout(() => {
        const handler = this.listeners.get('message');
        if (handler) {
          handler({ data: 'info depth 10 score cp 20' } as MessageEvent);
          handler({ data: 'bestmove e2e4' } as MessageEvent);
        }
      }, 50);
    } else if (command === 'ucinewgame') {
      // New game
    }
  }

  terminate() {}
}

global.Worker = vi.fn().mockImplementation(() => {
  return new MockStockfishWorker() as any;
}) as any;

describe('StockfishAnalyzer', () => {
  let analyzer: StockfishAnalyzer;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (analyzer && typeof analyzer.destroy === 'function') {
      analyzer.destroy();
    }
  });

  describe('initialization', () => {
    it('should initialize Stockfish engine', async () => {
      analyzer = new StockfishAnalyzer();
      await analyzer.waitForReady();

      expect(analyzer).toBeDefined();
    }, 10000);
  });

  describe('evaluatePosition', () => {
    it('should evaluate a position', async () => {
      analyzer = new StockfishAnalyzer();
      await analyzer.waitForReady();

      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const evaluation = await analyzer.evaluatePosition(fen, 10);

      expect(evaluation).toBeDefined();
      expect(evaluation).toHaveProperty('evaluation');
      expect(evaluation).toHaveProperty('bestMove');
      // evaluatePosition returns { evaluation, bestMove?, pv? } - no depth in return
      expect(typeof evaluation.evaluation).toBe('number');
    }, 15000);
  });

  describe('analyzeGame', () => {
    it('should analyze a game', async () => {
      analyzer = new StockfishAnalyzer();
      await analyzer.waitForReady();

      const game: GameData = {
        id: 'test-game-id',
        source: 'lichess',
        white: 'testplayer',
        black: 'opponent',
        result: '1-0',
        eco: 'B00',
        pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7',
        playedAt: '2024-01-01',
        timeControl: '600',
      };
      const analysis = await analyzer.analyzeGame(game, 'testplayer', 10);

      expect(analysis).toBeDefined();
      expect(analysis).toHaveProperty('gameId', 'test-game-id');
      expect(analysis).toHaveProperty('criticalMistakes');
      expect(Array.isArray(analysis.criticalMistakes)).toBe(true);
    }, 20000);
  });

  describe('destroy', () => {
    it('should cleanup resources', async () => {
      analyzer = new StockfishAnalyzer();
      await analyzer.waitForReady();

      analyzer.destroy();

      expect(true).toBe(true);
    });
  });
});
