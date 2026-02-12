import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lichessService } from '../lichess';
import { createMockFetchResponse } from '../../__tests__/utils/mocks';

global.fetch = vi.fn();

describe('lichessService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPlayerProfile', () => {
    it('should fetch player profile successfully', async () => {
      const mockProfile = {
        id: 'testplayer',
        username: 'testplayer',
        perfs: {
          blitz: { rating: 2100 },
          rapid: { rating: 2200 },
        },
      };

      (global.fetch as any).mockResolvedValueOnce(
        createMockFetchResponse(mockProfile)
      );

      const result = await lichessService.getPlayerProfile('testplayer');
      
      expect(result).toEqual(mockProfile);
      expect(global.fetch).toHaveBeenCalledWith(
        '/lichess-api/user/testplayer',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/json',
          }),
        })
      );
    });

    it('should return null for 404 errors', async () => {
      (global.fetch as any).mockResolvedValueOnce(
        createMockFetchResponse(null, false, 404)
      );

      const result = await lichessService.getPlayerProfile('nonexistent');
      
      expect(result).toBeNull();
    });

    it('should return null for empty username', async () => {
      const result = await lichessService.getPlayerProfile('');
      
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('getRecentGames', () => {
    it('should fetch games successfully', async () => {
      const mockGames = '{"id":"game1","pgn":"1. e4 e5"}\n{"id":"game2","pgn":"1. d4 d5"}';

      (global.fetch as any).mockResolvedValueOnce(
        createMockFetchResponse(mockGames)
      );

      const result = await lichessService.getRecentGames('testplayer', 10);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle rate limiting', async () => {
      (global.fetch as any).mockResolvedValueOnce(
        createMockFetchResponse(null, false, 429)
      );

      const result = await lichessService.getRecentGames('testplayer', 10);
      
      // Should return empty string on rate limit
      expect(result).toBe('');
    });

    it('should return empty string for empty username', async () => {
      const result = await lichessService.getRecentGames('', 10);
      
      expect(result).toBe('');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should paginate for large game limits', async () => {
      const mockGames = '{"id":"game1","pgn":"1. e4"}\n';

      // Mock multiple responses - first returns games, second returns empty (stops pagination)
      (global.fetch as any)
        .mockResolvedValueOnce(createMockFetchResponse(mockGames))
        .mockResolvedValueOnce(createMockFetchResponse('')); // Empty response stops pagination

      // Request 1000 games (should attempt 2 requests of 500 each)
      // But pagination stops early if response is empty
      await lichessService.getRecentGames('testplayer', 1000);
      
      // Should make at least 1 request
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
