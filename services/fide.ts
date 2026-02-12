
export interface FideProfile {
    name: string;
    federation: string;
    birthYear: string;
    rating: number;
    title: string;
}

/**
 * Fetches FIDE profile via HTML scraping only (APIs removed - they return wrong data)
 */
async function fetchFromHTMLScraping(fideId: string): Promise<FideProfile | null> {
    try {
        const response = await fetch(`/fide-proxy/profile/${fideId}`, {
            signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        if (!response.ok) {
            console.warn(`[FIDE] HTML scraping failed for ${fideId}: ${response.status}`);
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
            console.warn(`[FIDE] Could not find name for ID ${fideId}. HTML Length: ${html.length}`);
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

        // 4. TITLE EXTRACTION
        // FIDE titles are typically displayed as GM, IM, FM, CM, WGM, WIM, WFM, WCM, NM, WNM
        // They can appear in various places in the HTML:
        // - In profile-info-title class: <div class="profile-info-title">GM</div>
        // - In title span: <span class="title">GM</span>
        // - In the name area: Name (GM) or Name, GM
        // - In the title tag: <title>Name GM FIDE Profile</title>
        
        let title = '';
        
        // Strategy A: Look for title in profile-info-title class (most common)
        const profileTitleMatch = html.match(/class="profile-info-title\s*"[^>]*>[\s\n]*([A-Z]{2,4})/i);
        if (profileTitleMatch && profileTitleMatch[1]) {
            title = profileTitleMatch[1].trim().toUpperCase();
        } else {
            // Strategy B: Look for title span/div with class="title"
            const titleSpanMatch = html.match(/<span[^>]*class=["']title["'][^>]*>[\s\n]*([A-Z]{2,4})[\s\n]*<\/span>/i);
            if (titleSpanMatch && titleSpanMatch[1]) {
                title = titleSpanMatch[1].trim().toUpperCase();
            } else {
                // Strategy C: Look for title div
                const titleDivMatch = html.match(/<div[^>]*class=["']title["'][^>]*>[\s\n]*([A-Z]{2,4})[\s\n]*<\/div>/i);
                if (titleDivMatch && titleDivMatch[1]) {
                    title = titleDivMatch[1].trim().toUpperCase();
                } else {
                    // Strategy D: Look for common title patterns near the name
                    // Pattern: Name (GM) or Name, GM or Name GM
                    const titleInNameMatch = html.match(/(?:\(|,|\s)(GM|IM|FM|CM|WGM|WIM|WFM|WCM|NM|WNM)(?:\)|,|\s|$)/i);
                    if (titleInNameMatch && titleInNameMatch[1]) {
                        title = titleInNameMatch[1].trim().toUpperCase();
                    } else {
                        // Strategy E: Look in the title tag itself
                        const titleTagMatch = html.match(/<title>[^<]*\s(GM|IM|FM|CM|WGM|WIM|WFM|WCM|NM|WNM)/i);
                        if (titleTagMatch && titleTagMatch[1]) {
                            title = titleTagMatch[1].trim().toUpperCase();
                        }
                    }
                }
            }
        }
        
        // Validate that extracted title is a valid FIDE title
        const validTitles = ['GM', 'IM', 'FM', 'CM', 'WGM', 'WIM', 'WFM', 'WCM', 'NM', 'WNM'];
        if (title && !validTitles.includes(title)) {
            console.warn(`[FIDE] Extracted invalid title: ${title}, setting to empty`);
            title = '';
        }
        
        if (title) {
            console.log(`[FIDE] Extracted title: ${title} for player ${rawName.trim()}`);
        }

        return {
            name: rawName.trim(),
            federation: fedMatch ? fedMatch[2].trim() : '',
            birthYear: bYearMatch ? bYearMatch[1].trim() : '',
            rating: rating,
            title: title
        };
    } catch (error) {
        console.warn('[FIDE] HTML scraping failed:', error);
        return null;
    }
}

export const fideService = {
    /**
     * Gets FIDE profile with API-first approach and HTML scraping fallback
     * Implements retry logic and error tracking
     */
    async getProfile(fideId: string, retries: number = 2): Promise<FideProfile | null> {
        if (!fideId || fideId.trim() === '') {
            console.warn('[FIDE] Empty FIDE ID provided');
            return null;
        }

        const cleanId = fideId.trim();
        let lastError: Error | null = null;

        // HTML scraping only (no API - APIs return wrong data)
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                console.log(`[FIDE] Attempting HTML scraping for ID ${cleanId} (attempt ${attempt + 1}/${retries + 1})...`);
                const htmlResult = await fetchFromHTMLScraping(cleanId);
                if (htmlResult) {
                    console.log(`[FIDE] Successfully fetched via HTML scraping for ID ${cleanId}`);
                    return htmlResult;
                }

                // If we get here, scraping failed
                if (attempt < retries) {
                    const delayMs = 1000 * (attempt + 1); // Exponential backoff: 1s, 2s
                    console.log(`[FIDE] Retrying after ${delayMs}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.error(`[FIDE] Attempt ${attempt + 1} failed:`, lastError.message);
                
                // Track scraping failures for monitoring
                if (typeof window !== 'undefined') {
                    // Send to error tracking if available
                    try {
                        const Sentry = await import('@sentry/react');
                        Sentry.captureMessage(`FIDE scraping failed for ID ${cleanId}`, {
                            level: 'warning',
                            tags: { service: 'fide', fide_id: cleanId },
                            extra: { attempt: attempt + 1, error: lastError.message },
                        });
                    } catch {
                        // Sentry not available, continue
                    }
                }

                if (attempt < retries) {
                    const delayMs = 1000 * (attempt + 1);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }

        // All attempts failed
        console.error(`[FIDE] All attempts failed for ID ${cleanId}`, lastError);
        return null;
    }
};
