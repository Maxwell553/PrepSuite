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

      // USCF tries profile page first, then MSA - 2 fetches per attempt
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // profile attempt 1
        .mockResolvedValueOnce(createMockFetchResponse(mockHtml)); // MSA attempt 1 succeeds

      const result = await uscfService.getProfile('12345678');

      expect(result).not.toBeNull();
      expect(result?.name).toContain('Test Player');
      expect(result?.rating).toBe(2400);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should use profile page when available', async () => {
      // Profile page (first try) uses JSON-style or h1 patterns; MSA uses font/b
      const mockHtml = `
        <html>
          <body>
            <h1>Test Player</h1>
            <script type="application/ld+json">{"regular": 2400}</script>
          </body>
        </html>
      `;

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        createMockFetchResponse(mockHtml)
      );

      const result = await uscfService.getProfile('12345678');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Test Player');
      expect(result?.rating).toBe(2400);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry HTML scraping on failure', async () => {
      const mockHtml = `
        <html>
          <body>
            <font size=+1><b>12345678: Test Player</b></font>
            <table>
              <tr><td>Regular Rating</td><td><b>2200</b></td></tr>
            </table>
          </body>
        </html>
      `;

      // Each attempt: profile fetch + MSA fetch. Need 6 mocks for 3 attempts, success on last MSA
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // attempt 1 profile
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 500)) // attempt 1 MSA
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // attempt 2 profile
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 500)) // attempt 2 MSA
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404)) // attempt 3 profile
        .mockResolvedValueOnce(createMockFetchResponse(mockHtml)); // attempt 3 MSA succeeds

      const result = await uscfService.getProfile('12345678');

      expect(result).not.toBeNull();
      expect(result?.rating).toBe(2200);
      expect(global.fetch).toHaveBeenCalledTimes(6);
    });

    it('should return null for empty USCF ID', async () => {
      const result = await uscfService.getProfile('');

      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new Error('Network error'));

      const result = await uscfService.getProfile('12345678');

      expect(result).toBeNull();
    });

    it('should extract name from generic fallback pattern', async () => {
      const mockHtml = `
        <html>
          <body>
            <font size=+1><b>12345678: Test Player Name</b></font>
            <table>
              <tr><td>Regular Rating</td><td><b>2200</b></td></tr>
            </table>
          </body>
        </html>
      `;

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createMockFetchResponse(null, false, 404))
        .mockResolvedValueOnce(createMockFetchResponse(mockHtml));

      const result = await uscfService.getProfile('12345678');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Test Player Name');
    });
  });
});
