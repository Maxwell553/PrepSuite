
import { OpeningStat } from '../types';

export interface GameData {
    id: string;
    source: 'chess.com' | 'lichess';
    white: string;
    black: string;
    result: string;
    eco: string;
    pgn: string;
    playedAt: string;
    timeControl: string;
}

export const gameAnalysisService = {
    /**
     * Parses Chess.com game objects into unified GameData format.
     */
    parseChessComGames(games: any[], targetUsername: string): GameData[] {
        return games.map(g => ({
            id: g.uuid || Math.random().toString(36),
            source: 'chess.com',
            white: g.white.username,
            black: g.black.username,
            result: this.resolveResult(g, targetUsername),
            eco: g.eco || 'Unknown',
            pgn: g.pgn,
            playedAt: new Date(g.end_time * 1000).toISOString(),
            timeControl: g.time_control
        }));
    },

    /**
     * Parses Lichess NDJSON text into unified GameData format.
     */
    parseLichessGames(ndjson: string, targetUsername: string): GameData[] {
        if (!ndjson) return [];
        return ndjson.trim().split('\n').map(line => {
            try {
                const g = JSON.parse(line);
                return {
                    id: g.id,
                    source: 'lichess',
                    white: g.players.white.user.name,
                    black: g.players.black.user.name,
                    result: this.resolveResultLichess(g, targetUsername),
                    eco: g.opening?.eco || g.eco || 'Unknown',
                    pgn: g.pgn || '',
                    playedAt: new Date(g.createdAt).toISOString(),
                    timeControl: g.speed
                };
            } catch (e) {
                return null;
            }
        }).filter(g => g !== null) as GameData[];
    },

    resolveResult(game: any, target: string): string {
        const white = game.white.username.toLowerCase();
        const black = game.black.username.toLowerCase();
        const targetLower = target.toLowerCase();

        if (game.white.result === 'win') return white === targetLower ? '1-0' : '0-1';
        if (game.black.result === 'win') return black === targetLower ? '0-1' : '1-0';
        return '1/2-1/2';
    },

    resolveResultLichess(game: any, target: string): string {
        const winner = game.winner; // 'white' or 'black'
        const whiteName = game.players.white.user.name.toLowerCase();
        const targetLower = target.toLowerCase();

        if (!winner) return '1/2-1/2';
        if (winner === 'white') return whiteName === targetLower ? '1-0' : '0-1';
        if (winner === 'black') return whiteName === targetLower ? '0-1' : '1-0';
        return '1/2-1/2';
    },

    /**
     * Aggregates games into OpeningStats.
     */
    aggregateOpeningStats(games: GameData[], side: 'white' | 'black'): OpeningStat[] {
        const statsMap: Record<string, {
            wins: number,
            draws: number,
            losses: number,
            total: number,
            lastPlayed: string
        }> = {};

        const filteredGames = games.filter(g => {
            return side === 'white'
                ? g.white.toLowerCase() === games[0]?.white.toLowerCase() // Simple check for side
                : g.black.toLowerCase() === games[0]?.black.toLowerCase();
        });

        // Better side check: we need the target username
        // Let's refine this to take the target username
        return []; // To be refined in next step
    },

    /**
     * Improved aggregator
     */
    generateStats(games: GameData[], targetUsername: string, side: 'white' | 'black'): OpeningStat[] {
        const targetLower = targetUsername.toLowerCase();
        const relevantGames = games.filter(g => {
            const isTargetWhite = g.white.toLowerCase() === targetLower;
            const isTargetBlack = g.black.toLowerCase() === targetLower;
            return side === 'white' ? isTargetWhite : isTargetBlack;
        });

        const stats: Record<string, any> = {};

        relevantGames.forEach(g => {
            const eco = g.eco;
            if (!stats[eco]) {
                stats[eco] = { count: 0, wins: 0, draws: 0, losses: 0, lastPlayed: g.playedAt };
            }
            stats[eco].count++;

            const isWin = (side === 'white' && g.result === '1-0') || (side === 'black' && g.result === '0-1');
            const isLoss = (side === 'white' && g.result === '0-1') || (side === 'black' && g.result === '1-0');
            const isDraw = g.result === '1/2-1/2';

            if (isWin) stats[eco].wins++;
            if (isLoss) stats[eco].losses++;
            if (isDraw) stats[eco].draws++;

            if (new Date(g.playedAt) > new Date(stats[eco].lastPlayed)) {
                stats[eco].lastPlayed = g.playedAt;
            }
        });

        if (relevantGames.length === 0) return [];

        return Object.entries(stats).map(([eco, s]) => ({
            name: eco, // We could map ECO to names later
            eco: eco,
            frequency: s.count / relevantGames.length,
            winRate: s.count > 0 ? s.wins / s.count : 0,
            drawRate: s.count > 0 ? s.draws / s.count : 0,
            lossRate: s.count > 0 ? s.losses / s.count : 0,
            trend: 'stable' as const
        })).sort((a, b) => b.frequency - a.frequency).slice(0, 10);
    }
};
