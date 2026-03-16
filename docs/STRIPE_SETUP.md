# Stripe Setup for PrepSuite (Soundside Design LLC)

This guide walks you through connecting Stripe to PrepSuite for credit-based purchases.

## Prerequisites

- Stripe account (under Soundside Design LLC)
- Supabase project with edge functions deployed

---

## Step 1: Create Credit Pack Products in Stripe

Create **one-time** payment products (not recurring):

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Products** → **Add product**
2. Create three products:
   - **Starter:** 1,000 credits — one-time price (e.g. $4.99)
   - **Standard:** 5,000 credits — one-time price (e.g. $19.99)
   - **Pro:** 15,000 credits — one-time price (e.g. $49.99)
3. For each product: **Pricing** → **One time** → set price
4. Copy each **Price ID** (starts with `price_`)

---

## Step 2: Configure Supabase Secrets

Set these secrets for your Supabase project:

```bash
# Required for all Stripe functions
supabase secrets set STRIPE_SECRET_KEY=sk_live_...   # or sk_test_... for testing
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

# Credit pack price IDs (one-time payments)
supabase secrets set STRIPE_CREDITS_PRICE_STARTER=price_...
supabase secrets set STRIPE_CREDITS_PRICE_STANDARD=price_...
supabase secrets set STRIPE_CREDITS_PRICE_PRO=price_...
```

**Where to find these:**
- **STRIPE_SECRET_KEY:** Stripe Dashboard → Developers → API keys → Secret key
- **STRIPE_CREDITS_PRICE_***:** From Step 1 (Price IDs of your credit pack products)
- **STRIPE_WEBHOOK_SECRET:** From Step 3 below

---

## Step 3: Create Stripe Webhook

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. **Endpoint URL:**  
   `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`
   
   Replace `<YOUR_PROJECT_REF>` with your Supabase project reference.
3. **Events to send:** Select:
   - `checkout.session.completed` (for credit pack purchases)
   - `customer.subscription.created` (legacy, if migrating)
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
4. Click **Add endpoint**
5. Copy the **Signing secret** (starts with `whsec_`) → use as `STRIPE_WEBHOOK_SECRET`

---

## Step 4: Deploy Edge Functions

```bash
supabase functions deploy stripe-credits-checkout
supabase functions deploy stripe-webhook
supabase functions deploy stripe-portal
```

The `stripe-credits-checkout` function creates one-time payment sessions for credit packs. The `stripe-portal` function lets users manage payment methods.

---

## Step 5: Run Database Migration

Ensure the `profiles` table exists and has the `credits` column:

```bash
supabase db push
```

Migrations: `20260308_profiles_subscription.sql`, `20260316_profiles_credits.sql`

---

## Step 6: Test the Flow

### Local testing (Stripe CLI)

1. Install [Stripe CLI](https://stripe.com/docs/stripe-cli)
2. Login: `stripe login`
3. Forward webhooks to your local Supabase:
   ```bash
   stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
   ```
4. Use the webhook signing secret from the CLI output for local testing
5. Run Supabase locally: `supabase start` and `supabase functions serve`

### Production

1. Sign in to PrepSuite
2. Go to **User Settings** (profile icon)
3. You should see your credit balance (3,000 to start)
4. Click a credit pack (e.g. "5,000 credits") to buy
5. Complete the payment (use test card `4242 4242 4242 4242` in test mode)
6. After success, you're redirected back; your credit balance should increase

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Stripe not configured" | Ensure `STRIPE_SECRET_KEY` and credit pack price IDs are set in Supabase secrets |
| "Invalid pack" | Ensure `STRIPE_CREDITS_PRICE_STARTER`, `_STANDARD`, `_PRO` are set |
| "Invalid signature" on webhook | Verify `STRIPE_WEBHOOK_SECRET` matches the webhook's signing secret |
| Credits not added after purchase | Check webhook logs; ensure `checkout.session.completed` is configured |
| Profile not updating after payment | Check webhook logs in Stripe Dashboard; ensure endpoint URL is correct |

---

## Customer Portal

The `stripe-portal` edge function lets users manage payment methods (add/remove cards). It creates a Stripe Customer if the user doesn't have one yet.

**Enable in Stripe:** Dashboard → Settings → Billing → Customer portal.
