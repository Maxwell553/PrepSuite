import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chessComService } from '../chessCom';
import { createMockFetchResponse } from '../../__tests__/utils/mocks';

// Mock global fetch
global.fetch = vi.fn();

describe('chessComService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getPlayerProfile', () => {
    it('should fetch player profile successfully', async () => {
      const mockProfile = {
        avatar: 'https://example.com/avatar.jpg',
        username: 'testplayer',
        name: 'Test Player',
        country: 'US',
        followers: 1000,
        last_online: Date.now() / 1000,
        joined: 1609459200,
        status: 'online',
        is_streamer: false,
        verified: true,
      };

      (global.fetch as any).mockResolvedValueOnce(
        createMockFetchResponse(mockProfile)
      );

      const result = await chessComService.getPlayerProfile('testplayer');
      
      expect(result).toEqual(mockProfile);
      expect(global.fetch).toHaveBeenCalledWith(
        '/chess-api/pub/player/testplayer',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.any(String),
          }),
        })
      );
    });

    it('should return null for 404 errors', async () => {
      (global.fetch as any).mockResolvedValueOnce(
        createMockFetchResponse(null, false, 404)
      );

      const result = await chessComService.getPlayerProfile('nonexistent');
      
      expect(result).toBeNull();
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await expect(
        chessComService.getPlayerProfile('testplayer')
      ).rejects.toThrow();
    });
  });

  describe('getPlayerStats', () => {
    it('should fetch player stats successfully', async () => {
      const mockStats = {
        chess_rapid: { last: { rating: 2200 } },
        chess_blitz: { last: { rating: 2100 } },
        chess_bullet: { last: { rating: 2000 } },
        fide: 2500,
      };

      (global.fetch as any).mockResolvedValueOnce(
        createMockFetchResponse(mockStats)
      );

      const result = await chessComService.getPlayerStats('testplayer');
      
      expect(result).toEqual(mockStats);
    });

    it('should throw error for 404 errors', async () => {
      (global.fetch as any).mockResolvedValueOnce(
        createMockFetchResponse(null, false, 404)
      );

      await expect(
        chessComService.getPlayerStats('nonexistent')
      ).rejects.toThrow();
    });
  });

  describe('getRecentGames', () => {
    it('should fetch recent games successfully', async () => {
      const mockGames = [
        {
          white: { username: 'player1', rating: 1500 },
          black: { username: 'player2', rating: 1600 },
          pgn: '1. e4 e5 2. Nf3',
          time_control: '600',
          end_time: Date.now() / 1000,
        },
      ];

      (global.fetch as any).mockResolvedValueOnce(
        createMockFetchResponse({ games: mockGames })
      );

      const result = await chessComService.getRecentGames('testplayer', true, 10);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle rate limiting with retry', async () => {
      // First request returns 429
      (global.fetch as any).mockResolvedValueOnce(
        createMockFetchResponse(null, false, 429)
      );
      
      // Second request succeeds
      (global.fetch as any).mockResolvedValueOnce(
        createMockFetchResponse({ games: [] })
      );

      // Mock setTimeout to speed up test
      vi.useFakeTimers();
      
      const promise = chessComService.getRecentGames('testplayer', true, 10);
      
      // Fast-forward time
      await vi.advanceTimersByTimeAsync(2000);
      
      const result = await promise;
      
      vi.useRealTimers();
      
      expect(result).toBeDefined();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
