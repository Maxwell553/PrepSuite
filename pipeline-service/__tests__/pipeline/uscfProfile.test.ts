import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUscfProfile } from '../../src/pipeline/uscfProfile.js';

// Mock fetchWithRetry
vi.mock('../../src/lib/fetchWithRetry.js', () => ({
  fetchWithRetry: vi.fn(),
}));

import { fetchWithRetry } from '../../src/lib/fetchWithRetry.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures');
const mockedFetch = vi.mocked(fetchWithRetry);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getUscfProfile', () => {
  it('returns null for empty ID', async () => {
    const result = await getUscfProfile('');
    expect(result).toBeNull();
  });

  it('parses profile page format', async () => {
    const html = readFileSync(join(fixturesDir, 'uscf-profile.html'), 'utf-8');
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    } as Response);

    const result = await getUscfProfile('12345678', 0);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Smith, John');
    expect(result!.rating).toBe(1850);
    expect(result!.state).toBe('CA');
  });

  it('falls back to MSA page when profile page fails', async () => {
    const msaHtml = readFileSync(join(fixturesDir, 'uscf-msa.html'), 'utf-8');
    mockedFetch
      .mockResolvedValueOnce({ ok: false } as Response) // Profile page fails
      .mockResolvedValueOnce({
        ok: true,
        text: async () => msaHtml,
      } as Response); // MSA succeeds

    const result = await getUscfProfile('12345678', 0);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('SMITH, JOHN');
    expect(result!.rating).toBe(1850);
  });

  it('returns null when both pages fail', async () => {
    mockedFetch
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({ ok: false } as Response);

    const result = await getUscfProfile('12345678', 0);
    expect(result).toBeNull();
  });
});
