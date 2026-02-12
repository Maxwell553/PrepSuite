
import { PlayerMetadata } from '../types';

const BASE_URL = '/chess-api/pub/player';
const USER_AGENT = 'PrepSuite-Scout/1.0 (contact@example.com)';

export interface ChessComProfile {
  avatar?: string;
  name?: string;
  username: string;
  followers: number;
  country: string;
  last_online: number;
  joined: number;
  status: string;
  is_streamer: boolean;
  verified: boolean;
  league?: string;
}

export interface ChessComStats {
  chess_rapid?: { last: { rating: number } };
  chess_blitz?: { last: { rating: number } };
  chess_bullet?: { last: { rating: number } };
  fide?: number;
}

// Simple retry + delay helper
async function fetchWithRetry(url: string, retries = 2, delayMs = 1000): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT }
      });
      if (res.status === 429) {
        console.warn(`[ChessCom] Rate limit hit (429) for ${url}. Waiting ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs * (i + 1))); // Exponential backoff
        continue;
      }
      if (res.status >= 500 && i < retries) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      return res;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error('Max retries reached');
}

export const chessComService = {
  /**
   * Searches Chess.com's Top Players database for a player by name or FIDE ID
   * Returns the player slug/identifier if found in the top players database
   */
  async searchTopPlayersDatabase(playerName: string, fideId?: string): Promise<string | null> {
    console.log(`[ChessCom] Searching Top Players database for: ${playerName}${fideId ? ` (FIDE: ${fideId})` : ''}`);
    
    try {
      // Use Gemini search to find the player in Chess.com's top players database
      // The URL format is typically: https://www.chess.com/players/{slug}
      // We'll search for the player name + "chess.com players" to find their top players page
      const searchQuery = `site:chess.com/players ${playerName}${fideId ? ` FIDE ${fideId}` : ''}`;
      
      // For now, we'll return null and let the identity service handle the search
      // The identity service already uses Gemini search which should find these URLs
      // This function can be expanded later if we need direct access
      console.log(`[ChessCom] Top Players search would use query: ${searchQuery}`);
      return null;
    } catch (error) {
      console.error(`[ChessCom] Error searching Top Players database:`, error);
      return null;
    }
  },

  /**
   * Attempts to fetch games for a player using their Top Players database slug
   * Some top players may have games accessible even without a regular account
   */
  async getGamesFromTopPlayersSlug(slug: string): Promise<any[]> {
    console.log(`[ChessCom] Attempting to fetch games using Top Players slug: ${slug}`);
    
    try {
      // Try to use the slug as a username - some top players might have accounts
      // with the same identifier as their top players page slug
      const games = await this.getRecentGames(slug, true);
      if (games && games.length > 0) {
        console.log(`[ChessCom] Successfully fetched ${games.length} games using Top Players slug: ${slug}`);
        return games;
      }
      
      // If that doesn't work, the player likely doesn't have games accessible via API
      // The top players database is mainly for profiles, not game access
      console.log(`[ChessCom] No games found for Top Players slug: ${slug}`);
      return [];
    } catch (error) {
      console.warn(`[ChessCom] Could not fetch games for Top Players slug ${slug}:`, error);
      return [];
    }
  },

  async getPlayerProfile(username: string): Promise<ChessComProfile | null> {
    if (!username) return null;
    // Chess.com API is case-insensitive but URL encode to be safe
    const encodedUsername = encodeURIComponent(username.toLowerCase());
    const url = `${BASE_URL}/${encodedUsername}`;
    console.log(`[ChessCom] Fetching profile for: ${username} (URL: ${url})`);
    try {
      const response = await fetchWithRetry(url);

      if (!response.ok) {
        if (response.status === 404 || response.status === 410) {
          return null;
        }
        throw new Error(`Failed to fetch player profile: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error(`[ChessCom] Error:`, error);
      throw error;
    }
  },

  async getPlayerStats(username: string): Promise<ChessComStats> {
    if (!username) return {} as ChessComStats;
    const encodedUsername = encodeURIComponent(username.toLowerCase());
    const url = `${BASE_URL}/${encodedUsername}/stats`;
    console.log(`[ChessCom] Fetching stats for: ${username} (URL: ${url})`);
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch player stats for "${username}" (${response.status})`);
    }
    return response.json();
  },

  /**
   * Fetches games from Chess.com for a player
   * Fetches ALL games regardless of time control (rapid, blitz, bullet, classical, etc.)
   * @param username - Chess.com username
   * @param deep - Whether to fetch from multiple archives (default: true)
   * @param limit - Maximum number of games to fetch (default: 5000)
   * @returns Array of up to limit most recent games
   */
  async getRecentGames(username: string, deep: boolean = true, limit: number = 5000): Promise<any[]> {
    if (!username) {
      console.warn('[ChessCom] getRecentGames called with empty username');
      return [];
    }
    
    try {
      const encodedUsername = encodeURIComponent(username.toLowerCase());
      const archivesUrl = `${BASE_URL}/${encodedUsername}/games/archives`;
      console.log(`[ChessCom] Fetching archives for ${username} from: ${archivesUrl} (all time controls)`);
      
      const archivesRes = await fetchWithRetry(archivesUrl);
      console.log(`[ChessCom] Archives response status: ${archivesRes.status}`);
      
      if (!archivesRes.ok) {
        const errorText = await archivesRes.text().catch(() => 'Unable to read error');
        console.error(`[ChessCom] Archives fetch failed: ${archivesRes.status} - ${errorText}`);
        throw new Error(`Archives fetch failed: ${archivesRes.status}`);
      }

      const archivesData = await archivesRes.json();
      console.log(`[ChessCom] Archives data received:`, archivesData);
      
      const archives = archivesData.archives;
      if (!archives || archives.length === 0) {
        console.warn(`[ChessCom] No archives found for ${username}`);
        return [];
      }

      console.log(`[ChessCom] Found ${archives.length} archive(s) for ${username}`);

      // Chess.com API returns archives in chronological order (oldest to newest)
      // To get the most recent archives going backwards from the current date,
      // we take the last N archives from the array and REVERSE them so we process newest first
      // This ensures we always get the most recent games, including newly played games
      const MAX_RECENT_ARCHIVES = 60; // Most recent 60 monthly archives (going back ~5 years)
      const numArchives = deep ? Math.min(archives.length, MAX_RECENT_ARCHIVES) : 1;
      
      // Get the most recent archives (last N elements, going backwards from current date)
      // REVERSE the order so we process newest archives first - this ensures newly played games are included
      const recentArchives = archives.slice(-numArchives).reverse();
      
      // Log the date range being fetched
      if (recentArchives.length > 0) {
        const firstArchive = recentArchives[0]; // This is now the NEWEST archive
        const lastArchive = recentArchives[recentArchives.length - 1]; // This is now the OLDEST of the recent archives
        // Extract date from archive URL (format: .../games/YYYY/MM)
        const firstDateMatch = firstArchive.match(/\/(\d{4})\/(\d{2})/);
        const lastDateMatch = lastArchive.match(/\/(\d{4})\/(\d{2})/);
        if (firstDateMatch && lastDateMatch) {
          const newestDate = `${firstDateMatch[1]}-${firstDateMatch[2]}`;
          const oldestDate = `${lastDateMatch[1]}-${lastDateMatch[2]}`;
          console.log(`[ChessCom] Fetching most recent ${recentArchives.length} archive(s) from ${newestDate} (newest) back to ${oldestDate} (oldest)`);
        } else {
          console.log(`[ChessCom] Will fetch from ${recentArchives.length} recent archive(s) to maximize game count (target: ${limit} games)`);
        }
      } else {
        console.log(`[ChessCom] Will fetch from ${recentArchives.length} recent archive(s) to maximize game count (target: ${limit} games)`);
      }

      // Throttled batch processing
      // Process 5 archives at a time to speed up fetching
      // Process NEWEST archives first to ensure newly played games are included
      const BATCH_SIZE = 5;
      const MAX_GAMES = limit;
      const allGames: unknown[] = [];

      for (let i = 0; i < recentArchives.length; i += BATCH_SIZE) {
        // Stop early if we've already reached the max games
        // Since we're processing newest first, we've already got the most recent games
        if (allGames.length >= MAX_GAMES) {
          console.log(`[ChessCom] Already reached ${MAX_GAMES} games, stopping archive fetching (newest games already included)`);
          break;
        }
        
        const batch = recentArchives.slice(i, i + BATCH_SIZE);
        console.log(`[ChessCom] Fetching batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} archive(s)) for ${username}... (current total: ${allGames.length} games)`);

        const batchResults = await Promise.all(batch.map(async (url: string) => {
          try {
            // Convert full Chess.com API URL to proxy path
            // e.g., https://api.chess.com/pub/player/username/games/2025/02
            // becomes /chess-api/pub/player/username/games/2025/02
            let proxyUrl = url;
            if (url.startsWith('https://api.chess.com/')) {
              proxyUrl = url.replace('https://api.chess.com', '/chess-api');
            } else if (!url.startsWith('/chess-api')) {
              // If it's a relative URL, ensure it uses the proxy
              proxyUrl = `/chess-api${url.startsWith('/') ? '' : '/'}${url}`;
            }
            
            console.log(`[ChessCom] Fetching games from archive: ${url}`);
            console.log(`[ChessCom] Using proxy URL: ${proxyUrl}`);
            
            const res = await fetchWithRetry(proxyUrl);
            console.log(`[ChessCom] Archive response status: ${res.status} for ${proxyUrl}`);
            
            if (!res.ok) {
              const errorText = await res.text().catch(() => 'Unable to read error');
              console.warn(`[ChessCom] Archive fetch failed for ${proxyUrl}: ${res.status} - ${errorText.substring(0, 200)}`);
              return [];
            }
            
          const data = await res.json();
            console.log(`[ChessCom] Archive response data keys:`, Object.keys(data || {}));
            console.log(`[ChessCom] Archive response has 'games' key:`, 'games' in (data || {}));
            
            const games = data.games || [];
            console.log(`[ChessCom] Retrieved ${games.length} games from ${proxyUrl}`);
            if (games.length > 0) {
              console.log(`[ChessCom] Sample game keys:`, Object.keys(games[0] || {}));
            } else {
              console.warn(`[ChessCom] No games found in archive ${proxyUrl}. Response structure:`, JSON.stringify(data).substring(0, 500));
            }
            return games;
          } catch (err) {
            console.error(`[ChessCom] Error fetching archive ${url}:`, err);
            if (err instanceof Error) {
              console.error(`[ChessCom] Error message: ${err.message}`);
              console.error(`[ChessCom] Error stack:`, err.stack);
            }
            return [];
          }
        }));

        const gamesInBatch = batchResults.reduce((sum, games) => sum + games.length, 0);
        console.log(`[ChessCom] Batch ${Math.floor(i / BATCH_SIZE) + 1} complete: ${gamesInBatch} games`);
        batchResults.forEach(games => allGames.push(...games));

        // Small delay between batches to respect rate limits
        if (i + BATCH_SIZE < recentArchives.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      // Sort all games by end_time (most recent first) to ensure we have the newest games
      // Games within each archive are in chronological order (oldest first), so we need to sort
      const sortedGames = allGames.sort((a: any, b: any) => {
        const timeA = a.end_time || 0;
        const timeB = b.end_time || 0;
        return timeB - timeA; // Most recent first (descending order)
      });

      // Return up to limit most recent games
      const maxGames = limit;
      const finalGames = sortedGames.slice(0, maxGames); // Take first limit (most recent)
      console.log(`[ChessCom] Total games fetched for ${username}: ${allGames.length}, returning ${finalGames.length} most recent games (max ${maxGames})`);
      return finalGames;
    } catch (error) {
      console.error(`[ChessCom] Games fetch failed for ${username}:`, error);
      if (error instanceof Error) {
        console.error(`[ChessCom] Error details: ${error.message}`);
        console.error(`[ChessCom] Error stack:`, error.stack);
      }
      return [];
    }
  }
};
