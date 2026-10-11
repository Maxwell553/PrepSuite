import { isIP } from "node:net";
/** Select from the right of a known proxy chain; never trust the client-supplied leftmost value. */
export function clientIp(
  forwarded: string | undefined,
  peer: string | undefined,
  trustedHops = 0,
): string {
  const chain = (forwarded || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (
    Number.isInteger(trustedHops) &&
    trustedHops > 0 &&
    chain.length >= trustedHops
  ) {
    const candidate = chain[chain.length - trustedHops];
    if (isIP(candidate)) return candidate;
  }
  return peer && isIP(peer) ? peer : "unknown";
}
