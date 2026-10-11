import { boundedLookup } from '../lib/boundedLookup.js';
import { workContext } from '../lib/workContext.js';
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
import { searchUsernamesViaGemini } from './geminiFallback.js';

const CHESS_COM_BASE = 'https://api.chess.com/pub/player';
const LICHESS_BASE = 'https://lichess.org/api';
const USER_AGENT = 'PrepSuite-Pipeline/1.0';

// ─── Platform helpers ───────────────────────────────────────────────

async function getChessComProfile(username: string): Promise<ChessComProfile | null> {
  if (!username) return null;
  try {
    const res = await fetchWithRetry(`${CHESS_COM_BASE}/${encodeURIComponent(username.toLowerCase())}`, {
      headers: { 'User-Agent': USER_AGENT },
      timeoutMs: 5000,
      retries: 0,
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
      timeoutMs: 5000,
      retries: 0,
    });
    if (!res.ok) return null;
    return (await res.json()) as LichessProfile;
  } catch {
    return null;
  }
}

// ─── Main orchestrator ──────────────────────────────────────────────

export interface ResolveIdentityOptions {
  /** When true, skip Chess.com/Lichess lookup (for OTB-only analysis) */
  skipOnlinePlatforms?: boolean;
}

/** Partial identity sent as each piece is discovered (for progressive UI updates) */
export type PartialIdentityUpdate = Partial<Pick<ResolvedIdentity, 'verifiedName' | 'fideId' | 'uscfId' | 'fideProfile' | 'uscfProfile' | 'chessComUsername' | 'lichessUsername'>>;

export async function resolveIdentity(
  inputName: string, fideId: string, uscfId: string,
  providedChessComUsername?: string, providedLichessUsername?: string,
  onProgress?: (message: string) => void,
  options?: ResolveIdentityOptions & { onPartialIdentity?: (partial: PartialIdentityUpdate) => void },
): Promise<ResolvedIdentity> {
  const name = capitalizeName(inputName.trim());
  const skipOnline = options?.skipOnlinePlatforms ?? false;
  const result: ResolvedIdentity = {
    verifiedName: name, fideId: '', uscfId: '', fideProfile: null, uscfProfile: null,
    chessComUsername: skipOnline ? '' : providedChessComUsername?.trim() || '',
    lichessUsername: skipOnline ? '' : providedLichessUsername?.trim() || '', confidence: 0,
  };
  const suppliedHandle = !!(result.chessComUsername || result.lichessUsername);
  const publish = () => options?.onPartialIdentity?.({...result});
  onProgress?.('Finding player and linked accounts…');
  publish();

  const acceptFide = async (id: string) => {
    const profile = await getFideProfile(id);
    workContext.getStore()?.throwIfAborted();
    if (profile && namesMatch(inputName, profile.name)) {
      result.fideId = id; result.fideProfile = profile; publish();
    }
  };

  // One wall-clock budget covers every FIDE/USCF request, including search and body reads.
  // Online account discovery is independent and never restarts rating enrichment.
  await Promise.all([
    boundedLookup('FIDE/USCF enrichment', 6500, async () => {
      const started = Date.now();
      await Promise.all([
        (async () => {
          let id = fideId.trim();
          if (!id && inputName.trim()) {
            const match = pickBestFideMatch(inputName, await searchFideByName(inputName));
            workContext.getStore()?.throwIfAborted();
            id = match?.fideId || '';
          }
          if (id) await acceptFide(id);
        })(),
        (async () => {
          let id = uscfId.trim();
          if (!id) {
            const matches = await searchUscfByName(inputName);
            workContext.getStore()?.throwIfAborted();
            id = matches.find(m => namesMatch(inputName, m.name))?.uscfId || '';
          }
          if (!id) return;
          const profile = await getUscfProfile(id);
          workContext.getStore()?.throwIfAborted();
          if (profile && namesMatch(inputName, profile.name)) {
            result.uscfId = profile.id || id; result.uscfProfile = profile; publish();
          }
        })(),
      ]);
      if (!result.fideId && result.uscfProfile?.fideId) await acceptFide(result.uscfProfile.fideId);
      logger.info({durationMs:Date.now()-started, fideId:result.fideId, uscfId:result.uscfId}, '[Identity] FIDE/USCF enrichment complete');
    }, undefined),
    !skipOnline && !suppliedHandle ? boundedLookup('online discovery', 24000, async () => {
      const candidates = await searchUsernamesViaGemini(inputName, result.fideId || null, result.uscfId || null);
      workContext.getStore()?.throwIfAborted();
      await Promise.all([
        Promise.all(candidates.chessComCandidates.slice(0, 5).map(async handle => {
          const profile = await getChessComProfile(handle);
          workContext.getStore()?.throwIfAborted();
          if (!result.chessComUsername && profile) {
            const verified = verifyHandle(handle, 'chess.com', profile, name, result.fideProfile, result.uscfProfile);
            if (verified) { result.chessComUsername = verified; publish(); }
          }
        })),
        Promise.all(candidates.lichessCandidates.slice(0, 5).map(async handle => {
          const profile = await getLichessProfile(handle);
          workContext.getStore()?.throwIfAborted();
          if (!result.lichessUsername && profile) {
            const verified = verifyHandle(handle, 'lichess', profile, name, result.fideProfile, result.uscfProfile);
            if (verified) { result.lichessUsername = verified; publish(); }
          }
        })),
      ]);
    }, undefined) : Promise.resolve(),
  ]);
  result.confidence = result.chessComUsername || result.lichessUsername ? .8 : 0;
  return result;
}
