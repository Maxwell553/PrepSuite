import React, { useState, useMemo } from 'react';
import { X, Search, BarChart3 } from 'lucide-react';
import { GameData } from '../types';
import { formatTimeControlForDisplay } from '../lib/timeControlUtils';

interface GamesModalProps {
  games: GameData[];
  playerName: string;
  playerUsername?: string | string[];
  onSelectGame: (index: number) => void;
  onClose: () => void;
}

function namesMatch(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return x === y || x.includes(y) || y.includes(x);
}

/** Parse timeControl to speed category for ONLINE games only. OTB is always classical. */
function getSpeedFromTimeControl(tc: string, source?: string): 'bullet' | 'blitz' | 'rapid' | 'classical' | null {
  const src = (source || '').toLowerCase();
  if (src === 'otb') return 'classical';
  const s = (tc || '').toLowerCase().trim();
  if (s.includes('bullet')) return 'bullet';
  if (s.includes('blitz')) return 'blitz';
  if (s.includes('rapid')) return 'rapid';
  const numMatch = s.match(/(\d+)/);
  if (!numMatch) return null;
  const num = parseInt(numMatch[1], 10);
  const baseSeconds = num < 100 ? num * 60 : num;
  if (baseSeconds < 180) return 'bullet';
  if (baseSeconds < 600) return 'blitz';
  if (baseSeconds < 3600) return 'rapid';
  return null;
}

const GamesModal: React.FC<GamesModalProps> = ({
  games,
  playerName,
  playerUsername = [],
  onSelectGame,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [speedFilter, setSpeedFilter] = useState<'all' | 'bullet' | 'blitz' | 'rapid' | 'classical'>('all');
  const [colorFilter, setColorFilter] = useState<'both' | 'white' | 'black'>('both');
  const [resultFilter, setResultFilter] = useState<'all' | 'wins' | 'draws' | 'losses'>('all');

  const identifiers = [playerName, ...(Array.isArray(playerUsername) ? playerUsername : [playerUsername])].filter(Boolean);

  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      const isWhite = identifiers.some((id) => namesMatch(g.white, id));
      const isBlack = identifiers.some((id) => namesMatch(g.black, id));
      const opponent = isWhite ? g.black : g.white;

      if (search.trim()) {
        const q = search.toLowerCase();
        if (!opponent.toLowerCase().includes(q) && !(g.openingName || '').toLowerCase().includes(q)) return false;
      }
      if (colorFilter === 'white' && !isWhite) return false;
      if (colorFilter === 'black' && !isBlack) return false;
      const r = g.result.trim();
      if (resultFilter === 'wins') {
        if (!((isWhite && r === '1-0') || (isBlack && r === '0-1'))) return false;
      } else if (resultFilter === 'losses') {
        if (!((isWhite && r === '0-1') || (isBlack && r === '1-0'))) return false;
      } else if (resultFilter === 'draws') {
        if (r !== '1/2-1/2') return false;
      }

      if (speedFilter !== 'all') {
        const src = (g.source || '').toLowerCase();
        const isOtb = src === 'otb';
        if (speedFilter === 'classical') {
          if (!isOtb) return false;
        } else {
          const speed = getSpeedFromTimeControl(g.timeControl || '', g.source);
          if (isOtb || !speed || speed !== speedFilter) return false;
        }
      }
      return true;
    });
  }, [games, search, speedFilter, colorFilter, resultFilter, identifiers]);

  const stats = useMemo(() => {
    let wins = 0, draws = 0, losses = 0;
    for (const g of filteredGames) {
      const isWhite = identifiers.some((id) => namesMatch(g.white, id));
      const isBlack = identifiers.some((id) => namesMatch(g.black, id));
      const r = g.result.trim();
      if ((isWhite && r === '1-0') || (isBlack && r === '0-1')) wins++;
      else if (r === '1/2-1/2') draws++;
      else losses++;
    }
    const total = wins + draws + losses;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(0) : '0';
    return { wins, draws, losses, total, winRate };
  }, [filteredGames, identifiers]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">
            {playerName}'s Games
          </h2>
          <span className="text-slate-400 text-sm">{stats.total.toLocaleString()} Games</span>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 border-b border-slate-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search opponent or opening..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder:text-slate-500"
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 uppercase">Speed:</span>
              {(['all', 'bullet', 'blitz', 'rapid', 'classical'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeedFilter(s)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    speedFilter === s ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 uppercase">Color:</span>
              {(['both', 'white', 'black'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColorFilter(c)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    colorFilter === c ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 uppercase">Result:</span>
              {(['all', 'wins', 'draws', 'losses'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setResultFilter(r)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    resultFilter === r ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            <span className="text-emerald-400 font-mono">{stats.wins}W</span>
            <span className="text-slate-500 font-mono">{stats.draws}D</span>
            <span className="text-red-400 font-mono">{stats.losses}L</span>
            <span className="text-slate-400">• {stats.winRate}% win rate</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {filteredGames.map((g) => {
              const gameIndex = games.indexOf(g);
              const origIdx = games.indexOf(g);
              const isWhite = identifiers.some((id) => namesMatch(g.white, id));
              const isBlack = identifiers.some((id) => namesMatch(g.black, id));
              const opponent = isWhite ? g.black : g.white;
              const opponentElo = isWhite ? g.blackElo : g.whiteElo;
              const r = g.result.trim();
              const isWin = (isWhite && r === '1-0') || (isBlack && r === '0-1');
              const isLoss = (isWhite && r === '0-1') || (isBlack && r === '1-0');
              const dateStr = g.playedAt && g.playedAt !== '1970-01-01T00:00:00.000Z'
                ? new Date(g.playedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '—';
              return (
                <button
                  key={gameIndex}
                  type="button"
                  onClick={() => { onSelectGame(gameIndex); onClose(); }}
                  className="w-full flex items-center gap-4 p-3 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-left transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isWin ? 'bg-emerald-500/20 text-emerald-400' : isLoss ? 'bg-red-500/20 text-red-400' : 'bg-slate-600/50 text-amber-400'
                  }`}>
                    {isWin ? 'W' : isLoss ? 'L' : 'D'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-200 truncate">{opponent}</div>
                    <div className="text-xs text-slate-500 truncate">{g.openingName || g.eco || 'Unknown'}</div>
                  </div>
                  <div className="text-slate-400 text-sm shrink-0">
                    {opponentElo != null ? opponentElo : '—'} · {formatTimeControlForDisplay(g.timeControl)}
                  </div>
                  <div className="text-slate-500 text-xs shrink-0">{dateStr}</div>
                </button>
              );
            })}
          </div>
          {filteredGames.length === 0 && (
            <p className="text-center text-slate-500 py-8">No games match filters</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default GamesModal;
