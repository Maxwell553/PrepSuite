import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies
vi.mock('../../src/pipeline/fideSearch.js', () => ({
  searchFideByName: vi.fn(),
  pickBestFideMatch: vi.fn(),
}));

vi.mock('../../src/pipeline/fideProfile.js', () => ({
  getFideProfile: vi.fn(),
}));

vi.mock('../../src/pipeline/uscfProfile.js', () => ({
  getUscfProfile: vi.fn(),
  searchUscfByName: vi.fn(),
}));

vi.mock('../../src/pipeline/geminiFallback.js', () => ({
  searchIdsViaGemini: vi.fn(),
  searchUsernamesViaGemini: vi.fn(),
}));

vi.mock('../../src/lib/fetchWithRetry.js', () => ({
  fetchWithRetry: vi.fn(),
}));

import { resolveIdentity } from '../../src/pipeline/identity.js';
import { searchFideByName, pickBestFideMatch } from '../../src/pipeline/fideSearch.js';
import { getFideProfile } from '../../src/pipeline/fideProfile.js';
import { getUscfProfile, searchUscfByName } from '../../src/pipeline/uscfProfile.js';
import { searchIdsViaGemini, searchUsernamesViaGemini } from '../../src/pipeline/geminiFallback.js';
import { fetchWithRetry } from '../../src/lib/fetchWithRetry.js';

const mockedSearchFide = vi.mocked(searchFideByName);
const mockedPickBest = vi.mocked(pickBestFideMatch);
const mockedGetFide = vi.mocked(getFideProfile);
const mockedGetUscf = vi.mocked(getUscfProfile);
const mockedSearchUscf = vi.mocked(searchUscfByName);
const mockedSearchIds = vi.mocked(searchIdsViaGemini);
const mockedSearchUsernames = vi.mocked(searchUsernamesViaGemini);
const mockedFetch = vi.mocked(fetchWithRetry);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no Gemini API key
  delete process.env.GEMINI_API_KEY;
});

describe('resolveIdentity', () => {
  it('uses provided FIDE ID without searching', async () => {
    mockedSearchUscf.mockResolvedValue([]);
    mockedSearchUsernames.mockResolvedValue({ chessComCandidates: [], lichessCandidates: [] });
    mockedGetFide.mockResolvedValue({
      name: 'Carlsen, Magnus',
      federation: 'NOR',
      birthYear: '1990',
      rating: 2830,
      title: 'GM',
    });
    mockedGetUscf.mockResolvedValue(null);
    mockedFetch.mockResolvedValue({ ok: false } as Response);

    const result = await resolveIdentity('Magnus Carlsen', '1503014', '', '', '');
    expect(result.verifiedName).toBe('Magnus Carlsen'); // normalized from "Carlsen, Magnus"
    expect(result.fideProfile?.rating).toBe(2830);
    expect(mockedSearchFide).not.toHaveBeenCalled();
  });

  it('searches FIDE by name when no ID provided', async () => {
    mockedSearchUsernames.mockResolvedValue({ chessComCandidates: [], lichessCandidates: [] });
    mockedSearchIds.mockResolvedValue({ fideId: null, uscfId: null });
    mockedSearchFide.mockResolvedValue([
      { fideId: '1503014', name: 'Carlsen, Magnus', federation: 'NOR', title: 'GM' },
    ]);
    mockedPickBest.mockReturnValue({
      fideId: '1503014',
      name: 'Carlsen, Magnus',
      federation: 'NOR',
      title: 'GM',
    });
    mockedSearchUscf.mockResolvedValue([]);
    mockedGetFide.mockResolvedValue({
      name: 'Carlsen, Magnus',
      federation: 'NOR',
      birthYear: '1990',
      rating: 2830,
      title: 'GM',
    });
    mockedGetUscf.mockResolvedValue(null);
    mockedFetch.mockResolvedValue({ ok: false } as Response);

    const result = await resolveIdentity('Magnus Carlsen', '', '', '', '');
    expect(mockedSearchFide).toHaveBeenCalledWith('Magnus Carlsen');
    expect(result.fideProfile?.rating).toBe(2830);
  });

  it('falls back to Gemini when FIDE search finds nothing', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockedSearchFide.mockResolvedValue([]);
    mockedPickBest.mockReturnValue(null);
    mockedSearchUscf.mockResolvedValue([]);
    mockedSearchIds.mockResolvedValue({ fideId: '1503014', uscfId: null });
    mockedSearchUsernames.mockResolvedValue({ chessComCandidates: [], lichessCandidates: [] });
    mockedGetFide.mockResolvedValue({
      name: 'Carlsen, Magnus',
      federation: 'NOR',
      birthYear: '1990',
      rating: 2830,
      title: 'GM',
    });
    mockedGetUscf.mockResolvedValue(null);
    mockedFetch.mockResolvedValue({ ok: false } as Response);

    const result = await resolveIdentity('Magnus Carlsen', '', '', '', '');
    expect(mockedSearchIds).toHaveBeenCalled();
    expect(result.fideProfile?.rating).toBe(2830);
  });

  it('trusts provided platform usernames', async () => {
    mockedSearchFide.mockResolvedValue([]);
    mockedPickBest.mockReturnValue(null);
    mockedSearchUscf.mockResolvedValue([]);
    mockedSearchIds.mockResolvedValue({ fideId: null, uscfId: null });
    mockedGetFide.mockResolvedValue(null);
    mockedGetUscf.mockResolvedValue(null);
    mockedFetch.mockResolvedValue({ ok: false } as Response);

    const result = await resolveIdentity('Magnus Carlsen', '', '', 'magnuscarlsen', 'DrNykterstein');
    expect(result.chessComUsername).toBe('magnuscarlsen');
    expect(result.lichessUsername).toBe('DrNykterstein');
  });

  it('rejects FIDE profile when name does not match', async () => {
    mockedSearchUscf.mockResolvedValue([]);
    mockedGetFide.mockResolvedValue({
      name: 'Chess Players Arbiters Trainers Database',
      federation: '',
      birthYear: '',
      rating: 0,
      title: '',
    });
    mockedGetUscf.mockResolvedValue(null);
    mockedFetch.mockResolvedValue({ ok: false } as Response);

    const result = await resolveIdentity('Magnus Carlsen', '9999', '', '', '');
    expect(result.fideProfile).toBeNull();
  });

  it('returns graceful result on fatal error', async () => {
    mockedSearchFide.mockRejectedValue(new Error('Network error'));
    mockedGetFide.mockResolvedValue(null);
    mockedGetUscf.mockResolvedValue(null);

    const result = await resolveIdentity('Test Player', '', '', '', '');
    expect(result.verifiedName).toBe('Test Player');
    expect(result.confidence).toBe(0);
  });
});
