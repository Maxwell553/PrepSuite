/**
 * PGN sanitization for chess.js compatibility.
 * Fixes common issues that cause "Invalid FEN" / "castling availability is invalid" / "Invalid move" errors.
 */
export function sanitizePgn(pgn: string): string {
  if (!pgn || typeof pgn !== 'string') return '';

  let s = pgn.trim();

  // Replace numeric castling (0-0, 0-0-0) with letter O - chess.js requires O-O
  s = s.replace(/\b0-0-0\b/g, 'O-O-O');
  s = s.replace(/\b0-0\b/g, 'O-O');

  // Remove or fix FEN/SetUp/CurrentPosition tags that can cause "castling availability is invalid"
  // chess.js can fail on malformed FEN in headers - strip them and let it parse from moves
  s = s.replace(/\[\s*FEN\s+"[^"]*"\s*\]/gi, '');
  s = s.replace(/\[\s*SetUp\s+"?[^"]*"?\s*\]/gi, '');
  s = s.replace(/\[\s*CurrentPosition\s+"[^"]*"\s*\]/gi, ''); // Chess.com-specific
  s = s.replace(/\[\s*GameId\s+"[^"]*"\s*\]/gi, ''); // Lichess export format
  s = s.replace(/\[\s*ECOUrl\s+"[^"]*"\s*\]/gi, ''); // Chess.com - long URLs can cause issues
  s = s.replace(/\[\s*Link\s+"[^"]*"\s*\]/gi, ''); // Chess.com - long URLs

  // Remove Numeric Annotation Glyphs ($0-$255) that can confuse the move parser
  s = s.replace(/\$\d+/g, '');

  // Remove inline comments { ... } - keep the movetext clean (handles nested braces via repeated passes)
  while (/\{[^{}]*\}/.test(s)) {
    s = s.replace(/\{[^{}]*\}/g, '');
  }

  // Remove Lichess-specific annotations [%eval ...] [%clk ...] that may appear outside braces
  s = s.replace(/\[\s*%eval\s+[^\]]*\]/gi, '');
  s = s.replace(/\[\s*%clk\s+[^\]]*\]/gi, '');

  // Remove rest-of-line comments ; ...
  s = s.replace(/;[^\n]*/g, '');

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

/**
 * Load PGN into a Chess instance. Returns null if parsing fails.
 */
export function loadPgn<T extends { loadPgn: (p: string, o?: { strict?: boolean }) => void }>(
  pgn: string,
  ChessClass: new () => T
): T | null {
  const s = sanitizePgn(pgn?.trim() || '');
  if (!s || s.length < 5) return null;
  try {
    const chess = new ChessClass();
    chess.loadPgn(s, { strict: false });
    return chess;
  } catch {
    return null;
  }
}
