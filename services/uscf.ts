
export interface UscfProfile {
    name: string;
    rating: number;
    state: string;
}

export const uscfService = {
    async getProfile(uscfId: string): Promise<UscfProfile | null> {
        try {
            const response = await fetch(`/uscf-proxy/msa/MbrDtlMain.php?${uscfId}`);

            if (!response.ok) {
                console.warn(`USCF Error for ${uscfId}: ${response.status}`);
                // If the proxy fails, we return null so the identity service can potentially continue with just FIDE
                return null;
            }

            const html = await response.text();

            // 1. NAME EXTRACTION
            // Format: <font size=+1><b>12560382: BERTHOLD FREDRICH</b></font>
            const nameRegex = new RegExp(`<font[^>]*>\\s*<b>\\s*${uscfId}:?\\s*([^<]+)<\\/b>`, 'i');
            const nameMatch = html.match(nameRegex);

            // Generic fallback for name (if ID prefix is missing but name is in the right place)
            const genericNameMatch = html.match(/<font size=["']?\+1["']?>\s*<b>([^<]+)<\/b>/i);

            let rawName = nameMatch ? nameMatch[1] : (genericNameMatch ? genericNameMatch[1].replace(/^\d+:\s*/, '') : null);

            if (!rawName) {
                console.warn(`USCF: Could not find name for ID ${uscfId}. HTML Length: ${html.length}`);
                return null;
            }

            // 2. RATING EXTRACTION
            // Format: Regular Rating ... (Unrated) or <b>2200</b>
            // Cross-cell table match required
            const ratingMatch = html.match(/Regular Rating[\s\S]*?<b>[\s\S]*?(\d+)/i);

            return {
                name: rawName.trim(),
                rating: ratingMatch ? parseInt(ratingMatch[1]) : 0,
                state: ''
            };
        } catch (error) {
            console.warn('USCF Scrape Failed:', error);
            return null;
        }
    }
};
