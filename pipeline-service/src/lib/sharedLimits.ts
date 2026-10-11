import { createHash } from "node:crypto";
import { backend } from "./backend.js";
const local = new Map<string, { count: number; until: number }>();
export async function consumeLimit(
  identity: string,
  limit: number,
  seconds: number,
) {
  const key = createHash("sha256").update(identity).digest("hex");
  if (
    process.env.NODE_ENV === "production" ||
    process.env.SHARED_LIMITS_ENABLED === "true"
  ) {
    const { data, error } = await backend().rpc("consume_request_limit", {
      p_key: key,
      p_limit: limit,
      p_seconds: seconds,
    });
    if (error) throw new Error("Request limits temporarily unavailable");
    return data === true;
  }
  const now = Date.now();
  for (const [k, v] of local) if (v.until < now) local.delete(k);
  const bucket = local.get(key) || { count: 0, until: now + seconds * 1000 };
  bucket.count++;
  local.set(key, bucket);
  return bucket.count <= limit;
}
