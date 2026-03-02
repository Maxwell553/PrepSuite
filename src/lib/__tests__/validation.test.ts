import { describe, it, expect } from 'vitest';
import {
  validatePlayerSearch,
  validateUUID,
  sanitizeString,
  playerSearchSchema,
} from '../validation';

describe('validation', () => {
  describe('sanitizeString', () => {
    it('should remove dangerous characters', () => {
      // sanitizeString removes individual dangerous characters, not full tags
      expect(sanitizeString('test<script>alert("xss")</script>')).toBe('testscriptalert("xss")script');
      expect(sanitizeString('test{code}')).toBe('testcode');
      expect(sanitizeString('test[array]')).toBe('testarray');
    });

    it('should trim whitespace', () => {
      expect(sanitizeString('  test  ')).toBe('test');
    });

    it('should limit length to 1000 characters', () => {
      const longString = 'a'.repeat(2000);
      expect(sanitizeString(longString).length).toBe(1000);
    });
  });

  describe('playerSearchSchema', () => {
    it('should validate valid player search input', () => {
      const validInput = {
        name: 'Magnus Carlsen',
        fideId: '1503014',
        chessComUsername: 'magnuscarlsen',
        lichessUsername: 'DrNykterstein',
        gameLimit: 100,
      };

      const result = playerSearchSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const invalidInput = {
        name: '',
        fideId: '1503014',
      };

      const result = playerSearchSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject name with dangerous characters', () => {
      const invalidInput = {
        name: 'test<script>',
        fideId: '1503014',
      };

      const result = playerSearchSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject invalid FIDE ID format', () => {
      const invalidInput = {
        name: 'Test Player',
        fideId: 'abc123',
      };

      const result = playerSearchSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject invalid chess.com username format', () => {
      const invalidInput = {
        name: 'Test Player',
        chessComUsername: 'user@name',
      };

      const result = playerSearchSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject game limit above maximum', () => {
      const invalidInput = {
        name: 'Test Player',
        gameLimit: 2001,
      };

      const result = playerSearchSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should accept game limit at maximum (2000)', () => {
      const validInput = {
        name: 'Test Player',
        gameLimit: 2000,
      };

      const result = playerSearchSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.gameLimit).toBe(2000);
    });

    it('should accept optional fields as empty strings', () => {
      const validInput = {
        name: 'Test Player',
        fideId: '',
        uscfId: '',
        chessComUsername: '',
        lichessUsername: '',
      };

      const result = playerSearchSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });
  });

  describe('validatePlayerSearch', () => {
    it('should validate and sanitize player search input', () => {
      const input = {
        name: '  Magnus Carlsen  ',
        fideId: '1503014',
        chessComUsername: '  MagnusCarlsen  ',
        lichessUsername: '  DrNykterstein  ',
        gameLimit: 100,
      };

      const result = validatePlayerSearch(input);
      expect(result.name).toBe('Magnus Carlsen');
      expect(result.chessComUsername).toBe('magnuscarlsen');
      expect(result.lichessUsername).toBe('drnykterstein');
    });

    it('should throw error for invalid input', () => {
      const invalidInput = {
        name: '',
      };

      expect(() => validatePlayerSearch(invalidInput)).toThrow();
    });
  });

  describe('validateUUID', () => {
    it('should validate correct UUID format', () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      expect(() => validateUUID(validUUID)).not.toThrow();
    });

    it('should reject invalid UUID format', () => {
      const invalidUUID = 'not-a-uuid';
      expect(() => validateUUID(invalidUUID)).toThrow();
    });

    it('should reject empty string', () => {
      expect(() => validateUUID('')).toThrow();
    });
  });
});
