import { OpeningStat } from '../types';
import { identifyOpeningsBatch } from './openingService';
import AnalysisWorker from './analysis.worker?worker';

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
    /** Opening name from ECO library (when available) - replaces hardcoded classification */
    openingName?: string;
}

// Singleton worker instance to avoid spawning multiple threads
let worker: Worker | null = null;
const getWorker = () => {
    if (!worker) {
        worker = new AnalysisWorker();
    }
    return worker;
};

// Helper for Promisified worker calls with timeout
const runWorkerTask = <T>(type: string, payload: unknown, timeoutMs: number = 30000): Promise<T> => {
    return new Promise((resolve, reject) => {
        const w = getWorker();
        let resolved = false;

        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                w.removeEventListener('message', handler);
                reject(new Error(`Worker task "${type}" timed out after ${timeoutMs}ms`));
            }
        }, timeoutMs);

        const handler = (e: MessageEvent) => {
            if (resolved) return;
            
            if (e.data.type === type + '_COMPLETE') {
                resolved = true;
                clearTimeout(timeout);
                w.removeEventListener('message', handler);
                resolve(e.data.payload);
            } else if (e.data.type === 'ANALYSIS_ERROR') {
                resolved = true;
                clearTimeout(timeout);
                w.removeEventListener('message', handler);
                reject(new Error(e.data.error || 'Worker analysis error'));
            }
        };

        w.addEventListener('message', handler);
        w.postMessage({ type, payload });
    });
};

export const gameAnalysisService = {
    /**
     * Parses Chess.com game objects into unified GameData format (Async via Worker).
     */
    async parseChessComGames(games: unknown[], targetUsername: string): Promise<GameData[]> {
        return runWorkerTask('PARSE_CHESSCOM', { games, targetUsername });
    },

    /**
     * Parses Lichess NDJSON text into unified GameData format (Async via Worker).
     */
    async parseLichessGames(ndjson: string, targetUsername: string): Promise<GameData[]> {
        return runWorkerTask('PARSE_LICHESS', { ndjson, targetUsername });
    },

    /**
     * Aggregates stats (Async via Worker).
     * Uses ECO opening library for accurate classification (Caro-Kann, Sicilian, QGD, etc.).
     */
    async generateStats(games: GameData[], targetUsername: string, side: 'white' | 'black'): Promise<OpeningStat[]> {
        // Pre-process: identify openings via ECO library (12,000+ openings from lichess, SCID, etc.)
        // Lichess games may already have openingName - preserve it; only lookup when missing
        const openingResults = await identifyOpeningsBatch(games);
        const enrichedGames: GameData[] = games.map((g, i) => ({
            ...g,
            openingName: g.openingName ?? openingResults.get(i)?.name ?? undefined,
        }));
        const fromLibrary = enrichedGames.filter(g => g.openingName).length;
        const fromFallback = enrichedGames.length - fromLibrary;
        console.log(`[GameAnalysis] generateStats ${side}: ${enrichedGames.length} games, ${fromLibrary} from ECO library, ${fromFallback} will use fallback`);
        if (fromFallback > 0) {
            const sample = enrichedGames.filter(g => !g.openingName).slice(0, 3);
            console.log(`[GameAnalysis] Sample games without library match:`, sample.map(g => ({ eco: g.eco, pgnLen: g.pgn?.length })));
        }
        return runWorkerTask('ANALYZE_GAMES', { games: enrichedGames, targetUsername, side });
    },

    // Kept for backward compat if needed, but ideally unused
    resolveResult: () => '1/2-1/2'
};
