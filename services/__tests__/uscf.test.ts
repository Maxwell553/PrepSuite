import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uscfService } from '../uscf';
import { createMockFetchResponse } from '../../__tests__/utils/mocks';

global.fetch = vi.fn();

describe('uscfService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should try API first, then fall back to HTML scraping', async () => {
      const mockHtml = `
        <html>
          <body>
            <font size=+1><b>12345678: Test Player</b></font>
            <table>
              <tr>
                <td>Regular Rating</td>
                <td><b>2400</b></td>
              </tr>
            </table>
          </body>
        </html>
      `;

      // Mock: API fails (3 endpoints), then HTML succeeds
      (global.fetch as any)
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // API endpoint 1
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // API endpoint 2
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // API endpoint 3
        .mockResolvedValueOnce(createMockFetchResponse(mockHtml)); // HTML scraping succeeds

      const result = await uscfService.getProfile('12345678');

      expect(result).not.toBeNull();
      expect(result?.name).toContain('Test Player');
      expect(result?.rating).toBe(2400);
      // Should have tried all 3 API endpoints, then HTML
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('should use API if available', async () => {
      const mockApiResponse = {
        name: 'Test Player',
        rating: 2400,
        state: 'CA',
      };

      // Mock: First API endpoint succeeds
      (global.fetch as any).mockResolvedValueOnce(
        createMockFetchResponse(mockApiResponse)
      );

      const result = await uscfService.getProfile('12345678');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Test Player');
      expect(result?.rating).toBe(2400);
      // Should only call first API endpoint, not try others or HTML scraping
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry HTML scraping on failure', async () => {
      const mockHtml = `
        <html>
          <body>
            <font size=+1><b>12345678: Test Player</b></font>
            <table>
              <tr>
                <td>Regular Rating</td>
                <td><b>2200</b></td>
              </tr>
            </table>
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

      const result = await uscfService.getProfile('12345678');

      expect(result).not.toBeNull();
      // Should have tried all 3 API endpoints, then retried HTML scraping
      expect(global.fetch).toHaveBeenCalledTimes(5);
    });

    it('should return null for empty USCF ID', async () => {
      const result = await uscfService.getProfile('');

      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Network error')) // API fails
        .mockRejectedValueOnce(new Error('Network error')); // HTML fails

      const result = await uscfService.getProfile('12345678');

      expect(result).toBeNull();
    });

    it('should extract name from generic fallback pattern', async () => {
      const mockHtml = `
        <html>
          <body>
            <font size=+1><b>12345678: Test Player Name</b></font>
            <table>
              <tr>
                <td>Regular Rating</td>
                <td><b>2200</b></td>
              </tr>
            </table>
          </body>
        </html>
      `;

      // Mock: API fails (3 endpoints), then HTML succeeds
      (global.fetch as any)
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // API endpoint 1
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // API endpoint 2
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // API endpoint 3
        .mockResolvedValueOnce(createMockFetchResponse(mockHtml)); // HTML succeeds

      const result = await uscfService.getProfile('12345678');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Test Player Name');
    });
  });
});
