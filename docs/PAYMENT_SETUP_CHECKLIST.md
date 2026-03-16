# Payment Setup Checklist: Stripe + Supabase

Follow these steps to get credit purchases working in PrepSuite.

---

## 1. Stripe Dashboard

### Create products and prices

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Products** → **Add product**
2. Create three one-time products:

   | Product  | Credits | Price  | Notes                    |
   |----------|---------|--------|--------------------------|
   | Starter  | 1,000   | $4.99  | One-time payment         |
   | Standard | 5,000   | $19.99 | One-time payment         |
   | Pro      | 15,000  | $49.99 | One-time payment         |

3. For each product: **Pricing** → **One time** → set price → **Save**
4. Copy each **Price ID** (starts with `price_`) — you’ll need these for Supabase secrets

### Create webhook

1. **Developers** → **Webhooks** → **Add endpoint**
2. **Endpoint URL:**  
   `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`  
   (Replace `<YOUR_PROJECT_REF>` with your Supabase project reference, e.g. `abcdefghij`)
3. **Events to send:** Select:
   - `checkout.session.completed` (required for credit purchases)
   - `customer.subscription.created` (legacy)
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
4. **Add endpoint**
5. Copy the **Signing secret** (starts with `whsec_`) — this is your webhook secret

### Get API keys

1. **Developers** → **API keys**
2. Copy the **Secret key** (starts with `sk_test_` for test mode, `sk_live_` for production)

---

## 2. Supabase Dashboard / CLI

### Set secrets

Run these commands (replace placeholders with your values):

```bash
# Required for all Stripe functions
supabase secrets set STRIPE_SECRET_KEY=sk_test_...   # or sk_live_... for production
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

# Credit pack price IDs (from Stripe products)
supabase secrets set STRIPE_CREDITS_PRICE_STARTER=price_...
supabase secrets set STRIPE_CREDITS_PRICE_STANDARD=price_...
supabase secrets set STRIPE_CREDITS_PRICE_PRO=price_...
```

### Deploy edge functions

```bash
supabase functions deploy stripe-credits-checkout
supabase functions deploy stripe-webhook
supabase functions deploy stripe-portal
```

### Run migrations

Ensure the `profiles` table has the `credits` column:

```bash
supabase db push
```

Migrations: `20260308_profiles_subscription.sql`, `20260316_profiles_credits.sql`

---

## 3. Verify setup

1. Sign in to PrepSuite
2. Go to **User Settings** (profile icon)
3. Confirm your credit balance (3,000 to start)
4. Click a credit pack (e.g. "5,000 credits")
5. Complete checkout (use test card `4242 4242 4242 4242` in test mode)
6. After redirect, your credit balance should increase

---

## 4. Local testing (optional)

1. Install [Stripe CLI](https://stripe.com/docs/stripe-cli)
2. `stripe login`
3. Forward webhooks to local Supabase:
   ```bash
   stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
   ```
4. Use the signing secret from the CLI output for `STRIPE_WEBHOOK_SECRET` when running `supabase functions serve`

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Stripe not configured" | Ensure `STRIPE_SECRET_KEY` and price IDs are set in Supabase secrets |
| "Invalid pack" | Ensure `STRIPE_CREDITS_PRICE_STARTER`, `_STANDARD`, `_PRO` are set |
| "Invalid signature" on webhook | Verify `STRIPE_WEBHOOK_SECRET` matches the webhook’s signing secret |
| Credits not added after purchase | Check webhook logs in Stripe Dashboard; ensure `checkout.session.completed` is configured |
| Profile not updating | Check webhook endpoint URL and that the function is deployed |
