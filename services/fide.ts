
export interface FideProfile {
    name: string;
    federation: string;
    birthYear: string;
    rating: number;
    title: string;
}

export const fideService = {
    async getProfile(fideId: string): Promise<FideProfile | null> {
        try {
            // Use proxy path in dev, direct in prod (if we had a backend)
            // For now, this only works if the Vite proxy is active.
            const response = await fetch(`/fide-proxy/profile/${fideId}`);

            if (!response.ok) {
                // If 404, truly null. If 500/403, might be failure but return null per contract
                console.warn(`FIDE Error for ${fideId}: ${response.status}`);
                return null;
            }

            const html = await response.text();

            // 1. NAME EXTRACTION
            // Strategy A: <title> tag (most robust if site structure changes)
            const titleMatch = html.match(/<title>([^<]+) FIDE Profile<\/title>/i);

            // Strategy B: .player-title class (current layout)
            const playerTitleMatch = html.match(/class="player-title">([^<]+)<\/h1>/i);

            // Strategy C: Old layout fallback
            const oldDivMatch = html.match(/<div class="profile-top-title">([^<]+)<\/div>/);

            const rawName = titleMatch ? titleMatch[1] : (playerTitleMatch ? playerTitleMatch[1] : (oldDivMatch ? oldDivMatch[1] : null));

            if (!rawName) {
                console.warn(`FIDE: Could not find name for ID ${fideId}. HTML Length: ${html.length}`);
                return null;
            }

            // 2. RATING EXTRACTION
            // New structure: <div class="profile-standart ..."><p>2840</p><p...>STANDARD</p></div>
            // We search for the profile-standart container and then get the first <p> value inside it
            let rating = 0;
            const containerMatch = html.match(/class="profile-standart[^>]*>[\s\S]*?<p>(\d+)<\/p>/i);
            if (containerMatch) {
                rating = parseInt(containerMatch[1]);
            } else {
                // Secondary fallbacks
                const fallbackRating = html.match(/Std\. rating[\s\S]*?>(\d+)/i);
                const tableRating = html.match(/profile-standart[\s\S]*?<p>(\d+)<\/p>/i);
                rating = fallbackRating ? parseInt(fallbackRating[1]) : (tableRating ? parseInt(tableRating[1]) : 0);
            }

            // 3. FEDERATION & BIRTH YEAR
            const fedMatch = html.match(/class="profile-info-country\s*"[^>]*>[\s\n]*((?:<img[^>]*>)?[\s\n]*([^<]*))/i);
            const bYearMatch = html.match(/class="profile-info-byear\s*"[^>]*>[\s\n]*(\d{4})/i);

            return {
                name: rawName.trim(),
                federation: fedMatch ? fedMatch[2].trim() : '',
                birthYear: bYearMatch ? bYearMatch[1].trim() : '',
                rating: rating,
                title: ''
            };
        } catch (error) {
            console.warn('FIDE Scrape Failed:', error);
            return null;
        }
    }
};
