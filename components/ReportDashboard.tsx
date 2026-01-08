
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Shield, Target, Zap, Clock, TrendingUp, Download, Share2, AlertTriangle, CheckCircle, Crosshair, BookOpen, Search } from 'lucide-react';
import { ScoutingReport } from '../types';

interface ReportDashboardProps {
  report: ScoutingReport;
}

const ReportDashboard: React.FC<ReportDashboardProps> = ({ report }) => {
  const { player, whiteOpenings, blackDefenses } = report;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      {/* Dossier Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="h-44 bg-gradient-to-br from-indigo-900/40 via-slate-900 to-slate-950 relative p-10 flex flex-col justify-end">
          <div className="flex justify-between items-end">
            <div>
              <div className="flex items-center gap-3 text-indigo-400 font-bold text-xs uppercase tracking-[0.2em] mb-2">
                 <Shield className="w-4 h-4" />
                 Verified Tournament Profile
              </div>
              <h2 className="text-5xl font-serif font-bold tracking-tight text-white mb-2">{player.name}</h2>
              <div className="flex items-center gap-4 text-slate-400 font-medium">
                <span className="bg-slate-800 px-3 py-1 rounded text-sm text-indigo-300 border border-slate-700">
                  {player.titles?.join(', ') || 'Professional'}
                </span>
                <span>{player.country}</span>
                <div className="flex gap-4">
                  <span className="text-indigo-400 font-bold">FIDE: {player.currentRating || 'Unrated'}</span>
                  <span className="text-emerald-400 font-bold">USCF: {player.uscfRating || 'Unrated'}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mb-2">
               <button className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition-all border border-slate-700">
                 <Download className="w-5 h-5" />
               </button>
               <button className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-900/50">
                 Download Full Dossier
               </button>
            </div>
          </div>
        </div>
        <div className="py-8 px-10 grid grid-cols-4 gap-8 bg-slate-950/30 border-t border-slate-800">
           <div className="space-y-1">
             <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Intelligence ID</div>
             <div className="text-sm font-mono text-slate-400">#{report.id.slice(0, 8)}</div>
           </div>
           <div className="space-y-1">
             <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Chess.com Handle</div>
             <div className="text-sm font-semibold text-emerald-400">{player.platforms.chessCom || 'Not Found'}</div>
           </div>
           <div className="space-y-1">
             <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Lichess Handle</div>
             <div className="text-sm font-semibold text-indigo-400">{player.platforms.lichess || 'Not Found'}</div>
           </div>
           <div className="space-y-1">
             <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Analysis Integrity</div>
             <div className="text-sm font-bold text-indigo-500">{report.repertoireReliability}% Confidence</div>
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
                 White Opening (Playing 1.e4/d4)
               </h3>
               <div className="h-48 mb-6">
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={whiteOpenings}>
                     <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                     <XAxis dataKey="eco" stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} />
                     <YAxis hide />
                     <Tooltip 
                       cursor={{ fill: '#ffffff08' }}
                       contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                       itemStyle={{ color: '#818cf8' }}
                     />
                     <Bar dataKey="winRate" name="Win Rate %" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={30} />
                   </BarChart>
                 </ResponsiveContainer>
               </div>
               <div className="space-y-3">
                 {whiteOpenings.slice(0, 3).map((op, idx) => (
                   <div key={idx} className="flex justify-between items-center text-xs p-2 bg-slate-950 rounded border border-slate-800">
                     <span className="text-slate-300 font-bold">{op.name}</span>
                     <span className="text-indigo-400 font-mono">{(op.winRate * 100).toFixed(0)}% W</span>
                   </div>
                 ))}
               </div>
             </section>

             {/* Black Repertoire */}
             <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg flex flex-col">
               <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-white">
                 <Clock className="w-5 h-5 text-indigo-400" />
                 Black Defenses (Responding)
               </h3>
               <div className="space-y-5 flex-1">
                  {blackDefenses.map((def, idx) => (
                    <div key={idx} className="group cursor-default">
                      <div className="flex justify-between text-xs mb-2">
                        <span className="font-bold text-slate-200">{def.name} <span className="text-slate-500 ml-1">({def.eco})</span></span>
                        <span className="text-emerald-400 font-bold">{(def.winRate * 100).toFixed(0)}% Win</span>
                      </div>
                      <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div 
                          className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500" 
                          style={{ width: `${def.frequency * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
               </div>
             </section>
           </div>

           {/* Preparation Summary - Detailed Section */}
           <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg">
             <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
               <BookOpen className="w-5 h-5 text-indigo-400" />
               Detailed Preparation Summary
             </h3>
             <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 leading-relaxed text-slate-400 text-sm">
                {report.preparationSummary}
             </div>
           </section>
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
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg">
             <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-red-400">
               <AlertTriangle className="w-5 h-5" />
               Specific Vulnerability
             </h3>
             <div className="text-slate-300 space-y-4 text-sm leading-relaxed">
                <p className="p-4 bg-slate-950 rounded-xl border border-slate-800 italic">
                  "{report.specificVulnerability}"
                </p>
             </div>
          </section>
        </div>
      </div>

      {/* Suggested Preparation Lines - BOTTOM SECTION */}
      <section className="bg-slate-900 border-2 border-indigo-500/20 rounded-3xl p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
          <Search className="w-48 h-48 text-indigo-400" />
        </div>
        <h3 className="text-2xl font-serif font-bold mb-8 flex items-center gap-3">
          <Crosshair className="w-7 h-7 text-indigo-500" />
          Recommended Theoretical Counter-Lines
        </h3>
        <div className="grid md:grid-cols-3 gap-6">
          {report.suggestedLines?.map((line, idx) => (
            <div key={idx} className="bg-slate-950 p-6 rounded-2xl border border-slate-800 hover:border-indigo-500/40 transition-all group">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-bold text-xs">
                  {idx + 1}
                </div>
                <h4 className="text-sm font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">Refutation Path {idx + 1}</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed font-mono">
                {line}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-10 p-4 bg-slate-950/50 rounded-xl border border-slate-800/50 flex items-center gap-4 text-xs text-slate-500">
           <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
           Lines are generated based on Engine depth-30 analysis and historical win rate deviations for {player.name}.
        </div>
      </section>
    </div>
  );
};

export default ReportDashboard;
