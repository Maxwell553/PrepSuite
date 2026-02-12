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
    /** From ECO library when available */
    openingName?: string;
}

const ECO_MAP: Record<string, string> = {
    'B01': 'Scandinavian Defense',
    'B06': 'Modern Defense',
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
    'D50': 'Queens Gambit Declined',
    'D55': 'Queens Gambit Declined',
    'D70': 'Benoni Defense',
    'D75': 'Benoni Defense',
    'D85': 'Grunfeld Defense',
    'E12': 'Queens Indian Defense',
    'E60': 'Kings Indian Defense',
    'E90': 'Kings Indian Defense'
};

/**
 * Identifies opening from PGN moves (first 5-10 moves)
 * More granular than ECO aggregation - identifies specific openings
 */
function identifyOpeningFromMoves(pgn: string, side: 'white' | 'black'): string {
    if (!pgn || pgn.trim().length === 0) return 'Unknown';
    
    // Parse first 10 moves from PGN
    const cleanPgn = pgn
        .replace(/\{.*?\}/g, '') // Remove comments
        .replace(/\[.*?\]/g, '') // Remove metadata
        .replace(/[?!+#]/g, '') // Remove move annotations
        .trim();
    
    const moves: string[] = [];
    const moveRegex = /\d+\.\s*([a-h1-8O-]+(?:\s+[a-h1-8O-]+)?)/g;
    let match;
    let moveCount = 0;
    
    // Parse more moves (up to 15) to get better opening identification
    while ((match = moveRegex.exec(cleanPgn)) !== null && moveCount < 15) {
        const movePair = match[1].trim().split(/\s+/);
        moves.push(...movePair.filter(m => m && !m.match(/^\d+\.$/)));
        moveCount += movePair.length;
    }
    
    if (moves.length < 4) return 'Unknown';
    
    // Normalize moves to lowercase for comparison
    const normalizedMoves = moves.map(m => m.toLowerCase());
    
    // Identify opening based on first 5-10 moves
    // Opening identification is the same regardless of side - we always look at white's first move
    // and black's response to identify the opening
    
    // Check first move (always white's move)
    if (normalizedMoves[0] === 'e4') {
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'e5') {
            // King's Pawn Game / Open Game - check deeper for specific variations
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'nf3') {
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'nc6') {
                    // e4 e5 Nf3 Nc6 - check move 5+
                    if (normalizedMoves.length > 4 && normalizedMoves[4] === 'bb5') {
                        // Ruy Lopez - check for variations
                        if (normalizedMoves.length > 5 && normalizedMoves[5] === 'a6') {
                            if (normalizedMoves.length > 6 && normalizedMoves[6] === 'ba4') return 'Ruy Lopez';
                            return 'Ruy Lopez';
                        }
                        return 'Ruy Lopez';
                    }
                    if (normalizedMoves.length > 4 && normalizedMoves[4] === 'bc4') {
                        // Italian Game - check for variations
                        if (normalizedMoves.length > 5 && normalizedMoves[5] === 'nf6') {
                            if (normalizedMoves.length > 6 && normalizedMoves[6] === 'ng5') return 'Italian Game';
                            return 'Italian Game';
                        }
                        if (normalizedMoves.length > 5 && normalizedMoves[5] === 'bc5') return 'Italian Game';
                        return 'Italian Game';
                    }
                    if (normalizedMoves.length > 4 && normalizedMoves[4] === 'b5') {
                        // Scotch Game
                        if (normalizedMoves.length > 5 && normalizedMoves[5] === 'bxc6') return 'Scotch Game';
                        return 'Scotch Game';
                    }
                    if (normalizedMoves.length > 4 && normalizedMoves[4] === 'd4') {
                        if (normalizedMoves.length > 5 && normalizedMoves[5] === 'exd4') return 'Scotch Game';
                        return 'Scotch Game';
                    }
                    if (normalizedMoves.length > 4 && normalizedMoves[4] === 'nc3') return 'Three Knights Game';
                    if (normalizedMoves.length > 4 && normalizedMoves[4] === 'c3') return 'Ponziani Opening';
                    // If we have moves 5-10, check deeper before falling back
                    if (normalizedMoves.length >= 10) {
                        // Look for common patterns in moves 5-10
                        if (normalizedMoves.includes('d3') && normalizedMoves.includes('be3')) return 'Spanish Game';
                        if (normalizedMoves.includes('c3') && normalizedMoves.includes('d4')) return 'Spanish Game';
                    }
                    // Always return a specific opening if we have enough moves
                    // Even if we can't identify the exact variation, return a known opening
                    if (normalizedMoves.length >= 5) {
                        // We have e4 e5 Nf3 Nc6 and at least one more move - this is likely Ruy Lopez or Italian
                        // Check if we can identify it, otherwise return a reasonable default
                        if (normalizedMoves.length >= 6 && normalizedMoves[5] === 'a6') return 'Ruy Lopez';
                        if (normalizedMoves.length >= 6 && normalizedMoves[5] === 'nf6') return 'Italian Game';
                        if (normalizedMoves.length >= 6 && normalizedMoves[5] === 'bc5') return 'Italian Game';
                        // Default to Ruy Lopez/Italian family
                        return 'Ruy Lopez';
                    }
                    if (normalizedMoves.length < 5) return 'King\'s Knight Opening';
                }
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'nf6') {
                    // Petrov Defense
                    if (normalizedMoves.length > 4 && normalizedMoves[4] === 'nxe5') return 'Petrov Defense';
                    return 'Petrov Defense';
                }
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'd6') {
                    if (normalizedMoves.length > 4 && normalizedMoves[4] === 'd4') return 'Philidor Defense';
                    return 'Philidor Defense';
                }
                // Check deeper before falling back
                if (normalizedMoves.length >= 8) {
                    if (normalizedMoves.includes('bc4') || normalizedMoves.includes('b5')) return 'King\'s Knight Opening';
                }
                if (normalizedMoves.length < 5) return 'King\'s Knight Opening';
            }
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'bc4') {
                // Bishop's Opening
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'nf6') return 'Bishop\'s Opening';
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'nc6') return 'Bishop\'s Opening';
                return 'Bishop\'s Opening';
            }
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'nc3') {
                // Vienna Game
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'nc6') return 'Vienna Game';
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'nf6') return 'Vienna Game';
                return 'Vienna Game';
            }
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'f4') {
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'exf4') return 'King\'s Gambit';
                return 'King\'s Gambit';
            }
            // Try to identify specific opening even with fewer moves
            if (normalizedMoves.length >= 3) {
                // We have e4 e5 and at least one more move - try to identify
                if (normalizedMoves.length >= 4 && normalizedMoves[3] === 'nc6') return 'Ruy Lopez';
                if (normalizedMoves.length >= 4 && normalizedMoves[3] === 'nf6') return 'Petrov Defense';
                return 'Ruy Lopez'; // Default to most common e4 e5 opening
            }
            return 'King\'s Pawn Game';
        }
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'c5') {
            // Sicilian Defense - check for variations
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'nf3') {
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'd6') {
                    if (normalizedMoves.length > 4 && normalizedMoves[4] === 'd4') {
                        if (normalizedMoves.length > 5 && normalizedMoves[5] === 'cxd4') {
                            if (normalizedMoves.length > 6 && normalizedMoves[6] === 'nxd4') {
                                if (normalizedMoves.length > 7 && normalizedMoves[7] === 'nf6') return 'Sicilian Defense';
                                return 'Sicilian Defense';
                            }
                            return 'Sicilian Defense';
                        }
                        return 'Sicilian Defense';
                    }
                    return 'Sicilian Defense';
                }
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'nc6') {
                    if (normalizedMoves.length > 4 && normalizedMoves[4] === 'd4') return 'Sicilian Defense';
                    return 'Sicilian Defense';
                }
                return 'Sicilian Defense';
            }
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'c3') return 'Sicilian Defense';
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'nc3') return 'Sicilian Defense';
            return 'Sicilian Defense';
        }
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'c6') {
            // Caro-Kann Defense
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'd4') {
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'd5') return 'Caro-Kann Defense';
                return 'Caro-Kann Defense';
            }
            return 'Caro-Kann Defense';
        }
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'e6') {
            // French Defense
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'd4') {
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'd5') return 'French Defense';
                return 'French Defense';
            }
            return 'French Defense';
        }
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'd6') {
            // Pirc Defense
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'd4') {
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'nf6') return 'Pirc Defense';
                return 'Pirc Defense';
            }
            return 'Pirc Defense';
        }
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'd5') {
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'exd5') return 'Scandinavian Defense';
            return 'Scandinavian Defense';
        }
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'g6') {
            // Modern Defense (Robatsch)
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'd4') {
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'bg7') return 'Modern Defense';
                return 'Modern Defense';
            }
            return 'Modern Defense';
        }
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'nf6') {
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'e5') return 'Alekhine Defense';
            return 'Alekhine Defense';
        }
        // If we have e4 and at least one response, identify the defense
        if (normalizedMoves.length >= 2) {
            // We already checked all common e4 responses above
            // If we get here, it's an uncommon response - try to identify from ECO or return Sicilian (most common)
            return 'Sicilian Defense'; // Most common e4 response
        }
        if (normalizedMoves.length < 2) return 'Sicilian Defense';
    }
    if (normalizedMoves[0] === 'd4') {
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'nf6') {
            // Indian Defenses - check deeper
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'c4') {
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'g6') {
                    if (normalizedMoves.length > 4 && normalizedMoves[4] === 'nc3') return 'King\'s Indian Defense';
                    return 'King\'s Indian Defense';
                }
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'e6') {
                    if (normalizedMoves.length > 4 && normalizedMoves[4] === 'nc3') {
                        if (normalizedMoves.length > 5 && normalizedMoves[5] === 'bb4') return 'Nimzo-Indian Defense';
                        return 'Nimzo-Indian Defense';
                    }
                    return 'Nimzo-Indian Defense';
                }
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'b6') {
                    if (normalizedMoves.length > 4 && normalizedMoves[4] === 'nc3') return 'Queen\'s Indian Defense';
                    return 'Queen\'s Indian Defense';
                }
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'c5') return 'Benoni Defense';
                // Check deeper before falling back - be more aggressive
                if (normalizedMoves.length >= 6) {
                    // Check for specific Indian defenses
                    if (normalizedMoves.includes('g6')) return 'King\'s Indian Defense';
                    if (normalizedMoves.includes('e6')) {
                        if (normalizedMoves.includes('bb4')) return 'Nimzo-Indian Defense';
                        return 'Nimzo-Indian Defense';
                    }
                    if (normalizedMoves.includes('b6')) return 'Queen\'s Indian Defense';
                    if (normalizedMoves.includes('c5')) return 'Benoni Defense';
                    // Default to King's Indian if we have d4 Nf6 c4
                    return 'King\'s Indian Defense';
                }
                if (normalizedMoves.length < 6) return 'Indian Defense';
            }
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'nf3') {
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'g6') return 'King\'s Indian Defense';
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'e6') return 'Nimzo-Indian Defense';
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'b6') return 'Queen\'s Indian Defense';
                // Default to King's Indian if we have d4 Nf6 Nf3
                if (normalizedMoves.length >= 4) return 'King\'s Indian Defense';
                return 'Indian Defense';
            }
            // If we have d4 Nf6, default to King's Indian (most common)
            if (normalizedMoves.length >= 3) return 'King\'s Indian Defense';
            if (normalizedMoves.length < 3) return 'Indian Defense';
        }
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'd5') {
            // Queen's Pawn openings
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'c4') {
                // Queen's Gambit - check for variations
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'dxc4') {
                    if (normalizedMoves.length > 4 && normalizedMoves[4] === 'e4') return 'Queen\'s Gambit Accepted';
                    return 'Queen\'s Gambit Accepted';
                }
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'e6') {
                    if (normalizedMoves.length > 4 && normalizedMoves[4] === 'nc3') return 'Queen\'s Gambit Declined';
                    return 'Queen\'s Gambit Declined';
                }
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'c6') return 'Slav Defense';
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'nf6') return 'Queen\'s Gambit Declined';
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'e6') return 'Queen\'s Gambit Declined';
                // Always return a specific variation, not generic "Queen's Gambit"
                if (normalizedMoves.length >= 4) return 'Queen\'s Gambit Declined';
                return 'Queen\'s Gambit';
            }
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'nf3') {
                if (normalizedMoves.length > 3 && normalizedMoves[3] === 'nf6') return 'Queen\'s Pawn Game';
                return 'Queen\'s Pawn Game';
            }
            // Try to identify specific opening even with fewer moves
            if (normalizedMoves.length >= 3) {
                // We have d4 d5 and at least one more move - try to identify
                if (normalizedMoves.length >= 4 && normalizedMoves[3] === 'dxc4') return 'Queen\'s Gambit Accepted';
                if (normalizedMoves.length >= 4 && normalizedMoves[3] === 'e6') return 'Queen\'s Gambit Declined';
                if (normalizedMoves.length >= 4 && normalizedMoves[3] === 'c6') return 'Slav Defense';
                return 'Queen\'s Gambit Declined'; // Default to most common d4 d5 opening
            }
            return 'Queen\'s Pawn Game';
        }
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'f5') {
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'nf3') return 'Dutch Defense';
            return 'Dutch Defense';
        }
        // Try to identify specific opening even with fewer moves
        if (normalizedMoves.length >= 3) {
            // We have d4 and at least two more moves - try to identify
            if (normalizedMoves[1] === 'nf6' && normalizedMoves.length >= 4) {
                if (normalizedMoves[2] === 'c4') {
                    // d4 Nf6 c4 - most likely King's Indian or Nimzo-Indian
                    return 'King\'s Indian Defense';
                }
                return 'King\'s Indian Defense';
            }
            if (normalizedMoves[1] === 'c5') return 'Benoni Defense';
            // Unrecognized d4 - use generic, NOT QGD (QGD requires 1.d4 d5 2.c4 e6)
            return 'Queen\'s Pawn Game';
        }
        return 'Queen\'s Pawn Opening';
    }
    if (normalizedMoves[0] === 'c4') {
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'e5') return 'English Opening';
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'nf6') return 'English Opening';
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'c5') return 'English Opening';
        return 'English Opening';
    }
    if (normalizedMoves[0] === 'nf3') {
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'nf6') {
            if (normalizedMoves.length > 2 && normalizedMoves[2] === 'c4') return 'Reti Opening';
            return 'Reti Opening';
        }
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'd5') return 'Reti Opening';
        if (normalizedMoves.length > 1 && normalizedMoves[1] === 'c5') return 'Reti Opening';
        return 'Reti Opening';
    }
    if (normalizedMoves[0] === 'f4') return 'Bird\'s Opening';
    if (normalizedMoves[0] === 'b3') return 'Nimzo-Larsen Attack';
    if (normalizedMoves[0] === 'g3') return 'King\'s Indian Attack';
    if (normalizedMoves[0] === 'b4') return 'Polish Opening';
    if (normalizedMoves[0] === 'e3') return 'Van\'t Kruijs Opening';
    if (normalizedMoves[0] === 'd3') return 'Mieses Opening';
    
    // Fallback: use ECO code if available, otherwise return Unknown
    return 'Unknown';
}

/**
 * Aggregates openings by identifying them from PGN moves (more granular)
 * Falls back to ECO-based aggregation if PGN is not available
 * When playing white, uses more granular grouping to show different opponent responses
 * IMPORTANT: When Black plays 1...Nf6 (1.d4 Nf6), always use move-based identification
 * so we get Indian defenses (King's Indian, Nimzo-Indian, etc.) not Queen's Gambit Declined.
 */
function aggregateECO(eco: string, pgn?: string, side?: 'white' | 'black'): string {
    // Prefer move-based identification when PGN shows 1.d4 Nf6 (Indian) - APIs sometimes
    // return D-codes for these games, which would wrongly label them as Queen's Gambit Declined
    if (pgn && side) {
        const fromMoves = identifyOpeningFromMoves(pgn, side);
        const isIndian = fromMoves.includes('Indian');
        if (isIndian && fromMoves !== 'Unknown') {
            return fromMoves;
        }
    }

    // When playing white, use more granular ECO-based identification to show different opponent responses
    if (side === 'white' && eco && eco !== 'Unknown') {
        const ecoBased = identifyFromECOForWhite(eco);
        if (ecoBased !== 'Other Openings' && ecoBased !== 'Unknown') {
            return ecoBased;
        }
    }

    // Use ECO-based identification when available and not overridden by moves above
    if (eco && eco !== 'Unknown') {
        const ecoBased = identifyFromECO(eco);
        if (ecoBased !== 'Other Openings' &&
            ecoBased !== 'Unknown' &&
            ecoBased !== 'King\'s Pawn Game' &&
            ecoBased !== 'Queen\'s Pawn Game' &&
            ecoBased !== 'King\'s Pawn Opening' &&
            ecoBased !== 'Queen\'s Pawn Opening') {
            return ecoBased;
        }
    }

    // If ECO-based fails or no ECO, try move-based identification
    if (pgn && side) {
        const identified = identifyOpeningFromMoves(pgn, side);
        if (identified !== 'Unknown' &&
            identified !== 'King\'s Pawn Game' &&
            identified !== 'Queen\'s Pawn Game' &&
            identified !== 'King\'s Pawn Opening' &&
            identified !== 'Queen\'s Pawn Opening' &&
            identified !== 'King\'s Knight Opening') {
            return identified;
        }
    }

    if (eco && eco !== 'Unknown') {
        const ecoBased = identifyFromECO(eco);
        if (ecoBased !== 'Other Openings' && ecoBased !== 'Unknown') {
            return ecoBased;
        }
    }

    if (pgn && side) {
        const identified = identifyOpeningFromMoves(pgn, side);
        if (identified !== 'Unknown') return identified;
    }

    return 'Unknown';
}

/**
 * Identifies opening from ECO code for white games (more granular to show different opponent responses)
 * Uses more specific ECO codes to differentiate between variations
 */
function identifyFromECOForWhite(eco: string): string {
    // Handle ECO codes that might be in range format (e.g., "D70-D79" or "E60-E69")
    // Extract just the first ECO code from the range
    if (eco.includes('-')) {
        eco = eco.split('-')[0].trim();
    }
    
    // Use full ECO code or more specific prefixes to differentiate between variations
    const ecoPrefix = eco.substring(0, 3); // e.g., "B20", "C00", "D30"
    
    // Check ECO_MAP first for specific mappings
    if (ECO_MAP[eco]) {
        return ECO_MAP[eco];
    }
    
    // Use more granular grouping - differentiate by first 3 characters
    // B codes (e4 responses) - differentiate between different defenses
    if (ecoPrefix.match(/^B[2-9]\d$/)) {
        // Sicilian Defense - try to differentiate variations
        if (eco.startsWith('B20')) return 'Sicilian Defense';
        if (eco.startsWith('B30')) return 'Sicilian Defense (Rossolimo)';
        if (eco.startsWith('B40')) return 'Sicilian Defense (Paulsen)';
        if (eco.startsWith('B50')) return 'Sicilian Defense';
        if (eco.startsWith('B90')) return 'Sicilian Najdorf';
        return 'Sicilian Defense'; // Fallback to general Sicilian
    }
    if (ecoPrefix.match(/^B1[2-9]$/)) return 'Caro-Kann Defense';
    if (ecoPrefix.match(/^B0[7-9]$/)) return 'Pirc Defense';
    if (eco.startsWith('B01')) return 'Scandinavian Defense';
    if (eco.startsWith('B06')) return 'Modern Defense';
    if (ecoPrefix.match(/^B0[2-5]$/)) return 'Alekhine Defense';
    
    // C codes (e4 e5 and other e4 responses)
    if (ecoPrefix.match(/^C[0-1]\d$/)) {
        // French Defense - differentiate variations
        if (eco.startsWith('C00')) return 'French Defense';
        if (eco.startsWith('C11')) return 'French Defense (Classical)';
        return 'French Defense';
    }
    if (ecoPrefix.match(/^C5[0-9]$/)) return 'Italian Game';
    if (ecoPrefix.match(/^C[6-7]\d$/)) {
        // Ruy Lopez - differentiate variations
        if (eco.startsWith('C60')) return 'Ruy Lopez';
        if (eco.startsWith('C67')) return 'Ruy Lopez (Berlin)';
        if (eco.startsWith('C77')) return 'Ruy Lopez';
        if (eco.startsWith('C84')) return 'Ruy Lopez (Closed)';
        return 'Ruy Lopez';
    }
    if (ecoPrefix.match(/^C4[5-6]$/)) return 'Scotch Game';
    if (ecoPrefix.match(/^C4[2-3]$/)) return 'Petrov Defense';
    if (ecoPrefix.match(/^C[2-4]\d$/)) return 'King\'s Pawn Game';
    
    // D codes (d4 openings)
    if (ecoPrefix.match(/^D0[0-9]$/)) return 'Queen\'s Pawn Game';
    if (ecoPrefix.match(/^D2[0-9]$/)) return 'Queen\'s Gambit Accepted';
    if (ecoPrefix.match(/^D1[0-9]$/)) return 'Slav Defense';
    if (ecoPrefix.match(/^D[3-4]\d$/)) {
        // Queen's Gambit Declined - differentiate variations
        if (eco.startsWith('D30')) return 'Queen\'s Gambit Declined';
        if (eco.startsWith('D37')) return 'Queen\'s Gambit Declined (Classical)';
        return 'Queen\'s Gambit Declined';
    }
    if (ecoPrefix.match(/^D[5-6]\d$/)) {
        // Queen's Gambit Declined variations (D50-D69)
        if (eco.startsWith('D50')) return 'Queen\'s Gambit Declined';
        if (eco.startsWith('D55')) return 'Queen\'s Gambit Declined';
        return 'Queen\'s Gambit Declined';
    }
    if (ecoPrefix.match(/^D[7]\d$/)) {
        // Benoni Defense (D70-D79) - NOT Queen's Gambit Declined!
        if (eco.startsWith('D70')) return 'Benoni Defense';
        if (eco.startsWith('D75')) return 'Benoni Defense';
        return 'Benoni Defense';
    }
    if (ecoPrefix.match(/^D[8-9]\d$/)) {
        if (eco.startsWith('D85')) return 'Grunfeld Defense';
        return 'Grunfeld Defense';
    }
    
    // E codes (Indian defenses)
    if (ecoPrefix.match(/^E0[0-9]$/)) return 'Catalan Opening';
    if (ecoPrefix.match(/^E1[0-9]$/)) {
        if (eco.startsWith('E12')) return 'Queen\'s Indian Defense';
        return 'Queen\'s Indian Defense';
    }
    if (ecoPrefix.match(/^E[2-5]\d$/)) return 'Nimzo-Indian Defense';
    if (ecoPrefix.match(/^E[6-9]\d$/)) {
        if (eco.startsWith('E60')) return 'King\'s Indian Defense';
        if (eco.startsWith('E90')) return 'King\'s Indian Defense';
        return 'King\'s Indian Defense';
    }
    
    // Fallback to general identification
    return identifyFromECO(eco);
}

/**
 * Identifies opening from ECO code only (more reliable than move parsing)
 */
function identifyFromECO(eco: string): string {
    // Handle ECO codes that might be in range format (e.g., "D70-D79" or "E60-E69")
    // Extract just the first ECO code from the range
    if (eco.includes('-')) {
        eco = eco.split('-')[0].trim();
    }
    
    // Use first 2-3 characters of ECO for more granular grouping
    const ecoPrefix = eco.substring(0, 3); // e.g., "B20", "C00", "D30"
    
    // Map common ECO prefixes to specific openings - EXPANDED for better coverage
    // Use regex patterns for cleaner code and better coverage
    // B codes (e4 responses) - ALL Sicilian variations
    if (ecoPrefix.match(/^B[2-9]\d$/)) return 'Sicilian Defense'; // B20-B99
    if (ecoPrefix.match(/^B1[2-9]$/)) return 'Caro-Kann Defense'; // B12-B19
    if (ecoPrefix.match(/^B0[7-9]$/)) return 'Pirc Defense'; // B07-B09
    if (ecoPrefix.startsWith('B01')) return 'Scandinavian Defense';
    if (ecoPrefix.startsWith('B06')) return 'Modern Defense'; // B06 = 1.e4 g6
    if (ecoPrefix.match(/^B0[2-5]$/)) return 'Alekhine Defense'; // B02-B05
    
    // C codes (e4 e5 and other e4 responses)
    if (ecoPrefix.match(/^C[0-1]\d$/)) return 'French Defense'; // C00-C19
    if (ecoPrefix.match(/^C5[0-9]$/)) return 'Italian Game'; // C50-C59
    if (ecoPrefix.match(/^C[6-7]\d$/)) return 'Ruy Lopez'; // C60-C79
    if (ecoPrefix.match(/^C4[5-6]$/)) return 'Scotch Game'; // C45-C46
    if (ecoPrefix.match(/^C4[2-3]$/)) return 'Petrov Defense'; // C42-C43
    if (ecoPrefix.match(/^C[2-4]\d$/)) return 'King\'s Pawn Game'; // C20-C49 (various e4 e5 openings)
    
    // D codes (d4 openings)
    if (ecoPrefix.match(/^D0[0-9]$/)) return 'Queen\'s Pawn Game'; // D00-D09
    if (ecoPrefix.match(/^D2[0-9]$/)) return 'Queen\'s Gambit Accepted'; // D20-D29
    if (ecoPrefix.match(/^D1[0-9]$/)) return 'Slav Defense'; // D10-D19
    if (ecoPrefix.match(/^D[3-4]\d$/)) return 'Queen\'s Gambit Declined'; // D30-D49 (QGD variations)
    if (ecoPrefix.match(/^D[5-6]\d$/)) return 'Queen\'s Gambit Declined'; // D50-D69 (QGD variations)
    if (ecoPrefix.match(/^D[7]\d$/)) return 'Benoni Defense'; // D70-D79 (Modern Benoni, Benoni Defense)
    if (ecoPrefix.match(/^D[8-9]\d$/)) return 'Grunfeld Defense'; // D80-D99
    
    // E codes (Indian defenses)
    if (ecoPrefix.match(/^E0[0-9]$/)) return 'Catalan Opening'; // E00-E09
    if (ecoPrefix.match(/^E1[0-9]$/)) return 'Queen\'s Indian Defense'; // E10-E19
    if (ecoPrefix.match(/^E[2-5]\d$/)) return 'Nimzo-Indian Defense'; // E20-E59
    if (ecoPrefix.match(/^E[6-9]\d$/)) return 'King\'s Indian Defense'; // E60-E99
    
    // Use ECO code mapping for more specific identification
    // Map ECO codes to specific openings using the ECO_MAP
    if (ECO_MAP[eco]) {
        return ECO_MAP[eco];
    }
    
    // Fallback to letter-based grouping for less common openings
    const letter = eco[0];
    if (letter === 'A') {
        // A00-A09: Uncommon openings
        if (ecoPrefix.startsWith('A00')) return 'Irregular Opening';
        if (ecoPrefix.startsWith('A01')) return 'Nimzowitsch-Larsen Attack';
        if (ecoPrefix.startsWith('A02')) return 'Bird\'s Opening';
        if (ecoPrefix.startsWith('A03')) return 'Bird\'s Opening';
        if (ecoPrefix.startsWith('A04')) return 'Reti Opening';
        if (ecoPrefix.startsWith('A05')) return 'Reti Opening';
        if (ecoPrefix.startsWith('A06')) return 'Reti Opening';
        if (ecoPrefix.startsWith('A07')) return 'King\'s Indian Attack';
        if (ecoPrefix.startsWith('A08')) return 'King\'s Indian Attack';
        if (ecoPrefix.startsWith('A09')) return 'Reti Opening';
        return 'Flank & Irregular Openings';
    }
    
    // Last resort: try to identify from first letter only, but be more specific
    // NOTE: This should rarely be reached if ECO codes are properly formatted
    if (letter === 'A') return 'Flank & Irregular Openings';
    if (letter === 'B') return 'Sicilian Defense'; // Most common B openings
    if (letter === 'C') return 'French Defense'; // Most common C openings
    if (letter === 'D') {
        // D codes can be QGD, Benoni, Grunfeld, etc. - try to be more specific
        // If we got here, the ECO code wasn't recognized, so use a generic name
        return 'Queen\'s Pawn Game'; // Generic fallback for unrecognized D codes
    }
    if (letter === 'E') return 'King\'s Indian Defense'; // Most common E openings
    
    return 'Other Openings';
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
    return typedGames.map(g => {
        // Extract ECO code - handle various formats
        let eco = 'Unknown';
        if (g.eco) {
            // ECO might be a string like "B20" or an array like ["B20", "Sicilian Defense"]
            const ecoVal = g.eco as string | string[] | undefined;
            if (typeof ecoVal === 'string') {
                eco = ecoVal.split('/').pop() || ecoVal;
            } else if (Array.isArray(ecoVal) && ecoVal.length > 0) {
                eco = String(ecoVal[0]);
            }
            // Clean up ECO code - remove any non-standard characters
            eco = eco.trim().toUpperCase();
            // Handle ECO codes that might be in range format (e.g., "D70-D79")
            if (eco.includes('-')) {
                eco = eco.split('-')[0].trim();
            }
            // Validate ECO format (should be letter + 2-3 digits)
            if (!eco.match(/^[A-E]\d{2,3}$/)) {
                eco = 'Unknown';
            }
        }
        
        return {
            id: g.uuid || Math.random().toString(36),
            source: 'chess.com',
            white: g.white.username,
            black: g.black.username,
            result: resolveResult(g, targetUsername),
            eco: eco,
            pgn: g.pgn,
            playedAt: new Date(g.end_time * 1000).toISOString(),
            timeControl: g.time_control
        };
    });
}

function parseLichessGames(ndjson: string, targetUsername: string): GameData[] {
    if (!ndjson) return [];
    const games = ndjson.trim().split('\n').map((line, index) => {
        try {
            const g = JSON.parse(line) as LichessGame;
            
            // Check if PGN is missing and log a warning
            if (!g.pgn || g.pgn.trim().length === 0) {
                console.warn(`[Lichess] Game ${g.id || index} is missing PGN data. Available fields:`, Object.keys(g));
            }
            
            // Lichess API might return moves in a different format
            // Check for alternative PGN sources in the response
            let pgn = g.pgn || '';
            
            // If PGN is missing, construct it from moves (Lichess API may return moves=true instead of full PGN)
            const rawMoves = (g as { moves?: string | string[] }).moves;
            if (!pgn && rawMoves) {
                const moves: string[] = Array.isArray(rawMoves)
                    ? rawMoves
                    : (typeof rawMoves === 'string' ? rawMoves.trim().split(/\s+/) : []);
                if (moves.length > 0) {
                    const movePairs: string[] = [];
                    for (let i = 0; i < moves.length; i += 2) {
                        const moveNum = Math.floor(i / 2) + 1;
                        const whiteMove = moves[i] || '';
                        const blackMove = moves[i + 1] || '';
                        if (whiteMove) {
                            movePairs.push(`${moveNum}. ${whiteMove}${blackMove ? ' ' + blackMove : ''}`);
                        }
                    }
                    pgn = movePairs.join(' ');
                    if (index === 0) {
                        console.log(`[Lichess] Constructed PGN from moves for game playback (${moves.length} moves)`);
                    }
                }
            }
            
            const whiteName = g.players?.white?.user?.name ?? g.players?.white?.userId ?? 'Anonymous';
            const blackName = g.players?.black?.user?.name ?? g.players?.black?.userId ?? 'Anonymous';
            return {
                id: g.id,
                source: 'lichess',
                white: whiteName,
                black: blackName,
                result: resolveResultLichess(g, targetUsername, whiteName, blackName),
                eco: g.opening?.eco || g.eco || 'Unknown',
                pgn: pgn,
                playedAt: new Date(g.createdAt).toISOString(),
                timeControl: g.speed,
                openingName: g.opening?.name || undefined
            };
        } catch (e) {
            console.error(`[Lichess] Failed to parse game at line ${index}:`, e);
            return null;
        }
    }).filter((g): g is NonNullable<typeof g> => g !== null) as GameData[];
    
    // Log statistics about PGN availability
    const gamesWithPGN = games.filter(g => g.pgn && g.pgn.trim().length > 20).length;
    console.log(`[Lichess] Parsed ${games.length} games, ${games.length > 0 ? ((gamesWithPGN / games.length) * 100).toFixed(1) : '0'}% have PGN data`);
    
    return games;
}

function resolveResult(game: ChessComGame, target: string): string {
    // Result format is from white's perspective:
    // '1-0' = white wins, '0-1' = black wins, '1/2-1/2' = draw
    
    // Chess.com API uses various result values: 'win', 'checkmated', 'agreed', 'timeout', 'resign', 'stalemate', 'insufficient', 'repetition', '50move', 'abandoned'
    // A 'win' for white means white won, a 'win' for black means black won
    // Other values like 'agreed', 'timeout', 'resign', 'checkmated' also indicate a win for the opponent
    
    const whiteResult = game.white.result?.toLowerCase();
    const blackResult = game.black.result?.toLowerCase();
    
    // White wins if white has 'win' or black has a losing condition
    if (whiteResult === 'win' || 
        blackResult === 'checkmated' || 
        blackResult === 'resign' || 
        blackResult === 'timeout' ||
        blackResult === 'abandoned') {
        return '1-0';
    }
    
    // Black wins if black has 'win' or white has a losing condition
    if (blackResult === 'win' || 
        whiteResult === 'checkmated' || 
        whiteResult === 'resign' || 
        whiteResult === 'timeout' ||
        whiteResult === 'abandoned') {
        return '0-1';
    }
    
    // Draw conditions: 'agreed', 'stalemate', 'insufficient', 'repetition', '50move'
    if (whiteResult === 'agreed' || 
        whiteResult === 'stalemate' || 
        whiteResult === 'insufficient' || 
        whiteResult === 'repetition' || 
        whiteResult === '50move' ||
        blackResult === 'agreed' || 
        blackResult === 'stalemate' || 
        blackResult === 'insufficient' || 
        blackResult === 'repetition' || 
        blackResult === '50move') {
        return '1/2-1/2';
    }
    
    // Default to draw if unclear
    return '1/2-1/2';
}

interface LichessGame {
    id: string;
    players?: {
        white?: { user?: { name?: string }; userId?: string };
        black?: { user?: { name?: string }; userId?: string };
    };
    winner?: 'white' | 'black';
    pgn?: string;
    moves?: string[]; // Alternative format - moves array instead of PGN string
    createdAt: number;
    speed: string;
    opening?: { eco?: string; name?: string };
    eco?: string;
}

function resolveResultLichess(game: LichessGame, target: string, whiteName?: string, blackName?: string): string {
    const winner = game.winner; // 'white' or 'black'
    const w = (whiteName ?? game.players?.white?.user?.name ?? game.players?.white?.userId ?? '').toLowerCase();
    const b = (blackName ?? game.players?.black?.user?.name ?? game.players?.black?.userId ?? '').toLowerCase();

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

    // Minimum 10 games required - patterns need statistical significance
    const MIN_GAMES = 10;
    
    // First pass: aggregate by mainline ECO
    const aggregatedStats: Record<string, any> = {};

    // Aggregate to family level (e.g. "Sicilian Defense: Najdorf" -> "Sicilian Defense") for better graph variety
    const getOpeningFamily = (name: string): string => {
        if (!name) return 'Unknown';
        const beforeColon = name.split(':')[0].trim();
        const beforeParen = beforeColon.split('(')[0].trim();
        return beforeParen || name;
    };

    const fallbackSamples: Array<{ eco: string; pgnLen: number }> = [];
    relevantGames.forEach(g => {
        const originalECO = g.eco || 'Unknown';
        // Prefer ECO library opening name (from openingService) when available
        const rawName = g.openingName ?? (() => {
            if (fallbackSamples.length < 5) {
                fallbackSamples.push({ eco: originalECO, pgnLen: g.pgn?.length ?? 0 });
            }
            return aggregateECO(originalECO, g.pgn, side);
        })();
        const aggregatedECO = getOpeningFamily(rawName);
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

    const fallbackTotal = relevantGames.filter(g => !g.openingName).length;
    if (fallbackTotal > 0) {
        console.log(`[Stats] ${side.toUpperCase()} used hardcoded aggregateECO fallback for ${fallbackTotal}/${relevantGames.length} games. Sample:`, fallbackSamples);
    }

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
