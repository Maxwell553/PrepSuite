import {samePlayer as namesMatch} from '../lib/identity';
import React, { useState } from 'react';
import { Clock, BarChart3 } from 'lucide-react';
import { GameData } from '../types';
import { formatTimeControlForDisplay } from '../lib/timeControlUtils';
const GamesModal = React.lazy(() => import('./GamesModal'));
const GameAnalysisModal = React.lazy(() => import('./GameAnalysisModal'));

/** Normalize name for matching: "Poliannikov, Danila" <-> "Danila Poliannikov" */
function normalizeNameForMatch(name: string): string {
  const s = name.trim();
  if (s.includes(',')) {
    const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return `${parts[1]} ${parts[0]}`.toLowerCase();
  }
  return s.toLowerCase();
}



interface RecentGamesListProps {
  games: GameData[];
  playerName: string;
  playerUsername?: string | string[];
  /** Max height to match left column (Strategic Profile) */
  maxHeight?: number | null;
}

const RecentGamesList: React.FC<RecentGamesListProps> = ({
  games,
  playerName,
  playerUsername = [],
  maxHeight,
}) => {
  const [showGamesModal, setShowGamesModal] = useState(false);
  const [gameForAnalysis, setGameForAnalysis] = useState<{ game: GameData; index: number } | null>(null);

  const identifiers = [playerName, ...(Array.isArray(playerUsername) ? playerUsername : [playerUsername])].filter(Boolean);

  const handleGameClick = (idx: number) => {
    const g = games[idx];
    if (g) setGameForAnalysis({ game: g, index: idx });
  };

  return (
    <div data-pdf-section
      className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden flex flex-col self-start w-full prep-recent-games"
      style={maxHeight != null ? { maxHeight: `${maxHeight}px` } : undefined}
    >
      <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="w-6 h-6 text-slate-400" />
          <span className="text-base font-semibold text-slate-300">Recent games</span>
        </div>
        <button
          type="button"
          data-pdf-exclude
          aria-label="View all games"
          onClick={() => setShowGamesModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700/60 hover:bg-slate-600/60 text-slate-400 hover:text-white text-sm font-medium transition-colors"
        >
          <BarChart3 className="w-5 h-5" />
          View all {games.length.toLocaleString()} games
        </button>
      </div>
      <div className="prep-recent-list flex-1 overflow-y-auto min-h-0">
        {games.slice(0, 12).map((g, idx) => {
          const isWhite = identifiers.some((id) => namesMatch(g.white, id));
          const isBlack = identifiers.some((id) => namesMatch(g.black, id));
          const opponent = isWhite ? g.black : g.white;
          const opponentElo = isWhite ? g.blackElo : g.whiteElo;
          const r = g.result.trim();
          const isWin = (isWhite && r === '1-0') || (isBlack && r === '0-1');
          const isLoss = (isWhite && r === '0-1') || (isBlack && r === '1-0');
          return (
            <button
              key={idx}
              type="button"
              data-pdf-include
              onClick={() => handleGameClick(idx)}
              className="prep-recent-row w-full text-left transition-colors"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isWin ? 'bg-emerald-500/20 text-emerald-400' : isLoss ? 'bg-red-500/20 text-red-400' : 'bg-slate-600/50 text-amber-400'
              }`}>
                {isWin ? 'W' : isLoss ? 'L' : 'D'}
              </div>
              <div className="prep-recent-opponent min-w-0">
                <div className="font-semibold text-slate-200 truncate">{opponent}</div>
                </div>
              <div className="prep-recent-opening">{g.openingName || g.eco || 'Unknown opening'}</div>
              <div className="text-slate-400 text-sm shrink-0">{opponentElo != null ? opponentElo : '—'}</div>
              <div className="text-slate-400 text-xs shrink-0">{formatTimeControlForDisplay(g.timeControl)}</div>
            </button>
          );
        })}
      </div>

      <React.Suspense fallback={<p role="status">Loading game explorer…</p>}>
      {showGamesModal && (
        <GamesModal
          games={games}
          playerName={playerName}
          playerUsername={playerUsername}
          onSelectGame={(idx) => { handleGameClick(idx); setShowGamesModal(false); }}
          onClose={() => setShowGamesModal(false)}
        />
      )}

      {gameForAnalysis && (
        <GameAnalysisModal
          game={gameForAnalysis.game}
          playerName={playerName}
          playerUsername={playerUsername}
          onClose={() => setGameForAnalysis(null)}
        />
      )}
      </React.Suspense>
    </div>
  );
};

export default RecentGamesList;
