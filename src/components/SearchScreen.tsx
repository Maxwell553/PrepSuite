import React, { useState } from 'react';
import { AlertCircle, Loader2, Play, Cpu, User, Shield, AlertTriangle, GitBranch, ChevronDown, ChevronUp } from 'lucide-react';
import { ScoutingReport } from '../types';
import { playerRepository } from '../services/playerRepository';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { getUserFriendlyError, logError } from '../lib/errorUtils';
import { validatePlayerSearch } from '../lib/validation';
import { runPipeline } from '../services/pipelineClient';
import { supabase } from '../lib/supabase';
import { usePipelineProgressCallbacks } from '../hooks/usePipelineProgress';
import { logger } from '../lib/logger';
import { createEmptyReport } from '../lib/reportUtils';

interface SearchScreenProps {
  onReportGenerated: (report: ScoutingReport, options?: { fromCache?: boolean; isInitial?: boolean }) => void;
  onReportPartialUpdate?: (partial: Partial<ScoutingReport>) => void;
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
  onReportPartialUpdate,
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
  const maxGames = 2000;
  const [gameLimit, setGameLimit] = useState(1000);
  const [onlineLimit, setOnlineLimit] = useState(500);
  const [otbLimit, setOtbLimit] = useState(500);
  const [formData, setFormData] = useState({
    name: '',
    chessComUsername: '',
    lichessUsername: ''
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tipsExpanded, setTipsExpanded] = useState(false);

  const pipelineCallbacks = usePipelineProgressCallbacks({
    gameLimit,
    setScanningStatus,
    setLoadingStage,
    setLoadingProgress,
    onIdentity: (data) => onReportPartialUpdate?.({ player: data.player }),
    onParsing: (data) =>
      onReportPartialUpdate?.({
        whiteOpenings: data.whiteOpenings,
        blackDefenses: data.blackDefenses,
        mostPlayedLines: data.mostPlayedLines,
        games: data.games,
      }),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate and sanitize input
    try {
      const validatedInput = validatePlayerSearch({
        name: formData.name,
        fideId: '',
        uscfId: '',
        chessComUsername: formData.chessComUsername,
        lichessUsername: formData.lichessUsername,
        gameLimit,
        onlineLimit,
        otbLimit,
      });

      setFormData({
        name: validatedInput.name,
        chessComUsername: validatedInput.chessComUsername || '',
        lichessUsername: validatedInput.lichessUsername || '',
      });

      if (validatedInput.gameLimit != null) setGameLimit(validatedInput.gameLimit);
      if (validatedInput.onlineLimit != null) setOnlineLimit(validatedInput.onlineLimit);
      if (validatedInput.otbLimit != null) setOtbLimit(validatedInput.otbLimit);
    } catch (validationError: any) {
      // Handle validation errors
      const errorMessage = validationError.errors?.[0]?.message || validationError.message || 'Invalid input. Please check your entries.';
      setError(errorMessage);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create empty report and switch to dashboard immediately
      const emptyReport = createEmptyReport(formData.name);
      onReportGenerated(emptyReport, { isInitial: true });

      // ── Pipeline Service ──────────────────
      logger.info('Search', 'pipeline_start', { message: 'Using Pipeline Service for full analysis pipeline' });
      setScanningStatus('Step 1: Identifying Player...');
      setLoadingStage('identity');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Authentication required. Please log in and try again.');
      }

      const pipelineResult = await runPipeline(
        {
          name: formData.name,
          chessComUsername: formData.chessComUsername || undefined,
          lichessUsername: formData.lichessUsername || undefined,
          gameLimit,
          onlineLimit,
          otbLimit,
        },
        session.access_token,
        pipelineCallbacks,
      );

      // Pipeline must return a complete report
      if (!pipelineResult.report) {
        throw new Error('Pipeline did not return a report. Please try again.');
      }

      const reportData = pipelineResult.report;
      logger.info('Search', 'pipeline_complete', { metadata: { reportId: reportData.id } });

      try {
        const player = await playerRepository.createVerifiedPlayer({
          full_name: reportData.player.name,
          fide_id: reportData.player.fideId || '',
          uscf_id: reportData.player.uscfId || '',
          chess_com_username: reportData.player.platforms?.chessCom || '',
          lichess_username: reportData.player.platforms?.lichess || '',
          metadata: {
            country: reportData.player.country
          }
        });

        if (player && user) {
          logger.info('Search', 'persist_success', { message: 'Persisted new report to Supabase' });
        }
      } catch (dbErr) {
        console.warn("Failed to persist report to DB (Demo Mode?):", dbErr);
      }

      logger.info('Search', 'report_ready', { message: 'Pipeline report ready, calling onReportGenerated' });
      onReportGenerated(reportData);
      setScanningStatus('Report generated successfully!');
      setLoading(false);
      setScanningStatus('');

      setFormData({
        name: '',
        chessComUsername: '',
        lichessUsername: ''
      });

    } catch (err: unknown) {
      logError(err, { operation: 'player analysis', source: 'SearchScreen' });
      const errorMessage = getUserFriendlyError(err, { operation: 'player analysis' });
      logger.error('Search', 'pipeline_error', {
        message: errorMessage,
        error: err instanceof Error ? { message: err.message, stack: err.stack } : undefined,
      });

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
    <div className="w-full max-w-6xl mx-auto py-8 px-4 sm:px-6">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-serif mb-4 text-white dark:text-white text-gray-900">Opponent Analysis</h2>
        <p className="text-slate-400 dark:text-slate-400 text-gray-600 text-lg italic">Verified search across online platforms and OTB tournament databases.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 justify-center items-stretch w-full">
        <div className="flex-[2] min-w-0">
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

              {/* Advanced: Manually link accounts */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 hover:text-indigo-400 dark:hover:text-indigo-400 transition-colors uppercase tracking-widest"
                >
                  {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  Manually link accounts (optional)
                </button>
                {showAdvanced && (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div className="relative group">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-2 uppercase tracking-widest">Chess.com</label>
                      <input
                        type="text"
                        value={formData.chessComUsername}
                        onChange={e => setFormData({ ...formData, chessComUsername: e.target.value })}
                        disabled={loading}
                        placeholder="e.g. hikaru"
                        className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500/50 dark:focus:border-emerald-500/50 focus:border-emerald-600 text-slate-300 dark:text-slate-300 text-gray-900 text-sm transition-colors placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div className="relative group">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-2 uppercase tracking-widest">Lichess</label>
                      <input
                        type="text"
                        value={formData.lichessUsername}
                        onChange={e => setFormData({ ...formData, lichessUsername: e.target.value })}
                        disabled={loading}
                        placeholder="e.g. DrNykterstein"
                        className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500/50 dark:focus:border-indigo-500/50 focus:border-indigo-600 text-slate-300 dark:text-slate-300 text-gray-900 text-sm transition-colors placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Game sliders - always visible */}
              <div className="relative group space-y-3 pt-4">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-3 uppercase tracking-widest">Number of Games to Analyze</label>

                    {/* Total Games Slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400 dark:text-slate-400 text-gray-600">Total games</span>
                        <span className="font-bold text-indigo-400 dark:text-indigo-400 text-indigo-600">{gameLimit.toLocaleString()}</span>
                      </div>
                      <input
                        type="range"
                        min={500}
                        max={maxGames}
                        step={250}
                        value={gameLimit}
                        onChange={(e) => {
                          const newTotal = Number(e.target.value);
                          const ratio = gameLimit > 0 ? onlineLimit / gameLimit : 0.5;
                          setGameLimit(newTotal);
                          setOnlineLimit(Math.round(ratio * newTotal));
                          setOtbLimit(newTotal - Math.round(ratio * newTotal));
                        }}
                        disabled={loading}
                        className="w-full h-2.5 bg-slate-800 dark:bg-slate-800 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          background: `linear-gradient(to right, rgb(99, 102, 241) 0%, rgb(99, 102, 241) ${((gameLimit - 500) / (maxGames - 500)) * 100}%, rgb(30, 41, 59) ${((gameLimit - 500) / (maxGames - 500)) * 100}%, rgb(30, 41, 59) 100%)`
                        }}
                      />
                    </div>

                    {/* Online Games Slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400 dark:text-slate-400 text-gray-600">Online (Chess.com, Lichess)</span>
                        <span className="font-bold text-emerald-400 dark:text-emerald-400 text-emerald-600">{onlineLimit.toLocaleString()}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={gameLimit}
                        step={50}
                        value={onlineLimit}
                        onChange={(e) => {
                          const newOnline = Math.min(Number(e.target.value), gameLimit);
                          setOnlineLimit(newOnline);
                          setOtbLimit(gameLimit - newOnline);
                        }}
                        disabled={loading}
                        className="w-full h-2.5 bg-slate-800 dark:bg-slate-800 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          background: `linear-gradient(to right, rgb(16, 185, 129) 0%, rgb(16, 185, 129) ${gameLimit > 0 ? (onlineLimit / gameLimit) * 100 : 0}%, rgb(30, 41, 59) ${gameLimit > 0 ? (onlineLimit / gameLimit) * 100 : 0}%, rgb(30, 41, 59) 100%)`
                        }}
                      />
                    </div>

                    {/* OTB Games Slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400 dark:text-slate-400 text-gray-600">OTB (over-the-board)</span>
                        <span className="font-bold text-amber-400 dark:text-amber-400 text-amber-600">{otbLimit.toLocaleString()}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={gameLimit}
                        step={50}
                        value={otbLimit}
                        onChange={(e) => {
                          const newOtb = Math.min(Number(e.target.value), gameLimit);
                          setOtbLimit(newOtb);
                          setOnlineLimit(gameLimit - newOtb);
                        }}
                        disabled={loading}
                        className="w-full h-2.5 bg-slate-800 dark:bg-slate-800 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          background: `linear-gradient(to right, rgb(245, 158, 11) 0%, rgb(245, 158, 11) ${gameLimit > 0 ? (otbLimit / gameLimit) * 100 : 0}%, rgb(30, 41, 59) ${gameLimit > 0 ? (otbLimit / gameLimit) * 100 : 0}%, rgb(30, 41, 59) 100%)`
                        }}
                      />
                    </div>
                  </div>
            </div>

            <div className="pt-4" />

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
        </div>

        <div className="space-y-6 w-full lg:w-52 shrink-0">
          <div className="bg-slate-800/50 dark:bg-slate-800/50 border border-slate-700/80 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
            <button
              type="button"
              onClick={() => setTipsExpanded(!tipsExpanded)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-800/30 transition-colors"
            >
              <span className="text-indigo-400 dark:text-indigo-400 font-bold text-sm uppercase tracking-widest">Tips</span>
              {tipsExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>
            {tipsExpanded && (
              <div className="px-5 pb-5 space-y-4 border-t border-slate-700/50">
                <div className="flex gap-3 pt-4">
                  <Shield className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-200 text-sm">Accuracy without usernames</p>
                    <p className="text-slate-400 text-sm mt-0.5">Well-known players (titled, high-rated) resolve more accurately when usernames aren&apos;t provided.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-200 text-sm">AI insights</p>
                    <p className="text-slate-400 text-sm mt-0.5">Treat recommendations as guidance. Cross-check critical conclusions.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <GitBranch className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-200 text-sm">OTB vs online</p>
                    <p className="text-slate-400 text-sm mt-0.5">Tournament play often differs from online in openings, time controls, and style.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchScreen;
