import { GameData } from './gameAnalysis';

export interface MoveSequence {
  moves: string[]; // Array of moves (for compatibility, but will contain formatted notation)
  notation: string; // Formatted chess notation (e.g., "1. e4 e5 2. Nc3 Nc6 3. b3")
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
  
  // Split by move numbers (e.g., "1.", "2.", "3.")
  // Then extract the moves from each section
  const moveSections = cleanPgn.split(/\d+\.\s*/);
  
  for (let i = 1; i < moveSections.length; i++) {
    const section = moveSections[i].trim();
    if (!section) continue;
    
    // Split by whitespace and filter out invalid moves
    const tokens = section.split(/\s+/);
    
    for (const token of tokens) {
      // Skip empty tokens, move numbers, and "..." markers
      if (!token || token.match(/^\d+$/) || token === '...') continue;
      
      // Valid chess move patterns:
      // - Pawn moves: e4, e5, exd5, e8=Q
      // - Piece moves: Nf3, Bb5, Qxd8
      // - Castling: O-O, O-O-O
      // - Check/checkmate markers already removed
      if (token.match(/^([a-h][1-8](?:[a-h][1-8])?(?:=[QRBN])?|O-O(?:-O)?|[QRBNK][a-h1-8]?x?[a-h][1-8](?:=[QRBN])?|[a-h]x[a-h][1-8](?:=[QRBN])?|[QRBNK]x[a-h][1-8](?:=[QRBN])?)$/)) {
        moves.push(token);
      }
    }
  }

  return moves;
}

/**
 * Formats moves into standard chess notation (e.g., "1. e4 e5 2. Nc3 Nc6 3. b3")
 */
function formatMoveSequence(moves: string[]): string {
  if (moves.length === 0) return '';
  
  const formatted: string[] = [];
  let moveNumber = 1;
  
  for (let i = 0; i < moves.length; i += 2) {
    const whiteMove = moves[i];
    const blackMove = moves[i + 1];
    
    if (blackMove) {
      formatted.push(`${moveNumber}. ${whiteMove} ${blackMove}`);
    } else {
      formatted.push(`${moveNumber}. ${whiteMove}`);
    }
    moveNumber++;
  }
  
  return formatted.join(' ');
}

/**
 * Extracts most common move sequences from games
 * Groups sequences by color (white/black) and returns top N sequences
 * Returns sequences in standard chess notation format
 */
export function extractMostPlayedLines(
  games: GameData[],
  targetUsername: string,
  maxSequences: number = 10,
  sequenceLength: number = 10 // Extract exactly 10 moves total (not pairs)
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
  
  // Extract sequences for white (showing full moves: white + black response)
  const whiteSequences: Map<string, { moves: string[]; count: number }> = new Map();
  
  whiteGames.forEach(game => {
    const moves = parsePGNMoves(game.pgn);
    // Extract exactly sequenceLength moves (7 moves total)
    if (moves.length >= sequenceLength) {
      // Extract first N moves (sequenceLength moves total)
      const sequence = moves.slice(0, sequenceLength);
      const sequenceKey = sequence.join(' ');
      
      if (whiteSequences.has(sequenceKey)) {
        whiteSequences.get(sequenceKey)!.count++;
      } else {
        whiteSequences.set(sequenceKey, { moves: sequence, count: 1 });
      }
    }
  });
  
  // Extract sequences for black (showing full moves: white + black response)
  const blackSequences: Map<string, { moves: string[]; count: number }> = new Map();
  
  blackGames.forEach(game => {
    const moves = parsePGNMoves(game.pgn);
    // Extract exactly sequenceLength moves (7 moves total)
    if (moves.length >= sequenceLength) {
      // Extract first N moves (sequenceLength moves total)
      const sequence = moves.slice(0, sequenceLength);
      const sequenceKey = sequence.join(' ');
      
      if (blackSequences.has(sequenceKey)) {
        blackSequences.get(sequenceKey)!.count++;
      } else {
        blackSequences.set(sequenceKey, { moves: sequence, count: 1 });
      }
    }
  });
  
  // Convert to arrays and sort by frequency, format moves properly
  const whiteResults: MoveSequence[] = Array.from(whiteSequences.values())
    .map(({ moves, count }) => {
      const notation = formatMoveSequence(moves);
      return {
        moves: [notation], // Store formatted notation as single string in array for compatibility
        notation: notation, // Also store as separate field
        frequency: count / whiteGames.length,
        games: count
      };
    })
    .sort((a, b) => b.games - a.games)
    .slice(0, maxSequences);
  
  const blackResults: MoveSequence[] = Array.from(blackSequences.values())
    .map(({ moves, count }) => {
      const notation = formatMoveSequence(moves);
      return {
        moves: [notation], // Store formatted notation as single string in array for compatibility
        notation: notation, // Also store as separate field
        frequency: count / blackGames.length,
        games: count
      };
    })
    .sort((a, b) => b.games - a.games)
    .slice(0, maxSequences);
  
  return {
    white: whiteResults,
    black: blackResults
  };
}
