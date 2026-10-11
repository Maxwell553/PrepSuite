import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18?target=denonext";
const cryptoProvider = Stripe.createSubtleCryptoProvider();
serve(async (req) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET"),
    key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secret || !key)
    return new Response("Webhook configuration unavailable", { status: 500 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const stripe = new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
  });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await req.text(),
      signature,
      secret,
      300,
      cryptoProvider,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    const url = Deno.env.get("SUPABASE_URL"),
      serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey)
      throw new Error("Storage configuration unavailable");
    const db = createClient(url, serviceKey);
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;
      if (session.mode === "payment" && session.payment_status === "paid") {
        const userId =
          session.metadata?.supabase_user_id || session.client_reference_id;
        const credits = Number(session.metadata?.credits);
        if (!userId || !Number.isInteger(credits) || credits <= 0)
          throw new Error("Invalid purchase metadata");
        const { error } = await db.rpc("fulfill_credit_purchase", {
          p_event_id: event.id,
          p_session_id: session.id,
          p_user_id: userId,
          p_amount: credits,
        });
        if (error) throw error;
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      // Fetch current state because Stripe does not guarantee event delivery order.
      const id = (event.data.object as { id: string }).id;
      const sub = await stripe.subscriptions.retrieve(id);
      const userId = sub.metadata?.supabase_user_id;
      if (userId) {
        const status =
          sub.status === "active" || sub.status === "trialing"
            ? "active"
            : sub.status === "past_due"
              ? "past_due"
              : "canceled";
        const periodEnd = sub.items.data.reduce(
          (max: number, item: { current_period_end?: number }) =>
            Math.max(max, item.current_period_end || 0),
          0,
        );
        const { error } = await db.rpc("sync_subscription_event", {
          p_event_id: event.id,
          p_created: event.created,
          p_user_id: userId,
          p_subscription_id: sub.id,
          p_status: status,
          p_period_end: periodEnd
            ? new Date(periodEnd * 1000).toISOString()
            : null,
        });
        if (error) throw error;
      }
    }
    // Subscription updates are authoritative; invoice.paid must not resurrect a canceled subscription.
    return Response.json({ received: true });
  } catch (error) {
    console.error("[stripe-webhook]", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
});
