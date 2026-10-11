import { Chess } from 'chess.js';
import type { ParsedGame } from './repertoireUtils';
import { samePlayer } from './identity';

export function recordedPracticeMove(parsed: ParsedGame[], identifiers: string[], side: 'white'|'black', history: string[], fen: string): string | null {
  const counts = new Map<string, number>();
  for (const entry of parsed) {
    if (!entry || !identifiers.some(id=>samePlayer(entry.game[side],id))) continue;
    if (!history.every((move,i)=>entry.history[i]===move)) continue;
    const san=entry.history[history.length];
    if (san) counts.set(san,(counts.get(san)||0)+1);
  }
  for (const [san] of [...counts].sort((a,b)=>b[1]-a[1])) {
    try {
      const move=new Chess(fen).move(san);
      return move.from+move.to+(move.promotion||'');
    } catch { /* Ignore corrupt or mismatched game data. */ }
  }
  return null;
}
