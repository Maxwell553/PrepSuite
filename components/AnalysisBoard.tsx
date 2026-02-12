import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play, Pause, RotateCcw, Database, Filter, FastForward } from 'lucide-react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { GameData } from '../types';

interface AnalysisBoardProps {
  games: GameData[];
  playerName: string;
  playerUsername?: string; // Optional: actual username from games for better matching
}

const AnalysisBoard: React.FC<AnalysisBoardProps> = ({ games, playerName, playerUsername }) => {
  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1); // -1 = starting position
  const [isPlaying, setIsPlaying] = useState(false);
  const [filter, setFilter] = useState<'all' | 'white' | 'black' | 'wins' | 'losses' | 'draws'>('all');
  const [game, setGame] = useState<Chess | null>(null);
  const [gamePosition, setGamePosition] = useState<string>('start');
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [fetchedPgns, setFetchedPgns] = useState<Record<string, string>>({});

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

  const usernameLower = actualUsername.toLowerCase().trim();

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

  // Filter games based on selected filter - use actual username for matching
  const filteredGames = games.filter(game => {
    const isWhite = namesMatch(game.white, actualUsername);
    const isBlack = namesMatch(game.black, actualUsername);
    const resultTrimmed = game.result.trim();
    
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

  // More robust player matching - use actual username from games
  const isPlayerWhite = namesMatch(currentGame.white, actualUsername);
  const isPlayerBlack = namesMatch(currentGame.black, actualUsername);
  
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
    
    // Fallback: Check if actual username matches white or black exactly
    const whiteExact = currentGame.white.toLowerCase().trim() === usernameLower;
    const blackExact = currentGame.black.toLowerCase().trim() === usernameLower;
    
    if (whiteExact) {
      if (resultTrimmed === '1-0') return 'Win';
      if (resultTrimmed === '0-1') return 'Loss';
      if (resultTrimmed === '1/2-1/2') return 'Draw';
    }
    
    if (blackExact) {
      if (resultTrimmed === '0-1') return 'Win';
      if (resultTrimmed === '1-0') return 'Loss';
      if (resultTrimmed === '1/2-1/2') return 'Draw';
    }
    
    // Last resort: Check if username is contained in white/black names
    const whiteContains = currentGame.white.toLowerCase().trim().includes(usernameLower) || usernameLower.includes(currentGame.white.toLowerCase().trim());
    const blackContains = currentGame.black.toLowerCase().trim().includes(usernameLower) || usernameLower.includes(currentGame.black.toLowerCase().trim());
    
    if (whiteContains && !blackContains) {
      // Player is likely white
      if (resultTrimmed === '1-0') return 'Win';
      if (resultTrimmed === '0-1') return 'Loss';
      if (resultTrimmed === '1/2-1/2') return 'Draw';
    }
    
    if (blackContains && !whiteContains) {
      // Player is likely black
      if (resultTrimmed === '0-1') return 'Win';
      if (resultTrimmed === '1-0') return 'Loss';
      if (resultTrimmed === '1/2-1/2') return 'Draw';
    }
    
    return 'Unknown';
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
  
  // Debug logging (can be removed in production)
  if (process.env.NODE_ENV === 'development') {
    console.log('[AnalysisBoard] Player matching:', {
      playerName: playerName,
      actualUsername: actualUsername,
      white: currentGame.white,
      black: currentGame.black,
      result: currentGame.result,
      isPlayerWhite,
      isPlayerBlack,
      boardOrientation,
      gameResult: getGameResult(currentGame.result)
    });
  }

  // Effective PGN: use inline or fetched PGN for Lichess games missing data
  const effectivePgn = currentGame.pgn && currentGame.pgn.trim().length > 10
    ? currentGame.pgn
    : (currentGame.id && currentGame.source === 'lichess' ? fetchedPgns[currentGame.id] : null) || currentGame.pgn;

  // Fetch PGN from Lichess when game has no PGN but has id (for playback)
  useEffect(() => {
    const g = currentGame;
    if (!g || g.source !== 'lichess' || !g.id) return;
    if (g.pgn && g.pgn.trim().length > 10) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/lichess-export/game/export/${g.id}.pgn`);
        if (!res.ok || cancelled) return;
        const text = await res.text();
        if (cancelled || !text.trim()) return;
        setFetchedPgns(prev => ({ ...prev, [g.id!]: text }));
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
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

    try {
      const chess = new Chess();
      chess.loadPgn(effectivePgn);
      setGame(chess);
      
      // Get move history
      const history = chess.history();
      setMoveHistory(history);
      
      // Reset to starting position
      setCurrentMoveIndex(-1);
      setGamePosition('start');
    } catch (error) {
      console.error('Failed to load PGN:', error);
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
      const chess = new Chess();
      chess.loadPgn(effectivePgn || '');
      
      // Replay moves up to currentMoveIndex
      const history = chess.history({ verbose: true });
      chess.reset();
      
      for (let i = 0; i <= currentMoveIndex && i < history.length; i++) {
        const move = history[i];
        chess.move({ from: move.from, to: move.to, promotion: move.promotion });
      }
      
      setGamePosition(chess.fen());
    } catch (error) {
      console.error('Error updating position:', error);
    }
  }, [currentMoveIndex, game, effectivePgn]);

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

  const handlePreviousGame = () => {
    if (currentGameIndex > 0) {
      setCurrentGameIndex(currentGameIndex - 1);
      setIsPlaying(false);
    }
  };

  const handleNextGame = () => {
    if (currentGameIndex < filteredGames.length - 1) {
      setCurrentGameIndex(currentGameIndex + 1);
      setIsPlaying(false);
    }
  };

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

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold flex items-center gap-2 text-white">
          <Database className="w-6 h-6 text-indigo-400" />
          Game Analysis Board
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as any);
              setCurrentGameIndex(0);
              setIsPlaying(false);
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-sm text-white"
          >
            <option value="all">All Games ({games.length})</option>
            <option value="white">As White ({games.filter(g => namesMatch(g.white, actualUsername)).length})</option>
            <option value="black">As Black ({games.filter(g => namesMatch(g.black, actualUsername)).length})</option>
            <option value="wins">Wins ({games.filter(g => {
              const isW = namesMatch(g.white, actualUsername);
              const isB = namesMatch(g.black, actualUsername);
              return (isW && g.result.trim() === '1-0') || (isB && g.result.trim() === '0-1');
            }).length})</option>
            <option value="losses">Losses ({games.filter(g => {
              const isW = namesMatch(g.white, actualUsername);
              const isB = namesMatch(g.black, actualUsername);
              return (isW && g.result.trim() === '0-1') || (isB && g.result.trim() === '1-0');
            }).length})</option>
            <option value="draws">Draws ({games.filter(g => g.result.trim() === '1/2-1/2').length})</option>
          </select>
        </div>
      </div>

      {/* Main Content: Side-by-side layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        {/* Left Side: Game Info */}
        <div className="lg:col-span-1">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 sticky top-4">
            <div className="text-sm text-slate-400 mb-4">
              Game {currentGameIndex + 1} of {filteredGames.length}
            </div>
            <div className={`text-lg font-semibold mb-4 ${getResultColor(currentGame.result, isPlayerWhite, isPlayerBlack)}`}>
              {getGameResult(currentGame.result)}
            </div>
            <div className="text-xs text-slate-500 space-y-2">
              <div><strong>White:</strong> {currentGame.white}</div>
              <div><strong>Black:</strong> {currentGame.black}</div>
              <div><strong>Result:</strong> {currentGame.result}</div>
              <div><strong>ECO:</strong> {currentGame.eco || 'Unknown'}</div>
              <div><strong>Source:</strong> {currentGame.source}</div>
              <div><strong>Date:</strong> {new Date(currentGame.playedAt).toLocaleDateString()}</div>
            </div>
          </div>
        </div>

        {/* Center: Chess Board (smaller) */}
        <div className="lg:col-span-2">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
            {game ? (
              <div className="aspect-square max-w-lg mx-auto">
                <Chessboard
                  position={gamePosition}
                  boardOrientation={boardOrientation}
                  customBoardStyle={{
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
                  }}
                  customDarkSquareStyle={{ backgroundColor: '#769656' }}
                  customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
                />
              </div>
            ) : (
              <div className="aspect-square flex items-center justify-center text-slate-500 max-w-lg mx-auto">
                <div className="text-center">
                  <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <div className="text-sm">No valid PGN available</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Move Notation and Controls */}
        <div className="lg:col-span-1">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 max-h-[600px] flex flex-col">
            <div className="text-xs text-slate-400 mb-2">Move Notation</div>
            <div className="font-mono text-sm text-slate-300 flex-1 overflow-y-auto">
              {formattedMoves.length > 0 ? (
                formattedMoves.map(({ moveNumber, whiteMove, blackMove, index }) => (
                  <div key={index} className="mb-1">
                    <span className="text-slate-500 mr-2">{moveNumber}.</span>
                    <span
                      className={`px-2 py-1 rounded cursor-pointer transition-colors ${
                        index <= currentMoveIndex
                          ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-500/50'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      onClick={() => handleMoveClick(index)}
                    >
                      {whiteMove}
                    </span>
                    {blackMove && (
                      <span
                        className={`ml-2 px-2 py-1 rounded cursor-pointer transition-colors ${
                          index + 1 <= currentMoveIndex
                            ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-500/50'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
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
            <div className="mt-4 pt-4 border-t border-slate-700">
              <div className="text-xs text-slate-500 mb-2">Keyboard Shortcuts</div>
              <div className="text-xs text-slate-600 space-y-1">
                <div>← → Navigate moves</div>
                <div>↑ ↓ Navigate games</div>
                <div>Space Play/Pause</div>
                <div>Home Reset</div>
                <div>End Go to end</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePreviousGame}
            disabled={currentGameIndex === 0}
            className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
            title="Previous game"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm text-slate-400 px-2">
            {currentGameIndex + 1} / {filteredGames.length}
          </span>
          <button
            onClick={handleNextGame}
            disabled={currentGameIndex >= filteredGames.length - 1}
            className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
            title="Next game"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePreviousMove}
            disabled={currentMoveIndex === -1}
            className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
            title="Previous move"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors"
            title="Reset to start"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handlePlayPause}
            className="p-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white transition-colors"
            title={isPlaying ? 'Pause' : 'Auto-play'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={handleMoveToEnd}
            disabled={currentMoveIndex >= moveHistory.length - 1}
            className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
            title="Go to end"
          >
            <FastForward className="w-4 h-4" />
          </button>
          <button
            onClick={handleNextMove}
            disabled={currentMoveIndex >= moveHistory.length - 1}
            className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
            title="Next move"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <div>
          {currentMoveIndex === -1 
            ? 'Starting position' 
            : `Move ${currentMoveIndex + 1} of ${moveHistory.length}`}
        </div>
        <div className="text-slate-600">
          Board orientation: {boardOrientation === 'white' ? 'White (bottom)' : 'Black (bottom)'}
        </div>
      </div>
    </div>
  );
};

export default AnalysisBoard;
