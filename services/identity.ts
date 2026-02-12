import { capitalizeName } from '../lib/validation';
import { fideService, FideProfile } from './fide';
import { uscfService, UscfProfile } from './uscf';
import { chessComService } from './chessCom';
import { lichessService } from './lichess';
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
            // 0. Search for FIDE/USCF IDs if not provided
            let finalFideId = fideId;
            let finalUscfId = uscfId;
            
            if (!fideId && !uscfId && inputName.trim()) {
                console.log('[Identity] Searching for FIDE/USCF IDs via optimized Google Search...');
                try {
                    // Optimized prompt: Explicit instructions for targeted search with site-specific queries
                    const searchPrompt = `You have to find the USCF and FIDE IDs of this player: "${inputName}". Search the web using ONLY these site-specific queries:
- site:ratings.fide.com "${inputName}"
- site:ratings.uschess.org "${inputName}"

Find the FIDE/USCF IDs and use the age and rating of the player to cross reference and verify it's the correct player. Return ONLY raw JSON with no markdown or code blocks: {"fideId":number or null,"uscfId":number or null}`;

                    const response = await geminiService.generateContentWithSearch(searchPrompt);
                    
                    // Extract JSON: strip markdown code blocks (```json ... ```)
                    let jsonStr = response
                        .replace(/^```(?:json)?\s*/i, '')
                        .replace(/\s*```\s*$/i, '')
                        .trim();
                    const startIdx = jsonStr.indexOf('{');
                    if (startIdx >= 0) jsonStr = jsonStr.slice(startIdx);
                    // Repair truncated JSON: close incomplete strings/arrays/objects
                    if (!/}\s*$/.test(jsonStr)) {
                        if (/"uscf"?\s*$/.test(jsonStr)) {
                            jsonStr = jsonStr.replace(/"uscf"?\s*$/, '"uscfId":null}');
                        } else {
                            // Close truncated string in array: "Laurel-A -> "Laurel-A"], then }
                            let inString = false;
                            let openBraces = 0, openBrackets = 0;
                            for (let i = 0; i < jsonStr.length; i++) {
                                const c = jsonStr[i];
                                if (c === '"' && jsonStr[i - 1] !== '\\') inString = !inString;
                                if (!inString) {
                                    if (c === '{') openBraces++;
                                    if (c === '}') openBraces--;
                                    if (c === '[') openBrackets++;
                                    if (c === ']') openBrackets--;
                                }
                            }
                            if (inString) jsonStr += '"';
                            jsonStr += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces));
                        }
                    }

                    try {
                        const parsed = JSON.parse(jsonStr);
                        if (parsed.fideId) {
                            // Convert to string in case it's a number
                            finalFideId = String(parsed.fideId);
                            console.log('[Identity] Found FIDE ID via search:', finalFideId);
                        }
                        if (parsed.uscfId) {
                            // Convert to string in case it's a number
                            finalUscfId = String(parsed.uscfId);
                            console.log('[Identity] Found USCF ID via search:', finalUscfId);
                        }
                    } catch (parseErr) {
                        console.warn('[Identity] Failed to parse FIDE/USCF search results:', parseErr);
                    }
                } catch (err) {
                    console.warn('[Identity] Error searching for FIDE/USCF IDs:', err);
                }
            }

            // 1. Fetch provided IDs (or discovered IDs)
            let [fideProfileFetched, uscfProfileFetched] = await Promise.all([
                finalFideId ? fideService.getProfile(finalFideId) : Promise.resolve(null),
                finalUscfId ? uscfService.getProfile(finalUscfId) : Promise.resolve(null)
            ]);

            // Validate that profile names match the search - reject if not similar (avoids wrong player from AI search)
            const namesMatch = (searchName: string, profileName: string): boolean => {
                if (!searchName?.trim() || !profileName?.trim()) return false;
                const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
                const searchParts = normalize(searchName).split(' ').filter(p => p.length > 0);
                const profileParts = normalize(profileName).replace(/,/g, ' ').split(' ').filter(p => p.length > 0);
                if (searchParts.length === 0 || profileParts.length === 0) return false;
                const matchingParts = searchParts.filter(sp => profileParts.some(pp => pp.includes(sp) || sp.includes(pp)));
                return matchingParts.length >= Math.min(2, searchParts.length) || (searchParts.length === 1 && profileParts.some(pp => pp.includes(searchParts[0]) || searchParts[0].includes(pp)));
            };

            if (fideProfileFetched && !namesMatch(inputName, fideProfileFetched.name)) {
                console.warn(`[Identity] FIDE profile "${fideProfileFetched.name}" does not match search "${inputName}" - rejecting`);
                fideProfileFetched = null;
                finalFideId = '';
            }
            if (uscfProfileFetched && !namesMatch(inputName, uscfProfileFetched.name)) {
                console.warn(`[Identity] USCF profile "${uscfProfileFetched.name}" does not match search "${inputName}" - rejecting`);
                uscfProfileFetched = null;
                finalUscfId = '';
            }

            fideProfile = fideProfileFetched;
            uscfProfile = uscfProfileFetched;

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

            // Default to user-entered name; only override with FIDE/USCF name if valid (not a site title/bogus)
            const bogusNames = [
                'Chess Players Arbiters Trainers Database',
                'FIDE Profile',
                'US Chess',
                'Player Search',
                'Ratings'
            ];
            const isBogusName = (s: string) => bogusNames.some(b => s.includes(b)) || s.length > 60;
            officialName = inputName.trim();
            if (fideProfile?.name?.trim() && !isBogusName(fideProfile.name.trim())) {
                officialName = fideProfile.name.trim();
            } else if (uscfProfile?.name?.trim() && !isBogusName(uscfProfile.name.trim())) {
                officialName = uscfProfile.name.trim();
            }
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
                    // Must use Google Search - do NOT guess usernames from the player name
                    const prompt = `Search for this chess player's Chess.com and Lichess accounts: "${officialName}"${finalFideId ? ` (FIDE ID: ${finalFideId})` : ''}${finalUscfId ? ` (USCF ID: ${finalUscfId})` : ''}.

CHESS.COM: Use Google Search with site:chess.com/members. Simulate searching chess.com/members by the player name - input the name into the search, find the player in question, then select the most fitting match (correct name, rating, country). Extract the username from the profile URL (chess.com/member/USERNAME or chess.com/player/USERNAME). Also search site:chess.com for additional profile URLs.

LICHESS: Use Google Search with site:lichess.org to find the player's profile. Extract the username from lichess.org/@/USERNAME URLs.

Do NOT guess or infer usernames from the name - only return usernames you found in actual search results.
When multiple Chess.com candidates exist, pick the single best match (correct name, rating, country).
Return JSON: {"chessComCandidates":["username or []"],"lichessCandidates":["username or []"]}. Use empty array [] if no account found for that platform.`;

                    // Call Gemini API via Edge Function WITH Google Search for username discovery
                    // If this times out, the automatic retry will try without Google Search
                    let text: string;
                    try {
                      text = await geminiService.generateContentWithSearch(prompt);
                      console.log('[Identity] AI Response:', text || '(empty)');
                    } catch (searchError: any) {
                      console.warn('[Identity] Google Search failed or timed out:', searchError.message);
                      // If search fails/times out, return empty to use fallback heuristics
                      text = '';
                    }

                    // If response is empty, skip parsing and use fallbacks
                    if (!text || text.trim().length === 0) {
                        console.warn('[Identity] AI returned empty response, using heuristic fallbacks');
                    } else {
                    // Robust JSON extraction: strip markdown, handle truncated
                    let jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
                    const startIdx = jsonStr.indexOf('{');
                    if (startIdx >= 0) jsonStr = jsonStr.slice(startIdx);
                    if (!/}\s*$/.test(jsonStr) && jsonStr.length > 0) {
                        let inStr = false;
                        let ob = 0, oa = 0;
                        for (let i = 0; i < jsonStr.length; i++) {
                            const c = jsonStr[i];
                            if (c === '"' && jsonStr[i - 1] !== '\\') inStr = !inStr;
                            if (!inStr) { if (c === '{') ob++; if (c === '}') ob--; if (c === '[') oa++; if (c === ']') oa--; }
                        }
                        if (inStr) jsonStr += '"';
                        jsonStr += ']'.repeat(Math.max(0, oa)) + '}'.repeat(Math.max(0, ob));
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
                            const profileAnyScrape = profile as unknown as Record<string, unknown>;
                            const bio = platform === 'chess.com' ? profileAnyScrape.status : profileAnyScrape.profile?.['bio'] || '';
                            const profileName = platform === 'chess.com'
                                ? (profileAnyScrape.name as string) ?? ''
                                : ((profileAnyScrape.profile?.['firstName'] as string) || '') + ' ' + ((profileAnyScrape.profile?.['lastName'] as string) || '');
                            
                            // Check title match (critical)
                            if (fideProfile?.title && fideProfile.title.trim() !== '') {
                                const profileTitle = (profileAnyScrape.title as string) || '';
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
                    const profileAny = profile as unknown as Record<string, unknown>;
                    const bio = platform === 'chess.com' ? profileAny.status : profileAny.profile?.['bio'] || '';
                    const profileName = platform === 'chess.com'
                        ? (profileAny.name as string) ?? ''
                        : ((profileAny.profile?.['firstName'] as string) || '') + ' ' + ((profileAny.profile?.['lastName'] as string) || '');

                    const titleMatch = fideProfile?.title && profileAny.title === fideProfile.title;

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
                        const profileTitle = (profileAny.title as string) || '';
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
                    if (handleMatch && nameMatch && (platform === 'lichess' ? ((profileAny.perfs?.['blitz']?.['rating'] as number) || 0) > 2000 : true)) {
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
                verifiedName: capitalizeName(officialName),
                fideProfile,
                uscfProfile,
                chessComUsername: confirmedChessCom,
                lichessUsername: confirmedLichess,
                confidence: confirmedChessCom || confirmedLichess ? 1.0 : 0
            };

        } catch (e) {
            console.error("[Identity] Fatal Discovery Failure:", e);
            return {
                verifiedName: capitalizeName(officialName),
                fideProfile: null,
                uscfProfile: null,
                chessComUsername: '',
                lichessUsername: '',
                confidence: 0
            };
        }
    }
};
