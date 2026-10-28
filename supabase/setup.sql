-- =====================================================================
-- PIP DUEL — Supabase setup (one file, safe to re-run)
--
-- HOW TO USE
--   1. Supabase Dashboard → SQL Editor → New query.
--   2. Paste this whole file and press Run.
--   3. Optional, to review deposits / payouts: sign up in the app once,
--      then run
--        update public.profiles set role = 'admin' where username = 'your_callsign';
--      and sign out + back in so the app picks the role up.
--   4. Auth → URL Configuration:
--        Site URL          http://localhost:3000
--        Redirect URLs     http://localhost:3000/api/auth/callback
--      (Email confirmation on/off both work; the trigger below creates the
--      profile row either way.)
--
-- WHAT THIS FILE IS
--   The final shape of every table the browser app talks to. It supersedes
--   the files in supabase/migrations/ — those contain the history (the store
--   system they build was later dropped) and some of them cannot be re-run.
--   This file is idempotent: it creates what is missing, replaces functions
--   and views, and drops the superseded store-era objects if an older
--   database still has them.
--
-- TABLES THE APP READS / WRITES
--   profiles, player_balances, player_friends,
--   player_progress, rank_state, match_results, trade_events,
--   user_missions, user_achievements, behavior_tags,
--   crypto_deposits, crypto_withdrawals, wallet_ledger
-- VIEWS
--   progress_leaderboard, progress_weekly_leaderboard,
--   leaderboard_all, leaderboard_weekly, leaderboard_daily
--
-- MONEY RULE
--   A client can queue a deposit (pending only) and request a payout (which
--   escrows coins). Coins are credited/released only inside the SECURITY
--   DEFINER functions below, and each movement leaves one wallet_ledger row.
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- 0. LEGACY CONVERGENCE
--    The store era had a wallet_ledger of its own (gem/coin rows keyed by
--    user_id). It cannot describe the coin wallet, so it is dropped here —
--    before the new table is created below — and only when it is still the
--    old shape, so re-running this file never touches real history.
-- =====================================================================

drop view if exists public.wallet_ledger_totals;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'wallet_ledger'
       and column_name = 'user_id'
  ) then
    drop table public.wallet_ledger cascade;
  end if;
end;
$$;

-- =====================================================================
-- 1. PROFILES  (one row per auth.users row, created by the trigger)
-- =====================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,16}$'),
  display_name text,
  avatar_url text,
  country text default 'IN',
  language text default 'en',
  role text default 'user' check (role in ('user', 'admin')),
  rating integer default 1200,
  risk_rating integer default 1200,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Create the profile as soon as an auth user appears. A callsign that is
-- already taken gets a short suffix instead of failing the whole signup
-- with "Database error saving new user".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_base text;
begin
  v_base := lower(coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    'trader_' || substr(new.id::text, 1, 6)
  ));
  v_base := regexp_replace(v_base, '[^a-z0-9_]', '', 'g');
  if length(v_base) < 3 then
    v_base := 'trader_' || substr(new.id::text, 1, 6);
  end if;
  v_base := left(v_base, 16);

  begin
    insert into public.profiles (id, username, display_name, avatar_url)
    values (
      new.id,
      v_base,
      coalesce(
        nullif(new.raw_user_meta_data ->> 'display_name', ''),
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        'Trader'
      ),
      coalesce(
        new.raw_user_meta_data ->> 'avatar_url',
        new.raw_user_meta_data ->> 'picture'
      )
    );
  exception when unique_violation then
    -- Callsign taken: 10 chars + '_' + 5 hex chars stays inside the
    -- 16-char CHECK and the [a-z0-9_] alphabet.
    insert into public.profiles (id, username, display_name, avatar_url)
    values (
      new.id,
      left(v_base, 10) || '_' || substr(new.id::text, 1, 5),
      coalesce(
        nullif(new.raw_user_meta_data ->> 'display_name', ''),
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        'Trader'
      ),
      coalesce(
        new.raw_user_meta_data ->> 'avatar_url',
        new.raw_user_meta_data ->> 'picture'
      )
    );
  end;

  -- Every account opens with a zero-coin wallet row.
  insert into public.player_balances (player_id)
  values (new.id::text)
  on conflict (player_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts created before this file ran have no profile row. Backfill them
-- with the same callsign rules the trigger uses, so a player who signed up
-- earlier can still reach the app (and be promoted to admin) after setup.
do $$
declare
  u record;
  v_base text;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data
    from auth.users au
    where not exists (select 1 from public.profiles p where p.id = au.id)
  loop
    v_base := lower(coalesce(
      nullif(u.raw_user_meta_data ->> 'username', ''),
      split_part(coalesce(u.email, ''), '@', 1),
      'trader_' || substr(u.id::text, 1, 6)
    ));
    v_base := left(regexp_replace(v_base, '[^a-z0-9_]', '', 'g'), 16);
    if length(v_base) < 3 then
      v_base := 'trader_' || substr(u.id::text, 1, 6);
    end if;

    begin
      insert into public.profiles (id, username, display_name, avatar_url)
      values (
        u.id,
        v_base,
        coalesce(
          nullif(u.raw_user_meta_data ->> 'display_name', ''),
          nullif(u.raw_user_meta_data ->> 'full_name', ''),
          'Trader'
        ),
        coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
      );
    exception when unique_violation then
      insert into public.profiles (id, username, display_name, avatar_url)
      values (
        u.id,
        left(v_base, 10) || '_' || substr(u.id::text, 1, 5),
        coalesce(
          nullif(u.raw_user_meta_data ->> 'display_name', ''),
          nullif(u.raw_user_meta_data ->> 'full_name', ''),
          'Trader'
        ),
        coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
      );
    end;
  end loop;
end;
$$;

-- =====================================================================
-- 2. WALLET  (coins only — bought by deposit, spent on Live entries)
-- =====================================================================

create table if not exists public.player_balances (
  player_id text primary key,
  virtual_balance integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Older projects bootstrapped every wallet with 10,000 coins.
alter table public.player_balances
  alter column virtual_balance set default 0;

-- Accounts that predate this file have no wallet row either; materialise one
-- so the first balance read does not have to create it.
insert into public.player_balances (player_id)
select p.id::text from public.profiles p
on conflict (player_id) do nothing;

alter table public.player_balances enable row level security;

drop policy if exists balances_read_own   on public.player_balances;
drop policy if exists balances_upsert_own on public.player_balances;
drop policy if exists balances_update_own on public.player_balances;

-- The app owns its wallet row (guest ids included), so these stay
-- permissive like the rest of the legacy schema. Money leaving the arena
-- (withdrawals) never trusts this path — see the RPC below.
create policy balances_read_own
  on public.player_balances for select using (true);
create policy balances_upsert_own
  on public.player_balances for insert with check (true);
create policy balances_update_own
  on public.player_balances for update using (true);

-- =====================================================================
-- 3. FRIENDS
-- =====================================================================

create table if not exists public.player_friends (
  id uuid primary key default gen_random_uuid(),
  requester_id text not null,
  addressee_id text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

create index if not exists idx_player_friends_requester
  on public.player_friends (requester_id);
create index if not exists idx_player_friends_addressee
  on public.player_friends (addressee_id);

create or replace function public.touch_player_friends()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_player_friends_touch on public.player_friends;
create trigger trg_player_friends_touch
  before update on public.player_friends
  for each row execute function public.touch_player_friends();

alter table public.player_friends enable row level security;

drop policy if exists "friends_read"   on public.player_friends;
drop policy if exists "friends_insert" on public.player_friends;
drop policy if exists "friends_update" on public.player_friends;
drop policy if exists "friends_delete" on public.player_friends;

create policy "friends_read"   on public.player_friends for select using (true);
create policy "friends_insert" on public.player_friends for insert with check (true);
create policy "friends_update" on public.player_friends for update using (true);
create policy "friends_delete" on public.player_friends for delete using (true);

-- =====================================================================
-- 4. PROGRESS  (level/XP, rank ladder, missions, achievements, stats)
-- =====================================================================

create table if not exists public.seasons (
  id text primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reset_factor numeric not null default 0.6,
  created_at timestamptz default now()
);

insert into public.seasons (id, starts_at, ends_at, reset_factor)
values ('S1', '2026-10-05T00:00:00+05:30', '2026-11-30T00:00:00+05:30', 0.6)
on conflict (id) do nothing;

create table if not exists public.player_progress (
  user_id text primary key,
  level integer not null default 1,
  xp integer not null default 0,
  season_pass_xp integer not null default 0,
  streak_days integer not null default 0,
  last_login_date text,
  updated_at timestamptz default now()
);

create table if not exists public.rank_state (
  user_id text primary key,
  season_id text not null default 'S1',
  rp integer not null default 0,
  peak_rp integer not null default 0,
  highest_tier text not null default 'Bronze',
  placement_played integer not null default 0,
  placement_wins integer not null default 0,
  placement_target integer not null default 5,
  shield_matches integer not null default 0,
  weekly_rp integer not null default 0,
  weekly_key text,
  last_ranked_at timestamptz,
  last_decay_at timestamptz,
  updated_at timestamptz default now()
);

create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  match_id text not null,
  user_id text not null,
  mode text not null check (mode in ('ranked', 'friendly', 'practice')),
  pair text not null default 'XAU/USD',
  duration integer not null,
  pips numeric,
  result text not null check (result in ('win', 'loss', 'draw')),
  rp_delta integer not null default 0,
  xp_delta integer not null default 0,
  coins_delta integer not null default 0,
  discipline_score integer not null default 0,
  pip_margin numeric default 0,
  opponent_rp integer default 0,
  created_at timestamptz default now(),
  unique (match_id, user_id)
);

create index if not exists match_results_user_time_idx
  on public.match_results (user_id, created_at desc);

create table if not exists public.trade_events (
  id uuid primary key default gen_random_uuid(),
  match_id text not null,
  user_id text not null,
  side text not null,
  lot integer not null,
  entry_ts numeric not null,
  exit_ts numeric not null,
  entry_price numeric not null,
  exit_price numeric not null,
  sl numeric,
  tp numeric,
  sl_moved boolean default false,
  reason text,
  created_at timestamptz default now()
);

create index if not exists trade_events_match_idx
  on public.trade_events (match_id, user_id);

create table if not exists public.missions_catalog (
  id text primary key,
  type text not null check (type in ('daily', 'weekly')),
  title text not null,
  description text,
  metric text not null,
  target integer not null,
  reward_xp integer not null default 0,
  reward_coins integer not null default 0,
  active boolean not null default true
);

create table if not exists public.user_missions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  mission_id text not null references public.missions_catalog (id) on delete cascade,
  period_key text not null,
  progress integer not null default 0,
  claimed_at timestamptz,
  unique (user_id, mission_id, period_key)
);

create index if not exists user_missions_period_idx
  on public.user_missions (user_id, period_key);

create table if not exists public.achievements_catalog (
  id text primary key,
  category text not null,
  name text not null,
  description text,
  metric text not null,
  bronze_target integer not null,
  silver_target integer not null,
  gold_target integer not null,
  reward_bronze integer not null default 20,
  reward_silver integer not null default 50,
  reward_gold integer not null default 100,
  title_unlock text,
  hidden boolean not null default false,
  active boolean not null default true
);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  achievement_id text not null references public.achievements_catalog (id) on delete cascade,
  progress integer not null default 0,
  unlocked_at timestamptz,
  claimed_at timestamptz,
  unique (user_id, achievement_id)
);

create table if not exists public.behavior_tags (
  id uuid primary key default gen_random_uuid(),
  match_id text not null,
  user_id text not null,
  tag text not null,
  count integer not null default 1,
  created_at timestamptz default now()
);

create index if not exists behavior_tags_match_idx
  on public.behavior_tags (match_id, user_id);

create table if not exists public.leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  board text not null,
  scope text not null default 'global',
  season_id text not null,
  rank integer not null,
  user_id text not null,
  score numeric not null,
  taken_at timestamptz default now()
);

create index if not exists leaderboard_snapshots_board_idx
  on public.leaderboard_snapshots (board, scope, season_id, rank);

-- Catalogs (idempotent seeds) -----------------------------------------

insert into public.missions_catalog
  (id, type, title, description, metric, target, reward_xp, reward_coins)
values
  ('daily_play_3', 'daily', 'Play 3 matches', 'Any mode counts — practice included.', 'matches_played', 3, 60, 0),
  ('daily_sl_always', 'daily', 'Use a stop loss in every trade of a match', 'Risk control is the fastest route to consistency.', 'sl_match', 1, 80, 0),
  ('daily_gold_win', 'daily', 'Win a Gold (XAU/USD) duel', 'Take a ranked victory on spot gold.', 'gold_wins', 1, 0, 30),
  ('daily_patience', 'daily', 'Finish a match with 2 or fewer trades', 'Reward patience, not screen time.', 'low_trade_match', 1, 50, 0),
  ('daily_ranked_5m', 'daily', 'Win a 5m ranked duel', 'The shortest format still demands a plan.', 'ranked_5m_wins', 1, 60, 0),
  ('daily_discipline', 'daily', 'Score 70+ Discipline in a match', 'Process over outcome.', 'discipline_70', 1, 0, 40),
  ('weekly_ranked_wins', 'weekly', 'Win 10 ranked duels', 'The weekly ladder grind.', 'ranked_wins', 10, 300, 100),
  ('weekly_discipline', 'weekly', 'Discipline score 70+ in 5 matches', 'Consistency across the week.', 'discipline_70', 5, 250, 0),
  ('weekly_volume', 'weekly', 'Play 20 matches', 'Volume builds the habit.', 'matches_played', 20, 150, 100)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  metric = excluded.metric,
  target = excluded.target,
  reward_xp = excluded.reward_xp,
  reward_coins = excluded.reward_coins;

insert into public.achievements_catalog
  (id, category, name, description, metric, bronze_target, silver_target, gold_target,
   reward_bronze, reward_silver, reward_gold, title_unlock, hidden)
values
  ('sniper', 'Skill', 'Sniper', 'Win a duel with 3 trades, all above +20 pips.', 'sniper', 1, 5, 25, 20, 50, 100, 'The Scalper', false),
  ('comeback_king', 'Skill', 'Comeback King', 'Win after being 100 pips behind.', 'comeback', 1, 3, 10, 20, 50, 100, 'Comeback King', false),
  ('no_revenge', 'Discipline', 'No Revenge', 'Wait 30s after a loss before the next trade.', 'no_revenge', 10, 50, 200, 20, 50, 100, null, false),
  ('sl_always', 'Discipline', 'SL Always', 'Stop loss on every trade in a match.', 'sl_always', 5, 25, 100, 20, 50, 100, 'Risk Manager', false),
  ('hot_streak', 'Streak', 'Hot Streak', 'Consecutive ranked wins.', 'hot_streak', 3, 5, 10, 20, 50, 100, 'Streak Hunter', false),
  ('gold_master', 'Mastery', 'Gold Master', 'Wins on XAU/USD.', 'gold_master', 10, 50, 200, 20, 50, 100, 'Gold Standard', false),
  ('perfect_pip', 'Hidden', 'Photo Finish', 'Win a duel by exactly 1.0 pip.', 'perfect_pip', 1, 1, 1, 0, 0, 100, 'Photo Finish', true),
  ('nemesis', 'Rivalry', 'Nemesis', 'Beat the same player 5 times.', 'nemesis', 1, 3, 10, 20, 50, 100, 'Nemesis', false)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  bronze_target = excluded.bronze_target,
  silver_target = excluded.silver_target,
  gold_target = excluded.gold_target,
  title_unlock = excluded.title_unlock;

-- Leaderboard views ----------------------------------------------------
-- These are owner-rights views on purpose. The board has to read every
-- player's rank_state/match_results rows, and those tables are otherwise
-- scoped to their owner. Only the aggregate columns listed here are
-- exposed; the per-user tables stay private.

drop view if exists public.progress_leaderboard;
create view public.progress_leaderboard as
select
  p.id::text as user_id,
  p.username,
  p.display_name,
  p.country,
  r.season_id,
  r.rp,
  r.weekly_rp as week_rp,
  r.placement_played,
  coalesce(stats.matches, 0) as matches,
  coalesce(stats.wins, 0) as wins
from public.profiles p
join public.rank_state r on r.user_id = p.id::text
left join (
  select user_id,
         count(*) filter (where mode = 'ranked') as matches,
         count(*) filter (where result = 'win') as wins
  from public.match_results
  group by user_id
) stats on stats.user_id = p.id::text
where r.placement_played >= r.placement_target;

drop view if exists public.progress_weekly_leaderboard;
create view public.progress_weekly_leaderboard as
select
  p.id::text as user_id,
  p.username,
  p.display_name,
  p.country,
  r.weekly_key,
  r.weekly_rp
from public.profiles p
join public.rank_state r on r.user_id = p.id::text
where r.weekly_key is not null;

-- Progress RLS ---------------------------------------------------------

alter table public.seasons enable row level security;
alter table public.player_progress enable row level security;
alter table public.rank_state enable row level security;
alter table public.match_results enable row level security;
alter table public.trade_events enable row level security;
alter table public.missions_catalog enable row level security;
alter table public.user_missions enable row level security;
alter table public.achievements_catalog enable row level security;
alter table public.user_achievements enable row level security;
alter table public.behavior_tags enable row level security;
alter table public.leaderboard_snapshots enable row level security;

drop policy if exists "Seasons are public" on public.seasons;
create policy "Seasons are public"
  on public.seasons for select using (true);

drop policy if exists "Mission catalog is public" on public.missions_catalog;
create policy "Mission catalog is public"
  on public.missions_catalog for select using (true);

drop policy if exists "Achievement catalog is public" on public.achievements_catalog;
create policy "Achievement catalog is public"
  on public.achievements_catalog for select using (true);

drop policy if exists "Leaderboard snapshots are public" on public.leaderboard_snapshots;
create policy "Leaderboard snapshots are public"
  on public.leaderboard_snapshots for select using (true);

drop policy if exists "Own progress" on public.player_progress;
create policy "Own progress" on public.player_progress
  for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists "Own rank" on public.rank_state;
create policy "Own rank" on public.rank_state
  for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists "Own match results" on public.match_results;
create policy "Own match results" on public.match_results
  for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists "Own trade events" on public.trade_events;
create policy "Own trade events" on public.trade_events
  for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists "Own mission rows" on public.user_missions;
create policy "Own mission rows" on public.user_missions
  for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists "Own achievement rows" on public.user_achievements;
create policy "Own achievement rows" on public.user_achievements
  for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists "Own behavior tags" on public.behavior_tags;
create policy "Own behavior tags" on public.behavior_tags
  for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

-- =====================================================================
-- 5. MATCH TABLES  (legacy engine tables — kept so the schema is whole)
-- =====================================================================

create table if not exists public.segments (
  id text primary key,
  title text not null,
  asset text not null,
  tags text[] default '{}',
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  ticks jsonb not null,
  source text default 'synthetic',
  license_note text default 'Virtual money only. Educational use.',
  enabled boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  room text not null,
  seed bigint not null,
  segment_id text references public.segments (id) on delete set null,
  mode text not null check (mode in ('standard', 'risk')),
  p1 uuid not null references public.profiles (id) on delete cascade,
  p2 uuid references public.profiles (id) on delete set null,
  p2_is_bot boolean default false,
  p1_score numeric,
  p2_score numeric,
  winner uuid references public.profiles (id) on delete set null,
  status text default 'pending' check (status in ('pending', 'active', 'finished', 'forfeit', 'disputed')),
  created_at timestamptz default now()
);

-- A `matches` table left over from an older build may only carry part of
-- this shape. CREATE TABLE IF NOT EXISTS cannot add columns, so top up what
-- is missing before the policies and views below reference it. Existing
-- columns and rows are preserved; columns added here stay nullable because
-- legacy rows may not have a value for them.
alter table public.matches
  add column if not exists room text,
  add column if not exists seed bigint,
  add column if not exists segment_id text,
  add column if not exists mode text,
  add column if not exists p1 uuid,
  add column if not exists p2 uuid,
  add column if not exists p2_is_bot boolean default false,
  add column if not exists p1_score numeric,
  add column if not exists p2_score numeric,
  add column if not exists winner uuid,
  add column if not exists status text default 'pending',
  add column if not exists created_at timestamptz default now();

create table if not exists public.match_actions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player uuid not null references public.profiles (id) on delete cascade,
  actions jsonb not null default '[]'::jsonb,
  submitted_at timestamptz default now(),
  unique (match_id, player)
);

create table if not exists public.ratings_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  mode text not null,
  before_rating integer not null,
  after_rating integer not null,
  created_at timestamptz default now()
);

create table if not exists public.match_flags (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  reason text not null,
  created_at timestamptz default now()
);

alter table public.segments enable row level security;
alter table public.matches enable row level security;
alter table public.match_actions enable row level security;
alter table public.ratings_history enable row level security;
alter table public.match_flags enable row level security;

drop policy if exists "Enabled segments are viewable by everyone" on public.segments;
create policy "Enabled segments are viewable by everyone"
  on public.segments for select using (enabled = true);

drop policy if exists "Admins can manage segments" on public.segments;
create policy "Admins can manage segments"
  on public.segments for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "Matches viewable by players or public if finished" on public.matches;
create policy "Matches viewable by players or public if finished"
  on public.matches for select
  using (status = 'finished' or p1 = auth.uid() or p2 = auth.uid());

drop policy if exists "Match actions viewable by match participants" on public.match_actions;
create policy "Match actions viewable by match participants"
  on public.match_actions for select using (
    exists (
      select 1 from public.matches
      where id = match_id and (p1 = auth.uid() or p2 = auth.uid())
    )
  );

-- ratings_history and match_flags stay service-role only (RLS on, no policies).

-- Legacy rating boards, kept in step with the older match tables --------

drop view if exists public.leaderboard_all;
create view public.leaderboard_all as
select
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.rating,
  p.risk_rating,
  count(m.id) as total_duels,
  count(case when m.winner = p.id then 1 end) as wins,
  count(case when m.winner is not null and m.winner <> p.id then 1 end) as losses,
  round(
    case
      when count(m.id) > 0
      then (count(case when m.winner = p.id then 1 end)::numeric / count(m.id)::numeric) * 100
      else 0
    end, 1
  ) as win_rate
from public.profiles p
left join public.matches m
  on (m.p1 = p.id or m.p2 = p.id) and m.status = 'finished'
where m.id is null
   or m.id not in (select match_id from public.match_flags)
group by p.id, p.username, p.display_name, p.avatar_url, p.rating, p.risk_rating
order by p.rating desc;

drop view if exists public.leaderboard_weekly;
create view public.leaderboard_weekly as
select
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.rating,
  p.risk_rating,
  count(m.id) as total_duels,
  count(case when m.winner = p.id then 1 end) as wins
from public.profiles p
join public.matches m
  on (m.p1 = p.id or m.p2 = p.id) and m.status = 'finished'
where m.created_at >= now() - interval '7 days'
  and m.id not in (select match_id from public.match_flags)
group by p.id, p.username, p.display_name, p.avatar_url, p.rating, p.risk_rating
order by wins desc, p.rating desc;

drop view if exists public.leaderboard_daily;
create view public.leaderboard_daily as
select
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.rating,
  p.risk_rating,
  count(m.id) as total_duels,
  count(case when m.winner = p.id then 1 end) as wins
from public.profiles p
join public.matches m
  on (m.p1 = p.id or m.p2 = p.id) and m.status = 'finished'
where m.created_at >= now() - interval '24 hours'
  and m.id not in (select match_id from public.match_flags)
group by p.id, p.username, p.display_name, p.avatar_url, p.rating, p.risk_rating
order by wins desc, p.rating desc;

-- =====================================================================
-- 6. ADMIN PREDICATE  (used by the review functions and policies)
-- =====================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- =====================================================================
-- 7. WALLET LEDGER  (one row per coin movement)
--    Written only by record_ledger(), which the definer functions below
--    call after the balance has moved — so the ledger can never disagree
--    with the wallet. Admins read every row; a player reads their own.
-- =====================================================================

create table if not exists public.wallet_ledger (
  id bigserial primary key,
  player_id text not null,
  kind text not null check (kind in
    ('deposit', 'payout', 'payout_refund', 'adjustment')),
  -- Signed: positive credits the wallet, negative debits it.
  coins integer not null check (coins <> 0),
  balance_after integer,
  reason text,
  -- What caused the row: 'deposit' / 'withdrawal' plus the row id.
  ref_type text,
  ref_id text,
  -- The admin behind a manual adjustment; null for player-driven money.
  actor_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_ledger_player
  on public.wallet_ledger (player_id, created_at desc);

create index if not exists idx_wallet_ledger_created
  on public.wallet_ledger (created_at desc);

create index if not exists idx_wallet_ledger_ref
  on public.wallet_ledger (ref_type, ref_id);

alter table public.wallet_ledger enable row level security;

drop policy if exists wallet_ledger_read on public.wallet_ledger;

-- No INSERT/UPDATE/DELETE policy on purpose: record_ledger() is the writer.
create policy wallet_ledger_read
  on public.wallet_ledger for select
  using (auth.uid()::text = player_id or public.is_admin());

create or replace function public.record_ledger(
  p_player_id text,
  p_kind      text,
  p_coins     integer,
  p_reason    text default null,
  p_ref_type  text default null,
  p_ref_id    text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
begin
  if p_coins is null or p_coins = 0 then
    raise exception 'record_ledger: a non-zero coin amount is required'
      using errcode = '22023';
  end if;

  select virtual_balance into v_balance
    from public.player_balances
   where player_id = p_player_id;

  insert into public.wallet_ledger (
    player_id, kind, coins, balance_after, reason, ref_type, ref_id, actor_id
  ) values (
    p_player_id, p_kind, p_coins, v_balance,
    nullif(trim(coalesce(p_reason, '')), ''), p_ref_type, p_ref_id,
    -- Only a manual adjustment has an admin behind it; deposits and payouts
    -- are driven by the player's own row.
    case when p_kind = 'adjustment' then auth.uid() else null end
  );
end;
$$;

-- Internal only: the definer functions run as the owner, so no client needs
-- EXECUTE on this.
revoke all on function public.record_ledger(text, text, integer, text, text, text) from public;

-- =====================================================================
-- 8. ADMIN PLAYER ACTIONS  (directory, adjust, suspend, ban)
--    The console reads profiles and player_balances directly; anything that
--    moves coins or locks an account is a function below, so the browser
--    cannot write a balance or a status on its own.
-- =====================================================================

-- Suspension is a lock, not a role. `banned` is the terminal form.
alter table public.profiles
  add column if not exists status text not null default 'active',
  add column if not exists status_note text,
  add column if not exists status_changed_at timestamptz;

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check
  check (status in ('active', 'suspended', 'banned'));

create or replace function public.admin_adjust_coins(
  p_player_id text,
  p_coins     integer,
  p_reason    text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
  v_reason  text := trim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'admin_adjust_coins: admin only'
      using errcode = '42501';
  end if;

  if p_coins is null or p_coins = 0 then
    raise exception 'Enter a non-zero coin amount — use the sign to credit or debit.'
      using errcode = '22023';
  end if;

  if length(v_reason) < 3 then
    raise exception 'An adjustment needs a reason of at least 3 characters.'
      using errcode = '22023';
  end if;

  insert into public.player_balances (player_id, virtual_balance, updated_at)
  values (p_player_id, 0, now())
  on conflict (player_id) do nothing;

  select virtual_balance into v_balance
    from public.player_balances
   where player_id = p_player_id
     for update;

  if v_balance + p_coins < 0 then
    raise exception 'That would take the wallet below zero — it holds % coins.', v_balance
      using errcode = '22023';
  end if;

  update public.player_balances
     set virtual_balance = virtual_balance + p_coins,
         updated_at      = now()
   where player_id = p_player_id;

  perform public.record_ledger(p_player_id, 'adjustment', p_coins, v_reason);

  select virtual_balance into v_balance
    from public.player_balances
   where player_id = p_player_id;

  return v_balance;
end;
$$;

revoke all on function public.admin_adjust_coins(text, integer, text) from public;
grant execute on function public.admin_adjust_coins(text, integer, text) to authenticated;

create or replace function public.admin_set_player_status(
  p_player_id text,
  p_status    text,
  p_note      text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'admin_set_player_status: admin only'
      using errcode = '42501';
  end if;

  if p_status not in ('active', 'suspended', 'banned') then
    raise exception 'Unknown account status %', p_status
      using errcode = '22023';
  end if;

  -- The one mistake this screen could not undo.
  if p_player_id = auth.uid()::text then
    raise exception 'You cannot change your own account status.'
      using errcode = '22023';
  end if;

  update public.profiles
     set status            = p_status,
         status_note       = nullif(trim(coalesce(p_note, '')), ''),
         status_changed_at = now()
   where id::text = p_player_id;

  if not found then
    raise exception 'Player % not found.', p_player_id
      using errcode = 'P0002';
  end if;

  return p_status;
end;
$$;

revoke all on function public.admin_set_player_status(text, text, text) from public;
grant execute on function public.admin_set_player_status(text, text, text) to authenticated;

-- =====================================================================
-- 9. CRYPTO DEPOSITS
--    A player writes a pending row and nothing else. Coins only appear
--    through approve_crypto_deposit(), which stamps the reviewer's amount
--    and credits the wallet in one transaction.
-- =====================================================================

create table if not exists public.crypto_deposits (
  id text primary key,
  player_id text not null,
  pack_id text not null,
  coins integer,
  asset_id text not null,
  symbol text not null,
  network text not null,
  expected_usd integer,
  address text not null,
  memo text,
  txid text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
  note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint crypto_deposits_coins_when_paid
    check (status <> 'paid' or (coins is not null and coins > 0))
);

-- Upgrade a database created by the earlier migrations, where both
-- amounts were NOT NULL at submit time.
alter table public.crypto_deposits
  drop constraint if exists crypto_deposits_coins_check,
  drop constraint if exists crypto_deposits_expected_usd_check,
  alter column coins drop not null,
  alter column expected_usd drop not null;

alter table public.crypto_deposits
  drop constraint if exists crypto_deposits_coins_when_paid;
alter table public.crypto_deposits
  add constraint crypto_deposits_coins_when_paid
  check (status <> 'paid' or (coins is not null and coins > 0));

create index if not exists idx_crypto_deposits_player
  on public.crypto_deposits (player_id, created_at desc);

create index if not exists idx_crypto_deposits_pending
  on public.crypto_deposits (created_at)
  where status = 'pending';

-- One transaction can fund exactly one credit.
create unique index if not exists uq_crypto_deposits_paid_txid
  on public.crypto_deposits (txid)
  where status = 'paid';

-- One OPEN claim per hash, enforced atomically. The trigger below supplies the
-- friendly error a player sees; this index is what still holds when two
-- submissions race each other and both pass the trigger's existence check.
-- Rows a pre-guard database collected are settled first: the earliest open
-- claim keeps the hash, later PENDING ones are rejected (they credited
-- nothing), and a paid row is never touched.
with ranked as (
  select id,
         row_number() over (partition by txid order by created_at, id) as rn
    from public.crypto_deposits
   where status in ('pending', 'paid')
)
update public.crypto_deposits d
   set status      = 'rejected',
       note        = coalesce(d.note, 'Duplicate claim of the same transaction hash.'),
       reviewed_at = now()
  from ranked r
 where d.id = r.id
   and r.rn > 1
   and d.status = 'pending';

create unique index if not exists uq_crypto_deposits_open_txid
  on public.crypto_deposits (txid)
  where status in ('pending', 'paid');

alter table public.crypto_deposits enable row level security;

drop policy if exists crypto_deposits_read on public.crypto_deposits;
drop policy if exists crypto_deposits_insert_pending on public.crypto_deposits;

create policy crypto_deposits_read
  on public.crypto_deposits for select
  using (auth.uid()::text = player_id or public.is_admin());

create policy crypto_deposits_insert_pending
  on public.crypto_deposits for insert
  with check (auth.uid()::text = player_id and status = 'pending');

-- One hash, one credit. approve_crypto_deposit() already refuses to pay a
-- TxID twice; this closes the earlier hole, where two players could park the
-- same hash as two pending rows. A rejected hash may be resubmitted.
create or replace function public.guard_deposit_txid()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
      from public.crypto_deposits d
     where d.txid = new.txid
       and d.id <> new.id
       and d.status in ('pending', 'paid')
  ) then
    raise exception 'That transaction hash is already claimed — it is under review or already credited. If an earlier claim was rejected, you can submit it again.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_deposit_txid_once on public.crypto_deposits;
create trigger trg_deposit_txid_once
  before insert on public.crypto_deposits
  for each row execute function public.guard_deposit_txid();


drop function if exists public.approve_crypto_deposit(text, text);

create or replace function public.approve_crypto_deposit(
  p_id text,
  p_coins integer,
  p_ref text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.crypto_deposits%rowtype;
begin
  if not public.is_admin() then
    raise exception 'approve_crypto_deposit: admin only'
      using errcode = '42501';
  end if;

  if p_coins is null or p_coins <= 0 then
    raise exception 'approve_crypto_deposit: a positive coin amount is required'
      using errcode = '22023';
  end if;

  select * into d
    from public.crypto_deposits
   where id = p_id
     for update;

  if not found then
    raise exception 'deposit % not found', p_id;
  end if;

  if d.status <> 'pending' then
    return 0;
  end if;

  if exists (
    select 1 from public.crypto_deposits
     where txid = d.txid and status = 'paid' and id <> p_id
  ) then
    raise exception 'that TxID was already credited to deposit %', p_id
      using errcode = '23505';
  end if;

  update public.crypto_deposits
     set status       = 'paid',
         coins        = p_coins,
         expected_usd = greatest(1, ceil(p_coins / 100.0)::int),
         note         = coalesce(p_ref, d.note),
         reviewed_at  = now()
   where id = p_id;

  insert into public.player_balances (player_id, virtual_balance, updated_at)
  values (d.player_id, p_coins, now())
  on conflict (player_id) do update
    set virtual_balance = public.player_balances.virtual_balance + p_coins,
        updated_at      = now();

  perform public.record_ledger(
    d.player_id, 'deposit', p_coins,
    coalesce(nullif(trim(coalesce(p_ref, '')), ''), 'Crypto deposit approved'),
    'deposit', p_id
  );

  return p_coins;
end;
$$;

create or replace function public.reject_crypto_deposit(
  p_id text,
  p_note text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.crypto_deposits%rowtype;
begin
  if not public.is_admin() then
    raise exception 'reject_crypto_deposit: admin only'
      using errcode = '42501';
  end if;

  select * into d
    from public.crypto_deposits
   where id = p_id
     for update;

  if not found or d.status <> 'pending' then
    return false;
  end if;

  update public.crypto_deposits
     set status      = 'rejected',
         note        = coalesce(nullif(trim(p_note), ''), 'Rejected.'),
         reviewed_at = now()
   where id = p_id;

  return true;
end;
$$;

revoke all on function public.approve_crypto_deposit(text, integer, text) from public;
revoke all on function public.reject_crypto_deposit(text, text) from public;
grant execute on function public.approve_crypto_deposit(text, integer, text) to authenticated;
grant execute on function public.reject_crypto_deposit(text, text) to authenticated;

-- =====================================================================
-- 10. CRYPTO WITHDRAWALS
--    Coins are escrowed inside request_crypto_withdraw(); approval only
--    closes the row, rejection is the only path that refunds. A payout at
--    or above the dual-approval threshold needs two different admins.
-- =====================================================================

create table if not exists public.crypto_withdrawals (
  id text primary key,
  player_id text not null,
  coins integer not null check (coins > 0),
  gross_usd numeric(10, 2) not null check (gross_usd > 0),
  fee_usd numeric(10, 2) not null check (fee_usd >= 0),
  net_usd numeric(10, 2) not null check (net_usd >= 0),
  asset_id text not null,
  symbol text not null,
  network text not null,
  address text not null,
  memo text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
  note text,
  -- Large payouts need two admins: the first signature parks the row here
  -- and the second closes it. approved_by names whoever closed it.
  first_approved_by uuid,
  first_approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- Upgrade a database created before dual approval.
alter table public.crypto_withdrawals
  add column if not exists first_approved_by uuid,
  add column if not exists first_approved_at timestamptz,
  add column if not exists approved_by uuid;

create index if not exists idx_crypto_withdrawals_player
  on public.crypto_withdrawals (player_id, created_at desc);

create index if not exists idx_crypto_withdrawals_pending
  on public.crypto_withdrawals (created_at)
  where status = 'pending';

alter table public.crypto_withdrawals enable row level security;

drop policy if exists crypto_withdrawals_read on public.crypto_withdrawals;
create policy crypto_withdrawals_read
  on public.crypto_withdrawals for select
  using (auth.uid()::text = player_id or public.is_admin());

-- No INSERT/UPDATE/DELETE policy on purpose: the definer functions below
-- are the only writers, so a client cannot forge a paid row or refund itself.

create or replace function public.request_crypto_withdraw(
  p_player_id text,
  p_coins integer,
  p_asset_id text,
  p_address text,
  p_memo text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rail     record;
  v_balance  integer;
  v_gross    numeric(10, 2);
  v_net      numeric(10, 2);
  v_id       text;
  v_address  text := trim(coalesce(p_address, ''));
begin
  if auth.uid() is null or auth.uid()::text <> p_player_id then
    raise exception 'request_crypto_withdraw: a payout can only be queued for your own account'
      using errcode = '42501';
  end if;

  if p_coins is null or p_coins < 500 then
    raise exception 'The minimum withdrawal is 500 coins ($5).';
  end if;

  select r.* into v_rail from (values
    ('usdt-bep20', 'USDT', 'BEP20 (BSC)', '^0x[0-9A-Fa-f]{40}$'::text),
    ('usdt-trc20', 'USDT', 'TRC20',       '^T[1-9A-HJ-NP-Za-km-z]{33}$'::text)
  ) as r(asset_id, symbol, network, pattern)
  where r.asset_id = p_asset_id;

  if not found then
    raise exception 'That network is not accepting payouts right now.';
  end if;

  if v_address = '' or v_address !~ v_rail.pattern then
    raise exception 'That is not a valid % address.', v_rail.network;
  end if;

  if length(coalesce(p_memo, '')) > 32 then
    raise exception 'That payout memo is too long.';
  end if;

  v_gross := round(p_coins / 100.0, 2);
  v_net   := v_gross - 1.00;
  if v_net <= 0 then
    raise exception 'That payout would not survive its own network fee.';
  end if;

  -- Lock the wallet before reading it, so two concurrent requests cannot
  -- each see enough balance to cover the whole amount.
  select virtual_balance into v_balance
    from public.player_balances
   where player_id = p_player_id
     for update;

  if v_balance is null then
    raise exception 'You have no coins to withdraw yet.';
  end if;
  if v_balance < p_coins then
    raise exception 'Insufficient coins — you hold %.', v_balance;
  end if;

  update public.player_balances
     set virtual_balance = virtual_balance - p_coins,
         updated_at      = now()
   where player_id = p_player_id;

  v_id := 'wd_' || gen_random_uuid()::text;

  insert into public.crypto_withdrawals (
    id, player_id, coins, gross_usd, fee_usd, net_usd,
    asset_id, symbol, network, address, memo, status
  ) values (
    v_id, p_player_id, p_coins, v_gross, 1.00, v_net,
    v_rail.asset_id, v_rail.symbol, v_rail.network, v_address,
    nullif(trim(p_memo), ''), 'pending'
  );

  perform public.record_ledger(
    p_player_id, 'payout', -p_coins, 'Payout escrowed', 'withdrawal', v_id
  );

  return v_id;
end;
$$;

-- The return type changed from boolean to the approval state, and Postgres
-- cannot ALTER a function's return type in place.
drop function if exists public.approve_crypto_withdraw(text, text);

create or replace function public.approve_crypto_withdraw(
  p_id text,
  p_ref text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Mirrors DUAL_APPROVAL_COINS in src/lib/admin/rules.ts. A payout this
  -- large needs two admins; the threshold is a constant, never an argument
  -- a caller could lower.
  v_threshold constant integer := 5000;
  w           public.crypto_withdrawals%rowtype;
  v_uid       uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'approve_crypto_withdraw: admin only'
      using errcode = '42501';
  end if;

  select * into w
    from public.crypto_withdrawals
   where id = p_id
     for update;

  if not found or w.status <> 'pending' then
    return 'none';
  end if;

  -- Small payouts still need one signature.
  if w.coins < v_threshold then
    update public.crypto_withdrawals
       set status      = 'paid',
           note        = coalesce(p_ref, w.note),
           approved_by = v_uid,
           reviewed_at = now()
     where id = p_id;

    return 'paid';
  end if;

  -- Large payout, nobody has signed yet: record the first signature.
  if w.first_approved_by is null then
    update public.crypto_withdrawals
       set first_approved_by = v_uid,
           first_approved_at = now(),
           note              = coalesce(p_ref, w.note)
     where id = p_id;

    return 'awaiting_second';
  end if;

  if w.first_approved_by = v_uid then
    raise exception 'You already signed this payout — a second admin has to confirm it.'
      using errcode = '42501';
  end if;

  update public.crypto_withdrawals
     set status      = 'paid',
         note        = coalesce(p_ref, w.note),
         approved_by = v_uid,
         reviewed_at = now()
   where id = p_id;

  return 'paid';
end;
$$;

create or replace function public.reject_crypto_withdraw(
  p_id text,
  p_note text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w public.crypto_withdrawals%rowtype;
begin
  if not public.is_admin() then
    raise exception 'reject_crypto_withdraw: admin only'
      using errcode = '42501';
  end if;

  select * into w
    from public.crypto_withdrawals
   where id = p_id
     for update;

  if not found or w.status <> 'pending' then
    return 0;
  end if;

  update public.crypto_withdrawals
     set status      = 'rejected',
         note        = coalesce(nullif(trim(p_note), ''), 'Rejected.'),
         reviewed_at = now()
   where id = p_id;

  insert into public.player_balances (player_id, virtual_balance, updated_at)
  values (w.player_id, w.coins, now())
  on conflict (player_id) do update
    set virtual_balance = public.player_balances.virtual_balance + w.coins,
        updated_at      = now();

  perform public.record_ledger(
    w.player_id, 'payout_refund', w.coins,
    coalesce(nullif(trim(p_note), ''), 'Payout refused'),
    'withdrawal', p_id
  );

  return w.coins;
end;
$$;

revoke all on function public.request_crypto_withdraw(text, integer, text, text, text) from public;
revoke all on function public.approve_crypto_withdraw(text, text) from public;
revoke all on function public.reject_crypto_withdraw(text, text) from public;
grant execute on function public.request_crypto_withdraw(text, integer, text, text, text) to authenticated;
grant execute on function public.approve_crypto_withdraw(text, text) to authenticated;
grant execute on function public.reject_crypto_withdraw(text, text) to authenticated;

-- =====================================================================
-- 11. PLAYER MAILBOX
--    Every money event writes one company letter to that player's inbox
--    in the same transaction. Clients can read their own mail and mark it
--    read; they cannot insert, rewrite or delete it.
-- =====================================================================

create table if not exists public.player_mails (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  -- Stable per-event key: a retried trigger or a backfill cannot deliver
  -- the same letter twice.
  event_key text not null,
  sender text not null default 'Pip Duel Arena',
  category text not null default 'system' check (category in ('deposit', 'withdrawal', 'system')),
  subject text not null,
  preview text not null,
  body text not null,
  ref_id text,
  coins integer,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (player_id, event_key)
);

create index if not exists idx_player_mails_player
  on public.player_mails (player_id, created_at desc);

alter table public.player_mails enable row level security;

drop policy if exists player_mails_read on public.player_mails;
create policy player_mails_read
  on public.player_mails for select
  using (auth.uid()::text = player_id);

drop policy if exists player_mails_mark_read on public.player_mails;
create policy player_mails_mark_read
  on public.player_mails for update
  using (auth.uid()::text = player_id)
  with check (auth.uid()::text = player_id);

-- Realtime: the lobby subscribes to its own inserts so a letter appears the
-- moment a money trigger writes it. Skipped where the publication is absent.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.player_mails';
    exception when duplicate_object then
      null;
    end;
  end if;
end;
$$;

-- Writers -------------------------------------------------------------
-- SECURITY DEFINER so the triggers can write even though clients have no
-- INSERT policy. EXECUTE is revoked below so a client cannot call these
-- to fabricate mail.

create or replace function public.queue_deposit_mail(p_row public.crypto_deposits, p_event text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_short text := left(p_row.txid, 10) || '…' || right(p_row.txid, 6);
  v_memo text := case
    when coalesce(p_row.memo, '') = '' then ''
    else E'\nMemo / tag: ' || p_row.memo
  end;
  v_coins integer := coalesce(p_row.coins, 0);
begin
  if p_event = 'received' then
    insert into public.player_mails
      (player_id, event_key, sender, category, subject, preview, body, ref_id, coins, created_at)
    values (
      p_row.player_id,
      'deposit:' || p_row.id || ':received',
      'Pip Duel Treasury',
      'deposit',
      'Deposit received — ' || p_row.symbol || ' (' || p_row.network || ') awaiting review',
      'TxID ' || v_short || ' · we verify the transfer before crediting coins',
      'We received your deposit claim for ' || p_row.symbol || ' on ' || p_row.network || '.' ||
      E'\n\nTransaction: ' || p_row.txid ||
      E'\nPaid to: ' || p_row.address || v_memo ||
      E'\n\nNothing has been credited yet. A reviewer checks the transfer on the block explorer and names the coin amount; your balance updates at that moment, and another letter lands here when the review is complete.' ||
      E'\n\nIf you pasted the wrong TxID, submit a new claim from Wallet → Deposit. This mailbox is not monitored for replies.',
      p_row.id,
      null,
      coalesce(p_row.created_at, now())
    )
    on conflict (player_id, event_key) do nothing;
  elsif p_event = 'paid' then
    insert into public.player_mails
      (player_id, event_key, sender, category, subject, preview, body, ref_id, coins, created_at)
    values (
      p_row.player_id,
      'deposit:' || p_row.id || ':paid',
      'Pip Duel Treasury',
      'deposit',
      'Deposit credited — ' || v_coins || ' coins added to your wallet',
      'TxID ' || v_short || ' · reference ' || coalesce(nullif(p_row.note, ''), '—'),
      'Your deposit has been verified and credited.' ||
      E'\n\nCoins credited: ' || v_coins ||
      E'\nValue: $' || to_char(v_coins / 100.0, 'FM999999990.00') || ' at 100 coins = $1' ||
      E'\nRail: ' || p_row.symbol || ' · ' || p_row.network ||
      E'\nTransaction: ' || p_row.txid ||
      E'\nPayment reference: ' || coalesce(nullif(p_row.note, ''), '—') ||
      E'\n\nYour spendable balance has already been updated in Wallet.',
      p_row.id,
      p_row.coins,
      coalesce(p_row.reviewed_at, p_row.created_at, now())
    )
    on conflict (player_id, event_key) do nothing;
  elsif p_event = 'rejected' then
    insert into public.player_mails
      (player_id, event_key, sender, category, subject, preview, body, ref_id, coins, created_at)
    values (
      p_row.player_id,
      'deposit:' || p_row.id || ':rejected',
      'Pip Duel Treasury',
      'deposit',
      'Deposit not credited — TxID ' || v_short,
      'Reason: ' || coalesce(nullif(p_row.note, ''), 'Rejected.'),
      'We could not credit this deposit.' ||
      E'\n\nTransaction: ' || p_row.txid ||
      E'\nRail: ' || p_row.symbol || ' · ' || p_row.network ||
      E'\nReason: ' || coalesce(nullif(p_row.note, ''), 'Rejected.') ||
      E'\n\nNo coins were added to your wallet. If you believe this is a mistake, check the TxID, the network and the receiving address shown in Wallet → Deposit, then submit a fresh claim.',
      p_row.id,
      null,
      coalesce(p_row.reviewed_at, p_row.created_at, now())
    )
    on conflict (player_id, event_key) do nothing;
  end if;
end;
$$;

create or replace function public.queue_withdrawal_mail(p_row public.crypto_withdrawals, p_event text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_memo text := case
    when coalesce(p_row.memo, '') = '' then ''
    else E'\nMemo / tag: ' || p_row.memo
  end;
begin
  if p_event = 'requested' then
    insert into public.player_mails
      (player_id, event_key, sender, category, subject, preview, body, ref_id, coins, created_at)
    values (
      p_row.player_id,
      'withdrawal:' || p_row.id || ':requested',
      'Pip Duel Payouts',
      'withdrawal',
      'Withdrawal request received — ' || p_row.coins || ' coins escrowed',
      p_row.symbol || ' · ' || p_row.network || ' · you receive $' || to_char(p_row.net_usd, 'FM999999990.00'),
      'Your payout request is queued and the coins are already held in escrow.' ||
      E'\n\nCoins escrowed: ' || p_row.coins ||
      E'\nGross value: $' || to_char(p_row.gross_usd, 'FM999999990.00') ||
      E'\nNetwork fee: $' || to_char(p_row.fee_usd, 'FM999999990.00') ||
      E'\nYou receive: $' || to_char(p_row.net_usd, 'FM999999990.00') ||
      E'\nNetwork: ' || p_row.symbol || ' · ' || p_row.network ||
      E'\nDestination: ' || p_row.address || v_memo ||
      E'\n\nNothing else will be charged. A reviewer sends the transfer by hand and closes the request with its TxID; another letter lands here when it has been sent.',
      p_row.id,
      p_row.coins,
      coalesce(p_row.created_at, now())
    )
    on conflict (player_id, event_key) do nothing;
  elsif p_event = 'paid' then
    insert into public.player_mails
      (player_id, event_key, sender, category, subject, preview, body, ref_id, coins, created_at)
    values (
      p_row.player_id,
      'withdrawal:' || p_row.id || ':paid',
      'Pip Duel Payouts',
      'withdrawal',
      'Payout sent — $' || to_char(p_row.net_usd, 'FM999999990.00') || ' in ' || p_row.symbol,
      'Coins settled: ' || p_row.coins || ' · reference ' || coalesce(nullif(p_row.note, ''), '—'),
      'Your payout has been sent.' ||
      E'\n\nAmount sent: $' || to_char(p_row.net_usd, 'FM999999990.00') ||
      E'\nNetwork fee: $' || to_char(p_row.fee_usd, 'FM999999990.00') ||
      E'\nCoins settled: ' || p_row.coins ||
      E'\nNetwork: ' || p_row.symbol || ' · ' || p_row.network ||
      E'\nDestination: ' || p_row.address || v_memo ||
      E'\nPayout reference: ' || coalesce(nullif(p_row.note, ''), '—') ||
      E'\n\nThe coins are out of your arena wallet for good. Keep the reference above for your records.',
      p_row.id,
      p_row.coins,
      coalesce(p_row.reviewed_at, p_row.created_at, now())
    )
    on conflict (player_id, event_key) do nothing;
  elsif p_event = 'rejected' then
    insert into public.player_mails
      (player_id, event_key, sender, category, subject, preview, body, ref_id, coins, created_at)
    values (
      p_row.player_id,
      'withdrawal:' || p_row.id || ':rejected',
      'Pip Duel Payouts',
      'withdrawal',
      'Payout declined — ' || p_row.coins || ' coins returned',
      'Reason: ' || coalesce(nullif(p_row.note, ''), 'Rejected.'),
      'Your payout request was declined and the escrowed coins are back in your wallet.' ||
      E'\n\nCoins returned: ' || p_row.coins ||
      E'\nReason: ' || coalesce(nullif(p_row.note, ''), 'Rejected.') ||
      E'\n\nYou can request a payout again once the address and network are correct.',
      p_row.id,
      p_row.coins,
      coalesce(p_row.reviewed_at, p_row.created_at, now())
    )
    on conflict (player_id, event_key) do nothing;
  end if;
end;
$$;

revoke all on function public.queue_deposit_mail(public.crypto_deposits, text) from public;
revoke all on function public.queue_withdrawal_mail(public.crypto_withdrawals, text) from public;

-- Triggers ------------------------------------------------------------

create or replace function public.mail_on_deposit_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.queue_deposit_mail(new, 'received');
  elsif new.status is distinct from old.status then
    perform public.queue_deposit_mail(new, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crypto_deposits_mail on public.crypto_deposits;
create trigger trg_crypto_deposits_mail
  after insert or update of status on public.crypto_deposits
  for each row execute function public.mail_on_deposit_change();

create or replace function public.mail_on_withdrawal_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.queue_withdrawal_mail(new, 'requested');
  elsif new.status is distinct from old.status then
    perform public.queue_withdrawal_mail(new, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crypto_withdrawals_mail on public.crypto_withdrawals;
create trigger trg_crypto_withdrawals_mail
  after insert or update of status on public.crypto_withdrawals
  for each row execute function public.mail_on_withdrawal_change();

-- Backfill letters for rows that predate this mailbox. The event keys make
-- this safe to run on every setup pass.
do $$
declare
  d public.crypto_deposits%rowtype;
begin
  for d in select * from public.crypto_deposits loop
    perform public.queue_deposit_mail(d, 'received');
    if d.status = 'paid' then
      perform public.queue_deposit_mail(d, 'paid');
    elsif d.status = 'rejected' then
      perform public.queue_deposit_mail(d, 'rejected');
    end if;
  end loop;
end;
$$;

do $$
declare
  w public.crypto_withdrawals%rowtype;
begin
  for w in select * from public.crypto_withdrawals loop
    perform public.queue_withdrawal_mail(w, 'requested');
    if w.status = 'paid' then
      perform public.queue_withdrawal_mail(w, 'paid');
    elsif w.status = 'rejected' then
      perform public.queue_withdrawal_mail(w, 'rejected');
    end if;
  end loop;
end;
$$;

-- =====================================================================
-- 12. LEGACY CLEANUP
--    The store / frame / rupee-gateway era is gone. Drop whatever an
--    older database still carries so it converges on the shape above.
--    Safe on a fresh project (everything is IF EXISTS).
-- =====================================================================

drop trigger if exists trg_profiles_starter_frame on public.profiles;
drop function if exists public.grant_starter_frame();

drop table if exists public.creator_attributions;
drop table if exists public.creator_codes;
drop table if exists public.market_trades;
drop table if exists public.market_listings;
drop table if exists public.orders;
drop table if exists public.coin_orders;
drop table if exists public.season_pass_state;
drop table if exists public.inventory;
drop table if exists public.store_items;
drop table if exists public.player_inventory;
drop table if exists public.shop_items;

alter table public.profiles
  drop column if exists avatar_frame,
  drop column if exists owned_frames;

alter table public.player_balances
  drop column if exists virtual_gems;

comment on column public.player_balances.virtual_balance is
  'The coin wallet: bought by crypto deposit, spent on Live entries, topped up by pot payouts and rewards.';

-- =====================================================================
-- 13. SMOKE TEST (read-only — optional)
--     Run these one at a time after the script succeeds:
--
--   select table_name from information_schema.tables
--    where table_schema = 'public' order by table_name;
--
--   select proname from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and proname in ('approve_crypto_deposit','reject_crypto_deposit',
--                      'request_crypto_withdraw','approve_crypto_withdraw',
--                      'reject_crypto_withdraw','is_admin','handle_new_user',
--                      'admin_adjust_coins','admin_set_player_status',
--                      'record_ledger');
-- =====================================================================
