import { Hono } from "hono";
import { analyzeRateLimitMiddleware } from "../middleware/rateLimit.js";
import { validateAnalyzeRequest } from "../lib/validation.js";
import { SSEStream } from "../lib/sse.js";
import { runAnalysis } from "../pipeline/runAnalysis.js";
import { workContext } from "../lib/workContext.js";
export const analyzeRoute = new Hono();
analyzeRoute.post("/analyze", analyzeRateLimitMiddleware, async (c) => {
  let input;
  try {
    input = validateAnalyzeRequest(await c.req.json());
  } catch (err) {
    c.get("releaseAnalyzeSlot")?.();
    return c.json(
      { error: err instanceof Error ? err.message : "Invalid input" },
      400,
    );
  }
  const stream = new SSEStream();
  void workContext
    .run(stream.signal, () => runAnalysis(input, stream, c.get("user").sub))
    .catch((err) =>
      stream.sendError({
        error: err instanceof Error ? err.message : "Analysis failed",
      }),
    )
    .finally(() => {
      void stream.close();
      c.get("releaseAnalyzeSlot")?.();
    });
  return stream.response();
});
