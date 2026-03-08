/**
 * Practice vs AI opponent that mimics the analyzed player's style.
 * Premium feature: uses /api/practice-move to get style-aware moves.
 */

import React, { useState, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Crown, RotateCcw, Loader2 } from 'lucide-react';
import { ScoutingReport } from '../types';
import { supabase } from '../lib/supabase';
import { getEnvConfig } from '../lib/env';

interface PracticeOpponentProps {
  report: ScoutingReport;
  isPremium: boolean;
}

export const PracticeOpponent: React.FC<PracticeOpponentProps> = ({ report, isPremium }) => {
  const [game, setGame] = useState(new Chess());
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opponentColor = playerColor === 'white' ? 'black' : 'white';
  const isPlayerTurn = game.turn() === (playerColor === 'white' ? 'w' : 'b');

  const makeOpponentMove = useCallback(async () => {
    if (!isPremium || loading || isPlayerTurn) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sign in required');
      const config = getEnvConfig();
      const baseUrl = import.meta.env.VITE_PIPELINE_SERVICE_URL || '';
      const res = await fetch(`${baseUrl}/api/practice-move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          'X-Premium': 'true',
        },
        body: JSON.stringify({
          report: {
            player: report.player,
            strategicSummary: report.strategicSummary,
            whiteOpenings: report.whiteOpenings,
            blackDefenses: report.blackDefenses,
            weaknesses: report.weaknesses,
            tacticalRecommendation: report.tacticalRecommendation,
          },
          fen: game.fen(),
          side: opponentColor,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get move');
      const { move } = data;
      const gameCopy = new Chess(game.fen());
      gameCopy.move({ from: move.slice(0, 2), to: move.slice(2, 4) });
      setGame(gameCopy);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get opponent move');
    } finally {
      setLoading(false);
    }
  }, [game, isPremium, loading, isPlayerTurn, opponentColor, report]);

  React.useEffect(() => {
    if (!isPlayerTurn && !loading && !game.isGameOver()) {
      makeOpponentMove();
    }
  }, [game.fen(), isPlayerTurn, loading, makeOpponentMove]);

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    if (!isPlayerTurn || loading) return false;
    const gameCopy = new Chess(game.fen());
    const move = gameCopy.move({ from: sourceSquare, to: targetSquare });
    if (move) {
      setGame(gameCopy);
      return true;
    }
    return false;
  };

  const reset = () => {
    setGame(new Chess());
    setError(null);
  };

  if (!isPremium) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <Crown className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <p className="text-slate-400 mb-2">Practice vs AI opponent is a Premium feature</p>
        <p className="text-sm text-slate-500">Upgrade to play against an AI that mimics {report.player.name}'s style</p>
      </div>
    );
  }

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2 text-amber-400">
          <Crown className="w-5 h-5" />
          Practice vs {report.player.name}
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={playerColor}
            onChange={(e) => { setPlayerColor(e.target.value as 'white' | 'black'); reset(); }}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm text-slate-200"
          >
            <option value="white">You play White</option>
            <option value="black">You play Black</option>
          </select>
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-200 transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
        </div>
      </div>
      <div className="flex justify-center">
        <div className="relative">
          <Chessboard
            position={game.fen()}
            onPieceDrop={onDrop}
            boardOrientation={playerColor}
            arePiecesDraggable={isPlayerTurn && !loading}
            autoPlay={false}
            boardWidth={400}
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/30 rounded-lg">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            </div>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-400 text-center">{error}</p>}
      {game.isGameOver() && (
        <p className="mt-2 text-sm text-slate-400 text-center">
          Game over — {game.isCheckmate() ? 'Checkmate!' : game.isDraw() ? 'Draw' : 'Stalemate'}
        </p>
      )}
    </section>
  );
};

export default PracticeOpponent;
