-- =====================================================================
-- PIP DUEL — Supabase setup (one file, safe to re-run)
--
-- HOW TO USE
--   1. Supabase Dashboard → SQL Editor → New query.
--   2. Paste this whole file and press Run.
--   3. Operator tooling (announcements, moderation, analytics) is not part
--      of this public build; this file provisions only the game.
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
--   player_mails, announcements
-- VIEWS
--   progress_leaderboard, progress_weekly_leaderboard,
--   leaderboard_all, leaderboard_weekly, leaderboard_daily
--
-- COIN RULE
--   Coins are virtual credits earned by playing and in missions. There is no
--   purchase, deposit, payout, wallet address or cash-out. Ranked entries burn
--   coins and the winner collects the virtual pot minus a sink.
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
-- 2. WALLET  (virtual coins only — earned in play, spent on ranked entries)
-- =====================================================================

create table if not exists public.player_balances (
  player_id text primary key,
  virtual_balance integer not null default 1000,
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

-- The balance is a game credit, not money. Row-level security scopes every
-- read and write to the signed-in player; guest balances live on the device
-- and never touch this table.
create policy balances_read_own
  on public.player_balances for select using (auth.uid()::text = player_id);
create policy balances_upsert_own
  on public.player_balances for insert with check (auth.uid()::text = player_id);
create policy balances_update_own
  on public.player_balances for update
  using (auth.uid()::text = player_id)
  with check (auth.uid()::text = player_id);

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

create policy "friends_read"   on public.player_friends for select
  using (auth.uid()::text = requester_id or auth.uid()::text = addressee_id);
create policy "friends_insert" on public.player_friends for insert
  with check (auth.uid()::text = requester_id);
create policy "friends_update" on public.player_friends for update
  using (auth.uid()::text = requester_id or auth.uid()::text = addressee_id)
  with check (auth.uid()::text = requester_id or auth.uid()::text = addressee_id);
create policy "friends_delete" on public.player_friends for delete
  using (auth.uid()::text = requester_id or auth.uid()::text = addressee_id);

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

-- 11. PLAYER MAILBOX
--    Every money event writes one company letter to that player's inbox
--    in the same transaction. Clients can read their own mail, mark it
--    read and delete letters they clear out; they cannot insert or
--    rewrite it.
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

-- The inbox cleanup button. Scoped to the player's own rows, so a client can
-- only ever delete mail it could already read.
drop policy if exists player_mails_delete on public.player_mails;
create policy player_mails_delete
  on public.player_mails for delete
  using (auth.uid()::text = player_id);

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

-- 12. ARENA ANNOUNCEMENTS
--     The strip that sits above the lobby header and the menu bar. Anyone
--     reads what is switched on — a signed-out visitor on the landing page
--     included — and nobody writes through the table: the three definer
--     functions below check public.is_admin() first.
-- =====================================================================

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  -- One line of copy. The check keeps the bar to a single row: prose that
  -- runs long is an admin-page validation problem, not a layout problem.
  title text not null check (char_length(btrim(title)) between 1 and 140),
  tone text not null default 'info'
    check (tone in ('info', 'promo', 'warn', 'critical')),
  -- Optional call to action on the right edge of the strip.
  link_url text,
  link_label text,
  -- Draft by default, so composing a strip never publishes it by accident.
  live boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The bar reads only live rows, newest first; the index is partial so a long
-- archive of retired strips stays cheap to scan.
create index if not exists idx_announcements_live
  on public.announcements (created_at desc)
  where live;

alter table public.announcements enable row level security;

drop policy if exists announcements_read_live on public.announcements;
create policy announcements_read_live
  on public.announcements for select
  using (live or public.is_admin());

-- There is deliberately no insert / update / delete policy and no writer in
-- the public build: the strip is provisioned by the private operator console.

-- The landing page reads the bar before anyone signs in, so the select is
-- spelled out for anon instead of leaning on project defaults. RLS still
-- filters it down to the rows an admin switched on.
grant select on public.announcements to anon, authenticated;


-- =====================================================================
-- 14. LEGACY CLEANUP
--    The store / frame / rupee-gateway era is gone. Drop whatever an
--    older database still carries so it converges on the shape above.
--    Safe on a fresh project (everything is IF EXISTS).
-- =====================================================================

drop trigger if exists trg_profiles_starter_frame on public.profiles;
drop function if exists public.grant_starter_frame();

drop table if exists public.creator_attributions;
drop table if exists public.creator_codes;
-- Legacy tables from the retired store and money eras are no longer
-- created by this file. Existing rows are left untouched: archive or drop
-- them manually after exporting anything you are required to keep.
drop table if exists public.referral_config;
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
  'Virtual game credits: earned by playing and in missions, spent on ranked entries. No purchase, transfer or cash-out.';

-- =====================================================================
-- 15. SMOKE TEST (read-only — optional)
--     Run these one at a time after the script succeeds:
--
--   select table_name from information_schema.tables
--    where table_schema = 'public' order by table_name;
--
--   select proname from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and proname in ('is_admin','handle_new_user');
-- =====================================================================
-- =====================================================================

-- =====================================================================
-- SECURITY HARDENING
--
-- Profile authority belongs to the server. A player could PATCH their own
-- profiles row and set role = 'admin'; is_admin() reads that column, so the
-- role had to become unwritable by clients. Column grants do that first, and
-- a trigger holds the same line behind them.
-- =====================================================================

revoke update on public.profiles from anon, authenticated;
grant update (username, display_name, avatar_url, country, language)
  on public.profiles to authenticated;

create or replace function public.guard_profile_authority()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_protected constant text[] := array[
    'id', 'role', 'status', 'status_note', 'status_changed_at',
    'rating', 'risk_rating', 'created_at'
  ];
  v_key text;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  foreach v_key in array v_protected loop
    if (to_jsonb(new) -> v_key) is distinct from (to_jsonb(old) -> v_key) then
      raise exception 'That profile field is not yours to change: %', v_key
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_profile_authority on public.profiles;
create trigger trg_profile_authority
  before update on public.profiles
  for each row execute function public.guard_profile_authority();

