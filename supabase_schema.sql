-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Players Table
-- Stores verified identities to avoid re-scanning.
create table public.players (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  fide_id text unique,
  uscf_id text,
  chess_com_username text,
  lichess_username text,
  metadata jsonb default '{}'::jsonb,
  last_scanned_at timestamptz default now()
);

-- Index for fast lookups by IDs
create index players_fide_uscf_idx on public.players (fide_id, uscf_id);

-- 2. Scouting Reports Table
-- Stores the expensive Gemini analysis results.
create table public.scouting_reports (
  id uuid primary key default uuid_generate_v4(),
  player_id uuid references public.players(id) on delete cascade not null,
  created_at timestamptz default now(),
  report_data jsonb not null,
  valid_until timestamptz default (now() + interval '7 days')
);

-- Index to quickly find valid reports for a player
create index reports_player_valid_idx on public.scouting_reports (player_id, created_at desc);

-- RLS Policies (Open for Demo / MVP - Lock down for production!)
alter table public.players enable row level security;
alter table public.scouting_reports enable row level security;

create policy "Allow generic read access" on public.players for select using (true);
create policy "Allow generic insert access" on public.players for insert with check (true);
create policy "Allow generic update access" on public.players for update using (true);

create policy "Allow generic read access" on public.scouting_reports for select using (true);
create policy "Allow generic insert access" on public.scouting_reports for insert with check (true);
