# Stripe Setup for PrepSuite (Soundside Design LLC)

This guide walks you through connecting Stripe to PrepSuite so the "Upgrade to Premium" button works.

## Prerequisites

- Stripe account (under Soundside Design LLC)
- Supabase project with edge functions deployed

---

## Step 1: Create Product & Price in Stripe

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Products** → **Add product**
2. **Name:** PrepSuite Premium
3. **Pricing:**
   - **Recurring** → Monthly
   - **Price:** $9.99 USD
4. Click **Save product**
5. Copy the **Price ID** (starts with `price_`) — you'll need it for `STRIPE_PRICE_ID`

---

## Step 2: Configure Supabase Secrets

Set these secrets for your Supabase project:

```bash
# Required for stripe-checkout
supabase secrets set STRIPE_SECRET_KEY=sk_live_...   # or sk_test_... for testing
supabase secrets set STRIPE_PRICE_ID=price_...

# Required for stripe-webhook
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

**Where to find these:**
- **STRIPE_SECRET_KEY:** Stripe Dashboard → Developers → API keys → Secret key
- **STRIPE_PRICE_ID:** From Step 1 (the Price ID of your $9.99/month product)
- **STRIPE_WEBHOOK_SECRET:** From Step 3 below

---

## Step 3: Create Stripe Webhook

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. **Endpoint URL:**  
   `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`
   
   Replace `<YOUR_PROJECT_REF>` with your Supabase project reference (e.g. `abcdefghij` from `https://abcdefghij.supabase.co`).
3. **Events to send:** Select:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
4. Click **Add endpoint**
5. Copy the **Signing secret** (starts with `whsec_`) → use as `STRIPE_WEBHOOK_SECRET`

---

## Step 4: Deploy Edge Functions

```bash
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
```

---

## Step 5: Run Database Migration

Ensure the `profiles` table exists:

```bash
supabase db push
```

Or apply the migration manually: `supabase/migrations/20260308_profiles_subscription.sql`

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
3. Click **Upgrade to Premium — $9.99/mo**
4. You should be redirected to Stripe Checkout
5. Complete the payment (use test card `4242 4242 4242 4242` in test mode)
6. After success, you're redirected back; your profile should show Premium

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Stripe not configured" | Ensure `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` are set in Supabase secrets |
| "Invalid signature" on webhook | Verify `STRIPE_WEBHOOK_SECRET` matches the webhook's signing secret |
| Checkout redirects to wrong URL | Pass `success_url` and `cancel_url` in the request body to `stripe-checkout` |
| Profile not updating after payment | Check webhook logs in Stripe Dashboard; ensure endpoint URL is correct |

---

## Customer Portal (Optional)

To let users manage/cancel their subscription, you can add a "Manage subscription" link that opens Stripe Customer Portal. Create a `stripe-portal` edge function that creates a portal session and redirects the user.
