import { GameData } from './gameAnalysis';

export interface MoveSequence {
  moves: string[]; // Array of moves in PGN format (e.g., ["e4", "c5", "Nf3", "d6"])
  frequency: number; // How many times this sequence appears
  games: number; // Number of games with this sequence
}

/**
 * Parses PGN to extract moves (similar to Stockfish parser)
 */
function parsePGNMoves(pgn: string): string[] {
  if (!pgn || pgn.trim().length === 0) return [];
  
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
 * Extracts most common move sequences from games
 * Groups sequences by color (white/black) and returns top N sequences
 */
export function extractMostPlayedLines(
  games: GameData[],
  targetUsername: string,
  maxSequences: number = 10,
  sequenceLength: number = 10 // Number of moves to include in sequence
): { white: MoveSequence[]; black: MoveSequence[] } {
  const targetLower = targetUsername.toLowerCase().trim();
  
  // Separate games by color
  const whiteGames: GameData[] = [];
  const blackGames: GameData[] = [];
  
  games.forEach(game => {
    const whiteLower = game.white.toLowerCase().trim();
    const blackLower = game.black.toLowerCase().trim();
    
    if (whiteLower === targetLower && game.pgn) {
      whiteGames.push(game);
    } else if (blackLower === targetLower && game.pgn) {
      blackGames.push(game);
    }
  });
  
  // Extract sequences for white
  const whiteSequences: Map<string, { moves: string[]; count: number }> = new Map();
  
  whiteGames.forEach(game => {
    const moves = parsePGNMoves(game.pgn);
    if (moves.length >= sequenceLength * 2) {
      // Extract white moves (moves 0, 2, 4, ...) - these are the target player's moves
      const whiteMoves: string[] = [];
      for (let i = 0; i < moves.length && whiteMoves.length < sequenceLength; i += 2) {
        whiteMoves.push(moves[i]);
      }
      
      if (whiteMoves.length >= sequenceLength) {
        const sequence = whiteMoves.slice(0, sequenceLength);
        const sequenceKey = sequence.join(' ');
        
        if (whiteSequences.has(sequenceKey)) {
          whiteSequences.get(sequenceKey)!.count++;
        } else {
          whiteSequences.set(sequenceKey, { moves: sequence, count: 1 });
        }
      }
    }
  });
  
  // Extract sequences for black
  const blackSequences: Map<string, { moves: string[]; count: number }> = new Map();
  
  blackGames.forEach(game => {
    const moves = parsePGNMoves(game.pgn);
    if (moves.length >= sequenceLength * 2) {
      // Extract black moves (moves 1, 3, 5, ...) - these are the target player's moves
      const blackMoves: string[] = [];
      for (let i = 1; i < moves.length && blackMoves.length < sequenceLength; i += 2) {
        blackMoves.push(moves[i]);
      }
      
      if (blackMoves.length >= sequenceLength) {
        const sequence = blackMoves.slice(0, sequenceLength);
        const sequenceKey = sequence.join(' ');
        
        if (blackSequences.has(sequenceKey)) {
          blackSequences.get(sequenceKey)!.count++;
        } else {
          blackSequences.set(sequenceKey, { moves: sequence, count: 1 });
        }
      }
    }
  });
  
  // Convert to arrays and sort by frequency
  const whiteResults: MoveSequence[] = Array.from(whiteSequences.values())
    .map(({ moves, count }) => ({
      moves,
      frequency: count / whiteGames.length,
      games: count
    }))
    .sort((a, b) => b.games - a.games)
    .slice(0, maxSequences);
  
  const blackResults: MoveSequence[] = Array.from(blackSequences.values())
    .map(({ moves, count }) => ({
      moves,
      frequency: count / blackGames.length,
      games: count
    }))
    .sort((a, b) => b.games - a.games)
    .slice(0, maxSequences);
  
  return {
    white: whiteResults,
    black: blackResults
  };
}
