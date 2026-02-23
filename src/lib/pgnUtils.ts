/**
 * PGN sanitization for chess.js compatibility.
 * Fixes common issues that cause "Invalid FEN" / "castling availability is invalid" errors.
 */
export function sanitizePgn(pgn: string): string {
  if (!pgn || typeof pgn !== 'string') return '';

  let s = pgn.trim();

  // Replace numeric castling (0-0, 0-0-0) with letter O - chess.js requires O-O
  s = s.replace(/\b0-0-0\b/g, 'O-O-O');
  s = s.replace(/\b0-0\b/g, 'O-O');

  // Remove or fix FEN/SetUp tags that can cause "castling availability is invalid"
  // chess.js can fail on malformed FEN in headers - strip them and let it parse from moves
  s = s.replace(/\[\s*FEN\s+"[^"]*"\s*\]/gi, '');
  s = s.replace(/\[\s*SetUp\s+"?[^"]*"?\s*\]/gi, '');

  // Ensure blank line between headers and movetext (PGN spec)
  const headerEnd = s.indexOf('\n\n');
  if (headerEnd === -1 && s.includes('[')) {
    const lastBracket = s.lastIndexOf(']');
    if (lastBracket !== -1 && !s.slice(lastBracket).trim().startsWith('\n')) {
      s = s.slice(0, lastBracket + 1) + '\n\n' + s.slice(lastBracket + 1).trim();
    }
  }

  return s.trim();
}
