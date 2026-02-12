import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geminiService } from '../geminiService';

// Use vi.hoisted to avoid "Cannot access before initialization" in vi.mock factory
const mockGetSession = vi.hoisted(() => vi.fn());
const mockRefreshSession = vi.hoisted(() => vi.fn());
const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      refreshSession: mockRefreshSession,
    },
    functions: {
      invoke: mockInvoke,
    },
  },
}));

// Mock env
vi.mock('../../lib/env', () => ({
  getEnvConfig: vi.fn().mockReturnValue({
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-anon-key',
    isProduction: false,
  }),
}));

describe('geminiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockRefreshSession.mockResolvedValue({ data: { session: null }, error: null });
  });

  describe('generateContentWithSearch', () => {
    it('should call gemini-identity edge function', async () => {
      mockInvoke.mockResolvedValue({
        data: { text: 'Test response' },
        error: null,
      });

      const result = await geminiService.generateContentWithSearch('test prompt');

      expect(mockInvoke).toHaveBeenCalledWith(
        'gemini-identity',
        expect.objectContaining({
          body: expect.objectContaining({
            prompt: 'test prompt',
            useGoogleSearch: true,
          }),
        })
      );
      expect(result).toBe('Test response');
    });

    it('should handle errors gracefully', async () => {
      mockInvoke.mockResolvedValue({
        data: null,
        error: { message: 'API error' },
      });

      await expect(
        geminiService.generateContentWithSearch('test prompt')
      ).rejects.toThrow();
    });

    it('should use authenticated session if available', async () => {
      mockGetSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'test-token',
          },
        },
        error: null,
      });

      mockInvoke.mockResolvedValue({
        data: { text: 'Test response' },
        error: null,
      });

      await geminiService.generateContentWithSearch('test prompt');

      expect(mockInvoke).toHaveBeenCalledWith(
        'gemini-identity',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });
  });

  describe('generateContentWithSchema', () => {
    it('should call gemini-report edge function', async () => {
      const session = { access_token: 'test-token' };
      mockGetSession.mockResolvedValue({
        data: { session },
        error: null,
      });
      mockRefreshSession.mockResolvedValue({
        data: { session },
        error: null,
      });

      mockInvoke.mockResolvedValue({
        data: { data: 'Test response' },
        error: null,
      });

      const result = await geminiService.generateContentWithSchema(
        'test prompt',
        { type: 'object' }
      );

      expect(mockInvoke).toHaveBeenCalledWith(
        'gemini-report',
        expect.objectContaining({
          body: expect.objectContaining({
            prompt: 'test prompt',
            responseSchema: { type: 'object' },
          }),
        })
      );
      expect(result).toBe('Test response');
    });

    it('should handle rate limit errors', async () => {
      const session = { access_token: 'test-token' };
      mockGetSession.mockResolvedValue({
        data: { session },
        error: null,
      });
      mockRefreshSession.mockResolvedValue({
        data: { session },
        error: null,
      });

      mockInvoke.mockResolvedValue({
        data: null,
        error: {
          message: '429 Resource exhausted',
          status: 429,
        },
      });

      await expect(
        geminiService.generateContentWithSchema('test prompt', {})
      ).rejects.toThrow('Rate limit');
    }, 10000);

    it('should require authentication', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(
        geminiService.generateContentWithSchema('test prompt', {})
      ).rejects.toThrow('Authentication required');
    }, 10000);
  });
});
