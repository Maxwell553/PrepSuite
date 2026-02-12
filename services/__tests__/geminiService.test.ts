import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geminiService } from '../geminiService';

// Mock Supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    functions: {
      invoke: vi.fn(),
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
  });

  describe('generateContentWithSearch', () => {
    it('should call gemini-identity edge function', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      (supabase.functions.invoke as any).mockResolvedValue({
        data: { response: 'Test response' },
        error: null,
      });

      const result = await geminiService.generateContentWithSearch('test prompt');
      
      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        'gemini-identity',
        expect.objectContaining({
          body: expect.objectContaining({
            prompt: 'test prompt',
            useGoogleSearch: true,
          }),
        })
      );
      // The function returns data.text
      expect(result).toBe('Test response');
    });

    it('should handle errors gracefully', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      (supabase.functions.invoke as any).mockResolvedValue({
        data: null,
        error: { message: 'API error' },
      });

      await expect(
        geminiService.generateContentWithSearch('test prompt')
      ).rejects.toThrow();
    });

    it('should use authenticated session if available', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      (supabase.auth.getSession as any).mockResolvedValue({
        data: {
          session: {
            access_token: 'test-token',
          },
        },
        error: null,
      });

      (supabase.functions.invoke as any).mockResolvedValue({
        data: { text: 'Test response' },
        error: null,
      });

      await geminiService.generateContentWithSearch('test prompt');
      
      expect(supabase.functions.invoke).toHaveBeenCalledWith(
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
      const { supabase } = await import('../../lib/supabase');
      
      (supabase.auth.getSession as any).mockResolvedValue({
        data: {
          session: {
            access_token: 'test-token',
          },
        },
        error: null,
      });

      (supabase.functions.invoke as any).mockResolvedValue({
        data: { data: { data: 'Test response' } },
        error: null,
      });

      const result = await geminiService.generateContentWithSchema(
        'test prompt',
        { type: 'object' }
      );

      expect(supabase.functions.invoke).toHaveBeenCalledWith(
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
      const { supabase } = await import('../../lib/supabase');
      
      (supabase.auth.getSession as any).mockResolvedValue({
        data: {
          session: {
            access_token: 'test-token',
          },
        },
        error: null,
      });

      (supabase.functions.invoke as any).mockResolvedValue({
        data: null,
        error: {
          message: '429 Resource exhausted',
          status: 429,
        },
      });

      await expect(
        geminiService.generateContentWithSchema('test prompt', {})
      ).rejects.toThrow('Rate limit');
    });

    it('should require authentication', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      (supabase.auth.getSession as any).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(
        geminiService.generateContentWithSchema('test prompt', {})
      ).rejects.toThrow('Authentication required');
    });
  });
});
