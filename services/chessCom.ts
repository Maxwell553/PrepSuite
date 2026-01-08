
import { PlayerMetadata } from '../types';

const BASE_URL = '/chess-api/pub/player';

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

export const chessComService = {
  async getPlayerProfile(username: string): Promise<ChessComProfile | null> {
    if (!username) return null;
    const url = `${BASE_URL}/${username}`;
    console.log(`[ChessCom] Fetching profile for: ${username} at ${url}`);
    try {
      const response = await fetch(url);

      console.log(`[ChessCom] Profile Response Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const text = await response.text();
        console.error(`[ChessCom] Profile Fetch Failed Body: ${text.substring(0, 200)}`);

        if (response.status === 404 || response.status === 410) {
          console.warn(`[ChessCom] Player "${username}" not found/gone (${response.status}). Returning null.`);
          return null;
        }
        throw new Error(`Failed to fetch player profile: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error(`[ChessCom] Network/Proxy Error:`, error);
      throw error;
    }
  },

  async getPlayerStats(username: string): Promise<ChessComStats> {
    if (!username) return {} as ChessComStats;
    const url = `${BASE_URL}/${username}/stats`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[ChessCom] Stats Fetch Failed for ${username}: ${response.status}`);
      throw new Error(`Failed to fetch player stats for "${username}" (${response.status})`);
    }
    return response.json();
  },

  async getRecentGames(username: string): Promise<any[]> {
    if (!username) return [];
    // 1. Get list of archives
    const archivesUrl = `${BASE_URL}/${username}/games/archives`;
    const archivesRes = await fetch(archivesUrl);
    if (!archivesRes.ok) {
      console.error(`[ChessCom] Archives Fetch Failed for ${username}: ${archivesRes.status}`);
      throw new Error(`Failed to fetch archives for "${username}" (${archivesRes.status})`);
    }
    const archivesData = await archivesRes.json();
    const archives = archivesData.archives;

    if (!archives || archives.length === 0) return [];

    // 2. Get the most recent monthly archive
    const lastArchiveUrl = archives[archives.length - 1];
    const gamesRes = await fetch(lastArchiveUrl);
    if (!gamesRes.ok) {
      console.error(`[ChessCom] Monthly Games Fetch Failed for ${username}: ${gamesRes.status}`);
      throw new Error(`Failed to fetch recent games for "${username}" (${gamesRes.status})`);
    }

    const gamesData = await gamesRes.json();
    // Return last 50 games to avoid overwhelming the LLM
    return gamesData.games.slice(-50);
  }
};
