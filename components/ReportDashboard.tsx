
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Shield, Target, Zap, Clock, TrendingUp, Download, Share2, AlertTriangle, CheckCircle, Crosshair, BookOpen, Search, Database, Loader2 } from 'lucide-react';
import { ScoutingReport } from '../types';

interface ReportDashboardProps {
  report: ScoutingReport;
  onSave?: (report: ScoutingReport) => Promise<void>;
  isSaved?: boolean;
}

const ReportDashboard: React.FC<ReportDashboardProps> = ({ report, onSave, isSaved: initiallySaved }) => {
  const [isSaving, setIsSaving] = React.useState(false);
  const [internalSaved, setInternalSaved] = React.useState(initiallySaved);
  const { player, whiteOpenings, blackDefenses } = report;

  const handleSave = async () => {
    if (!onSave || internalSaved) return;
    setIsSaving(true);
    try {
      await onSave(report);
      setInternalSaved(true);
    } catch (err) {
      console.error("Failed to save report:", err);
      alert("Failed to save report to history.");
    } finally {
      setIsSaving(false);
    }
  };

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
                  <span className="text-indigo-400 dark:text-indigo-400 text-indigo-600 font-bold">FIDE: {player.currentRating || 'Unrated'}</span>
                  <span className="text-emerald-400 dark:text-emerald-400 text-emerald-600 font-bold">USCF: {player.uscfRating || 'Unrated'}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mb-2">
              {onSave && (
                <button
                  onClick={handleSave}
                  disabled={internalSaved || isSaving}
                  className={`px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${internalSaved
                    ? 'bg-emerald-500/20 dark:bg-emerald-500/20 bg-emerald-50 text-emerald-400 dark:text-emerald-400 text-emerald-600 border border-emerald-500/30 dark:border-emerald-500/30 border-emerald-200'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-900/50 dark:shadow-indigo-900/50'
                    }`}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : internalSaved ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <Database className="w-4 h-4" />
                  )}
                  {internalSaved ? 'Saved to History' : 'Save to History'}
                </button>
              )}
              <button className="p-3 bg-slate-800 dark:bg-slate-800 bg-gray-100 hover:bg-slate-700 dark:hover:bg-slate-700 hover:bg-gray-200 rounded-xl text-slate-300 dark:text-slate-300 text-gray-600 transition-all border border-slate-700 dark:border-slate-700 border-gray-200">
                <Download className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
        <div className="py-8 px-10 grid grid-cols-4 gap-8 bg-slate-950/30 dark:bg-slate-950/30 bg-gray-50 border-t border-slate-800 dark:border-slate-800 border-gray-200">
          <div className="space-y-1">
            <div className="text-[10px] text-slate-500 dark:text-slate-500 text-gray-500 uppercase tracking-widest font-bold">Intelligence ID</div>
            <div className="text-sm font-mono text-slate-400 dark:text-slate-400 text-gray-600">#{report.id.slice(0, 8)}</div>
          </div>
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

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left/Middle Column */}
        <div className="lg:col-span-2 space-y-8">
          {/* Executive Summary */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-400" />
              Strategic Profile Analysis
            </h3>
            <div className="text-slate-300 space-y-4 leading-relaxed">
              <p className="text-lg font-medium">{report.strategicSummary}</p>

              <div className="grid md:grid-cols-2 gap-4 mt-8">
                <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl h-full">
                  <h4 className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-widest mb-4">
                    <CheckCircle className="w-4 h-4" /> Core Strengths
                  </h4>
                  <ul className="space-y-3 text-sm">
                    {report.strengths?.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-emerald-500/50 font-bold">•</span> {s}
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
                        <span className="text-red-500/50 font-bold">•</span> {w}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Repertoire Breakdown: White & Black */}
          <div className="grid md:grid-cols-2 gap-8">
            {/* White Opening Efficiency */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg flex flex-col">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-white">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
                White Repertoire (Primary Openings)
              </h3>
              <div className="h-56 mb-6">
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
                {whiteOpenings.slice(0, 4).map((op, idx) => {
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
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-white">
                <Clock className="w-5 h-5 text-indigo-400" />
                Black Repertoire (Defensive Systems)
              </h3>
              <div className="h-56 mb-6">
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
                {blackDefenses.slice(0, 4).map((op, idx) => {
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

          {/* Preparation Summaries */}
          <div className="grid md:grid-cols-2 gap-8">
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-indigo-400">
                <BookOpen className="w-5 h-5" />
                White Repertoire Strategy
              </h3>
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 leading-relaxed text-slate-400 text-sm">
                {report.preparationSummary}
              </div>
            </section>

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-indigo-400">
                <Target className="w-5 h-5" />
                Black Defensive Philosophy
              </h3>
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 leading-relaxed text-slate-400 text-sm">
                {report.blackStrategicSummary || "Detailed analysis of black repertoire pending..."}
              </div>
            </section>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-8">
          {/* Tactical Recommendation Section */}
          <section className="bg-indigo-600 border border-indigo-400 rounded-2xl p-8 shadow-xl shadow-indigo-900/20 relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-10">
              <Crosshair className="w-32 h-32 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
              <Zap className="w-5 h-5" />
              Tactical Recommendation
            </h3>
            <div className="text-indigo-50 text-sm leading-relaxed space-y-4">
              <p className="font-semibold">{report.tacticalRecommendation}</p>
              <div className="p-4 bg-white/10 rounded-xl border border-white/20">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-2">Target Profile: {player.name}</h4>
                <p className="text-xs italic opacity-80">Focus on the transition between late-middlegame and endgame where target accuracy deviates.</p>
              </div>
            </div>
          </section>

          {/* Specific Vulnerability Section */}
          <section className="bg-slate-900 dark:bg-slate-900 bg-white border border-slate-800 dark:border-slate-800 border-gray-200 rounded-2xl p-8 shadow-lg">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-red-400 dark:text-red-400 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Specific Vulnerability
            </h3>
            <div className="text-slate-300 dark:text-slate-300 text-gray-700 space-y-4 text-sm leading-relaxed">
              <p className="p-4 bg-slate-950 dark:bg-slate-950 bg-gray-50 rounded-xl border border-slate-800 dark:border-slate-800 border-gray-200 italic">
                "{report.specificVulnerability}"
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Most Played Lines Section */}
      <section className="bg-slate-900 dark:bg-slate-900 bg-white border border-slate-800 dark:border-slate-800 border-gray-200 rounded-3xl p-10 shadow-xl">
        <h3 className="text-2xl font-serif font-bold mb-8 flex items-center gap-3 text-white dark:text-white text-gray-900">
          <BookOpen className="w-7 h-7 text-indigo-500 dark:text-indigo-500 text-indigo-600" />
          Most Played Lines
        </h3>
        <div className="grid md:grid-cols-2 gap-8">
          {/* White Lines */}
          <div>
            <h4 className="text-lg font-bold mb-4 text-slate-300 dark:text-slate-300 text-gray-700 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-400" />
              White Pieces
            </h4>
            <div className="space-y-3">
              {report.mostPlayedLines?.white && report.mostPlayedLines.white.length > 0 ? (
                report.mostPlayedLines.white.map((sequence, idx) => (
                  <div key={idx} className="bg-slate-950 dark:bg-slate-950 bg-gray-50 p-4 rounded-xl border border-slate-800 dark:border-slate-800 border-gray-200">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-500">#{idx + 1}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-400 text-gray-600">
                        {sequence.games} games ({(sequence.frequency * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="font-mono text-sm text-slate-300 dark:text-slate-300 text-gray-700">
                      {sequence.moves.join(', ')}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-slate-500 dark:text-slate-500 text-gray-500 text-sm italic">No white games analyzed</div>
              )}
            </div>
          </div>
          
          {/* Black Lines */}
          <div>
            <h4 className="text-lg font-bold mb-4 text-slate-300 dark:text-slate-300 text-gray-700 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400" />
              Black Pieces
            </h4>
            <div className="space-y-3">
              {report.mostPlayedLines?.black && report.mostPlayedLines.black.length > 0 ? (
                report.mostPlayedLines.black.map((sequence, idx) => (
                  <div key={idx} className="bg-slate-950 dark:bg-slate-950 bg-gray-50 p-4 rounded-xl border border-slate-800 dark:border-slate-800 border-gray-200">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-500">#{idx + 1}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-400 text-gray-600">
                        {sequence.games} games ({(sequence.frequency * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="font-mono text-sm text-slate-300 dark:text-slate-300 text-gray-700">
                      {sequence.moves.join(', ')}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-slate-500 dark:text-slate-500 text-gray-500 text-sm italic">No black games analyzed</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Suggested Preparation Lines - BOTTOM SECTION */}
      <section className="bg-slate-900 dark:bg-slate-900 bg-white border-2 border-indigo-500/20 dark:border-indigo-500/20 border-indigo-100 rounded-3xl p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
          <Search className="w-48 h-48 text-indigo-400 dark:text-indigo-400 text-indigo-600" />
        </div>
        <h3 className="text-2xl font-serif font-bold mb-8 flex items-center gap-3 text-white dark:text-white text-gray-900">
          <Crosshair className="w-7 h-7 text-indigo-500 dark:text-indigo-500 text-indigo-600" />
          Recommended Theoretical Counter-Lines
        </h3>
        <div className="grid md:grid-cols-3 gap-6">
          {report.suggestedLines?.map((line, idx) => (
            <div key={idx} className="bg-slate-950 dark:bg-slate-950 bg-gray-50 p-6 rounded-2xl border border-slate-800 dark:border-slate-800 border-gray-200 hover:border-indigo-500/40 dark:hover:border-indigo-500/40 hover:border-indigo-600 transition-all group">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-indigo-500/10 dark:bg-indigo-500/10 bg-indigo-100 flex items-center justify-center text-indigo-400 dark:text-indigo-400 text-indigo-600 font-bold text-xs">
                  {idx + 1}
                </div>
                <h4 className="text-sm font-bold text-slate-200 dark:text-slate-200 text-gray-800 group-hover:text-indigo-400 dark:group-hover:text-indigo-400 group-hover:text-indigo-600 transition-colors">Refutation Path {idx + 1}</h4>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-400 text-gray-600 leading-relaxed font-mono">
                {line}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-10 p-4 bg-slate-950/50 dark:bg-slate-950/50 bg-gray-100/50 rounded-xl border border-slate-800/50 dark:border-slate-800/50 border-gray-200/50 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-500 text-gray-500">
          <div className="w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-500 bg-indigo-600 animate-pulse"></div>
          Lines are generated based on Engine depth-30 analysis and historical win rate deviations for {player.name}.
        </div>
      </section>
    </div>
  );
};

export default ReportDashboard;
