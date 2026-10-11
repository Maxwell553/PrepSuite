import { AsyncLocalStorage } from "node:async_hooks";
/** Per-analysis discovery citations. URLs are references, never proof of account ownership. */
export const evidenceContext = new AsyncLocalStorage<Set<string>>();
export function collectGrounding(data: unknown) {
  const candidates =
    (
      data as {
        candidates?: {
          groundingMetadata?: {
            groundingChunks?: { web?: { uri?: string } }[];
          };
        }[];
      }
    )?.candidates || [];
  for (const candidate of candidates)
    for (const chunk of candidate.groundingMetadata?.groundingChunks || []) {
      try {
        const url = new URL(chunk.web?.uri || "");
        if (url.protocol === "https:")
          evidenceContext.getStore()?.add(url.href);
      } catch {
        /* Invalid source URL. */
      }
    }
}
