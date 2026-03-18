-- Setup: Nightly Digest Cron Job
-- Run this in Supabase SQL Editor AFTER deploying the nightly-digest Edge Function.
--
-- 1. Deploy the function: supabase functions deploy nightly-digest --no-verify-jwt
-- 2. Set Edge Function secrets:
--    - RESEND_API_KEY (your Resend API key)
--    - NIGHTLY_DIGEST_CRON_SECRET (generate: openssl rand -hex 32)
--    - RESEND_FROM (optional, e.g. "PrepSuite <noreply@prepsuite.ai>")
-- 3. Replace placeholders below and run this script.

-- To update: first run: select cron.unschedule('nightly-developer-digest');
--
-- Schedule: 7 PM Eastern daily (midnight UTC; ~8 PM ET in summer during EDT)
-- Cron format: min hour day-of-month month day-of-week
select cron.schedule(
  'nightly-developer-digest',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/nightly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_NIGHTLY_DIGEST_CRON_SECRET'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
