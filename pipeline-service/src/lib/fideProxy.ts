/**
 * When PROXY_BASE_URL is set (e.g. deployed pipeline URL), returns the proxy URL
 * for fetching the given FIDE URL. Otherwise returns the direct URL.
 *
 * Use in dev when direct FIDE requests timeout; the deployed service has better
 * connectivity to ratings.fide.com.
 */
export function getFideFetchUrl(directUrl: string): string {
  const base = process.env.PROXY_BASE_URL?.trim();
  if (!base) return directUrl;

  const baseClean = base.replace(/\/$/, '');
  return `${baseClean}/proxy?url=${encodeURIComponent(directUrl)}`;
}
