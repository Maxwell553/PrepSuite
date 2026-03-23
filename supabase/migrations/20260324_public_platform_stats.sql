-- Public read-only stats for the marketing landing page (anon key).
-- Counts: games stored across all scouting reports, OTB index rows, players with FIDE ID.

create or replace function public.get_public_platform_stats()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'games_analyzed',
    coalesce(
      (
        select sum(
          case
            when jsonb_typeof(report_data->'games') = 'array' then jsonb_array_length(report_data->'games')
            else 0
          end
        )::bigint
        from public.scouting_reports
      ),
      0
    ),
    'otb_games_in_db',
    (select count(*)::bigint from public.otb_games),
    'fide_players_in_db',
    (
      select count(*)::bigint
      from public.players
      where fide_id is not null and btrim(fide_id) <> ''
    )
  );
$$;

comment on function public.get_public_platform_stats() is
  'Marketing/landing: aggregate counts only; callable with anon role.';

revoke all on function public.get_public_platform_stats() from public;
grant execute on function public.get_public_platform_stats() to anon, authenticated;
