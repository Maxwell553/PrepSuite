import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playerRepository } from '../playerRepository';

// Use vi.hoisted to avoid "Cannot access before initialization" in vi.mock factory
const mockFrom = vi.hoisted(() => vi.fn());
const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    auth: {
      getSession: mockGetSession,
    },
  },
}));

describe('playerRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
    };

    mockFrom.mockReturnValue(mockChain);
  });

  describe('findVerifiedPlayer', () => {
    it('should find player by FIDE ID', async () => {
      const mockPlayer = {
        id: '123',
        fide_id: '1503014',
        uscf_id: null,
        full_name: 'Test Player',
      };

      const mockChain = mockFrom();
      mockChain.maybeSingle.mockResolvedValue({
        data: mockPlayer,
        error: null,
      });

      const result = await playerRepository.findVerifiedPlayer('1503014', '');

      expect(result).toEqual(mockPlayer);
      expect(mockFrom).toHaveBeenCalledWith('players');
    });

    it('should find player by USCF ID when FIDE ID not found', async () => {
      // findVerifiedPlayer with empty FIDE: skips FIDE lookup, does 1 USCF lookup
      const mockChain = mockFrom();
      mockChain.maybeSingle.mockResolvedValueOnce({
        data: { id: '123', uscf_id: '12345678' },
        error: null,
      });

      const result = await playerRepository.findVerifiedPlayer('', '12345678');

      expect(result).not.toBeNull();
    });

    it('should return null when no IDs provided', async () => {
      const result = await playerRepository.findVerifiedPlayer('', '');

      expect(result).toBeNull();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('should return null when player not found', async () => {
      const mockChain = mockFrom();
      mockChain.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await playerRepository.findVerifiedPlayer('9999999', '');

      expect(result).toBeNull();
    });
  });

  describe('createVerifiedPlayer', () => {
    it('should create new player', async () => {
      const mockPlayerData = {
        full_name: 'Test Player',
        fide_id: '1503014',
        uscf_id: '',
        chess_com_username: 'testplayer',
        lichess_username: 'testplayer',
        metadata: {},
      };

      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      const findChain = mockFrom();
      findChain.maybeSingle.mockResolvedValue({ data: null, error: null });

      const insertChain = mockFrom();
      insertChain.insert.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: '123', ...mockPlayerData },
          error: null,
        }),
      });

      const result = await playerRepository.createVerifiedPlayer(mockPlayerData);

      expect(result).not.toBeNull();
    });

    it('should update existing player', async () => {
      const mockPlayerData = {
        full_name: 'Test Player',
        fide_id: '1503014',
        uscf_id: '',
        chess_com_username: 'testplayer',
        lichess_username: 'testplayer',
        metadata: {},
      };

      const existingPlayer = { id: '123', ...mockPlayerData };

      const findChain = mockFrom();
      findChain.maybeSingle.mockResolvedValue({ data: existingPlayer, error: null });

      const updateChain = mockFrom();
      updateChain.update.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: existingPlayer,
          error: null,
        }),
      });

      const result = await playerRepository.createVerifiedPlayer(mockPlayerData);

      expect(result).not.toBeNull();
    });
  });
});
