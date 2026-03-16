# Testing Premium Features & Stripe

This guide explains how to test premium features and Stripe integration for PrepSuite.

---

## Part 1: Testing Premium Features Without Stripe

Use this when you want to verify premium UI and behavior without going through Stripe checkout.

### Option A: Set Premium Status in Database

1. **Get your user ID**
   - Sign in to PrepSuite
   - Open browser DevTools → Application → Local Storage (or check Supabase Auth)
   - Or run in Supabase SQL Editor:
     ```sql
     SELECT id, email FROM auth.users WHERE email = 'your@email.com';
     ```

2. **Create or update profile with premium status**
   ```sql
   -- If profiles row doesn't exist yet
   INSERT INTO public.profiles (id, subscription_status, stripe_customer_id, stripe_subscription_id, current_period_end)
   VALUES (
     'YOUR_USER_ID_HERE',
     'active',
     'cus_test_premium',
     'sub_test_premium',
     NOW() + INTERVAL '30 days'
   )
   ON CONFLICT (id) DO UPDATE SET
     subscription_status = 'active',
     current_period_end = NOW() + INTERVAL '30 days';
   ```

3. **Refresh the app** — You should now see:
   - "Manage subscription" instead of "Upgrade to Premium" in User Settings
   - Slider up to 5,000 games in SearchScreen
   - Batch Search option (up to 10 players)
   - Practice Opponent in ReportDashboard
   - Customizable engine depth (7–20)

### Option B: Dev Override (Optional)

For quick local testing, you can add a temporary override. In `useSubscription.ts` or wherever `isPremium` is derived:

```ts
// Temporary dev override - remove before production
const isPremium = import.meta.env.DEV && import.meta.env.VITE_FORCE_PREMIUM === 'true'
  ? true
  : (actualPremiumCheck);
```

Then in `.env.local`:
```
VITE_FORCE_PREMIUM=true
```

**Remember to remove this before deploying.**

---

## Part 2: Testing Stripe Locally

### Prerequisites

- [Stripe CLI](https://stripe.com/docs/stripe-cli) installed
- Supabase running locally (`supabase start` + `supabase functions serve`)
- PrepSuite dev server running (`npm run dev`)

### Step 1: Use Stripe Test Mode

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Toggle **Test mode** (top right)
3. Create a product/price if needed: Products → Add product → $9.99/month recurring
4. Copy the **Price ID** (`price_...`)

### Step 2: Set Supabase Secrets for Local Dev

```bash
# From project root
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_PRICE_ID=price_...
# STRIPE_WEBHOOK_SECRET comes from Stripe CLI in Step 4
```

### Step 3: Start Local Supabase Functions

```bash
supabase functions serve
```

Keep this running. Functions will be at `http://127.0.0.1:54321/functions/v1/`.

### Step 4: Forward Stripe Webhooks to Local Supabase

In a **separate terminal**:

```bash
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
```

The CLI will output something like:

```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
```

**Copy that `whsec_...` value** and set it:

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

Then **restart** `supabase functions serve` so it picks up the new secret.

### Step 5: Run the Checkout Flow

1. Open PrepSuite at `http://localhost:5173` (or your dev URL)
2. Sign in
3. Go to **User Settings** (profile icon) → **Upgrade to Premium — $9.99/mo**
4. You should be redirected to Stripe Checkout
5. Use Stripe test card: `4242 4242 4242 4242`
   - Expiry: any future date (e.g. `12/34`)
   - CVC: any 3 digits (e.g. `123`)
   - ZIP: any 5 digits (e.g. `12345`)
6. Complete checkout
7. You should be redirected back; your profile should show Premium

### Step 6: Verify Webhook Events

In the terminal running `stripe listen`, you should see events like:

```
customer.subscription.created
invoice.paid
```

If the webhook fails, check:
- `STRIPE_WEBHOOK_SECRET` matches the CLI output
- `stripe-webhook` function logs (Supabase logs or `supabase functions logs stripe-webhook`)

---

## Part 3: Stripe Setup & Deployment (Production)

### Step 1: Create Product in Stripe

1. Stripe Dashboard → **Products** → **Add product**
2. **Name:** PrepSuite Premium
3. **Pricing:** Recurring, Monthly, $9.99 USD
4. Save and copy the **Price ID** (`price_...`)

### Step 2: Create Webhook Endpoint

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. **Endpoint URL:**  
   `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`
3. **Events:**  
   - `customer.subscription.created`  
   - `customer.subscription.updated`  
   - `customer.subscription.deleted`  
   - `invoice.paid`
4. Add endpoint and copy the **Signing secret** (`whsec_...`)

### Step 3: Set Supabase Secrets (Production)

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_PRICE_ID=price_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

### Step 4: Deploy Edge Functions

```bash
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
supabase functions deploy stripe-portal
```

### Step 5: Run Migrations

```bash
supabase db push
```

Ensure `profiles` table and subscription columns exist (see `supabase/migrations/20260308_profiles_subscription.sql`).

### Step 6: Configure Success/Cancel URLs

The `stripe-checkout` function should use your production URLs:

- `success_url`: e.g. `https://yourdomain.com/#/` or `https://yourdomain.com/#/settings`
- `cancel_url`: e.g. `https://yourdomain.com/#pricing`

The landing page has `id="pricing"` so `/#pricing` scrolls to the pricing section.

---

## Part 4: Quick Reference

| What to test | How |
|--------------|-----|
| Premium UI without paying | Set `subscription_status = 'active'` in `profiles` |
| Full Stripe flow locally | Stripe CLI + `stripe listen` + local Supabase functions |
| Production checkout | Deploy functions, set live secrets, use real card (or test mode on prod) |
| Manage subscription | Premium user → User Settings → "Manage subscription" → Stripe Customer Portal |

### Stripe Test Cards

| Card number | Result |
|-------------|--------|
| 4242 4242 4242 4242 | Success |
| 4000 0000 0000 0002 | Declined |
| 4000 0025 0000 3155 | Requires 3D Secure |

See [Stripe test cards](https://stripe.com/docs/testing#cards) for more.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Stripe not configured" | Set `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` in Supabase secrets |
| Webhook "Invalid signature" | Ensure `STRIPE_WEBHOOK_SECRET` matches the webhook/CLI signing secret |
| Checkout redirects to wrong URL | Verify `success_url` and `cancel_url` in `stripe-checkout` request |
| Profile not updating after payment | Check Stripe webhook logs; ensure `stripe-webhook` updates `profiles` |
| Premium features still locked | Refresh page; check `profiles.subscription_status` in DB |
