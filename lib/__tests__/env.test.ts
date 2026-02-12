import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEnvConfig, getGeminiApiKey, isSupabaseConfigured } from '../env';

// Store original env
const originalEnv = import.meta.env;

describe('env', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original env
    Object.defineProperty(import.meta, 'env', {
      value: originalEnv,
      writable: true,
      configurable: true,
    });
  });

  describe('getEnvConfig', () => {
    it('should return config with valid environment variables', () => {
      Object.defineProperty(import.meta, 'env', {
        value: {
          VITE_SUPABASE_URL: 'https://test.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'test-anon-key',
          PROD: false,
        },
        writable: true,
        configurable: true,
      });

      const config = getEnvConfig();
      
      expect(config.supabaseUrl).toBe('https://test.supabase.co');
      expect(config.supabaseAnonKey).toBe('test-anon-key');
      expect(config.isProduction).toBe(false);
    });

    it('should use placeholders in development when variables are missing', () => {
      Object.defineProperty(import.meta, 'env', {
        value: {
          PROD: false,
        },
        writable: true,
        configurable: true,
      });

      const config = getEnvConfig();
      
      expect(config.supabaseUrl).toBe('https://placeholder.supabase.co');
      expect(config.supabaseAnonKey).toBe('placeholder');
    });

    it('should throw error in production when variables are missing', () => {
      Object.defineProperty(import.meta, 'env', {
        value: {
          PROD: true,
        },
        writable: true,
        configurable: true,
      });

      expect(() => getEnvConfig()).toThrow();
    });
  });

  describe('getGeminiApiKey', () => {
    it('should throw error indicating API key is server-side only', () => {
      expect(() => getGeminiApiKey()).toThrow('server-side only');
    });
  });

  describe('isSupabaseConfigured', () => {
    it('should return true when properly configured', () => {
      Object.defineProperty(import.meta, 'env', {
        value: {
          VITE_SUPABASE_URL: 'https://test.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'test-anon-key',
          PROD: false,
        },
        writable: true,
        configurable: true,
      });

      expect(isSupabaseConfigured()).toBe(true);
    });

    it('should return false when using placeholders', () => {
      Object.defineProperty(import.meta, 'env', {
        value: {
          PROD: false,
        },
        writable: true,
        configurable: true,
      });

      expect(isSupabaseConfigured()).toBe(false);
    });
  });
});
