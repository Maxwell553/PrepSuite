/* eslint-disable no-restricted-globals */
import { OpeningStat } from '../types';

// Duplicate interfaces needed for the worker (cannot import types that might bring in DOM libs or React)
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
    weight?: number;
}

const ECO_MAP: Record<string, string> = {
    'B01': 'Scandinavian Defense',
    'B07': 'Pirc Defense',
    'B12': 'Caro-Kann Defense',
    'B20': 'Sicilian Defense',
    'B30': 'Sicilian Defense (Rossolimo)',
    'B40': 'Sicilian Defense (Paulsen)',
    'B50': 'Sicilian Defense',
    'B90': 'Sicilian Najdorf',
    'C00': 'French Defense',
    'C11': 'French Defense (Classical)',
    'C42': 'Petrov Defense',
    'C45': 'Scotch Game',
    'C50': 'Italian Game',
    'C60': 'Ruy Lopez',
    'C67': 'Ruy Lopez (Berlin)',
    'C77': 'Ruy Lopez',
    'C84': 'Ruy Lopez (Closed)',
    'D02': 'Queens Pawn Game',
    'D30': 'Queens Gambit Declined',
    'D37': 'Queens Gambit Declined (Classical)',
    'D85': 'Grunfeld Defense',
    'E12': 'Queens Indian Defense',
    'E60': 'Kings Indian Defense',
    'E90': 'Kings Indian Defense'
};

/**
 * Aggregates ECO codes into very broad opening families
 * Groups all similar openings together for more reliable statistics
 */
function aggregateECO(eco: string): string {
    if (!eco || eco === 'Unknown') return 'Unknown';
    
    // Extract letter only - very broad aggregation
    const letter = eco[0];
    
    // Group by major opening families (very broad)
    if (letter === 'A') {
        return 'Flank & Irregular Openings'; // A00-A99
    }
    if (letter === 'B') {
        return 'Sicilian Defense'; // B00-B99 (all Sicilian and semi-open)
    }
    if (letter === 'C') {
        return 'Open & Semi-Open Games'; // C00-C99 (French, Italian, Ruy Lopez, etc.)
    }
    if (letter === 'D') {
        return 'Queen\'s Gambit Systems'; // D00-D99
    }
    if (letter === 'E') {
        return 'Indian Defenses'; // E00-E99
    }
    
    return 'Other Openings'; // Fallback
}

/**
 * Gets the human-readable opening name (no ECO codes)
 */
function getMainlineName(aggregatedECO: string): string {
    // Return the aggregated name directly (already human-readable, no ECO codes)
    return aggregatedECO;
}

// Manually implementing worker self interface for TS happiness
const ctx: Worker = self as any;

ctx.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;

    if (type === 'ANALYZE_GAMES') {
        const { games, targetUsername, side } = payload;
        try {
            const stats = generateStats(games, targetUsername, side);
            ctx.postMessage({ type: 'ANALYZE_GAMES_COMPLETE', payload: stats });
        } catch (error) {
            ctx.postMessage({ type: 'ANALYSIS_ERROR', error: String(error) });
        }
    }

    if (type === 'PARSE_LICHESS') {
        const { ndjson, targetUsername } = payload;
        try {
            const parsed = parseLichessGames(ndjson, targetUsername);
            ctx.postMessage({ type: 'PARSE_LICHESS_COMPLETE', payload: parsed });
        } catch (error) {
            ctx.postMessage({ type: 'ANALYSIS_ERROR', error: String(error) });
        }
    }

    if (type === 'PARSE_CHESSCOM') {
        const { games, targetUsername } = payload; // Raw chess.com games
        try {
            const parsed = parseChessComGames(games, targetUsername);
            ctx.postMessage({ type: 'PARSE_CHESSCOM_COMPLETE', payload: parsed });
        } catch (error) {
            ctx.postMessage({ type: 'ANALYSIS_ERROR', error: String(error) });
        }
    }
};

// --- Logic Moved from gameAnalysis.ts ---

interface ChessComGame {
    uuid?: string;
    white: { username: string; result: string };
    black: { username: string; result: string };
    eco?: string;
    pgn: string;
    end_time: number;
    time_control: string;
}

function parseChessComGames(games: unknown[], targetUsername: string): GameData[] {
    const typedGames = games as ChessComGame[];
    return typedGames.map(g => ({
        id: g.uuid || Math.random().toString(36),
        source: 'chess.com',
        white: g.white.username,
        black: g.black.username,
        result: resolveResult(g, targetUsername),
        eco: g.eco?.split('/').pop() || 'Unknown',
        pgn: g.pgn,
        playedAt: new Date(g.end_time * 1000).toISOString(),
        timeControl: g.time_control
    }));
}

function parseLichessGames(ndjson: string, targetUsername: string): GameData[] {
    if (!ndjson) return [];
    return ndjson.trim().split('\n').map(line => {
        try {
            const g = JSON.parse(line) as LichessGame;
            return {
                id: g.id,
                source: 'lichess',
                white: g.players.white.user.name,
                black: g.players.black.user.name,
                result: resolveResultLichess(g, targetUsername),
                eco: g.opening?.eco || g.eco || 'Unknown',
                pgn: g.pgn || '',
                playedAt: new Date(g.createdAt).toISOString(),
                timeControl: g.speed
            };
        } catch (e) {
            return null;
        }
    }).filter((g): g is GameData => g !== null);
}

function resolveResult(game: ChessComGame, target: string): string {
    // Result format is from white's perspective:
    // '1-0' = white wins, '0-1' = black wins, '1/2-1/2' = draw

    if (game.white.result === 'win') {
        // White wins → '1-0' from white's perspective
        return '1-0';
    }
    if (game.black.result === 'win') {
        // Black wins → '0-1' from white's perspective
        return '0-1';
    }
    return '1/2-1/2';
}

interface LichessGame {
    id: string;
    players: {
        white: { user: { name: string } };
        black: { user: { name: string } };
    };
    winner?: 'white' | 'black';
    pgn?: string;
    createdAt: number;
    speed: string;
    opening?: { eco?: string };
    eco?: string;
}

function resolveResultLichess(game: LichessGame, target: string): string {
    const winner = game.winner; // 'white' or 'black'
    const whiteName = game.players.white.user.name.toLowerCase();
    const blackName = game.players.black.user.name.toLowerCase();
    const targetLower = target.toLowerCase();

    if (!winner) return '1/2-1/2';
    
    // Result format is from white's perspective:
    // '1-0' = white wins, '0-1' = black wins, '1/2-1/2' = draw
    
    // If white wins
    if (winner === 'white') {
        // White wins → '1-0' from white's perspective
        return '1-0';
    }
    
    // If black wins
    if (winner === 'black') {
        // Black wins → '0-1' from white's perspective
        return '0-1';
    }
    
    return '1/2-1/2';
}

function generateStats(games: GameData[], targetUsername: string, side: 'white' | 'black'): OpeningStat[] {
    const targetLower = targetUsername.toLowerCase().trim();
    
    // Filter games where target player is on the specified side (white or black)
    // CRITICAL: Each game should only be counted once - if target is white, count only in white stats
    // If target is black, count only in black stats
    const relevantGames = games.filter(g => {
        const whiteLower = g.white.toLowerCase().trim();
        const blackLower = g.black.toLowerCase().trim();
        const isTargetWhite = whiteLower === targetLower;
        const isTargetBlack = blackLower === targetLower;
        
        // Only include games where target is on the specified side
        if (side === 'white') {
            return isTargetWhite; // Only games where target plays white
        } else {
            return isTargetBlack; // Only games where target plays black
        }
    });

    if (relevantGames.length === 0) {
        console.log(`[Stats] No ${side} games found for ${targetUsername}`);
        return [];
    }

    // Log breakdown for debugging
    const wins = relevantGames.filter(g => {
        if (side === 'white') return g.result === '1-0'; // White wins
        else return g.result === '0-1'; // Black wins
    }).length;
    const losses = relevantGames.filter(g => {
        if (side === 'white') return g.result === '0-1'; // White loses
        else return g.result === '1-0'; // Black loses
    }).length;
    const draws = relevantGames.filter(g => g.result === '1/2-1/2').length;
    console.log(`[Stats] ${side.toUpperCase()} stats for ${targetUsername}: ${relevantGames.length} games (${wins} wins, ${losses} losses, ${draws} draws)`);

    // Minimum games required for an opening to be included (ensures statistical significance)
    const MIN_GAMES = 10; // Reduced from 20 to show more openings
    
    // First pass: aggregate by mainline ECO
    const aggregatedStats: Record<string, any> = {};

    relevantGames.forEach(g => {
        const originalECO = g.eco || 'Unknown';
        const aggregatedECO = aggregateECO(originalECO);
        const weight = 1; // All games weighted equally

        if (!aggregatedStats[aggregatedECO]) {
            aggregatedStats[aggregatedECO] = {
                count: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                lastPlayed: g.playedAt,
                weightedCount: 0,
                rawWins: 0,
                rawDraws: 0,
                rawLosses: 0,
                originalECOs: new Set<string>() // Track which specific ECOs contributed
            };
        }
        
        aggregatedStats[aggregatedECO].count++;
        aggregatedStats[aggregatedECO].weightedCount += weight;
        aggregatedStats[aggregatedECO].originalECOs.add(originalECO);

        // Determine win/loss/draw from the target player's perspective
        // g.result is from white's perspective: '1-0' = white wins, '0-1' = black wins, '1/2-1/2' = draw
        let isWin = false;
        let isLoss = false;
        let isDraw = false;
        
        if (side === 'white') {
            // Target is playing white
            if (g.result === '1-0') {
                isWin = true; // White (target) wins
            } else if (g.result === '0-1') {
                isLoss = true; // White (target) loses
            } else if (g.result === '1/2-1/2') {
                isDraw = true; // Draw
            }
        } else {
            // Target is playing black
            if (g.result === '0-1') {
                isWin = true; // Black (target) wins
            } else if (g.result === '1-0') {
                isLoss = true; // Black (target) loses
            } else if (g.result === '1/2-1/2') {
                isDraw = true; // Draw
            }
        }

        if (isWin) {
            aggregatedStats[aggregatedECO].wins += weight;
            aggregatedStats[aggregatedECO].rawWins++;
        }
        if (isLoss) {
            aggregatedStats[aggregatedECO].losses += weight;
            aggregatedStats[aggregatedECO].rawLosses++;
        }
        if (isDraw) {
            aggregatedStats[aggregatedECO].draws += weight;
            aggregatedStats[aggregatedECO].rawDraws++;
        }

        if (new Date(g.playedAt) > new Date(aggregatedStats[aggregatedECO].lastPlayed)) {
            aggregatedStats[aggregatedECO].lastPlayed = g.playedAt;
        }
    });

    interface StatValue {
        weightedCount: number;
        count: number;
        wins: number;
        draws: number;
        losses: number;
        rawWins: number;
        rawDraws: number;
        rawLosses: number;
        lastPlayed: string;
        originalECOs: Set<string>;
    }

    const totalWeighted = Object.values(aggregatedStats).reduce((acc: number, s: StatValue) => acc + s.weightedCount, 0);

    // Filter by minimum games and sort by frequency
    const filteredStats = Object.entries(aggregatedStats)
        .filter(([_, s]: [string, StatValue]) => s.count >= MIN_GAMES) // Only include openings with enough games
        .map(([aggregatedECO, s]: [string, StatValue]) => {
            // Use raw counts (integers) for accurate statistics
            const rawWins = s.rawWins || 0;
            const rawDraws = s.rawDraws || 0;
            const rawLosses = s.rawLosses || 0;
            const totalGames = s.count || 0;
            
            // Calculate win rate from raw counts, not weighted counts
            // This ensures accurate percentages: wins / totalGames
            const winRate = totalGames > 0 ? rawWins / totalGames : 0;
            const drawRate = totalGames > 0 ? rawDraws / totalGames : 0;
            const lossRate = totalGames > 0 ? rawLosses / totalGames : 0;
            
            return {
                name: getMainlineName(aggregatedECO),
                eco: aggregatedECO,
                frequency: totalWeighted > 0 ? s.weightedCount / totalWeighted : 0,
                winRate: Math.max(0, Math.min(1, winRate)), // Clamp between 0 and 1
                drawRate: Math.max(0, Math.min(1, drawRate)),
                lossRate: Math.max(0, Math.min(1, lossRate)),
                wins: Math.round(rawWins), // Ensure integer
                draws: Math.round(rawDraws), // Ensure integer
                losses: Math.round(rawLosses), // Ensure integer
                totalGames: Math.round(totalGames), // Ensure integer
                trend: 'stable' as const
            };
        })
        .sort((a, b) => b.frequency - a.frequency); // Sort by frequency (most played first)

    // Return all openings that meet the minimum threshold (20+ games)
    // This ensures reliable statistics with sufficient sample sizes
    return filteredStats;
}
