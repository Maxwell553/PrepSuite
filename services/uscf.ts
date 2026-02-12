
export interface UscfProfile {
    id: string;
    name: string;
    rating: number;
    state: string;
}

/**
 * Tries to fetch USCF profile from the new ratings.uschess.org profile page (HTML scraping only - APIs removed)
 */
async function fetchFromProfilePage(uscfId: string): Promise<UscfProfile | null> {
    try {
        const response = await fetch(`/uscf-proxy/profile/${uscfId}`, {
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            return null;
        }

        const html = await response.text();

        // Name: look for common patterns (MUIR/profile pages)
        const namePatterns = [
            new RegExp(`"name"\\s*:\\s*"([^"]+)"`, 'i'),
            new RegExp(`<h1[^>]*>([^<]+)</h1>`, 'i'),
            new RegExp(`member[name]?["']?\\s*[:=]\\s*["']?([^"'<]+)`, 'i'),
            new RegExp(`<title>([^<]*${uscfId}[^<]*)</title>`, 'i'),
            new RegExp(`data-name=["']([^"']+)["']`, 'i'),
        ];
        let rawName: string | null = null;
        for (const re of namePatterns) {
            const m = html.match(re);
            if (m && m[1].trim().length > 0) {
                rawName = m[1].trim();
                break;
            }
        }

        // Rating: look for rating number
        const ratingMatch = html.match(/"regular"?\s*:\s*(\d+)/i)
            || html.match(/rating["']?\s*[:=]\s*["']?(\d+)/i)
            || html.match(/Regular Rating[\s\S]*?(\d{3,4})/i);
        const rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;

        // State (optional)
        const stateMatch = html.match(/"state"?\s*:\s*"([^"]+)"/i)
            || html.match(/State[\s\S]*?<[^>]*>([A-Z]{2})/i);
        const state = stateMatch ? stateMatch[1].trim() : '';

        if (rawName) {
            return { id: uscfId, name: rawName, rating, state };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Fetches USCF profile via legacy MSA HTML scraping (fallback)
 */
async function fetchFromMSAScraping(uscfId: string): Promise<UscfProfile | null> {
    try {
        const response = await fetch(`/uscf-msa-proxy/MbrDtlMain.php?${uscfId}`, {
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            return null;
        }

        const html = await response.text();

        // Legacy MSA: <font size=+1><b>12560382: BERTHOLD FREDRICH</b></font>
        const nameRegex = new RegExp(`<font[^>]*>\\s*<b>\\s*${uscfId}:?\\s*([^<]+)<\\/b>`, 'i');
        const nameMatch = html.match(nameRegex);
        const genericNameMatch = html.match(/<font size=["']?\+1["']?>\s*<b>([^<]+)<\/b>/i);
        let rawName = nameMatch ? nameMatch[1] : (genericNameMatch ? genericNameMatch[1].replace(/^\d+:\s*/, '') : null);

        if (!rawName) {
            return null;
        }

        const ratingMatch = html.match(/Regular Rating[\s\S]*?<b>[\s\S]*?(\d+)/i);
        const stateMatch = html.match(/State[\s\S]*?<b>([^<]+)<\/b>/i);
        const state = stateMatch ? stateMatch[1].trim() : '';

        return {
            id: uscfId,
            name: rawName.trim(),
            rating: ratingMatch ? parseInt(ratingMatch[1]) : 0,
            state,
        };
    } catch {
        return null;
    }
}

/**
 * Fetches USCF profile via HTML scraping (tries new profile page, then legacy MSA)
 */
async function fetchFromHTMLScraping(uscfId: string): Promise<UscfProfile | null> {
    const fromProfile = await fetchFromProfilePage(uscfId);
    if (fromProfile) {
        return fromProfile;
    }
    const fromMSA = await fetchFromMSAScraping(uscfId);
    if (fromMSA) {
        return fromMSA;
    }
    console.warn(`[USCF] Could not find name for ID ${uscfId} (tried profile and MSA pages).`);
    return null;
}

export const uscfService = {
    /**
     * Gets USCF profile with API-first approach and HTML scraping fallback
     * Implements retry logic and error tracking
     */
    async getProfile(uscfId: string, retries: number = 2): Promise<UscfProfile | null> {
        if (!uscfId || uscfId.trim() === '') {
            console.warn('[USCF] Empty USCF ID provided');
            return null;
        }

        const cleanId = uscfId.trim();
        let lastError: Error | null = null;

        // HTML scraping only (no API - APIs return wrong data)
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                console.log(`[USCF] Attempting HTML scraping for ID ${cleanId} (attempt ${attempt + 1}/${retries + 1})...`);
                const htmlResult = await fetchFromHTMLScraping(cleanId);
                if (htmlResult) {
                    console.log(`[USCF] Successfully fetched via HTML scraping for ID ${cleanId}`);
                    return htmlResult;
                }

                // If we get here, scraping failed
                if (attempt < retries) {
                    const delayMs = 1000 * (attempt + 1); // Exponential backoff: 1s, 2s
                    console.log(`[USCF] Retrying after ${delayMs}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.error(`[USCF] Attempt ${attempt + 1} failed:`, lastError.message);
                
                // Track scraping failures for monitoring
                if (typeof window !== 'undefined') {
                    // Send to error tracking if available
                    try {
                        const Sentry = await import('@sentry/react');
                        Sentry.captureMessage(`USCF scraping failed for ID ${cleanId}`, {
                            level: 'warning',
                            tags: { service: 'uscf', uscf_id: cleanId },
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
        console.error(`[USCF] All attempts failed for ID ${cleanId}`, lastError);
        return null;
    }
};
