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
  onProgress?: (message: string) => void,
): Promise<ResolvedIdentity> {
  let officialName = inputName;
  let fideProfile: FideProfile | null = null;
  let uscfProfile: UscfProfile | null = null;

  const hasFideId = !!fideId?.trim();
  const hasUscfId = !!uscfId?.trim();
  const hasChessCom = !!providedChessComUsername?.trim();
  const hasLichess = !!providedLichessUsername?.trim();

  onProgress?.('Looking up cache...');
  const cached = await getCachedIdentity(
    inputName,
    fideId,
    uscfId,
    providedChessComUsername,
    providedLichessUsername,
  );
  if (cached) return cached;

  if (hasFideId && hasUscfId && hasChessCom && hasLichess) {
    onProgress?.('Fetching FIDE & USCF profiles...');
    logger.info({ name: inputName }, '[Identity] Fast path: all IDs provided, skipping search');
    const [fideProfileFetched, uscfProfileFetched] = await Promise.all([
      getFideProfile(fideId.trim()),
      getUscfProfile(uscfId.trim()),
    ]);
    const fastResult: ResolvedIdentity = {
      verifiedName: capitalizeName(inputName.trim()),
      fideId: fideId.trim(),
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

    // ── Steps 1+2: FIDE search + USCF search + Gemini ID lookup + Gemini usernames (parallel) ─
    let geminiExcludeIds: { fideId?: string; uscfId?: string } | undefined;
    const MAX_GEMINI_ID_RETRIES = 2;
    let geminiUsernamesEarly: { chessComCandidates: string[]; lichessCandidates: string[] } = {
      chessComCandidates: [],
      lichessCandidates: [],
    };

    const needsChessCom = !hasChessCom;
    const needsLichess = !hasLichess;

    for (let geminiAttempt = 0; geminiAttempt < MAX_GEMINI_ID_RETRIES; geminiAttempt++) {
      if (geminiAttempt === 0 && inputName.trim() && (!fideId || !uscfId || needsChessCom || needsLichess)) {
        onProgress?.('Searching FIDE, USCF & usernames...');
        logger.info(
          { name: inputName },
          '[Identity] Steps 1+2: FIDE + USCF + Gemini IDs + Gemini usernames (parallel)',
        );
        const [fideSearchResult, uscfSearchResults, geminiIds, geminiUsernames] = await Promise.all([
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
          needsChessCom || needsLichess
            ? searchUsernamesViaGemini(inputName, null, null).catch((err) => {
              logger.warn({ err }, '[Identity] Gemini username search failed, continuing');
              return { chessComCandidates: [] as string[], lichessCandidates: [] as string[] };
            })
            : Promise.resolve({ chessComCandidates: [] as string[], lichessCandidates: [] as string[] }),
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
        geminiUsernamesEarly = geminiUsernames;
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

      onProgress?.('Fetching FIDE & USCF profiles...');
      logger.info({ fideId: finalFideId, uscfId: finalUscfId }, '[Identity] Step 3: Fetching profiles');
      const [fideProfileFetched, uscfProfileFetched] = await Promise.all([
        finalFideId ? getFideProfile(finalFideId) : Promise.resolve(null),
        finalUscfId ? getUscfProfile(finalUscfId) : Promise.resolve(null),
      ]);

      let needGeminiRetry = false;

      // ALWAYS reject FIDE ID if profile name doesn't match. If fetch failed, we cannot verify — clear ID.
      if (fideProfileFetched) {
        if (!namesMatch(inputName, fideProfileFetched.name)) {
          logger.warn(
            { search: inputName, profile: fideProfileFetched.name, fideId: finalFideId },
            '[Identity] FIDE name mismatch, rejecting ID (wrong person)',
          );
          geminiExcludeIds = { ...geminiExcludeIds, fideId: finalFideId };
          finalFideId = '';
          needGeminiRetry = true;
        } else {
          fideProfile = fideProfileFetched;
        }
      } else if (finalFideId) {
        // Profile fetch failed — we cannot verify this ID, do not trust it
        logger.warn(
          { fideId: finalFideId, search: inputName },
          '[Identity] FIDE profile fetch failed, rejecting unverified ID',
        );
        geminiExcludeIds = { ...geminiExcludeIds, fideId: finalFideId };
        finalFideId = '';
        needGeminiRetry = true;
      }

      // ALWAYS reject USCF ID if profile name doesn't match. If fetch failed, we cannot verify — clear ID.
      if (uscfProfileFetched) {
        if (!namesMatch(inputName, uscfProfileFetched.name)) {
          logger.warn(
            { search: inputName, profile: uscfProfileFetched.name, uscfId: finalUscfId },
            '[Identity] USCF name mismatch, rejecting ID (wrong person)',
          );
          geminiExcludeIds = { ...geminiExcludeIds, uscfId: finalUscfId };
          finalUscfId = '';
          needGeminiRetry = true;
        } else {
          uscfProfile = uscfProfileFetched;
        }
      } else if (finalUscfId) {
        logger.warn(
          { uscfId: finalUscfId, search: inputName },
          '[Identity] USCF profile fetch failed, rejecting unverified ID',
        );
        geminiExcludeIds = { ...geminiExcludeIds, uscfId: finalUscfId };
        finalUscfId = '';
        needGeminiRetry = true;
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

    // Discover missing usernames via Vertex AI (already fetched in parallel with FIDE/USCF in Step 1+2)
    const stillNeedsChessCom = !verifiedChessCom;
    const stillNeedsLichess = !verifiedLichess;

    if (stillNeedsChessCom || stillNeedsLichess) {
      onProgress?.('Verifying Chess.com & Lichess usernames...');
      const geminiUsernames = geminiUsernamesEarly;

      // Fetch all profiles in parallel
      const chessComCandidates = geminiUsernames.chessComCandidates.slice(0, 5);
      const lichessCandidates = geminiUsernames.lichessCandidates.slice(0, 5);
      const [chessComProfiles, lichessProfiles] = await Promise.all([
        Promise.all(chessComCandidates.map((c) => getChessComProfile(c))),
        Promise.all(lichessCandidates.map((c) => getLichessProfile(c))),
      ]);

      // Verify Gemini Chess.com candidates (with title cross-reference)
      if (stillNeedsChessCom && chessComCandidates.length > 0) {
        for (let i = 0; i < chessComCandidates.length; i++) {
          const profile = chessComProfiles[i];
          const candidate = chessComCandidates[i];
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
      if (stillNeedsLichess && lichessCandidates.length > 0) {
        for (let i = 0; i < lichessCandidates.length; i++) {
          const profile = lichessProfiles[i];
          const candidate = lichessCandidates[i];
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

    onProgress?.('Saving identity...');
    const result: ResolvedIdentity = {
      verifiedName: capitalizeName(officialName),
      fideId: finalFideId?.trim() || '',
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
      fideId: '',
      fideProfile: null,
      uscfProfile: null,
      chessComUsername: '',
      lichessUsername: '',
      confidence: 0,
    };
  }
}
