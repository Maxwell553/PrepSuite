
import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer,
} from 'recharts';
import { Shield, Target, Clock, TrendingUp, Share2, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Activity, Download } from 'lucide-react';
import { ScoutingReport, OpeningStat } from '../types';
import AnalysisBoard from './AnalysisBoard';
import RecentGamesList from './RecentGamesList';
import RepertoireChat from './RepertoireChat';
import { aggregateOpeningsBySource } from '../lib/openingStats';
import { supabase } from '../lib/supabase';

interface ReportDashboardProps {
  report: ScoutingReport;
  /** When true, chat is grayed out with "Requires sign in" */
  requiresSignInForChat?: boolean;
  /** When true, show generating overlay (blocks interaction until report is complete) */
  isGenerating?: boolean;
  /** Status message to show in overlay (e.g. "Step 2: Fetching Games...") */
  generatingStatus?: string;
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

/** Strategic Profile + Recent Games with right column height constrained by left */
function StrategicProfileWithRecent({
  report,
  isGenerating,
  player,
}: {
  report: ScoutingReport;
  isGenerating: boolean;
  player: ScoutingReport['player'];
}) {
  const leftRef = React.useRef<HTMLElement | null>(null);
  const [maxHeight, setMaxHeight] = React.useState<number | null>(null);

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
  }, [report.strategicSummary, report.strengths, report.weaknesses, isGenerating]);

  return (
    <div className="grid lg:grid-cols-[1fr_minmax(0,380px)] gap-8 items-start">
      <section
        ref={leftRef}
        className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg"
      >
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-400" />
          Strategic Profile Analysis
        </h3>
        <div className="text-slate-300 space-y-4 leading-relaxed">
          {isGenerating && !report.strategicSummary ? (
            <SkeletonBlock lines={4} />
          ) : (
            <p className="text-lg font-medium">{report.strategicSummary?.replace(/\*\*/g, '')}</p>
          )}

          <div className="grid md:grid-cols-2 gap-4 mt-8">
            <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl h-full">
              <h4 className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-widest mb-4">
                <CheckCircle className="w-4 h-4" /> Core Strengths
              </h4>
              {isGenerating && (!report.strengths || report.strengths.length === 0) ? (
                <SkeletonBlock lines={3} />
              ) : (
                <ul className="space-y-3 text-sm">
                  {report.strengths?.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-emerald-500/50 font-bold">•</span> {s?.replace(/\*\*/g, '')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl h-full">
              <h4 className="flex items-center gap-2 text-red-400 font-bold text-xs uppercase tracking-widest mb-4">
                <AlertTriangle className="w-4 h-4" /> Strategic Weaknesses
              </h4>
              {isGenerating && (!report.weaknesses || report.weaknesses.length === 0) ? (
                <SkeletonBlock lines={3} />
              ) : (
                <ul className="space-y-3 text-sm">
                  {report.weaknesses?.map((w, i) => (
                    <li key={i} className="flex gap-2 text-slate-400">
                      <span className="text-red-500/50 font-bold">•</span> {w?.replace(/\*\*/g, '')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      {report.games && report.games.length > 0 && (
        <RecentGamesList
          games={report.games}
          playerName={player.name}
          playerUsername={[
            (player as { actualUsername?: string }).actualUsername,
            player.platforms?.chessCom,
            player.platforms?.lichess,
          ].filter(Boolean) as string[]}
          maxHeight={maxHeight}
        />
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
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg flex flex-col">
        <h3 className="text-lg font-bold mb-1 flex items-center gap-2 text-white">
          <Icon className="w-5 h-5 text-indigo-400" />
          {title}
        </h3>
        <p className="text-sm text-slate-400 mb-6">{gamesLabel}</p>
        <div className="h-64 mb-6 flex flex-col justify-end gap-3 w-full">
          {[90, 65, 50, 75, 55].map((w, i) => (
            <div key={i} className="animate-shimmer h-6 rounded" style={{ width: `${w}%` }} aria-hidden />
          ))}
        </div>
        <div className="space-y-2">
          <SkeletonLine width="60%" />
          <SkeletonLine width="40%" />
        </div>
      </section>
    );
  }
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg flex flex-col">
      <h3 className="text-lg font-bold mb-1 flex items-center gap-2 text-white">
        <Icon className="w-5 h-5 text-indigo-400" />
        {title}
      </h3>
      <p className="text-sm text-slate-400 mb-6">{gamesLabel}</p>
      <div className="h-64 mb-6 overflow-x-auto overflow-y-hidden w-full">
        <BarChart
          data={openings}
          width={Math.max(400, (openings?.length || 0) * 30)}
          height={256}
          margin={{ bottom: 40 }}
          barSize={20}
          barCategoryGap={10}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} angle={-45} textAnchor="end" height={60} />
          <YAxis stroke="#475569" fontSize={10} />
          <Tooltip cursor={{ fill: '#ffffff08' }} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }} />
          <Bar dataKey="wins" name="Wins" fill="#10b981" stackId="a" barSize={20} />
          <Bar dataKey="draws" name="Draws" fill="#64748b" stackId="a" barSize={20} />
          <Bar dataKey="losses" name="Losses" fill="#ef4444" stackId="a" barSize={20} />
        </BarChart>
      </div>
      <OpeningList openings={openings} id={title.replace(/\s+/g, '-').toLowerCase()} />
    </section>
  );
}

interface RatingHistoryPoint {
  date: string;
  classicalRating?: number;
  rapidRating?: number;
  blitzRating?: number;
  uscfRating?: number;
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
        const { data: { session } } = await supabase.auth.getSession();
        const baseUrl = import.meta.env.VITE_PIPELINE_SERVICE_URL || '';
        const url = `${baseUrl}/api/fide-rating-history/${player.fideId}`;
        const res = await fetch(url, {
          signal: controller.signal,
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
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
      const sorted = [...fideHistory].sort((a, b) => b.date.localeCompare(a.date));
      const latestDate = sorted[0]?.date;
      return fideHistory.map((p) => ({
        date: p.date,
        classicalRating: p.classicalRating,
        rapidRating: p.rapidRating,
        blitzRating: p.blitzRating,
        // USCF: no history API; show current rating only at most recent point
        uscfRating: p.date === latestDate ? (uscfRating ?? undefined) : undefined,
      }));
    }
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const point: RatingHistoryPoint = { date: `${yyyy}-${mm}` };
    if (fideRating) point.classicalRating = fideRating;
    if (uscfRating) point.uscfRating = uscfRating;
    return Object.keys(point).length > 1 ? [point] : [];
  }, [fideHistory, fideRating, uscfRating]);

  const hasChartData = chartData.length > 0 && chartData.some((d) =>
    d.classicalRating != null || d.rapidRating != null || d.blitzRating != null || d.uscfRating != null,
  );

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg">
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
              {uscfRating != null && (
                <Line type="monotone" dataKey="uscfRating" stroke="#34d399" strokeWidth={2} dot={{ r: 2 }} name="USCF" connectNulls />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col justify-center h-full">
            <p className="text-slate-400 text-sm mb-4">No games found for analysis. Current ratings:</p>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">FIDE Rating</div>
                <div className="text-3xl font-bold text-indigo-400">{fideRating ?? '—'}</div>
                <div className="text-xs text-slate-400 mt-1">{player.titles?.join(', ') || 'No title'}</div>
              </div>
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">USCF Rating</div>
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

const ReportDashboard: React.FC<ReportDashboardProps> = ({ report, requiresSignInForChat, isGenerating, generatingStatus }) => {
  const { player, whiteOpenings, blackDefenses } = report;

  const hasBothSources = useMemo(() => {
    if (!report.games || report.games.length === 0) return false;
    const sources = new Set((report.games as { source?: string }[]).map((g) => (g.source || '').toLowerCase()));
    const hasOnline = sources.has('lichess') || sources.has('chess.com');
    const hasOtb = sources.has('otb');
    return hasOnline && hasOtb;
  }, [report.games]);

  const openingsBySource = useMemo(() => {
    if (!report.games || report.games.length === 0 || !hasBothSources) return null;
    const baseTargets = [
      player.name,
      player.platforms?.chessCom,
      player.platforms?.lichess,
      (player as { actualUsername?: string }).actualUsername,
      (player as { fideName?: string }).fideName,
    ].filter(Boolean) as string[];
    // OTB games use different name formats (e.g. "Gukesh D" vs "Gukesh Dommaraju"). Include names from OTB games that share a significant word with base targets.
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
  }, [report.games, hasBothSources, player]);

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
  // Show main content when we have report data OR when generating (skeleton layout)
  const hasReportContent = (report.games && report.games.length > 0) || (report.strategicSummary && report.strategicSummary.length > 0);
  const showMainContent = hasReportContent || !!isGenerating;

  return (
    <div className={`relative space-y-8 pb-12 print:space-y-6 ${isGenerating ? 'pointer-events-none' : ''}`}>
      {/* Dossier Header */}
      <div className="bg-slate-900 dark:bg-slate-900 bg-white border border-slate-800 dark:border-slate-800 border-gray-200 rounded-3xl overflow-hidden shadow-2xl">
        <div className="h-44 bg-gradient-to-br from-indigo-900/40 via-slate-900 to-slate-950 dark:from-indigo-900/40 dark:via-slate-900 dark:to-slate-950 from-indigo-50 via-white to-gray-50 relative p-10 flex flex-col justify-end">
          <div className="flex justify-between items-end">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 text-indigo-400 dark:text-indigo-400 text-indigo-600 font-bold text-xs uppercase tracking-[0.2em] mb-2">
                <Shield className="w-4 h-4" />
                Verified Tournament Profile
              </div>
              <h2 className="text-5xl font-serif font-bold tracking-tight text-white dark:text-white text-gray-900 mb-2">{player.name}</h2>
              <div className="flex items-center gap-4 text-slate-400 dark:text-slate-400 text-gray-600 font-medium">
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
            <button
              type="button"
              onClick={() => {
                const slug = player.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'report';
                const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${slug}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-medium transition-colors shrink-0"
            >
              <Download className="w-4 h-4" />
              Download JSON
            </button>
          </div>
        </div>
        <div className="py-8 px-10 grid grid-cols-2 md:grid-cols-4 gap-8 bg-slate-950/30 dark:bg-slate-950/30 bg-gray-50 border-t border-slate-800 dark:border-slate-800 border-gray-200">
          <div className="space-y-1">
            <div className="text-[10px] text-slate-500 dark:text-slate-500 text-gray-500 uppercase tracking-widest font-bold">Chess.com</div>
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
            <div className="text-[10px] text-slate-500 dark:text-slate-500 text-gray-500 uppercase tracking-widest font-bold">Lichess</div>
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
            <div className="text-[10px] text-slate-500 dark:text-slate-500 text-gray-500 uppercase tracking-widest font-bold">Game Sources</div>
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
            <div className="text-[10px] text-slate-500 dark:text-slate-500 text-gray-500 uppercase tracking-widest font-bold">Total Games</div>
            <div className="text-sm font-semibold text-indigo-400 dark:text-indigo-400 text-indigo-600">
              {report.games?.length ?? (((whiteOpenings || []).reduce((s, o) => s + (o.totalGames || 0), 0) + (blackDefenses || []).reduce((s, o) => s + (o.totalGames || 0), 0)) || 0)}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* Main content: hide when no games and we're showing activity report only */}
        {showMainContent && (
        <>
        {/* Strategic Profile (left) | Recent Games (right, height constrained by left) */}
        <StrategicProfileWithRecent
          report={report}
          isGenerating={!!isGenerating}
          player={player}
        />

        {/* Repertoire Graphs - 4 when online+OTB, else 2 */}
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

        </>
        )}

      {/* Progress chart: below repertoire strategy & defensive philosophy, above Game Analysis Board */}
      {showActivityReport && (
        <ActivityReportSection player={player} />
      )}

      {/* Repertoire Analysis Board (repertoire only, no game selection) */}
      {report.games && report.games.length > 0 && (
        <section className="mt-8">
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
        </section>
      )}

      {/* Chat Section - At Bottom, Collapsed by Default */}
      <section className="mt-8" id="chat-section" style={{ scrollMarginTop: '0px' }}>
        <RepertoireChat report={report} requiresSignIn={requiresSignInForChat} />
      </section>

      {/* Generating status - centered overlay with backdrop */}
      {isGenerating && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/12 backdrop-blur-[2px]"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-3 px-6 py-3 bg-slate-800/30 border border-indigo-500/20 rounded-2xl shadow-2xl shadow-indigo-500/5">
            <div className="w-5 h-5 border-2 border-indigo-400/50 border-t-indigo-400 rounded-full animate-spin" />
            <span className="text-base font-semibold text-slate-100">{generatingStatus || 'Generating report...'}</span>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default ReportDashboard;
