import { logger } from '../lib/logger.js';
import { capitalizeName } from '../lib/validation.js';
import { fetchWithRetry } from '../lib/fetchWithRetry.js';
import { getCachedIdentity, setCachedIdentity } from '../lib/identityCache.js';
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

  const hasFideId = !!fideId?.trim();
  const hasUscfId = !!uscfId?.trim();
  const hasChessCom = !!providedChessComUsername?.trim();
  const hasLichess = !!providedLichessUsername?.trim();

  // Cache lookup (server-side DB)
  const cached = await getCachedIdentity(
    inputName,
    fideId,
    uscfId,
    providedChessComUsername,
    providedLichessUsername,
  );
  if (cached) return cached;

  // Fast path: user provided all IDs and usernames — skip search and Gemini
  if (hasFideId && hasUscfId && hasChessCom && hasLichess) {
    logger.info({ name: inputName }, '[Identity] Fast path: all IDs provided, skipping search');
    const [fideProfileFetched, uscfProfileFetched] = await Promise.all([
      getFideProfile(fideId.trim()),
      getUscfProfile(uscfId.trim()),
    ]);
    const fastResult: ResolvedIdentity = {
      verifiedName: capitalizeName(inputName.trim()),
      fideProfile: fideProfileFetched,
      uscfProfile: uscfProfileFetched,
      chessComUsername: providedChessComUsername!.trim(),
      lichessUsername: providedLichessUsername!.trim(),
      confidence: 1.0,
    };
    await setCachedIdentity(
      inputName,
      fideId,
      uscfId,
      providedChessComUsername,
      providedLichessUsername,
      fastResult,
    );
    return fastResult;
  }

  try {
    let finalFideId = fideId;
    let finalUscfId = uscfId;

    // ── Steps 1+2: FIDE search + USCF search + Gemini ID lookup (with retry on wrong match) ─
    let geminiExcludeIds: { fideId?: string; uscfId?: string } | undefined;
    const MAX_GEMINI_ID_RETRIES = 2;

    for (let geminiAttempt = 0; geminiAttempt < MAX_GEMINI_ID_RETRIES; geminiAttempt++) {
      if (geminiAttempt === 0 && inputName.trim() && (!fideId || !uscfId)) {
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
            ? searchIdsViaGemini(inputName, geminiExcludeIds).catch((err) => {
              logger.warn({ err }, '[Identity] Gemini ID fallback failed, continuing');
              return { fideId: '', uscfId: '' };
            })
            : Promise.resolve({ fideId: '', uscfId: '' }),
        ]);

        if (fideSearchResult) {
          finalFideId = fideSearchResult.fideId;
          logger.info({ fideId: finalFideId, name: fideSearchResult.name }, '[Identity] Found FIDE ID via direct search');
        }
        if (!finalUscfId && uscfSearchResults.length > 0) {
          const uscfMatch = uscfSearchResults.find((r) => namesMatch(inputName, r.name));
          if (uscfMatch) {
            finalUscfId = uscfMatch.uscfId;
            logger.info({ uscfId: finalUscfId, name: uscfMatch.name }, '[Identity] Found USCF ID via direct search');
          }
        }
        if (!finalFideId && geminiIds.fideId) {
          finalFideId = geminiIds.fideId;
          logger.info({ fideId: finalFideId }, '[Identity] Found FIDE ID via Gemini');
        }
        if (!finalUscfId && geminiIds.uscfId) {
          finalUscfId = geminiIds.uscfId;
          logger.info({ uscfId: finalUscfId }, '[Identity] Found USCF ID via Gemini');
        }
      } else if (geminiAttempt > 0 && (geminiExcludeIds?.fideId || geminiExcludeIds?.uscfId)) {
        logger.info({ attempt: geminiAttempt + 1, excludeIds: geminiExcludeIds }, '[Identity] Retrying Gemini ID search');
        const geminiIds = await searchIdsViaGemini(inputName, geminiExcludeIds).catch(() => ({ fideId: '', uscfId: '' }));
        if (!finalFideId && geminiIds.fideId) {
          finalFideId = geminiIds.fideId;
          logger.info({ fideId: finalFideId }, '[Identity] Found FIDE ID via Gemini (retry)');
        }
        if (!finalUscfId && geminiIds.uscfId) {
          finalUscfId = geminiIds.uscfId;
          logger.info({ uscfId: finalUscfId }, '[Identity] Found USCF ID via Gemini (retry)');
        }
      }

      // ── Step 3: Fetch FIDE/USCF profiles and validate names ────────
      logger.info({ fideId: finalFideId, uscfId: finalUscfId }, '[Identity] Step 3: Fetching profiles');
      const [fideProfileFetched, uscfProfileFetched] = await Promise.all([
        finalFideId ? getFideProfile(finalFideId) : Promise.resolve(null),
        finalUscfId ? getUscfProfile(finalUscfId) : Promise.resolve(null),
      ]);

      let needGeminiRetry = false;

      if (fideProfileFetched && !namesMatch(inputName, fideProfileFetched.name)) {
        logger.warn(
          { search: inputName, profile: fideProfileFetched.name, fideId: finalFideId },
          '[Identity] FIDE name mismatch, rejecting ID (wrong person)',
        );
        geminiExcludeIds = { ...geminiExcludeIds, fideId: finalFideId };
        finalFideId = '';
        needGeminiRetry = true;
      } else if (fideProfileFetched) {
        fideProfile = fideProfileFetched;
      }

      if (uscfProfileFetched && !namesMatch(inputName, uscfProfileFetched.name)) {
        logger.warn(
          { search: inputName, profile: uscfProfileFetched.name, uscfId: finalUscfId },
          '[Identity] USCF name mismatch, rejecting ID (wrong person)',
        );
        geminiExcludeIds = { ...geminiExcludeIds, uscfId: finalUscfId };
        finalUscfId = '';
        needGeminiRetry = true;
      } else if (uscfProfileFetched) {
        uscfProfile = uscfProfileFetched;
      }

      if (!needGeminiRetry || geminiAttempt >= MAX_GEMINI_ID_RETRIES - 1) break;
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

    // Always use the name provided by the user in the search box for the report.
    // Do NOT override with FIDE/USCF profile names — the user's input is authoritative.
    officialName = inputName.trim();

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

    // Discover missing usernames via Vertex AI only
    const needsChessCom = !verifiedChessCom;
    const needsLichess = !verifiedLichess;

    if (needsChessCom || needsLichess) {
      logger.info('[Identity] Searching for usernames via Vertex AI');
      const geminiUsernames = await searchUsernamesViaGemini(
        officialName,
        finalFideId || null,
        finalUscfId || null,
      );

      // Verify Gemini Chess.com candidates (with title cross-reference)
      if (!verifiedChessCom && geminiUsernames.chessComCandidates.length > 0) {
        for (const candidate of geminiUsernames.chessComCandidates) {
          const profile = await getChessComProfile(candidate);
          if (profile) {
            const result = verifyHandle(candidate, 'chess.com', profile, officialName, fideProfile, uscfProfile);
            if (result) {
              verifiedChessCom = result;
              logger.info({ username: result }, '[Identity] Chess.com verified via Vertex AI');
              break;
            }
          }
        }
      }

      // Verify Gemini Lichess candidates (with title cross-reference)
      if (!verifiedLichess && geminiUsernames.lichessCandidates.length > 0) {
        for (const candidate of geminiUsernames.lichessCandidates) {
          const profile = await getLichessProfile(candidate);
          if (profile) {
            const result = verifyHandle(candidate, 'lichess', profile, officialName, fideProfile, uscfProfile);
            if (result) {
              verifiedLichess = result;
              logger.info({ username: result }, '[Identity] Lichess verified via Vertex AI');
              break;
            }
          }
        }
      }
    }

    const result: ResolvedIdentity = {
      verifiedName: capitalizeName(officialName),
      fideProfile,
      uscfProfile,
      chessComUsername: verifiedChessCom,
      lichessUsername: verifiedLichess,
      confidence: verifiedChessCom || verifiedLichess ? 1.0 : 0,
    };

    await setCachedIdentity(
      inputName,
      fideId,
      uscfId,
      providedChessComUsername,
      providedLichessUsername,
      result,
    );
    return result;
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
