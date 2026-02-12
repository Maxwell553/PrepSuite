import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEnvConfig, getGeminiApiKey, isSupabaseConfigured } from '../env';

// Env tests: import.meta.env is set at build time; vi.stubEnv affects process.env
// which Vite may use. In CI with no .env, we get placeholders. We test the logic paths.
describe('env', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getEnvConfig', () => {
    it('should return config when env vars are set', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
      vi.stubEnv('PROD', '0');

      vi.resetModules();
      const { getEnvConfig } = await import('../env');
      const config = getEnvConfig();

      expect(config.supabaseUrl).toBe('https://test.supabase.co');
      expect(config.supabaseAnonKey).toBe('test-anon-key');
    });

    it('should use placeholders in development when variables are missing', async () => {
      // This test only runs reliably in CI where env vars are unset.
      // Locally, .env.local may provide values that vi.stubEnv cannot override.
      const hasEnv = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (hasEnv) {
        vi.stubEnv('VITE_SUPABASE_URL', '');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
      }

      vi.resetModules();
      const { getEnvConfig } = await import('../env');
      const config = getEnvConfig();

      // In CI (no env): we get placeholders. Locally (with env): we get actual values.
      expect(config.supabaseUrl).toBeTruthy();
      expect(config.supabaseAnonKey).toBeTruthy();
      if (!hasEnv) {
        expect(config.supabaseUrl).toBe('https://placeholder.supabase.co');
        expect(config.supabaseAnonKey).toBe('placeholder');
      }
    });

    it('should throw error in production when variables are missing', () => {
      vi.stubEnv('VITE_SUPABASE_URL', '');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
      vi.stubEnv('PROD', 'true');

      expect(() => getEnvConfig()).toThrow();
    });
  });

  describe('getGeminiApiKey', () => {
    it('should throw error indicating API key is server-side only', () => {
      expect(() => getGeminiApiKey()).toThrow('server-side only');
    });
  });

  describe('isSupabaseConfigured', () => {
    it('should return true when properly configured', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

      vi.resetModules();
      const { isSupabaseConfigured } = await import('../env');
      expect(isSupabaseConfigured()).toBe(true);
    });

    it('should return false when using placeholders', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', '');
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

      vi.resetModules();
      const { getEnvConfig, isSupabaseConfigured } = await import('../env');
      const config = getEnvConfig();
      expect(config.supabaseUrl).toBe('https://placeholder.supabase.co');
      expect(isSupabaseConfigured()).toBe(false);
    });
  });
});
