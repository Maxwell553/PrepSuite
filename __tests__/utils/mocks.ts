/**
 * Test utilities and mocks for external services
 */

import { GameData } from '../../services/gameAnalysis';
import { vi } from 'vitest';

// Fix GameData type to match actual interface
interface MockGameData {
  white: string;
  black: string;
  result: string;
  date?: string;
  pgn?: string;
  whiteElo?: number;
  blackElo?: number;
  id?: string;
  source?: 'chess.com' | 'lichess';
  eco?: string;
  playedAt?: string;
  timeControl?: string;
}
import { FideProfile } from '../../services/fide';
import { UscfProfile } from '../../services/uscf';
import { ChessComProfile, ChessComStats } from '../../services/chessCom';
import { LichessProfile } from '../../services/lichess';

/**
 * Mock game data for testing
 */
export const mockGameData: MockGameData = {
  white: 'TestPlayer',
  black: 'Opponent',
  result: '1-0',
  date: '2024.01.01',
  pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O',
  whiteElo: 1500,
  blackElo: 1500,
};

export const mockGameDataArray: MockGameData[] = [
  mockGameData,
  {
    ...mockGameData,
    pgn: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 Be7',
    result: '0-1',
  },
  {
    ...mockGameData,
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7',
    result: '1/2-1/2',
  },
];

/**
 * Mock FIDE profile
 */
export const mockFideProfile: FideProfile = {
  name: 'Test Player',
  federation: 'USA',
  birthYear: '1990',
  rating: 2500,
  title: 'GM',
};

/**
 * Mock USCF profile
 */
export const mockUscfProfile: UscfProfile = {
  id: '12345678',
  name: 'Test Player',
  state: 'CA',
  rating: 2400,
};

/**
 * Mock Chess.com profile
 */
export const mockChessComProfile: ChessComProfile = {
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

export const mockChessComStats: ChessComStats = {
  chess_rapid: { last: { rating: 2200 } },
  chess_blitz: { last: { rating: 2100 } },
  chess_bullet: { last: { rating: 2000 } },
  fide: 2500,
};

/**
 * Mock Lichess profile
 */
export const mockLichessProfile: LichessProfile = {
  id: 'testplayer',
  username: 'testplayer',
  perfs: {
    blitz: { rating: 2100 },
    rapid: { rating: 2200 },
    classical: { rating: 2300 },
  },
  profile: {
    firstName: 'Test',
    lastName: 'Player',
    country: 'US',
  },
  title: 'NM',
};

/**
 * Mock fetch response helper
 */
export function createMockFetchResponse(data: any, ok: boolean = true, status: number = 200): Response {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
    headers: new Headers(),
  } as Response;
}

/**
 * Mock Supabase client
 */
export const mockSupabaseClient = {
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
  functions: {
    invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
};
