
import React, { useState } from 'react';
import { Search, ShieldAlert, Database, AlertCircle, Loader2, Play, Cpu, User, Info } from 'lucide-react';
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
import { validatePlayerSearch } from '../lib/validation';
import { parsePGNMoves, formatMoveSequence, truncatePGNToMoves } from '../services/moveSequenceExtractor';

interface SearchScreenProps {
  onReportGenerated: (report: ScoutingReport) => void;
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
  const [gameLimit, setGameLimit] = useState(1000);
  const [engineDepth, setEngineDepth] = useState(10);
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
            onReportGenerated(cachedReport);
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

      let targetUsername = formData.name;

      // 1. Identity Resolution Phase (Real Data)
      console.log('Initiating Identity Resolution Protocol...');
      setScanningStatus('Step 1: Finding FIDE/USCF IDs...');
      
      const identity = await identityService.resolve(
        formData.name,
        fideId || '',
        uscfId || '',
        formData.chessComUsername || undefined,
        formData.lichessUsername || undefined
      );
      
      if (identity.fideProfile || identity.uscfProfile) {
        const ids = [];
        if (identity.fideProfile) ids.push(`FIDE: ${identity.fideProfile.id}`);
        if (identity.uscfProfile) ids.push(`USCF: ${identity.uscfProfile.id}`);
        setScanningStatus(`Step 1 complete: Found ${ids.join(', ')}`);
      } else {
        setScanningStatus('Step 1 complete: No FIDE/USCF IDs found');
      }

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
      setScanningStatus(`Step 2: Searching for Chess.com and Lichess accounts...`);
      console.log(`[Search] Fetching games for Chess.com: ${chessComUser || 'none'}, Lichess: ${lichessUser || 'none'}`);
      
      // Check if we found a Top Players database slug (from chess.com/players/{slug} URLs)
      // These might be different from regular usernames
      // The identity service may have found a Top Players slug even if chessComUser is set
      // We'll try to use it as a fallback if regular account doesn't work
      let chessComTopPlayersSlug: string | null = null;
      if (identity.chessComUsername) {
        const discovered = identity.chessComUsername;
        // If we don't have a regular username, or if we want to check for Top Players slug
        // Try to fetch profile - if it fails, it might be a Top Players slug
        if (!chessComUser) {
          const testProfile = await chessComService.getPlayerProfile(discovered).catch(() => null);
          if (!testProfile) {
            console.log(`[Search] Discovered identifier "${discovered}" not found as regular account, will try as Top Players slug`);
            chessComTopPlayersSlug = discovered;
          }
        }
      }

      // When both platforms: fetch Lichess first, then request (gameLimit - lichessCount) from Chess.com so total ≤ gameLimit
      let chessComRawGames: unknown[] | null = null;
      let lichessRawGames: string = '';

      const [chessComProfile, chessComStats, lichessProfile] = await Promise.all([
        chessComUser ? chessComService.getPlayerProfile(chessComUser).catch(err => {
          console.warn(`[Search] Failed to fetch Chess.com profile for ${chessComUser}:`, err);
          return null;
        }) : Promise.resolve(null),
        chessComUser ? chessComService.getPlayerStats(chessComUser).catch(err => {
          console.warn(`[Search] Failed to fetch Chess.com stats for ${chessComUser}:`, err);
          return {};
        }) : Promise.resolve({}),
        lichessUser ? lichessService.getPlayerProfile(lichessUser).catch(err => {
          console.warn(`[Search] Failed to fetch Lichess profile for ${lichessUser}:`, err);
          return null;
        }) : Promise.resolve(null),
      ]);

      if (lichessUser) {
        lichessRawGames = await lichessService.getRecentGames(lichessUser, gameLimit).catch(err => {
          console.warn(`[Search] Failed to fetch Lichess games for ${lichessUser}:`, err);
          return '';
        });
      }

      const lichessGames = lichessUser && lichessRawGames && typeof lichessRawGames === 'string' && lichessRawGames.trim().length > 0
        ? await gameAnalysisService.parseLichessGames(lichessRawGames, lichessUser)
        : [];

      const lichessCount = lichessGames.length;
      const chessComLimit = Math.max(0, gameLimit - lichessCount);

      if (chessComUser && chessComLimit > 0) {
        chessComRawGames = await chessComService.getRecentGames(chessComUser, true, chessComLimit).catch(err => {
          console.warn(`[Search] Failed to fetch Chess.com games for ${chessComUser}:`, err);
          if (chessComTopPlayersSlug) {
            return chessComService.getGamesFromTopPlayersSlug(chessComTopPlayersSlug).catch(() => []);
          }
          return [];
        }) as unknown[] | null;
      } else if (chessComTopPlayersSlug && chessComLimit > 0) {
        chessComRawGames = await chessComService.getGamesFromTopPlayersSlug(chessComTopPlayersSlug).catch(() => []) as unknown[] | null;
      }

      setScanningStatus(`Step 2 complete: Found ${chessComUser || 'no Chess.com account'}, ${lichessUser || 'no Lichess account'}`);
      await new Promise(resolve => setTimeout(resolve, 300));

      const chessComGamesUsername = chessComUser || chessComTopPlayersSlug || '';
      const chessComGames = chessComRawGames && Array.isArray(chessComRawGames) && chessComRawGames.length > 0
        ? await gameAnalysisService.parseChessComGames(chessComRawGames, chessComGamesUsername)
        : [];

      const chessBaseGames: GameData[] = [];
      const allGames = [...chessComGames, ...lichessGames, ...chessBaseGames];
      const totalFetched = allGames.length;

      console.log(`[Search] Fetched ${chessComGames.length} Chess.com, ${lichessGames.length} Lichess → ${totalFetched} total (target ${gameLimit})`);

      setScanningStatus(`Step 3: Fetched ${totalFetched.toLocaleString()} games (Chess.com: ${chessComGames.length}, Lichess: ${lichessGames.length})`);

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

      setLoadingStage('analyzing');
      setLoadingProgress(62);
      setScanningStatus(`Step 3 complete: Fetched ${allGames.length.toLocaleString()} total games`);
      
      // Small delay to ensure Step 3 complete is visible before moving to Step 4
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setScanningStatus(`Step 4: Analyzing ${allGames.length.toLocaleString()} games for opening patterns...`);
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
      setScanningStatus(`Step 4 complete: Opening patterns analyzed`);
      
      // Small delay to ensure Step 4 complete is visible before moving to Step 5
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const gamesToAnalyze = allGames.filter(g => g.pgn && g.pgn.trim().length > 20);
      const formattedCount = gamesToAnalyze.length.toLocaleString();
      setScanningStatus(`Step 5: Analyzing ${formattedCount} games with Stockfish engine...`);
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
          // Use allGames.length as the total (total games fetched) instead of gamesWithPGN.length
          const totalGamesFetched = allGames.length;
          const progressCallback = (current: number, total: number) => {
            // Format numbers with commas for better readability with large numbers
            const formattedCurrent = current.toLocaleString();
            const formattedTotal = totalGamesFetched.toLocaleString();
            setScanningStatus(`Step 5: Stockfish analyzing ${formattedCurrent}/${formattedTotal} games...`);
          };
          
          const analyses = await analyzer.analyzeGames(gamesWithPGN, targetUsernameForStats, gamesWithPGN.length, progressCallback, engineDepth);
          
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
STOCKFISH ENGINE ANALYSIS (Depth ${engineDepth}, ${analyses.length} games analyzed):
- Total games analyzed: ${analyses.length}
- Critical mistakes detected: ${totalMistakes} significant errors (>150 centipawns)
- Average mistakes per game: ${mistakesPerGame}
- Average endgame accuracy: ${avgEndgameAccuracy.toFixed(1)}%

OPENING-SPECIFIC INSIGHTS (grouped by ECO code):
${openingInsights.length > 0 ? openingInsights.join('\n\n') : 'Insufficient games per opening for detailed analysis'}
          `.trim();
          
          console.log(`[Stockfish] Engine analysis complete: ${totalMistakes} critical mistakes (>150 cp) at sampled positions (moves 10,20,30,...) across ${analyses.length} games, ${avgEndgameAccuracy.toFixed(1)}% endgame accuracy`);
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
      
      // Use ALL games with PGN (no sampling) - if user asks for 1000 games, they get 1000
      const pgnSample = [...gamesWithPGN].sort((a, b) => 
        new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime()
      );
      
      // Create comprehensive game summary
      // Use accurate counts - gamesWithPGN is the actual number analyzed
      const gameSummary = {
        totalGames: totalGamesCount,
        gamesAnalyzed: gamesWithPGN.length, // Actual games with PGN that will be analyzed
        chessComGames: chessComGames.length,
        lichessGames: lichessGames.length,
        gamesWithPGN: gamesWithPGN.length,
        pgnSampleSize: pgnSample.length,
        dateRange: allGames.length > 0 ? {
          earliest: allGames.reduce((earliest, g) => 
            new Date(g.playedAt) < new Date(earliest.playedAt) ? g : earliest
          ).playedAt,
          latest: allGames.reduce((latest, g) => 
            new Date(g.playedAt) > new Date(latest.playedAt) ? g : latest
          ).playedAt
        } : null
      };

      // Extract most played lines BEFORE building prompt (10 moves = more games per line)
      const { extractMostPlayedLines } = await import('../services/moveSequenceExtractor');
      const mostPlayedLinesForPrompt = extractMostPlayedLines(allGames, targetUsernameForStats, 10, 10);

      const analysisPrompt = `
        ANALYZE THE FOLLOWING COMPREHENSIVE CHESS DATA FOR PLAYER: "${identity.verifiedName}"
        
        ⚠️ CRITICAL NAMING INSTRUCTION: Throughout your entire response, you MUST refer to this player by their verified name "${identity.verifiedName}" (NOT by their Chess.com username "${chessComUser || 'N/A'}" or Lichess username "${lichessUser || 'N/A'}"). 
        - When describing strengths: "Magnus Carlsen excels at..." NOT "hikaru excels at..."
        - When describing weaknesses: "Magnus Carlsen struggles with..." NOT "DrNykterstein struggles with..."
        - When making recommendations: "Against Magnus Carlsen, consider..." NOT "Against hikaru, consider..."
        - Use the verified name "${identity.verifiedName}" in ALL text fields (strategicSummary, tacticalProfile, specificVulnerability, etc.)
        
        ⚠️ CRITICAL INSTRUCTION: You have access to ${totalGamesCount} total games fetched, with ${gameSummary.gamesWithPGN} games having complete PGN data for detailed analysis. Use ALL of this data to achieve 100% confidence in your analysis. 
        DO NOT rely on small samples - you have access to the FULL dataset. Every statistic, pattern, and recommendation must be based on the complete data provided.
        
        DATA SUMMARY (what is passed to you):
        - Total Games in Dataset: ${totalGamesCount}
        - Move List: ALL ${totalGamesCount} games, up to 20 moves per game
        - PGN Sample: ALL ${gameSummary.pgnSampleSize} games, up to 20 moves each (truncated for token efficiency)
        - Game Metadata: ALL ${totalGamesCount} games (source, players, result, ECO, date)
        - Chess.com: ${gameSummary.chessComGames} | Lichess: ${gameSummary.lichessGames}
        ${gameSummary.dateRange ? `- Date Range: ${new Date(gameSummary.dateRange.earliest).toLocaleDateString()} to ${new Date(gameSummary.dateRange.latest).toLocaleDateString()}` : ''}
        
        VERIFIED IDENTITY:
        - FIDE Rating: ${identity.fideProfile?.rating != null ? identity.fideProfile.rating : 'Not found'} (Title: ${identity.fideProfile?.title || 'None'})
        - USCF Rating: ${identity.uscfProfile?.rating != null ? identity.uscfProfile.rating : 'Not found'}
        
        PLATFORM STATS:
        - Chess.com: ${chessComUser} (Rapid: ${(chessComStats as any)?.chess_rapid?.last?.rating || 'N/A'}, Blitz: ${(chessComStats as any)?.chess_blitz?.last?.rating || 'N/A'})
        - Lichess: ${lichessUser} (Classical: ${lichessProfile?.perfs?.classical?.rating || 'N/A'}, Blitz: ${lichessProfile?.perfs?.blitz?.rating || 'N/A'})
        
        AGGREGATED OPENING STATS (Based on ALL ${totalGamesCount} games):
        - REPORT ACTUAL STATISTICS: For every statistic or pattern you mention, cite the exact number of games (e.g., "in 12 of 45 Sicilian games", "played 8 times in 30 games"). Never give percentages or trends without the underlying game count.
        - These stats aggregate openings into broad families (e.g., "Sicilian Defense", "Indian defenses" for 1.d4 Nf6 - NOT "Queen's Gambit Declined")
        - Only includes openings with 10+ games (statistical significance)
        - White Openings (whiteOpenings): ${JSON.stringify(whiteStats)}
          * CRITICAL: These stats are calculated ONLY from games where ${identity.verifiedName} played as WHITE.
          * Each opening in this list represents games where the player had the White pieces.
        - Black Defenses (blackDefenses): ${JSON.stringify(blackStats)}
          * CRITICAL: These stats are calculated ONLY from games where ${identity.verifiedName} played as BLACK.
          * Each defense in this list represents games where the player had the Black pieces.
        - Note: Each opening shown has 10+ games. Frequencies and win rates are calculated from the complete dataset.
        - IMPORTANT: When reporting openings, use ONLY the human-readable names (e.g., "Sicilian Defense"). NEVER mention ECO codes like "B20-B29" or "B00-B99" in your response.
        - ⚠️ CRITICAL: whiteOpenings and blackDefenses MUST be copied EXACTLY from the data above. Report ALL openings from the stats (Caro-Kann, French, Modern, Italian, Ruy Lopez, etc.) - do NOT consolidate to only "Sicilian" and "Queen's Pawn". Each distinct opening in the data must appear.

        MOST PLAYED LINES (prioritize these for suggestedLines - they have more games per line):
        - White: ${(mostPlayedLinesForPrompt.white || []).map((l, i) => `${i + 1}. ${l.notation} (${l.games} games)`).join('\n') || 'None'}
        - Black: ${(mostPlayedLinesForPrompt.black || []).map((l, i) => `${i + 1}. ${l.notation} (${l.games} games)`).join('\n') || 'None'}

        GAME METADATA SUMMARY (ALL ${totalGamesCount} games):
        ${allGames.map((g, idx) => 
          `Game ${idx + 1}: ${g.source} | ${g.white} vs ${g.black} | Result: ${g.result} | ECO: ${g.eco} | Date: ${new Date(g.playedAt).toLocaleDateString()} | Time Control: ${g.timeControl}`
        ).join('\n')}

        MOVE LIST (ALL ${totalGamesCount} games, up to 20 moves per game - for pattern verification):
        ONLY mention a pattern if it appears in 10+ games. Do NOT cite lines like "appeared twice" - that is NOT a pattern.
        ${(() => {
          const maxMovesPerGame = 20;
          return allGames.map((g, idx) => {
            const moves = g.pgn && g.pgn.trim().length > 20 ? parsePGNMoves(g.pgn) : [];
            const movesToShow = moves.length > maxMovesPerGame ? moves.slice(0, maxMovesPerGame) : moves;
            const line = movesToShow.length > 0 ? formatMoveSequence(movesToShow) + (moves.length > maxMovesPerGame ? ' ...' : '') : '(no PGN)';
            return `Game ${idx + 1}: ${line}`;
          }).join('\n');
        })()}

        PGN SAMPLE (ALL ${pgnSample.length} games, up to 20 moves each - tags + truncated movetext):
        ${pgnSample.map((g, idx) => {
          const truncatedPGN = truncatePGNToMoves(g.pgn, 20);
          return `\n--- Game ${idx + 1} (${g.source}, ${new Date(g.playedAt).toLocaleDateString()}) ---\n${truncatedPGN}`;
        }).join('\n\n')}

        ${engineAnalysis ? `\n${engineAnalysis}\n` : ''}

        TASK - Generate a professional scouting dossier with 100% CONFIDENCE:
        
        ⚠️ CRITICAL: JSON OUTPUT REQUIREMENT - Your response MUST be valid, complete JSON. Every opened { or [ must have a matching closing } or ]. Never truncate the JSON structure. If you must be concise, abbreviate within text fields—never cut off the object structure.
        
        ⚠️ CRITICAL: RESPONSE COMPLETENESS REQUIREMENT:
        - You MUST provide COMPLETE, DETAILED responses for ALL fields
        - Do NOT truncate or abbreviate any analysis
        - Each text field (strategicSummary, tacticalProfile, preparationSummary, etc.) should be COMPREHENSIVE and THOROUGH
        - Provide FULL explanations, not brief summaries
        - Include specific examples, statistics, and detailed analysis in every section
        - If a response seems incomplete, continue writing until you've fully addressed the topic
        
        You have access to ${totalGamesCount} total games. This is a COMPREHENSIVE dataset. Use ALL of it.
        
        1. OPENING REPERTOIRE ANALYSIS:
           - Use the aggregated opening stats (only openings with 10+ games)
           - Cross-reference with the complete game metadata to verify patterns
           - Identify their ACTUAL repertoire from the ${totalGamesCount} games, not estimates
           - Calculate win rates from the REAL data provided
           
        2. STYLISTIC ANALYSIS (OPENING-SPECIFIC):
           - Analyze the ${gameSummary.pgnSampleSize} PGN samples for tactical patterns
           - Use the opening-specific Stockfish insights provided above
           - Focus on identifying weaknesses and strengths PER OPENING (not overall)
           - Each opening has its own mistake patterns and accuracy metrics - use these opening-specific insights
           - Identify recurring themes within each opening family
           - ⚠️ CRITICAL: When analyzing PGN samples, you have ALL ${gameSummary.pgnSampleSize} games. Before claiming a pattern is "common" or "typical", verify it appears in MULTIPLE games (10+). A single game does not establish a pattern.
           - ⚠️ CRITICAL: DO NOT over-emphasize themes from recent games. You have the FULL dataset (${gameSummary.dateRange ? `${new Date(gameSummary.dateRange.earliest).toLocaleDateString()} to ${new Date(gameSummary.dateRange.latest).toLocaleDateString()}` : 'N/A'}). Weight all games equally regardless of when they were played. Recent games should NOT be given more importance than older games in your analysis.
           
        3. STATISTICAL ACCURACY:
           - Every statistic must be derived from the ${totalGamesCount} games provided
           - Opening frequencies come from aggregated stats (10+ games per opening)
           - Win rates are calculated from actual game results
           - DO NOT estimate or hallucinate - use the real numbers
           
        4. GENERATE COMPREHENSIVE REPORT:
           - ⚠️ CRITICAL COLOR CONFUSION: blackDefenses = what ${identity.verifiedName} PLAYS when they have the BLACK pieces. whiteOpenings = what they PLAY when they have the WHITE pieces. NEVER confuse these. The Sicilian Defense is what the player plays when they have BLACK (1.e4 c5). If the player had White and the opponent played 1...c5, that is NOT the player's black defense - it is what they faced as White.
           - White openings (whiteOpenings): ONLY include openings where ${identity.verifiedName} played as WHITE. These stats should be calculated ONLY from games where the player had the White pieces.
           - Black defenses (blackDefenses): ONLY include defenses where ${identity.verifiedName} played as BLACK. Report ONLY what the data shows. Do NOT assume or infer:
             * QGD = ONLY for 1.d4 d5 2.c4 e6 (or similar). Never say QGD for 1.d4 Nf6 (Indian) or 1.e4 c6 (Caro-Kann).
             * Caro-Kann = 1.e4 c6. French = 1.e4 e6. Modern = 1.e4 g6. Pirc = 1.e4 d6. Sicilian = 1.e4 c5.
             * When Black plays 1...Nf6 (1.d4 Nf6), use Indian Defense names (King's Indian, Nimzo-Indian, Queen's Indian)—NEVER Queen's Gambit Declined.
           - IMPORTANT: For opening statistics, ensure ALL numeric fields are properly calculated:
             * winRate: Must be a decimal between 0.0 and 1.0 (e.g., 0.65 = 65%)
             * wins, draws, losses: Must be whole numbers (integers) >= 0
             * totalGames: Must equal wins + draws + losses
             * frequency: Must be a decimal between 0.0 and 1.0
           - 3 specific "Strengths" observed across the ${totalGamesCount} games (refer to "${identity.verifiedName}" by name, NOT username)
             * Focus on opening-specific strengths when possible (e.g., "Strong endgame technique in Sicilian Defense")
             * ⚠️ Only list strengths that appear in 10+ games - do not generalize from 1-9 games
             * Always cite evidence: "demonstrated in X games" or "appears in Y% of games"
           - 3 specific "Weaknesses" identified from opening-specific engine analysis (refer to "${identity.verifiedName}" by name, NOT username)
             * Use the opening-specific Stockfish insights above to identify weaknesses per opening
             * ⚠️ Only list weaknesses that appear in 10+ games - do not generalize from 1-9 games
             * Example CORRECT: "Makes critical mistakes (>150 centipawns) in middlegame positions arising from Queen's Gambit, observed in 12 of 18 QGD games"
             * Example INCORRECT: "Tends to make critical mistakes in middlegame positions" (if only seen in 1-2 games)
             * Always cite evidence: "observed in X games" or "appears in Y% of games"
           - FORMATTING INSTRUCTIONS:
             * DO NOT use ** (double asterisks) for bold text anywhere in your response
             * ONLY use * (single asterisk) at the beginning of bullet points or list items
             * Write all text in plain format without markdown bold formatting
             * Example: Use "The Recommendation:" NOT "**The Recommendation:**"
             * Example: Use "* Avoid the Sicilian entirely" NOT "**Avoid the Sicilian entirely**"
           - "Black Repertoire Summary" (blackStrategicSummary): Analysis based ONLY on games where ${identity.verifiedName} played as BLACK. Do NOT include any information about their White repertoire here. Focus exclusively on their Black defenses, responses, and strategies when playing with the Black pieces. (use "${identity.verifiedName}" not usernames)
           - "Preparation Summary" (preparationSummary): Analysis of ${identity.verifiedName}'s WHITE REPERTOIRE ONLY. This should describe their opening choices, strategic preferences, and repertoire evolution when playing with the WHITE pieces. Do NOT mention their Black repertoire (Sicilian, QGD, etc.) in this section - that belongs in blackStrategicSummary. Focus exclusively on White openings like 1.e4, 1.d4, 1.Nf3, etc. and their responses to various Black defenses. (use date range: ${gameSummary.dateRange ? `${new Date(gameSummary.dateRange.earliest).toLocaleDateString()} to ${new Date(gameSummary.dateRange.latest).toLocaleDateString()}` : 'N/A'}) (use "${identity.verifiedName}" not usernames)
           - "Specific Vulnerability": Actionable advice based on patterns seen in ${totalGamesCount} games (use "${identity.verifiedName}" not usernames)
           - "Tactical Recommendation": Strategic path derived from complete dataset (use "${identity.verifiedName}" not usernames)
           - 3 "Suggested Lines": Specific variations that exploit patterns found in the data
             * ⚠️ CRITICAL: Prefer lines with 10+ games and 5-6 full moves (10-12 half-moves). Do NOT cite deep lines (12+ moves) from 1-2 games.
             * Use the MOST PLAYED LINES above when possible - they have the highest game counts.
             * Format: "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 (50 games, 62% win rate)"
             * Prioritize statistical significance: 100 games in a 10-move sequence > 6 games in a 24-move sequence.
        
        CONFIDENCE REQUIREMENT & STATISTICAL SIGNIFICANCE:
        - You have ${totalGamesCount} games - this is a LARGE dataset
        - Every opening in stats has 10+ games - ONLY mention patterns that appear in 10+ games
        - Use ALL ${totalGamesCount} games for your analysis
        - Report with 100% confidence based on the complete data provided
        - DO NOT say "limited data" or "small sample" - you have ${totalGamesCount} games!
        - ⚠️ CRITICAL: Weight all games EQUALLY regardless of date. The dataset spans ${gameSummary.dateRange ? `${new Date(gameSummary.dateRange.earliest).toLocaleDateString()} to ${new Date(gameSummary.dateRange.latest).toLocaleDateString()}` : 'N/A'}. Do NOT give more weight to recent games - analyze patterns across the ENTIRE time period. Recent trends should only be mentioned if they represent a significant change from earlier patterns, and this change should be explicitly noted with evidence from both time periods.
        
        ⚠️ CRITICAL: STATISTICAL SIGNIFICANCE REQUIREMENTS FOR GENERALIZATIONS:
        - NEVER use words like "often", "typically", "usually", "frequently", "commonly", "regularly", "oftentimes", "tends to", "prefers", "favors", or similar generalization language unless you can verify MULTIPLE instances (minimum 3-5 games) from the data
        - If a variation appears in 1-9 games: say "appeared in X games" - DO NOT call it a pattern or use "often", "typically", etc.
        - ONLY use generalization language when a pattern appears in 10+ games
        - NEVER cite a line like "appeared twice" - that is NOT a pattern worth mentioning
        - When describing patterns from PGN samples: Remember these are samples - verify frequency against the full ${totalGamesCount} game dataset before generalizing
        - Example CORRECT: "In the Sicilian Defense (30 games), ${identity.verifiedName} played the Najdorf variation in 8 games, making it a frequent choice"
        - Example INCORRECT: "In one game, ${identity.verifiedName} played 6.Be3, so they often play the English Attack" (this is wrong - one game is not "often")
        - Always cite actual game counts when making claims: "played X times in Y games" or "appears in Z% of games"
        
        ⚠️ CITING AND AGGREGATE PATTERNS (do NOT use specific game numbers):
        - Do NOT reference specific game numbers (e.g. "Game 19", "Games 4, 10, 11") anywhere in the report. Describe aggregate patterns and trends instead.
        - Use aggregate language: "in X of Y games", "appears in Z% of games", "across the dataset", "in multiple games with this opening".
        - NEVER cite a line from a single game as a common pattern. Verify every claim against the full dataset before generalizing.
        - Example CORRECT: "Against the Sicilian, ${identity.verifiedName} often plays the Rossolimo (3.Bb5+), appearing in roughly 25% of their Sicilian games."
        - Example INCORRECT: "In games 37, 41 and 89 they played 1.e4 c5 2.Nf3 d6 3.Bb5+" (do not reference game numbers)
        
        The final response MUST be a JSON object conforming to the ScoutingReport interface.
        CRITICAL VALIDATION REQUIREMENTS: 
        - DO NOT hallucinate statistics - use the real data from ${totalGamesCount} games
        - The frequencies and win rates provided in the JSON stats are DECIMALS (0.0 to 1.0)
        - For example, 0.45 means 45%
        - Never report a win rate above 1.0 (100%)
        - Opening stats are filtered (10+ games). Do NOT mention specific lines that appear in fewer than 10 games
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

      setScanningStatus(`Step 5 complete: Stockfish analysis finished`);
      
      // Small delay to ensure Step 5 complete is visible before moving to Step 6
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setScanningStatus(`Step 6: Generating comprehensive AI analysis report...`);
      const gamesWithPGNCount = allGames.filter(g => g.pgn && g.pgn.trim().length > 20).length;
      console.log(`[Analysis] Calling Gemini API with ${allGames.length} total games (${gamesWithPGNCount} with PGN for analysis)`);

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
                    },
                    description: "Most played move sequences when player had WHITE pieces. Only include sequences from games where the player played as White."
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
                    },
                    description: "Most played move sequences when player had BLACK pieces. Only include sequences from games where the player played as Black."
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
      reportData.player.currentRating = identity.fideProfile?.rating; // undefined when not found → show "Not found"
      reportData.player.uscfRating = identity.uscfProfile?.rating;
      reportData.player.fideId = fideId || '';
      reportData.player.uscfId = uscfId || '';
      reportData.player.country = identity.fideProfile?.federation || identity.uscfProfile?.name?.split(',')?.pop()?.trim() || 'USA';
      
      // Ensure all required arrays exist
      reportData.strengths = reportData.strengths || [];
      reportData.weaknesses = reportData.weaknesses || [];
      reportData.suggestedLines = reportData.suggestedLines || [];
      reportData.mostPlayedLines = reportData.mostPlayedLines || { white: [], black: [] };
      
      // Use actual stats from generateStats for graphs (not Gemini output) - ensures all openings shown
      const validateOpeningStats = (openings: typeof reportData.whiteOpenings) => {
        return openings.map(op => {
          const wins = Math.round(typeof op.wins === 'number' && !isNaN(op.wins) ? op.wins : 0);
          const draws = Math.round(typeof op.draws === 'number' && !isNaN(op.draws) ? op.draws : 0);
          const losses = Math.round(typeof op.losses === 'number' && !isNaN(op.losses) ? op.losses : 0);
          const totalGames = Math.max(wins + draws + losses, Math.round(typeof op.totalGames === 'number' && !isNaN(op.totalGames) ? op.totalGames : 0));
          const winRate = totalGames > 0 ? wins / totalGames : 0;
          const clampedWinRate = Math.max(0, Math.min(1, winRate));
          return {
            ...op,
            wins, draws, losses,
            totalGames: totalGames || wins + draws + losses,
            winRate: clampedWinRate,
            frequency: typeof op.frequency === 'number' && !isNaN(op.frequency) ? Math.max(0, Math.min(1, op.frequency)) : 0
          };
        });
      };

      reportData.whiteOpenings = validateOpeningStats(whiteStats && whiteStats.length > 0 ? whiteStats : (reportData.whiteOpenings || []));
      reportData.blackDefenses = validateOpeningStats(blackStats && blackStats.length > 0 ? blackStats : (reportData.blackDefenses || []));
      reportData.mostPlayedLines = mostPlayedLinesForPrompt || { white: [], black: [] };
      
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
      
      console.log('[Analysis] Report data validated and prepared for saving');

      // 4. Persistence Save (Supabase)
      try {
        const player = await playerRepository.createVerifiedPlayer({
          full_name: identity.verifiedName,
          fide_id: fideId,
          uscf_id: uscfId,
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

      // Attach games data for analysis board - limit to requested amount
      reportData.games = allGames.slice(0, gameLimit);
      
      // Store engine depth used for this analysis
      (reportData as any).engineDepth = engineDepth;
      
      // Store the actual username from games for better matching in AnalysisBoard
      // This ensures we can correctly identify which side the player is on
      if (allGames.length > 0 && targetUsernameForStats) {
        // Find the actual username from games (might differ from provided username)
        const firstGame = allGames[0];
        const usernameLower = targetUsernameForStats.toLowerCase().trim();
        const actualUsername = 
          (firstGame.white.toLowerCase().trim() === usernameLower || firstGame.white.toLowerCase().includes(usernameLower)) 
            ? firstGame.white 
            : (firstGame.black.toLowerCase().trim() === usernameLower || firstGame.black.toLowerCase().includes(usernameLower))
            ? firstGame.black
            : targetUsernameForStats;
        
        // Store in player metadata for AnalysisBoard to use
        if (!reportData.player.platforms) {
          reportData.player.platforms = {};
        }
        // Store actual username from games (not just the platform username)
        (reportData.player as any).actualUsername = actualUsername;
      }
      
      console.log('[Analysis] Report generated successfully, calling onReportGenerated');
      onReportGenerated(reportData);
      setScanningStatus('Step 6 complete: Report generated successfully!');
      
      // Clear loading state after a brief delay to show completion
      setTimeout(() => {
        setLoading(false);
        setScanningStatus('');
      }, 2000);
      
      // Clear form data after successful search
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
                        <span className="font-semibold">1,000 games</span> is the default number of games analyzed. You can analyze up to <span className="font-semibold">5,000 games</span> for more comprehensive analysis (may take longer).
                      </p>
                    </div>

                    {/* Range Slider */}
                    <div className="space-y-3">
                      <div className="relative">
                        <input
                          type="range"
                          min="500"
                          max="5000"
                          step="500"
                          value={gameLimit}
                          onChange={(e) => setGameLimit(Number(e.target.value))}
                          disabled={loading}
                          className="w-full h-2.5 bg-slate-800 dark:bg-slate-800 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: `linear-gradient(to right, rgb(99, 102, 241) 0%, rgb(99, 102, 241) ${((gameLimit - 500) / (5000 - 500)) * 100}%, rgb(30, 41, 59) ${((gameLimit - 500) / (5000 - 500)) * 100}%, rgb(30, 41, 59) 100%)`
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

                  <div className="relative group">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-500 text-gray-600 mb-3 uppercase tracking-widest">Stockfish Engine Depth</label>
                    
                    {/* Info Bar */}
                    <div className="mb-4 flex items-start gap-2 p-3 bg-blue-900/10 dark:bg-blue-900/10 bg-blue-50 border border-blue-500/20 dark:border-blue-500/20 border-blue-200 rounded-lg">
                      <Info className="w-4 h-4 text-blue-400 dark:text-blue-400 text-blue-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-300 dark:text-blue-300 text-blue-700">
                        <span className="font-semibold">Depth {engineDepth}</span> controls how deeply Stockfish analyzes each position. Higher depth (10-15) provides more accurate analysis but takes longer. Lower depth (5-9) is faster but less precise.
                      </p>
                    </div>

                    {/* Range Slider */}
                    <div className="space-y-3">
                      <div className="relative">
                        <input
                          type="range"
                          min="5"
                          max="15"
                          step="1"
                          value={engineDepth}
                          onChange={(e) => setEngineDepth(Number(e.target.value))}
                          disabled={loading}
                          className="w-full h-2.5 bg-slate-800 dark:bg-slate-800 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-thumb disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: `linear-gradient(to right, rgb(59, 130, 246) 0%, rgb(59, 130, 246) ${((engineDepth - 5) / (15 - 5)) * 100}%, rgb(30, 41, 59) ${((engineDepth - 5) / (15 - 5)) * 100}%, rgb(30, 41, 59) 100%)`
                          }}
                        />
                      </div>
                      
                      {/* Value Display */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 dark:bg-slate-800/50 bg-gray-100 rounded-lg border border-blue-500/20 dark:border-blue-500/20 border-blue-200">
                          <span className="text-lg font-bold text-blue-400 dark:text-blue-400 text-blue-600">
                            Depth {engineDepth}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-400 text-gray-600">
                            {engineDepth <= 8 ? 'Fast' : engineDepth <= 12 ? 'Balanced' : 'Deep'}
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
