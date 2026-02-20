
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Shield, Target, Zap, Clock, TrendingUp, Share2, AlertTriangle, CheckCircle, Crosshair, BookOpen, Search, MessageSquare } from 'lucide-react';
import { ScoutingReport } from '../types';
import AnalysisBoard from './AnalysisBoard';
import RepertoireChat from './RepertoireChat';

interface ReportDashboardProps {
  report: ScoutingReport;
}

const ReportDashboard: React.FC<ReportDashboardProps> = ({ report }) => {
  const { player, whiteOpenings, blackDefenses } = report;

  // Prevent auto-scroll to chat section on mount
  React.useEffect(() => {
    // Remove any hash from URL that might cause scrolling
    if (window.location.hash === '#chat-section') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      {/* Dossier Header */}
      <div className="bg-slate-900 dark:bg-slate-900 bg-white border border-slate-800 dark:border-slate-800 border-gray-200 rounded-3xl overflow-hidden shadow-2xl">
        <div className="h-44 bg-gradient-to-br from-indigo-900/40 via-slate-900 to-slate-950 dark:from-indigo-900/40 dark:via-slate-900 dark:to-slate-950 from-indigo-50 via-white to-gray-50 relative p-10 flex flex-col justify-end">
          <div className="flex justify-between items-end">
            <div>
              <div className="flex items-center gap-3 text-indigo-400 dark:text-indigo-400 text-indigo-600 font-bold text-xs uppercase tracking-[0.2em] mb-2">
                <Shield className="w-4 h-4" />
                Verified Tournament Profile
              </div>
              <h2 className="text-5xl font-serif font-bold tracking-tight text-white dark:text-white text-gray-900 mb-2">{player.name}</h2>
              <div className="flex items-center gap-4 text-slate-400 dark:text-slate-400 text-gray-600 font-medium">
                <span className="bg-slate-800 dark:bg-slate-800 bg-gray-100 px-3 py-1 rounded text-sm text-indigo-300 dark:text-indigo-300 text-indigo-600 border border-slate-700 dark:border-slate-700 border-gray-200">
                  {player.titles?.join(', ') || 'Professional'}
                </span>
                <span>{player.country}</span>
                <div className="flex gap-4">
                  <span className="text-indigo-400 dark:text-indigo-400 text-indigo-600 font-bold">FIDE: {player.currentRating != null && player.currentRating > 0 ? player.currentRating : 'Not found'}</span>
                  <span className="text-emerald-400 dark:text-emerald-400 text-emerald-600 font-bold">USCF: {player.uscfRating != null && player.uscfRating > 0 ? player.uscfRating : 'Not found'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="py-8 px-10 grid grid-cols-2 gap-8 bg-slate-950/30 dark:bg-slate-950/30 bg-gray-50 border-t border-slate-800 dark:border-slate-800 border-gray-200">
          <div className="space-y-1">
            <div className="text-[10px] text-slate-500 dark:text-slate-500 text-gray-500 uppercase tracking-widest font-bold">Chess.com Handle</div>
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
              ) : 'Not Found'}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] text-slate-500 dark:text-slate-500 text-gray-500 uppercase tracking-widest font-bold">Lichess Handle</div>
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
              ) : 'Not Found'}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* Top Row: Strategic Profile (left) | Tactical Rec + Specific Vulnerability (right, same width, combined height = left) */}
        <div className="grid lg:grid-cols-3 gap-8 items-stretch">
          <section className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-400" />
              Strategic Profile Analysis
            </h3>
            <div className="text-slate-300 space-y-4 leading-relaxed">
              <p className="text-lg font-medium">{report.strategicSummary?.replace(/\*\*/g, '')}</p>

              <div className="grid md:grid-cols-2 gap-4 mt-8">
                <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl h-full">
                  <h4 className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-widest mb-4">
                    <CheckCircle className="w-4 h-4" /> Core Strengths
                  </h4>
                  <ul className="space-y-3 text-sm">
                    {report.strengths?.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-emerald-500/50 font-bold">•</span> {s?.replace(/\*\*/g, '')}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl h-full">
                  <h4 className="flex items-center gap-2 text-red-400 font-bold text-xs uppercase tracking-widest mb-4">
                    <AlertTriangle className="w-4 h-4" /> Strategic Weaknesses
                  </h4>
                  <ul className="space-y-3 text-sm">
                    {report.weaknesses?.map((w, i) => (
                      <li key={i} className="flex gap-2 text-slate-400">
                        <span className="text-red-500/50 font-bold">•</span> {w?.replace(/\*\*/g, '')}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Right column: Tactical Rec + Specific Vulnerability, same width, combined height = Strategic Profile */}
          <div className="flex flex-col gap-4 h-full min-h-0">
            <section className="flex-1 min-h-0 flex flex-col bg-indigo-600 border border-indigo-400 rounded-2xl p-6 shadow-xl shadow-indigo-900/20 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 opacity-10">
                <Crosshair className="w-32 h-32 text-white" />
              </div>
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-white shrink-0">
                <Zap className="w-5 h-5" />
                Tactical Recommendation
              </h3>
              <div className="text-indigo-50 text-sm leading-relaxed space-y-3 whitespace-pre-wrap min-h-0 overflow-y-auto">
                <p className="font-semibold">{(report.tacticalRecommendation || '').replace(/\*\*/g, '')}</p>
                <div className="p-3 bg-white/10 rounded-xl border border-white/20 shrink-0">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-1">Target Profile: {player.name}</h4>
                  <p className="text-xs italic opacity-80">Focus on the transition between late-middlegame and endgame where target accuracy deviates.</p>
                </div>
              </div>
            </section>

            <section className="flex-1 min-h-0 flex flex-col bg-slate-900 dark:bg-slate-900 border border-slate-800 dark:border-slate-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-red-400 dark:text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
                Specific Vulnerability
              </h3>
              <div className="text-slate-300 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap min-h-0 overflow-y-auto">
                <p className="p-4 bg-slate-950 dark:bg-slate-950 rounded-xl border border-slate-800 dark:border-slate-800 italic">
                  "{(report.specificVulnerability || '').replace(/\*\*/g, '')}"
                </p>
              </div>
            </section>
          </div>
        </div>

        {/* Repertoire Graphs - full width, 2 columns */}
        <div className="grid md:grid-cols-2 gap-8">
            {/* White Opening Efficiency */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg flex flex-col">
              <h3 className="text-lg font-bold mb-1 flex items-center gap-2 text-white">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
                White Repertoire (Primary Openings)
              </h3>
              <p className="text-sm text-slate-400 mb-6">
                {(whiteOpenings || []).reduce((sum, op) => sum + (op.totalGames || 0), 0).toLocaleString()} games as White
              </p>
              <div className="h-64 mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={whiteOpenings} margin={{ bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="#94a3b8"
                      fontSize={10}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis stroke="#475569" fontSize={10} />
                    <Tooltip
                      cursor={{ fill: '#ffffff08' }}
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                    />
                    <Bar dataKey="wins" name="Wins" fill="#10b981" stackId="a" />
                    <Bar dataKey="draws" name="Draws" fill="#64748b" stackId="a" />
                    <Bar dataKey="losses" name="Losses" fill="#ef4444" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {whiteOpenings.slice(0, 10).map((op, idx) => {
                  // Safely calculate win rate, handling NaN/undefined cases
                  const winRate = typeof op.winRate === 'number' && !isNaN(op.winRate) ? op.winRate : 0;
                  const winPercent = (winRate * 100).toFixed(0);
                  // Ensure all counts are integers (round to nearest)
                  const totalGames = Math.round(op.totalGames || 0);
                  const wins = Math.round(op.wins || 0);
                  const draws = Math.round(op.draws || 0);
                  const losses = Math.round(op.losses || 0);
                  
                  return (
                    <div key={idx} className="flex justify-between items-center text-[10px] p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-slate-300 font-bold">{op.name}</span>
                      <span className="text-slate-500 font-mono">
                        {totalGames} Games | {winPercent}% W ({wins}W/{draws}D/{losses}L)
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Black Repertoire */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg flex flex-col">
              <h3 className="text-lg font-bold mb-1 flex items-center gap-2 text-white">
                <Clock className="w-5 h-5 text-indigo-400" />
                Black Repertoire (Defensive Systems)
              </h3>
              <p className="text-sm text-slate-400 mb-6">
                {(blackDefenses || []).reduce((sum, op) => sum + (op.totalGames || 0), 0).toLocaleString()} games as Black
              </p>
              <div className="h-64 mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={blackDefenses} margin={{ bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="#94a3b8"
                      fontSize={10}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis stroke="#475569" fontSize={10} />
                    <Tooltip
                      cursor={{ fill: '#ffffff08' }}
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                    />
                    <Bar dataKey="wins" name="Wins" fill="#10b981" stackId="a" />
                    <Bar dataKey="draws" name="Draws" fill="#64748b" stackId="a" />
                    <Bar dataKey="losses" name="Losses" fill="#ef4444" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {blackDefenses.slice(0, 10).map((op, idx) => {
                  // Safely calculate win rate, handling NaN/undefined cases
                  const winRate = typeof op.winRate === 'number' && !isNaN(op.winRate) ? op.winRate : 0;
                  const winPercent = (winRate * 100).toFixed(0);
                  // Ensure all counts are integers (round to nearest)
                  const totalGames = Math.round(op.totalGames || 0);
                  const wins = Math.round(op.wins || 0);
                  const draws = Math.round(op.draws || 0);
                  const losses = Math.round(op.losses || 0);
                  
                  return (
                    <div key={idx} className="flex justify-between items-center text-[10px] p-2 bg-slate-950 rounded border border-slate-800">
                      <span className="text-slate-300 font-bold">{op.name}</span>
                      <span className="text-slate-500 font-mono">
                        {totalGames} Games | {winPercent}% W ({wins}W/{draws}D/{losses}L)
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

        {/* Text Summaries - full width, 2 columns */}
        <div className="grid md:grid-cols-2 gap-8">
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-indigo-400">
              <BookOpen className="w-5 h-5" />
              White Repertoire Strategy
            </h3>
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 leading-relaxed text-slate-400 text-sm whitespace-pre-wrap">
              {(report.preparationSummary || '').replace(/\*\*/g, '')}
            </div>
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-indigo-400">
              <Target className="w-5 h-5" />
              Black Defensive Philosophy
            </h3>
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 leading-relaxed text-slate-400 text-sm whitespace-pre-wrap">
              {(report.blackStrategicSummary || "Detailed analysis of black repertoire pending...").replace(/\*\*/g, '')}
            </div>
          </section>
        </div>
      </div>


      {/* Analysis Board Section */}
      {report.games && report.games.length > 0 && (
        <section className="mt-8">
          <AnalysisBoard 
            games={report.games} 
            playerName={player.name}
            playerUsername={(player as any).actualUsername || player.platforms?.chessCom || player.platforms?.lichess || undefined}
          />
        </section>
      )}

      {/* Chat Section - At Bottom, Collapsed by Default */}
      <section className="mt-8" id="chat-section" style={{ scrollMarginTop: '0px' }}>
        <RepertoireChat report={report} />
      </section>
    </div>
  );
};

export default ReportDashboard;
