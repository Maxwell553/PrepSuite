import PreparationPlan from './PreparationPlan';
import PracticeDialog from './PracticeDialog';
import GenerationOverlay from './GenerationOverlay';
import { flushSync } from 'react-dom';
import { useRatingHistory } from '../hooks/useRatingHistory';
import MotionSurface from './MotionSurface';

import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { Shield, Target, Clock, TrendingUp, Share2, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, ChevronRight, Activity, Crown, X, BarChart3, Coins, Download, Lock } from 'lucide-react';
import { ScoutingReport, OpeningStat, TimeManagementStats } from '../types';
const AnalysisBoard = React.lazy(() => import('./AnalysisBoard'));
const PracticeOpponent = React.lazy(() => import('./PracticeOpponent'));
import RecentGamesList from './RecentGamesList';
import RepertoireChat from './RepertoireChat';
import { aggregateOpeningsBySource } from '../lib/openingStats';
import { formatTimeControlForDisplay, getTimeControlSecondsForSort } from '../lib/timeControlUtils';
import { supabase } from '../lib/supabase';


function GuestAccessCard({ label, onSignUp }: { label: string; onSignUp?: () => void }) {
  return (
    <div className="prep-guest-access">
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
    <div className={`bg-slate-900/70 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-8 shadow-lg report-card prep-strategic-profile ${className}`} {...rest}>
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
          <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">Online games</div>
          <div className="text-2xl font-bold text-slate-100 mt-1 tabular-nums">{tm.onlineGames.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 min-w-0">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">Lost on time</div>
          <div className="text-2xl font-bold text-rose-400 mt-1 tabular-nums">{tm.lostOnTime.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 min-w-0">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">Won on time</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1 tabular-nums">{tm.wonOnTime.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 min-w-0">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">Share of losses</div>
          <div className="text-2xl font-bold text-amber-300 mt-1 tabular-nums">{lossPct}%</div>
          <div className="text-sm text-slate-400 mt-0.5 text-pretty">Decisive losses ending on time</div>
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
                  <Pie isAnimationActive={false}
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
                  <Pie isAnimationActive={false}
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
            const winRate = (op.winRate || 0) + (op.drawRate || 0) / 2;
            const winPercent = (winRate * 100).toFixed(0);
            const totalGames = Math.round(op.totalGames || 0);
            const wins = Math.round(op.wins || 0);
            const draws = Math.round(op.draws || 0);
            const losses = Math.round(op.losses || 0);
            return (
              <div key={idx} className="flex justify-between items-center text-xs py-1 px-2 bg-slate-950 rounded border border-slate-800">
                <span className="text-slate-200 font-semibold">{op.name}</span>
                <span className="text-slate-400 font-mono text-sm">
                  {totalGames} Games | {winPercent}% score ({wins}W/{draws}D/{losses}L)
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

      {showColorModal && <PracticeDialog title="Choose your color" onClose={()=>setShowColorModal(false)}>
        <p className="prep-practice-intro">Explore {playerName}’s recorded opening lines from either side of the board.</p>
        <div className="prep-color-options" role="group" aria-label="Your pieces">
          {(['white','black'] as const).map(color=><button key={color} type="button" aria-pressed={playerColor===color} onClick={()=>setPlayerColor(color)} className="prep-color-option">
            <Crown size={26}/><span>You play {color==='white'?'White':'Black'}</span><small>{color==='white'?'Make the first move':'Your opponent moves first'}</small>
          </button>)}
        </div>
        <button type="button" className="prep-practice-start" onClick={handleStart}>Start game <ChevronRight size={18}/></button>
      </PracticeDialog>}
      {showGameModal && <PracticeDialog title={`Practice vs ${playerName}`} onClose={handleCloseGame} wide>
        <React.Suspense fallback={<p role="status">Loading practice…</p>}><PracticeOpponent report={report} initialColor={playerColor} onClose={handleCloseGame} moveHistory={moveHistory} onMovePlayed={setMoveHistory}/></React.Suspense>
      </PracticeDialog>}
    </>
  );
}

/** A bounded summary: the full repertoire is available in the Openings section. */
function OpeningSnapshot({report, isGenerating = false}: {report: ScoutingReport; isGenerating?: boolean}) {
  const openings = [...(report.whiteOpenings || []).map(op => ({...op, side:'White'})), ...(report.blackDefenses || []).map(op => ({...op, side:'Black'}))].filter(op => op.totalGames >= 20);
  const score = (op: OpeningStat) => (op.winRate || 0) + (op.drawRate || 0) / 2;
  const higher = openings.filter(op => score(op) >= .5).sort((a,b) => score(b)-score(a)).slice(0,3);
  const lower = openings.filter(op => score(op) < .5).sort((a,b) => score(a)-score(b)).slice(0,3);
  return <section className="prep-report-summary" data-pdf-section>
    <div className="prep-summary-heading"><h3>Opening snapshot</h3><p>Three results per group · at least 20 games each</p></div>
    <div className="prep-summary-columns">{[{title:'Higher historical scores',items:higher},{title:'Lower historical scores',items:lower}].map(group => <div key={group.title} className={group.title.startsWith('Higher') ? 'prep-score-higher' : 'prep-score-lower'}>
      <h4>{group.title}</h4>
      {group.items.length ? <ul>{group.items.map(op => <li key={op.name+op.side}><div><strong>{op.name}</strong><span>{op.side} · {op.totalGames} games</span></div><b>{Math.round(score(op)*100)}%<small>score</small></b></li>)}</ul> : <p className="prep-summary-empty">{isGenerating ? 'Analyzing the games. Opening results will appear here.' : 'No qualifying openings in this group.'}</p>}
    </div>)}</div>
    <p className="prep-summary-footnote">Score includes draws. These are historical results, not engine-confirmed weaknesses. Explore the full repertoire in Openings.</p>
  </section>;
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
    <ReportCard data-pdf-section>
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
              <Bar isAnimationActive={false} dataKey="wins" name="Wins" fill="#10b981" stackId="a" />
              <Bar isAnimationActive={false} dataKey="draws" name="Draws" fill="#475569" stackId="a" />
              <Bar isAnimationActive={false} dataKey="losses" name="Losses" fill="#ef4444" stackId="a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <OpeningList openings={openings} id={title.replace(/\s+/g, '-').toLowerCase()} />
    </ReportCard>
  );
}

function ActivityReportSection({ player, ratings }: { player: ScoutingReport['player']; ratings: ReturnType<typeof useRatingHistory> }) {
  const {history: chartData, loading, error, checkedAt, source, refresh} = ratings;
  const fideRating = player.currentRating != null && player.currentRating > 0 ? player.currentRating : null;
  const uscfRating = player.uscfRating != null && player.uscfRating > 0 ? player.uscfRating : null;
  const hasChartData = chartData.length > 0 && chartData.some((d) =>
    d.classicalRating != null || d.rapidRating != null || d.blitzRating != null,
  );

  return (
    <section data-pdf-section data-pdf-loading={loading ? "true" : undefined} className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg">
      <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-white">
        <Activity className="w-5 h-5 text-indigo-400" />
        Player Activity
      </h3>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <p className="text-sm text-slate-400" role="status">{loading ? 'Checking available rating history…' : error ? (chartData.length ? 'Could not refresh. Showing the last retrieved history.' : 'Rating history is temporarily unavailable. Saved ratings below may be out of date.') : chartData.length ? `Latest available period: ${chartData[chartData.length - 1].date}. Source: ${source || 'FIDE'}.${source === 'FIDE via Lichess' ? ' Backup coverage may lag FIDE.' : ''} Checked ${checkedAt ? new Date(checkedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : 'now'}.` : 'No FIDE ID linked. Ratings below are from this report.'}</p>
        {player.fideId && <button type="button" onClick={refresh} disabled={loading} className="px-4 py-2 border border-slate-700 rounded-lg text-sm">{loading ? 'Refreshing…' : 'Refresh activity'}</button>}
      </div>
      <div className="h-80 bg-slate-950/50 rounded-xl border border-slate-800 p-6">
        {hasChartData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <Legend iconType="circle" wrapperStyle={{fontSize: 13, paddingTop: 12}} />
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickFormatter={(v) => v.slice(0, 7)} />
              <YAxis stroke="#94a3b8" fontSize={12} domain={['dataMin - 50', 'dataMax + 50']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                labelFormatter={(v) => v}
                formatter={(value: number, name: string) => [value, name]}
              />
              {chartData.some((d) => d.classicalRating != null) && (
                <Line isAnimationActive={false} type="monotone" dataKey="classicalRating" stroke="#818cf8" strokeWidth={2} dot={{ r: 2 }} name="Classical" connectNulls />
              )}
              {chartData.some((d) => d.rapidRating != null) && (
                <Line isAnimationActive={false} type="monotone" dataKey="rapidRating" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} name="Rapid" connectNulls />
              )}
              {chartData.some((d) => d.blitzRating != null) && (
                <Line isAnimationActive={false} type="monotone" dataKey="blitzRating" stroke="#ec4899" strokeWidth={2} dot={{ r: 2 }} name="Blitz" connectNulls />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col justify-center h-full">
            <p className="text-slate-400 text-sm mb-4">Saved report ratings · not live activity</p>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                <div className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-1">FIDE Rating</div>
                <div className="text-3xl font-bold text-indigo-400">{fideRating ?? '—'}</div>
                <div className="text-xs text-slate-400 mt-1">{player.titles?.join(', ') || 'Title unavailable'}</div>
              </div>
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                <div className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-1">USCF Rating</div>
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
  const [printing, setPrinting] = useState(false);
  const [section, setSection] = useState('overview');
  const [openingSource, setOpeningSource] = useState('all');
  const [openingSide, setOpeningSide] = useState('white');
  React.useEffect(() => {setSection('overview');setOpeningSource('all');setOpeningSide('white');}, [report.id]);
  React.useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);window.addEventListener('afterprint', after);
    return () => {window.removeEventListener('beforeprint', before);window.removeEventListener('afterprint', after);};
  }, []);
  const exporting = pdfExporting || printing;
  const visible = (name: string) => exporting || section === name;
  const tabs = [{id:'overview',label:'Overview'},{id:'openings',label:'Openings'},{id:'preparation',label:'Preparation'},{id:'games',label:'Games & practice'},{id:'activity',label:'Activity'},{id:'chat',label:'Ask a question'}];
  const [pdfError, setPdfError] = useState<string | null>(null);
  // Fallback: compute from games if pipeline didn't send creditsDeducted (0 when no games)
  const creditsDeducted = creditsDeductedProp ?? 0;
  const { player, whiteOpenings, blackDefenses } = report;
  // Keep published history across tabs and export instead of refetching on every mount.
  const ratings = useRatingHistory(isGenerating ? undefined : player.fideId);

  const hasBothSources = useMemo(() => {
    const sources = new Set(report.gameSources || (report.games || []).map(g => g.source.toLowerCase()));
    const hasOnline = sources.has('lichess') || sources.has('chess.com');
    const hasOtb = sources.has('otb');
    return hasOnline && hasOtb;
  }, [report.games, report.gameSources]);

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
    const games = report.games;
    const targetNames = baseTargets;
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
    const frequent = [...(whiteOpenings || []), ...(blackDefenses || [])].sort((a,b) => b.totalGames-a.totalGames)[0];
    const bullets: {icon:typeof Target;text:string}[] = [];
    if (frequent) bullets.push({icon:Target,text:`Most played: ${frequent.name} · ${frequent.totalGames} games.`});
    if (report.timeManagement) bullets.push({icon:Clock,text:`${report.timeManagement.lostOnTime} of ${report.timeManagement.onlineGames.toLocaleString()} online games ended in a loss on time.`});
    return bullets;
  }, [whiteOpenings,blackDefenses,report.timeManagement]);

  return (
    <div id="report-pdf-root" aria-busy={!!isGenerating} className={`relative space-y-8 pb-12 print:space-y-6 min-w-0 w-full max-w-full ${isGenerating ? 'pointer-events-none' : ''}`}>
      {isGenerating && <GenerationOverlay status={generatingStatus || 'Generating report…'}/>}

      {player.identityNote && <p data-pdf-section className="text-xs text-slate-400 mb-4">{player.identityNote}</p>}
      {!!player.discoverySources?.length && <details data-pdf-section className="mb-4 text-xs text-slate-400"><summary className="cursor-pointer">Discovery sources — review the evidence</summary><ul className="mt-2 space-y-2">{player.discoverySources.filter(url => url.startsWith("https://")).map(url => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" className="underline break-all">{url}</a></li>)}</ul></details>}
      {/* Dossier Header */}
      <MotionSurface data-pdf-section className="prep-player-header bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        <div className="h-auto min-h-[11rem] bg-gradient-to-br from-indigo-900/40 via-slate-900 to-slate-950 dark:from-indigo-900/40 dark:via-slate-900 dark:to-slate-950 from-indigo-50 via-white to-gray-50 relative p-10 flex flex-col justify-end">
          {/* PDF export — top-right */}
          {!isGenerating && (report.games?.length ?? 0) > 0 && (
              <div className="prep-profile-actions print:hidden">
                <button
                  type="button"
                  disabled={pdfExporting}
                  onClick={async () => {
                    const el = document.getElementById('report-pdf-root');
                    if (!el) return;
                    flushSync(() => setPdfExporting(true));
                    setPdfError(null);
                    try {
                      const { exportReportAsPdf } = await import('../lib/pdfExport');
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
              <div className="prep-profile-label flex items-center gap-3 text-indigo-400 dark:text-indigo-400 text-indigo-600 font-bold text-xs uppercase tracking-[0.2em] mb-2">
                <Shield className="w-4 h-4" />
                Player profile · review linked accounts
              </div>
              <h2 className="text-5xl font-serif font-bold tracking-tight text-white dark:text-white text-gray-900 mb-2">{player.name}</h2>
              <div className="flex flex-wrap items-center gap-4 text-slate-400 dark:text-slate-400 text-gray-600 font-medium">
                {player.titles?.length ? (
                  <span className="bg-slate-800 dark:bg-slate-800 bg-gray-100 px-3 py-1 rounded text-sm text-indigo-300 dark:text-indigo-300 text-indigo-600 border border-slate-700 dark:border-slate-700 border-gray-200">
                    {player.titles.join(', ')}
                  </span>
                ) : null}
                {player.country ? <span>{player.country}</span> : null}
                <div className="contents">
                  <span className="text-indigo-400 dark:text-indigo-400 text-indigo-600 font-bold">FIDE: {player.currentRating != null && player.currentRating > 0 ? player.currentRating : isGenerating ? 'Searching…' : 'Not found'}</span>
                  <span className="text-emerald-400 dark:text-emerald-400 text-emerald-600 font-bold">USCF: {player.uscfRating != null && player.uscfRating > 0 ? player.uscfRating : isGenerating ? 'Searching…' : 'Not found'}</span>
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
            <div className="text-xs text-slate-400 dark:text-slate-400 text-gray-500 uppercase tracking-widest font-bold">Chess.com</div>
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
            <div className="text-xs text-slate-400 dark:text-slate-400 text-gray-500 uppercase tracking-widest font-bold">Lichess</div>
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
            <div className="text-xs text-slate-400 dark:text-slate-400 text-gray-500 uppercase tracking-widest font-bold">Game Sources</div>
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
              })() : report.gameSources?.map(source => source === 'otb' ? 'OTB' : source === 'chess.com' ? 'Chess.com' : source === 'lichess' ? 'Lichess' : source).join(', ') || '—'}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-400 dark:text-slate-400 text-gray-500 uppercase tracking-widest font-bold">Total Games</div>
            <div className="text-sm font-semibold text-indigo-400 dark:text-indigo-400 text-indigo-600">
              {report.gameCount ?? report.games?.length ?? (((whiteOpenings || []).reduce((s, o) => s + (o.totalGames || 0), 0) + (blackDefenses || []).reduce((s, o) => s + (o.totalGames || 0), 0)) || 0)}
            </div>
          </div>
        </div>
      </MotionSurface>

      {!isGenerating && report.requestedGameCount && (report.games?.length || 0) < report.requestedGameCount ? <p className="prep-coverage-note">Retrieved {(report.games?.length || 0).toLocaleString()} of {report.requestedGameCount.toLocaleString()} requested games. Some selected sources had fewer usable games or could not be reached.</p> : null}

      {pdfError && <p role="alert" className="text-rose-300 print:hidden">{pdfError}</p>}
      <div className="prep-report-tabs print:hidden" role="tablist" aria-label="Report sections">{tabs.map((tab,index) => <button key={tab.id} id={`report-tab-${tab.id}`} role="tab" disabled={!!isGenerating} aria-selected={section===tab.id} aria-controls={`report-panel-${tab.id}`} tabIndex={section===tab.id?0:-1} onClick={()=>setSection(tab.id)} onKeyDown={event=>{
        const target = event.key==='ArrowRight' ? (index+1)%tabs.length : event.key==='ArrowLeft' ? (index+tabs.length-1)%tabs.length : event.key==='Home' ? 0 : event.key==='End' ? tabs.length-1 : -1;
        if(target>=0){event.preventDefault();setSection(tabs[target].id);document.getElementById(`report-tab-${tabs[target].id}`)?.focus();}
      }}>{tab.label}</button>)}</div>

      {visible('overview') && <div id="report-panel-overview" role="tabpanel" aria-labelledby="report-tab-overview" className="prep-report-panel">
        {tacticalBullets.length > 0 && !isGenerating && <section className="prep-report-takeaways" data-pdf-section><h3>At a glance</h3><ul>{tacticalBullets.map((bullet,index)=><li key={index}><bullet.icon size={20} aria-hidden="true"/><p>{bullet.text}</p></li>)}</ul></section>}
        {showMainContent && <OpeningSnapshot report={report} isGenerating={!!isGenerating}/>}
        {!showMainContent && <p className="prep-report-empty">No games available yet. View published ratings in Activity.</p>}
      </div>}

      {visible('openings') && <div id="report-panel-openings" role="tabpanel" aria-labelledby="report-tab-openings" className="prep-report-panel relative">
        {isGuestReport ? <GuestAccessCard label="Repertoire Analysis" onSignUp={onGuestSignUp}/> : <>
        <div className="prep-report-filters print:hidden"><label>Source<select aria-label="Source" value={openingSource} onChange={event=>setOpeningSource(event.target.value)}><option value="all">All available games</option>{openingsBySource && <><option value="online">Online</option><option value="otb">Over the board</option></>}</select></label><label>Opponent plays<select aria-label="Opponent plays" value={openingSide} onChange={event=>setOpeningSide(event.target.value)}><option value="white">White</option><option value="black">Black</option></select></label></div>
        {(exporting ? ['white','black'] : [openingSide]).map(side => {
          const selectedSource = openingSource==='online' ? openingsBySource?.online : openingSource==='otb' ? openingsBySource?.otb : null;
          const openings = exporting ? (side==='white' ? whiteOpenings : blackDefenses) || [] : selectedSource ? (side==='white' ? selectedSource.white : selectedSource.black) : (side==='white' ? whiteOpenings : blackDefenses) || [];
          return <RepertoireChartSection key={side} title={`${side==='white'?'White':'Black'} repertoire`} icon={TrendingUp} openings={openings} gamesLabel={`${openings.reduce((sum,op)=>sum+(op.totalGames||0),0).toLocaleString()} games · ${exporting || openingSource==='all' ? 'all sources' : openingSource==='online' ? 'online' : 'over the board'}`} isSkeleton={!!isGenerating && !openings.length}/>;
        })}
        </>}
      </div>}

      <div id="report-panel-preparation" role="tabpanel" aria-labelledby="report-tab-preparation" hidden={!visible('preparation')} className="prep-report-panel">
        {isGuestReport ? <GuestAccessCard label="Preparation plan & round sheet" onSignUp={onGuestSignUp}/> : report.games?.length ?
          <PreparationPlan key={report.id} report={report}/> :
          <p className="prep-report-empty">{report.gameCount ? 'Load games above to build your preparation plan and download a round sheet.' : 'No games are available for a preparation plan. Try a linked Chess.com or Lichess account.'}</p>}
      </div>

      {visible('games') && <div id="report-panel-games" role="tabpanel" aria-labelledby="report-tab-games" className="prep-report-panel relative">
        {isGuestReport ? <GuestAccessCard label="Games & practice" onSignUp={onGuestSignUp}/> : report.games?.length ? <>
          <PracticeBarWithModals report={report} playerName={player.name}/>
          <RecentGamesList games={report.games} playerName={player.name} playerUsername={[(player as {actualUsername?:string}).actualUsername,(player as {fideName?:string}).fideName,player.platforms?.chessCom,player.platforms?.lichess].filter(Boolean) as string[]} maxHeight={440}/>
          <details className="prep-explorer-disclosure"><summary>Explore the repertoire on a board</summary><React.Suspense fallback={<p role="status">Loading repertoire explorer…</p>}><AnalysisBoard games={report.games} playerName={player.name} playerUsername={[player.platforms?.chessCom,player.platforms?.lichess].filter(Boolean) as string[]} mode="repertoire"/></React.Suspense></details>
        </> : <p className="prep-report-empty">{report.gameCount ? 'Games haven’t been loaded. Use “Load games” above to review and practice this report.' : 'No games are available for this report. Try a new search with a linked Chess.com or Lichess account.'}</p>}
      </div>}

      {visible('activity') && <div id="report-panel-activity" role="tabpanel" aria-labelledby="report-tab-activity" className="prep-report-panel">
        {showActivityReport && <ActivityReportSection player={player} ratings={ratings}/>}
        {report.timeManagement && report.timeManagement.onlineGames > 0 && <details className="prep-explorer-disclosure" open={exporting || undefined}><summary>Clock pressure & time controls</summary><TimeManagementSection tm={report.timeManagement}/></details>}
        {!showActivityReport && !report.timeManagement?.onlineGames && <p className="prep-report-empty">No rating history or clock data is available for this report.</p>}
      </div>}

      {visible('chat') && <section id="report-panel-chat" role="tabpanel" aria-labelledby="report-tab-chat" className="prep-report-panel"><div id="chat-section"><RepertoireChat report={report} requiresSignIn={requiresSignInForChat}/></div></section>}


    </div>
  );
};

export default ReportDashboard;
