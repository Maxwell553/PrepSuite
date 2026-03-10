/**
 * Lightweight PGN move extraction (no chess.js).
 * Mirrors pipeline-service moveSequenceExtractor for consistency.
 */

export function parsePGNMoves(pgn: string): string[] {
  if (!pgn || pgn.trim().length === 0) return [];

  const cleanPgn = pgn
    .replace(/\{.*?\}/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[?!+#]/g, '')
    .trim();

  const moves: string[] = [];
  const moveSections = cleanPgn.split(/\d+\.\s*/);

  for (let i = 1; i < moveSections.length; i++) {
    const section = moveSections[i].trim();
    if (!section) continue;

    const tokens = section.split(/\s+/);
    for (const token of tokens) {
      if (!token || token.match(/^\d+$/) || token === '...') continue;
      if (
        token.match(
          /^([a-h][1-8](?:[a-h][1-8])?(?:=[QRBN])?|O-O(?:-O)?|[QRBNK][a-h1-8]?x?[a-h][1-8](?:=[QRBN])?|[a-h]x[a-h][1-8](?:=[QRBN])?|[QRBNK]x[a-h][1-8](?:=[QRBN])?)$/,
        )
      ) {
        moves.push(token);
      }
    }
  }

  return moves;
}
