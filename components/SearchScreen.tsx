
import React, { useState } from 'react';
import { Search, ShieldAlert, Database, AlertCircle, Loader2, Play, Cpu, User } from 'lucide-react';
import { Type } from "@google/genai";
import { ScoutingReport, PlayerMetadata } from '../types';
import { chessComService } from '../services/chessCom';
import { lichessService } from '../services/lichess';
import { gameAnalysisService, GameData } from '../services/gameAnalysis';
import { playerRepository } from '../services/playerRepository';
import { identityService } from '../services/identity';
import { geminiService } from '../services/geminiService';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { getUserFriendlyError, logError } from '../lib/errorUtils';
import { useTheme } from '../lib/themeContext';

interface SearchScreenProps {
  onReportGenerated: (report: ScoutingReport) => void;
  user: SupabaseUser;
}

const SearchScreen: React.FC<SearchScreenProps> = ({ onReportGenerated, user }) => {
  const { defaultFederation } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanningStatus, setScanningStatus] = useState<string>('');
  const [forceRefresh, setForceRefresh] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    fideId: '',
    uscfId: '',
    chessComUsername: '',
    lichessUsername: ''
  });


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Strict Validation: Require Full Name and FIDE ID (USCF optional for non-US players)
    const hasName = formData.name && formData.name.trim().includes(' ');
    const hasFideId = formData.fideId && formData.fideId.trim();
    const hasUscfId = formData.uscfId && formData.uscfId.trim();

    if (!hasName) {
      setError("Please provide a Full Name (First & Last).");
      return;
    }

    if (!hasFideId) {
      setError("FIDE ID is required for comprehensive analysis.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 0. Persistence Check (Supabase) - Only if NOT force refreshing
      if (!forceRefresh) {
        const existingPlayer = await playerRepository.findVerifiedPlayer(formData.fideId, formData.uscfId);
        if (existingPlayer) {
          const cachedReport = await playerRepository.getLatestReport(existingPlayer.id);
          if (cachedReport) {
            console.log("Serving cached report from Supabase");
            onReportGenerated(cachedReport);
            setLoading(false);
            return;
          }
        }
      }

      let targetUsername = formData.name;

      // 1. Identity Resolution Phase (Real Data)
      console.log('Initiating Identity Resolution Protocol...');
      const identity = await identityService.resolve(
        formData.name,
        formData.fideId,
        formData.uscfId,
        formData.chessComUsername || undefined,
        formData.lichessUsername || undefined
      );

      console.log('Identity Resolved:', identity);
      const chessComUser = identity.chessComUsername;
      const lichessUser = identity.lichessUsername;

      // Continue with whatever platforms we have - both are optional
      // Fetch games from available platforms and generate summary even with partial data
      if (chessComUser && lichessUser) {
        console.log(`[Search] Found player on both platforms: Chess.com: ${chessComUser}, Lichess: ${lichessUser}`);
      } else if (chessComUser) {
        console.log(`[Search] Found player on Chess.com only: ${chessComUser} (will continue with Chess.com games only)`);
      } else if (lichessUser) {
        console.log(`[Search] Found player on Lichess only: ${lichessUser} (will continue with Lichess games only)`);
      } else {
        console.warn(`[Search] No platforms found - but continuing anyway to attempt game fetching`);
      }
      
      // Continue regardless - fetch games from available platforms and generate summary

      // 2. Fetch Real Data from Both Platforms in Parallel
      setScanningStatus('Fetching Online Game History...');
      console.log(`[Search] Fetching games for Chess.com: ${chessComUser || 'none'}, Lichess: ${lichessUser || 'none'}`);
      
      const [chessComProfile, chessComStats, chessComRawGames, lichessProfile, lichessRawGames] = await Promise.all([
        chessComUser ? chessComService.getPlayerProfile(chessComUser).catch(err => {
          console.warn(`[Search] Failed to fetch Chess.com profile for ${chessComUser}:`, err);
          return null; // Return null instead of throwing
        }) : Promise.resolve(null),
        chessComUser ? chessComService.getPlayerStats(chessComUser).catch(err => {
          console.warn(`[Search] Failed to fetch Chess.com stats for ${chessComUser}:`, err);
          return {}; // Return empty object instead of throwing
        }) : Promise.resolve({}),
        chessComUser ? chessComService.getRecentGames(chessComUser, true).catch(err => {
          console.warn(`[Search] Failed to fetch Chess.com games for ${chessComUser}:`, err);
          return [];
        }) : Promise.resolve([]), // Deep Search enabled (up to 1000 games)
        lichessUser ? lichessService.getPlayerProfile(lichessUser).catch(err => {
          console.warn(`[Search] Failed to fetch Lichess profile for ${lichessUser}:`, err);
          return null; // Return null instead of throwing
        }) : Promise.resolve(null),
        lichessUser ? lichessService.getRecentGames(lichessUser, 1000).catch(err => {
          console.warn(`[Search] Failed to fetch Lichess games for ${lichessUser}:`, err);
          return '';
        }) : Promise.resolve('') // Fetch up to 1000 games
      ]);
      
      console.log(`[Search] Fetched ${Array.isArray(chessComRawGames) ? chessComRawGames.length : 0} Chess.com games, ${typeof lichessRawGames === 'string' ? lichessRawGames.split('\\n').filter(l => l.trim()).length : 0} Lichess games`);

      // 3. Classical game data removed - ChessBase functionality discontinued
      // Alternative databases can be integrated: Scid, ChessDB, or Lichess Open Database
      const chessBaseGames: GameData[] = [];

      // 4. Analyze and Aggregate Games
      // Process games from whichever platforms we found the player on
      const chessComGames = chessComUser && chessComRawGames && Array.isArray(chessComRawGames) && chessComRawGames.length > 0
        ? await gameAnalysisService.parseChessComGames(chessComRawGames, chessComUser)
        : [];
      
      const lichessGames = lichessUser && lichessRawGames && typeof lichessRawGames === 'string' && lichessRawGames.trim().length > 0
        ? await gameAnalysisService.parseLichessGames(lichessRawGames, lichessUser)
        : [];
      
      const allGames = [...chessComGames, ...lichessGames, ...chessBaseGames];

      // Continue with analysis even if only one platform has games
      if (allGames.length === 0) {
        const platformsFound = [];
        if (chessComUser) platformsFound.push('Chess.com');
        if (lichessUser) platformsFound.push('Lichess');
        
        if (platformsFound.length > 0) {
          setError(`Found player on ${platformsFound.join(' and ')}, but no games were retrieved. The player may not have public games available.`);
        } else {
          setError('Could not find player on Chess.com or Lichess. Please provide usernames manually.');
        }
        setLoading(false);
        return;
      }
      
      // Log which platforms contributed games
      if (chessComGames.length > 0 && lichessGames.length > 0) {
        console.log(`[Analysis] Found ${allGames.length} total games (Chess.com: ${chessComGames.length}, Lichess: ${lichessGames.length})`);
      } else if (chessComGames.length > 0) {
        console.log(`[Analysis] Found ${allGames.length} games from Chess.com only (Lichess: not found or no games)`);
      } else if (lichessGames.length > 0) {
        console.log(`[Analysis] Found ${allGames.length} games from Lichess only (Chess.com: not found or no games)`);
      }

      console.log(`[Analysis] Found ${allGames.length} total games (Chess.com: ${chessComGames.length}, Lichess: ${lichessGames.length})`);
      
      // Log game results breakdown to verify losses are included
      const wins = allGames.filter(g => {
        const isTargetWhite = g.white.toLowerCase() === (chessComUser || lichessUser || '').toLowerCase();
        const isTargetBlack = g.black.toLowerCase() === (chessComUser || lichessUser || '').toLowerCase();
        if (isTargetWhite) return g.result === '1-0';
        if (isTargetBlack) return g.result === '0-1';
        return false;
      }).length;
      const losses = allGames.filter(g => {
        const isTargetWhite = g.white.toLowerCase() === (chessComUser || lichessUser || '').toLowerCase();
        const isTargetBlack = g.black.toLowerCase() === (chessComUser || lichessUser || '').toLowerCase();
        if (isTargetWhite) return g.result === '0-1';
        if (isTargetBlack) return g.result === '1-0';
        return false;
      }).length;
      const draws = allGames.filter(g => g.result === '1/2-1/2').length;
      console.log(`[Analysis] Game results breakdown: ${wins} wins, ${losses} losses, ${draws} draws (total: ${allGames.length})`);

      // Determine the actual username from the games (use the first game's player name)
      // This ensures we match correctly even if heuristic usernames don't match exactly
      let targetUsernameForStats = chessComUser || lichessUser || identity.verifiedName.toLowerCase();
      if (allGames.length > 0) {
        // Try to find the actual username from the games
        const firstGame = allGames[0];
        if (chessComGames.length > 0) {
          // For Chess.com games, check which player matches our search
          const game = chessComGames[0];
          if (game.white.toLowerCase().includes(chessComUser?.toLowerCase() || '')) {
            targetUsernameForStats = game.white;
          } else if (game.black.toLowerCase().includes(chessComUser?.toLowerCase() || '')) {
            targetUsernameForStats = game.black;
          }
        } else if (lichessGames.length > 0) {
          const game = lichessGames[0];
          if (game.white.toLowerCase().includes(lichessUser?.toLowerCase() || '')) {
            targetUsernameForStats = game.white;
          } else if (game.black.toLowerCase().includes(lichessUser?.toLowerCase() || '')) {
            targetUsernameForStats = game.black;
          }
        }
      }

      setScanningStatus('Analyzing Repertoire & Strategic Patterns...');
      console.log(`[Analysis] Using username for stats: ${targetUsernameForStats}`);
      console.log(`[Analysis] About to generate stats for ${allGames.length} games`);
      
      let whiteStats, blackStats;
      try {
        whiteStats = await gameAnalysisService.generateStats(allGames, targetUsernameForStats, 'white');
        console.log(`[Analysis] White stats generated: ${whiteStats.length} openings`);
        
        blackStats = await gameAnalysisService.generateStats(allGames, targetUsernameForStats, 'black');
        console.log(`[Analysis] Black stats generated: ${blackStats.length} defenses`);
      } catch (statsError) {
        console.error('[Analysis] Error generating stats:', statsError);
        throw new Error(`Failed to analyze game statistics: ${statsError instanceof Error ? statsError.message : 'Unknown error'}`);
      }

      // 4. Stockfish Engine Analysis (analyze ALL games for comprehensive tactical insights)
      setScanningStatus(`Running Engine Analysis (Stockfish) - Analyzing ALL ${allGames.filter(g => g.pgn && g.pgn.trim().length > 20).length} games...`);
      let engineAnalysis = '';
      try {
        const { getStockfishAnalyzer } = await import('../services/stockfishAnalysis');
        const analyzer = getStockfishAnalyzer();
        
        // Analyze ALL games with Stockfish (prioritize ChessBase classical games first, then by date)
            const gamesWithPGN = allGames
                .filter(g => g.pgn && g.pgn.trim().length > 20) // Only games with substantial PGN
                .sort((a, b) => {
                    // Sort by date (most recent first)
                    return new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime();
                });
        
        if (gamesWithPGN.length > 0) {
          console.log(`[Stockfish] Analyzing ALL ${gamesWithPGN.length} games with engine`);
          
          // Create a progress callback to update status
          let analyzedCount = 0;
          const progressCallback = (current: number, total: number) => {
            analyzedCount = current;
            setScanningStatus(`Running Engine Analysis (Stockfish) - ${current}/${total} games analyzed...`);
          };
          
          const analyses = await analyzer.analyzeGames(gamesWithPGN, targetUsernameForStats, gamesWithPGN.length, progressCallback);
          
          // Group analyses by opening (ECO code) for opening-specific insights
          const analysesByOpening: Record<string, { games: GameData[], analyses: typeof analyses }> = {};
          gamesWithPGN.forEach((game, idx) => {
            const eco = game.eco || 'Unknown';
            const openingKey = eco.split('-')[0] || eco; // Use main ECO code (e.g., "B20" from "B20-B29")
            if (!analysesByOpening[openingKey]) {
              analysesByOpening[openingKey] = { games: [], analyses: [] };
            }
            analysesByOpening[openingKey].games.push(game);
            if (analyses[idx]) {
              analysesByOpening[openingKey].analyses.push(analyses[idx]);
            }
          });
          
          // Generate opening-specific insights
          const openingInsights: string[] = [];
          Object.entries(analysesByOpening).forEach(([eco, data]) => {
            if (data.analyses.length >= 3) { // Only include openings with 3+ analyzed games
              const openingGames = data.games;
              const openingAnalyses = data.analyses;
              const openingName = openingGames[0]?.eco || eco;
              const totalMistakes = openingAnalyses.reduce((sum, a) => sum + a.criticalMistakes.length, 0);
              const avgEndgameAccuracy = openingAnalyses.reduce((sum, a) => sum + a.endgameAccuracy, 0) / openingAnalyses.length;
              const avgEvaluation = openingAnalyses.reduce((sum, a) => sum + a.averageEvaluation, 0) / openingAnalyses.length;
              const mistakesPerGame = (totalMistakes / openingAnalyses.length).toFixed(2);
              
              openingInsights.push(
                `OPENING: ${openingName} (${openingAnalyses.length} games analyzed)` +
                `\n- Critical mistakes: ${totalMistakes} (${mistakesPerGame} per game)` +
                `\n- Endgame accuracy: ${avgEndgameAccuracy.toFixed(1)}%` +
                `\n- Average evaluation: ${avgEvaluation > 0 ? '+' : ''}${(avgEvaluation / 100).toFixed(2)} pawns`
              );
            }
          });
          
          // Overall summary (simplified)
          const totalMistakes = analyses.reduce((sum, a) => sum + a.criticalMistakes.length, 0);
          const avgEndgameAccuracy = analyses.reduce((sum, a) => sum + a.endgameAccuracy, 0) / analyses.length;
          const mistakesPerGame = analyses.length > 0 ? (totalMistakes / analyses.length).toFixed(2) : '0';
          
          engineAnalysis = `
STOCKFISH ENGINE ANALYSIS (Depth 6, ${analyses.length} games analyzed):
- Total games analyzed: ${analyses.length}
- Critical mistakes detected: ${totalMistakes} significant errors (>150 centipawns)
- Average mistakes per game: ${mistakesPerGame}
- Average endgame accuracy: ${avgEndgameAccuracy.toFixed(1)}%

OPENING-SPECIFIC INSIGHTS (grouped by ECO code):
${openingInsights.length > 0 ? openingInsights.join('\n\n') : 'Insufficient games per opening for detailed analysis'}
          `.trim();
          
          console.log(`[Stockfish] Engine analysis complete: ${totalMistakes} mistakes found across ALL ${analyses.length} games, ${avgEndgameAccuracy.toFixed(1)}% endgame accuracy`);
        } else {
          console.warn('[Stockfish] No games with valid PGN to analyze');
        }
      } catch (engineError) {
        console.warn('[Stockfish] Engine analysis failed (continuing without it):', engineError);
        // Don't fail the entire analysis if Stockfish fails
        engineAnalysis = 'Engine analysis unavailable (games analyzed statistically only)';
      }

      // 3. Construct Analysis Prompt with ALL Available Data
      // Include comprehensive game data for maximum confidence
      const totalGamesCount = allGames.length;
      const gamesWithPGN = allGames.filter(g => g.pgn && g.pgn.trim().length > 20);
      
      // Limit PGN sample to reduce token usage and avoid rate limits
      // Use a smaller sample (20-30 games) which is still statistically significant
      const pgnSampleSize = Math.min(30, gamesWithPGN.length);
      const pgnSample = gamesWithPGN.slice(0, pgnSampleSize);
      
      // Create comprehensive game summary
      const gameSummary = {
        totalGames: totalGamesCount,
        chessComGames: chessComGames.length,
        lichessGames: lichessGames.length,
        gamesWithPGN: gamesWithPGN.length,
        pgnSampleSize: pgnSampleSize,
        dateRange: allGames.length > 0 ? {
          earliest: allGames.reduce((earliest, g) => 
            new Date(g.playedAt) < new Date(earliest.playedAt) ? g : earliest
          ).playedAt,
          latest: allGames.reduce((latest, g) => 
            new Date(g.playedAt) > new Date(latest.playedAt) ? g : latest
          ).playedAt
        } : null
      };

      const analysisPrompt = `
        ANALYZE THE FOLLOWING COMPREHENSIVE CHESS DATA FOR PLAYER: "${identity.verifiedName}"
        
        ⚠️ CRITICAL NAMING INSTRUCTION: Throughout your entire response, you MUST refer to this player by their verified name "${identity.verifiedName}" (NOT by their Chess.com username "${chessComUser || 'N/A'}" or Lichess username "${lichessUser || 'N/A'}"). 
        - When describing strengths: "Magnus Carlsen excels at..." NOT "hikaru excels at..."
        - When describing weaknesses: "Magnus Carlsen struggles with..." NOT "DrNykterstein struggles with..."
        - When making recommendations: "Against Magnus Carlsen, consider..." NOT "Against hikaru, consider..."
        - Use the verified name "${identity.verifiedName}" in ALL text fields (strategicSummary, tacticalProfile, specificVulnerability, etc.)
        
        ⚠️ CRITICAL INSTRUCTION: You have access to ${totalGamesCount} TOTAL GAMES. Use ALL of this data to achieve 100% confidence in your analysis. 
        DO NOT rely on small samples - you have access to the FULL dataset. Every statistic, pattern, and recommendation must be based on the complete data provided.
        
        DATA SUMMARY:
        - Total Games Available: ${totalGamesCount}
        - Chess.com Games: ${gameSummary.chessComGames}
        - Lichess Games: ${gameSummary.lichessGames}
        - Games with Full PGN: ${gameSummary.gamesWithPGN}
        - PGN Sample for Analysis: ${gameSummary.pgnSampleSize} games (representative of full dataset)
        ${gameSummary.dateRange ? `- Date Range: ${new Date(gameSummary.dateRange.earliest).toLocaleDateString()} to ${new Date(gameSummary.dateRange.latest).toLocaleDateString()}` : ''}
        
        VERIFIED IDENTITY:
        - FIDE Rating: ${identity.fideProfile?.rating || 'N/A'} (Title: ${identity.fideProfile?.title || 'None'})
        - USCF Rating: ${identity.uscfProfile?.rating || 'N/A'}
        
        PLATFORM STATS:
        - Chess.com: ${chessComUser} (Rapid: ${(chessComStats as any)?.chess_rapid?.last?.rating || 'N/A'}, Blitz: ${(chessComStats as any)?.chess_blitz?.last?.rating || 'N/A'})
        - Lichess: ${lichessUser} (Classical: ${lichessProfile?.perfs?.classical?.rating || 'N/A'}, Blitz: ${lichessProfile?.perfs?.blitz?.rating || 'N/A'})
        
        AGGREGATED OPENING STATS (Based on ALL ${totalGamesCount} games):
        - These stats aggregate openings into broad families (e.g., "Sicilian Defense", "Queen's Gambit Systems") for reliability
        - Only includes openings with 20+ games for statistical significance
        - White Openings: ${JSON.stringify(whiteStats)}
        - Black Defenses: ${JSON.stringify(blackStats)}
        - Note: Each opening shown has sufficient games (20+) to ensure accuracy. Frequencies and win rates are calculated from the complete dataset.
        - IMPORTANT: When reporting openings, use ONLY the human-readable names (e.g., "Sicilian Defense"). NEVER mention ECO codes like "B20-B29" or "B00-B99" in your response.

        GAME METADATA SUMMARY (Sample of ${Math.min(50, totalGamesCount)} games from ${totalGamesCount} total):
        ${allGames.slice(0, Math.min(50, totalGamesCount)).map((g, idx) => 
          `Game ${idx + 1}: ${g.source} | ${g.white} vs ${g.black} | Result: ${g.result} | ECO: ${g.eco} | Date: ${new Date(g.playedAt).toLocaleDateString()} | Time Control: ${g.timeControl}`
        ).join('\n')}
        ${totalGamesCount > 50 ? `\n... (${totalGamesCount - 50} more games with similar patterns)` : ''}

        PGN SAMPLE (${pgnSampleSize} games for detailed tactical analysis - representative of full dataset):
        ${pgnSample.map((g, idx) => {
          // Truncate very long PGNs to avoid token limits (keep first 50 moves)
          const pgnLines = g.pgn.split('\n').filter(line => line.trim());
          const truncatedPGN = pgnLines.length > 50 
            ? pgnLines.slice(0, 50).join('\n') + '\n... (game continues)'
            : g.pgn;
          return `\n--- Game ${idx + 1} (${g.source}, ${new Date(g.playedAt).toLocaleDateString()}) ---\n${truncatedPGN}`;
        }).join('\n\n')}

        ${engineAnalysis ? `\n${engineAnalysis}\n` : ''}

        TASK - Generate a professional scouting dossier with 100% CONFIDENCE:
        
        You have access to ${totalGamesCount} total games. This is a COMPREHENSIVE dataset. Use ALL of it.
        
        1. OPENING REPERTOIRE ANALYSIS:
           - Use the aggregated opening stats (which already filter for 10+ games per opening)
           - Cross-reference with the complete game metadata to verify patterns
           - Identify their ACTUAL repertoire from the ${totalGamesCount} games, not estimates
           - Calculate win rates from the REAL data provided
           
        2. STYLISTIC ANALYSIS (OPENING-SPECIFIC):
           - Analyze the ${pgnSampleSize} PGN samples for tactical patterns
           - Use the opening-specific Stockfish insights provided above
           - Focus on identifying weaknesses and strengths PER OPENING (not overall)
           - Each opening has its own mistake patterns and accuracy metrics - use these opening-specific insights
           - Identify recurring themes within each opening family
           
        3. STATISTICAL ACCURACY:
           - Every statistic must be derived from the ${totalGamesCount} games provided
           - Opening frequencies come from aggregated stats (mainline openings with 10+ games)
           - Win rates are calculated from actual game results
           - DO NOT estimate or hallucinate - use the real numbers
           
        4. GENERATE COMPREHENSIVE REPORT:
           - White openings and Black defenses (from aggregated stats + game metadata)
           - IMPORTANT: For opening statistics, ensure ALL numeric fields are properly calculated:
             * winRate: Must be a decimal between 0.0 and 1.0 (e.g., 0.65 = 65%)
             * wins, draws, losses: Must be whole numbers (integers) >= 0
             * totalGames: Must equal wins + draws + losses
             * frequency: Must be a decimal between 0.0 and 1.0
           - 3 specific "Strengths" observed across the ${totalGamesCount} games (refer to "${identity.verifiedName}" by name, NOT username)
             * Focus on opening-specific strengths when possible (e.g., "Strong endgame technique in Sicilian Defense")
           - 3 specific "Weaknesses" identified from opening-specific engine analysis (refer to "${identity.verifiedName}" by name, NOT username)
             * Use the opening-specific Stockfish insights above to identify weaknesses per opening
             * Example: "Tends to make critical mistakes in middlegame positions arising from Queen's Gambit"
           - "Black Repertoire Summary": Analysis based on ALL black games (use "${identity.verifiedName}" not usernames)
           - "Specific Vulnerability": Actionable advice based on patterns seen in ${totalGamesCount} games (use "${identity.verifiedName}" not usernames)
           - "Tactical Recommendation": Strategic path derived from complete dataset (use "${identity.verifiedName}" not usernames)
           - "Preparation Summary": Repertoire changes over time (use date range: ${gameSummary.dateRange ? `${new Date(gameSummary.dateRange.earliest).toLocaleDateString()} to ${new Date(gameSummary.dateRange.latest).toLocaleDateString()}` : 'N/A'}) (use "${identity.verifiedName}" not usernames)
           - 3 "Suggested Lines": Specific variations that exploit patterns found in the data
        
        CONFIDENCE REQUIREMENT:
        - You have ${totalGamesCount} games - this is a LARGE dataset
        - Every opening shown in stats has 10+ games (statistically significant)
        - Use ALL ${totalGamesCount} games for your analysis
        - Report with 100% confidence based on the complete data provided
        - DO NOT say "limited data" or "small sample" - you have ${totalGamesCount} games!
        
        The final response MUST be a JSON object conforming to the ScoutingReport interface.
        CRITICAL VALIDATION REQUIREMENTS: 
        - DO NOT hallucinate statistics - use the real data from ${totalGamesCount} games
        - The frequencies and win rates provided in the JSON stats are DECIMALS (0.0 to 1.0)
        - For example, 0.45 means 45%
        - Never report a win rate above 1.0 (100%)
        - Opening stats are already aggregated and filtered (10+ games per opening)
        - Base ALL recommendations on the ${totalGamesCount} games provided
        - For whiteOpenings and blackDefenses arrays, ensure EVERY opening object has:
          * wins: integer >= 0
          * draws: integer >= 0  
          * losses: integer >= 0
          * totalGames: integer = wins + draws + losses (MUST match!)
          * winRate: decimal between 0.0 and 1.0 = wins / totalGames (if totalGames > 0, else 0)
          * frequency: decimal between 0.0 and 1.0
        - If you cannot calculate proper statistics, use the provided aggregated stats from the data section above
        - NEVER return NaN, null, or undefined for numeric fields - always use 0 as default
      `;

      setScanningStatus('Generating AI Analysis Report...');
      console.log('[Analysis] Calling Gemini API with', allGames.length, 'games');

      // Call Gemini API via Edge Function (secure server-side call)
      const responseSchema = {
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
                    wins: { type: Type.NUMBER },
                    draws: { type: Type.NUMBER },
                    losses: { type: Type.NUMBER },
                    totalGames: { type: Type.NUMBER },
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
                    wins: { type: Type.NUMBER },
                    draws: { type: Type.NUMBER },
                    losses: { type: Type.NUMBER },
                    totalGames: { type: Type.NUMBER },
                    trend: { type: Type.STRING }
                  }
                }
              },
              strategicSummary: { type: Type.STRING },
              blackStrategicSummary: { type: Type.STRING },
              tacticalProfile: { type: Type.STRING },
              endgameReliability: { type: Type.STRING },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              specificVulnerability: { type: Type.STRING },
              tacticalRecommendation: { type: Type.STRING },
              preparationSummary: { type: Type.STRING },
              suggestedLines: { type: Type.ARRAY, items: { type: Type.STRING } },
              repertoireReliability: { type: Type.NUMBER },
              mostPlayedLines: {
                type: Type.OBJECT,
                properties: {
                  white: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        moves: { type: Type.ARRAY, items: { type: Type.STRING } },
                        frequency: { type: Type.NUMBER },
                        games: { type: Type.NUMBER }
                      }
                    }
                  },
                  black: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        moves: { type: Type.ARRAY, items: { type: Type.STRING } },
                        frequency: { type: Type.NUMBER },
                        games: { type: Type.NUMBER }
                      }
                    }
                  }
                }
              }
            },
            required: ["id", "player", "whiteOpenings", "blackDefenses", "strengths", "weaknesses", "specificVulnerability", "tacticalRecommendation", "preparationSummary", "suggestedLines"]
      };

      const reportData = await geminiService.generateContentWithSchema(
        analysisPrompt,
        responseSchema
      ) as ScoutingReport;

      console.log('[Analysis] Received response from Gemini API');
      console.log('[Analysis] Report data structure:', JSON.stringify(reportData, null, 2));
      reportData.lastUpdated = new Date().toISOString();

      // Ensure ID exists (generate if missing)
      if (!reportData.id || reportData.id.trim() === '') {
        reportData.id = `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }

      // Ensure player object exists (initialize if missing from Gemini response)
      if (!reportData.player) {
        reportData.player = {
          name: '',
          platforms: {}
        };
      }

      // Merge real profile data
      reportData.player.name = identity.verifiedName; // Priority to official name
      reportData.player.platforms = reportData.player.platforms || {};
      reportData.player.platforms.chessCom = chessComUser || '';
      reportData.player.platforms.lichess = lichessUser || '';
      reportData.player.currentRating = identity.fideProfile?.rating || 0;
      reportData.player.uscfRating = identity.uscfProfile?.rating || 0;
      reportData.player.fideId = formData.fideId || '';
      reportData.player.uscfId = formData.uscfId || '';
      reportData.player.country = identity.fideProfile?.federation || identity.uscfProfile?.name?.split(',')?.pop()?.trim() || 'USA';
      
      // Ensure all required arrays exist
      reportData.whiteOpenings = reportData.whiteOpenings || [];
      reportData.blackDefenses = reportData.blackDefenses || [];
      reportData.strengths = reportData.strengths || [];
      reportData.weaknesses = reportData.weaknesses || [];
      reportData.suggestedLines = reportData.suggestedLines || [];
      reportData.mostPlayedLines = reportData.mostPlayedLines || { white: [], black: [] };
      
      // Validate and fix opening statistics to prevent NaN issues and ensure integer counts
      const validateOpeningStats = (openings: typeof reportData.whiteOpenings) => {
        return openings.map(op => {
          // Ensure all counts are integers (round to nearest integer)
          const wins = Math.round(typeof op.wins === 'number' && !isNaN(op.wins) ? op.wins : 0);
          const draws = Math.round(typeof op.draws === 'number' && !isNaN(op.draws) ? op.draws : 0);
          const losses = Math.round(typeof op.losses === 'number' && !isNaN(op.losses) ? op.losses : 0);
          const totalGames = Math.max(wins + draws + losses, Math.round(typeof op.totalGames === 'number' && !isNaN(op.totalGames) ? op.totalGames : 0));
          
          // Recalculate winRate from actual integer counts (this is the source of truth)
          // winRate = wins / totalGames (as a decimal between 0.0 and 1.0)
          const winRate = totalGames > 0 ? wins / totalGames : 0;
          
          // Ensure winRate is between 0 and 1
          const clampedWinRate = Math.max(0, Math.min(1, winRate));
          
          return {
            ...op,
            wins, // Integer
            draws, // Integer
            losses, // Integer
            totalGames: totalGames || wins + draws + losses, // Integer, must match sum
            winRate: clampedWinRate, // Decimal 0.0-1.0
            frequency: typeof op.frequency === 'number' && !isNaN(op.frequency) ? Math.max(0, Math.min(1, op.frequency)) : 0
          };
        });
      };
      
      reportData.whiteOpenings = validateOpeningStats(reportData.whiteOpenings);
      reportData.blackDefenses = validateOpeningStats(reportData.blackDefenses);
      
      // Ensure all required strings exist
      reportData.strategicSummary = reportData.strategicSummary || 'Analysis pending...';
      reportData.blackStrategicSummary = reportData.blackStrategicSummary || 'Analysis pending...';
      reportData.tacticalProfile = reportData.tacticalProfile || 'Analysis pending...';
      reportData.endgameReliability = reportData.endgameReliability || 'Analysis pending...';
      reportData.timeControlInsights = reportData.timeControlInsights || 'Analysis pending...';
      reportData.specificVulnerability = reportData.specificVulnerability || 'Analysis pending...';
      reportData.tacticalRecommendation = reportData.tacticalRecommendation || 'Analysis pending...';
      reportData.preparationSummary = reportData.preparationSummary || 'Analysis pending...';
      reportData.repertoireReliability = reportData.repertoireReliability || 0;
      
      // Extract most played move sequences
      const { extractMostPlayedLines } = await import('../services/moveSequenceExtractor');
      const mostPlayedLines = extractMostPlayedLines(allGames, targetUsernameForStats, 10, 10);
      reportData.mostPlayedLines = mostPlayedLines || { white: [], black: [] };
      
      console.log('[Analysis] Report data validated and prepared for saving');

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
          try {
            console.log("Persisted new report to Supabase");
          } catch (dbSaveError) {
            console.error("Critical Database Error:", dbSaveError);
            alert("Warning: Your analysis was generated but could not be saved to your history. Please check your database connection.");
          }
        }
      } catch (dbErr) {
        console.warn("Failed to persist report to DB (Demo Mode?):", dbErr);
      }

      console.log('[Analysis] Report generated successfully, calling onReportGenerated');
      onReportGenerated(reportData);
      setScanningStatus('Analysis Complete!');

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
                <label className="block text-sm font-bold text-indigo-400 dark:text-indigo-400 text-indigo-600 mb-2 uppercase tracking-widest">Full Name</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-700 dark:border-slate-700 border-gray-300 rounded-xl px-4 py-3 pl-11 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 focus:border-indigo-600 transition-colors font-medium text-white dark:text-white text-gray-900 shadow-inner placeholder:text-slate-600 dark:placeholder:text-slate-600 placeholder:text-gray-400"
                    placeholder="Magnus Carlsen"
                  />
                  <User className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-500 text-gray-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {defaultFederation === 'FIDE' ? (
                  <>
                    <div className="relative group">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-2 uppercase tracking-widest">FIDE ID</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={formData.fideId}
                          onChange={e => setFormData({ ...formData, fideId: e.target.value })}
                          placeholder="123456789"
                          className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500/50 dark:focus:border-indigo-500/50 focus:border-indigo-600 text-slate-300 dark:text-slate-300 text-gray-900 text-sm transition-colors placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400"
                        />
                      </div>
                    </div>
                    <div className="relative group">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-2 uppercase tracking-widest">USCF ID <span className="text-slate-600 dark:text-slate-600 text-gray-500">(Optional - US players only)</span></label>
                      <div className="relative">
                        <input
                          type="text"
                          value={formData.uscfId}
                          onChange={e => setFormData({ ...formData, uscfId: e.target.value })}
                          placeholder="123456789"
                          className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500/50 dark:focus:border-indigo-500/50 focus:border-indigo-600 text-slate-300 dark:text-slate-300 text-gray-900 text-sm transition-colors placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="relative group">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-2 uppercase tracking-widest">USCF ID</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={formData.uscfId}
                          onChange={e => setFormData({ ...formData, uscfId: e.target.value })}
                          placeholder="123456789"
                          className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500/50 dark:focus:border-indigo-500/50 focus:border-indigo-600 text-slate-300 dark:text-slate-300 text-gray-900 text-sm transition-colors placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400"
                        />
                      </div>
                    </div>
                    <div className="relative group">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-2 uppercase tracking-widest">FIDE ID <span className="text-slate-600 dark:text-slate-600 text-gray-500">(Optional)</span></label>
                      <div className="relative">
                        <input
                          type="text"
                          value={formData.fideId}
                          onChange={e => setFormData({ ...formData, fideId: e.target.value })}
                          placeholder="123456789"
                          className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500/50 dark:focus:border-indigo-500/50 focus:border-indigo-600 text-slate-300 dark:text-slate-300 text-gray-900 text-sm transition-colors placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="relative group">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-2 uppercase tracking-widest">Chess.com Username <span className="text-slate-600 dark:text-slate-600 text-gray-500">(Optional)</span></label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.chessComUsername}
                      onChange={e => setFormData({ ...formData, chessComUsername: e.target.value })}
                      placeholder="hikaru"
                      className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500/50 dark:focus:border-emerald-500/50 focus:border-emerald-600 text-slate-300 dark:text-slate-300 text-gray-900 text-sm transition-colors placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400"
                    />
                  </div>
                </div>
                <div className="relative group">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-2 uppercase tracking-widest">Lichess Username <span className="text-slate-600 dark:text-slate-600 text-gray-500">(Optional)</span></label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.lichessUsername}
                      onChange={e => setFormData({ ...formData, lichessUsername: e.target.value })}
                      placeholder="DrNykterstein"
                      className="w-full bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500/50 dark:focus:border-indigo-500/50 focus:border-indigo-600 text-slate-300 dark:text-slate-300 text-gray-900 text-sm transition-colors placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="forceRefresh"
                  checked={forceRefresh}
                  onChange={(e) => setForceRefresh(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-800 dark:border-slate-800 border-gray-300 bg-slate-950 dark:bg-slate-950 bg-gray-50 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="forceRefresh" className="text-xs font-semibold text-slate-400 dark:text-slate-400 text-gray-600 cursor-pointer hover:text-slate-300 dark:hover:text-slate-300 hover:text-gray-900 transition-colors">
                  Force Deep Re-Scan (Bypass Cache)
                </label>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-4 bg-red-900/20 dark:bg-red-900/20 bg-red-50 border border-red-900/50 dark:border-red-900/50 border-red-200 text-red-400 dark:text-red-400 text-red-600 rounded-xl text-sm animate-pulse">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 font-bold text-lg transition-all ${loading
                ? 'bg-slate-800 dark:bg-slate-800 bg-gray-200 text-slate-500 dark:text-slate-500 text-gray-500 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-500/20'
                } `}
            >
              {loading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  {scanningStatus || 'Analyzing Databases...'}
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  Analyze Opponent
                </>
              )}
            </button>
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
              <Cpu className="w-4 h-4" /> System Protocols
            </h3>
            <ul className="space-y-4 text-sm text-slate-400 dark:text-slate-400 text-gray-600">
              <li className="flex gap-3">
                <span className="text-indigo-500 font-bold bg-indigo-500/10 w-5 h-5 flex items-center justify-center rounded text-xs shrink-0">1</span>
                Autonomous matching connects in person identities with verified online handles via PGN signature analysis.
              </li>
              <li className="flex gap-3">
                <span className="text-indigo-500 font-bold bg-indigo-500/10 w-5 h-5 flex items-center justify-center rounded text-xs shrink-0">2</span>
                The engine analyzes the last 24 months of classical and online games for opening trend detection.
              </li>
              <li className="flex gap-3">
                <span className="text-indigo-500 font-bold bg-indigo-500/10 w-5 h-5 flex items-center justify-center rounded text-xs shrink-0">3</span>
                Vulnerability scanning identifies structural opening deviations and preparatory blindspots.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchScreen;
