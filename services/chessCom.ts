
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
   * Fetches the last 1000 games from Chess.com for a player
   * Fetches ALL games regardless of time control (rapid, blitz, bullet, classical, etc.)
   * @param username - Chess.com username
   * @param deep - Whether to fetch from multiple archives (default: true)
   * @returns Array of up to 1000 most recent games
   */
  async getRecentGames(username: string, deep: boolean = true): Promise<any[]> {
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

      // Fetch from as many archives as needed to maximize game count (up to 1000 games)
      // Each archive typically has 50-200 games, so fetch from recent archives
      // Fetch from up to 60 archives to ensure we get close to the 1000 game limit
      const numArchives = deep ? Math.min(archives.length, 60) : 1;
      const recentArchives = archives.slice(-numArchives);
      console.log(`[ChessCom] Will fetch from ${recentArchives.length} recent archive(s) to maximize game count (target: 1000 games)`);

      // Throttled batch processing
      // Process 5 archives at a time to speed up fetching
      const BATCH_SIZE = 5;
      const MAX_GAMES = 1000; // Increased limit to 1000 games
      const allGames: unknown[] = [];

      for (let i = 0; i < recentArchives.length; i += BATCH_SIZE) {
        // Stop early if we've already reached the max games
        if (allGames.length >= MAX_GAMES) {
          console.log(`[ChessCom] Already reached ${MAX_GAMES} games, stopping archive fetching`);
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

      // Return up to 1000 games
      // Take the most recent games (they're already in chronological order from archives)
      const maxGames = 1000;
      const finalGames = allGames.slice(-maxGames);
      console.log(`[ChessCom] Total games fetched for ${username}: ${allGames.length}, returning ${finalGames.length} (max ${maxGames})`);
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
