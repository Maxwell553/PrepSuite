import { describe, it, expect } from 'vitest';
import { namesMatch, verifyHandle } from '../../src/pipeline/verification.js';
import type { FideProfile, ChessComProfile, LichessProfile } from '../../src/lib/types.js';

describe('namesMatch', () => {
  it('matches exact names', () => {
    expect(namesMatch('Magnus Carlsen', 'Magnus Carlsen')).toBe(true);
  });

  it('matches "Last, First" format', () => {
    expect(namesMatch('Magnus Carlsen', 'Carlsen, Magnus')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(namesMatch('magnus carlsen', 'CARLSEN, MAGNUS')).toBe(true);
  });

  it('matches with partial names (2+ parts)', () => {
    expect(namesMatch('Magnus Carlsen', 'Magnus Oystein Carlsen')).toBe(true);
  });

  it('matches single-word names', () => {
    expect(namesMatch('Firouzja', 'Firouzja, Alireza')).toBe(true);
  });

  it('rejects completely different names', () => {
    expect(namesMatch('Magnus Carlsen', 'John Smith')).toBe(false);
  });

  it('rejects similar-looking but different names (short substring false positive)', () => {
    expect(namesMatch('Caleb Klenoff', 'Le Quang Liem')).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(namesMatch('', 'Magnus Carlsen')).toBe(false);
    expect(namesMatch('Magnus Carlsen', '')).toBe(false);
  });

  it('handles special characters', () => {
    expect(namesMatch('José Raúl Capablanca', 'Capablanca, José Raúl')).toBe(true);
  });

  it('matches abbreviated surname (FIDE lists "Gukesh D" for Gukesh Dommaraju)', () => {
    expect(namesMatch('Gukesh Dommaraju', 'Gukesh D')).toBe(true);
    expect(namesMatch('Gukesh D', 'Gukesh Dommaraju')).toBe(true);
  });
});

describe('verifyHandle', () => {
  const fideProfile: FideProfile = {
    name: 'Carlsen, Magnus',
    federation: 'NOR',
    birthYear: '1990',
    rating: 2830,
    title: 'GM',
  };

  it('rejects when FIDE title exists but profile has none', () => {
    const profile = { username: 'someone', title: '' } as unknown as ChessComProfile;
    const result = verifyHandle('someone', 'chess.com', profile, 'Magnus Carlsen', fideProfile);
    expect(result).toBeNull();
  });

  it('rejects when titles mismatch', () => {
    const profile = { username: 'someone', title: 'IM' } as unknown as ChessComProfile;
    const result = verifyHandle('someone', 'chess.com', profile, 'Magnus Carlsen', fideProfile);
    expect(result).toBeNull();
  });

  it('accepts when title matches + name matches', () => {
    const profile = {
      username: 'magnuscarlsen',
      title: 'GM',
      name: 'Magnus Carlsen',
    } as unknown as ChessComProfile;
    const result = verifyHandle('magnuscarlsen', 'chess.com', profile, 'Magnus Carlsen', fideProfile);
    expect(result).toBe('magnuscarlsen');
  });

  it('rejects when title matches but name not in bio or profile', () => {
    const profile = {
      username: 'unknownhandle',
      title: 'GM',
      name: '',
      status: '',
    } as unknown as ChessComProfile;
    const result = verifyHandle('unknownhandle', 'chess.com', profile, 'Magnus Carlsen', fideProfile);
    expect(result).toBeNull();
  });

  it('accepts when title matches + name in bio', () => {
    const profile = {
      username: 'magnuscarlsen',
      title: 'GM',
      name: '',
      status: 'Magnus Carlsen, World Champion',
    } as unknown as ChessComProfile;
    const result = verifyHandle('magnuscarlsen', 'chess.com', profile, 'Magnus Carlsen', fideProfile);
    expect(result).toBe('magnuscarlsen');
  });

  it('accepts on name match without title', () => {
    const noTitleFide = { ...fideProfile, title: '' };
    const profile = {
      username: 'testplayer',
      name: 'Magnus Carlsen',
    } as unknown as ChessComProfile;
    const result = verifyHandle('testplayer', 'chess.com', profile, 'Magnus Carlsen', noTitleFide);
    expect(result).toBe('testplayer');
  });

  it('rejects when profile name is empty (no handle matching)', () => {
    const noTitleFide = { ...fideProfile, title: '' };
    const profile = {
      username: 'magnuscarlsen',
      name: '',
    } as unknown as ChessComProfile;
    const result = verifyHandle('magnuscarlsen', 'chess.com', profile, 'Magnus Carlsen', noTitleFide);
    expect(result).toBeNull();
  });

  it('accepts Lichess realName when firstName/lastName empty', () => {
    const noTitleFide = { ...fideProfile, title: '' };
    const profile = {
      id: 'jmwgroff',
      username: 'jmwgroff',
      profile: { realName: 'Jordan Groff' },
      perfs: { blitz: { rating: 2400 } },
    } as unknown as LichessProfile;
    const result = verifyHandle('jmwgroff', 'lichess', profile, 'Jordan Groff', noTitleFide);
    expect(result).toBe('jmwgroff');
  });

  it('handles Lichess profile structure', () => {
    const noTitleFide = { ...fideProfile, title: '' };
    const profile = {
      id: 'magnuscarlsen',
      username: 'MagnusCarlsen',
      profile: { firstName: 'Magnus', lastName: 'Carlsen' },
      perfs: { blitz: { rating: 3000 } },
    } as unknown as LichessProfile;
    const result = verifyHandle('MagnusCarlsen', 'lichess', profile, 'Magnus Carlsen', noTitleFide);
    expect(result).toBe('MagnusCarlsen');
  });

  it('rejects when no match found', () => {
    const noTitleFide = { ...fideProfile, title: '' };
    const profile = {
      username: 'randomuser',
      name: 'John Doe',
    } as unknown as ChessComProfile;
    const result = verifyHandle('randomuser', 'chess.com', profile, 'Magnus Carlsen', noTitleFide);
    expect(result).toBeNull();
  });
});
