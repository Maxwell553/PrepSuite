/**
 * Practice vs AI opponent that mimics the analyzed player's style.
 * Premium feature: uses /api/practice-move to get style-aware moves.
 */

import React, { useState, useCallback, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Crown, RotateCcw, Loader2, X } from 'lucide-react';
import { ScoutingReport } from '../types';
import { supabase } from '../lib/supabase';
import { getMoveProbability } from '../lib/moveProbability';
import { useParsedGames } from '../hooks/useParsedGames';
import type { ParsedGame } from '../lib/repertoireUtils';

/** Memoized move history — only re-renders when history changes. */
const MoveHistoryList = React.memo(function MoveHistoryList({
  history,
  mostPlayedLines,
  opponentColor,
  parsedGames,
  games,
  identifiers,
}: {
  history: string[];
  mostPlayedLines: ScoutingReport['mostPlayedLines'];
  opponentColor: 'white' | 'black';
  parsedGames: ParsedGame[] | null;
  games: { white: string; black: string }[];
  identifiers: string[];
}) {
  const pairs: { n: number; w?: string; b?: string; wIdx: number; bIdx: number }[] = [];
  let n = 1;
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({ n, w: history[i], b: history[i + 1], wIdx: i, bIdx: i + 1 });
    n++;
  }
  const probBadge = (p: { pct: number | null; isDeviation: boolean } | null) => {
    if (!p) return null;
    if (p.isDeviation) return <span className="text-amber-400/90" title="Deviation — no games in repertoire">↯</span>;
    return <span className="text-slate-500 text-xs ml-0.5">{p.pct}%</span>;
  };
  return (
    <div className="space-y-1 font-mono text-sm text-slate-300">
      {pairs.map(({ n, w, b, wIdx, bIdx }) => {
        const wProb = w != null ? getMoveProbability(wIdx, w, history, mostPlayedLines, opponentColor, parsedGames, games, identifiers) : null;
        const bProb = b != null ? getMoveProbability(bIdx, b, history, mostPlayedLines, opponentColor, parsedGames, games, identifiers) : null;
        return (
          <div key={n} className="flex gap-2 py-0.5 items-baseline">
            <span className="text-slate-500 w-6 shrink-0">{n}.</span>
            <span className="flex-1 flex items-baseline min-w-0">
              {w ?? '—'}
              {w != null && opponentColor === 'white' && probBadge(wProb)}
            </span>
            <span className="flex-1 flex items-baseline min-w-0">
              {b ?? '—'}
              {b != null && opponentColor === 'black' && probBadge(bProb)}
            </span>
          </div>
        );
      })}
      {history.length === 0 && (
        <div className="text-slate-500 italic">No moves yet</div>
      )}
    </div>
  );
});

interface PracticeOpponentProps {
  report: ScoutingReport;
  /** When provided, use this color and hide the color selector (used in modal flow) */
  initialColor?: 'white' | 'black';
  /** Optional close callback for modal usage */
  onClose?: () => void;
  /** Lifted move history: chess.js load(fen) clears history, so we store moves */
  moveHistory?: string[];
  /** Callback when a move is played (for lifted state) */
  onMovePlayed?: (history: string[]) => void;
}

export const PracticeOpponent: React.FC<PracticeOpponentProps> = ({
  report,
  initialColor,
  onClose,
  moveHistory: liftedHistory = [],
  onMovePlayed,
}) => {
  const isControlled = onMovePlayed !== undefined;
  // Use local game state as source of truth; sync to parent on moves. Rebuilding from
  // liftedHistory each render caused a race: effect ran before parent update, triggering
  // repeated opponent-move requests with stale history.
  const [game, setGameState] = useState<Chess>(() => {
    const g = new Chess();
    for (const san of liftedHistory) {
      try {
        g.move(san);
      } catch {
        break;
      }
    }
    return g;
  });

  const gameRef = useRef<Chess>(game);
  gameRef.current = game;

  // Sync from parent only when parent explicitly resets (empty history) or on init with non-empty
  const prevLiftedLen = useRef(liftedHistory.length);
  React.useEffect(() => {
    if (!isControlled) return;
    if (liftedHistory.length === 0) {
      if (prevLiftedLen.current > 0) setGameState(() => new Chess());
      prevLiftedLen.current = 0;
      return;
    }
    if (liftedHistory.length > 0 && gameRef.current.history().length === 0) {
      const g = new Chess();
      for (const san of liftedHistory) {
        try {
          g.move(san);
        } catch {
          break;
        }
      }
      setGameState(() => g);
    }
    prevLiftedLen.current = liftedHistory.length;
  }, [isControlled, liftedHistory]);

  const applyMove = React.useCallback(
    (updater: (prev: Chess) => Chess) => {
      setGameState((prev) => {
        const next = updater(prev);
        if (next.fen() !== prev.fen() && onMovePlayed) onMovePlayed(next.history());
        return next;
      });
    },
    [onMovePlayed],
  );

  const opponentMoveInProgress = useRef(false);

  const [playerColor, setPlayerColor] = useState<'white' | 'black'>(initialColor ?? 'white');

  React.useEffect(() => {
    if (initialColor) setPlayerColor(initialColor);
  }, [initialColor]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opponentColor = playerColor === 'white' ? 'black' : 'white';
  const isPlayerTurn = game.turn() === (playerColor === 'white' ? 'w' : 'b');

  const gamesSafe = React.useMemo(() => report.games ?? [], [report.games]);
  const { parsed: parsedGames } = useParsedGames(gamesSafe);
  const identifiers = React.useMemo(
    () =>
      [
        report.player.name,
        (report.player as { actualUsername?: string }).actualUsername,
        report.player.platforms?.chessCom,
        report.player.platforms?.lichess,
      ].filter(Boolean) as string[],
    [
      report.player.name,
      (report.player as { actualUsername?: string }).actualUsername,
      report.player.platforms?.chessCom,
      report.player.platforms?.lichess,
    ],
  );

  const makeOpponentMove = useCallback(async () => {
    const currentGame = gameRef.current;
    if (loading || opponentMoveInProgress.current || currentGame.turn() === (playerColor === 'white' ? 'w' : 'b') || currentGame.isGameOver()) return;
    opponentMoveInProgress.current = true;
    setLoading(true);
    setError(null);
    const fen = currentGame.fen();
    const moveHistory = currentGame.history();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sign in required');
      const baseUrl = import.meta.env.VITE_PIPELINE_SERVICE_URL || '';
      const res = await fetch(`${baseUrl}/api/practice-move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          report: {
            player: report.player,
            strategicSummary: report.strategicSummary,
            whiteOpenings: report.whiteOpenings,
            blackDefenses: report.blackDefenses,
            weaknesses: report.weaknesses,
            tacticalRecommendation: report.tacticalRecommendation,
            mostPlayedLines: report.mostPlayedLines,
          },
          fen,
          side: opponentColor,
          moveHistory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get move');
      const { move } = data;
      const from = move.slice(0, 2);
      const to = move.slice(2, 4);
      applyMove((prev) => {
        const copy = new Chess();
        for (const san of prev.history()) copy.move(san);
        const result = copy.move({ from, to });
        return result ? copy : prev;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get opponent move');
    } finally {
      opponentMoveInProgress.current = false;
      setLoading(false);
    }
  }, [loading, playerColor, opponentColor, report, applyMove]);

  React.useEffect(() => {
    if (!isPlayerTurn && !loading && !game.isGameOver()) {
      makeOpponentMove();
    }
  }, [game.fen(), isPlayerTurn, loading, makeOpponentMove]);

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    if (!isPlayerTurn || loading) return false;
    const gameCopy = new Chess();
    for (const san of game.history()) gameCopy.move(san);
    const move = gameCopy.move({ from: sourceSquare, to: targetSquare });
    if (move) {
      applyMove(() => gameCopy);
      return true;
    }
    return false;
  };

  const reset = () => {
    applyMove(() => new Chess());
    setError(null);
  };

  const showColorSelector = initialColor === undefined;
  const isEmbeddedInModal = initialColor != null && onClose != null;

  const boardContent = (
    <>
      {!isEmbeddedInModal && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2 bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
            <Crown className="w-5 h-5 text-amber-400" />
            Practice vs {report.player.name}
          </h3>
          <div className="flex items-center gap-2">
            {showColorSelector && (
              <select
                value={playerColor}
                onChange={(e) => { setPlayerColor(e.target.value as 'white' | 'black'); reset(); }}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm text-slate-200"
              >
                <option value="white">You play White</option>
                <option value="black">You play Black</option>
              </select>
            )}
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-200 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
      {isEmbeddedInModal && (
        <div className="flex justify-end mb-3">
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-200 transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-4 items-start justify-center min-w-0 overflow-x-auto">
        <div className="relative rounded-xl overflow-hidden shadow-2xl shadow-black/40 ring-1 ring-amber-500/20 shrink-0">
          <Chessboard
            position={game.fen()}
            onPieceDrop={onDrop}
            boardOrientation={playerColor}
            arePiecesDraggable={isPlayerTurn && !loading}
            autoPlay={false}
            boardWidth={isEmbeddedInModal ? 400 : 480}
            customBoardStyle={{ borderRadius: '12px', boxShadow: 'inset 0 0 0 1px rgba(245,158,11,0.15)' }}
            customDarkSquareStyle={{ backgroundColor: '#5a4a3a' }}
            customLightSquareStyle={{ backgroundColor: '#c9b896' }}
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-[2px] rounded-xl">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
            </div>
          )}
        </div>
        <div className={`bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 min-w-[200px] overflow-y-auto ${isEmbeddedInModal ? 'max-h-[400px]' : 'max-h-[480px]'}`}>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Move history</div>
          <MoveHistoryList
            history={game.history()}
            mostPlayedLines={report.mostPlayedLines}
            opponentColor={opponentColor}
            parsedGames={parsedGames}
            games={gamesSafe}
            identifiers={identifiers}
          />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-400 text-center">{error}</p>}
      {game.isGameOver() && (
        <p className="mt-2 text-sm text-slate-400 text-center">
          Game over — {game.isCheckmate() ? 'Checkmate!' : game.isDraw() ? 'Draw' : 'Stalemate'}
        </p>
      )}
    </>
  );

  if (isEmbeddedInModal) {
    return <div className="relative">{boardContent}</div>;
  }

  return (
    <section className="bg-gradient-to-b from-slate-800/60 to-slate-900/80 border border-amber-500/20 rounded-2xl p-6 shadow-xl shadow-slate-900/50">
      {boardContent}
    </section>
  );
};

export default PracticeOpponent;
