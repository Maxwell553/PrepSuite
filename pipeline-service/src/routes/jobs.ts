import { Hono } from "hono";
import { backend } from "../lib/backend.js";
import { validateAnalyzeRequest } from "../lib/validation.js";
import { consumeLimit } from "../lib/sharedLimits.js";
import { runAnalysis } from "../pipeline/runAnalysis.js";
import { SSEStream } from "../lib/sse.js";
import { workContext } from "../lib/workContext.js";
import { logger } from "../lib/logger.js";
export const jobsRoute = new Hono();
jobsRoute.post("/jobs", async (c) => {
  if (process.env.JOBS_ENABLED !== "true")
    return c.json({ error: "Background jobs not enabled" }, 501);
  try {
    const input = validateAnalyzeRequest(await c.req.json()),
      user = c.get("user").sub;
    if (!(await consumeLimit(`analysis:${user}`, 20, 600)))
      return c.json({ error: "Analysis limit reached" }, 429);
    const { data, error } = await backend()
      .from("analysis_jobs")
      .insert({ user_id: user, input })
      .select("id,status")
      .single();
    if (error) {
      logger.error({ error }, "[Jobs] Create failed");
      return c.json({ error: "Analysis storage temporarily unavailable" }, 503);
    }
    return c.json(data, 202);
  } catch (err) {
    return c.json(
      {
        error: err instanceof Error ? err.message : "Could not start analysis",
      },
      400,
    );
  }
});
jobsRoute.get("/jobs/:id", async (c) => {
  const { data, error } = await backend()
    .from("analysis_jobs")
    .select("id,status,progress,result,error")
    .eq("id", c.req.param("id"))
    .eq("user_id", c.get("user").sub)
    .maybeSingle();
  if (error) return c.json({ error: "Could not read analysis" }, 503);
  if (!data) return c.json({ error: "Analysis not found" }, 404);
  return c.json(data);
});
jobsRoute.delete("/jobs/:id", async (c) => {
  const { error } = await backend()
    .from("analysis_jobs")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", c.req.param("id"))
    .eq("user_id", c.get("user").sub)
    .in("status", ["queued", "running"]);
  return error
    ? c.json({ error: "Cancellation failed" }, 503)
    : c.json({ cancelled: true });
});
/** Durable DB queue. Deployment must supply always-on CPU while JOBS_ENABLED=true. */
export function startJobWorker() {
  if (process.env.JOBS_ENABLED !== "true") return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if(process.env.BILLING_ENABLED==='true')await backend().rpc('release_expired_credit_reservations').throwOnError();
      const { data, error } = await backend().rpc("claim_analysis_job");
      if (error) throw error;
      const job = data?.[0];
      if (!job) return;
      const abort = new AbortController();
      let progress: unknown = { phase: "queued", status: "started" },
        result: unknown,
        errorMessage: string | undefined;
      // Drain stream concurrently so progress never buffers an entire report.
      const stream = new SSEStream();
      const reader = stream.response().body!.getReader();
      const drain = (async () => {
        while (!(await reader.read()).done) {}
      })();
      stream.sendPhase = (value) => {
        progress = value;
      };
      stream.sendProgress = (value) => {
        progress = value;
      };
      stream.sendEvent = () => {};
      stream.sendComplete = (value) => {
        result = value;
      };
      stream.sendError = (value) => {
        errorMessage = value.error;
      };
      const persist = async () => {
        const { data: current } = await backend()
          .from("analysis_jobs")
          .select("status,attempts")
          .eq("id", job.id)
          .single();
        if (
          current?.status !== "running" ||
          current.attempts !== job.attempts
        ) {
          abort.abort();
          return;
        }
        await backend()
          .from("analysis_jobs")
          .update({
            progress,
            lease_until: new Date(Date.now() + 300000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("status", "running")
          .eq("attempts", job.attempts)
          .throwOnError();
      };
      const timer = setInterval(
        () =>
          void persist().catch((err) => {
            logger.error({ err }, "[Jobs] heartbeat failed");
            abort.abort();
          }),
        2000,
      );
      const deadline = setTimeout(() => abort.abort(), 240000);
      try {
        await workContext.run(abort.signal, () =>
          runAnalysis(job.input, stream, job.user_id, false, job.id),
        );
        if (errorMessage) throw new Error(errorMessage);
        if (!result) throw new Error("No report was produced");
        await backend()
          .from("analysis_jobs")
          .update({
            status: "complete",
            result,
            progress: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("status", "running")
          .eq("attempts", job.attempts)
          .throwOnError();
      } catch (err) {
        await backend()
          .from("analysis_jobs")
          .update({
            status: "failed",
            error: err instanceof Error ? err.message : "Analysis failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("status", "running")
          .eq("attempts", job.attempts);
      } finally {
        clearInterval(timer);
        clearTimeout(deadline);
        await stream.close();
        await drain;
      }
    } catch (err) {
      logger.error({ err }, "[Jobs] Worker unavailable");
    } finally {
      busy = false;
    }
  };
  setInterval(() => void tick(), 2000).unref();
  void tick();
}
