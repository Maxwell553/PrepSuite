/**
 * Input validation schemas using Zod
 * Provides runtime validation for all user inputs
 */

import { z } from 'zod';

/** Capitalize each word for display (e.g. "max ingargiola" → "Max Ingargiola") */
export function capitalizeName(name: string): string {
  if (!name || !name.trim()) return name;
  return name.trim().split(/\s+/).map(word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

// Player search input validation
export const playerSearchSchema = z.object({
  name: z.string()
    .min(1, 'Player name is required')
    .max(200, 'Player name must be less than 200 characters')
    .trim()
    .refine((val) => {
      // Sanitize: remove potentially dangerous characters
      const dangerous = /[<>{}[\]\\\/]/;
      return !dangerous.test(val);
    }, 'Player name contains invalid characters'),
  
  fideId: z.string()
    .max(20, 'FIDE ID must be less than 20 characters')
    .regex(/^[0-9]*$/, 'FIDE ID must contain only numbers')
    .optional()
    .or(z.literal('')),
  
  uscfId: z.string()
    .max(20, 'USCF ID must be less than 20 characters')
    .regex(/^[0-9]*$/, 'USCF ID must contain only numbers')
    .optional()
    .or(z.literal('')),
  
  chessComUsername: z.string()
    .max(50, 'Chess.com username must be less than 50 characters')
    .regex(/^[a-zA-Z0-9_-]*$/, 'Chess.com username contains invalid characters')
    .optional()
    .or(z.literal('')),
  
  lichessUsername: z.string()
    .max(50, 'Lichess username must be less than 50 characters')
    .regex(/^[a-zA-Z0-9_-]*$/, 'Lichess username contains invalid characters')
    .optional()
    .or(z.literal('')),
  
  gameLimit: z.number()
    .int('Game limit must be an integer')
    .min(1, 'Game limit must be at least 1')
    .max(5000, 'Game limit cannot exceed 5000')
    .default(1000)
    .optional(),
});

export type PlayerSearchInput = z.infer<typeof playerSearchSchema>;

// UUID validation schema
export const uuidSchema = z.string().uuid('Invalid UUID format');

// Report ID validation
export const reportIdSchema = z.string().uuid('Invalid report ID format');

// Player ID validation
export const playerIdSchema = z.string().uuid('Invalid player ID format');

/**
 * Sanitizes a string input by removing potentially dangerous characters
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>{}[\]\\\/]/g, '') // Remove potentially dangerous characters
    .slice(0, 1000); // Limit length
}

/**
 * Validates and sanitizes player search input
 */
export function validatePlayerSearch(input: unknown): PlayerSearchInput {
  // First sanitize string fields if they exist
  const sanitized = typeof input === 'object' && input !== null
    ? {
        ...input,
        name: typeof (input as any).name === 'string' ? sanitizeString((input as any).name) : (input as any).name,
        fideId: typeof (input as any).fideId === 'string' ? (input as any).fideId.trim() : (input as any).fideId,
        uscfId: typeof (input as any).uscfId === 'string' ? (input as any).uscfId.trim() : (input as any).uscfId,
        chessComUsername: typeof (input as any).chessComUsername === 'string' 
          ? (input as any).chessComUsername.trim().toLowerCase() 
          : (input as any).chessComUsername,
        lichessUsername: typeof (input as any).lichessUsername === 'string' 
          ? (input as any).lichessUsername.trim().toLowerCase() 
          : (input as any).lichessUsername,
      }
    : input;
  
  return playerSearchSchema.parse(sanitized);
}

/**
 * Validates a UUID string
 */
export function validateUUID(uuid: string): string {
  return uuidSchema.parse(uuid);
}
