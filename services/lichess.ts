
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
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json' }
            });
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

    async getRecentGames(username: string, limit: number = 5000): Promise<string> {
        if (!username) return '';

        // Lichess API allows up to 500 games per request, so we need pagination
        // Fetch up to 5000 games by making multiple requests if needed
        const targetGames = Math.min(limit, 5000);
        const gamesPerRequest = 500;
        const numRequests = Math.ceil(targetGames / gamesPerRequest);
        
        console.log(`[Lichess] Fetching up to ${targetGames} games for ${username} (${numRequests} request(s))`);
        
        const allGames: string[] = [];
        
        try {
            for (let i = 0; i < numRequests; i++) {
                const maxGames = Math.min(gamesPerRequest, targetGames - (i * gamesPerRequest));
                // Request PGNs in the JSON response - Lichess API includes PGN by default in JSON format
                // But we explicitly request it to ensure it's included
                // Note: Lichess API returns PGNs in the 'pgn' field when Accept: application/x-ndjson is used
                // Include moves so we have PGN (or moves array) for game playback; pgnInJson asks for full PGN in JSON when supported
                const url = `${BASE_URL}/games/user/${username}?max=${maxGames}&opening=true&moves=true&pgnInJson=true`;
                
                console.log(`[Lichess] Fetching batch ${i + 1}/${numRequests}: up to ${maxGames} games from: ${url}`);
                
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/x-ndjson'
                }
            });
                
                console.log(`[Lichess] Batch ${i + 1} response status: ${response.status}`);
                
            if (!response.ok) {
                if (response.status === 429) {
                    console.error('[Lichess] Rate limit exceeded.');
                        break; // Stop fetching if rate limited
                    }
                    const errorText = await response.text().catch(() => 'Unable to read error');
                    console.error(`[Lichess] Batch ${i + 1} fetch failed: ${response.status} - ${errorText.substring(0, 200)}`);
                    if (i === 0) {
                        // If first request fails, throw error
                throw new Error(`Lichess games fetch failed: ${response.status}`);
            }
                    break; // If subsequent requests fail, return what we have
                }
                
                const text = await response.text();
                const gameLines = text.trim().split('\n').filter(line => line.trim().length > 0);
                
                if (gameLines.length === 0) {
                    console.log(`[Lichess] Batch ${i + 1} returned no games, stopping`);
                    break; // No more games available
                }
                
                // Sample first game to check if PGNs are included
                if (i === 0 && gameLines.length > 0) {
                    try {
                        const sampleGame = JSON.parse(gameLines[0]);
                        const hasPgn = !!(sampleGame.pgn || sampleGame.moves);
                        console.log(`[Lichess] Sample game check - Has PGN: ${hasPgn}, Has moves array: ${!!sampleGame.moves}, Available fields:`, Object.keys(sampleGame));
                        if (!hasPgn) {
                            console.warn(`[Lichess] WARNING: Games are missing PGN data. The API might not be returning PGNs.`);
                        }
                    } catch (e) {
                        console.warn(`[Lichess] Could not parse sample game to check PGN availability:`, e);
                    }
                }
                
                allGames.push(...gameLines);
                console.log(`[Lichess] Batch ${i + 1} retrieved ${gameLines.length} games (total so far: ${allGames.length})`);
                
                // If we got fewer games than requested, we've reached the end
                if (gameLines.length < maxGames) {
                    console.log(`[Lichess] Received fewer games than requested, reached end of game history`);
                    break;
                }
                
                // Small delay between requests to respect rate limits
                if (i < numRequests - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            
            const finalText = allGames.slice(0, targetGames).join('\n');
            console.log(`[Lichess] Retrieved ${allGames.length} total games for ${username}, returning ${Math.min(allGames.length, targetGames)}`);
            
            return finalText;
        } catch (error) {
            console.error('[Lichess] Games fetch error:', error);
            if (error instanceof Error) {
                console.error('[Lichess] Error details:', error.message);
            }
            // Return what we have so far, even if there was an error
            return allGames.slice(0, targetGames).join('\n');
        }
    }
};
