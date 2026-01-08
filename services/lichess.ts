
export interface LichessProfile {
    id: string;
    username: string;
    perfs: {
        blitz?: { rating: number };
        rapid?: { rating: number };
        classical?: { rating: number };
    };
    profile?: {
        firstName?: string;
        lastName?: string;
        country?: string;
        bio?: string;
    };
    title?: string;
}

const BASE_URL = '/lichess-api';

export const lichessService = {
    async getPlayerProfile(username: string): Promise<LichessProfile | null> {
        if (!username) return null;
        const url = `${BASE_URL}/user/${username}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error(`Lichess profile fetch failed: ${response.status}`);
            }
            return response.json();
        } catch (error) {
            console.error('[Lichess] Profile fetch error:', error);
            return null;
        }
    },

    async getRecentGames(username: string, limit: number = 50): Promise<string> {
        if (!username) return '';
        // Lichess returns NDJSON or PGN based on Accept header
        // For processing, NDJSON is often easier but PGN is more standard for chess tools
        const url = `${BASE_URL}/games/user/${username}?max=${limit}&opening=true`;
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/x-ndjson'
                }
            });
            if (!response.ok) {
                throw new Error(`Lichess games fetch failed: ${response.status}`);
            }
            return response.text(); // This will be multiple JSON objects separated by newlines
        } catch (error) {
            console.error('[Lichess] Games fetch error:', error);
            return '';
        }
    }
};
