import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEVELOPER_EMAIL = "max@soundside.ai";

serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Only allow requests with the cron secret (called by pg_cron)
    const cronSecret = Deno.env.get("NIGHTLY_DIGEST_CRON_SECRET");
    const authHeader = req.headers.get("Authorization");
    const expectedAuth = cronSecret ? `Bearer ${cronSecret}` : null;

    if (!cronSecret || authHeader !== expectedAuth) {
      console.warn("[nightly-digest] Unauthorized: missing or invalid cron secret");
      return new Response("Unauthorized", { status: 401 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[nightly-digest] Missing Supabase config");
      return new Response("Server configuration error", { status: 500 });
    }
    if (!resendApiKey) {
      console.error("[nightly-digest] RESEND_API_KEY not set");
      return new Response("Resend not configured", { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch digest metrics via RPC (includes auth.users count)
    const { data: digest, error: rpcError } = await supabase.rpc("get_nightly_digest");

    if (rpcError) {
      console.error("[nightly-digest] RPC error:", rpcError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch digest", details: rpcError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const {
      signups,
      reports,
      questions,
      total_signups,
      total_reports,
      games_24h,
      total_games_analyzed,
    } = digest ?? {
      signups: 0,
      reports: 0,
      questions: 0,
      total_signups: 0,
      total_reports: 0,
      games_24h: 0,
      total_games_analyzed: 0,
    };
    const dateStr = new Date().toISOString().slice(0, 10);

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>PrepSuite Digest</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 1.25rem; margin-bottom: 8px;">PrepSuite Daily Digest</h1>
  <p style="color: #666; margin-bottom: 24px;">${dateStr}</p>
  <h2 style="font-size: 0.875rem; font-weight: 600; color: #888; margin-bottom: 8px;">Last 24 hours</h2>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 12px 0; border-bottom: 1px solid #eee;">New signups</td><td style="text-align: right; font-weight: 600;">${signups}</td></tr>
    <tr><td style="padding: 12px 0; border-bottom: 1px solid #eee;">Reports generated</td><td style="text-align: right; font-weight: 600;">${reports}</td></tr>
    <tr><td style="padding: 12px 0; border-bottom: 1px solid #eee;">Support questions</td><td style="text-align: right; font-weight: 600;">${questions}</td></tr>
    <tr><td style="padding: 12px 0; border-bottom: 1px solid #eee;">Games in new reports (24h)</td><td style="text-align: right; font-weight: 600;">${games_24h ?? 0}</td></tr>
  </table>
  <h2 style="font-size: 0.875rem; font-weight: 600; color: #888; margin: 24px 0 8px;">Cumulative totals</h2>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 12px 0; border-bottom: 1px solid #eee;">Total users signed up</td><td style="text-align: right; font-weight: 600;">${total_signups ?? 0}</td></tr>
    <tr><td style="padding: 12px 0; border-bottom: 1px solid #eee;">Total reports generated</td><td style="text-align: right; font-weight: 600;">${total_reports ?? 0}</td></tr>
    <tr><td style="padding: 12px 0; border-bottom: 1px solid #eee;">Total games analyzed (all reports)</td><td style="text-align: right; font-weight: 600;">${total_games_analyzed ?? 0}</td></tr>
  </table>
  <p style="margin-top: 24px; font-size: 0.875rem; color: #888;">Sent only to ${DEVELOPER_EMAIL}.</p>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM") ?? "PrepSuite <noreply@prepsuite.ai>",
        to: [DEVELOPER_EMAIL],
        subject: `PrepSuite Digest – ${dateStr}`,
        html,
      }),
    });

    const resData = await res.json();
    if (!res.ok) {
      console.error("[nightly-digest] Resend error:", resData);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: resData }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("[nightly-digest] Sent to", DEVELOPER_EMAIL, resData);
    return new Response(
      JSON.stringify({ ok: true, to: DEVELOPER_EMAIL }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[nightly-digest] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", message: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
