import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fideService } from '../fide';
import { createMockFetchResponse } from '../../__tests__/utils/mocks';

global.fetch = vi.fn();

describe('fideService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should fetch profile via HTML scraping', async () => {
      const mockHtml = `
        <html>
          <head><title>Magnus Carlsen FIDE Profile</title></head>
          <body>
            <h1 class="player-title">Magnus Carlsen</h1>
            <div class="profile-standart">
              <p>2850</p>
              <p>STANDARD</p>
            </div>
            <div class="profile-info-country">NOR</div>
            <div class="profile-info-byear">1990</div>
            <div class="profile-info-title">GM</div>
          </body>
        </html>
      `;

      // FIDE now uses HTML scraping only; 1 fetch per attempt, 3 attempts max
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // attempt 1
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // attempt 2
        .mockResolvedValueOnce(createMockFetchResponse(mockHtml)); // attempt 3 succeeds

      const result = await fideService.getProfile('1503014');

      expect(result).not.toBeNull();
      expect(result?.name).toContain('Magnus');
      expect(result?.rating).toBe(2850);
      expect(result?.title).toBe('GM');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should succeed on first attempt when HTML returns valid data', async () => {
      const mockHtml = `
        <html>
          <head><title>Magnus Carlsen FIDE Profile</title></head>
          <body>
            <h1 class="player-title">Magnus Carlsen</h1>
            <div class="profile-standart"><p>2850</p></div>
          </body>
        </html>
      `;

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockFetchResponse(mockHtml)
      );

      const result = await fideService.getProfile('1503014');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Magnus Carlsen');
      expect(result?.rating).toBe(2850);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry HTML scraping on failure', async () => {
      const mockHtml = `
        <html>
          <head><title>Test Player FIDE Profile</title></head>
          <body>
            <h1 class="player-title">Test Player</h1>
            <div class="profile-standart"><p>2500</p></div>
          </body>
        </html>
      `;

      // 404, 404, then success on 3rd attempt
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404))
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404))
        .mockResolvedValueOnce(createMockFetchResponse(mockHtml));

      const result = await fideService.getProfile('1234567');

      expect(result).not.toBeNull();
      expect(result?.rating).toBe(2500);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should return null for empty FIDE ID', async () => {
      const result = await fideService.getProfile('');

      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new Error('Network error'));

      const result = await fideService.getProfile('1503014');

      expect(result).toBeNull();
    });

    it('should extract rating from fallback patterns', async () => {
      const mockHtml = `
        <html>
          <head><title>Test Player FIDE Profile</title></head>
          <body>
            <h1 class="player-title">Test Player</h1>
            <div class="profile-standart">
              <p>2500</p>
              <p>STANDARD</p>
            </div>
          </body>
        </html>
      `;

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404))
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404))
        .mockResolvedValueOnce(createMockFetchResponse(mockHtml));

      const result = await fideService.getProfile('1234567');

      expect(result).not.toBeNull();
      expect(result?.rating).toBe(2500);
    });
  });
});
