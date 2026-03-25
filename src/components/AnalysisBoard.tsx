import React, { useState, useMemo, useCallback, startTransition } from 'react';
import { Database, ChevronLeft, ChevronRight, RotateCcw, Loader2 } from 'lucide-react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { GameData } from '../types';
import { type ParsedGame } from '../lib/repertoireUtils';
import { useParsedGames } from '../hooks/useParsedGames';

/** Parse move label to SAN: "1. e4" -> "e4", "1. ... c5" -> "c5" */
function parseMoveLabelToSan(label: string): string {
  const m = label.match(/^(?:\d+\.\s*(?:\.\.\.\s*)?)?(\S+)$/);
  return m ? m[1] : label.trim();
}

function namesMatch(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return x === y || x.includes(y) || y.includes(x);
}

/** Aggregate moves at position using pre-parsed games. */
function aggregateMovesAtPosition(
  parsed: ParsedGame[],
  games: GameData[],
  identifiers: string[],
  repertoireSide: 'white' | 'black',
  moveSequence: string[]
): { move: string; moveLabel: string; wins: number; draws: number; losses: number; totalGames: number; winRate: number }[] {
  const byMove: Record<string, { wins: number; draws: number; losses: number }> = {};
  const depth = moveSequence.length;

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const p = parsed[i];
    if (!p || !g) continue;
    const { history } = p;
    const isPlayerWhite = identifiers.some((id) => namesMatch(g.white, id));
    const isPlayerBlack = identifiers.some((id) => namesMatch(g.black, id));
    const playerHasRepertoireSide = repertoireSide === 'white' ? isPlayerWhite : isPlayerBlack;
    if (!playerHasRepertoireSide || history.length <= depth) continue;

    let matches = true;
    for (let j = 0; j < depth; j++) {
      if (history[j] !== moveSequence[j]) { matches = false; break; }
    }
    if (!matches) continue;

    const rawMove = history[depth];
    const moveNum = Math.floor(depth / 2) + 1;
    const isBlack = depth % 2 === 1;
    const moveLabel = isBlack ? `${moveNum}. ... ${rawMove}` : `${moveNum}. ${rawMove}`;
    if (!byMove[moveLabel]) byMove[moveLabel] = { wins: 0, draws: 0, losses: 0 };
    const r = g.result.trim();
    const isWin = (isPlayerWhite && r === '1-0') || (isPlayerBlack && r === '0-1');
    const isLoss = (isPlayerWhite && r === '0-1') || (isPlayerBlack && r === '1-0');
    const isDraw = r === '1/2-1/2';
    if (isWin) byMove[moveLabel].wins++;
    else if (isLoss) byMove[moveLabel].losses++;
    else if (isDraw) byMove[moveLabel].draws++;
  }

  return Object.entries(byMove)
    .map(([moveLabel, { wins, draws, losses }]) => {
      const totalGames = wins + draws + losses;
      const winRate = totalGames > 0 ? wins / totalGames : 0;
      return { move: parseMoveLabelToSan(moveLabel), moveLabel, wins, draws, losses, totalGames, winRate };
    })
    .sort((a, b) => b.totalGames - a.totalGames);
}

/**
 * Aggregate first moves for repertoire.
 * White: player's first moves (1. e4, 1. d4) from games where player is white.
 * Black: opponent's first moves (1. e4, 1. d4) that the player faced - from games where player is black.
 */
function aggregateByFirstMove(
  parsed: ParsedGame[],
  games: GameData[],
  identifiers: string[],
  side: 'white' | 'black'
): { move: string; moveLabel: string; wins: number; draws: number; losses: number; totalGames: number; winRate: number }[] {
  const byMove: Record<string, { wins: number; draws: number; losses: number }> = {};
  // White: player's first move (1. e4). Black: what white played (responses faced) - also index 0
  const moveIndex = 0;

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const p = parsed[i];
    if (!p || !g) continue;
    const { history } = p;
    const isPlayerWhite = identifiers.some((id) => namesMatch(g.white, id));
    const isPlayerBlack = identifiers.some((id) => namesMatch(g.black, id));
    const include = side === 'white' ? isPlayerWhite : isPlayerBlack;
    if (!include || history.length <= moveIndex) continue;

    const rawMove = history[moveIndex];
    const moveLabel = side === 'white' ? `1. ${rawMove}` : `1. ${rawMove}`;

    if (!byMove[moveLabel]) byMove[moveLabel] = { wins: 0, draws: 0, losses: 0 };
    const r = g.result.trim();
    const isWin = (isPlayerWhite && r === '1-0') || (isPlayerBlack && r === '0-1');
    const isLoss = (isPlayerWhite && r === '0-1') || (isPlayerBlack && r === '1-0');
    const isDraw = r === '1/2-1/2';
    if (isWin) byMove[moveLabel].wins++;
    else if (isLoss) byMove[moveLabel].losses++;
    else if (isDraw) byMove[moveLabel].draws++;
  }

  return Object.entries(byMove)
    .map(([moveLabel, { wins, draws, losses }]) => {
      const totalGames = wins + draws + losses;
      const winRate = totalGames > 0 ? wins / totalGames : 0;
      return { move: parseMoveLabelToSan(moveLabel), moveLabel, wins, draws, losses, totalGames, winRate };
    })
    .sort((a, b) => b.totalGames - a.totalGames);
}

interface AnalysisBoardProps {
  games: GameData[];
  playerName: string;
  /** Username(s) that appear in games (Lichess, Chess.com, or actualUsername) for result dot coloring */
  playerUsername?: string | string[];
  /** Repertoire-only: board + repertoire panel, no game selection. Single-game mode is in GameAnalysisModal. */
  mode?: 'repertoire';
}

const AnalysisBoard: React.FC<AnalysisBoardProps> = ({ games, playerName, playerUsername, mode = 'repertoire' }) => {
  /** Path of SANs from start, e.g. ["e4", "c5", "Nf3"] */
  const [path, setPath] = useState<string[]>([]);
  const [repertoireSide, setRepertoireSide] = useState<'white' | 'black'>('white');

  const gamesSafe = games ?? [];
  const { parsed: parsedGames, loading: parsingGames } = useParsedGames(gamesSafe);

  const usernameList = Array.isArray(playerUsername) ? playerUsername : playerUsername ? [playerUsername] : [];
  const actualUsername = usernameList[0] || (() => {
    if (gamesSafe.length > 0) {
      const firstGame = gamesSafe[0];
      const whiteLower = firstGame.white.toLowerCase().trim();
      const blackLower = firstGame.black.toLowerCase().trim();
      const nameLower = playerName.toLowerCase().trim();
      if (whiteLower === nameLower || whiteLower.includes(nameLower) || nameLower.includes(whiteLower)) return firstGame.white;
      if (blackLower === nameLower || blackLower.includes(nameLower) || nameLower.includes(blackLower)) return firstGame.black;
      const whiteMatch = whiteLower.split('').filter((c) => nameLower.includes(c)).length;
      const blackMatch = blackLower.split('').filter((c) => nameLower.includes(c)).length;
      return whiteMatch > blackMatch ? firstGame.white : firstGame.black;
    }
    return playerName;
  })();

  const identifiersForFilter = [...new Set([actualUsername, playerName, ...usernameList].filter(Boolean))];

  const moveStats = useMemo(() => {
    if (!gamesSafe.length || !parsedGames.length) return [];
    if (path.length === 0) return aggregateByFirstMove(parsedGames, gamesSafe, identifiersForFilter, repertoireSide);
    return aggregateMovesAtPosition(parsedGames, gamesSafe, identifiersForFilter, repertoireSide, path);
  }, [parsedGames, gamesSafe, identifiersForFilter, repertoireSide, path]);

  const quickInsight = useMemo(() => {
    if (!moveStats.length || path.length > 0) return null;
    const sorted = [...moveStats].filter((m) => m.totalGames >= 3);
    const best = sorted.sort((a, b) => b.winRate - a.winRate)[0];
    const worst = sorted.sort((a, b) => a.winRate - b.winRate)[0];
    if (!best || !worst || best === worst) return null;
    const name = playerName.split(/\s+/).pop() || playerName;
    return `${name} scores best with ${best.moveLabel} (${(best.winRate * 100).toFixed(0)}% WR), but struggles with ${worst.moveLabel} (${(worst.winRate * 100).toFixed(0)}% WR).`;
  }, [moveStats, path, playerName]);

  const displayPosition = useMemo(() => {
    if (path.length === 0) return 'start';
    try {
      const chess = new Chess();
      for (const san of path) {
        if (!chess.move(san)) return 'start';
      }
      return chess.fen();
    } catch {
      return 'start';
    }
  }, [path]);

  const boardOrientation: 'white' | 'black' = repertoireSide === 'white' ? 'white' : 'black';

  const handleRepertoireMoveClick = useCallback((moveLabel: string) => {
    const san = parseMoveLabelToSan(moveLabel);
    if (san) startTransition(() => setPath((p) => [...p, san]));
  }, []);

  const handleNavStart = useCallback(() => setPath([]), []);
  const handleNavPrevious = useCallback(() => setPath((p) => (p.length > 0 ? p.slice(0, -1) : p)), []);
  const handleNavNext = useCallback(() => {
    const top = moveStats[0];
    if (top) startTransition(() => setPath((p) => [...p, top.move]));
  }, [moveStats]);

  if (!gamesSafe.length) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <Database className="w-12 h-12 text-slate-400 mx-auto mb-4" />
        <p className="text-slate-400">No games available for analysis</p>
      </div>
    );
  }

  if (parsingGames) {
    return (
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 lg:p-8 shadow-xl flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
          <span>Loading repertoire analysis…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 lg:p-8 shadow-xl">
      <div className="mb-6">
        <h3 className="text-2xl font-bold flex items-center gap-2 text-white">
          <Database className="w-6 h-6 text-indigo-400" />
          Repertoire Analysis
        </h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Board (repertoire positions only) */}
        <div className="min-w-0">
          <div className="flex flex-col items-stretch gap-4 pt-0 px-4 pb-4 lg:px-6 lg:pb-6 bg-slate-800/60 rounded-2xl border border-slate-700/50 min-h-[480px]">
            <div className="flex-1 min-h-0 flex items-stretch justify-center">
              <div className="aspect-square w-full max-w-2xl min-w-0">
                <Chessboard
                  position={displayPosition}
                  boardOrientation={boardOrientation}
                  arePiecesDraggable={false}
                  customBoardStyle={{ borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
                  customDarkSquareStyle={{ backgroundColor: '#769656' }}
                  customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
                />
              </div>
            </div>
            {/* Repertoire nav: Start | Prev | Next */}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={handleNavStart}
                disabled={path.length === 0}
                className="p-2 bg-slate-700/80 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-white"
                title="Go to start"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={handleNavPrevious}
                disabled={path.length === 0}
                className="p-2 bg-slate-700/80 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-white"
                title="Previous move"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNavNext}
                disabled={moveStats.length === 0}
                className="p-2 bg-slate-700/80 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-white"
                title="Next (most common move)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-center px-2 min-h-[1.25rem]">
              {path.length > 0 ? (
                <span className="inline-flex flex-wrap items-center gap-0.5 justify-center">
                  <button type="button" onClick={handleNavStart} className="text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer">Start</button>
                  {path.map((san, i) => {
                    const moveNum = Math.floor(i / 2) + 1;
                    const isBlack = i % 2 === 1;
                    const label = isBlack ? `${moveNum}...${san}` : (i === 0 || i % 2 === 0 ? `${moveNum}.${san}` : san);
                    return (
                      <span key={i} className="inline-flex items-center">
                        <span className="text-slate-600 mx-0.5">›</span>
                        <button
                          type="button"
                          onClick={() => setPath(path.slice(0, i + 1))}
                          className={`font-mono transition-colors cursor-pointer ${i === path.length - 1 ? 'text-white font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          {label}
                        </button>
                      </span>
                    );
                  })}
                </span>
              ) : (
                <span className="text-slate-500">Starting position</span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Repertoire stats */}
        <div className="min-w-0">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden flex flex-col min-h-[520px] shadow-inner">
            <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-300">Repertoire</span>
              <div className="flex rounded-lg overflow-hidden border border-slate-600">
                <button
                  type="button"
                  onClick={() => { setRepertoireSide('white'); setPath([]); }}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    repertoireSide === 'white'
                      ? 'bg-slate-600 text-white'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  White
                </button>
                <button
                  type="button"
                  onClick={() => { setRepertoireSide('black'); setPath([]); }}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    repertoireSide === 'black'
                      ? 'bg-slate-600 text-white'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Black
                </button>
              </div>
            </div>
            {quickInsight && (
              <div className="px-4 py-2.5 bg-indigo-500/[0.06] border-b border-indigo-500/10">
                <p className="text-xs text-indigo-300/80 leading-relaxed">{quickInsight}</p>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4 min-h-0 flex flex-col gap-6" style={{ contain: 'layout' }}>
              {/* Repertoire stats: MOVE | GAMES | PERFORMANCE */}
              {(() => {
                const totalGames = moveStats.reduce((s, m) => s + m.totalGames, 0);
                const wins = moveStats.reduce((s, m) => s + m.wins, 0);
                const draws = moveStats.reduce((s, m) => s + m.draws, 0);
                const losses = moveStats.reduce((s, m) => s + m.losses, 0);
                const winPct = totalGames > 0 ? (wins / totalGames * 100).toFixed(0) : '0';
                const drawPct = totalGames > 0 ? (draws / totalGames * 100).toFixed(0) : '0';
                const lossPct = totalGames > 0 ? (losses / totalGames * 100).toFixed(0) : '0';
                return (
                  <>
                    <div>
                      <div className="text-lg font-bold text-slate-200 mb-2">{totalGames.toLocaleString()} Games</div>
                      <div className="flex h-2 rounded-full overflow-hidden bg-slate-700/80 mb-1">
                        <div className="bg-emerald-500" style={{ width: `${winPct}%` }} title="Wins" />
                        <div className="bg-slate-500" style={{ width: `${drawPct}%` }} title="Draws" />
                        <div className="bg-red-500" style={{ width: `${lossPct}%` }} title="Losses" />
                      </div>
                      <div className="text-xs text-slate-400">{winPct}% {drawPct}% {lossPct}%</div>
                    </div>
                    <table className="w-full text-sm border-collapse table-fixed">
                      <thead>
                        <tr className="text-slate-400 text-left border-b border-slate-700/50">
                          <th className="pb-2 font-semibold w-[40%]">MOVE</th>
                          <th className="pb-2 font-semibold w-[20%] text-center pr-4">GAMES</th>
                          <th className="pb-2 font-semibold w-[40%] text-right">PERFORMANCE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {moveStats.map((m, idx) => {
                          const winRate = m.winRate;
                          const winPercent = (winRate * 100).toFixed(1);
                          const perfColor = winRate >= 0.55 ? 'bg-emerald-500' : winRate <= 0.45 ? 'bg-red-500' : 'bg-amber-500';
                          return (
                            <tr
                              key={idx}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleRepertoireMoveClick(m.moveLabel || m.move)}
                              onKeyDown={(e) => e.key === 'Enter' && handleRepertoireMoveClick(m.moveLabel || m.move)}
                              className="border-b border-slate-700/30 hover:bg-slate-700/40 cursor-pointer transition-colors"
                            >
                              <td className="py-2 text-slate-200 font-medium font-mono" title={m.moveLabel || m.move}>{m.moveLabel || m.move}</td>
                              <td className="py-2 text-slate-400 text-center font-mono pr-4">{m.totalGames}</td>
                              <td className="py-2">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 min-w-0 h-2 bg-slate-700 rounded overflow-hidden">
                                    <div
                                      className={`h-full ${perfColor} rounded`}
                                      style={{ width: `${Math.min(100, winRate * 100)}%` }}
                                    />
                                  </div>
                                  <span className={`w-10 text-right font-mono text-xs shrink-0 ${
                                    winRate >= 0.55 ? 'text-emerald-400' : winRate <= 0.45 ? 'text-red-400' : 'text-amber-400'
                                  }`}>
                                    {winPercent}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {moveStats.length === 0 && (
                      <p className="text-sm text-slate-400 py-4 text-center">No {repertoireSide} data</p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisBoard;
