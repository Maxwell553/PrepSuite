/**
 * Batch search: Premium users can analyze up to 10 players at once.
 * Runs pipelines sequentially; each completion is shown and saved.
 */

import React, { useState } from 'react';
import { Loader2, Play, Users, Crown } from 'lucide-react';
import { ScoutingReport } from '../types';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { runPipeline } from '../services/pipelineClient';
import { supabase } from '../lib/supabase';
import { validatePlayerSearch } from '../lib/validation';
import { getUserFriendlyError, logError } from '../lib/errorUtils';
import { createEmptyReport } from '../lib/reportUtils';

const BATCH_MAX = 10;
const BATCH_GAME_LIMIT = 1000; // Per player in batch

interface BatchPlayer {
  name: string;
  chessComUsername: string;
  lichessUsername: string;
}

interface BatchSearchProps {
  user: SupabaseUser;
  onReportGenerated: (report: ScoutingReport, options?: { fromCache?: boolean; isInitial?: boolean; fromBatch?: boolean; creditsDeducted?: number }) => void;
  onReportPartialUpdate?: (partial: Partial<ScoutingReport>) => void;
  setIsAnalyzing: (v: boolean) => void;
  setScanningStatus: (v: string) => void;
}

export const BatchSearch: React.FC<BatchSearchProps> = ({
  user,
  onReportGenerated,
  onReportPartialUpdate,
  setIsAnalyzing,
  setScanningStatus,
}) => {
  const [players, setPlayers] = useState<BatchPlayer[]>([
    { name: '', chessComUsername: '', lichessUsername: '' },
    { name: '', chessComUsername: '', lichessUsername: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const addPlayer = () => {
    if (players.length >= BATCH_MAX) return;
    setPlayers((p) => [...p, { name: '', chessComUsername: '', lichessUsername: '' }]);
  };

  const removePlayer = (i: number) => {
    if (players.length <= 1) return;
    setPlayers((p) => p.filter((_, j) => j !== i));
  };

  const updatePlayer = (i: number, field: keyof BatchPlayer, value: string) => {
    setPlayers((p) => {
      const next = [...p];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const validPlayers = players.filter((p) => p.name.trim().length > 0);

  const handleRunBatch = async () => {
    if (validPlayers.length === 0) {
      setError('Add at least one player with a name.');
      return;
    }

    setLoading(true);
    setError(null);
    setIsAnalyzing(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setError('Authentication required.');
      setLoading(false);
      setIsAnalyzing(false);
      return;
    }

    for (let i = 0; i < validPlayers.length; i++) {
      const p = validPlayers[i];
      setCurrentIndex(i + 1);
      setScanningStatus(`Analyzing ${p.name} (${i + 1} of ${validPlayers.length})...`);

      try {
        const validated = validatePlayerSearch(
          {
            name: p.name.trim(),
            fideId: '',
            uscfId: '',
            chessComUsername: p.chessComUsername.trim() || undefined,
            lichessUsername: p.lichessUsername.trim() || undefined,
            gameLimit: BATCH_GAME_LIMIT,
            onlineLimit: BATCH_GAME_LIMIT,
            otbLimit: 0,
          },
          true
        );

        const emptyReport = createEmptyReport(validated.name);
        onReportGenerated(emptyReport, { isInitial: i === 0 });

        const result = await runPipeline(
          {
            name: validated.name,
            chessComUsername: validated.chessComUsername || undefined,
            lichessUsername: validated.lichessUsername || undefined,
            gameLimit: BATCH_GAME_LIMIT,
            onlineLimit: BATCH_GAME_LIMIT,
            otbLimit: 0,
            isPremium: true,
          },
          session.access_token,
          {
            onIdentity: (d) => onReportPartialUpdate?.({ player: d.player }),
            onParsing: (d) =>
              onReportPartialUpdate?.({
                whiteOpenings: d.whiteOpenings,
                blackDefenses: d.blackDefenses,
                mostPlayedLines: d.mostPlayedLines,
                games: d.games,
              }),
          }
        );

        if (result.report) {
          onReportGenerated(result.report, { fromBatch: true, creditsDeducted: result.creditsDeducted });
          // Parent's handleReportGenerated saves via handleSaveReport when fromBatch
        }
      } catch (err) {
        logError(err, { operation: 'batch analysis', source: 'BatchSearch' });
        setError(getUserFriendlyError(err, { operation: `analysis of ${p.name}` }));
        break;
      }
    }

    setScanningStatus('');
    setLoading(false);
    setIsAnalyzing(false);
    setCurrentIndex(0);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-amber-400" />
        <h3 className="text-lg font-semibold text-white">Batch Reports (Premium)</h3>
        <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">Up to 10</span>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Analyze multiple opponents at once. Each report is saved to your history.
      </p>

      <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
        {players.map((player, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Player name"
              value={player.name}
              onChange={(e) => updatePlayer(i, 'name', e.target.value)}
              disabled={loading}
              className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
            />
            <input
              type="text"
              placeholder="Chess.com"
              value={player.chessComUsername}
              onChange={(e) => updatePlayer(i, 'chessComUsername', e.target.value)}
              disabled={loading}
              className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white placeholder-slate-500"
            />
            <input
              type="text"
              placeholder="Lichess"
              value={player.lichessUsername}
              onChange={(e) => updatePlayer(i, 'lichessUsername', e.target.value)}
              disabled={loading}
              className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white placeholder-slate-500"
            />
            <button
              type="button"
              onClick={() => removePlayer(i)}
              disabled={players.length <= 1 || loading}
              className="p-2 text-slate-500 hover:text-red-400 disabled:opacity-50"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {players.length < BATCH_MAX && (
        <button
          type="button"
          onClick={addPlayer}
          disabled={loading}
          className="text-sm text-indigo-400 hover:text-indigo-300 mb-4"
        >
          + Add player
        </button>
      )}

      {error && (
        <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleRunBatch}
        disabled={loading || validPlayers.length === 0}
        className="w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {currentIndex > 0 ? `${currentIndex} of ${validPlayers.length} complete` : 'Starting...'}
          </>
        ) : (
          <>
            <Play className="w-5 h-5" />
            Run batch ({validPlayers.length} players)
          </>
        )}
      </button>
    </div>
  );
};
