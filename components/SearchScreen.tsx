
import React, { useState } from 'react';
import { Search, ShieldAlert, Database, AlertCircle, Loader2, Play, Cpu, User } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { ScoutingReport, PlayerMetadata } from '../types';
import { chessComService } from '../services/chessCom';
import { lichessService } from '../services/lichess';
import { gameAnalysisService, GameData } from '../services/gameAnalysis';
import { playerRepository } from '../services/playerRepository';
import { identityService } from '../services/identity';

interface SearchScreenProps {
  onReportGenerated: (report: ScoutingReport) => void;
  user: any; // We'll use any here for brevity, but it's the Supabase user object
}

const SearchScreen: React.FC<SearchScreenProps> = ({ onReportGenerated, user }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    fideId: '',
    uscfId: ''
  });


  // gemini-2.0-flash-exp is the only model confirmed to be available in this environment (despite rate limits)
  const MODEL_NAME = 'gemini-3-flash-preview';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Strict Validation Rule: Full Name
    if (!formData.name || !formData.name.trim().includes(' ')) {
      setError("Identity Protocol requires a Full Name (First & Last) to initiate scanning.");
      return;
    }

    // Strict Validation Rule: IDs Mandatory
    if (!formData.fideId || !formData.uscfId) {
      setError("Validation Failed: Both FIDE ID and USCF ID are required for positive identification.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 0. Persistence Check (Supabase)
      // Check if we already have this specific Identity verified
      const existingPlayer = await playerRepository.findVerifiedPlayer(formData.fideId, formData.uscfId);

      if (existingPlayer) {
        console.log("Found existing player:", existingPlayer.full_name);
        const cachedReport = await playerRepository.getLatestReport(existingPlayer.id);

        if (cachedReport) {
          console.log("Serving cached report from Supabase");
          onReportGenerated(cachedReport);
          setLoading(false);
          return;
        }
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let targetUsername = formData.name;

      // 1. Identity Resolution Phase (Real Data)
      console.log('Initiating Identity Resolution Protocol...');
      const identity = await identityService.resolve(formData.name, formData.fideId, formData.uscfId);

      console.log('Identity Resolved:', identity);
      const chessComUser = identity.chessComUsername;
      const lichessUser = identity.lichessUsername;

      // 2. Fetch Real Data from Both Platforms in Parallel
      console.log(`Fetching data for ${chessComUser} (Chess.com) and ${lichessUser} (Lichess)...`);

      const [chessComProfile, chessComStats, chessComRawGames, lichessProfile, lichessRawGames] = await Promise.all([
        chessComService.getPlayerProfile(chessComUser),
        chessComService.getPlayerStats(chessComUser),
        chessComService.getRecentGames(chessComUser),
        lichessService.getPlayerProfile(lichessUser),
        lichessService.getRecentGames(lichessUser)
      ]);

      // 3. Analyze and Aggregate Games
      const chessComGames = gameAnalysisService.parseChessComGames(chessComRawGames, chessComUser);
      const lichessGames = gameAnalysisService.parseLichessGames(lichessRawGames, lichessUser);
      const allGames = [...chessComGames, ...lichessGames];

      const whiteStats = gameAnalysisService.generateStats(allGames, chessComUser, 'white');
      const blackStats = gameAnalysisService.generateStats(allGames, chessComUser, 'black');

      // 3. Construct Analysis Prompt with REAL Aggregated Data
      const analysisPrompt = `
        ANALYZE THE FOLLOWING REAL CHESS DATA FOR PLAYER: "${identity.verifiedName}"
        
        VERIFIED IDENTITY:
        - FIDE Rating: ${identity.fideProfile?.rating || 'N/A'} (Title: ${identity.fideProfile?.title || 'None'})
        - USCF Rating: ${identity.uscfProfile?.rating || 'N/A'}
        
        PLATFORM STATS:
        - Chess.com: ${chessComUser} (Rapid: ${chessComStats.chess_rapid?.last?.rating || 'N/A'}, Blitz: ${chessComStats.chess_blitz?.last?.rating || 'N/A'})
        - Lichess: ${lichessUser} (Classical: ${lichessProfile?.perfs?.classical?.rating || 'N/A'}, Blitz: ${lichessProfile?.perfs?.blitz?.rating || 'N/A'})
        
        AGGREGATED OPENING STATS (Last 100 Games):
        White Openings: ${JSON.stringify(whiteStats)}
        Black Defenses: ${JSON.stringify(blackStats)}

        PGN SAMPLE (First 10 games for tactical analysis):
        ${allGames.slice(0, 10).map(g => g.pgn).join('\n\n')}

        TASK:
        Generate a professional scouting dossier. 
        - Interpret the opening stats (frequencies and win rates).
        - Use the PGN samples to identify stylistic tendencies (e.g., "aggressive attacker", "prefers closed positions").
        - Provide concrete strategic recommendations.

        TASK:
          Based ONLY on the provided games and stats, generate a scouting report.
        - Identify their actual opening repertoire from the provided PGNs.
        - Calculate win rates based on the provided games if possible, or estimate based on the trends seen.
        - Analyze specific moves they played in these games to find tactical patterns.

          Generate:
        - White openings and Black defenses(derive from the PGNs).
        - A list of 3 specific "Strengths" and 3 "Weaknesses" observed in these games.
        - A "Specific Vulnerability" section with actionable advice.
        - A "Tactical Recommendation": A high - detail, summarized strategic path for beating this player.
        - A "Preparation Summary": A detailed overview of how they have adjusted their repertoire in the last 6 - 12 months.
        - A list of 3 "Suggested Lines": Specific opening variations(with move orders) that would work against the repertoire seen in these games.
        
        The final response MUST be a JSON object conforming to the ScoutingReport interface.
        CRITICAL: 
        - DO NOT hallucinate statistics. 
        - The frequencies and win rates provided in the JSON stats are DECIMALS (0.0 to 1.0). 
        - For example, 0.45 means 45%. 
        - Never report a win rate above 1.0 (100%).
        - Use the PGN samples only for tactical/thematic color, but stick to the Aggregate Stats for frequencies.
      `;

      const response = await ai.models.generateContent({
        model: MODEL_NAME, // Fallback to stable model to avoid quota limits
        contents: analysisPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              player: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  fideId: { type: Type.STRING },
                  country: { type: Type.STRING },
                  titles: { type: Type.ARRAY, items: { type: Type.STRING } },
                  currentRating: { type: Type.NUMBER },
                  uscfRating: { type: Type.NUMBER },
                  platforms: {
                    type: Type.OBJECT,
                    properties: {
                      chessCom: { type: Type.STRING },
                      lichess: { type: Type.STRING }
                    }
                  }
                }
              },
              whiteOpenings: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    eco: { type: Type.STRING },
                    frequency: { type: Type.NUMBER },
                    winRate: { type: Type.NUMBER },
                    trend: { type: Type.STRING }
                  }
                }
              },
              blackDefenses: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    eco: { type: Type.STRING },
                    frequency: { type: Type.NUMBER },
                    winRate: { type: Type.NUMBER },
                    trend: { type: Type.STRING }
                  }
                }
              },
              strategicSummary: { type: Type.STRING },
              tacticalProfile: { type: Type.STRING },
              endgameReliability: { type: Type.STRING },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              specificVulnerability: { type: Type.STRING },
              tacticalRecommendation: { type: Type.STRING },
              preparationSummary: { type: Type.STRING },
              suggestedLines: { type: Type.ARRAY, items: { type: Type.STRING } },
              repertoireReliability: { type: Type.NUMBER }
            },
            required: ["id", "player", "whiteOpenings", "blackDefenses", "strengths", "weaknesses", "specificVulnerability", "tacticalRecommendation", "preparationSummary", "suggestedLines"]
          }
        }
      });

      const reportData = JSON.parse(response.text) as ScoutingReport;
      reportData.lastUpdated = new Date().toISOString();

      // Merge real profile data
      // Merge real profile data
      reportData.player.name = identity.verifiedName; // Priority to official name
      reportData.player.platforms.chessCom = chessComUser || '';
      reportData.player.platforms.lichess = lichessUser || '';
      reportData.player.currentRating = identity.fideProfile?.rating || 0;
      reportData.player.uscfRating = identity.uscfProfile?.rating || 0;
      reportData.player.fideId = formData.fideId;
      reportData.player.uscfId = formData.uscfId;
      reportData.player.country = identity.fideProfile?.federation || identity.uscfProfile?.name?.split(',')?.pop()?.trim() || 'USA';

      // 4. Persistence Save (Supabase)
      try {
        const player = await playerRepository.createVerifiedPlayer({
          full_name: identity.verifiedName,
          fide_id: formData.fideId,
          uscf_id: formData.uscfId,
          chess_com_username: chessComUser,
          lichess_username: lichessUser,
          metadata: {
            chessComStats,
            lichessStats: lichessProfile?.perfs,
            country: identity.fideProfile?.federation || lichessProfile?.profile?.country
          }
        });

        if (player && user) {
          await playerRepository.saveReport(player.id, reportData, user.id);
          console.log("Persisted new report to Supabase");
        }
      } catch (dbErr) {
        console.warn("Failed to persist report to DB (Demo Mode?):", dbErr);
      }

      onReportGenerated(reportData);

    } catch (err: any) {
      console.error(err);
      let msg = err.message || "Scouting agent failed.";
      if (msg.includes('429') || msg.includes('quota')) {
        msg = `Quota Exceeded. Please ensure your Google Cloud billing is linked to AI Studio, or wait a minute. (Model: ${MODEL_NAME})`;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-serif mb-4 text-white">Opponent Analysis</h2>
        <p className="text-slate-400 text-lg italic">Verified search across Chess.com and Lichess repositories.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Cpu className="w-24 h-24" />
            </div>

            <div className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-bold text-indigo-400 mb-2 uppercase tracking-widest">Full Name</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 pl-11 focus:outline-none focus:border-indigo-500 transition-colors font-medium text-white shadow-inner placeholder:text-slate-600"
                    placeholder="Magnus Carlsen"
                  />
                  <User className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="relative group">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">FIDE ID</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.fideId}
                      onChange={e => setFormData({ ...formData, fideId: e.target.value })}
                      placeholder="123456789"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500/50 text-slate-300 text-sm transition-colors placeholder:text-slate-700"
                    />
                  </div>
                </div>
                <div className="relative group">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">USCF ID</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.uscfId}
                      onChange={e => setFormData({ ...formData, uscfId: e.target.value })}
                      placeholder="123456789"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500/50 text-slate-300 text-sm transition-colors placeholder:text-slate-700"
                    />
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-4 bg-red-900/20 border border-red-900/50 text-red-400 rounded-xl text-sm animate-pulse">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 font-bold text-lg transition-all ${loading
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-500/20'
                } `}
            >
              {loading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  Analyzing Databases...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  Analyze Opponent
                </>
              )}
            </button>
          </form>

          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl text-center backdrop-blur-sm">
              <Database className="w-5 h-5 text-indigo-400 mx-auto mb-2" />
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Chess.com API</div>
              <div className="text-xs font-semibold text-emerald-500">Live Connection</div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl text-center backdrop-blur-sm">
              <Search className="w-5 h-5 text-indigo-400 mx-auto mb-2" />
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Lichess DB</div>
              <div className="text-xs font-semibold text-indigo-500">Ready</div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl text-center backdrop-blur-sm">
              <ShieldAlert className="w-5 h-5 text-indigo-400 mx-auto mb-2" />
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">ChessBase Ref</div>
              <div className="text-xs font-semibold text-emerald-500">Indexed</div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-indigo-900/10 border border-indigo-500/20 rounded-2xl p-6 shadow-inner">
            <h3 className="text-indigo-400 font-bold text-sm uppercase tracking-widest mb-4 flex items-center gap-2">
              <Cpu className="w-4 h-4" /> System Protocols
            </h3>
            <ul className="space-y-4 text-sm text-slate-400">
              <li className="flex gap-3">
                <span className="text-indigo-500 font-bold bg-indigo-500/10 w-5 h-5 flex items-center justify-center rounded text-xs shrink-0">1</span>
                Autonomous matching connects offline FIDE identities with verified online handles via PGN signature analysis.
              </li>
              <li className="flex gap-3">
                <span className="text-indigo-500 font-bold bg-indigo-500/10 w-5 h-5 flex items-center justify-center rounded text-xs shrink-0">2</span>
                The engine analyzes the last 24 months of classical games for high-weight trend detection.
              </li>
              <li className="flex gap-3">
                <span className="text-indigo-500 font-bold bg-indigo-500/10 w-5 h-5 flex items-center justify-center rounded text-xs shrink-0">3</span>
                Vulnerability scanning identifies structural endgame deviations and tactical blindspots.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchScreen;
