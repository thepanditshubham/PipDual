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
--   profiles, profile_details, profile_portfolio, player_balances,
--   player_friends, profile_follows, profile_skills,
--   profile_skill_endorsements, player_progress, rank_state,
--   match_results, trade_events,
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

  -- Every account opens with its 1,000-coin starting balance.
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
-- 6. ADMIN PREDICATE  (kept for the announcements read policy)
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
--    Operator and match events write one letter to that player's inbox in the
--    same transaction. Clients can read their own mail, mark it read and delete
--    letters they clear out; they cannot insert or rewrite it.
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

-- =====================================================================
-- PIP DUEL — TRADER PROFILE SYSTEM
--
-- One migration for the public profile, its privacy boundary, community
-- skills/endorsements, follows, the self-reported portfolio, and the two
-- private columns the profile header needs (cover and verification).
--
-- The browser never reads another player's match_results, rank_state,
-- player_progress, user_achievements or portfolio directly. Those tables stay
-- owner-scoped; public reads go through get_player_profile(), a SECURITY
-- DEFINER function that projects only the fields the viewer is allowed to see.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. BATTLE ROWS: opponent label + verified flag + future tournament mode
-- ---------------------------------------------------------------------

alter table public.match_results
  add column if not exists opponent_key text,
  add column if not exists is_verified boolean not null default true;

alter table public.match_results
  drop constraint if exists match_results_mode_check;

alter table public.match_results
  add constraint match_results_mode_check
  check (mode in ('ranked', 'friendly', 'practice', 'tournament'));

-- ---------------------------------------------------------------------
-- 2. PRIVATE DETAILS (one row per profile; never publicly selectable)
-- ---------------------------------------------------------------------

create table if not exists public.profile_details (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  bio text check (char_length(bio) <= 280),
  cover_url text,
  location text check (char_length(location) <= 64),
  social_links jsonb not null default '{}'::jsonb
    check (jsonb_typeof(social_links) = 'object'),
  profile_visibility text not null default 'public'
    check (profile_visibility in ('public', 'followers', 'private')),
  show_battle_history boolean not null default true,
  show_country boolean not null default true,
  show_social_links boolean not null default true,
  allow_follows boolean not null default true,
  allow_messages boolean not null default true,
  -- Admin-controlled trust signal. Players cannot write this column: the
  -- column grants below omit it and the API never accepts it.
  is_verified boolean not null default false,
  -- Written by the presence heartbeat, not by the profile editor.
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists profile_details_last_seen_idx
  on public.profile_details (last_seen_at desc)
  where last_seen_at is not null;

alter table public.profile_details enable row level security;

drop policy if exists profile_details_read_own on public.profile_details;
create policy profile_details_read_own
  on public.profile_details for select
  using (auth.uid() = user_id);

drop policy if exists profile_details_insert_own on public.profile_details;
create policy profile_details_insert_own
  on public.profile_details for insert
  with check (auth.uid() = user_id);

drop policy if exists profile_details_update_own on public.profile_details;
create policy profile_details_update_own
  on public.profile_details for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Country is the only profile column the public projection hides per-player.
-- Remove it from the public table grant so the privacy switch is enforced by
-- the database, not just by get_player_profile(). The leaderboard views are
-- owner-rights views and can still read it.
revoke select on public.profiles from anon, authenticated;
grant select (
  id, username, display_name, avatar_url, language, role, rating,
  risk_rating, created_at, updated_at
) on public.profiles to anon, authenticated;

-- Column grants, not just RLS: a player may edit presentation fields and
-- their own presence stamp, but never is_verified.
revoke insert, update on public.profile_details from anon, authenticated;
grant select on public.profile_details to authenticated;
grant insert (
  user_id, bio, cover_url, location, social_links, profile_visibility,
  show_battle_history, show_country, show_social_links, allow_follows,
  allow_messages, last_seen_at
) on public.profile_details to authenticated;
grant update (
  bio, cover_url, location, social_links, profile_visibility,
  show_battle_history, show_country, show_social_links, allow_follows,
  allow_messages, last_seen_at
) on public.profile_details to authenticated;

create or replace function public.ensure_profile_details()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profile_details (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_profile_details_create on public.profiles;
create trigger trg_profile_details_create
  after insert on public.profiles
  for each row execute function public.ensure_profile_details();

insert into public.profile_details (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- The leaderboard views are owner-rights views. They must apply the same
-- country switch as get_player_profile(), otherwise a client could read the
-- hidden column through the board.
drop view if exists public.progress_leaderboard;
create view public.progress_leaderboard as
select
  p.id::text as user_id,
  p.username,
  p.display_name,
  case when coalesce(d.show_country, true) then p.country else null end as country,
  r.season_id,
  r.rp,
  r.weekly_rp as week_rp,
  r.placement_played,
  coalesce(stats.matches, 0) as matches,
  coalesce(stats.wins, 0) as wins
from public.profiles p
join public.rank_state r on r.user_id = p.id::text
left join public.profile_details d on d.user_id = p.id
left join (
  select user_id,
         count(*) filter (where mode = 'ranked') as matches,
         count(*) filter (where result = 'win') as wins
  from public.match_results
  group by user_id
) stats on stats.user_id = p.id::text
where r.placement_played >= r.placement_target;

grant select on public.progress_leaderboard to anon, authenticated;

drop view if exists public.progress_weekly_leaderboard;
create view public.progress_weekly_leaderboard as
select
  p.id::text as user_id,
  p.username,
  p.display_name,
  case when coalesce(d.show_country, true) then p.country else null end as country,
  r.weekly_key,
  r.weekly_rp
from public.profiles p
join public.rank_state r on r.user_id = p.id::text
left join public.profile_details d on d.user_id = p.id
where r.weekly_key is not null;

grant select on public.progress_weekly_leaderboard to anon, authenticated;

create or replace function public.touch_profile_details()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profile_details_touch on public.profile_details;
create trigger trg_profile_details_touch
  before update on public.profile_details
  for each row execute function public.touch_profile_details();

-- ---------------------------------------------------------------------
-- 3. COMMUNITY SKILLS AND ENDORSEMENTS
-- ---------------------------------------------------------------------

create table if not exists public.profile_skills (
  user_id uuid not null references public.profiles (id) on delete cascade,
  skill_key text not null check (skill_key in (
    'price_action', 'market_structure', 'liquidity_analysis',
    'risk_management', 'technical_analysis', 'trading_psychology'
  )),
  created_at timestamptz not null default now(),
  primary key (user_id, skill_key)
);

alter table public.profile_skills enable row level security;

drop policy if exists profile_skills_read on public.profile_skills;
create policy profile_skills_read
  on public.profile_skills for select using (true);

drop policy if exists profile_skills_insert_own on public.profile_skills;
create policy profile_skills_insert_own
  on public.profile_skills for insert
  with check (auth.uid() = user_id);

drop policy if exists profile_skills_delete_own on public.profile_skills;
create policy profile_skills_delete_own
  on public.profile_skills for delete
  using (auth.uid() = user_id);

grant select on public.profile_skills to anon, authenticated;
grant insert, delete on public.profile_skills to authenticated;

create table if not exists public.profile_skill_endorsements (
  id uuid primary key default gen_random_uuid(),
  profile_user_id uuid not null,
  skill_key text not null,
  endorser_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_user_id, skill_key, endorser_id),
  check (profile_user_id <> endorser_id),
  foreign key (profile_user_id, skill_key)
    references public.profile_skills (user_id, skill_key) on delete cascade
);

create index if not exists profile_skill_endorsements_target_idx
  on public.profile_skill_endorsements (profile_user_id, skill_key);

-- A community endorsement is not a qualification. The eligibility gate is
-- deliberately modest: the endorser must have at least one stored duel.
create or replace function public.is_eligible_endorser(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.match_results where user_id = p_user_id::text
  );
$$;

grant execute on function public.is_eligible_endorser(uuid) to authenticated;

alter table public.profile_skill_endorsements enable row level security;

drop policy if exists profile_endorsements_read on public.profile_skill_endorsements;
create policy profile_endorsements_read
  on public.profile_skill_endorsements for select using (true);

drop policy if exists profile_endorsements_insert on public.profile_skill_endorsements;
create policy profile_endorsements_insert
  on public.profile_skill_endorsements for insert
  with check (
    endorser_id = auth.uid()
    and profile_user_id <> auth.uid()
    and public.is_eligible_endorser(auth.uid())
  );

drop policy if exists profile_endorsements_delete_own on public.profile_skill_endorsements;
create policy profile_endorsements_delete_own
  on public.profile_skill_endorsements for delete
  using (endorser_id = auth.uid());

grant select on public.profile_skill_endorsements to anon, authenticated;
grant insert, delete on public.profile_skill_endorsements to authenticated;

-- ---------------------------------------------------------------------
-- 4. FOLLOWS
-- ---------------------------------------------------------------------

create table if not exists public.profile_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists profile_follows_target_idx
  on public.profile_follows (following_id, created_at desc);

alter table public.profile_follows enable row level security;

drop policy if exists profile_follows_read on public.profile_follows;
create policy profile_follows_read
  on public.profile_follows for select using (true);

drop policy if exists profile_follows_insert_own on public.profile_follows;
create policy profile_follows_insert_own
  on public.profile_follows for insert
  with check (follower_id = auth.uid());

drop policy if exists profile_follows_delete_own on public.profile_follows;
create policy profile_follows_delete_own
  on public.profile_follows for delete
  using (follower_id = auth.uid());

grant select on public.profile_follows to anon, authenticated;
grant insert, delete on public.profile_follows to authenticated;

create or replace function public.profile_is_visible_to(p_owner uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_viewer is not null and p_viewer = p_owner then true
    else coalesce((
      select case d.profile_visibility
        when 'private' then false
        when 'followers' then exists (
          select 1 from public.profile_follows
          where follower_id = p_viewer and following_id = p_owner
        )
        else true
      end
      from public.profile_details d
      where d.user_id = p_owner
    ), true)
  end;
$$;

grant execute on function public.profile_is_visible_to(uuid, uuid) to authenticated;

-- Endorsements are only for profiles the endorser is allowed to see. This
-- policy is created after the visibility helper exists; the first insert policy
-- above still owns the self/eligibility checks.
drop policy if exists profile_endorsements_insert on public.profile_skill_endorsements;
create policy profile_endorsements_insert
  on public.profile_skill_endorsements for insert
  with check (
    endorser_id = auth.uid()
    and profile_user_id <> auth.uid()
    and public.is_eligible_endorser(auth.uid())
    and public.profile_is_visible_to(profile_user_id, auth.uid())
  );

create or replace function public.guard_profile_follow()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visibility text;
  v_allowed boolean;
begin
  select profile_visibility, allow_follows
  into v_visibility, v_allowed
  from public.profile_details where user_id = new.following_id;

  if v_visibility = 'private' or coalesce(v_allowed, true) = false then
    raise exception 'This trader is not accepting followers.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profile_follow_guard on public.profile_follows;
create trigger trg_profile_follow_guard
  before insert on public.profile_follows
  for each row execute function public.guard_profile_follow();

-- ---------------------------------------------------------------------
-- 5. SELF-REPORTED PORTFOLIO
-- ---------------------------------------------------------------------

create table if not exists public.profile_portfolio (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  experience text check (char_length(experience) <= 1000),
  preferred_markets text[] not null default '{}'
    check (coalesce(array_length(preferred_markets, 1), 0) <= 8),
  trading_style text check (char_length(trading_style) <= 80),
  methodology text check (char_length(methodology) <= 1500),
  preferred_timeframes text[] not null default '{}'
    check (coalesce(array_length(preferred_timeframes, 1), 0) <= 8),
  certifications text check (char_length(certifications) <= 500),
  updated_at timestamptz not null default now()
);

alter table public.profile_portfolio enable row level security;

drop policy if exists profile_portfolio_read_own on public.profile_portfolio;
create policy profile_portfolio_read_own
  on public.profile_portfolio for select
  using (auth.uid() = user_id);

drop policy if exists profile_portfolio_insert_own on public.profile_portfolio;
create policy profile_portfolio_insert_own
  on public.profile_portfolio for insert
  with check (auth.uid() = user_id);

drop policy if exists profile_portfolio_update_own on public.profile_portfolio;
create policy profile_portfolio_update_own
  on public.profile_portfolio for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.profile_portfolio to authenticated;

drop trigger if exists trg_profile_portfolio_touch on public.profile_portfolio;
create trigger trg_profile_portfolio_touch
  before update on public.profile_portfolio
  for each row execute function public.touch_profile_details();

-- ---------------------------------------------------------------------
-- 6. PLAYER-TO-PLAYER MESSAGES (delivered through the existing inbox)
-- ---------------------------------------------------------------------

alter table public.player_mails
  add column if not exists sender_id uuid references public.profiles (id) on delete set null;

alter table public.player_mails
  drop constraint if exists player_mails_category_check;

alter table public.player_mails
  add constraint player_mails_category_check
  check (category in ('deposit', 'withdrawal', 'system', 'player'));

create or replace function public.can_message_to(p_recipient uuid, p_sender uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select public.profile_is_visible_to(p_recipient, p_sender)
      and coalesce(d.allow_messages, true)
    from public.profile_details d
    where d.user_id = p_recipient
  ), true);
$$;

grant execute on function public.can_message_to(uuid, uuid) to authenticated;

drop policy if exists player_mails_send on public.player_mails;
create policy player_mails_send
  on public.player_mails for insert
  with check (
    category = 'player'
    and sender_id = auth.uid()
    and player_id <> auth.uid()::text
    and sender = (select username from public.profiles where id = auth.uid())
    and public.can_message_to(player_id::uuid, auth.uid())
  );

grant insert on public.player_mails to authenticated;

create index if not exists idx_player_mails_sender
  on public.player_mails (sender_id, created_at desc)
  where sender_id is not null;

-- ---------------------------------------------------------------------
-- 7. PUBLIC PROFILE PROJECTION
-- ---------------------------------------------------------------------

drop function if exists public.get_player_profile(text);
create function public.get_player_profile(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_viewer uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_details public.profile_details%rowtype;
  v_is_owner boolean := false;
  v_is_following boolean := false;
  v_restricted boolean := false;
  v_visibility text := 'public';
  v_connection text := 'none';
  v_follower_count bigint := 0;
  v_following_count bigint := 0;
  v_online boolean := false;
  v_can_message boolean := false;
  v_can_endorse boolean := false;
  v_can_battles boolean := false;
  v_total bigint := 0;
  v_wins bigint := 0;
  v_losses bigint := 0;
  v_draws bigint := 0;
  v_tournament_wins bigint := 0;
  v_current_streak integer := 0;
  v_highest_streak integer := 0;
  v_xp integer := 0;
  v_rank_rp integer := 0;
  v_peak_rp integer := 0;
  v_season_id text := 'S1';
  v_placement_played integer := 0;
  v_placement_target integer := 5;
  v_season_rank integer := null;
  v_social jsonb;
  v_stats jsonb;
  v_battles jsonb := '[]'::jsonb;
  v_achievements jsonb := '[]'::jsonb;
  v_skills jsonb := '[]'::jsonb;
  v_portfolio jsonb;
  v_activity jsonb := '[]'::jsonb;
begin
  if p_username is null or btrim(p_username) = '' then
    return null;
  end if;

  select * into v_profile
  from public.profiles
  where lower(username) = lower(btrim(p_username))
  limit 1;

  if not found then
    return null;
  end if;

  select * into v_details
  from public.profile_details
  where user_id = v_profile.id;

  v_is_owner := v_viewer is not null and v_viewer = v_profile.id;
  v_visibility := coalesce(v_details.profile_visibility, 'public');
  v_online := coalesce(v_details.last_seen_at > now() - interval '5 minutes', false);

  select count(*) into v_follower_count
  from public.profile_follows where following_id = v_profile.id;

  select count(*) into v_following_count
  from public.profile_follows where follower_id = v_profile.id;

  v_is_following := v_viewer is not null and exists (
    select 1 from public.profile_follows
    where follower_id = v_viewer and following_id = v_profile.id
  );

  if not v_is_owner
     and (v_visibility = 'private' or (v_visibility = 'followers' and not v_is_following)) then
    v_restricted := true;
  end if;

  if v_viewer is not null and not v_is_owner then
    select case
      when status = 'accepted' then 'connected'
      when requester_id = v_viewer::text then 'pending_out'
      else 'pending_in'
    end
    into v_connection
    from public.player_friends
    where (requester_id = v_viewer::text and addressee_id = v_profile.id::text)
       or (addressee_id = v_viewer::text and requester_id = v_profile.id::text)
    order by (status = 'accepted') desc, updated_at desc
    limit 1;
    v_connection := coalesce(v_connection, 'none');
  end if;

  v_can_battles := not v_restricted
    and (v_is_owner or coalesce(v_details.show_battle_history, true));
  v_can_message := not v_restricted
    and v_viewer is not null
    and not v_is_owner
    and coalesce(v_details.allow_messages, true);
  v_can_endorse := not v_restricted
    and v_viewer is not null
    and not v_is_owner
    and public.is_eligible_endorser(v_viewer);
  v_social := case
    when v_is_owner or coalesce(v_details.show_social_links, true)
      then coalesce(v_details.social_links, '{}'::jsonb)
    else '{}'::jsonb
  end;

  if v_restricted then
    return jsonb_build_object(
      'restricted', true,
      'profile', jsonb_build_object(
        'username', v_profile.username,
        'displayName', coalesce(nullif(v_profile.display_name, ''), v_profile.username),
        'avatarUrl', v_profile.avatar_url,
        'coverUrl', null,
        'bio', null,
        'country', null,
        'location', null,
        'traderId', 'PD-' || upper(substr(replace(v_profile.id::text, '-', ''), 1, 8)),
        'createdAt', v_profile.created_at,
        'online', v_online,
        'verified', coalesce(v_details.is_verified, false),
        'visibility', v_visibility,
        'followerCount', v_follower_count,
        'followingCount', v_following_count,
        'isFollowing', v_is_following,
        'isSelf', false,
        'connectionStatus', v_connection,
        -- A followers-only profile still accepts follow requests; private does not.
        'allowFollows', case
          when v_visibility = 'followers' then coalesce(v_details.allow_follows, true)
          else false
        end,
        'allowMessages', false,
        'canMessage', false,
        'canEndorse', false,
        'showBattleHistory', false,
        'showCountry', false,
        'showSocialLinks', false,
        'battleHistoryVisible', false
      ),
      'stats', null,
      'battles', '[]'::jsonb,
      'achievements', '[]'::jsonb,
      'skills', '[]'::jsonb,
      'portfolio', null,
      'activity', '[]'::jsonb
    );
  end if;

  select
    count(*),
    count(*) filter (where result = 'win'),
    count(*) filter (where result = 'loss'),
    count(*) filter (where result = 'draw'),
    count(*) filter (where mode = 'tournament' and result = 'win')
  into v_total, v_wins, v_losses, v_draws, v_tournament_wins
  from public.match_results
  where user_id = v_profile.id::text;

  with ordered as (
    select result, row_number() over (order by created_at asc, id asc) as rn
    from public.match_results
    where user_id = v_profile.id::text
  ),
  islands as (
    select result, rn,
      sum(case when result = 'win' then 0 else 1 end) over (order by rn) as grp
    from ordered
  ),
  runs as (
    select result, rn,
      sum(case when result = 'win' then 1 else 0 end) over (partition by grp order by rn) as streak
    from islands
  )
  select
    coalesce(max(streak), 0)::integer,
    coalesce((array_agg(streak order by rn desc))[1], 0)::integer
  into v_highest_streak, v_current_streak
  from runs;

  select xp into v_xp
  from public.player_progress where user_id = v_profile.id::text;
  v_xp := coalesce(v_xp, 0);

  select rp, peak_rp, season_id, placement_played, placement_target
  into v_rank_rp, v_peak_rp, v_season_id, v_placement_played, v_placement_target
  from public.rank_state where user_id = v_profile.id::text;
  v_rank_rp := coalesce(v_rank_rp, 0);
  v_peak_rp := coalesce(v_peak_rp, 0);
  v_season_id := coalesce(v_season_id, 'S1');
  v_placement_played := coalesce(v_placement_played, 0);
  v_placement_target := coalesce(v_placement_target, 5);

  if v_placement_target > 0 and v_placement_played >= v_placement_target then
    select count(*)::integer + 1 into v_season_rank
    from public.rank_state r
    where r.season_id = v_season_id
      and r.placement_played >= r.placement_target
      and r.rp > v_rank_rp;
  end if;

  v_stats := jsonb_build_object(
    'totalDuels', v_total,
    'wins', v_wins,
    'losses', v_losses,
    'draws', v_draws,
    'winRate', case
      when v_total > 0 then round((v_wins::numeric * 100) / v_total, 1)
      else 0
    end,
    'currentStreak', v_current_streak,
    'highestStreak', v_highest_streak,
    'tournamentWins', v_tournament_wins,
    'xp', v_xp,
    'rankRp', v_rank_rp,
    'peakRp', v_peak_rp,
    'seasonId', v_season_id,
    'placementPlayed', v_placement_played,
    'placementTarget', v_placement_target,
    'seasonRank', v_season_rank
  );

  if v_can_battles then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'matchId', b.match_id,
          'opponent', b.opponent,
          'result', b.result,
          'mode', b.mode,
          'instrument', b.pair,
          'durationSeconds', b.duration,
          'pips', b.pips,
          'verified', b.is_verified,
          'createdAt', b.created_at
        )
        order by b.created_at desc
      ),
      '[]'::jsonb
    )
    into v_battles
    from (
      select match_id, coalesce(nullif(opponent_key, ''), 'Ranked opponent') as opponent,
        result, mode, pair, duration, pips, is_verified, created_at
      from public.match_results
      where user_id = v_profile.id::text
      order by created_at desc
      limit 100
    ) b;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'description', coalesce(c.description, ''),
        'category', c.category,
        'rarity', case
          when ua.progress >= c.gold_target then 'gold'
          when ua.progress >= c.silver_target then 'silver'
          else 'bronze'
        end,
        'progress', ua.progress,
        'unlockedAt', ua.unlocked_at
      )
      order by ua.unlocked_at desc nulls last, c.name
    ),
    '[]'::jsonb
  )
  into v_achievements
  from public.user_achievements ua
  join public.achievements_catalog c on c.id = ua.achievement_id
  where ua.user_id = v_profile.id::text
    and c.active
    and ua.progress >= c.bronze_target;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', s.skill_key,
        'endorsements', (
          select count(*) from public.profile_skill_endorsements e
          where e.profile_user_id = s.user_id and e.skill_key = s.skill_key
        ),
        'endorsedByMe', v_viewer is not null and exists (
          select 1 from public.profile_skill_endorsements e
          where e.profile_user_id = s.user_id
            and e.skill_key = s.skill_key
            and e.endorser_id = v_viewer
        )
      )
      order by s.created_at
    ),
    '[]'::jsonb
  )
  into v_skills
  from public.profile_skills s
  where s.user_id = v_profile.id;

  select jsonb_build_object(
    'experience', pp.experience,
    'preferredMarkets', to_jsonb(pp.preferred_markets),
    'tradingStyle', pp.trading_style,
    'methodology', pp.methodology,
    'preferredTimeframes', to_jsonb(pp.preferred_timeframes),
    'certifications', pp.certifications,
    'socialLinks', v_social
  )
  into v_portfolio
  from public.profile_portfolio pp
  where pp.user_id = v_profile.id;

  if v_portfolio is null then
    v_portfolio := jsonb_build_object(
      'experience', null,
      'preferredMarkets', '[]'::jsonb,
      'tradingStyle', null,
      'methodology', null,
      'preferredTimeframes', '[]'::jsonb,
      'certifications', null,
      'socialLinks', v_social
    );
  end if;

  select coalesce(jsonb_agg(item order by at desc), '[]'::jsonb)
  into v_activity
  from (
    (
      select f.created_at as at,
        jsonb_build_object(
          'type', 'follow',
          'at', f.created_at,
          'actor', jsonb_build_object(
            'username', p.username,
            'displayName', p.display_name,
            'avatarUrl', p.avatar_url
          )
        ) as item
      from public.profile_follows f
      join public.profiles p on p.id = f.follower_id
      where f.following_id = v_profile.id
      order by f.created_at desc
      limit 6
    )
    union all
    (
      select e.created_at as at,
        jsonb_build_object(
          'type', 'endorse',
          'at', e.created_at,
          'skillKey', e.skill_key,
          'actor', jsonb_build_object(
            'username', p.username,
            'displayName', p.display_name,
            'avatarUrl', p.avatar_url
          )
        ) as item
      from public.profile_skill_endorsements e
      join public.profiles p on p.id = e.endorser_id
      where e.profile_user_id = v_profile.id
      order by e.created_at desc
      limit 6
    )
  ) acts;

  return jsonb_build_object(
    'restricted', false,
    'profile', jsonb_build_object(
      'username', v_profile.username,
      'displayName', coalesce(nullif(v_profile.display_name, ''), v_profile.username),
      'avatarUrl', v_profile.avatar_url,
      'coverUrl', v_details.cover_url,
      'bio', v_details.bio,
      'country', case
        when v_is_owner or coalesce(v_details.show_country, true) then v_profile.country
        else null
      end,
      'location', v_details.location,
      'traderId', 'PD-' || upper(substr(replace(v_profile.id::text, '-', ''), 1, 8)),
      'createdAt', v_profile.created_at,
      'online', v_online,
      'verified', coalesce(v_details.is_verified, false),
      'visibility', v_visibility,
      'followerCount', v_follower_count,
      'followingCount', v_following_count,
      'isFollowing', v_is_following,
      'isSelf', v_is_owner,
      'connectionStatus', v_connection,
      'allowFollows', coalesce(v_details.allow_follows, true),
      'allowMessages', coalesce(v_details.allow_messages, true),
      'canMessage', v_can_message,
      'canEndorse', v_can_endorse,
      'showBattleHistory', coalesce(v_details.show_battle_history, true),
      'showCountry', coalesce(v_details.show_country, true),
      'showSocialLinks', coalesce(v_details.show_social_links, true),
      'battleHistoryVisible', v_can_battles
    ),
    'stats', v_stats,
    'battles', v_battles,
    'achievements', v_achievements,
    'skills', v_skills,
    'portfolio', v_portfolio,
    'activity', v_activity
  );
end;
$$;

grant execute on function public.get_player_profile(text) to anon, authenticated;

-- Give already-earned badges a recorded unlock date, so the profile can show
-- when the platform first observed the achievement.
update public.user_achievements ua
set unlocked_at = now()
from public.achievements_catalog c
where ua.achievement_id = c.id
  and ua.progress >= c.bronze_target
  and ua.unlocked_at is null;

-- ---------------------------------------------------------------------
-- 8. PROFILE MEDIA BUCKET
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-media', 'profile-media', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Profile media is publicly readable" on storage.objects;
create policy "Profile media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'profile-media');

drop policy if exists "Profile media owner upload" on storage.objects;
create policy "Profile media owner upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Profile media owner replace" on storage.objects;
create policy "Profile media owner replace"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Profile media owner delete" on storage.objects;
create policy "Profile media owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

