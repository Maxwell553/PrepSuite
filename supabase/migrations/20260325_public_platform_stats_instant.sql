-- Replace heavy get_public_platform_stats() (full table scans + jsonb) with a constant JSON
-- so SQL editor / any legacy caller returns instantly. Landing page no longer uses this RPC.

create or replace function public.get_public_platform_stats()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'games_analyzed', 215000,
    'otb_games_in_db', 10800000,
    'fide_players_in_db', 1640000
  );
$$;

comment on function public.get_public_platform_stats() is
  'Legacy: static snapshot for ad-hoc queries. Marketing stats live in the SPA (platformStats.ts).';
