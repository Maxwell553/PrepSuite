# PrepSuite Stripe Monetization Plan

## Overview

**Pricing:** $9.99/month subscription  
**Stripe account:** Soundside Design LLC  
**Free tier:** Current limits (up to 2,000 games, single report at a time, fixed Stockfish depth)  
**Premium tier:** Enhanced limits and features

---

## Premium Features

| Feature | Free | Premium |
|---------|------|---------|
| Max games per report | 2,000 | **5,000** |
| Concurrent reports | 1 | **10 (batch)** |
| Generation priority | Standard | **Priority queue** |
| Export to PDF | — | **Yes** |
| Practice vs AI opponent | — | **Mimics opponent playing style** |
| Preparatory content matching | — | **Links to videos/sites for weaknesses** |
| Stockfish depth | Fixed (default) | **Customizable 7–20** |

### Feature Details

- **Max games per report:** Free users capped at 2,000; premium up to 5,000.
- **Concurrent reports:** Premium can run up to 10 reports in a batch.
- **Priority generation:** Premium requests jump the queue for faster turnaround.
- **Export to PDF:** Download full scouting reports for offline prep.
- **Practice vs AI opponent:** AI plays in the style of the analyzed opponent for realistic prep.
- **Preparatory content matching:** When the AI identifies an opening weakness (e.g. "Weak against the Caro-Kann Advance Variation"), premium users get curated links to YouTube videos and websites for that specific line.
- **Customizable Stockfish depth:** Free = fixed depth; premium = choose depth 7–20 for deeper analysis.

---

## Implementation Plan

### Phase 1: Stripe + Subscription (≈3–4 days)

1. **Stripe setup**
   - Create Stripe account, products, and price ($9.99/month)
   - Use Stripe Checkout or Customer Portal for subscription flow
   - Webhook: `customer.subscription.created`, `updated`, `deleted`, `invoice.paid`

2. **Database**
   - Add `subscriptions` table or `user_metadata` column:
     - `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `current_period_end`
   - Migration to add columns to `auth.users` metadata or a new `profiles` table

3. **Backend**
   - Supabase Edge Function or pipeline-service endpoint: create Checkout Session, handle webhooks
   - Middleware: check `subscription_status === 'active'` before premium features

4. **Frontend**
   - “Upgrade” / “Manage subscription” in UserSettings
   - Redirect to Stripe Checkout; return URL to app after success

### Phase 2: Feature Gating (≈2–3 days)

1. **Game limit**
   - Update `validation.ts`: free max 2000, premium max 5000
   - Pass `isPremium` (from JWT custom claim or DB lookup) to pipeline
   - SearchScreen: show 500–5000 slider for premium, 500–2000 for free

2. **Batch reports**
   - New UI: “Batch mode” — enter up to 10 player names
   - Pipeline: accept array of players, process in parallel (with concurrency limit)
   - Queue/worker: process N at a time (e.g. 3–5), return as each completes
   - Requires SSE or polling for multiple streams

3. **Fast generation priority**
   - Option A: Separate Cloud Run service with higher CPU/memory for premium
   - Option B: In-memory priority queue — premium requests jump the queue
   - Option C: Dedicated “fast” pipeline instance; route premium traffic there
   - Simplest: Option B with a small queue in the pipeline service

### Phase 3: Polish + Edge Cases (≈1–2 days)

- Handle failed payments, grace period, dunning
- Cancel flow: downgrade to free, retain data until period end
- Trial period (e.g. 7 days) if desired

---

## Time Estimate

| Phase | Duration |
|-------|----------|
| Phase 1: Stripe + subscription | 3–4 days |
| Phase 2: Feature gating | 2–3 days |
| Phase 3: Polish | 1–2 days |
| **Total** | **~7–9 days** |

---

## Technical Notes

### Stripe Integration Options

- **Stripe Checkout** — Hosted page, minimal code, handles PCI
- **Stripe Customer Portal** — Manage/cancel subscription
- **Stripe Billing** — Subscriptions, invoices, usage-based if needed later

### Where to Put Webhook Logic

- **Supabase Edge Function** — `stripe-webhook` function, verify signature, update DB
- Or **pipeline-service** — Add `/api/webhooks/stripe` if you prefer one backend

### JWT Custom Claims

- After webhook confirms subscription, set `app_metadata.subscription_status = 'active'`
- Frontend/pipeline reads JWT; no extra DB call per request for `isPremium`

### Batch Reports Architecture

- **Option A:** Single SSE with multiple `phase` events — one stream, multiple reports
- **Option B:** Multiple parallel `/api/analyze` calls — frontend manages N streams
- **Option C:** New `/api/analyze-batch` — returns job IDs, poll for status
- Recommended: Option B for MVP (simplest); Option C if you need server-side queue

---

## Is It Implementable?

**Yes.** The stack (React, Supabase, Node/Hono pipeline) supports this well:

- Supabase Auth + RLS for user-scoped data
- Stripe has solid Node/Supabase examples
- Pipeline already has `gameLimit`; extending to 5000 is a validation change
- Batch = parallel pipeline invocations with a concurrency cap
- Priority = in-memory queue or separate deployment

Main dependencies: Stripe account, webhook endpoint (public URL for local dev: Stripe CLI), and a `profiles` or metadata table for subscription state.

---

## Implementation Status

### Implemented
- **Profiles table** — `supabase/migrations/20260308_profiles_subscription.sql`
- **Stripe checkout** — `supabase/functions/stripe-checkout` (create subscription session)
- **Stripe webhook** — `supabase/functions/stripe-webhook` (update profile on subscription events)
- **Game limit** — Free: 2,000; Premium: 5,000 (validation + SearchScreen slider)
- **Engine depth** — Premium: customizable 7–20; Free: fixed depth
- **Landing page** — Premium features & pricing section (Soundside Design)
- **UserSettings** — Upgrade to Premium button
- **PDF export** — Print / Save as PDF (Premium only)

### Implemented (Phase 2)
- **Batch reports** — Premium: up to 10 players, 3 concurrent pipelines
- **Priority queue** — Premium: 10 concurrent, 20 per window (vs 2/5 for free)
- **AI practice opponent** — `/api/practice-move` + PracticeOpponent component
- **Preparatory content matching** — Prep Resources section with curated links

See [STRIPE_SETUP.md](./STRIPE_SETUP.md) for Stripe configuration steps.
