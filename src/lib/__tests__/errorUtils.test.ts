import { describe, it, expect, vi } from 'vitest';
import {
  getUserFriendlyError,
  isNetworkError,
  isRetryableError,
  logError,
} from '../errorUtils';

describe('errorUtils', () => {
  describe('getUserFriendlyError', () => {
    it('should handle network errors', () => {
      const error = new Error('Network request failed');
      const message = getUserFriendlyError(error);
      expect(message).toContain('Network error');
    });

    it('should handle timeout errors', () => {
      const error = new Error('Request timed out');
      const message = getUserFriendlyError(error, { operation: 'analysis' });
      expect(message).toContain('timed out');
      expect(message).toContain('analysis');
    });

    it('should handle 401 unauthorized errors', () => {
      const error = new Error('401 Unauthorized');
      const message = getUserFriendlyError(error);
      expect(message).toContain('Authentication');
    });

    it('should handle Gemini/Vertex AI 401 as service unavailable (not user auth)', () => {
      const error = new Error('Gemini API error: 401');
      const message = getUserFriendlyError(error);
      expect(message).toContain('AI service temporarily unavailable');
      expect(message).not.toContain('log in');
    });

    it('should handle 403 forbidden errors', () => {
      const error = new Error('403 Forbidden');
      const message = getUserFriendlyError(error, { operation: 'save report' });
      expect(message).toContain('Permission denied');
    });

    it('should handle rate limit errors', () => {
      const error = new Error('429 Rate limit exceeded');
      const message = getUserFriendlyError(error);
      expect(message).toContain('rate limit');
    });

    it('should handle server errors', () => {
      const error = new Error('500 Internal Server Error');
      const message = getUserFriendlyError(error);
      expect(message).toContain('Server error');
    });

    it('should handle RLS errors', () => {
      const error = new Error('Row level security policy violation');
      const message = getUserFriendlyError(error);
      expect(message).toContain('Database permission');
    });

    it('should handle not found errors', () => {
      const error = new Error('404 Not Found');
      const message = getUserFriendlyError(error);
      expect(message).toContain('not found');
    });

    it('should return generic message for unknown errors', () => {
      // getUserFriendlyError returns the original message if it's user-friendly (short, no stack trace)
      const error = new Error('Some unknown error');
      const message = getUserFriendlyError(error);
      // The function returns the original message since it's user-friendly (< 100 chars, no "at" or "Error:")
      expect(message).toBe('Some unknown error');
    });

    it('should return generic message for complex errors', () => {
      const error = new Error('Some complex error at line 123: Error: Something went wrong in the system');
      const message = getUserFriendlyError(error);
      expect(message).toContain('unexpected error');
    });

    it('should handle non-Error objects', () => {
      const error = 'String error';
      const message = getUserFriendlyError(error);
      expect(message).toContain('unexpected error');
    });
  });

  describe('isNetworkError', () => {
    it('should detect network errors', () => {
      expect(isNetworkError(new Error('Network request failed'))).toBe(true);
      expect(isNetworkError(new Error('Failed to fetch'))).toBe(true);
      expect(isNetworkError(new Error('NetworkError'))).toBe(true);
    });

    it('should not detect non-network errors', () => {
      expect(isNetworkError(new Error('Validation error'))).toBe(false);
      expect(isNetworkError(new Error('500 Server Error'))).toBe(false);
    });

    it('should return false for non-Error objects', () => {
      expect(isNetworkError('string')).toBe(false);
      expect(isNetworkError(null)).toBe(false);
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      expect(isRetryableError(new Error('Network request failed'))).toBe(true);
      expect(isRetryableError(new Error('Request timeout'))).toBe(true);
      expect(isRetryableError(new Error('500 Internal Server Error'))).toBe(true);
      expect(isRetryableError(new Error('502 Bad Gateway'))).toBe(true);
      expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
      expect(isRetryableError(new Error('504 Gateway Timeout'))).toBe(true);
      // Test with lowercase message (function converts to lowercase)
      expect(isRetryableError(new Error('ERROR 500'))).toBe(true);
    });

    it('should not identify non-retryable errors', () => {
      expect(isRetryableError(new Error('400 Bad Request'))).toBe(false);
      expect(isRetryableError(new Error('401 Unauthorized'))).toBe(false);
      expect(isRetryableError(new Error('404 Not Found'))).toBe(false);
    });
  });

  describe('logError', () => {
    it('should log error with context', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Test error');
      
      logError(error, { operation: 'test', source: 'test-file' });
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
