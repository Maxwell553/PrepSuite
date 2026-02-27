import { z } from 'zod';

/** Capitalize each word for display (e.g. "max ingargiola" -> "Max Ingargiola") */
export function capitalizeName(name: string): string {
  if (!name || !name.trim()) return name;
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Remove potentially dangerous characters */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>{}[\]\\/]/g, '')
    .slice(0, 1000);
}

export const analyzeRequestSchema = z.object({
  name: z
    .string()
    .min(1, 'Player name is required')
    .max(200, 'Player name must be less than 200 characters')
    .trim()
    .refine((val) => !/[<>{}[\]\\/]/.test(val), 'Player name contains invalid characters'),
  fideId: z
    .string()
    .max(20)
    .regex(/^[0-9]*$/, 'FIDE ID must contain only numbers')
    .optional()
    .or(z.literal('')),
  uscfId: z
    .string()
    .max(20)
    .regex(/^[0-9]*$/, 'USCF ID must contain only numbers')
    .optional()
    .or(z.literal('')),
  chessComUsername: z
    .string()
    .max(50)
    .regex(/^[a-zA-Z0-9_-]*$/, 'Chess.com username contains invalid characters')
    .optional()
    .or(z.literal('')),
  lichessUsername: z
    .string()
    .max(50)
    .regex(/^[a-zA-Z0-9_-]*$/, 'Lichess username contains invalid characters')
    .optional()
    .or(z.literal('')),
  gameLimit: z.number().int().min(1).max(5000).default(1000).optional(),
  onlineLimit: z.number().int().min(0).max(5000).optional(),
  otbLimit: z.number().int().min(0).max(5000).optional(),
}).refine(
  (data) => {
    const total = data.gameLimit ?? 1000;
    const online = data.onlineLimit ?? total;
    const otb = data.otbLimit ?? 0;
    return online + otb === total;
  },
  { message: 'onlineLimit + otbLimit must equal gameLimit', path: ['onlineLimit'] },
);

export type AnalyzeRequestInput = z.infer<typeof analyzeRequestSchema>;

const gameDataSchema = z.object({
  id: z.string().optional(),
  white: z.string(),
  black: z.string(),
  result: z.string(),
  eco: z.string(),
  pgn: z.string().optional(),
  playedAt: z.string(),
  source: z.string().optional(),
  timeControl: z.string().optional(),
  openingName: z.string().optional(),
});

export const chatRequestSchema = z.object({
  report: z.object({
    player: z.object({
      name: z.string().min(1),
      fideId: z.string().optional(),
      uscfId: z.string().optional(),
      country: z.string().optional(),
      currentRating: z.number().optional(),
      uscfRating: z.number().optional(),
      platforms: z
        .object({
          chessCom: z.string().optional(),
          lichess: z.string().optional(),
        })
        .optional(),
    }),
    whiteOpenings: z.array(z.any()).optional(),
    blackDefenses: z.array(z.any()).optional(),
    mostPlayedLines: z
      .object({
        white: z.array(z.any()).optional(),
        black: z.array(z.any()).optional(),
      })
      .optional(),
    preparationSummary: z.string().optional(),
    blackStrategicSummary: z.string().optional(),
    games: z.array(gameDataSchema).optional(),
  }),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(10000),
      }),
    )
    .optional(),
  question: z
    .string()
    .max(2000, 'Question must be less than 2000 characters')
    .optional(),
}).refine(
  (data) => (data.messages && data.messages.length > 0) || (data.question && data.question.trim().length > 0),
  { message: 'Either messages (with at least one message) or question is required', path: ['messages'] },
);

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

/** Validate chat request input */
export function validateChatRequest(input: unknown): ChatRequestInput {
  return chatRequestSchema.parse(input);
}

/** Validate and sanitize analyze request input */
export function validateAnalyzeRequest(input: unknown): AnalyzeRequestInput {
  const sanitized =
    typeof input === 'object' && input !== null
      ? {
          ...input,
          name:
            typeof (input as Record<string, unknown>).name === 'string'
              ? sanitizeString((input as Record<string, unknown>).name as string)
              : (input as Record<string, unknown>).name,
          fideId:
            typeof (input as Record<string, unknown>).fideId === 'string'
              ? ((input as Record<string, unknown>).fideId as string).trim()
              : (input as Record<string, unknown>).fideId,
          uscfId:
            typeof (input as Record<string, unknown>).uscfId === 'string'
              ? ((input as Record<string, unknown>).uscfId as string).trim()
              : (input as Record<string, unknown>).uscfId,
          chessComUsername:
            typeof (input as Record<string, unknown>).chessComUsername === 'string'
              ? ((input as Record<string, unknown>).chessComUsername as string).trim().toLowerCase()
              : (input as Record<string, unknown>).chessComUsername,
          lichessUsername:
            typeof (input as Record<string, unknown>).lichessUsername === 'string'
              ? ((input as Record<string, unknown>).lichessUsername as string).trim().toLowerCase()
              : (input as Record<string, unknown>).lichessUsername,
        }
      : input;

  return analyzeRequestSchema.parse(sanitized);
}
