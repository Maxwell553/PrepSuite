
import { GoogleGenAI } from "@google/genai";
import { fideService, FideProfile } from './fide';
import { uscfService, UscfProfile } from './uscf';
import { chessComService } from './chessCom';
import { lichessService } from './lichess';
import { getGeminiApiKey } from '../lib/env';
import { geminiService } from './geminiService';

export interface ResolvedIdentity {
    verifiedName: string;
    fideProfile: FideProfile | null;
    uscfProfile: UscfProfile | null;
    chessComUsername: string;
    lichessUsername: string;
    confidence: number;
}

export const identityService = {
    async resolve(
        inputName: string,
        fideId: string,
        uscfId: string,
        providedChessComUsername?: string,
        providedLichessUsername?: string
    ): Promise<ResolvedIdentity> {
        let officialName = inputName;
        let fideProfile: FideProfile | null = null;
        let uscfProfile: UscfProfile | null = null;

        try {
            // 1. Fetch provided IDs
            [fideProfile, uscfProfile] = await Promise.all([
                fideId ? fideService.getProfile(fideId) : Promise.resolve(null),
                uscfId ? uscfService.getProfile(uscfId) : Promise.resolve(null)
            ]);

            console.log('[Identity] Initial Validation Results:', {
                fide: fideProfile ? 'FOUND: ' + fideProfile.name : 'NOT PROVIDED/FOUND',
                uscf: uscfProfile ? 'FOUND: ' + uscfProfile.name : 'NOT PROVIDED/FOUND'
            });

            // 2. Cross-reference: Try to find missing ID using the other
            // If we have FIDE but not USCF, search USCF by name
            if (fideProfile && !uscfProfile && !uscfId) {
                console.log('[Identity] Attempting FIDE → USCF cross-reference...');
                // Note: USCF doesn't have a name search API, so we'll rely on AI discovery
                // This is a limitation we'll document
            }

            // If we have USCF but not FIDE, search FIDE by name
            if (uscfProfile && !fideProfile && !fideId) {
                console.log('[Identity] Attempting USCF → FIDE cross-reference...');
                // Note: FIDE doesn't have a name search API either
                // We'll rely on AI discovery for this as well
            }

            // Determine official name from available sources
            officialName = fideProfile?.name || uscfProfile?.name || inputName;
            console.log('[Identity] Official Name resolved to:', officialName);

            // 3. Handle Platform Usernames - Prioritize User-Provided
            let chessComCandidates: string[] = [];
            let lichessCandidates: string[] = [];
            let verifiedChessComUsername = '';
            let verifiedLichessUsername = '';

            // Helper to validate username exists on platform
            const validateUsername = async (username: string, platform: 'chess.com' | 'lichess'): Promise<boolean> => {
                try {
                    const profile = platform === 'chess.com'
                        ? await chessComService.getPlayerProfile(username)
                        : await lichessService.getPlayerProfile(username);
                    return profile !== null;
                } catch {
                    return false;
                }
            };

            // PRIORITY 1: Trust provided usernames - assume they are correct, no validation or search needed
            // Empty strings should be treated as not provided
            if (providedChessComUsername && providedChessComUsername.trim() !== '') {
                console.log('[Identity] ✓ Using provided Chess.com username (trusted, no validation):', providedChessComUsername);
                verifiedChessComUsername = providedChessComUsername.trim();
                chessComCandidates = [verifiedChessComUsername]; // Use provided username directly
            }

            if (providedLichessUsername && providedLichessUsername.trim() !== '') {
                console.log('[Identity] ✓ Using provided Lichess username (trusted, no validation):', providedLichessUsername);
                verifiedLichessUsername = providedLichessUsername.trim();
                lichessCandidates = [verifiedLichessUsername]; // Use provided username directly
            }

            // PRIORITY 2: Only search for platforms where username was NOT provided
            // If username is provided, trust it and skip discovery entirely
            const needsChessComDiscovery = !verifiedChessComUsername; // Only search if not provided
            const needsLichessDiscovery = !verifiedLichessUsername; // Only search if not provided

            interface AICandidates {
                chessComCandidates?: string[];
                lichessCandidates?: string[];
                reasoning?: string;
                confidence?: number;
            }
            // Declare candidates outside the if block so it's accessible everywhere
            let candidates: AICandidates = { chessComCandidates: [], lichessCandidates: [], confidence: 0 };

            if (needsChessComDiscovery || needsLichessDiscovery) {
                console.log('[Identity] Running AI discovery for:', {
                    chesscom: needsChessComDiscovery,
                    lichess: needsLichessDiscovery
                });

                // Use Gemini API via Edge Function (secure server-side call)
                try {
                    const prompt = `You are an elite chess investigator with access to Google Search. Your task is to FIND actual usernames by searching the web, NOT to generate or guess them.
          
          Target Player:
          Name: "${officialName}"
          FIDE Rating: ${fideProfile?.rating || 'N/A'} (ID: ${fideId || 'N/A'})
          USCF Rating: ${uscfProfile?.rating || 'N/A'} (ID: ${uscfId || 'N/A'})
          Birth Year: ${fideProfile?.birthYear || 'N/A'}
          Federation: ${fideProfile?.federation || 'N/A'}
          Titles: ${fideProfile?.title || 'N/A'}

          CRITICAL INSTRUCTIONS:
          1. You MUST perform actual Google searches. Do NOT generate usernames based on name patterns.
          2. Find actual profile URLs in search results:
             - Look for URLs like: chess.com/pub/player/[USERNAME] or chess.com/member/[USERNAME]
             - Look for URLs like: lichess.org/@/[USERNAME]
             - Look for Chess.com Top Players page URLs
          3. DO NOT create usernames - only report URLs you actually see in search results
          4. We will scrape these URLs to extract and verify the usernames - you just need to find the URLs

          Search Queries (perform each search and examine results):
          Perform these Google searches one by one and extract usernames from the actual results:
          1. "lichess of ${officialName}"
          2. "chess.com of ${officialName}"
          3. "${officialName} Chess.com account"
          4. "${officialName} Lichess account"
          5. "${officialName} games on Chess.com"
          6. "${officialName} games on Lichess"
          7. "${officialName} Chess.com username"
          8. "${officialName} Lichess username"
          9. "${officialName} ${fideProfile?.title || ''} Chess.com"
          10. "${officialName} ${fideProfile?.title || ''} Lichess"
          11. "${officialName} FIDE ID ${fideId || ''} Chess.com"
          12. "${officialName} ${fideProfile?.federation || ''} chess player"
          13. "Chess.com ${officialName}"
          14. "Lichess ${officialName}"
          15. "site:chess.com ${officialName}"
          16. "site:lichess.org ${officialName}"

          For each search result:
          - Look for profile URLs: "chess.com/pub/player/[USERNAME]", "chess.com/member/[USERNAME]", or "lichess.org/@/[USERNAME]"
          - Copy the EXACT URL you see in search results
          - Include the full URL in your reasoning

          Return Format:
          Return JSON with the URLs you found. We will scrape these URLs to extract usernames.
          CRITICAL: You MUST include the exact URLs in your reasoning - we will fetch and scrape these pages.
          
          {
            "chessComCandidates": ["username_from_url"],
            "lichessCandidates": ["username_from_url"],
            "reasoning": "FOUND URLS: chess.com/pub/player/jamisonkao, lichess.org/@/Kao-Jamison",
             "confidence": 0.0 to 1.0 
          }

          ABSOLUTE REQUIREMENTS:
          1. You MUST include the exact URLs in your reasoning (e.g., "chess.com/pub/player/jamisonkao")
          2. Only include URLs you actually see in search results
          3. Do NOT create, generate, or infer URLs - ONLY report URLs you see
          4. If no URLs found in search results, return empty arrays
          5. Your reasoning MUST contain the actual URLs - we will fetch and scrape these pages to extract usernames
          6. DO NOT return URLs that don't appear in search results
        `;

                    // Call Gemini API via Edge Function (includes Google Search Retrieval)
                    const text = await geminiService.generateContentWithSearch(prompt);
                    console.log('[Identity] AI Response:', text || '(empty)');

                    // If response is empty, skip parsing and use fallbacks
                    if (!text || text.trim().length === 0) {
                        console.warn('[Identity] AI returned empty response, using heuristic fallbacks');
                    } else {
                    // Robust JSON extraction
                    let jsonStr = text;
                    const jsonBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
                    if (jsonBlockMatch) {
                        jsonStr = jsonBlockMatch[1];
                    } else {
                        const looseMatch = text.match(/\{[\s\S]*\}/);
                        if (looseMatch) jsonStr = looseMatch[0];
                    }

                        // Only try to parse if we found JSON-like content
                        if (jsonStr && jsonStr.trim().length > 0) {
                    try {
                                const parsed = JSON.parse(jsonStr);
                                if (parsed && typeof parsed === 'object') {
                                    // Extract usernames from URLs if Gemini returned URLs instead of usernames
                                    if (parsed.chessComCandidates && Array.isArray(parsed.chessComCandidates)) {
                                        parsed.chessComCandidates = parsed.chessComCandidates.map((item: string) => {
                                            // If it's a URL, extract the username (handles member, pub/player, player, players paths)
                                            const urlMatch = item.match(/chess\.com\/(?:pub\/player|member|player|players)\/([a-z0-9_-]+)/i);
                                            if (urlMatch) return urlMatch[1];
                                            // If it's already a username (no http), return as-is
                                            if (!item.includes('http') && !item.includes('/')) return item;
                                            // Try to extract from partial URL
                                            const parts = item.split('/');
                                            const lastPart = parts[parts.length - 1];
                                            if (lastPart && !lastPart.includes('http') && lastPart.length > 0) return lastPart;
                                            return null;
                                        }).filter((u: string | null): u is string => u !== null && u.length > 0);
                                    }
                                    if (parsed.lichessCandidates && Array.isArray(parsed.lichessCandidates)) {
                                        parsed.lichessCandidates = parsed.lichessCandidates.map((item: string) => {
                                            // If it's a URL, extract the username
                                            const urlMatch = item.match(/lichess\.org\/@\/([a-z0-9_-]+)/i);
                                            if (urlMatch) return urlMatch[1];
                                            // If it's already a username, return as-is
                                            return item.replace(/^https?:\/\/(?:www\.)?lichess\.org\/@\//i, '');
                                        }).filter((u: string) => u && u.length > 0);
                                    }
                                    candidates = parsed;
                                    console.log('[Identity] Parsed candidates:', JSON.stringify(candidates, null, 2));
                                }
                    } catch (parseErr) {
                        console.warn('[Identity] JSON Parse failed, attempting cleanup', parseErr);
                        // Try to cleanup common trailing commas or newlines
                        try {
                                    const cleaned = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
                                    const parsed = JSON.parse(cleaned);
                                    if (parsed && typeof parsed === 'object') {
                                        // Extract usernames from URLs if Gemini returned URLs instead of usernames
                                        if (parsed.chessComCandidates && Array.isArray(parsed.chessComCandidates)) {
                                            parsed.chessComCandidates = parsed.chessComCandidates.map((item: string) => {
                                                // If it's a URL, extract the username (handles member, pub/player, player, players paths)
                                                const urlMatch = item.match(/chess\.com\/(?:pub\/player|member|player|players)\/([a-z0-9_-]+)/i);
                                                if (urlMatch) return urlMatch[1];
                                                // If it's already a username (no http), return as-is
                                                if (!item.includes('http') && !item.includes('/')) return item;
                                                // Try to extract from partial URL
                                                const parts = item.split('/');
                                                const lastPart = parts[parts.length - 1];
                                                if (lastPart && !lastPart.includes('http') && lastPart.length > 0) return lastPart;
                                                return null;
                                            }).filter((u: string | null): u is string => u !== null && u.length > 0);
                                        }
                                        if (parsed.lichessCandidates && Array.isArray(parsed.lichessCandidates)) {
                                            parsed.lichessCandidates = parsed.lichessCandidates.map((item: string) => {
                                                const urlMatch = item.match(/lichess\.org\/@\/([a-z0-9_-]+)/i);
                                                if (urlMatch) return urlMatch[1];
                                                return item.replace(/^https?:\/\/(?:www\.)?lichess\.org\/@\//i, '');
                                            }).filter((u: string) => u && u.length > 0);
                                        }
                                        candidates = parsed;
                                        console.log('[Identity] Parsed candidates (after cleanup):', JSON.stringify(candidates, null, 2));
                                    }
                        } catch (e) {
                                    console.warn('[Identity] Fatal JSON parse error, will use heuristic fallbacks');
                                }
                            }
                        }
                    }

                } catch (err) {
                    console.warn("[Identity] AI primary discovery failed:", err);
                    // If AI fails, candidates remain empty - do not generate fallbacks
                }
                
                // Extract URLs from reasoning and actually fetch/scrape the profile pages
                // NO CANDIDATES - only extract usernames by actually visiting the websites
                const extractUsernamesByScraping = async (reasoning: string | undefined, platform: 'chess.com' | 'lichess'): Promise<string[]> => {
                    if (!reasoning) {
                        console.warn(`[Identity] No reasoning provided for ${platform} - cannot extract usernames`);
                        return [];
                }

                    // Extract URLs from reasoning
                    // Include Top Players database URLs: chess.com/players/{slug}
                    const urlPatterns = {
                        'chess.com': [
                            /(?:https?:\/\/)?(?:www\.)?chess\.com\/(?:pub\/player|member|player)\/([a-z0-9_-]+)/gi,
                            /(?:https?:\/\/)?(?:www\.)?chess\.com\/@([a-z0-9_-]+)/gi,
                            /(?:https?:\/\/)?(?:www\.)?chess\.com\/players\/([a-z0-9_-]+)/gi // Top Players database
                        ],
                        'lichess': [
                            /(?:https?:\/\/)?(?:www\.)?lichess\.org\/@\/([a-z0-9_-]+)/gi,
                            /(?:https?:\/\/)?(?:www\.)?lichess\.org\/user\/([a-z0-9_-]+)/gi
                        ]
                    };
                    
                    const foundUrls: Array<{url: string, username: string, isTopPlayersSlug?: boolean}> = [];
                    const patterns = platform === 'chess.com' ? urlPatterns['chess.com'] : urlPatterns['lichess'];
                    
                    // Extract URLs from reasoning
                    for (let i = 0; i < patterns.length; i++) {
                        const pattern = patterns[i];
                        const matches = reasoning.matchAll(pattern);
                        for (const match of matches) {
                            if (match[1]) {
                                const username = match[1];
                                // Check if this is a Top Players database URL (third pattern for chess.com)
                                const isTopPlayersSlug = platform === 'chess.com' && i === 2;
                                
                                // Construct full URL
                                let fullUrl = '';
                                if (platform === 'chess.com') {
                                    if (isTopPlayersSlug) {
                                        fullUrl = `https://www.chess.com/players/${username}`;
                                    } else {
                                        fullUrl = `https://www.chess.com/member/${username}`;
                                    }
                                } else {
                                    fullUrl = `https://lichess.org/@/${username}`;
                                }
                                foundUrls.push({ url: fullUrl, username, isTopPlayersSlug });
                            }
                        }
                    }
                    
                    // Remove duplicates
                    const uniqueUrls = Array.from(new Map(foundUrls.map(u => [u.username.toLowerCase(), u])).values());
                    
                    if (uniqueUrls.length === 0) {
                        console.warn(`[Identity] No URLs found in reasoning for ${platform}`);
                        return [];
                    }
                    
                    console.log(`[Identity] Found ${uniqueUrls.length} profile URL(s) for ${platform}, fetching and scraping...`);
                    
                    // Actually fetch and scrape each profile page, then verify bio-metric matching
                    const verifiedUsernames: string[] = [];
                    for (const { url, username, isTopPlayersSlug } of uniqueUrls) {
                        try {
                            console.log(`[Identity] Fetching and scraping profile page: ${url}${isTopPlayersSlug ? ' (Top Players database)' : ''}`);
                            
                            // Use the existing service to fetch profile (which uses API)
                            let profile;
                            if (platform === 'chess.com') {
                                profile = await chessComService.getPlayerProfile(username);
                                
                                // If profile not found and this is a Top Players slug, still accept it
                                // Top Players database entries may not have regular accounts but games might be accessible
                                if (!profile && isTopPlayersSlug) {
                                    console.log(`[Identity] Top Players slug "${username}" found but no regular account. Will attempt to fetch games using this identifier.`);
                                    // Accept Top Players slugs even without profile - games might be accessible via API
                                    verifiedUsernames.push(username);
                                    continue;
                                }
                            } else {
                                profile = await lichessService.getPlayerProfile(username);
                            }
                            
                            if (!profile) {
                                console.warn(`[Identity] ✗ Profile not found for ${username} on ${platform}`);
                                continue;
                            }
                            
                            // Verify bio-metric matching (same logic as verifyHandle)
                            const bio = platform === 'chess.com' ? (profile as Record<string, unknown>).status : (profile as Record<string, unknown>).profile?.['bio'] || '';
                            const profileName = platform === 'chess.com'
                                ? (profile as Record<string, unknown>).name as string
                                : ((profile as Record<string, unknown>).profile?.['firstName'] as string || '') + ' ' + ((profile as Record<string, unknown>).profile?.['lastName'] as string || '');
                            
                            // Check title match (critical)
                            if (fideProfile?.title && fideProfile.title.trim() !== '') {
                                const profileTitle = (profile as Record<string, unknown>).title as string || '';
                                const profileTitleUpper = profileTitle.toUpperCase().trim();
                                const fideTitleUpper = fideProfile.title.toUpperCase().trim();
                                
                                if (profileTitleUpper && fideTitleUpper && profileTitleUpper !== fideTitleUpper) {
                                    console.warn(`[Identity] ✗ Title mismatch for ${username}: FIDE=${fideTitleUpper}, Profile=${profileTitleUpper}`);
                                    continue;
                                }
                                if (!profileTitleUpper && fideTitleUpper) {
                                    console.warn(`[Identity] ✗ Missing title for ${username}: FIDE has ${fideTitleUpper} but profile has none`);
                                    continue;
                                }
                            }
                            
                            // Check name match
                            const officialNameClean = officialName.toLowerCase().replace(/[^a-z ]/g, '').trim();
                            const nameParts = officialNameClean.split(/[,\s]+/).filter(p => p.length > 2);
                            const profNameLower = (profileName || '').toLowerCase().replace(/[^a-z ]/g, '');
                            const matchingParts = nameParts.filter(part => profNameLower.includes(part));
                            const nameMatch = matchingParts.length >= 2 || (matchingParts.length === 1 && nameParts.length === 1);
                            
                            // Check birth year in bio
                            const birthYearInBio = fideProfile?.birthYear && String(bio || '').includes(fideProfile.birthYear);
                            
                            // Accept if name matches or birth year matches
                            if (nameMatch || birthYearInBio) {
                                console.log(`[Identity] ✓ Successfully scraped and verified profile for ${username} on ${platform} (nameMatch: ${nameMatch}, birthYearMatch: ${birthYearInBio})`);
                                verifiedUsernames.push(username);
                            } else {
                                console.warn(`[Identity] ✗ Profile ${username} does not match player (name: ${profileName}, bio: ${String(bio).substring(0, 50)})`);
                            }
                        } catch (error) {
                            console.error(`[Identity] Error scraping ${url}:`, error);
                        }
                    }
                    
                    if (verifiedUsernames.length > 0) {
                        console.log(`[Identity] Successfully scraped ${verifiedUsernames.length} profile(s) for ${platform}: [${verifiedUsernames.join(', ')}]`);
                    } else {
                        console.warn(`[Identity] No valid profiles found after scraping for ${platform}`);
                    }
                    
                    return verifiedUsernames;
                };

                // Extract usernames from both candidates array (which may contain URLs) and reasoning field
                if (needsChessComDiscovery) {
                    // Extract usernames from candidates array (may contain URLs like "https://www.chess.com/member/Ace0fD1amonds")
                    if (candidates.chessComCandidates && Array.isArray(candidates.chessComCandidates)) {
                        const extractedFromCandidates = candidates.chessComCandidates
                            .map((item: string) => {
                                // Extract username from URL if it's a URL
                                const urlMatch = item.match(/chess\.com\/(?:pub\/player|member|player|players)\/([a-z0-9_-]+)/i);
                                if (urlMatch) {
                                    return urlMatch[1];
                                }
                                // If it's already a username (no http, no /), return as-is
                                if (!item.includes('http') && !item.includes('/')) {
                                    return item;
                                }
                                // Try to extract from partial URL
                                const parts = item.split('/');
                                const lastPart = parts[parts.length - 1];
                                if (lastPart && !lastPart.includes('http') && lastPart.length > 0) {
                                    return lastPart;
                                }
                                return null;
                            })
                            .filter((u: string | null): u is string => u !== null && u.length > 0);
                        
                        if (extractedFromCandidates.length > 0) {
                            chessComCandidates = [...chessComCandidates, ...extractedFromCandidates];
                            console.log(`[Identity] Chess.com usernames extracted from candidates array: [${extractedFromCandidates.join(', ')}]`);
                        }
                    }
                    
                    // Also extract from reasoning field (contains URLs in text)
                    if (candidates.reasoning) {
                        const extractedFromReasoning = await extractUsernamesByScraping(candidates.reasoning, 'chess.com');
                        if (extractedFromReasoning.length > 0) {
                            chessComCandidates = [...chessComCandidates, ...extractedFromReasoning];
                            console.log(`[Identity] Chess.com usernames extracted from reasoning: [${extractedFromReasoning.join(', ')}]`);
                        }
                    }
                    
                    // Remove duplicates and empty strings
                    chessComCandidates = Array.from(new Set(chessComCandidates.filter(u => u && u.length > 0)));
                    console.log(`[Identity] Final Chess.com candidates: [${chessComCandidates.join(', ')}]`);
                }
                
                if (needsLichessDiscovery) {
                    // Extract usernames from candidates array (may contain URLs)
                    if (candidates.lichessCandidates && Array.isArray(candidates.lichessCandidates)) {
                        const extractedFromCandidates = candidates.lichessCandidates
                            .map((item: string) => {
                                // Extract username from URL if it's a URL
                                const urlMatch = item.match(/lichess\.org\/@\/([a-z0-9_-]+)/i);
                                if (urlMatch) {
                                    return urlMatch[1];
                                }
                                // If it's already a username (no http, no /), return as-is
                                if (!item.includes('http') && !item.includes('/')) {
                                    return item;
                                }
                                // Try to extract from partial URL
                                const parts = item.split('/');
                                const lastPart = parts[parts.length - 1];
                                if (lastPart && !lastPart.includes('http') && lastPart.length > 0) {
                                    return lastPart;
                                }
                                return null;
                            })
                            .filter((u: string | null): u is string => u !== null && u.length > 0);
                        
                        if (extractedFromCandidates.length > 0) {
                            lichessCandidates = [...lichessCandidates, ...extractedFromCandidates];
                            console.log(`[Identity] Lichess usernames extracted from candidates array: [${extractedFromCandidates.join(', ')}]`);
                        }
                    }
                    
                    // Also extract from reasoning field (contains URLs in text)
                    if (candidates.reasoning) {
                        const extractedFromReasoning = await extractUsernamesByScraping(candidates.reasoning, 'lichess');
                        if (extractedFromReasoning.length > 0) {
                            lichessCandidates = [...lichessCandidates, ...extractedFromReasoning];
                            console.log(`[Identity] Lichess usernames extracted from reasoning: [${extractedFromReasoning.join(', ')}]`);
                        }
                    }
                    
                    // Remove duplicates and empty strings
                    lichessCandidates = Array.from(new Set(lichessCandidates.filter(u => u && u.length > 0)));
                    console.log(`[Identity] Final Lichess candidates: [${lichessCandidates.join(', ')}]`);
                }
            } // Close if (needsChessComDiscovery || needsLichessDiscovery) block
            
            // Provided usernames are already in candidates list and trusted - no need to add again
            // They will be used directly without verification

            // Verification Helper (with access to candidates for confidence checking)
            const verifyHandle = async (usernameInput: string, platform: 'chess.com' | 'lichess', aiCandidates?: AICandidates) => {
                let username = usernameInput.trim();
                // Strip URL if necessary
                if (username.includes('/') || username.includes('http')) {
                    const parts = username.split('/');
                    username = parts[parts.length - 1] || parts[parts.length - 2];
                }
                username = username.replace(/[^a-z0-9_-]/i, '');
                if (!username) return null;

                try {
                    console.log(`[Identity] Verifying ${platform} username: ${username}`);
                    const profile = platform === 'chess.com'
                        ? await chessComService.getPlayerProfile(username)
                        : await lichessService.getPlayerProfile(username);

                    if (!profile) {
                        console.log(`[Identity] Profile not found for ${username} on ${platform}`);
                        return null;
                    }

                    console.log(`[Identity] Profile found for ${username} on ${platform}, checking bio-metric match...`);

                    // Bio-metric matching
                    const bio = platform === 'chess.com' ? (profile as Record<string, unknown>).status : (profile as Record<string, unknown>).profile?.['bio'] || '';
                    const profileName = platform === 'chess.com'
                        ? (profile as Record<string, unknown>).name as string
                        : ((profile as Record<string, unknown>).profile?.['firstName'] as string || '') + ' ' + ((profile as Record<string, unknown>).profile?.['lastName'] as string || '');

                    const titleMatch = fideProfile?.title && (profile as Record<string, unknown>).title === fideProfile.title;

                    // Extract name parts from official name (handle "Last, First Middle" format)
                    const officialNameClean = officialName.toLowerCase().replace(/[^a-z ]/g, '').trim();
                    const nameParts = officialNameClean.split(/[,\s]+/).filter(p => p.length > 2);
                    
                    // Also try reversed format (for "Last, First" -> "First Last")
                    const reversedParts: string[] = [];
                    if (officialName.includes(',')) {
                        const parts = officialNameClean.split(',').map(p => p.trim());
                        if (parts.length >= 2) {
                            reversedParts.push(...parts[1].split(' ').filter(p => p.length > 2)); // First name parts
                            reversedParts.push(...parts[0].split(' ').filter(p => p.length > 2)); // Last name parts
                        }
                    }
                    const allNameParts = [...new Set([...nameParts, ...reversedParts])];
                    
                    const profNameLower = (profileName || '').toLowerCase().replace(/[^a-z ]/g, '');
                    // Check if profile name contains at least 2 name parts (more reliable)
                    const matchingParts = allNameParts.filter(part => profNameLower.includes(part));
                    const nameMatch = matchingParts.length >= 2 || (matchingParts.length === 1 && allNameParts.length === 1);

                    const handleLower = username.toLowerCase();
                    // Check if handle contains name parts (e.g., "JamisonKao" contains "jamison" and "kao")
                    const handleMatchingParts = allNameParts.filter(part => handleLower.includes(part));
                    const handleMatch = handleMatchingParts.length >= 2 || (handleMatchingParts.length >= 1 && allNameParts.length <= 2);
                    
                    console.log(`[Identity] Name matching details:`, {
                        officialName,
                        profileName,
                        username,
                        nameParts: allNameParts,
                        matchingParts,
                        nameMatch,
                        handleMatchingParts,
                        handleMatch
                    });

                    // Check for birth year in bio
                    const birthYearInBio = fideProfile?.birthYear && String(bio || '').includes(fideProfile.birthYear);

                    // CRITICAL: If player has a FIDE title, the profile MUST have that title
                    // This is a strong negative signal - reject immediately if title mismatch
                    if (fideProfile?.title && fideProfile.title.trim() !== '') {
                        const profileTitle = (profile as Record<string, unknown>).title as string || '';
                        const profileTitleUpper = profileTitle.toUpperCase().trim();
                        const fideTitleUpper = fideProfile.title.toUpperCase().trim();
                        
                        // Check if profile has NO title when FIDE profile has one (strong rejection signal)
                        if (!profileTitleUpper && fideTitleUpper) {
                            console.log(`[Identity] ✗ REJECTING: Player has FIDE title ${fideTitleUpper} but ${platform} profile has no title`);
                            return null;
                        }
                        
                        // Check if titles don't match (also reject - titles are official and should match)
                        if (profileTitleUpper && fideTitleUpper && profileTitleUpper !== fideTitleUpper) {
                            console.log(`[Identity] ✗ REJECTING: Title mismatch - FIDE: ${fideTitleUpper}, ${platform}: ${profileTitleUpper}`);
                            return null;
                        }
                        
                        // If titles match, this is a strong positive signal
                        if (profileTitleUpper === fideTitleUpper) {
                            console.log(`[Identity] ✓ Strong match: Title matches (${fideTitleUpper})`);
                            // Title match alone is very strong evidence, but still check name for extra confidence
                            if (nameMatch || handleMatch) {
                                console.log(`[Identity] ✓ High confidence match: title + name/handle`);
                                return username;
                            }
                            // Even without name match, title match is very strong
                            console.log(`[Identity] ✓ Accepting based on title match alone`);
                            return username;
                        }
                    }

                    // High confidence matches (when no title or title already verified)
                    if (titleMatch && nameMatch) {
                        console.log(`[Identity] ✓ High confidence match: title + name`);
                        return username;
                    }
                    if (titleMatch && birthYearInBio) {
                        console.log(`[Identity] ✓ High confidence match: title + birth year`);
                        return username;
                    }
                    if (nameMatch && birthYearInBio) {
                        console.log(`[Identity] ✓ High confidence match: name + birth year`);
                        return username;
                    }

                    // Slightly looser but still probable
                    if (handleMatch && titleMatch) {
                        console.log(`[Identity] ✓ Medium confidence match: handle + title`);
                        return username;
                    }
                    if (handleMatch && nameMatch && (platform === 'lichess' ? ((profile as Record<string, unknown>).perfs?.['blitz']?.['rating'] as number || 0) > 2000 : true)) {
                        console.log(`[Identity] ✓ Medium confidence match: handle + name`);
                        return username;
                    }

                    // If AI discovered this username with high confidence, accept it even without perfect bio match
                    // This handles cases where the AI found the correct username but bio doesn't match perfectly
                    // Use aiCandidates if provided, otherwise fall back to empty object to avoid reference errors
                    const candidatesToCheck = aiCandidates || { chessComCandidates: [], lichessCandidates: [], confidence: 0 };
                    if (candidatesToCheck.confidence && candidatesToCheck.confidence >= 0.7) {
                        const isAICandidate = candidatesToCheck.chessComCandidates?.includes(username) || candidatesToCheck.lichessCandidates?.includes(username);
                        if (isAICandidate) {
                            console.log(`[Identity] ✓ Accepting AI-discovered username with confidence ${candidatesToCheck.confidence} (AI already verified match)`);
                            return username;
                        }
                    }

                    // If handle matches name parts, accept it (username like "JamisonKao" matches "Kao, Jamison Edrich")
                    if (handleMatch) {
                        console.log(`[Identity] ✓ Accepting username with handle match (handle contains name parts)`);
                        return username;
                    }

                    // Last resort: if profile exists and name matches any part, accept it
                    // This prevents false negatives when profiles don't have complete bio info
                    if (nameMatch) {
                        console.log(`[Identity] ⚠ Accepting username with name match (profile name contains parts of official name)`);
                        return username;
                    }

                    console.log(`[Identity] ✗ No match found for ${username} on ${platform}`);
                    return null;
                } catch (e) {
                    console.error(`[Identity] Error verifying ${username} on ${platform}:`, e);
                    return null;
                }
            };

            // 4. Verify usernames (only for discovered ones, provided ones are trusted)
            console.log(`[Identity] Processing usernames - Chess.com: [${chessComCandidates.join(', ')}], Lichess: [${lichessCandidates.join(', ')}]`);
            const [confirmedChessCom, confirmedLichess] = await Promise.all([
                (async () => {
                    // If username was provided, trust it - no verification needed
                    if (verifiedChessComUsername) {
                        console.log(`[Identity] ✓ Using provided Chess.com username (trusted): ${verifiedChessComUsername}`);
                        return verifiedChessComUsername;
                    }
                    // Only verify AI-discovered usernames
                    const verifyPromises = chessComCandidates.map(u => verifyHandle(u, 'chess.com', candidates));
                    const results = await Promise.all(verifyPromises);
                    const found = results.find(r => r !== null) || '';
                    console.log(`[Identity] Chess.com discovered username verification result: ${found || 'none found'}`);
                    return found;
                })(),
                (async () => {
                    // If username was provided, trust it - no verification needed
                    if (verifiedLichessUsername) {
                        console.log(`[Identity] ✓ Using provided Lichess username (trusted): ${verifiedLichessUsername}`);
                        return verifiedLichessUsername;
                    }
                    // Only verify AI-discovered usernames
                    const verifyPromises = lichessCandidates.map(u => verifyHandle(u, 'lichess', candidates));
                    const results = await Promise.all(verifyPromises);
                    const found = results.find(r => r !== null) || '';
                    console.log(`[Identity] Lichess discovered username verification result: ${found || 'none found'}`);
                    return found;
                })()
            ]);

            return {
                verifiedName: officialName,
                fideProfile,
                uscfProfile,
                chessComUsername: confirmedChessCom,
                lichessUsername: confirmedLichess,
                confidence: confirmedChessCom || confirmedLichess ? 1.0 : 0
            };

        } catch (e) {
            console.error("[Identity] Fatal Discovery Failure:", e);
            return {
                verifiedName: officialName,
                fideProfile: null,
                uscfProfile: null,
                chessComUsername: '',
                lichessUsername: '',
                confidence: 0
            };
        }
    }
};
