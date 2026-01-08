
import { GoogleGenAI } from "@google/genai";
import { fideService, FideProfile } from './fide';
import { uscfService, UscfProfile } from './uscf';
import { chessComService } from './chessCom';
import { lichessService } from './lichess';

export interface ResolvedIdentity {
    verifiedName: string;
    fideProfile: FideProfile | null;
    uscfProfile: UscfProfile | null;
    chessComUsername: string;
    lichessUsername: string;
    confidence: number;
}

export const identityService = {
    async resolve(inputName: string, fideId: string, uscfId: string): Promise<ResolvedIdentity> {

        // 1. Parallel Validation
        const [fideProfile, uscfProfile] = await Promise.all([
            fideId ? fideService.getProfile(fideId) : Promise.resolve(null),
            uscfId ? uscfService.getProfile(uscfId) : Promise.resolve(null)
        ]);

        console.log('[Identity] Validation Results:', {
            fide: fideProfile ? 'FOUND: ' + fideProfile.name : 'NOT FOUND',
            uscf: uscfProfile ? 'FOUND: ' + uscfProfile.name : 'NOT FOUND'
        });

        if (!fideProfile && !uscfProfile) {
            throw new Error("Identity Verification Failed: Neither FIDE nor USCF IDs returned a valid profile.");
        }

        const officialName = fideProfile?.name || uscfProfile?.name || inputName;
        console.log('[Identity] Official Name resolved to:', officialName);

        // 2. AI Resolution for Online Handles
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const model = 'gemini-3-flash-preview';

        const prompt = `
      You are an elite chess investigator with access to Google Search.
      
      Target Player:
      Name: "${officialName}"
      FIDE Rating: ${fideProfile?.rating || 'N/A'} (ID: ${fideId})
      USCF Rating: ${uscfProfile?.rating || 'N/A'} (ID: ${uscfId})
      Birth Year: ${fideProfile?.birthYear || 'N/A'}
      Federation: ${fideProfile?.federation || 'USA'}

      Task: 
      1. Search the web to find this player's official Chess.com and Lichess profiles.
      2. Do NOT just guess usernames based on the name. Many players use handles (e.g., "Ace0fD1amonds").
      3. Look for profile metadata that matches the real name, federation, or title.
      4. If a player is a titled player (GM, IM, FM, NM), they are more likely to have a verified profile.
      5. Return JSON ONLY: { "chessComCandidates": ["found_username1", ...], "lichessCandidates": ["found_username1", ...], "confidence": number }
    `;

        try {
            const result = await ai.models.generateContent({
                model: model,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                // @ts-ignore
                tools: [{ googleSearchRetrieval: {} }],
                generationConfig: { responseMimeType: "application/json" }
            });

            const data = JSON.parse(result.text);
            const chessComCandidates = data.chessComCandidates || [];
            const lichessCandidates = data.lichessCandidates || [];

            console.log(`[Identity] Generated Chess.com candidates:`, chessComCandidates);
            console.log(`[Identity] Generated Lichess candidates:`, lichessCandidates);

            // Verification Helper
            const verifyHandle = async (usernameInput: string, platform: 'chess.com' | 'lichess', candidates: string[]) => {
                let username = usernameInput;

                // Extract from URL if necessary
                if (username.includes('/') || username.includes('http')) {
                    const parts = username.split('/');
                    username = parts[parts.length - 1] || parts[parts.length - 2];
                }

                if (!username || /[^a-z0-9_-]/i.test(username)) return null;

                try {
                    const profile = platform === 'chess.com'
                        ? await chessComService.getPlayerProfile(username)
                        : await lichessService.getPlayerProfile(username);

                    if (!profile) return null;

                    const profileName = platform === 'chess.com' ? (profile as any).name : (profile as any).profile?.firstName + ' ' + (profile as any).profile?.lastName;
                    const handle = (profile as any).username || username;

                    const normOfficial = officialName.toLowerCase().replace(/[^a-z]/g, '');
                    const normProfile = (profileName || '').toLowerCase().replace(/[^a-z]/g, '');
                    const normHandle = (handle || '').toLowerCase().replace(/[^a-z]/g, '');

                    console.log(`[Identity] Verifying ${platform} handle "${username}":`, {
                        profileName,
                        normOfficial,
                        normProfile,
                        normHandle
                    });

                    // Match if name matches or handle is the name
                    if (normProfile.includes(normOfficial) || normOfficial.includes(normProfile) || normHandle.includes(normOfficial)) {
                        return username;
                    }

                    // For titled players, if the handle contains a part of the official name and they have the same title (later)
                    // For now, if the handle is found and AI was very confident, we accept it if it's not a complete mismatch
                    if (data.confidence > 0.8 && (normHandle.length > 4) && (normHandle.includes(normOfficial.slice(0, 4)) || normOfficial.includes(normHandle.slice(0, 4)))) {
                        return username;
                    }

                    return null;
                } catch (e) {
                    return null;
                }
            };

            // Parallel Verification
            const [confirmedChessCom, confirmedLichess] = await Promise.all([
                (async () => {
                    for (const u of chessComCandidates) {
                        const verified = await verifyHandle(u, 'chess.com', chessComCandidates);
                        if (verified) return verified;
                    }
                    return ''; // No longer returning a guess fallback
                })(),
                (async () => {
                    for (const u of lichessCandidates) {
                        const verified = await verifyHandle(u, 'lichess', lichessCandidates);
                        if (verified) return verified;
                    }
                    return ''; // No longer returning a guess fallback
                })()
            ]);

            return {
                verifiedName: officialName,
                fideProfile,
                uscfProfile,
                chessComUsername: confirmedChessCom,
                lichessUsername: confirmedLichess,
                confidence: data.confidence || 0.5
            };

        } catch (e) {
            console.error("[Identity] AI Resolution failed:", e);
            // Return empty handles instead of guessing, to avoid 404/410 errors on platforms
            return {
                verifiedName: officialName,
                fideProfile,
                uscfProfile,
                chessComUsername: '',
                lichessUsername: '',
                confidence: 0
            };
        }
    }
};
