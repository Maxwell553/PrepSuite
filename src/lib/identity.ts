/** Exact complete identifiers, allowing accents and FIDE's "Last, First" ordering. Never substring-match players. */
export const identityKey = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/,/g, " ")
    .trim()
    .split(/\s+/)
    .sort()
    .join(" ");
export function samePlayer(a: string, b: string) {
  return !!a.trim() && !!b.trim() && identityKey(a) === identityKey(b);
}
