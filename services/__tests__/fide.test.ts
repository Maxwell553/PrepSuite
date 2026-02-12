import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fideService } from '../fide';
import { createMockFetchResponse } from '../../__tests__/utils/mocks';

global.fetch = vi.fn();

describe('fideService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should try API first, then fall back to HTML scraping', async () => {
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

      // Mock: API fails (3 endpoints), then HTML succeeds
      (global.fetch as any)
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // API endpoint 1
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // API endpoint 2
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // API endpoint 3
        .mockResolvedValueOnce(createMockFetchResponse(mockHtml)); // HTML scraping succeeds

      const result = await fideService.getProfile('1503014');

      expect(result).not.toBeNull();
      expect(result?.name).toContain('Magnus');
      expect(result?.rating).toBe(2850);
      expect(result?.title).toBe('GM');
      // Should have tried all 3 API endpoints, then HTML
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('should use API if available', async () => {
      const mockApiResponse = {
        name: 'Magnus Carlsen',
        federation: 'NOR',
        birth_year: '1990',
        rating: 2850,
        title: 'GM',
      };

      // Mock: First API endpoint succeeds
      (global.fetch as any).mockResolvedValueOnce(
        createMockFetchResponse(mockApiResponse)
      );

      const result = await fideService.getProfile('1503014');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Magnus Carlsen');
      expect(result?.rating).toBe(2850);
      // Should only call first API endpoint, not try others or HTML scraping
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry HTML scraping on failure', async () => {
      const mockHtml = `
        <html>
          <head><title>Test Player FIDE Profile</title></head>
          <body>
            <h1 class="player-title">Test Player</h1>
            <div class="profile-standart">
              <p>2500</p>
            </div>
          </body>
        </html>
      `;

      // Mock: API fails (3 endpoints), HTML attempt 1 fails, HTML attempt 2 succeeds
      (global.fetch as any)
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // API endpoint 1
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // API endpoint 2
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // API endpoint 3
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 500)) // HTML attempt 1 fails
        .mockResolvedValueOnce(createMockFetchResponse(mockHtml)); // HTML attempt 2 succeeds

      const result = await fideService.getProfile('1234567');

      expect(result).not.toBeNull();
      // Should have tried all 3 API endpoints, then retried HTML scraping
      expect(global.fetch).toHaveBeenCalledTimes(5);
    });

    it('should return null for empty FIDE ID', async () => {
      const result = await fideService.getProfile('');

      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Network error')) // API fails
        .mockRejectedValueOnce(new Error('Network error')); // HTML fails

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

      // Mock: API fails (3 endpoints), then HTML succeeds
      (global.fetch as any)
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // API endpoint 1
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // API endpoint 2
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // API endpoint 3
        .mockResolvedValueOnce(createMockFetchResponse(mockHtml)); // HTML succeeds

      const result = await fideService.getProfile('1234567');

      expect(result).not.toBeNull();
      expect(result?.rating).toBe(2500);
    });
  });
});
