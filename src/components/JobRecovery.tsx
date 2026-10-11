import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { waitForJob } from "../services/pipelineClient";
import type { ScoutingReport } from "../types";
export default function JobRecovery({
  userId,
  onComplete,
}: {
  userId: string;
  onComplete: (report: ScoutingReport) => void;
}) {
  const [id, setId] = useState(() => {
    try {
      return localStorage.getItem("prepsuite:active-job");
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      "An analysis from your previous visit is available to resume.",
    );
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), [userId]);
  async function resume() {
    if (!id || busy) return;
    setBusy(true);
    abort.current = new AbortController();
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in again to resume.");
      const result = await waitForJob(
        id,
        session.access_token,
        { onPhase: (phase, status) => setMessage(`${phase}: ${status}`) },
        abort.current.signal,
      );
      onComplete(result.report);
      setId(null);
    } catch (e) {
      if (!abort.current.signal.aborted)
        setMessage(e instanceof Error ? e.message : "Could not resume.");
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session || !id) return;
    const response = await fetch(
      `${import.meta.env.VITE_PIPELINE_SERVICE_URL || ""}/api/jobs/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    );
    if (!response.ok) {
      setMessage("Could not cancel. Please try again.");
      return;
    }
    abort.current?.abort();
    try { if (localStorage.getItem("prepsuite:active-job") === id) localStorage.removeItem("prepsuite:active-job"); } catch { /* Storage may be disabled. */ }
    setId(null);
  }
  if (!id) return null;
  return (
    <aside
      className="relative z-10 m-4 p-4 rounded-xl border border-violet-400/30 bg-slate-900 text-white"
      aria-live="polite"
    >
      <p>{message}</p>
      <div className="flex gap-4 mt-2">
        <button
          className="text-violet-300 underline"
          disabled={busy}
          onClick={resume}
        >
          {busy ? "Waiting for analysis…" : "Resume analysis"}
        </button>
        <button
          className="text-slate-400 underline"
          onClick={() =>
            void cancel().catch(() =>
              setMessage("Could not cancel. Try again."),
            )
          }
        >
          Cancel analysis
        </button>
      </div>
    </aside>
  );
}
