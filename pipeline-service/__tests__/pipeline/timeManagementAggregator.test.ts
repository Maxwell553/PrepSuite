import { describe, it, expect } from 'vitest';
import {
  computeTimeManagementStats,
  playerLostOnTime,
  playerWonOnTime,
} from '../../src/pipeline/timeManagementAggregator.js';
import type { GameData } from '../../src/lib/types.js';

describe('timeManagementAggregator', () => {
  it('detects Chess.com timeout loss', () => {
    const g: GameData = {
      id: '1',
      source: 'chess.com',
      white: 'Hero',
      black: 'Villain',
      result: '0-1',
      eco: 'A00',
      pgn: '1. e4 e5',
      playedAt: '2025-06-01T12:00:00.000Z',
      timeControl: '600',
      chessComWhiteResult: 'timeout',
      chessComBlackResult: 'win',
    };
    expect(playerLostOnTime(g, 'Hero')).toBe(true);
    expect(playerWonOnTime(g, 'Villain')).toBe(true);
  });

  it('detects Lichess outoftime loss for black', () => {
    const g: GameData = {
      id: '2',
      source: 'lichess',
      white: 'a',
      black: 'b',
      result: '1-0',
      eco: 'A00',
      pgn: '1. e4 e5',
      playedAt: '2025-06-02T12:00:00.000Z',
      timeControl: 'blitz',
      lichessStatus: 'outoftime',
    };
    expect(playerLostOnTime(g, 'b')).toBe(true);
    expect(playerWonOnTime(g, 'a')).toBe(true);
  });

  it('aggregates timeline and speeds', () => {
    const games: GameData[] = [
      {
        id: '1',
        source: 'lichess',
        white: 'p',
        black: 'x',
        result: '0-1',
        eco: 'A00',
        pgn: '1. e4',
        playedAt: '2025-01-15T12:00:00.000Z',
        timeControl: 'blitz',
        lichessStatus: 'outoftime',
      },
      {
        id: '2',
        source: 'lichess',
        white: 'p',
        black: 'y',
        result: '1-0',
        eco: 'A00',
        pgn: '1. d4',
        playedAt: '2025-01-20T12:00:00.000Z',
        timeControl: 'blitz',
        lichessStatus: 'outoftime',
      },
      {
        id: '3',
        source: 'lichess',
        white: 'z',
        black: 'p',
        result: '1-0',
        eco: 'A00',
        pgn: '1. c4',
        playedAt: '2025-02-01T12:00:00.000Z',
        timeControl: 'rapid',
        lichessStatus: 'mate',
      },
    ];

    const tm = computeTimeManagementStats(games, 'p');
    expect(tm).toBeDefined();
    expect(tm!.onlineGames).toBe(3);
    expect(tm!.lostOnTime).toBe(1);
    expect(tm!.wonOnTime).toBe(1);
    expect(tm!.bySpeed.some((r) => r.speed === 'blitz' && r.games === 2)).toBe(true);
    expect(tm!.timeline.length).toBeGreaterThanOrEqual(1);
  });

  it('returns undefined when no online games', () => {
    const g: GameData = {
      id: 'o',
      source: 'otb',
      white: 'p',
      black: 'q',
      result: '1-0',
      eco: 'A00',
      pgn: '',
      playedAt: '2025-01-01T12:00:00.000Z',
      timeControl: '',
    };
    expect(computeTimeManagementStats([g], 'p')).toBeUndefined();
  });
});
