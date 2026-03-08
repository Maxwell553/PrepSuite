import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const [timestamp, v1Part] = signature.replace("t=", "").split(",v1=");
  if (!v1Part) return false;
  const signedPayload = `${timestamp}.${payload}`;
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedPayload)
  );
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === v1Part;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const stripeSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!stripeSecret) {
      console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing stripe-signature", { status: 400 });
    }

    const payload = await req.text();
    const isValid = await verifyStripeSignature(payload, signature, stripeSecret);
    if (!isValid) {
      console.error("[stripe-webhook] Invalid signature");
      return new Response("Invalid signature", { status: 400 });
    }

    const event = JSON.parse(payload);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response("Server configuration error", { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const userId = sub.metadata?.supabase_user_id ?? sub.client_reference_id;
        if (!userId) {
          console.warn("[stripe-webhook] No user id in subscription", sub.id);
          break;
        }
        const status = sub.status === "active" || sub.status === "trialing" ? "active" : sub.status;
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;
        await supabase
          .from("profiles")
          .upsert(
            {
              id: userId,
              stripe_subscription_id: sub.id,
              subscription_status: status,
              current_period_end: periodEnd,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
        console.log("[stripe-webhook] Updated profile", userId, status);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_subscription_id", sub.id)
          .single();
        if (profile) {
          await supabase
            .from("profiles")
            .update({
              stripe_subscription_id: null,
              subscription_status: "free",
              current_period_end: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", profile.id);
          console.log("[stripe-webhook] Downgraded profile", profile.id);
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (subId && typeof subId === "string") {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("stripe_subscription_id", subId)
            .single();
          if (profile) {
            const periodEnd = invoice.period_end
              ? new Date(invoice.period_end * 1000).toISOString()
              : null;
            await supabase
              .from("profiles")
              .update({
                subscription_status: "active",
                current_period_end: periodEnd,
                updated_at: new Date().toISOString(),
              })
              .eq("id", profile.id);
          }
        }
        break;
      }
      default:
        console.log("[stripe-webhook] Unhandled event", event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[stripe-webhook]", err);
    return new Response("Webhook error", { status: 500 });
  }
});
