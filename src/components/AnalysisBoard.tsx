import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play, Pause, RotateCcw, Database, Filter, FastForward } from 'lucide-react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { GameData } from '../types';
import { loadPgn } from '../lib/pgnUtils';

interface AnalysisBoardProps {
  games: GameData[];
  playerName: string;
  playerUsername?: string; // Optional: actual username from games for better matching
}

const AnalysisBoard: React.FC<AnalysisBoardProps> = ({ games, playerName, playerUsername }) => {
  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1); // -1 = starting position
  const [isPlaying, setIsPlaying] = useState(false);
  const [filter, setFilter] = useState<'all' | 'white' | 'black' | 'wins' | 'losses' | 'draws' | 'chess.com' | 'lichess' | 'otb'>('all');
  const [game, setGame] = useState<Chess | null>(null);
  const [gamePosition, setGamePosition] = useState<string>('start');
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [fetchedPgns, setFetchedPgns] = useState<Record<string, string>>({});
  const [isFetchingPgn, setIsFetchingPgn] = useState(false);

  // Early returns for empty games
  if (!games || games.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <Database className="w-12 h-12 text-slate-500 mx-auto mb-4" />
        <p className="text-slate-400">No games available for analysis</p>
      </div>
    );
  }

  const playerLower = playerName.toLowerCase().trim();
  // Use actual username from games if available, otherwise use playerName
  // Extract username from first game if not provided
  const actualUsername = playerUsername || (() => {
    if (games.length > 0) {
      const firstGame = games[0];
      // Try to find which player matches - check both white and black
      const whiteLower = firstGame.white.toLowerCase().trim();
      const blackLower = firstGame.black.toLowerCase().trim();
      const nameLower = playerName.toLowerCase().trim();
      
      // Check if white matches
      if (whiteLower === nameLower || whiteLower.includes(nameLower) || nameLower.includes(whiteLower)) {
        return firstGame.white;
      }
      // Check if black matches
      if (blackLower === nameLower || blackLower.includes(nameLower) || nameLower.includes(blackLower)) {
        return firstGame.black;
      }
      // Fallback: return the one that's closer (has more matching characters)
      const whiteMatch = whiteLower.split('').filter(c => nameLower.includes(c)).length;
      const blackMatch = blackLower.split('').filter(c => nameLower.includes(c)).length;
      return whiteMatch > blackMatch ? firstGame.white : firstGame.black;
    }
    return playerName;
  })();

  // Helper function to check if names match (more robust)
  const namesMatch = (name1: string, name2: string): boolean => {
    const n1 = name1.toLowerCase().trim();
    const n2 = name2.toLowerCase().trim();
    // Exact match
    if (n1 === n2) return true;
    // One contains the other (for partial matches)
    if (n1.includes(n2) || n2.includes(n1)) return true;
    // Check if they share significant words (for "Last, First" vs "First Last")
    const words1 = n1.split(/[\s,]+/).filter(w => w.length > 2);
    const words2 = n2.split(/[\s,]+/).filter(w => w.length > 2);
    if (words1.length > 0 && words2.length > 0) {
      const commonWords = words1.filter(w => words2.includes(w));
      // If at least 2 words match, consider it a match
      if (commonWords.length >= 2) return true;
      // If one name is short and matches, also consider it
      if (words1.length <= 2 && commonWords.length >= 1) return true;
      if (words2.length <= 2 && commonWords.length >= 1) return true;
    }
    return false;
  };

  // Filter games based on selected filter - match against playerName and actualUsername
  const identifiersForFilter = [actualUsername, playerName].filter(Boolean);
  const filteredGames = games.filter(game => {
    const isWhite = identifiersForFilter.some((id) => namesMatch(game.white, id));
    const isBlack = identifiersForFilter.some((id) => namesMatch(game.black, id));
    const resultTrimmed = game.result.trim();
    const gameSource = (game.source || '').toLowerCase();
    
    if (filter === 'white') return isWhite;
    if (filter === 'black') return isBlack;
    if (filter === 'wins') {
      if (isWhite) return resultTrimmed === '1-0';
      if (isBlack) return resultTrimmed === '0-1';
      return false;
    }
    if (filter === 'losses') {
      if (isWhite) return resultTrimmed === '0-1';
      if (isBlack) return resultTrimmed === '1-0';
      return false;
    }
    if (filter === 'draws') return resultTrimmed === '1/2-1/2';
    if (filter === 'chess.com') return gameSource === 'chess.com';
    if (filter === 'lichess') return gameSource === 'lichess';
    if (filter === 'otb') return gameSource === 'otb';
    return true; // 'all'
  });

  if (filteredGames.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <Filter className="w-12 h-12 text-slate-500 mx-auto mb-4" />
        <p className="text-slate-400">No games match the selected filter</p>
      </div>
    );
  }

  const currentGame = filteredGames[currentGameIndex];
  if (!currentGame) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <Database className="w-12 h-12 text-slate-500 mx-auto mb-4" />
        <p className="text-slate-400">No game selected</p>
      </div>
    );
  }

  // Match against both playerName and actualUsername (OTB games use FIDE "Last, First"
  // while playerName may be "First Last"; actualUsername from first game may be online-only)
  const playerIdentifiers = [actualUsername, playerName].filter(Boolean);
  const isPlayerWhite = playerIdentifiers.some((id) => namesMatch(currentGame.white, id));
  const isPlayerBlack = playerIdentifiers.some((id) => namesMatch(currentGame.black, id));

  // Helper function to determine win/loss/draw (defined before use)
  const getGameResult = (result: string): string => {
    const resultTrimmed = result.trim();

    // First, try to determine based on isPlayerWhite/isPlayerBlack flags
    if (isPlayerWhite) {
      if (resultTrimmed === '1-0') return 'Win';
      if (resultTrimmed === '0-1') return 'Loss';
      if (resultTrimmed === '1/2-1/2') return 'Draw';
    }

    if (isPlayerBlack) {
      if (resultTrimmed === '0-1') return 'Win';
      if (resultTrimmed === '1-0') return 'Loss';
      if (resultTrimmed === '1/2-1/2') return 'Draw';
    }

    // When we can't determine the player's side (e.g. name mismatch), show raw result
    if (resultTrimmed === '1-0') return '1-0';
    if (resultTrimmed === '0-1') return '0-1';
    if (resultTrimmed === '1/2-1/2') return '½-½';
    return resultTrimmed || 'Unknown';
  };
  
  // Auto-flip board: if player is white, show from white's perspective (white on bottom)
  // If player is black, show from black's perspective (black on bottom)
  // Default to white if we can't determine (shouldn't happen, but safety fallback)
  const boardOrientation: 'white' | 'black' = isPlayerWhite ? 'white' : (isPlayerBlack ? 'black' : 'white');
  
  // Helper function to get result color and determine win/loss
  const getResultColor = (result: string, isWhite: boolean, isBlack: boolean) => {
    const resultTrimmed = result.trim();
    if (isWhite && resultTrimmed === '1-0') return 'text-green-400';
    if (isBlack && resultTrimmed === '0-1') return 'text-green-400';
    if (isWhite && resultTrimmed === '0-1') return 'text-red-400';
    if (isBlack && resultTrimmed === '1-0') return 'text-red-400';
    return 'text-yellow-400';
  };
  
  // Effective PGN: use inline or fetched Lichess PGN when missing
  const effectivePgn = currentGame.pgn && currentGame.pgn.trim().length > 10
    ? currentGame.pgn
    : (currentGame.id && currentGame.source === 'lichess' ? fetchedPgns[currentGame.id] : null) || currentGame.pgn;

  // Fetch PGN from Lichess when game has no PGN but has id (fallback for saved reports)
  useEffect(() => {
    const g = currentGame;
    if (!g || g.source !== 'lichess' || !g.id) {
      setIsFetchingPgn(false);
      return;
    }
    if (g.pgn && g.pgn.trim().length > 10) {
      setIsFetchingPgn(false);
      return;
    }
    if (fetchedPgns[g.id]) {
      setIsFetchingPgn(false);
      return;
    }
    let cancelled = false;
    setIsFetchingPgn(true);
    (async () => {
      try {
        const res = await fetch(`/lichess-export/game/export/${g.id}`);
        if (!res.ok || cancelled) return;
        const text = await res.text();
        if (cancelled || !text.trim()) return;
        setFetchedPgns(prev => ({ ...prev, [g.id!]: text }));
      } catch {
        // ignore
      } finally {
        if (!cancelled) setIsFetchingPgn(false);
      }
    })();
    return () => { cancelled = true; setIsFetchingPgn(false); };
  }, [currentGameIndex, currentGame?.id, currentGame?.source, currentGame?.pgn]);

  // Load game when currentGameIndex or effective PGN changes
  useEffect(() => {
    if (!effectivePgn || effectivePgn.trim().length < 5) {
      setGame(null);
      setMoveHistory([]);
      setCurrentMoveIndex(-1);
      setGamePosition('start');
      return;
    }

    const chess = loadPgn(effectivePgn, Chess);
    if (chess) {
      setGame(chess);
      setMoveHistory(chess.history());
      setCurrentMoveIndex(-1);
      setGamePosition('start');
    } else {
      setGame(null);
      setMoveHistory([]);
      setCurrentMoveIndex(-1);
      setGamePosition('start');
    }
  }, [currentGameIndex, effectivePgn]);

  // Update board position when move index changes
  useEffect(() => {
    if (!game || currentMoveIndex < 0) {
      setGamePosition('start');
      return;
    }

    try {
      const history = game.history({ verbose: true });
      const chess = new Chess();
      chess.reset();

      for (let i = 0; i <= currentMoveIndex && i < history.length; i++) {
        const move = history[i];
        chess.move({ from: move.from, to: move.to, promotion: move.promotion });
      }

      setGamePosition(chess.fen());
    } catch (error) {
      console.error('Error updating position:', error);
    }
  }, [currentMoveIndex, game]);

  // Auto-play moves
  useEffect(() => {
    if (isPlaying && currentMoveIndex < moveHistory.length - 1) {
      const timer = setTimeout(() => {
        setCurrentMoveIndex(currentMoveIndex + 1);
      }, 1000); // 1 second per move
      return () => clearTimeout(timer);
    } else if (isPlaying && currentMoveIndex >= moveHistory.length - 1) {
      setIsPlaying(false);
    }
  }, [isPlaying, currentMoveIndex, moveHistory.length]);

  // Arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentMoveIndex > -1) {
          setCurrentMoveIndex(prev => prev - 1);
          setIsPlaying(false);
        } else if (currentGameIndex > 0) {
          setCurrentGameIndex(prev => prev - 1);
          setIsPlaying(false);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentMoveIndex < moveHistory.length - 1) {
          setCurrentMoveIndex(prev => prev + 1);
        } else if (currentGameIndex < filteredGames.length - 1) {
          setCurrentGameIndex(prev => prev + 1);
          setIsPlaying(false);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentGameIndex > 0) {
          setCurrentGameIndex(prev => prev - 1);
          setIsPlaying(false);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentGameIndex < filteredGames.length - 1) {
          setCurrentGameIndex(prev => prev + 1);
          setIsPlaying(false);
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        setCurrentMoveIndex(-1);
        setIsPlaying(false);
      } else if (e.key === 'End') {
        e.preventDefault();
        setCurrentMoveIndex(moveHistory.length - 1);
        setIsPlaying(false);
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentMoveIndex, currentGameIndex, moveHistory.length, filteredGames.length]);

  const handlePreviousMove = () => {
    if (currentMoveIndex > -1) {
      setCurrentMoveIndex(currentMoveIndex - 1);
      setIsPlaying(false);
    }
  };

  const handleNextMove = () => {
    if (currentMoveIndex < moveHistory.length - 1) {
      setCurrentMoveIndex(currentMoveIndex + 1);
    }
  };

  const handleReset = () => {
    setCurrentMoveIndex(-1);
    setIsPlaying(false);
  };

  const handleMoveToEnd = () => {
    setCurrentMoveIndex(moveHistory.length - 1);
    setIsPlaying(false);
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleMoveClick = (index: number) => {
    setCurrentMoveIndex(index);
    setIsPlaying(false);
  };

  // Format moves for display (with move numbers)
  const formatMovesForDisplay = (): Array<{ moveNumber: number; whiteMove: string; blackMove: string | null; index: number }> => {
    const formatted: Array<{ moveNumber: number; whiteMove: string; blackMove: string | null; index: number }> = [];
    for (let i = 0; i < moveHistory.length; i += 2) {
      formatted.push({
        moveNumber: Math.floor(i / 2) + 1,
        whiteMove: moveHistory[i],
        blackMove: i + 1 < moveHistory.length ? moveHistory[i + 1] : null,
        index: i
      });
    }
    return formatted;
  };

  const formattedMoves = formatMovesForDisplay();

  // Result dot color for game list
  const getResultDotColor = (r: string, isW: boolean, isB: boolean) => {
    const t = r.trim();
    if (isW && t === '1-0') return 'bg-green-500';
    if (isB && t === '0-1') return 'bg-green-500';
    if (isW && t === '0-1') return 'bg-red-500';
    if (isB && t === '1-0') return 'bg-red-500';
    return 'bg-slate-500';
  };

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 lg:p-8 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold flex items-center gap-2 text-white">
          <Database className="w-6 h-6 text-indigo-400" />
          Game Analysis Board
        </h3>
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as typeof filter);
            setCurrentGameIndex(0);
            setIsPlaying(false);
          }}
          className="bg-slate-800/80 border border-slate-600 rounded-xl px-4 py-2 text-sm text-white"
        >
          <option value="all">All Games ({games.length})</option>
          <option value="white">As White ({games.filter(g => identifiersForFilter.some(id => namesMatch(g.white, id))).length})</option>
          <option value="black">As Black ({games.filter(g => identifiersForFilter.some(id => namesMatch(g.black, id))).length})</option>
          <option value="wins">Wins ({games.filter(g => {
            const isW = identifiersForFilter.some(id => namesMatch(g.white, id));
            const isB = identifiersForFilter.some(id => namesMatch(g.black, id));
            return (isW && g.result.trim() === '1-0') || (isB && g.result.trim() === '0-1');
          }).length})</option>
          <option value="losses">Losses ({games.filter(g => {
            const isW = identifiersForFilter.some(id => namesMatch(g.white, id));
            const isB = identifiersForFilter.some(id => namesMatch(g.black, id));
            return (isW && g.result.trim() === '0-1') || (isB && g.result.trim() === '1-0');
          }).length})</option>
          <option value="draws">Draws ({games.filter(g => g.result.trim() === '1/2-1/2').length})</option>
          {games.some(g => (g.source || '').toLowerCase() === 'chess.com') && (
            <option value="chess.com">Chess.com ({games.filter(g => (g.source || '').toLowerCase() === 'chess.com').length})</option>
          )}
          {games.some(g => (g.source || '').toLowerCase() === 'lichess') && (
            <option value="lichess">Lichess ({games.filter(g => (g.source || '').toLowerCase() === 'lichess').length})</option>
          )}
          {games.some(g => (g.source || '').toLowerCase() === 'otb') && (
            <option value="otb">OTB ({games.filter(g => (g.source || '').toLowerCase() === 'otb').length})</option>
          )}
        </select>
      </div>

      {/* Main: Left list (5% wider), Center board, Right moves (same width as left) */}
      <div className="grid grid-cols-1 lg:grid-cols-[2.1fr_7fr_2fr] gap-4 lg:gap-6 items-start">
        {/* Left: Game list */}
        <div className="order-2 lg:order-1 min-w-0">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden flex flex-col max-h-[560px] shadow-inner">
            <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-800 z-10">
                  <tr className="text-slate-400 text-left">
                    <th className="px-1.5 py-2 font-semibold w-6"></th>
                    <th className="px-1.5 py-2 font-semibold">Year</th>
                    <th className="px-1.5 py-2 font-semibold">White</th>
                    <th className="px-1.5 py-2 font-semibold">Black</th>
                    <th className="px-1.5 py-2 font-semibold">Res.</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGames.map((g, idx) => {
                    const isSelected = idx === currentGameIndex;
                    const rowResult = g.result.trim();
                    const isW = identifiersForFilter.some((id) => namesMatch(g.white, id));
                    const isB = identifiersForFilter.some((id) => namesMatch(g.black, id));
                    return (
                      <tr
                        key={idx}
                        onClick={() => { setCurrentGameIndex(idx); setIsPlaying(false); }}
                        className={`border-t border-slate-700/50 cursor-pointer transition-all duration-200 ${
                          isSelected ? 'bg-indigo-600/30 ring-1 ring-indigo-500/50 text-white' : 'hover:bg-slate-700/40 text-slate-300'
                        }`}
                      >
                        <td className="px-1.5 py-1.5">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${getResultDotColor(rowResult, isW, isB)}`} />
                        </td>
                        <td className="px-1.5 py-1.5">
                          {g.playedAt && g.playedAt !== '1970-01-01T00:00:00.000Z'
                            ? new Date(g.playedAt).getFullYear()
                            : '—'}
                        </td>
                        <td className="px-1.5 py-1.5 truncate max-w-[70px]" title={g.white}>{g.white}</td>
                        <td className="px-1.5 py-1.5 truncate max-w-[70px]" title={g.black}>{g.black}</td>
                        <td className="px-1.5 py-1.5">{rowResult}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Center: Board - top aligns with column headers, board fills container */}
        <div className="order-1 lg:order-2 min-w-0">
          <div className="flex flex-col items-stretch gap-4 pt-0 px-4 pb-4 lg:px-6 lg:pb-6 bg-slate-900/50 rounded-2xl border border-slate-700/30 min-h-[560px]">
            <div className="flex-1 min-h-0 flex items-stretch justify-center">
              {game ? (
                <div className="aspect-square w-full max-w-2xl min-w-0">
                  <Chessboard
                    position={gamePosition}
                    boardOrientation={boardOrientation}
                    customBoardStyle={{ borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
                    customDarkSquareStyle={{ backgroundColor: '#769656' }}
                    customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
                  />
                </div>
              ) : (
                <div className="aspect-square flex-1 flex items-center justify-center bg-slate-800/40 rounded-xl border border-dashed border-slate-600">
                  <div className="text-center text-slate-500">
                    <Database className="w-14 h-14 mx-auto mb-2 opacity-50" />
                    <div className="text-sm">
                      {isFetchingPgn ? 'Loading PGN...' : 'No valid PGN available'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Controls: move nav centered with play under d-e files */}
            <div className="flex items-center justify-center w-full max-w-2xl gap-2">
              <button onClick={handlePreviousMove} disabled={currentMoveIndex === -1} className="p-2 bg-slate-700/80 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-white" title="Previous move (←)">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={handleReset} className="p-2 bg-slate-700/80 hover:bg-slate-600 rounded-lg text-white" title="Jump to start (Home)">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={handlePlayPause} className="p-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white shadow-lg shadow-indigo-900/30" title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button onClick={handleMoveToEnd} disabled={currentMoveIndex >= moveHistory.length - 1} className="p-2 bg-slate-700/80 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-white" title="Jump to end (End)">
                <FastForward className="w-4 h-4" />
              </button>
              <button onClick={handleNextMove} disabled={currentMoveIndex >= moveHistory.length - 1} className="p-2 bg-slate-700/80 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-white" title="Next move (→)">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Game summary - 5% wider than max-w-2xl (42rem * 1.05 ≈ 44rem) */}
            <div className="w-full max-w-[44rem] text-sm text-center space-y-1">
              <div>
                <span className={`font-semibold ${getResultColor(currentGame.result, isPlayerWhite, isPlayerBlack)}`}>{getGameResult(currentGame.result)}</span>
                <span className="text-slate-500"> · </span>
                <span className="font-semibold text-slate-200">
                  {currentGame.whiteTitle && <span className="text-amber-400/90">{currentGame.whiteTitle} </span>}
                  {currentGame.white}
                  {currentGame.whiteElo != null && <span className="text-slate-400 font-normal"> ({currentGame.whiteElo})</span>}
                </span>
                <span className="text-slate-500"> vs </span>
                <span className="font-semibold text-slate-200">
                  {currentGame.blackTitle && <span className="text-amber-400/90">{currentGame.blackTitle} </span>}
                  {currentGame.black}
                  {currentGame.blackElo != null && <span className="text-slate-400 font-normal"> ({currentGame.blackElo})</span>}
                </span>
                <span className="text-slate-500"> · {currentGame.result} · {currentGame.eco || currentGame.openingName || 'Unknown'} · </span>
                <span className="text-slate-500">
                  {currentGame.playedAt && currentGame.playedAt !== '1970-01-01T00:00:00.000Z'
                    ? new Date(currentGame.playedAt).toLocaleDateString()
                    : 'Date unknown'}
                </span>
              </div>
              <div className="text-slate-500 text-xs">
                {currentGame.source === 'otb' && currentGame.event
                  ? currentGame.event
                  : currentGame.source === 'lichess'
                    ? 'Lichess.org'
                    : currentGame.source === 'chess.com'
                      ? 'Chess.com'
                      : currentGame.source || 'Unknown'}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Move list - same width as left, reduced white space */}
        <div className="order-3 min-w-0">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 max-h-[560px] flex flex-col shadow-inner">
            <div className="text-xs font-semibold text-slate-400 mb-3">Move Notation</div>
            <div className="font-mono text-sm flex-1 overflow-y-auto space-y-1">
              {formattedMoves.length > 0 ? (
                formattedMoves.map(({ moveNumber, whiteMove, blackMove, index }) => (
                  <div key={index} className="flex items-baseline gap-2 py-0.5">
                    <span className="text-slate-500 w-6 text-right shrink-0">{moveNumber}.</span>
                    <span
                      className={`cursor-pointer transition-colors ${index <= currentMoveIndex ? 'text-indigo-200 bg-indigo-500/20' : 'text-slate-400 hover:text-slate-200'}`}
                      onClick={() => handleMoveClick(index)}
                    >
                      {whiteMove}
                    </span>
                    {blackMove && (
                      <span
                        className={`cursor-pointer transition-colors ${index + 1 <= currentMoveIndex ? 'text-indigo-200 bg-indigo-500/20' : 'text-slate-400 hover:text-slate-200'}`}
                        onClick={() => handleMoveClick(index + 1)}
                      >
                        {blackMove}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-slate-500 text-sm italic">No moves available</div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-600/50">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Shortcuts</div>
              <div className="text-xs text-slate-500 space-y-0.5">
                <div>← → Moves</div>
                <div>↑ ↓ Games</div>
                <div>Space Play/Pause</div>
                <div>Home/End Start/End</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-between text-xs text-slate-500">
        <span>{currentMoveIndex === -1 ? 'Starting position' : `Move ${currentMoveIndex + 1} of ${moveHistory.length}`}</span>
        <span>Board: {boardOrientation === 'white' ? 'White bottom' : 'Black bottom'}</span>
      </div>
    </div>
  );
};

export default AnalysisBoard;
