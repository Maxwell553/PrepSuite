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
            return 'Queen\'s Gambit Declined'; // Default to most common d4 opening
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
 */
function aggregateECO(eco: string, pgn?: string, side?: 'white' | 'black'): string {
    // ALWAYS prefer ECO codes over move-based identification when available
    // ECO codes are more reliable and specific than parsing moves
    if (eco && eco !== 'Unknown') {
        // Use ECO-based identification first (most reliable)
        const ecoBased = identifyFromECO(eco);
        // Only accept ECO-based if it's specific (not generic or "Other Openings")
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
        // Only accept move-based if it's specific (not generic)
        if (identified !== 'Unknown' &&
            identified !== 'King\'s Pawn Game' &&
            identified !== 'Queen\'s Pawn Game' &&
            identified !== 'King\'s Pawn Opening' &&
            identified !== 'Queen\'s Pawn Opening' &&
            identified !== 'King\'s Knight Opening') {
            return identified;
        }
    }
    
    // If we have ECO but both methods failed, try ECO again (might be edge case)
    if (eco && eco !== 'Unknown') {
        const ecoBased = identifyFromECO(eco);
        // Accept ECO even if generic, as it's better than "Other Openings"
        if (ecoBased !== 'Other Openings' && ecoBased !== 'Unknown') {
            return ecoBased;
        }
    }
    
    // Last resort: try move-based even if generic
    if (pgn && side) {
        const identified = identifyOpeningFromMoves(pgn, side);
        if (identified !== 'Unknown') {
            return identified;
        }
    }
    
    return 'Unknown';
}

/**
 * Identifies opening from ECO code only (more reliable than move parsing)
 */
function identifyFromECO(eco: string): string {
    
    // Use first 2-3 characters of ECO for more granular grouping
    const ecoPrefix = eco.substring(0, 3); // e.g., "B20", "C00", "D30"
    
    // Map common ECO prefixes to specific openings - EXPANDED for better coverage
    // Use regex patterns for cleaner code and better coverage
    // B codes (e4 responses) - ALL Sicilian variations
    if (ecoPrefix.match(/^B[2-9]\d$/)) return 'Sicilian Defense'; // B20-B99
    if (ecoPrefix.match(/^B1[2-9]$/)) return 'Caro-Kann Defense'; // B12-B19
    if (ecoPrefix.match(/^B0[7-9]$/)) return 'Pirc Defense'; // B07-B09
    if (ecoPrefix.startsWith('B01')) return 'Scandinavian Defense';
    if (ecoPrefix.match(/^B0[2-6]$/)) return 'Alekhine Defense'; // B02-B06
    
    // C codes (e4 e5 and other e4 responses)
    if (ecoPrefix.match(/^C[0-1]\d$/)) return 'French Defense'; // C00-C19
    if (ecoPrefix.match(/^C5[0-9]$/)) return 'Italian Game'; // C50-C59
    if (ecoPrefix.match(/^C[6-7]\d$/)) return 'Ruy Lopez'; // C60-C79
    if (ecoPrefix.match(/^C4[5-6]$/)) return 'Scotch Game'; // C45-C46
    if (ecoPrefix.match(/^C4[2-3]$/)) return 'Petrov Defense'; // C42-C43
    if (ecoPrefix.match(/^C[2-4]\d$/)) return 'King\'s Pawn Game'; // C20-C49 (various e4 e5 openings)
    
    // D codes (d4 openings)
    if (ecoPrefix.match(/^D0[0-9]$/)) return 'Queen\'s Pawn Game'; // D00-D09
    if (ecoPrefix.match(/^D[3-4]\d$/)) return 'Queen\'s Gambit Declined'; // D30-D49
    if (ecoPrefix.match(/^D2[0-9]$/)) return 'Queen\'s Gambit Accepted'; // D20-D29
    if (ecoPrefix.match(/^D1[0-9]$/)) return 'Slav Defense'; // D10-D19
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
    if (letter === 'A') return 'Flank & Irregular Openings';
    if (letter === 'B') return 'Sicilian Defense'; // Most common B openings
    if (letter === 'C') return 'French Defense'; // Most common C openings
    if (letter === 'D') return 'Queen\'s Gambit Declined'; // Most common D openings
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
            if (typeof g.eco === 'string') {
                eco = g.eco.split('/').pop() || g.eco;
            } else if (Array.isArray(g.eco) && g.eco.length > 0) {
                eco = String(g.eco[0]);
            }
            // Clean up ECO code - remove any non-standard characters
            eco = eco.trim().toUpperCase();
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
        // Use PGN-based identification for more granular opening detection (5-10 moves)
        const aggregatedECO = aggregateECO(originalECO, g.pgn, side);
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
