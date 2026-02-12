import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gameAnalysisService } from '../gameAnalysis';
import { GameData } from '../gameAnalysis';

// Mock the worker
vi.mock('../analysis.worker?worker', () => {
  return {
    default: class MockWorker {
      private listeners: Map<string, (e: MessageEvent) => void> = new Map();
      
      addEventListener(type: string, listener: (e: MessageEvent) => void) {
        this.listeners.set(type, listener);
      }
      
      removeEventListener(type: string, listener: (e: MessageEvent) => void) {
        this.listeners.delete(type);
      }
      
      postMessage(message: { type: string; payload: any }) {
        // Simulate worker response
        setTimeout(() => {
          const handler = this.listeners.get('message');
          if (handler) {
            if (message.type === 'PARSE_CHESSCOM') {
              handler({
                data: {
                  type: 'PARSE_CHESSCOM_COMPLETE',
                  payload: [
                    {
                      id: 'game1',
                      source: 'chess.com',
                      white: 'TestPlayer',
                      black: 'Opponent',
                      result: '1-0',
                      eco: 'B00',
                      pgn: '1. e4 e5 2. Nf3',
                      playedAt: '2024-01-01',
                      timeControl: '600',
                    },
                  ],
                },
              } as MessageEvent);
            } else if (message.type === 'PARSE_LICHESS') {
              handler({
                data: {
                  type: 'PARSE_LICHESS_COMPLETE',
                  payload: [
                    {
                      id: 'game2',
                      source: 'lichess',
                      white: 'TestPlayer',
                      black: 'Opponent',
                      result: '0-1',
                      eco: 'D00',
                      pgn: '1. d4 d5',
                      playedAt: '2024-01-02',
                      timeControl: '300',
                    },
                  ],
                },
              } as MessageEvent);
            } else if (message.type === 'ANALYZE_GAMES') {
              handler({
                data: {
                  type: 'ANALYZE_GAMES_COMPLETE',
                  payload: [
                    {
                      name: 'King\'s Pawn',
                      eco: 'B00',
                      frequency: 0.5,
                      winRate: 0.6,
                      drawRate: 0.2,
                      lossRate: 0.2,
                      wins: 3,
                      draws: 1,
                      losses: 1,
                      totalGames: 5,
                      trend: 'stable' as const,
                    },
                  ],
                },
              } as MessageEvent);
            }
          }
        }, 10);
      }
      
      terminate() {}
    },
  };
});

describe('gameAnalysisService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseChessComGames', () => {
    it('should parse Chess.com games via worker', async () => {
      const mockGames = [
        {
          white: { username: 'TestPlayer', rating: 1500 },
          black: { username: 'Opponent', rating: 1600 },
          pgn: '1. e4 e5 2. Nf3',
          time_control: '600',
          end_time: Date.now() / 1000,
        },
      ];

      const result = await gameAnalysisService.parseChessComGames(mockGames, 'TestPlayer');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('white');
        expect(result[0]).toHaveProperty('source', 'chess.com');
      }
    });
  });

  describe('parseLichessGames', () => {
    it('should parse Lichess games via worker', async () => {
      const mockNdjson = '{"id":"game1","pgn":"1. e4 e5"}\n{"id":"game2","pgn":"1. d4 d5"}';

      const result = await gameAnalysisService.parseLichessGames(mockNdjson, 'TestPlayer');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('source', 'lichess');
      }
    });
  });

  describe('generateStats', () => {
    it('should generate opening stats via worker', async () => {
      const mockGames: GameData[] = [
        {
          id: 'game1',
          source: 'chess.com',
          white: 'TestPlayer',
          black: 'Opponent',
          result: '1-0',
          eco: 'B00',
          pgn: '1. e4 e5',
          playedAt: '2024-01-01',
          timeControl: '600',
        },
      ];

      const result = await gameAnalysisService.generateStats(mockGames, 'TestPlayer', 'white');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('name');
        expect(result[0]).toHaveProperty('frequency');
        expect(result[0]).toHaveProperty('winRate');
      }
    });
  });
});
