# PrepSuite Stripe Monetization Plan

## Overview

**Model:** Credit-based pay-per-use (replaces subscription)  
**Stripe account:** Soundside Design LLC  
**Initial credits:** ~3,000 per user on signup  
**Usage:** 1 credit per game analyzed in a report  
**Purchase:** One-time credit packs (no recurring subscription)

---

## Credit System

| Concept | Value |
|---------|-------|
| Initial credits | 3,000 |
| Credits per 5 games | 1 |
| Max games per report | 5,000 (all users) |
| Batch reports | Available to all (consumes credits per game) |

### Feature Access

All users have **full access** to all features. The only gate is credits:

- **Analysis:** 1 credit per 5 games in a report
- **Batch creation:** Everyone can run batch; 1 credit per 5 games (less efficient without credits = fewer reports before running out)
- **Practice vs AI opponent:** Free (uses existing report data)
- **PDF export:** Free
- **Custom Stockfish depth (7–20):** Available to all
- **Prep resources / curated links:** Available to all

---

## Credit Packs (Stripe Products)

Create one-time payment products in Stripe:

| Pack | Credits | Suggested Price |
|------|---------|-----------------|
| Starter | 1,000 | $4.99 |
| Standard | 5,000 | $19.99 |
| Pro | 15,000 | $49.99 |

Use Stripe **Price IDs** for one-time payments (not recurring). Store mapping: `price_id` → `credits` in env or metadata.

---

## Implementation Plan

### Phase 1: Database + Credits Logic

1. **Migration:** Add `credits` column to `profiles` (INTEGER DEFAULT 3000)
2. **handle_new_user:** Set `credits = 3000` for new users
3. **Pipeline:** Before analysis: check `credits >= ceil(gameLimit/5)`. After completion: deduct `ceil(actualGames/5)` (atomic UPDATE)

### Phase 2: Stripe Credit Purchases

1. **stripe-credits-checkout** edge function:
   - Accept `price_id` (or `pack` enum) in body
   - Create Stripe Checkout Session in `payment` mode (one-time)
   - `metadata.credits` = amount to add
   - `metadata.supabase_user_id` = user id

2. **stripe-webhook:** Handle `checkout.session.completed` for `mode === 'payment'`:
   - Read `metadata.credits` and `metadata.supabase_user_id`
   - `UPDATE profiles SET credits = credits + $1 WHERE id = $2`

3. **Stripe products:** Create 3 products with one-time prices; add Price IDs to Supabase secrets

### Phase 3: Frontend Updates

1. **useCredits** hook: Fetch `credits` from profile; expose `credits`, `hasEnoughCredits(gameLimit)`, `loading`
2. **UserSettings:** Replace "Upgrade to Premium" with "Buy Credits" + credit balance display
3. **SearchScreen:** Remove isPremium gate; show credit cost (e.g. "This report will use ~X credits"); block if insufficient
4. **BatchSearch:** Remove Premium gate; available to all; show credit cost per batch
5. **Landing page:** Update pricing section to credit packs
6. **ReportDashboard / PracticeOpponent:** Remove isPremium checks (all features available)

### Phase 4: Pipeline Updates

1. **Remove isPremium:** No more X-Premium header or subscription checks
2. **Credits middleware:** At analyze start: verify `credits >= gameLimit` (call Supabase or new credits API)
3. **Credits deduct:** After report complete: deduct `allGames.length` via atomic UPDATE
4. **Rate limits:** Consider unified limits (or keep slightly higher for users with credits? Optional)

---

## Technical Notes

### Credits Deduction (Pipeline)

The pipeline has `SUPABASE_SERVICE_ROLE_KEY` and can update `profiles`. Use:

```sql
UPDATE profiles
SET credits = credits - $actualGames, updated_at = now()
WHERE id = $userId AND credits >= $actualGames
RETURNING credits;
```

If no row returned, user didn't have enough (race condition) — fail the request. Deduct only at the **end** after successful report generation.

### Pre-check (Pipeline Start)

Before starting the pipeline, verify `credits >= gameLimit`. Fail fast with a clear error: "Insufficient credits. You need X credits for this report. Buy more credits in Settings."

### Stripe Checkout (One-Time)

```javascript
// mode: 'payment' (not 'subscription')
line_items: [{ price: priceId, quantity: 1 }]
metadata: { supabase_user_id, credits }
```

### Webhook Events

- **Subscription flow (legacy):** Keep `customer.subscription.*` and `invoice.paid` handlers for existing subscribers during migration (or remove if migrating all users)
- **Credit purchases:** `checkout.session.completed` when `mode === 'payment'`

---

## Migration from Subscription

If you have existing Premium subscribers:

1. **Option A:** Grandfather them — add a large credit balance (e.g. 50,000) and discontinue subscription
2. **Option B:** Run both models temporarily — subscription users get "unlimited" (skip credit check/deduct)
3. **Option C:** Migrate all — cancel subscriptions, grant one-time credit bonus, switch to credits-only

---

## Implementation Status

### Implemented (Subscription — to be replaced)
- Profiles table, stripe-checkout, stripe-webhook, stripe-portal
- Game limits, batch, practice opponent, PDF export

### To Implement (Credit-based)
- [ ] Migration: `credits` column, default 3000
- [ ] Pipeline: credits check at start, deduct at end
- [ ] stripe-credits-checkout edge function
- [ ] Webhook: checkout.session.completed for payments
- [ ] useCredits hook, UserSettings credits UI
- [ ] SearchScreen/BatchSearch credit cost display
- [ ] Landing page credit packs pricing
- [ ] Remove isPremium gates across app

See [STRIPE_SETUP.md](./STRIPE_SETUP.md) for Stripe configuration.
