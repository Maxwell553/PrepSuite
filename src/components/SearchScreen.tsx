
import React, { useState } from 'react';
import { Search, ShieldAlert, Database, AlertCircle, Loader2, Play, Cpu, User, Info } from 'lucide-react';
import { ScoutingReport, PlayerMetadata } from '../types';
import { playerRepository } from '../services/playerRepository';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { getUserFriendlyError, logError } from '../lib/errorUtils';
import { useTheme } from '../lib/themeContext';
import { validatePlayerSearch } from '../lib/validation';
import { runPipeline } from '../services/pipelineClient';
import { supabase } from '../lib/supabase';



interface SearchScreenProps {
  onReportGenerated: (report: ScoutingReport, options?: { fromCache?: boolean }) => void;
  user: SupabaseUser;
  isAnalyzing?: boolean;
  setIsAnalyzing?: (value: boolean) => void;
  loadingProgress?: number;
  setLoadingProgress?: (value: number) => void;
  loadingStage?: 'identity' | 'fetching' | 'analyzing' | 'generating' | null;
  setLoadingStage?: (value: 'identity' | 'fetching' | 'analyzing' | 'generating' | null) => void;
  scanningStatus?: string;
  setScanningStatus?: (value: string) => void;
}

const SearchScreen: React.FC<SearchScreenProps> = ({
  onReportGenerated,
  user,
  isAnalyzing: externalIsAnalyzing,
  setIsAnalyzing: externalSetIsAnalyzing,
  loadingProgress: externalLoadingProgress,
  setLoadingProgress: externalSetLoadingProgress,
  loadingStage: externalLoadingStage,
  setLoadingStage: externalSetLoadingStage,
  scanningStatus: externalScanningStatus,
  setScanningStatus: externalSetScanningStatus
}) => {
  const { defaultFederation } = useTheme();
  // Use external state if provided, otherwise use local state
  const [localLoading, setLocalLoading] = useState(false);
  const [localLoadingProgress, setLocalLoadingProgress] = useState<number>(0);
  const [localLoadingStage, setLocalLoadingStage] = useState<'identity' | 'fetching' | 'analyzing' | 'generating' | null>(null);
  const [localScanningStatus, setLocalScanningStatus] = useState<string>('');

  const loading = externalIsAnalyzing !== undefined ? externalIsAnalyzing : localLoading;
  const setLoading = externalSetIsAnalyzing ? (value: boolean) => externalSetIsAnalyzing(value) : setLocalLoading;
  const loadingProgress = externalLoadingProgress !== undefined ? externalLoadingProgress : localLoadingProgress;
  const setLoadingProgress = externalSetLoadingProgress ? (value: number) => externalSetLoadingProgress(value) : setLocalLoadingProgress;
  const loadingStage = externalLoadingStage !== undefined ? externalLoadingStage : localLoadingStage;
  const setLoadingStage = externalSetLoadingStage ? (value: 'identity' | 'fetching' | 'analyzing' | 'generating' | null) => externalSetLoadingStage(value) : setLocalLoadingStage;
  const scanningStatus = externalScanningStatus !== undefined ? externalScanningStatus : localScanningStatus;
  const setScanningStatus = externalSetScanningStatus ? (value: string) => externalSetScanningStatus(value) : setLocalScanningStatus;

  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [gameLimit, setGameLimit] = useState(3000);
  const [formData, setFormData] = useState({
    name: '',
    fideId: '',
    uscfId: '',
    chessComUsername: '',
    lichessUsername: ''
  });



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate and sanitize input
    try {
      const validatedInput = validatePlayerSearch({
        name: formData.name,
        fideId: formData.fideId,
        uscfId: formData.uscfId,
        chessComUsername: formData.chessComUsername,
        lichessUsername: formData.lichessUsername,
        gameLimit: gameLimit,
      });

      // Update form data with validated/sanitized values
      setFormData({
        name: validatedInput.name,
        fideId: validatedInput.fideId || '',
        uscfId: validatedInput.uscfId || '',
        chessComUsername: validatedInput.chessComUsername || '',
        lichessUsername: validatedInput.lichessUsername || '',
      });

      if (validatedInput.gameLimit) {
        setGameLimit(validatedInput.gameLimit);
      }
    } catch (validationError: any) {
      // Handle validation errors
      const errorMessage = validationError.errors?.[0]?.message || validationError.message || 'Invalid input. Please check your entries.';
      setError(errorMessage);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let fideId = formData.fideId.trim();
      let uscfId = formData.uscfId.trim();

      // 0. Persistence Check (Supabase)
      if (fideId || uscfId) {
        const existingPlayer = await playerRepository.findVerifiedPlayer(fideId, uscfId);
        if (existingPlayer) {
          const cachedReport = await playerRepository.getLatestReport(existingPlayer.id);
          if (cachedReport) {
            console.log("Serving cached report from Supabase");
            onReportGenerated(cachedReport, { fromCache: true });
            setLoading(false);
            // Clear form data after successful search
            setFormData({
              name: '',
              fideId: '',
              uscfId: '',
              chessComUsername: '',
              lichessUsername: ''
            });
            return;
          }
        }
      }

      const targetUsername = formData.name;

      // ── Pipeline Service (sole execution path) ──────────────────
      console.log('[Search] Using Pipeline Service for full analysis pipeline');
      setScanningStatus('Step 1: Resolving player identity...');
      setLoadingStage('identity');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Authentication required. Please log in and try again.');
      }

      const pipelineResult = await runPipeline(
        {
          name: formData.name,
          fideId: fideId || undefined,
          uscfId: uscfId || undefined,
          chessComUsername: formData.chessComUsername || undefined,
          lichessUsername: formData.lichessUsername || undefined,
          gameLimit,
        },
        session.access_token,
        {
          onPhase: (phase, status, durationMs, extra) => {
            if (phase === 'identity' && status === 'started') {
              setScanningStatus('Step 1: Resolving player identity...');
              setLoadingStage('identity');
            } else if (phase === 'identity' && status === 'progress' && extra?.message) {
              setScanningStatus(`Step 1: ${extra.message}`);
            } else if (phase === 'identity' && status === 'complete') {
              setScanningStatus(`Step 1 complete (${durationMs ? Math.round(durationMs / 1000) : '?'}s)`);
            } else if (phase === 'games' && status === 'started') {
              setScanningStatus('Step 2: Fetching games...');
              setLoadingStage('fetching');
            } else if (phase === 'games' && status === 'complete') {
              setScanningStatus(`Step 2 complete: ${extra?.gameCount ?? 0} games fetched`);
            } else if (phase === 'parsing' && status === 'started') {
              setScanningStatus('Step 3: Parsing games & analyzing openings...');
              setLoadingStage('analyzing');
            } else if (phase === 'parsing' && status === 'complete') {
              setScanningStatus(`Step 3 complete: ${extra?.gameCount ?? 0} games parsed`);
            } else if (phase === 'engine' && status === 'started') {
              setScanningStatus('Step 4: Running Stockfish engine analysis...');
            } else if (phase === 'engine' && status === 'complete') {
              setScanningStatus(`Step 4 complete: ${gameLimit.toLocaleString()} games analyzed`);
            } else if (phase === 'report' && status === 'started') {
              setScanningStatus('Step 5: Generating AI analysis report...');
              setLoadingStage('generating');
              setLoadingProgress(85);
            } else if (phase === 'report' && status === 'complete') {
              setScanningStatus('Step 5 complete: AI report generated');
              setLoadingProgress(95);
            }
          },
          onProgress: (phase, current, total) => {
            if (phase === 'games') {
              setLoadingProgress(Math.round((current / total) * 30));
            } else if (phase === 'engine') {
              setLoadingProgress(Math.round(50 + (current / total) * 30));
              // Show user-requested game count (gameLimit) instead of actual sampled count
              const displayedCurrent = total > 0 ? Math.round((current / total) * gameLimit) : 0;
              const displayedTotal = gameLimit;
              setScanningStatus(`Step 4: Stockfish analyzing ${displayedCurrent.toLocaleString()}/${displayedTotal.toLocaleString()} games...`);
            }
          },
          onError: (error) => {
            console.error('[Search] Pipeline error:', error);
          },
        },
      );

      // Pipeline must return a complete report
      if (!pipelineResult.report) {
        throw new Error('Pipeline did not return a report. Please try again.');
      }

      const reportData = pipelineResult.report;
      console.log('[Search] Pipeline provided complete report:', reportData.id);

      try {
        const player = await playerRepository.createVerifiedPlayer({
          full_name: reportData.player.name,
          fide_id: fideId,
          uscf_id: uscfId,
          chess_com_username: reportData.player.platforms?.chessCom || '',
          lichess_username: reportData.player.platforms?.lichess || '',
          metadata: {
            country: reportData.player.country
          }
        });

        if (player && user) {
          console.log("Persisted new report to Supabase");
        }
      } catch (dbErr) {
        console.warn("Failed to persist report to DB (Demo Mode?):", dbErr);
      }

      console.log('[Analysis] Pipeline report ready, calling onReportGenerated');
      onReportGenerated(reportData);
      setScanningStatus('Report generated successfully!');

      setTimeout(() => {
        setLoading(false);
        setScanningStatus('');
      }, 2000);

      setFormData({
        name: '',
        fideId: '',
        uscfId: '',
        chessComUsername: '',
        lichessUsername: ''
      });

    } catch (err: unknown) {
      logError(err, { operation: 'player analysis', source: 'SearchScreen' });
      const errorMessage = getUserFriendlyError(err, { operation: 'player analysis' });
      console.error('[Analysis] Error during analysis:', err);

      // Provide more specific guidance for rate limit errors
      if (err instanceof Error && (err.message.includes('429') || err.message.includes('Resource exhausted') || err.message.includes('resource_exhausted'))) {
        setError(`${errorMessage}\n\nTip: Try reducing the number of games analyzed or wait a few minutes before retrying.`);
      } else {
        setError(errorMessage);
      }

    } finally {
      // Clear loading state on error
      setLoading(false);
      setScanningStatus('');
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-serif mb-4 text-white dark:text-white text-gray-900">Opponent Analysis</h2>
        <p className="text-slate-400 dark:text-slate-400 text-gray-600 text-lg italic">Verified search across Chess.com and Lichess repositories.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <form onSubmit={handleSubmit} className="bg-slate-900 dark:bg-slate-900 bg-white border border-slate-800 dark:border-slate-800 border-gray-200 rounded-2xl p-8 space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Cpu className="w-24 h-24" />
            </div>

            <div className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-bold text-indigo-400 dark:text-indigo-400 text-indigo-600 mb-2 uppercase tracking-widest">Player Name</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    disabled={loading}
                    className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-700 dark:border-slate-700 border-gray-300 rounded-xl px-4 py-3 pl-11 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 focus:border-indigo-600 transition-colors font-medium text-white dark:text-white text-gray-900 shadow-inner placeholder:text-slate-600 dark:placeholder:text-slate-600 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Enter Player Name"
                  />
                  <User className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-500 text-gray-400" />
                </div>
              </div>

              {/* Chess.com & Lichess (optional, always visible) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="relative group">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-2 uppercase tracking-widest">Chess.com Username</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.chessComUsername}
                      onChange={e => setFormData({ ...formData, chessComUsername: e.target.value })}
                      disabled={loading}
                      placeholder="hikaru"
                      className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500/50 dark:focus:border-emerald-500/50 focus:border-emerald-600 text-slate-300 dark:text-slate-300 text-gray-900 text-sm transition-colors placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
                <div className="relative group">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-2 uppercase tracking-widest">Lichess Username</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.lichessUsername}
                      onChange={e => setFormData({ ...formData, lichessUsername: e.target.value })}
                      disabled={loading}
                      placeholder="DrNykterstein"
                      className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500/50 dark:focus:border-indigo-500/50 focus:border-indigo-600 text-slate-300 dark:text-slate-300 text-gray-900 text-sm transition-colors placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              {/* Advanced Settings Toggle */}
              <div className="mt-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showAdvanced"
                  checked={showAdvanced}
                  onChange={(e) => setShowAdvanced(e.target.checked)}
                  disabled={loading}
                  className="w-4 h-4 rounded border-slate-800 dark:border-slate-800 border-gray-300 bg-slate-950 dark:bg-slate-950 bg-gray-50 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <label htmlFor="showAdvanced" className="text-xs font-semibold text-slate-400 dark:text-slate-400 text-gray-600 cursor-pointer hover:text-slate-300 dark:hover:text-slate-300 hover:text-gray-900 transition-colors">
                  Advanced Settings
                </label>
              </div>

              {/* Advanced Settings Fields */}
              {showAdvanced && (
                <div className="space-y-4 pt-4 border-t border-slate-800 dark:border-slate-800 border-gray-200">
                  <div className="grid grid-cols-2 gap-4">
                    {defaultFederation === 'FIDE' ? (
                      <>
                        <div className="relative group">
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-2 uppercase tracking-widest">
                            FIDE ID</label>
                          <div className="relative">
                            <input
                              type="text"
                              value={formData.fideId}
                              onChange={e => setFormData({ ...formData, fideId: e.target.value })}
                              disabled={loading}
                              placeholder="123456789"
                              className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500/50 dark:focus:border-indigo-500/50 focus:border-indigo-600 text-slate-300 dark:text-slate-300 text-gray-900 text-sm transition-colors placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                        <div className="relative group">
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-2 uppercase tracking-widest">
                            USCF ID</label>
                          <div className="relative">
                            <input
                              type="text"
                              value={formData.uscfId}
                              onChange={e => setFormData({ ...formData, uscfId: e.target.value })}
                              disabled={loading}
                              placeholder="123456789"
                              className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500/50 dark:focus:border-indigo-500/50 focus:border-indigo-600 text-slate-300 dark:text-slate-300 text-gray-900 text-sm transition-colors placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="relative group">
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-2 uppercase tracking-widest">
                            USCF ID</label>
                          <div className="relative">
                            <input
                              type="text"
                              value={formData.uscfId}
                              onChange={e => setFormData({ ...formData, uscfId: e.target.value })}
                              disabled={loading}
                              placeholder="123456789"
                              className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500/50 dark:focus:border-indigo-500/50 focus:border-indigo-600 text-slate-300 dark:text-slate-300 text-gray-900 text-sm transition-colors placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                        <div className="relative group">
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-2 uppercase tracking-widest">
                            FIDE ID</label>
                          <div className="relative">
                            <input
                              type="text"
                              value={formData.fideId}
                              onChange={e => setFormData({ ...formData, fideId: e.target.value })}
                              disabled={loading}
                              placeholder="123456789"
                              className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500/50 dark:focus:border-indigo-500/50 focus:border-indigo-600 text-slate-300 dark:text-slate-300 text-gray-900 text-sm transition-colors placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="relative group">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-3 uppercase tracking-widest">Number of Games to Analyze</label>

                    {/* Info Bar */}
                    <div className="mb-4 flex items-start gap-2 p-3 bg-indigo-900/10 dark:bg-indigo-900/10 bg-indigo-50 border border-indigo-500/20 dark:border-indigo-500/20 border-indigo-200 rounded-lg">
                      <Info className="w-4 h-4 text-indigo-400 dark:text-indigo-400 text-indigo-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-indigo-300 dark:text-indigo-300 text-indigo-700">
                        <span className="font-semibold">3,000 games</span> is the default number of games analyzed. You can analyze up to <span className="font-semibold">10,000 games</span> for more comprehensive analysis (may take longer).
                      </p>
                    </div>

                    {/* Range Slider */}
                    <div className="space-y-3">
                      <div className="relative">
                        <input
                          type="range"
                          min="500"
                          max="10000"
                          step="500"
                          value={gameLimit}
                          onChange={(e) => setGameLimit(Number(e.target.value))}
                          disabled={loading}
                          className="w-full h-2.5 bg-slate-800 dark:bg-slate-800 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: `linear-gradient(to right, rgb(99, 102, 241) 0%, rgb(99, 102, 241) ${((gameLimit - 500) / (10000 - 500)) * 100}%, rgb(30, 41, 59) ${((gameLimit - 500) / (10000 - 500)) * 100}%, rgb(30, 41, 59) 100%)`
                          }}
                        />
                      </div>

                      {/* Value Display */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 dark:bg-slate-800/50 bg-gray-100 rounded-lg border border-indigo-500/20 dark:border-indigo-500/20 border-indigo-200">
                          <span className="text-lg font-bold text-indigo-400 dark:text-indigo-400 text-indigo-600">
                            {gameLimit.toLocaleString()}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-400 text-gray-600">
                            games
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-4 bg-red-900/20 dark:bg-red-900/20 bg-red-50 border border-red-900/50 dark:border-red-900/50 border-red-200 text-red-400 dark:text-red-400 text-red-600 rounded-xl text-sm animate-pulse">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="relative">
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 font-bold text-lg transition-all px-4 ${loading
                  ? 'bg-slate-800 dark:bg-slate-800 bg-gray-200 text-slate-500 dark:text-slate-500 text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-500/20'
                  } `}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-400 shrink-0 flex-shrink-0" />
                    <div className="flex-1 min-w-0 text-center">
                      <div className="text-sm font-semibold break-words">{scanningStatus || 'Analyzing Databases...'}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    Analyze Opponent
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-200 p-4 rounded-xl text-center backdrop-blur-sm">
              <Database className="w-5 h-5 text-indigo-400 dark:text-indigo-400 text-indigo-600 mx-auto mb-2" />
              <div className="text-[10px] text-slate-500 dark:text-slate-500 text-gray-600 uppercase tracking-widest font-bold">Chess.com API</div>
              <div className="text-xs font-semibold text-emerald-500 dark:text-emerald-500 text-emerald-600">Live Connection</div>
            </div>
            <div className="bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-200 p-4 rounded-xl text-center backdrop-blur-sm">
              <Search className="w-5 h-5 text-indigo-400 dark:text-indigo-400 text-indigo-600 mx-auto mb-2" />
              <div className="text-[10px] text-slate-500 dark:text-slate-500 text-gray-600 uppercase tracking-widest font-bold">Lichess DB</div>
              <div className="text-xs font-semibold text-emerald-500 dark:text-emerald-500 text-emerald-600">Ready</div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-indigo-900/10 dark:bg-indigo-900/10 bg-indigo-50 border border-indigo-500/20 dark:border-indigo-500/20 border-indigo-200 rounded-2xl p-6 shadow-inner">
            <h3 className="text-indigo-400 dark:text-indigo-400 text-indigo-600 font-bold text-sm uppercase tracking-widest mb-4 flex items-center gap-2">
              <Info className="w-4 h-4" /> Developer&apos;s Note
            </h3>
            <ul className="space-y-4 text-sm text-slate-400 dark:text-slate-400 text-gray-600">
              <li className="flex gap-3">
                <span className="text-indigo-500 font-bold bg-indigo-500/10 w-5 h-5 flex items-center justify-center rounded text-xs shrink-0">1</span>
                <span><strong className="text-slate-300 dark:text-slate-300">Accuracy without usernames:</strong> The more well-known the player (e.g. titled, high-rated, or frequently featured), the more accurate identity and repertoire resolution will be when usernames are not provided.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-indigo-500 font-bold bg-indigo-500/10 w-5 h-5 flex items-center justify-center rounded text-xs shrink-0">2</span>
                <span><strong className="text-slate-300 dark:text-slate-300">AI limitations:</strong> Do not fully trust every claim. AI can make mistakes; treat insights as guidance and cross-check critical conclusions.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-indigo-500 font-bold bg-indigo-500/10 w-5 h-5 flex items-center justify-center rounded text-xs shrink-0">3</span>
                <span><strong className="text-slate-300 dark:text-slate-300">Tournament vs online:</strong> There will often be discrepancies between over-the-board tournament play and online play (openings, time controls, and style).</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchScreen;
