import { fetchRatingJson } from '../lib/ratingProvider.js';
import { logger } from '../lib/logger.js';
import type { UscfProfile } from '../lib/types.js';

const API = 'https://ratings-api.uschess.org/api/v1/members';
export interface UscfSearchResult {
  uscfId: string; name: string; state: string; rating: number;
}

/** Current published US Chess ratings, from the public member API used by MUIR. */
export function parseUscfMember(value: unknown): UscfProfile | null {
  if (!value || typeof value !== 'object') return null;
  const member = value as Record<string, any>;
  const id = String(member.id || '');
  const name = [member.firstName, member.middleName, member.lastName].filter(v => typeof v === 'string' && v.trim()).join(' ');
  if (!/^\d{7,8}$/.test(id) || !name) return null;
  const regular = Array.isArray(member.ratings) ? member.ratings.find((r: any) => r.ratingSystem === 'R' || r.ratingSystem === 'OverTheBoardRegular') : undefined;
  const rating = typeof regular?.rating === 'number' && regular.rating > 0 ? regular.rating : 0;
  return { id, name, rating, state: member.stateRep || member.jurisdiction || '',
    fideId: /^\d+$/.test(String(member.fideId || '')) ? String(member.fideId) : undefined,
    title: typeof member.uscfTitle === 'string' ? member.uscfTitle : undefined };
}

export async function searchUscfByName(name: string): Promise<UscfSearchResult[]> {
  if (!name.trim()) return [];
  try {
    const data = await fetchRatingJson(`${API}?Fuzzy=${encodeURIComponent(name.trim())}&Size=20`) as { items?: unknown[] };
    return Array.isArray(data?.items) ? data.items.map(parseUscfMember).filter((p): p is UscfProfile => p !== null)
      .map(p => ({ uscfId: p.id!, name: p.name, state: p.state, rating: p.rating })) : [];
  } catch (err) { logger.warn({err}, '[UscfSearch] Public API unavailable'); return []; }
}

export async function getUscfProfile(uscfId: string): Promise<UscfProfile | null> {
  const id = uscfId?.trim();
  if (!/^\d{7,8}$/.test(id)) return null;
  try {
    const profile = parseUscfMember(await fetchRatingJson(`${API}/${id}`));
    return profile?.id === id ? profile : null;
  } catch (err) { logger.warn({err, uscfId:id}, '[UscfProfile] Public API unavailable'); return null; }
}
