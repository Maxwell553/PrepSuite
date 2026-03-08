import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Play, Pause, RotateCcw, FastForward } from 'lucide-react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { GameData } from '../types';
import { loadPgn } from '../lib/pgnUtils';

function namesMatch(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return x === y || x.includes(y) || y.includes(x);
}

interface GameAnalysisModalProps {
  game: GameData;
  playerName: string;
  playerUsername?: string | string[];
  onClose: () => void;
}

const GameAnalysisModal: React.FC<GameAnalysisModalProps> = ({
  game,
  playerName,
  playerUsername = [],
  onClose,
}) => {
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [chess, setChess] = useState<Chess | null>(null);
  const [position, setPosition] = useState<string>('start');

  const identifiers = [playerName, ...(Array.isArray(playerUsername) ? playerUsername : [playerUsername])].filter(Boolean);
  const isPlayerWhite = identifiers.some((id) => namesMatch(game.white, id));
  const isPlayerBlack = identifiers.some((id) => namesMatch(game.black, id));
  const boardOrientation: 'white' | 'black' = isPlayerWhite ? 'white' : isPlayerBlack ? 'black' : 'white';

  const r = game.result.trim();
  const getResultLabel = () => {
    if (isPlayerWhite && r === '1-0') return 'Win';
    if (isPlayerBlack && r === '0-1') return 'Win';
    if (isPlayerWhite && r === '0-1') return 'Loss';
    if (isPlayerBlack && r === '1-0') return 'Loss';
    return 'Draw';
  };
  const getResultColor = () => {
    if ((isPlayerWhite && r === '1-0') || (isPlayerBlack && r === '0-1')) return 'text-emerald-400';
    if ((isPlayerWhite && r === '0-1') || (isPlayerBlack && r === '1-0')) return 'text-red-400';
    return 'text-amber-400';
  };

  const pgn = game.pgn?.trim().length ? game.pgn : '';
  useEffect(() => {
    if (!pgn || pgn.length < 10) {
      setChess(null);
      setCurrentMoveIndex(-1);
      setPosition('start');
      return;
    }
    const c = loadPgn(pgn, Chess);
    if (c) {
      setChess(c);
      setCurrentMoveIndex(-1);
      setPosition('start');
    }
  }, [pgn]);

  const moveHistory = chess?.history() ?? [];

  useEffect(() => {
    if (!chess || currentMoveIndex < 0) {
      setPosition('start');
      return;
    }
    try {
      const history = chess.history({ verbose: true });
      const c = new Chess();
      c.reset();
      for (let i = 0; i <= currentMoveIndex && i < history.length; i++) {
        const m = history[i];
        c.move({ from: m.from, to: m.to, promotion: m.promotion });
      }
      setPosition(c.fen());
    } catch {
      setPosition('start');
    }
  }, [chess, currentMoveIndex]);

  useEffect(() => {
    if (isPlaying && currentMoveIndex < moveHistory.length - 1) {
      const t = setTimeout(() => setCurrentMoveIndex((i) => i + 1), 800);
      return () => clearTimeout(t);
    }
    if (isPlaying && currentMoveIndex >= moveHistory.length - 1) setIsPlaying(false);
  }, [isPlaying, currentMoveIndex, moveHistory.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentMoveIndex > -1) {
          setCurrentMoveIndex((i) => i - 1);
          setIsPlaying(false);
        }
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentMoveIndex < moveHistory.length - 1) {
          setCurrentMoveIndex((i) => i + 1);
        }
      }
      if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [currentMoveIndex, moveHistory.length, onClose]);

  if (!game) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700 shrink-0">
          <h3 className="text-lg font-bold text-white">Game Analysis</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          {/* Opponent info - this belongs in the Recent section context, shown in modal */}
          <div className="mb-4 text-sm text-center space-y-1">
            <div>
              <span className={`font-semibold ${getResultColor()}`}>{getResultLabel()}</span>
              <span className="text-slate-500"> · </span>
              <span className="text-slate-200">
                {game.whiteTitle && <span className="text-amber-400/90">{game.whiteTitle} </span>}
                {game.white}
                {game.whiteElo != null && <span className="text-slate-400"> ({game.whiteElo})</span>}
              </span>
              <span className="text-slate-500"> vs </span>
              <span className="text-slate-200">
                {game.blackTitle && <span className="text-amber-400/90">{game.blackTitle} </span>}
                {game.black}
                {game.blackElo != null && <span className="text-slate-400"> ({game.blackElo})</span>}
              </span>
              <span className="text-slate-500"> · {game.eco || game.openingName || 'Unknown'}</span>
            </div>
            <div className="text-slate-500 text-xs">
              {currentMoveIndex === -1 ? 'Starting position' : `Move ${currentMoveIndex + 1} of ${moveHistory.length}`}
              <span className="mx-2">·</span>
              {game.source === 'otb' && game.event ? game.event : game.source === 'lichess' ? 'Lichess' : game.source === 'chess.com' ? 'Chess.com' : game.source || 'Unknown'}
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            {chess ? (
              <div className="aspect-square w-full max-w-md">
                <Chessboard
                  position={position}
                  boardOrientation={boardOrientation}
                  arePiecesDraggable={false}
                  customBoardStyle={{ borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
                  customDarkSquareStyle={{ backgroundColor: '#769656' }}
                  customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
                />
              </div>
            ) : (
              <div className="aspect-square w-full max-w-md flex items-center justify-center bg-slate-800/40 rounded-xl border border-dashed border-slate-600">
                <p className="text-slate-500">No valid PGN</p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => { setCurrentMoveIndex((i) => Math.max(-1, i - 1)); setIsPlaying(false); }}
                disabled={currentMoveIndex === -1}
                className="p-2 bg-slate-700/80 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setCurrentMoveIndex(-1); setIsPlaying(false); }}
                className="p-2 bg-slate-700/80 hover:bg-slate-600 rounded-lg text-white"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsPlaying((p) => !p)}
                className="p-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button
                onClick={() => { setCurrentMoveIndex(moveHistory.length - 1); setIsPlaying(false); }}
                disabled={currentMoveIndex >= moveHistory.length - 1}
                className="p-2 bg-slate-700/80 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-white"
              >
                <FastForward className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setCurrentMoveIndex((i) => Math.min(i + 1, moveHistory.length - 1)); setIsPlaying(false); }}
                disabled={currentMoveIndex >= moveHistory.length - 1}
                className="p-2 bg-slate-700/80 hover:bg-slate-600 disabled:opacity-40 rounded-lg text-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameAnalysisModal;
