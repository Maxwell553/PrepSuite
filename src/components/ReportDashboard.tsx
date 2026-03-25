
import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { Shield, Target, Clock, TrendingUp, Share2, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, ChevronRight, Activity, Crown, X, BarChart3, Coins, Download, Lock } from 'lucide-react';
import { ScoutingReport, OpeningStat, TimeManagementStats } from '../types';
import AnalysisBoard from './AnalysisBoard';
import PracticeOpponent from './PracticeOpponent';
import RecentGamesList from './RecentGamesList';
import RepertoireChat from './RepertoireChat';
import { aggregateOpeningsBySource } from '../lib/openingStats';
import { formatTimeControlForDisplay, getTimeControlSecondsForSort } from '../lib/timeControlUtils';
import { supabase } from '../lib/supabase';
import { exportReportAsPdf } from '../lib/pdfExport';

function GuestBlurOverlay({ label, onSignUp }: { label: string; onSignUp?: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center backdrop-blur-md bg-slate-950/60 rounded-2xl">
      <Lock className="w-6 h-6 text-slate-400 mb-3" />
      <p className="text-sm font-semibold text-slate-300 mb-1">{label}</p>
      <p className="text-xs text-slate-500 mb-4 max-w-xs text-center">
        Sign up for a free account to unlock full reports with up to 2,500 games.
      </p>
      {onSignUp && (
        <button
          type="button"
          onClick={onSignUp}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          Sign up for full access
        </button>
      )}
    </div>
  );
}

function ReportCard({ children, className = '', ...rest }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) {
  return (
    <div className={`bg-slate-900/70 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-8 shadow-lg report-card ${className}`} {...rest}>
      {children}
    </div>
  );
}

interface ReportDashboardProps {
  report: ScoutingReport;
  /** When true, chat is grayed out with "Requires sign in" */
  requiresSignInForChat?: boolean;
  /** When true, show generating overlay (blocks interaction until report is complete) */
  isGenerating?: boolean;
  /** Status message to show in overlay (e.g. "Step 2: Fetching Games...") */
  generatingStatus?: string;
  /** Credits deducted for this report (shown in top right when set) */
  creditsDeducted?: number;
  /** Hide credits badge (e.g. for featured reports) */
  hideCreditsBadge?: boolean;
  /** Called when user wants to retry with usernames (no games found) */
  onGoToSearch?: () => void;
  /** Guest report: blur premium sections with sign-up CTAs */
  isGuestReport?: boolean;
  /** Callback when user clicks sign-up from a blurred section */
  onGuestSignUp?: () => void;
}

const WINS_PIE_COLORS = { resignation: '#14532d', onTime: '#86efac', checkmate: '#22c55e', other: '#052e16' };
const LOSSES_PIE_COLORS = { resignation: '#b91c1c', onTime: '#fda4af', checkmate: '#ef4444', other: '#7f1d1d' };

/** Clock / flag stats from Chess.com + Lichess game metadata */
function TimeManagementSection({ tm }: { tm: TimeManagementStats }) {
  const lossPct = (tm.lostOnTimeShareOfLosses * 100).toFixed(1);
  const flagPct =
    tm.lostOnTimeShareAmongFlagDecisive != null
      ? (tm.lostOnTimeShareAmongFlagDecisive * 100).toFixed(1)
      : null;
  const winsByType = tm.winsByType ?? { resignation: 0, onTime: 0, checkmate: 0, other: 0 };
  const lossesByType = tm.lossesByType ?? { resignation: 0, onTime: 0, checkmate: 0, other: 0 };
  const winsTotal = winsByType.resignation + winsByType.onTime + winsByType.checkmate + winsByType.other;
  const lossesTotal = lossesByType.resignation + lossesByType.onTime + lossesByType.checkmate + lossesByType.other;

  const winsPieData = [
    { name: 'Resignation', value: winsByType.resignation, key: 'resignation' },
    { name: 'On time', value: winsByType.onTime, key: 'onTime' },
    { name: 'Checkmate', value: winsByType.checkmate, key: 'checkmate' },
    { name: 'Other', value: winsByType.other, key: 'other' },
  ].filter((d) => d.value > 0);

  const lossesPieData = [
    { name: 'Resignation', value: lossesByType.resignation, key: 'resignation' },
    { name: 'On time', value: lossesByType.onTime, key: 'onTime' },
    { name: 'Checkmate', value: lossesByType.checkmate, key: 'checkmate' },
    { name: 'Other', value: lossesByType.other, key: 'other' },
  ].filter((d) => d.value > 0);

  return (
    <ReportCard className="!mt-8 space-y-6 min-w-0 w-full max-w-full" data-pdf-section>
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5 text-amber-400" />
        <h3 className="text-xl font-bold text-white">Clock Pressure</h3>
      </div>
      <p className="text-sm text-slate-400 max-w-3xl">
        Based on online game metadata from Chess.com and Lichess. Over-the-board games are excluded.
      </p>

      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-4 min-w-0">
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Online games</div>
          <div className="text-2xl font-bold text-slate-100 mt-1 tabular-nums">{tm.onlineGames.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Lost on time</div>
          <div className="text-2xl font-bold text-rose-400 mt-1 tabular-nums">{tm.lostOnTime.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Won on time</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1 tabular-nums">{tm.wonOnTime.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Share of losses</div>
          <div className="text-2xl font-bold text-amber-300 mt-1 tabular-nums">{lossPct}%</div>
          <div className="text-[11px] text-slate-400 mt-0.5 text-pretty">Decisive losses ending on time</div>
        </div>
      </div>

      {flagPct != null && tm.lostOnTime + tm.wonOnTime > 0 && (
        <p className="text-xs text-slate-400">
          When a game ends by flag, this player lost on time in <span className="text-slate-300 font-semibold">{flagPct}%</span> of these games.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-w-0">
        {tm.bySpeed.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 min-w-0">
            <h4 className="text-sm font-semibold text-slate-200 mb-3">By time control</h4>
            <div className="grid gap-2">
              {[...tm.bySpeed]
                .sort((a, b) => getTimeControlSecondsForSort(b.speed) - getTimeControlSecondsForSort(a.speed))
                .map((row) => (
                <div
                  key={row.speed}
                  className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4 py-1.5 px-3 rounded-lg bg-slate-950/60 border border-slate-800 min-w-0"
                >
                  <span className="text-sm font-medium text-slate-200 shrink-0">{formatTimeControlForDisplay(row.speed)}</span>
                  <span className="text-xs text-slate-400 min-w-0 text-left sm:text-right break-words [overflow-wrap:anywhere]">
                    {row.games.toLocaleString()} games · <span className="text-rose-400">{row.lostOnTime}L</span> /{' '}
                    <span className="text-emerald-400">{row.wonOnTime}W</span> on time
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {winsTotal > 0 && winsPieData.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 min-w-0">
            <h4 className="text-sm font-semibold text-slate-200 mb-3">How they win</h4>
            <div className="h-52 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <Pie
                    data={winsPieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={44}
                    outerRadius={64}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={false}
                  >
                    {winsPieData.map((entry) => (
                      <Cell key={entry.key} fill={WINS_PIE_COLORS[entry.key as keyof typeof WINS_PIE_COLORS]} />
                    ))}
                  </Pie>
                  <Legend
                    layout="horizontal"
                    align="center"
                    verticalAlign="bottom"
                    formatter={(value) => {
                      const item = winsPieData.find((d) => d.name === value);
                      const pct = item && winsTotal > 0 ? ((item.value / winsTotal) * 100).toFixed(0) : '0';
                      return <span className="text-slate-300 text-xs">{value} {pct}%</span>;
                    }}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ paddingTop: 8 }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
                    itemStyle={{ color: '#e2e8f0' }}
                    labelStyle={{ color: '#f1f5f9' }}
                    formatter={(value: number, name: string) => [`${value} (${winsTotal > 0 ? ((value / winsTotal) * 100).toFixed(1) : 0}%)`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {lossesTotal > 0 && lossesPieData.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 min-w-0">
            <h4 className="text-sm font-semibold text-slate-200 mb-3">How they lose</h4>
            <div className="h-52 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <Pie
                    data={lossesPieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={44}
                    outerRadius={64}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={false}
                  >
                    {lossesPieData.map((entry) => (
                      <Cell key={entry.key} fill={LOSSES_PIE_COLORS[entry.key as keyof typeof LOSSES_PIE_COLORS]} />
                    ))}
                  </Pie>
                  <Legend
                    layout="horizontal"
                    align="center"
                    verticalAlign="bottom"
                    formatter={(value) => {
                      const item = lossesPieData.find((d) => d.name === value);
                      const pct = item && lossesTotal > 0 ? ((item.value / lossesTotal) * 100).toFixed(0) : '0';
                      return <span className="text-slate-300 text-xs">{value} {pct}%</span>;
                    }}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ paddingTop: 8 }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
                    itemStyle={{ color: '#e2e8f0' }}
                    labelStyle={{ color: '#f1f5f9' }}
                    formatter={(value: number, name: string) => [`${value} (${lossesTotal > 0 ? ((value / lossesTotal) * 100).toFixed(1) : 0}%)`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </ReportCard>
  );
}

function OpeningList({ openings, defaultExpanded = false, id }: { openings: OpeningStat[]; defaultExpanded?: boolean; id?: string }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="space-y-1" id={id}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full py-1.5 text-left text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span>Openings list ({openings.length})</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {expanded && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {openings.map((op, idx) => {
            const winRate = typeof op.winRate === 'number' && !isNaN(op.winRate) ? op.winRate : 0;
            const winPercent = (winRate * 100).toFixed(0);
            const totalGames = Math.round(op.totalGames || 0);
            const wins = Math.round(op.wins || 0);
            const draws = Math.round(op.draws || 0);
            const losses = Math.round(op.losses || 0);
            return (
              <div key={idx} className="flex justify-between items-center text-xs py-1 px-2 bg-slate-950 rounded border border-slate-800">
                <span className="text-slate-200 font-semibold">{op.name}</span>
                <span className="text-slate-400 font-mono text-[11px]">
                  {totalGames} Games | {winPercent}% W ({wins}W/{draws}D/{losses}L)
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Shimmer skeleton placeholder for loading states */
function SkeletonLine({ width = '100%' }: { width?: string }) {
  return (
    <div
      className="animate-shimmer h-4 rounded"
      style={{ width }}
      aria-hidden
    />
  );
}

function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 && lines > 1 ? '75%' : '100%'} />
      ))}
    </div>
  );
}

/** Practice bar + modal flow: bar under strategic summary, color picker modal, then game modal */
function PracticeBarWithModals({
  report,
  playerName,
}: {
  report: ScoutingReport;
  playerName: string;
}) {
  const [showColorModal, setShowColorModal] = useState(false);
  const [showGameModal, setShowGameModal] = useState(false);
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  // Lift game state: moveHistory for display+API (chess.js load(fen) clears history)
  const [moveHistory, setMoveHistory] = useState<string[]>([]);

  const handleStart = () => {
    setShowColorModal(false);
    setShowGameModal(true);
    setMoveHistory([]);
  };

  const handleCloseGame = () => {
    setShowGameModal(false);
    setMoveHistory([]);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowColorModal(true)}
        className="mt-6 w-full py-3 px-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl flex items-center justify-between text-amber-400 transition-colors"
      >
        <span className="flex items-center gap-2 font-semibold">
          <Crown className="w-4 h-4" />
          Practice against {playerName}
        </span>
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Modal 1: Choose color */}
      {showColorModal && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/90 backdrop-blur-md">
          <div className="relative bg-gradient-to-b from-slate-800/95 to-slate-900/95 border border-amber-500/30 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl shadow-amber-500/10 ring-1 ring-white/5">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/5 via-transparent to-transparent pointer-events-none" />
            <div className="flex justify-between items-center mb-6 relative">
              <h4 className="text-xl font-bold bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">Choose your color</h4>
              <button
                type="button"
                onClick={() => setShowColorModal(false)}
                className="p-2 rounded-xl hover:bg-slate-700/80 text-slate-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 mb-6 relative">
              <button
                type="button"
                onClick={() => setPlayerColor('white')}
                className={`w-full py-4 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-3 ${
                  playerColor === 'white'
                    ? 'bg-gradient-to-r from-slate-100 to-slate-200 text-slate-900 shadow-lg shadow-slate-400/20 ring-2 ring-amber-400/50'
                    : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-slate-200 border border-slate-700'
                }`}
              >
                <Crown className={`w-5 h-5 shrink-0 ${playerColor === 'white' ? 'text-amber-600' : 'text-slate-400'}`} />
                You play White
              </button>
              <button
                type="button"
                onClick={() => setPlayerColor('black')}
                className={`w-full py-4 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-3 ${
                  playerColor === 'black'
                    ? 'bg-gradient-to-r from-slate-800 to-slate-900 text-slate-100 shadow-lg shadow-slate-900/50 ring-2 ring-amber-400/50 border border-slate-600'
                    : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-slate-200 border border-slate-700'
                }`}
              >
                <Crown className={`w-5 h-5 shrink-0 ${playerColor === 'black' ? 'text-amber-400' : 'text-slate-400'}`} />
                You play Black
              </button>
            </div>
            <button
              type="button"
              onClick={handleStart}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-bold rounded-xl shadow-lg shadow-amber-500/25 transition-all duration-200 hover:shadow-amber-500/40"
            >
              Start game
            </button>
          </div>
        </div>
      )}

      {/* Modal 2: Game */}
      {showGameModal && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="relative bg-gradient-to-b from-slate-800/95 to-slate-900/95 border border-amber-500/30 rounded-2xl p-6 w-full max-w-3xl shadow-2xl shadow-amber-500/10 ring-1 ring-white/5 max-h-[90vh] overflow-auto">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/5 via-transparent to-transparent pointer-events-none" />
            <div className="flex justify-between items-center mb-4 relative">
              <h4 className="text-xl font-bold bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">Practice vs {playerName}</h4>
              <button
                type="button"
                onClick={handleCloseGame}
                className="p-2 rounded-xl hover:bg-slate-700/80 text-slate-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative">
              <PracticeOpponent
                report={report}
                initialColor={playerColor}
                onClose={handleCloseGame}
                moveHistory={moveHistory}
                onMovePlayed={setMoveHistory}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Strategic Profile + Recent Games with right column height constrained by left */
function StrategicProfileWithRecent({
  report,
  isGenerating,
  player,
  isGuestReport = false,
  onGuestSignUp,
}: {
  report: ScoutingReport;
  isGenerating: boolean;
  player: ScoutingReport['player'];
  isGuestReport?: boolean;
  onGuestSignUp?: () => void;
}) {
  const leftRef = React.useRef<HTMLElement | null>(null);
  const [maxHeight, setMaxHeight] = React.useState<number | null>(null);

  /** Strong openings: 20+ games, ≥50% win rate — variations they perform well in */
  const strongOpenings = React.useMemo(() => {
    const filter = (op: OpeningStat) => (op.totalGames ?? 0) >= 20 && (op.winRate ?? 0) >= 0.5;
    const white = (report.whiteOpenings || []).filter(filter).map((op) => ({ ...op, side: 'white' as const }));
    const black = (report.blackDefenses || []).filter(filter).map((op) => ({ ...op, side: 'black' as const }));
    return [...white, ...black].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));
  }, [report.whiteOpenings, report.blackDefenses]);

  /** Weak openings: 20+ games, <50% win rate — variations to improve */
  const weakOpenings = React.useMemo(() => {
    const filter = (op: OpeningStat) => (op.totalGames ?? 0) >= 20 && (op.winRate ?? 0) < 0.5;
    const white = (report.whiteOpenings || []).filter(filter).map((op) => ({ ...op, side: 'white' as const }));
    const black = (report.blackDefenses || []).filter(filter).map((op) => ({ ...op, side: 'black' as const }));
    return [...white, ...black].sort((a, b) => (a.winRate ?? 0) - (b.winRate ?? 0));
  }, [report.whiteOpenings, report.blackDefenses]);

  React.useEffect(() => {
    const el = leftRef.current;
    if (!el) return;
    let rafId: number | undefined;
    const ro = new ResizeObserver(() => {
      rafId = requestAnimationFrame(() => setMaxHeight(el.offsetHeight));
    });
    ro.observe(el);
    setMaxHeight(el.offsetHeight);
    return () => {
      ro.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [strongOpenings, weakOpenings, isGenerating]);

  return (
    <div className="grid lg:grid-cols-[1fr_minmax(0,380px)] gap-8 items-start" data-pdf-section>
      <section
        ref={leftRef}
        className="bg-slate-900/70 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-8 shadow-lg report-card"
      >
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-400" />
          Strategic Profile Analysis
        </h3>
        <div className="text-slate-300 space-y-6 leading-relaxed">
          {/* Strong openings: 20+ games, ≥50% win rate — good variations */}
          <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl">
            <h4 className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-widest mb-4">
              <CheckCircle className="w-4 h-4" /> Strong openings (20+ games, ≥50% WR)
            </h4>
            {isGenerating && strongOpenings.length === 0 ? (
              <SkeletonBlock lines={3} />
            ) : strongOpenings.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {strongOpenings.map((op) => {
                  const winRate = typeof op.winRate === 'number' && !isNaN(op.winRate) ? op.winRate : 0;
                  const winPercent = (winRate * 100).toFixed(0);
                  const totalGames = Math.round(op.totalGames || 0);
                  return (
                    <div
                      key={`${op.name}-${op.side}`}
                      className="bg-slate-900/80 border border-emerald-500/20 rounded-xl p-3 hover:border-emerald-500/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-semibold text-slate-200 text-sm truncate" title={op.name}>
                          {op.name}
                        </span>
                        <span
                          className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            op.side === 'white'
                              ? 'bg-slate-600/60 text-slate-200'
                              : 'bg-slate-700/60 text-slate-300'
                          }`}
                        >
                          {op.side === 'white' ? 'W' : 'B'}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500/70 transition-all"
                            style={{ width: `${winRate * 100}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-emerald-400/90">
                          {winPercent}% WR · {totalGames} games
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No openings with 20+ games and ≥50% win rate.</p>
            )}
          </div>

          {/* Weak openings: 20+ games, &lt;50% win rate — variations to improve */}
          <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl">
            <h4 className="flex items-center gap-2 text-red-400 font-bold text-xs uppercase tracking-widest mb-4">
              <AlertTriangle className="w-4 h-4" /> Weak openings (20+ games, &lt;50% WR)
            </h4>
            {isGenerating && weakOpenings.length === 0 ? (
              <SkeletonBlock lines={4} />
            ) : weakOpenings.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {weakOpenings.map((op) => {
                  const winRate = typeof op.winRate === 'number' && !isNaN(op.winRate) ? op.winRate : 0;
                  const winPercent = (winRate * 100).toFixed(0);
                  const totalGames = Math.round(op.totalGames || 0);
                  return (
                    <div
                      key={`${op.name}-${op.side}`}
                      className="bg-slate-900/80 border border-red-500/20 rounded-xl p-3 hover:border-red-500/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-semibold text-slate-200 text-sm truncate" title={op.name}>
                          {op.name}
                        </span>
                        <span
                          className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            op.side === 'white'
                              ? 'bg-slate-600/60 text-slate-200'
                              : 'bg-slate-700/60 text-slate-300'
                          }`}
                        >
                          {op.side === 'white' ? 'W' : 'B'}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-red-500/70 transition-all"
                            style={{ width: `${winRate * 100}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-red-400/90">
                          {winPercent}% WR · {totalGames} games
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No openings with 20+ games and below 50% win rate.</p>
            )}
          </div>

          {report.games && report.games.length > 0 && !isGuestReport && (
            <PracticeBarWithModals report={report} playerName={player.name} />
          )}
        </div>
      </section>

      {report.games && report.games.length > 0 && (
        <div className="relative">
          {isGuestReport && <GuestBlurOverlay label="Recent Games" onSignUp={onGuestSignUp} />}
          <div className={isGuestReport ? 'max-h-[300px] overflow-hidden' : ''}>
            <RecentGamesList
              games={report.games}
              playerName={player.name}
              playerUsername={[
                (player as { actualUsername?: string }).actualUsername,
                (player as { fideName?: string }).fideName,
                player.platforms?.chessCom,
                player.platforms?.lichess,
              ].filter(Boolean) as string[]}
              maxHeight={maxHeight}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RepertoireChartSection({
  title,
  icon: Icon,
  openings,
  gamesLabel,
  isSkeleton,
}: {
  title: string;
  icon: React.ElementType;
  openings: OpeningStat[];
  gamesLabel: string;
  isSkeleton?: boolean;
}) {
  if (isSkeleton) {
    return (
      <ReportCard>
        <h3 className="text-lg font-bold mb-1 flex items-center gap-2 text-white">
          <Icon className="w-5 h-5 text-indigo-400" />
          {title}
        </h3>
        <p className="text-sm text-slate-400 mb-6">{gamesLabel}</p>
        <div className="space-y-3">
          {[90, 65, 50, 75, 55].map((w, i) => (
            <div key={i} className="animate-shimmer h-6 rounded" style={{ width: `${w}%` }} aria-hidden />
          ))}
        </div>
      </ReportCard>
    );
  }

  const chartData = (openings || []).slice(0, 12).map((o) => ({
    name: o.name?.length > 28 ? o.name.slice(0, 26) + '…' : o.name,
    fullName: o.name,
    wins: o.wins ?? 0,
    draws: o.draws ?? 0,
    losses: o.losses ?? 0,
    total: o.totalGames ?? 0,
  }));
  const chartHeight = Math.max(200, chartData.length * 32 + 40);

  return (
    <ReportCard>
      <h3 className="text-lg font-bold mb-1 flex items-center gap-2 text-white">
        <Icon className="w-5 h-5 text-indigo-400" />
        {title}
      </h3>
      <p className="text-sm text-slate-400 mb-5">{gamesLabel}</p>
      {chartData.length > 0 && (
        <div className="mb-5 w-full" style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 10, right: 16, top: 4, bottom: 4 }}
              barCategoryGap={6}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" stroke="#475569" fontSize={10} />
              <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={140} tick={{ fill: '#cbd5e1' }} />
              <Tooltip
                cursor={{ fill: '#ffffff06' }}
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                formatter={(value: number, name: string) => [value, name]}
                labelFormatter={(label) => {
                  const item = chartData.find((d) => d.name === label);
                  return item?.fullName || label;
                }}
              />
              <Bar dataKey="wins" name="Wins" fill="#10b981" stackId="a" />
              <Bar dataKey="draws" name="Draws" fill="#475569" stackId="a" />
              <Bar dataKey="losses" name="Losses" fill="#ef4444" stackId="a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <OpeningList openings={openings} id={title.replace(/\s+/g, '-').toLowerCase()} />
    </ReportCard>
  );
}

interface RatingHistoryPoint {
  date: string;
  classicalRating?: number;
  rapidRating?: number;
  blitzRating?: number;
}

function ActivityReportSection({ player }: { player: ScoutingReport['player'] }) {
  const [fideHistory, setFideHistory] = useState<Array<{
    date: string;
    classicalRating?: number;
    rapidRating?: number;
    blitzRating?: number;
  }>>([]);

  useEffect(() => {
    if (!player.fideId?.trim()) return;
    const controller = new AbortController();
    (async () => {
      try {
        const baseUrl = import.meta.env.VITE_PIPELINE_SERVICE_URL || '';
        // Use public route so unsigned users (e.g. featured report viewers) can see activity graphs
        const url = `${baseUrl}/fide-rating-history/${player.fideId}`;
        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) {
          const { history } = await res.json();
          if (Array.isArray(history) && history.length > 0) {
            setFideHistory(history);
          }
        }
      } catch {
        // ignore — use current rating as fallback
      }
    })();
    return () => controller.abort();
  }, [player.fideId]);

  const fideRating = player.currentRating != null && player.currentRating > 0 ? player.currentRating : null;
  const uscfRating = player.uscfRating != null && player.uscfRating > 0 ? player.uscfRating : null;

  const chartData: RatingHistoryPoint[] = useMemo(() => {
    if (fideHistory.length > 0) {
      return fideHistory.map((p) => ({
        date: p.date,
        classicalRating: p.classicalRating,
        rapidRating: p.rapidRating,
        blitzRating: p.blitzRating,
      }));
    }
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const point: RatingHistoryPoint = { date: `${yyyy}-${mm}` };
    if (fideRating) point.classicalRating = fideRating;
    return Object.keys(point).length > 1 ? [point] : [];
  }, [fideHistory, fideRating]);

  const hasChartData = chartData.length > 0 && chartData.some((d) =>
    d.classicalRating != null || d.rapidRating != null || d.blitzRating != null,
  );

  return (
    <section data-pdf-section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg">
      <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-white">
        <Activity className="w-5 h-5 text-indigo-400" />
        Player Activity
      </h3>
      <div className="h-64 bg-slate-950/50 rounded-xl border border-slate-800 p-6">
        {hasChartData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickFormatter={(v) => v.slice(0, 7)} />
              <YAxis stroke="#94a3b8" fontSize={10} domain={['dataMin - 50', 'dataMax + 50']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                labelFormatter={(v) => v}
                formatter={(value: number, name: string) => [value, name]}
              />
              {chartData.some((d) => d.classicalRating != null) && (
                <Line type="monotone" dataKey="classicalRating" stroke="#818cf8" strokeWidth={2} dot={{ r: 2 }} name="Classical" connectNulls />
              )}
              {chartData.some((d) => d.rapidRating != null) && (
                <Line type="monotone" dataKey="rapidRating" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} name="Rapid" connectNulls />
              )}
              {chartData.some((d) => d.blitzRating != null) && (
                <Line type="monotone" dataKey="blitzRating" stroke="#ec4899" strokeWidth={2} dot={{ r: 2 }} name="Blitz" connectNulls />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col justify-center h-full">
            <p className="text-slate-400 text-sm mb-4">No games found for analysis. Current ratings:</p>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">FIDE Rating</div>
                <div className="text-3xl font-bold text-indigo-400">{fideRating ?? '—'}</div>
                <div className="text-xs text-slate-400 mt-1">{player.titles?.join(', ') || 'No title'}</div>
              </div>
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">USCF Rating</div>
                <div className="text-3xl font-bold text-emerald-400">{uscfRating ?? '—'}</div>
                <div className="text-xs text-slate-400 mt-1">{player.country || ''}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

const ReportDashboard: React.FC<ReportDashboardProps> = ({
  report,
  requiresSignInForChat,
  isGenerating,
  generatingStatus,
  creditsDeducted: creditsDeductedProp,
  hideCreditsBadge = false,
  onGoToSearch,
  isGuestReport = false,
  onGuestSignUp,
}) => {
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  // Fallback: compute from games if pipeline didn't send creditsDeducted (0 when no games)
  const creditsDeducted = creditsDeductedProp ?? (report.games?.length ? Math.ceil(report.games.length / 5) : 0);
  const { player, whiteOpenings, blackDefenses } = report;

  const hasBothSources = useMemo(() => {
    if (!report.games || report.games.length === 0) return false;
    const sources = new Set((report.games as { source?: string }[]).map((g) => (g.source || '').toLowerCase()));
    const hasOnline = sources.has('lichess') || sources.has('chess.com');
    const hasOtb = sources.has('otb');
    return hasOnline && hasOtb;
  }, [report.games]);

  const openingsBySource = useMemo(() => {
    if (!hasBothSources) return null;
    if (report.openingsBySource) return report.openingsBySource;
    if (!report.games || report.games.length === 0) return null;
    const baseTargets = [
      player.name,
      player.platforms?.chessCom,
      player.platforms?.lichess,
      (player as { actualUsername?: string }).actualUsername,
      (player as { fideName?: string }).fideName,
    ].filter(Boolean) as string[];
    const games = report.games as { source?: string; openingName?: string; eco?: string; white: string; black: string; result: string }[];
    const otbGames = games.filter((g) => (g.source || '').toLowerCase() === 'otb');
    const baseWords = new Set(baseTargets.flatMap((t) => t.toLowerCase().replace(/,/g, ' ').split(/\s+/).filter((w) => w.length >= 2)));
    const otbNames = new Set<string>();
    for (const g of otbGames) {
      for (const n of [g.white, g.black]) {
        if (!n) continue;
        const words = n.toLowerCase().replace(/,/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
        if (words.some((w) => baseWords.has(w) || [...baseWords].some((bw) => bw.includes(w) || w.includes(bw)))) {
          otbNames.add(n.trim());
        }
      }
    }
    const targetNames = [...new Set([...baseTargets, ...otbNames])];
    return aggregateOpeningsBySource(games, targetNames);
  }, [report.games, report.openingsBySource, hasBothSources, player]);

  // Prevent auto-scroll to chat section on mount
  React.useEffect(() => {
    // Remove any hash from URL that might cause scrolling
    if (window.location.hash === '#chat-section') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const hasNoGames = !report.games || report.games.length === 0;
  const hasFideOrUscf = !!(player.fideId || (player.currentRating != null && player.currentRating > 0) || (player.uscfRating != null && player.uscfRating > 0));
  const showActivityReport = hasFideOrUscf;
  const hasReportContent = (report.games && report.games.length > 0) || (report.strategicSummary && report.strategicSummary.length > 0);
  const showMainContent = hasReportContent || !!isGenerating;

  const tacticalBullets = React.useMemo(() => {
    const bullets: { icon: string; text: string }[] = [];
    const wOpenings = whiteOpenings || [];
    const bOpenings = blackDefenses || [];
    const allOpenings = [...wOpenings, ...bOpenings];

    // 1) Find their actual weakest opening (lowest WR with meaningful sample)
    const weakCandidates = allOpenings
      .filter((o) => (o.totalGames || 0) >= 10 && (o.winRate ?? 1) < 0.5);
    const weakest = weakCandidates.sort((a, b) => (a.winRate ?? 1) - (b.winRate ?? 1))[0];
    if (weakest) {
      const wr = ((weakest.winRate ?? 0) * 100).toFixed(0);
      const side = wOpenings.includes(weakest) ? 'as White' : 'as Black';
      bullets.push({ icon: '🎯', text: `Weakest in the ${weakest.name} ${side} — only ${wr}% win rate across ${weakest.totalGames} games` });
    }

    // 2) Time management — pick the most specific insight
    const tm = report.timeManagement;
    if (tm) {
      const totalDecisive = tm.lostOnTime + tm.wonOnTime;
      if (totalDecisive > 10) {
        const flagLossRate = totalDecisive > 0 ? tm.lostOnTime / totalDecisive : 0;
        if (flagLossRate > 0.6) {
          bullets.push({ icon: '⏱', text: `Loses ${(flagLossRate * 100).toFixed(0)}% of flag games — struggles with time management under pressure` });
        } else if (flagLossRate < 0.35 && tm.wonOnTime > 10) {
          bullets.push({ icon: '⏱', text: `Strong clock player — wins ${tm.wonOnTime} games on time vs only ${tm.lostOnTime} losses, likely plays well in time scrambles` });
        } else if (tm.lostOnTime > 15) {
          const lossPct = ((tm.lostOnTimeShareOfLosses ?? 0) * 100).toFixed(0);
          bullets.push({ icon: '⏱', text: `${lossPct}% of decisive losses are on time (${tm.lostOnTime} games) — time trouble is a recurring pattern` });
        } else if (tm.wonOnTime > 5) {
          const bestSpeed = tm.bySpeed?.sort((a, b) => b.wonOnTime - a.wonOnTime)[0];
          if (bestSpeed && bestSpeed.wonOnTime > 3) {
            bullets.push({ icon: '⏱', text: `Wins ${bestSpeed.wonOnTime} games on time in ${bestSpeed.speed} — effective at converting time advantages in faster controls` });
          }
        }
      }
    }

    return bullets;
  }, [whiteOpenings, blackDefenses, report.timeManagement]);

  return (
    <div id="report-pdf-root" className={`relative space-y-8 pb-12 print:space-y-6 min-w-0 w-full max-w-full ${isGenerating ? 'pointer-events-none' : ''}`}>
      {/* Dossier Header */}
      <div data-pdf-section className="bg-slate-900 dark:bg-slate-900 bg-white border border-slate-800 dark:border-slate-800 border-gray-200 rounded-3xl overflow-hidden shadow-2xl">
        <div className="h-auto min-h-[11rem] bg-gradient-to-br from-indigo-900/40 via-slate-900 to-slate-950 dark:from-indigo-900/40 dark:via-slate-900 dark:to-slate-950 from-indigo-50 via-white to-gray-50 relative p-10 flex flex-col justify-end">
          {/* PDF export — top-right */}
          {!isGenerating && (report.games?.length ?? 0) > 0 && (
              <div className="absolute top-4 right-4 print:hidden">
                <button
                  type="button"
                  disabled={pdfExporting}
                  onClick={async () => {
                    const el = document.getElementById('report-pdf-root');
                    if (!el) return;
                    setPdfExporting(true);
                    setPdfError(null);
                    try {
                      await exportReportAsPdf(el, player.name);
                    } catch (err) {
                      console.error('PDF export failed:', err);
                      setPdfError('PDF export failed. Try again or use browser Print (Ctrl+P).');
                    } finally {
                      setPdfExporting(false);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    pdfExporting
                      ? 'bg-indigo-600/30 border-indigo-500/40 text-indigo-300 cursor-wait'
                      : pdfError
                        ? 'bg-red-800/30 border-red-500/40 text-red-300 hover:text-red-200'
                        : 'bg-slate-800/60 border-slate-700/50 text-slate-300 hover:text-white hover:border-indigo-500/40'
                  }`}
                  title={pdfError || 'Download report as PDF'}
                >
                  {pdfExporting ? (
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" /></svg>
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  {pdfExporting ? 'Exporting…' : 'PDF'}
                </button>
              </div>
          )}

          <div>
            <div className="min-w-0">
              <div className="flex items-center gap-3 text-indigo-400 dark:text-indigo-400 text-indigo-600 font-bold text-xs uppercase tracking-[0.2em] mb-2">
                <Shield className="w-4 h-4" />
                Verified Tournament Profile
              </div>
              <h2 className="text-5xl font-serif font-bold tracking-tight text-white dark:text-white text-gray-900 mb-2">{player.name}</h2>
              <div className="flex flex-wrap items-center gap-4 text-slate-400 dark:text-slate-400 text-gray-600 font-medium">
                {player.titles?.length ? (
                  <span className="bg-slate-800 dark:bg-slate-800 bg-gray-100 px-3 py-1 rounded text-sm text-indigo-300 dark:text-indigo-300 text-indigo-600 border border-slate-700 dark:border-slate-700 border-gray-200">
                    {player.titles.join(', ')}
                  </span>
                ) : null}
                {player.country ? <span>{player.country}</span> : null}
                <div className="flex gap-4">
                  <span className="text-indigo-400 dark:text-indigo-400 text-indigo-600 font-bold">FIDE: {player.currentRating != null && player.currentRating > 0 ? player.currentRating : 'Not found'}</span>
                  <span className="text-emerald-400 dark:text-emerald-400 text-emerald-600 font-bold">USCF: {player.uscfRating != null && player.uscfRating > 0 ? player.uscfRating : 'Not found'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        {hasNoGames && !isGenerating && !hideCreditsBadge && onGoToSearch && (
          <div className="px-10 py-4 bg-amber-500/10 border-t border-amber-500/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-amber-200/90">
              We cannot find the player automatically. Can you please provide Chess.com or Lichess usernames?
            </p>
            <button
              type="button"
              onClick={onGoToSearch}
              className="shrink-0 px-4 py-2 bg-amber-500/30 hover:bg-amber-500/50 border border-amber-500/50 rounded-lg text-sm font-medium text-amber-200 transition-colors"
            >
              Add usernames and retry
            </button>
          </div>
        )}
        <div className="py-8 px-10 grid grid-cols-2 md:grid-cols-4 gap-8 bg-slate-950/30 dark:bg-slate-950/30 bg-gray-50 border-t border-slate-800 dark:border-slate-800 border-gray-200">
          <div className="space-y-1">
            <div className="text-[10px] text-slate-400 dark:text-slate-400 text-gray-500 uppercase tracking-widest font-bold">Chess.com</div>
            <div className="text-sm font-semibold text-emerald-400 dark:text-emerald-400 text-emerald-600">
              {player.platforms.chessCom ? (
                <a
                  href={`https://www.chess.com/member/${player.platforms.chessCom}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline flex items-center gap-1"
                >
                  {player.platforms.chessCom}
                  <Share2 className="w-3 h-3" />
                </a>
              ) : '—'}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] text-slate-400 dark:text-slate-400 text-gray-500 uppercase tracking-widest font-bold">Lichess</div>
            <div className="text-sm font-semibold text-indigo-400 dark:text-indigo-400 text-indigo-600">
              {player.platforms.lichess ? (
                <a
                  href={`https://lichess.org/@/${player.platforms.lichess}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline flex items-center gap-1"
                >
                  {player.platforms.lichess}
                  <Share2 className="w-3 h-3" />
                </a>
              ) : '—'}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] text-slate-400 dark:text-slate-400 text-gray-500 uppercase tracking-widest font-bold">Game Sources</div>
            <div className="text-sm text-slate-300 dark:text-slate-300 text-gray-700">
              {report.games && report.games.length > 0 ? (() => {
                const bySource = (report.games as { source?: string }[]).reduce((acc, g) => {
                  const s = (g.source || 'unknown').toLowerCase();
                  acc[s] = (acc[s] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);
                const parts = [
                  (bySource['chess.com'] ?? bySource.chesscom) && `${bySource['chess.com'] ?? bySource.chesscom} Chess.com`,
                  bySource.lichess && `${bySource.lichess} Lichess`,
                  bySource.otb && `${bySource.otb} OTB`,
                ].filter(Boolean);
                return parts.length ? parts.join(', ') : `${report.games.length} games`;
              })() : '—'}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] text-slate-400 dark:text-slate-400 text-gray-500 uppercase tracking-widest font-bold">Total Games</div>
            <div className="text-sm font-semibold text-indigo-400 dark:text-indigo-400 text-indigo-600">
              {report.games?.length ?? (((whiteOpenings || []).reduce((s, o) => s + (o.totalGames || 0), 0) + (blackDefenses || []).reduce((s, o) => s + (o.totalGames || 0), 0)) || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Tactical Summary — quick-glance bullets */}
      {tacticalBullets.length > 0 && !isGenerating && (
        <ReportCard className="!p-6" data-pdf-section>
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold text-white">Tactical Summary</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {tacticalBullets.map((b, i) => (
              <div key={i} className="flex items-start gap-3 bg-slate-950/40 border border-slate-800/60 rounded-xl p-4">
                <span className="text-lg shrink-0 mt-0.5">{b.icon}</span>
                <p className="text-sm text-slate-300 leading-relaxed">{b.text}</p>
              </div>
            ))}
          </div>
        </ReportCard>
      )}

      <div className="space-y-8 min-w-0">
        {/* Main content: hide when no games and we're showing activity report only */}
        {showMainContent && (
        <>
        {/* Strategic Profile (left) | Recent Games (right, height constrained by left) */}
        <StrategicProfileWithRecent
          report={report}
          isGenerating={!!isGenerating}
          player={player}
          isGuestReport={isGuestReport}
          onGuestSignUp={onGuestSignUp}
        />

        {/* Repertoire Graphs - 4 when online+OTB, else 2 */}
        <div className="relative" data-pdf-section>
          {isGuestReport && <GuestBlurOverlay label="Repertoire Analysis" onSignUp={onGuestSignUp} />}
          <div className={isGuestReport ? 'max-h-[400px] overflow-hidden' : ''}>
        {hasBothSources && openingsBySource ? (
          <div className="space-y-8">
            <h3 className="text-xl font-bold text-white">Online (Chess.com, Lichess)</h3>
            <div className="grid md:grid-cols-2 gap-8 items-start">
              <RepertoireChartSection
                title="White Repertoire (Online)"
                icon={TrendingUp}
                openings={openingsBySource.online.white}
                gamesLabel={`${openingsBySource.online.white.reduce((s, o) => s + (o.totalGames || 0), 0).toLocaleString()} games as White`}
              />
              <RepertoireChartSection
                title="Black Repertoire (Online)"
                icon={Clock}
                openings={openingsBySource.online.black}
                gamesLabel={`${openingsBySource.online.black.reduce((s, o) => s + (o.totalGames || 0), 0).toLocaleString()} games as Black`}
              />
            </div>
            <h3 className="text-xl font-bold text-white">OTB (Over-the-board)</h3>
            <div className="grid md:grid-cols-2 gap-8 items-start">
              <RepertoireChartSection
                title="White Repertoire (OTB)"
                icon={TrendingUp}
                openings={openingsBySource.otb.white}
                gamesLabel={`${openingsBySource.otb.white.reduce((s, o) => s + (o.totalGames || 0), 0).toLocaleString()} games as White`}
              />
              <RepertoireChartSection
                title="Black Repertoire (OTB)"
                icon={Clock}
                openings={openingsBySource.otb.black}
                gamesLabel={`${openingsBySource.otb.black.reduce((s, o) => s + (o.totalGames || 0), 0).toLocaleString()} games as Black`}
              />
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <RepertoireChartSection
              title="White Repertoire (Primary Openings)"
              icon={TrendingUp}
              openings={whiteOpenings || []}
              gamesLabel={`${(whiteOpenings || []).reduce((sum, op) => sum + (op.totalGames || 0), 0).toLocaleString()} games as White`}
              isSkeleton={!!isGenerating && (whiteOpenings?.length ?? 0) === 0}
            />
            <RepertoireChartSection
              title="Black Repertoire (Defensive Systems)"
              icon={Clock}
              openings={blackDefenses || []}
              gamesLabel={`${(blackDefenses || []).reduce((sum, op) => sum + (op.totalGames || 0), 0).toLocaleString()} games as Black`}
              isSkeleton={!!isGenerating && (blackDefenses?.length ?? 0) === 0}
            />
          </div>
        )}
          </div>
        </div>

        {report.timeManagement && report.timeManagement.onlineGames > 0 && (
          <TimeManagementSection tm={report.timeManagement} />
        )}

        </>
        )}

      {/* Chat Section - Above Activity Report */}
      <section className="mt-8" id="chat-section" style={{ scrollMarginTop: '0px' }}>
        <RepertoireChat report={report} requiresSignIn={requiresSignInForChat} />
      </section>

      {/* Progress chart: below chat, above Game Analysis Board */}
      {showActivityReport && (
        <ActivityReportSection player={player} />
      )}

      {/* Repertoire Analysis Board */}
      {report.games && report.games.length > 0 && (
        <section className="mt-8 relative" data-pdf-section>
          {isGuestReport && <GuestBlurOverlay label="Repertoire Analysis" onSignUp={onGuestSignUp} />}
          <div className={isGuestReport ? 'pointer-events-none' : ''}>
            <AnalysisBoard 
              games={report.games} 
              playerName={player.name}
              playerUsername={[
                (player as { actualUsername?: string }).actualUsername,
                player.platforms?.chessCom,
                player.platforms?.lichess,
              ].filter(Boolean) as string[]}
              mode="repertoire"
            />
          </div>
        </section>
      )}

      {/* Generating status - centered overlay with backdrop */}
      {isGenerating && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/12 backdrop-blur-[2px]"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-start sm:items-center gap-3 px-6 py-3 max-w-[min(92vw,36rem)] bg-slate-800/30 border border-indigo-500/20 rounded-2xl shadow-2xl shadow-indigo-500/5 min-w-0">
            <div className="w-5 h-5 shrink-0 mt-0.5 sm:mt-0 border-2 border-indigo-400/50 border-t-indigo-400 rounded-full animate-spin" />
            <span className="text-base font-semibold text-slate-100 break-words [overflow-wrap:anywhere] min-w-0 leading-snug">
              {generatingStatus || 'Generating report...'}
            </span>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default ReportDashboard;
