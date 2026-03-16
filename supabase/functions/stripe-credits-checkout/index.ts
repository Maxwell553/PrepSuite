/**
 * Create Stripe Checkout Session for one-time credit pack purchase.
 * Replaces subscription checkout for credit-based monetization.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeadersForRequest } from "../_shared/cors.ts";

async function stripeRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(
      Object.entries(body).reduce(
        (acc, [k, v]) => {
          if (v !== undefined && v !== null) acc[k] = String(v);
          return acc;
        },
        {} as Record<string, string>
      )
    ).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Stripe API error: ${res.status}`);
  }
  return res.json();
}

/** Credit pack config: price_id -> credits */
const CREDIT_PACKS: Record<string, number> = {
  starter: 1000,
  standard: 5000,
  pro: 15000,
};

function getPackConfig(pack: string): { priceId: string; credits: number } | null {
  const priceId = Deno.env.get(`STRIPE_CREDITS_PRICE_${pack.toUpperCase()}`);
  if (!priceId) return null;
  const credits = CREDIT_PACKS[pack.toLowerCase()];
  if (!credits) return null;
  return { priceId, credits };
}

serve(async (req) => {
  const corsHeaders = getCorsHeadersForRequest(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const pack = (body.pack as string) || "starter";
    const config = getPackConfig(pack);
    if (!config) {
      return new Response(
        JSON.stringify({ error: `Invalid pack: ${pack}. Use starter, standard, or pro.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: currentProfile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = currentProfile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripeRequest<{ id: string }>("/customers", {
        email: user.email ?? undefined,
        "metadata[supabase_user_id]": user.id,
      });
      customerId = customer.id;
      await supabaseAdmin.from("profiles").upsert(
        {
          id: user.id,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    }

    const origin = req.headers.get("origin") || "https://prepsuite.ai";
    const successUrl = (body.success_url as string) || `${origin}/?credits=success`;
    const cancelUrl = (body.cancel_url as string) || `${origin}/#pricing`;

    const session = await stripeRequest<{ url: string }>("/checkout/sessions", {
      mode: "payment",
      customer: customerId,
      "line_items[0][price]": config.priceId,
      "line_items[0][quantity]": 1,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      "metadata[supabase_user_id]": user.id,
      "metadata[credits]": String(config.credits),
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[stripe-credits-checkout]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Checkout failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
