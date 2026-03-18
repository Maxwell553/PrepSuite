-- Migration: Nightly Developer Digest
-- Description: Adds get_nightly_digest() RPC and enables pg_cron + pg_net for scheduled email.
--              The digest is sent ONLY to max@soundside.ai at 7 PM Eastern daily.
--
-- After applying this migration, run the setup script to create the cron job:
--   See supabase/scripts/setup-nightly-digest-cron.sql

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ============================================================================
-- get_nightly_digest() - Returns counts for last 24 hours
-- ============================================================================
create or replace function public.get_nightly_digest()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  signups bigint;
  reports bigint;
  questions bigint;
begin
  -- New users (auth.users)
  select count(*) into signups
  from auth.users
  where created_at >= now() - interval '24 hours';

  -- New scouting reports
  select count(*) into reports
  from public.scouting_reports
  where created_at >= now() - interval '24 hours';

  -- New support feedback (questions, bugs, features)
  select count(*) into questions
  from public.support_feedback
  where created_at >= now() - interval '24 hours';

  return jsonb_build_object(
    'signups', signups,
    'reports', reports,
    'questions', questions
  );
end;
$$;

-- Grant execute to service role (used by Edge Function)
grant execute on function public.get_nightly_digest() to service_role;
