# Nightly Developer Digest Setup

A daily email is sent **only to max@soundside.ai** at 7 PM Eastern with:

- New signups (last 24h)
- Reports generated (last 24h)
- Support questions (last 24h)

## Prerequisites

- Resend API key (you're already using Resend)
- Verified sender domain in Resend (e.g. `noreply@prepsuite.ai`)

## 1. Apply the migration

```bash
supabase db push
```

## 2. Deploy the Edge Function

```bash
supabase functions deploy nightly-digest --no-verify-jwt
```

## 3. Set Edge Function secrets

In Supabase Dashboard → Edge Functions → nightly-digest → Secrets, add:

| Secret | Value |
|--------|-------|
| `RESEND_API_KEY` | Your Resend API key |
| `NIGHTLY_DIGEST_CRON_SECRET` | A random string you generate (see below) |
| `RESEND_FROM` | (optional) e.g. `PrepSuite <noreply@prepsuite.ai>` |

**How to get `NIGHTLY_DIGEST_CRON_SECRET`:** You create it yourself—it's not provided by Supabase. Run this in your terminal to generate a random secret:

```bash
openssl rand -hex 32
```

Copy the output (a 64-character hex string) and use it in two places:
1. As the `NIGHTLY_DIGEST_CRON_SECRET` value in Supabase Edge Function secrets
2. As `YOUR_NIGHTLY_DIGEST_CRON_SECRET` in the setup script (step 4)

## 4. Create the cron job

Supabase CLI cannot run arbitrary SQL, so use the **Supabase Dashboard SQL Editor**:

1. Open: **https://supabase.com/dashboard/project/luzhlmrytqhdzaxaxlag/sql/new**
2. Paste and run the contents of `supabase/scripts/setup-nightly-digest-cron.sql` (replace `YOUR_PROJECT_REF` → `luzhlmrytqhdzaxaxlag` and `YOUR_NIGHTLY_DIGEST_CRON_SECRET` → your secret)
3. Or run this one-liner to print the SQL with your secret (replace SECRET):

   ```bash
   CRON_SECRET="your-secret" PROJECT_REF="luzhlmrytqhdzaxaxlag" && sed "s/YOUR_NIGHTLY_DIGEST_CRON_SECRET/$CRON_SECRET/g" supabase/scripts/setup-nightly-digest-cron.sql | sed "s/YOUR_PROJECT_REF/$PROJECT_REF/g"
   ```

## 5. Verify

- Check Supabase Dashboard → Integrations → Cron for the scheduled job
- To test immediately, call the function with curl:

```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/nightly-digest" \
  -H "Authorization: Bearer YOUR_NIGHTLY_DIGEST_CRON_SECRET"
```

## Changing the schedule

The default is 7 PM Eastern (`'0 0 * * *'` = midnight UTC). To update an existing job:

```sql
select cron.unschedule('nightly-developer-digest');
-- then re-run the schedule from the setup script with the new expression
```
