import { logger } from '../lib/logger.js';
import { capitalizeName } from '../lib/validation.js';
import { fetchWithRetry } from '../lib/fetchWithRetry.js';
import type {
  FideProfile,
  UscfProfile,
  ChessComProfile,
  LichessProfile,
  ResolvedIdentity,
} from '../lib/types.js';
import { searchFideByName, pickBestFideMatch } from './fideSearch.js';
import { getFideProfile } from './fideProfile.js';
import { getUscfProfile, searchUscfByName } from './uscfProfile.js';
import { namesMatch, verifyHandle } from './verification.js';
import { searchIdsViaGemini, searchUsernamesViaGemini } from './geminiFallback.js';

const CHESS_COM_BASE = 'https://api.chess.com/pub/player';
const LICHESS_BASE = 'https://lichess.org/api';
const USER_AGENT = 'PrepSuite-Pipeline/1.0';

// ─── Platform helpers ───────────────────────────────────────────────

async function getChessComProfile(username: string): Promise<ChessComProfile | null> {
  if (!username) return null;
  try {
    const res = await fetchWithRetry(`${CHESS_COM_BASE}/${encodeURIComponent(username.toLowerCase())}`, {
      headers: { 'User-Agent': USER_AGENT },
      timeoutMs: 10000,
    });
    if (!res.ok) return null;
    return (await res.json()) as ChessComProfile;
  } catch {
    return null;
  }
}

async function getLichessProfile(username: string): Promise<LichessProfile | null> {
  if (!username) return null;
  try {
    const res = await fetchWithRetry(`${LICHESS_BASE}/user/${username}`, {
      headers: { Accept: 'application/json' },
      timeoutMs: 10000,
    });
    if (!res.ok) return null;
    return (await res.json()) as LichessProfile;
  } catch {
    return null;
  }
}

/**
 * Search Lichess autocomplete API for a player name.
 * Fast (~100ms), deterministic.
 */
async function searchLichessPlayer(name: string): Promise<string[]> {
  try {
    const term = encodeURIComponent(name.trim().split(' ')[0]); // Use first name for broader match
    const res = await fetchWithRetry(`${LICHESS_BASE}/player/autocomplete?term=${term}&friend=0`, {
      headers: { Accept: 'application/json' },
      timeoutMs: 5000,
    });
    if (!res.ok) return [];
    const data = await res.json();
    // Lichess returns either an array of strings or an object with a 'result' array
    if (Array.isArray(data)) return data;
    if (data.result && Array.isArray(data.result)) return data.result;
    return [];
  } catch {
    return [];
  }
}

/**
 * Try common Chess.com username variants from a player name.
 * e.g., "Magnus Carlsen" -> ["magnuscarlsen", "magnus_carlsen", "magnus-carlsen"]
 */
function chessComUsernameVariants(name: string): string[] {
  const clean = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const parts = clean.split(/\s+/);
  if (parts.length < 2) return [clean];

  const first = parts[0];
  const last = parts[parts.length - 1];
  return [
    parts.join(''),         // magnuscarlsen
    parts.join('_'),        // magnus_carlsen
    parts.join('-'),        // magnus-carlsen
    first + last,           // magnuscarlsen (explicit)
    last + first,           // carlsenmagnus
    first,                  // magnus
    last,                   // carlsen
  ];
}

// ─── Bogus name filter ──────────────────────────────────────────────

const BOGUS_NAMES = [
  'Chess Players Arbiters Trainers Database',
  'FIDE Profile',
  'US Chess',
  'Player Search',
  'Ratings',
];

function isBogusName(s: string): boolean {
  return BOGUS_NAMES.some((b) => s.includes(b)) || s.length > 60;
}

// ─── Main orchestrator ──────────────────────────────────────────────

export async function resolveIdentity(
  inputName: string,
  fideId: string,
  uscfId: string,
  providedChessComUsername?: string,
  providedLichessUsername?: string,
): Promise<ResolvedIdentity> {
  let officialName = inputName;
  let fideProfile: FideProfile | null = null;
  let uscfProfile: UscfProfile | null = null;



  try {
    let finalFideId = fideId;
    let finalUscfId = uscfId;

    // ── Steps 1+2: FIDE search + USCF search + Gemini ID lookup (parallel) ─
    if (inputName.trim() && (!fideId || !uscfId)) {
      logger.info({ name: inputName }, '[Identity] Steps 1+2: FIDE + USCF + Gemini lookup (parallel)');
      const [fideSearchResult, uscfSearchResults, geminiIds] = await Promise.all([
        !fideId
          ? searchFideByName(inputName).then((results) => pickBestFideMatch(inputName, results))
          : Promise.resolve(null),
        !uscfId
          ? searchUscfByName(inputName).catch((err) => {
            logger.warn({ err }, '[Identity] USCF name search failed, continuing');
            return [] as Awaited<ReturnType<typeof searchUscfByName>>;
          })
          : Promise.resolve([] as Awaited<ReturnType<typeof searchUscfByName>>),
        !fideId && !uscfId
          ? searchIdsViaGemini(inputName).catch((err) => {
            logger.warn({ err }, '[Identity] Gemini ID fallback failed, continuing');
            return { fideId: '', uscfId: '' };
          })
          : Promise.resolve({ fideId: '', uscfId: '' }),
      ]);

      // FIDE deterministic results take priority
      if (fideSearchResult) {
        finalFideId = fideSearchResult.fideId;
        logger.info({ fideId: finalFideId, name: fideSearchResult.name }, '[Identity] Found FIDE ID via direct search');
      }

      // USCF deterministic results take priority
      if (!finalUscfId && uscfSearchResults.length > 0) {
        // Pick best USCF match by name
        const uscfMatch = uscfSearchResults.find((r) => namesMatch(inputName, r.name));
        if (uscfMatch) {
          finalUscfId = uscfMatch.uscfId;
          logger.info({ uscfId: finalUscfId, name: uscfMatch.name }, '[Identity] Found USCF ID via direct search');
        }
      }

      // Gemini backfills only missing IDs
      if (!finalFideId && geminiIds.fideId) {
        finalFideId = geminiIds.fideId;
        logger.info({ fideId: finalFideId }, '[Identity] Found FIDE ID via Gemini');
      }
      if (!finalUscfId && geminiIds.uscfId) {
        finalUscfId = geminiIds.uscfId;
        logger.info({ uscfId: finalUscfId }, '[Identity] Found USCF ID via Gemini');
      }
    }

    // ── Step 3: Fetch FIDE/USCF profiles (parallel) ────────────────
    logger.info({ fideId: finalFideId, uscfId: finalUscfId }, '[Identity] Step 3: Fetching profiles');
    const [fideProfileFetched, uscfProfileFetched] = await Promise.all([
      finalFideId ? getFideProfile(finalFideId) : Promise.resolve(null),
      finalUscfId ? getUscfProfile(finalUscfId) : Promise.resolve(null),
    ]);

    // Validate names match
    if (fideProfileFetched && !namesMatch(inputName, fideProfileFetched.name)) {
      logger.warn(
        { search: inputName, profile: fideProfileFetched.name },
        '[Identity] FIDE name mismatch, rejecting',
      );
    } else {
      fideProfile = fideProfileFetched;
    }

    if (uscfProfileFetched && !namesMatch(inputName, uscfProfileFetched.name)) {
      logger.warn(
        { search: inputName, profile: uscfProfileFetched.name },
        '[Identity] USCF name mismatch, rejecting',
      );
    } else {
      uscfProfile = uscfProfileFetched;
    }

    // Cross-populate: USCF profile often contains FIDE ID
    if (!fideProfile && uscfProfile?.fideId) {
      logger.info(
        { fideId: uscfProfile.fideId },
        '[Identity] Cross-populating FIDE ID from USCF profile',
      );
      const crossFide = await getFideProfile(uscfProfile.fideId);
      if (crossFide && namesMatch(inputName, crossFide.name)) {
        fideProfile = crossFide;
        finalFideId = uscfProfile.fideId;
        logger.info(
          { fideId: finalFideId, name: crossFide.name },
          '[Identity] FIDE profile resolved via USCF cross-reference',
        );
      }
    }

    // Normalize "LastName, FirstName" → "FirstName LastName"
    const normalizeName = (n: string): string => {
      const parts = n.split(',').map((p) => p.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        return `${parts[1]} ${parts[0]}`;
      }
      return n;
    };

    // Resolve official name (prefer FIDE, then USCF, then input)
    officialName = inputName.trim();
    if (fideProfile?.name?.trim() && !isBogusName(fideProfile.name.trim())) {
      officialName = normalizeName(fideProfile.name.trim());
    } else if (uscfProfile?.name?.trim() && !isBogusName(uscfProfile.name.trim())) {
      officialName = normalizeName(uscfProfile.name.trim());
    }

    // ── Step 4: Platform usernames ──────────────────────────────────
    let verifiedChessCom = '';
    let verifiedLichess = '';

    // Trust provided usernames
    if (providedChessComUsername?.trim()) {
      verifiedChessCom = providedChessComUsername.trim();
      logger.info({ username: verifiedChessCom }, '[Identity] Using provided Chess.com username');
    }
    if (providedLichessUsername?.trim()) {
      verifiedLichess = providedLichessUsername.trim();
      logger.info({ username: verifiedLichess }, '[Identity] Using provided Lichess username');
    }

    // Discover missing usernames
    const needsChessCom = !verifiedChessCom;
    const needsLichess = !verifiedLichess;

    if (needsChessCom || needsLichess) {
      // Step 4a: Deterministic platform search
      const [lichessAutocomplete, chessComVariantResults] = await Promise.all([
        needsLichess ? searchLichessPlayer(officialName) : Promise.resolve([]),
        needsChessCom
          ? Promise.all(
            chessComUsernameVariants(officialName)
              .slice(0, 4) // Limit to 4 variants
              .map(async (variant) => {
                const profile = await getChessComProfile(variant);
                return profile ? { username: variant, profile } : null;
              }),
          )
          : Promise.resolve([]),
      ]);

      // Verify Lichess candidates
      if (needsLichess && lichessAutocomplete.length > 0) {
        for (const candidate of lichessAutocomplete.slice(0, 5)) {
          const profile = await getLichessProfile(candidate);
          if (profile) {
            const result = verifyHandle(candidate, 'lichess', profile, officialName, fideProfile);
            if (result) {
              verifiedLichess = result;
              logger.info({ username: result }, '[Identity] Lichess username verified via autocomplete');
              break;
            }
          }
        }
      }

      // Verify Chess.com candidates
      if (needsChessCom) {
        for (const item of chessComVariantResults) {
          if (item) {
            const result = verifyHandle(item.username, 'chess.com', item.profile, officialName, fideProfile);
            if (result) {
              verifiedChessCom = result;
              logger.info({ username: result }, '[Identity] Chess.com username verified via variant');
              break;
            }
          }
        }
      }

      // ── Step 5: Gemini fallback for usernames ───────────────────
      if (!verifiedChessCom || !verifiedLichess) {
        logger.info('[Identity] Step 5: Gemini fallback for usernames');
        const geminiUsernames = await searchUsernamesViaGemini(
          officialName,
          finalFideId || null,
          finalUscfId || null,
        );

        // Verify Gemini Chess.com candidates
        if (!verifiedChessCom && geminiUsernames.chessComCandidates.length > 0) {
          for (const candidate of geminiUsernames.chessComCandidates) {
            const profile = await getChessComProfile(candidate);
            if (profile) {
              const result = verifyHandle(candidate, 'chess.com', profile, officialName, fideProfile);
              if (result) {
                verifiedChessCom = result;
                logger.info({ username: result }, '[Identity] Chess.com verified via Gemini');
                break;
              }
            }
          }
        }

        // Verify Gemini Lichess candidates
        if (!verifiedLichess && geminiUsernames.lichessCandidates.length > 0) {
          for (const candidate of geminiUsernames.lichessCandidates) {
            const profile = await getLichessProfile(candidate);
            if (profile) {
              const result = verifyHandle(candidate, 'lichess', profile, officialName, fideProfile);
              if (result) {
                verifiedLichess = result;
                logger.info({ username: result }, '[Identity] Lichess verified via Gemini');
                break;
              }
            }
          }
        }
      }
    }

    return {
      verifiedName: capitalizeName(officialName),
      fideProfile,
      uscfProfile,
      chessComUsername: verifiedChessCom,
      lichessUsername: verifiedLichess,
      confidence: verifiedChessCom || verifiedLichess ? 1.0 : 0,
    };
  } catch (err) {
    logger.error({ err, name: inputName }, '[Identity] Fatal discovery failure');
    return {
      verifiedName: capitalizeName(officialName),
      fideProfile: null,
      uscfProfile: null,
      chessComUsername: '',
      lichessUsername: '',
      confidence: 0,
    };
  }
}
