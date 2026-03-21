-- Migration: Add cumulative totals to nightly digest
-- Description: Extends get_nightly_digest() to also return total users and total reports (all-time).

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
  total_signups bigint;
  total_reports bigint;
begin
  -- New users (auth.users) - last 24 hours
  select count(*) into signups
  from auth.users
  where created_at >= now() - interval '24 hours';

  -- New scouting reports - last 24 hours
  select count(*) into reports
  from public.scouting_reports
  where created_at >= now() - interval '24 hours';

  -- New support feedback (questions, bugs, features) - last 24 hours
  select count(*) into questions
  from public.support_feedback
  where created_at >= now() - interval '24 hours';

  -- Cumulative: total users ever
  select count(*) into total_signups
  from auth.users;

  -- Cumulative: total reports ever
  select count(*) into total_reports
  from public.scouting_reports;

  return jsonb_build_object(
    'signups', signups,
    'reports', reports,
    'questions', questions,
    'total_signups', total_signups,
    'total_reports', total_reports
  );
end;
$$;
