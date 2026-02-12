import { describe, it, expect } from 'vitest';
import { extractMostPlayedLines } from '../moveSequenceExtractor';
import { GameData } from '../gameAnalysis';

describe('moveSequenceExtractor', () => {
  const mockGameData: GameData = {
    id: 'test-1',
    source: 'lichess',
    white: 'TestPlayer',
    black: 'Opponent',
    result: '1-0',
    eco: 'B00',
    playedAt: '2024-01-01',
    timeControl: '600',
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7',
  };

  describe('extractMostPlayedLines', () => {
    it('should extract move sequences for white games', () => {
      const games: GameData[] = [
        { ...mockGameData, pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6' },
        { ...mockGameData, pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6' },
        { ...mockGameData, pgn: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5' },
      ];

      const result = extractMostPlayedLines(games, 'TestPlayer', 5, 6);
      
      expect(result.white).toBeDefined();
      expect(result.white.length).toBeGreaterThan(0);
      if (result.white.length > 0) {
        expect(result.white[0].frequency).toBeGreaterThanOrEqual(0);
        expect(result.white[0].games).toBeGreaterThanOrEqual(1);
      }
    });

    it('should extract move sequences for black games', () => {
      const games: GameData[] = [
        { ...mockGameData, white: 'Opponent', black: 'TestPlayer', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6' },
        { ...mockGameData, white: 'Opponent', black: 'TestPlayer', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6' },
      ];

      const result = extractMostPlayedLines(games, 'TestPlayer', 5, 6);
      
      expect(result.black).toBeDefined();
      expect(result.black.length).toBeGreaterThan(0);
      if (result.black.length > 0) {
        expect(result.black[0].games).toBeGreaterThanOrEqual(1);
      }
    });

    it('should handle games without PGN', () => {
      const games: GameData[] = [
        { ...mockGameData, pgn: '' },
        { ...mockGameData, pgn: undefined as any },
      ];

      const result = extractMostPlayedLines(games, 'TestPlayer', 5, 6);
      
      expect(result.white).toBeDefined();
      expect(result.black).toBeDefined();
    });

    it('should handle empty games array', () => {
      const result = extractMostPlayedLines([], 'TestPlayer', 5, 6);
      
      expect(result.white).toEqual([]);
      expect(result.black).toEqual([]);
    });

    it('should limit results to maxSequences', () => {
      const games: GameData[] = Array(20).fill(null).map((_, i) => ({
        ...mockGameData,
        pgn: `1. e${i % 8 + 1} e${i % 8 + 1} 2. Nf3 Nc6`,
      }));

      const result = extractMostPlayedLines(games, 'TestPlayer', 5, 6);
      
      expect(result.white.length).toBeLessThanOrEqual(5);
      expect(result.black.length).toBeLessThanOrEqual(5);
    });

    it('should format moves in standard notation', () => {
      const games: GameData[] = [
        { ...mockGameData, pgn: '1. e4 e5 2. Nf3 Nc6' },
      ];

      const result = extractMostPlayedLines(games, 'TestPlayer', 5, 6);
      
      if (result.white.length > 0) {
        expect(result.white[0].notation).toContain('1.');
        expect(result.white[0].notation).toContain('e4');
      }
    });
  });
});
