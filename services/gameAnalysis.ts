
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
    weight?: number;
}
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
     */
    async generateStats(games: GameData[], targetUsername: string, side: 'white' | 'black'): Promise<OpeningStat[]> {
        return runWorkerTask('ANALYZE_GAMES', { games, targetUsername, side });
    },

    // Kept for backward compat if needed, but ideally unused
    resolveResult: () => '1/2-1/2'
};
