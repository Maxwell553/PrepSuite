-- Migration: Nightly digest — total games analyzed (sum of games[] across all reports)
-- Description: Extends get_nightly_digest() with games in last 24h reports and all-time total.

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
  games_24h bigint;
  total_games_analyzed bigint;
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

  -- Games in reports created in the last 24 hours (sum of report_data.games lengths)
  select coalesce(sum(
    case
      when jsonb_typeof(report_data->'games') = 'array' then jsonb_array_length(report_data->'games')
      else 0
    end
  ), 0) into games_24h
  from public.scouting_reports
  where created_at >= now() - interval '24 hours';

  -- All-time: every game row stored across all analyses
  select coalesce(sum(
    case
      when jsonb_typeof(report_data->'games') = 'array' then jsonb_array_length(report_data->'games')
      else 0
    end
  ), 0) into total_games_analyzed
  from public.scouting_reports;

  return jsonb_build_object(
    'signups', signups,
    'reports', reports,
    'questions', questions,
    'total_signups', total_signups,
    'total_reports', total_reports,
    'games_24h', games_24h,
    'total_games_analyzed', total_games_analyzed
  );
end;
$$;
