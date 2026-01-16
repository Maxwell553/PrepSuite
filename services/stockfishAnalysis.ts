import { GameData } from './gameAnalysis';

export interface EngineEvaluation {
    gameId: string;
    moveNumber: number;
    position: string; // FEN
    evaluation: number; // Centipawns (positive = white advantage, negative = black advantage)
    depth: number;
    bestMove?: string;
    pv?: string[]; // Principal variation
}

export interface GameAnalysis {
    gameId: string;
    criticalMistakes: Array<{
        moveNumber: number;
        move: string;
        evaluationBefore: number;
        evaluationAfter: number;
        mistakeSeverity: number; // How bad the mistake was
    }>;
    averageEvaluation: number;
    evaluationTrend: 'improving' | 'declining' | 'stable';
    endgameAccuracy: number; // 0-100
}

/**
 * Analyzes games using Stockfish engine
 * Evaluates key positions and identifies mistakes
 */
export class StockfishAnalyzer {
    private stockfish: any;
    private isReady: boolean = false;
    private readyPromise: Promise<void>;

    constructor() {
        // Initialize Stockfish worker to avoid WASM loading issues in main thread
        this.readyPromise = this.initializeStockfish();
    }

    private async initializeStockfish(): Promise<void> {
        try {
            const wasmSupported = typeof WebAssembly === 'object' &&
                WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));

            const wasmWorkerUrl = new URL('stockfish.js/stockfish.wasm.js', import.meta.url);
            const asmWorkerUrl = new URL('stockfish.js/stockfish.js', import.meta.url);

            const initWorker = async (workerUrl: URL): Promise<void> => {
                this.stockfish = new Worker(workerUrl, { type: 'classic' });

                return new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Stockfish initialization timeout'));
                    }, 5000);

                    const removeListener = this.addMessageListener((line) => {
                        if (line === 'uciok' || line.includes('uciok')) {
                            clearTimeout(timeout);
                            this.isReady = true;
                            console.log('[Stockfish] Engine ready');
                            removeListener();
                            resolve();
                        }
                    });

                    this.stockfish.postMessage('uci');
                });
            };

            try {
                await initWorker(wasmSupported ? wasmWorkerUrl : asmWorkerUrl);
            } catch (error) {
                console.warn('[Stockfish] WASM worker failed, falling back to asm.js:', error);
                if (this.stockfish?.terminate) {
                    this.stockfish.terminate();
                }
                await initWorker(asmWorkerUrl);
            }
        } catch (error) {
            console.error('[Stockfish] Failed to initialize:', error);
            throw error;
        }
    }

    private addMessageListener(handler: (line: string) => void): () => void {
        const wrapped = (event: MessageEvent | string) => {
            const line = typeof event === 'string' ? event : String(event.data ?? '');
            handler(line);
        };

        if (this.stockfish.addMessageListener) {
            this.stockfish.addMessageListener(wrapped);
            return () => this.stockfish.removeMessageListener?.(wrapped);
        }

        if (this.stockfish.addEventListener) {
            this.stockfish.addEventListener('message', wrapped);
            return () => this.stockfish.removeEventListener('message', wrapped);
        }

        if (this.stockfish.onmessage !== undefined) {
            const oldHandler = this.stockfish.onmessage;
            this.stockfish.onmessage = (event: MessageEvent | string) => {
                if (oldHandler) {
                    oldHandler(event);
                }
                wrapped(event);
            };
            return () => {
                this.stockfish.onmessage = oldHandler;
            };
        }

        return () => {};
    }

    async waitForReady(): Promise<void> {
        await this.readyPromise;
    }

    /**
     * Evaluates a position from a sequence of moves
     */
    async evaluatePositionFromMoves(moves: string, depth: number = 8): Promise<{
        evaluation: number;
        bestMove?: string;
        pv?: string[];
    }> {
        await this.waitForReady();

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Stockfish evaluation timeout'));
            }, 8000); // 8 second timeout for faster analysis

            let evaluation = 0;
            let bestMove: string | undefined;
            let pv: string[] = [];
            let depthReached = 0;
            let bestMoveReceived = false;
            
            const removeListener = this.addMessageListener((line) => {
                // Parse depth
                const depthMatch = line.match(/depth\s+(\d+)/);
                if (depthMatch) {
                    depthReached = parseInt(depthMatch[1], 10);
                }

                // Parse evaluation: "info depth 15 score cp 45 pv e2e4 e7e5 ..."
                if (line.includes('score cp')) {
                    const cpMatch = line.match(/score cp (-?\d+)/);
                    if (cpMatch) {
                        evaluation = parseInt(cpMatch[1], 10);
                    }

                    // Parse best move from PV
                    const pvMatch = line.match(/pv\s+([a-h1-8O-]+(?:\s+[a-h1-8O-]+)*)/);
                    if (pvMatch) {
                        const moveList = pvMatch[1].trim().split(/\s+/).filter(m => m);
                        if (moveList.length > 0) {
                            bestMove = moveList[0];
                            pv = moveList;
                        }
                    }

                    // If target depth reached, resolve
                    if (depthReached >= depth && !bestMoveReceived) {
                        bestMoveReceived = true;
                        clearTimeout(timeout);
                        removeListener();
                        resolve({ evaluation, bestMove, pv });
                    }
                }

                // Check for mate
                if (line.includes('score mate')) {
                    const mateMatch = line.match(/score mate (-?\d+)/);
                    if (mateMatch) {
                        const mateIn = parseInt(mateMatch[1], 10);
                        evaluation = mateIn > 0 ? 10000 : -10000; // Large value for mate
                        if (!bestMoveReceived) {
                            bestMoveReceived = true;
                            clearTimeout(timeout);
                            removeListener();
                            resolve({ evaluation, bestMove, pv });
                        }
                    }
                }

                // Check if analysis is complete
                if (line.startsWith('bestmove')) {
                    if (!bestMoveReceived) {
                        bestMoveReceived = true;
                        clearTimeout(timeout);
                        removeListener();
                        resolve({ evaluation, bestMove, pv });
                    }
                }
            });
            
            // Set position using moves
            if (moves.trim()) {
                this.stockfish.postMessage(`position startpos moves ${moves}`);
            } else {
                this.stockfish.postMessage('position startpos');
            }
            this.stockfish.postMessage(`go depth ${depth}`);
        });
    }

    /**
     * Evaluates a position from FEN (for compatibility)
     */
    async evaluatePosition(fen: string, depth: number = 8): Promise<{
        evaluation: number;
        bestMove?: string;
        pv?: string[];
    }> {
        await this.waitForReady();

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Stockfish evaluation timeout'));
            }, 10000);

            let evaluation = 0;
            let bestMove: string | undefined;
            let pv: string[] = [];
            let depthReached = 0;
            let bestMoveReceived = false;
            
            const removeListener = this.addMessageListener((line) => {
                const depthMatch = line.match(/depth\s+(\d+)/);
                if (depthMatch) {
                    depthReached = parseInt(depthMatch[1], 10);
                }

                if (line.includes('score cp')) {
                    const cpMatch = line.match(/score cp (-?\d+)/);
                    if (cpMatch) {
                        evaluation = parseInt(cpMatch[1], 10);
                    }

                    const pvMatch = line.match(/pv\s+([a-h1-8O-]+(?:\s+[a-h1-8O-]+)*)/);
                    if (pvMatch) {
                        const moveList = pvMatch[1].trim().split(/\s+/).filter(m => m);
                        if (moveList.length > 0) {
                            bestMove = moveList[0];
                            pv = moveList;
                        }
                    }

                    if (depthReached >= depth && !bestMoveReceived) {
                        bestMoveReceived = true;
                        clearTimeout(timeout);
                        removeListener();
                        resolve({ evaluation, bestMove, pv });
                    }
                }

                if (line.includes('score mate')) {
                    const mateMatch = line.match(/score mate (-?\d+)/);
                    if (mateMatch) {
                        const mateIn = parseInt(mateMatch[1], 10);
                        evaluation = mateIn > 0 ? 10000 : -10000;
                        if (!bestMoveReceived) {
                            bestMoveReceived = true;
                            clearTimeout(timeout);
                            removeListener();
                            resolve({ evaluation, bestMove, pv });
                        }
                    }
                }

                if (line.startsWith('bestmove')) {
                    if (!bestMoveReceived) {
                        bestMoveReceived = true;
                        clearTimeout(timeout);
                        removeListener();
                        resolve({ evaluation, bestMove, pv });
                    }
                }
            });
            
            this.stockfish.postMessage(`position fen ${fen}`);
            this.stockfish.postMessage(`go depth ${depth}`);
        });
    }

    /**
     * Analyzes a single game for critical mistakes and patterns
     * Optimized to analyze key positions only (not every move)
     */
    async analyzeGame(game: GameData, targetUsername: string): Promise<GameAnalysis> {
        if (!game.pgn || game.pgn.trim().length === 0) {
            return {
                gameId: game.id,
                criticalMistakes: [],
                averageEvaluation: 0,
                evaluationTrend: 'stable',
                endgameAccuracy: 0
            };
        }

        await this.waitForReady();

        try {
            // Parse PGN to get moves
            const moves = this.parsePGN(game.pgn);
            if (moves.length < 10) {
                // Skip very short games
                return {
                    gameId: game.id,
                    criticalMistakes: [],
                    averageEvaluation: 0,
                    evaluationTrend: 'stable',
                    endgameAccuracy: 0
                };
            }

            const isTargetWhite = game.white.toLowerCase() === targetUsername.toLowerCase();
            const evaluations: number[] = [];
            const criticalMistakes: GameAnalysis['criticalMistakes'] = [];

            // Set up initial position
            this.stockfish.postMessage('ucinewgame');
            
            // Analyze fewer key positions to reduce analysis time and response size
            // Focus on: opening (move 10), middlegame (move 20, 30), endgame (move 40+)
            // Reduced from every 5th move to every 10th move for faster processing
            const keyPositions = [
                10, 20, 30, 40, 50,
                ...Array.from({ length: Math.min(Math.floor((moves.length - 50) / 10), 10) }, (_, i) => 50 + (i + 1) * 10)
            ].filter(pos => pos < moves.length);

            for (const moveIndex of keyPositions) {
                try {
                    // Build position up to this move using UCI move notation
                    const movesToPosition = moves.slice(0, moveIndex);
                    const moveSequence = movesToPosition.join(' ');
                    
                    // Evaluate position directly using Stockfish's position command
                    // Reduced depth from 10 to 6 for faster analysis and smaller response size
                    const evalResult = await this.evaluatePositionFromMoves(moveSequence, 6);
                    const currentEval = isTargetWhite ? evalResult.evaluation : -evalResult.evaluation;
                    evaluations.push(currentEval);

                    // Check if this was the target player's move and if it was a mistake
                    if (moveIndex > 0) {
                        const prevMoves = moves.slice(0, moveIndex - 1).join(' ');
                        const prevEval = await this.evaluatePositionFromMoves(prevMoves, 6);
                        const evalSwing = Math.abs(evalResult.evaluation - prevEval.evaluation);
                        const isTargetMove = ((moveIndex - 1) % 2 === 0) === isTargetWhite;
                        
                        // Detect significant mistakes (>150 centipawns)
                        if (isTargetMove && evalSwing > 150) {
                            const mistakeSeverity = Math.min(evalSwing / 100, 10);
                            criticalMistakes.push({
                                moveNumber: Math.floor(moveIndex / 2) + 1,
                                move: moves[moveIndex - 1],
                                evaluationBefore: prevEval.evaluation,
                                evaluationAfter: evalResult.evaluation,
                                mistakeSeverity
                            });
                        }
                    }
                } catch (posError) {
                    console.warn(`[Stockfish] Error analyzing position at move ${moveIndex}:`, posError);
                    continue;
                }
            }

            if (evaluations.length === 0) {
                return {
                    gameId: game.id,
                    criticalMistakes: [],
                    averageEvaluation: 0,
                    evaluationTrend: 'stable',
                    endgameAccuracy: 0
                };
            }

            // Calculate statistics
            const averageEvaluation = evaluations.reduce((a, b) => a + b, 0) / evaluations.length;
            
            // Determine trend
            const firstHalf = evaluations.slice(0, Math.floor(evaluations.length / 2));
            const secondHalf = evaluations.slice(Math.floor(evaluations.length / 2));
            const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
            const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;
            const trend = secondAvg > firstAvg + 50 ? 'improving' : 
                         secondAvg < firstAvg - 50 ? 'declining' : 'stable';

            // Endgame accuracy (last 5 evaluations)
            const endgameEvals = evaluations.slice(-5);
            const endgameAvg = endgameEvals.length > 0 ? endgameEvals.reduce((a, b) => a + b, 0) / endgameEvals.length : 0;
            const endgameAccuracy = Math.max(0, Math.min(100, 100 - Math.abs(endgameAvg) / 10));

            return {
                gameId: game.id,
                criticalMistakes: criticalMistakes.slice(0, 5).sort((a, b) => b.mistakeSeverity - a.mistakeSeverity),
                averageEvaluation,
                evaluationTrend: trend,
                endgameAccuracy
            };
        } catch (error) {
            console.error(`[Stockfish] Error analyzing game ${game.id}:`, error);
            return {
                gameId: game.id,
                criticalMistakes: [],
                averageEvaluation: 0,
                evaluationTrend: 'stable',
                endgameAccuracy: 0
            };
        }
    }



    /**
     * Parses PGN to extract moves
     */
    private parsePGN(pgn: string): string[] {
        // Remove comments, annotations, and metadata
        let cleanPgn = pgn
            .replace(/\{.*?\}/g, '') // Remove comments
            .replace(/\[.*?\]/g, '') // Remove metadata
            .replace(/[?!+#]/g, '') // Remove move annotations
            .trim();

        // Extract moves (format: "1. e4 e5 2. Nf3 Nc6 ...")
        const moves: string[] = [];
        const moveRegex = /\d+\.\s*([a-h1-8O-]+(?:\s+[a-h1-8O-]+)?)/g;
        let match;

        while ((match = moveRegex.exec(cleanPgn)) !== null) {
            const movePair = match[1].trim().split(/\s+/);
            moves.push(...movePair.filter(m => m && !m.match(/^\d+\.$/)));
        }

        return moves.filter(m => m.length > 0);
    }

    /**
     * Analyzes ALL games sequentially (with progress callback)
     */
    async analyzeGames(
        games: GameData[], 
        targetUsername: string, 
        maxGames?: number,
        progressCallback?: (current: number, total: number) => void
    ): Promise<GameAnalysis[]> {
        // If maxGames is specified and less than total, use it; otherwise analyze ALL games
        const gamesToAnalyze = maxGames && maxGames < games.length 
            ? games.slice(0, maxGames) 
            : games;
        
        console.log(`[Stockfish] Analyzing ALL ${gamesToAnalyze.length} games for ${targetUsername}`);

        const results: GameAnalysis[] = [];
        
        // Analyze games sequentially to avoid overwhelming the engine
        for (let i = 0; i < gamesToAnalyze.length; i++) {
            // Update progress callback if provided
            if (progressCallback) {
                progressCallback(i + 1, gamesToAnalyze.length);
            }
            
            // Log progress every 10 games
            if ((i + 1) % 10 === 0 || i === 0) {
                console.log(`[Stockfish] Analyzing game ${i + 1}/${gamesToAnalyze.length}`);
            }
            
            try {
                const analysis = await this.analyzeGame(gamesToAnalyze[i], targetUsername);
                results.push(analysis);
            } catch (gameError) {
                console.warn(`[Stockfish] Failed to analyze game ${i + 1}:`, gameError);
                // Continue with next game even if one fails
                // Add empty result to maintain count
                results.push({
                    gameId: gamesToAnalyze[i].id,
                    criticalMistakes: [],
                    averageEvaluation: 0,
                    evaluationTrend: 'stable',
                    endgameAccuracy: 0
                });
            }
            
            // Small delay between games to prevent overwhelming the engine
            // Reduce delay for faster processing when analyzing many games
            if (i < gamesToAnalyze.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 30));
            }
        }

        console.log(`[Stockfish] Completed analysis of ${results.length} games`);
        return results;
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.stockfish) {
            this.stockfish.postMessage('quit');
        }
    }
}

// Singleton instance
let analyzerInstance: StockfishAnalyzer | null = null;

export const getStockfishAnalyzer = (): StockfishAnalyzer => {
    if (!analyzerInstance) {
        analyzerInstance = new StockfishAnalyzer();
    }
    return analyzerInstance;
};
