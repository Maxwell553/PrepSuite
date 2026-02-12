import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playerRepository } from '../playerRepository';

// Mock Supabase
const mockFrom = vi.fn();
const mockSupabase = {
  from: mockFrom,
};

vi.mock('../../lib/supabase', () => ({
  supabase: mockSupabase,
}));

describe('playerRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset mock chain
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
      const mockChain1 = mockFrom();
      const mockChain2 = mockFrom();
      
      mockChain1.maybeSingle.mockResolvedValueOnce({ data: null, error: null }); // FIDE search
      mockChain2.maybeSingle.mockResolvedValueOnce({
        data: { id: '123', uscf_id: '12345678' },
        error: null,
      }); // USCF search

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

      // Mock findVerifiedPlayer to return null (player doesn't exist)
      const findChain = mockFrom();
      findChain.maybeSingle.mockResolvedValue({ data: null, error: null });
      
      // Mock auth.getSession
      const { supabase } = await import('../../lib/supabase');
      (supabase.auth.getSession as any).mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      });

      // Mock insert
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
      
      // Mock findVerifiedPlayer to return existing player
      const findChain = mockFrom();
      findChain.maybeSingle.mockResolvedValue({ data: existingPlayer, error: null });
      
      // Mock update
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
