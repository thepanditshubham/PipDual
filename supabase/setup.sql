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
--   crypto_deposits, crypto_withdrawals, wallet_ledger,
--   player_mails, announcements, referrals, ib_config, ib_tiers,
--   ib_balances, ib_earnings, ib_adjustments
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

  -- Affiliate attribution. The invite link's ?ref= arrives as user metadata,
  -- which only the signup itself can set, so the inviter is written down by
  -- the database at the moment the account appears — no client can name
  -- itself into someone else's reward. to_regclass is the safety valve: on a
  -- database that has not run the referrals section yet the signup still
  -- succeeds, it just goes unattributed.
  if to_regclass('public.referrals') is not null then
    perform public.record_referral_signup(
      new.raw_user_meta_data ->> 'ref',
      new.id
    );
  end if;

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

-- There is deliberately no insert / update / delete policy: a client has no
-- way to write a strip, only an admin through the functions below.

-- The landing page reads the bar before anyone signs in, so the select is
-- spelled out for anon instead of leaning on project defaults. RLS still
-- filters it down to the rows an admin switched on.
grant select on public.announcements to anon, authenticated;

-- Writers -------------------------------------------------------------
-- SECURITY DEFINER, so the write happens even though the table grants a
-- client nothing. EXECUTE is revoked from public and granted to
-- authenticated, and each function re-checks public.is_admin().

create or replace function public.admin_save_announcement(
  p_id uuid,
  p_title text,
  p_tone text,
  p_link_url text,
  p_link_label text,
  p_live boolean
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text := left(btrim(coalesce(p_title, '')), 140);
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'admin_save_announcement: admin only'
      using hint = 'Set role = ''admin'' on the profile row first.';
  end if;

  if v_title = '' then
    raise exception 'admin_save_announcement: the strip needs some copy'
      using errcode = '22023';
  end if;

  if coalesce(p_tone, 'info') not in ('info', 'promo', 'warn', 'critical') then
    raise exception 'admin_save_announcement: unknown tone %', p_tone
      using errcode = '22023';
  end if;

  -- p_id null inserts a new strip; an id updates that row in place, so the
  -- editor is one form for both cases.
  insert into public.announcements
    (id, title, tone, link_url, link_label, live, created_by, created_at, updated_at)
  values (
    coalesce(p_id, gen_random_uuid()),
    v_title,
    coalesce(p_tone, 'info'),
    nullif(btrim(coalesce(p_link_url, '')), ''),
    nullif(btrim(coalesce(p_link_label, '')), ''),
    coalesce(p_live, false),
    auth.uid()::text,
    now(),
    now()
  )
  on conflict (id) do update
    set title      = excluded.title,
        tone       = excluded.tone,
        link_url   = excluded.link_url,
        link_label = excluded.link_label,
        live       = excluded.live,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- Switching a strip on or off is the everyday action, so it needs no trip
-- through the editor.
create or replace function public.admin_set_announcement_live(p_id uuid, p_live boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'admin_set_announcement_live: admin only'
      using hint = 'Set role = ''admin'' on the profile row first.';
  end if;

  update public.announcements
     set live = coalesce(p_live, false), updated_at = now()
   where id = p_id;

  if not found then
    raise exception 'admin_set_announcement_live: no strip with id %', p_id
      using errcode = 'P0002';
  end if;

  return true;
end;
$$;

create or replace function public.admin_delete_announcement(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'admin_delete_announcement: admin only'
      using hint = 'Set role = ''admin'' on the profile row first.';
  end if;

  delete from public.announcements where id = p_id;

  if not found then
    raise exception 'admin_delete_announcement: no strip with id %', p_id
      using errcode = 'P0002';
  end if;

  return true;
end;
$$;

revoke all on function public.admin_save_announcement(uuid, text, text, text, text, boolean) from public;
grant execute on function public.admin_save_announcement(uuid, text, text, text, text, boolean) to authenticated;
revoke all on function public.admin_set_announcement_live(uuid, boolean) from public;
grant execute on function public.admin_set_announcement_live(uuid, boolean) to authenticated;
revoke all on function public.admin_delete_announcement(uuid) from public;
grant execute on function public.admin_delete_announcement(uuid) to authenticated;

-- =====================================================================
-- 13. IB AFFILIATE PROGRAM
--     A forex-broker style introducing-broker desk. Attribution stays the
--     callsign model: an account's referral code is its username, an invite
--     link is /register?ref=<callsign>, and the trigger in section 1 hands
--     the code to record_referral_signup() the moment the account appears.
--     The ongoing income is a rebate, not a bonus. Every Live duel burns a
--     platform fee off the pooled stakes (house_fee_pct — the same number
--     the client pot maths in src/lib/economy/config.ts uses; change both
--     or neither). A slice of that fee is paid to the upline of each player
--     at the table, at the tier's rate expressed in coins per 100 coins
--     staked: a 100-coin entry pays a Bronze IB 5 coins, every duel that
--     account fights. The IB's level rises on the count of FUNDED downline
--     — invites whose deposit was approved — and the level sets the rate
--     (5, then 7, then 10 per 100 as the arena ships).
--     Commissions never land in the game wallet directly. They accrue in
--     ib_balances, which the player empties with transfer_ib_balance(), and
--     only that write crosses the coins into the wallet under one
--     wallet_ledger row of kind 'referral', like every other money move.
--     Every number the desk touches — switch, fee, house floor, tier rates
--     and promotion thresholds — lives in ib_config and ib_tiers, and only
--     an admin edits those through the writers at the bottom of this
--     section, so the copy a player reads and the coins Postgres moves are
--     the same rows and cannot drift apart.
-- =====================================================================

-- The master row. One row, read by every function below.
create table if not exists public.ib_config (
  singleton integer primary key default 1 check (singleton = 1),
  -- The whole program's switch: while false, award_ib_commission() computes
  -- nothing and moves nothing.
  enabled boolean not null default true,
  -- Percent of the two pooled stakes the arena takes as the platform fee.
  -- Mirrors HOUSE_CUT in src/lib/economy/config.ts — change both or neither.
  house_fee_pct integer not null default 15 check (house_fee_pct between 0 and 50),
  -- Percent of every fee that must stay with the arena, so no tier an admin
  -- tunes can ever rebalance the rebate to zero house income.
  min_house_pct_of_fee integer not null default 60
    check (min_house_pct_of_fee between 0 and 100),
  updated_at timestamptz not null default now()
);

insert into public.ib_config (singleton)
values (1)
on conflict (singleton) do nothing;

-- The rebate ladder. One row per level; the active row with the highest
-- min_funded a player clears is the rate they earn.
create table if not exists public.ib_tiers (
  level integer primary key check (level between 1 and 9),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- Coins paid per 100 coins an attributed trader stakes, before the house
  -- floor trims it. Zero is a legal rate: a level that exists but pays flat.
  rate_per_100 integer not null default 0 check (rate_per_100 between 0 and 100),
  -- Funded downline needed to sit at this level. Counted from the referral
  -- rows, never from any money figure a client could shape.
  min_funded integer not null default 0 check (min_funded between 0 and 100000),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- The launch ladder: 5 coins per 100 staked, 7 from five funded invites,
-- 10 from twenty. do-nothing on conflict so an operator's edits survive a
-- re-run of this file; the rows are only ever created, never re-typed.
insert into public.ib_tiers (level, name, rate_per_100, min_funded) values
  (1, 'Bronze IB', 5, 0),
  (2, 'Silver IB', 7, 5),
  (3, 'Gold IB', 10, 20)
on conflict (level) do nothing;

-- Who invited whom. invitee_id is unique: an account can only ever be
-- attributed once, so two links pointing at the same trader pay one upline.
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_id text not null,
  invitee_id text not null unique,
  -- The callsign the link carried, kept so an admin can read an attribution
  -- back even if the invitee later renames or the row is looked at alone.
  invite_code text,
  -- Stamped the moment the downline's first deposit is approved: the count
  -- of these is the promotion metric, and nothing else raises an IB's level.
  funded_at timestamptz,
  created_at timestamptz not null default now(),
  check (inviter_id <> invitee_id)
);

-- Databases that ran the earlier bonus-shaped version already carry this
-- table; they only need the new column and the ladder rebuilt on it.
alter table public.referrals add column if not exists funded_at timestamptz;

create index if not exists idx_referrals_inviter
  on public.referrals (inviter_id, created_at desc);
create index if not exists idx_referrals_funded
  on public.referrals (inviter_id, funded_at)
  where funded_at is not null;

-- An old database that already paid the first-deposit bonus has, by
-- definition, a funded downline — carry the fact over rather than demoting
-- the inviter back a level. Guarded because a fresh schema never has the
-- retired column to read.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'referrals'
       and column_name = 'deposit_bonus_at'
  ) then
    execute 'update public.referrals
                set funded_at = deposit_bonus_at
              where funded_at is null and deposit_bonus_at is not null';
  end if;
end;
$$;

-- 'referral' joins the ledger kinds: a wallet credit of this kind is written
-- by transfer_ib_balance() and nothing else, exactly like the others.
alter table public.wallet_ledger drop constraint if exists wallet_ledger_kind_check;
alter table public.wallet_ledger
  add constraint wallet_ledger_kind_check
  check (kind in
    ('deposit', 'payout', 'payout_refund', 'adjustment', 'referral'));

-- The commission desk: what an IB has earned and not yet moved to the
-- wallet. Coins here are real but parked — no withdrawal touches them until
-- the player transfers, and only the writers below move a single one.
create table if not exists public.ib_balances (
  player_id text primary key,
  balance integer not null default 0 check (balance >= 0),
  -- What the desk has ever paid, transfer or no transfer: the lifetime
  -- figure the affiliate screen shows beside the live balance.
  lifetime_earned integer not null default 0 check (lifetime_earned >= 0),
  updated_at timestamptz not null default now()
);

-- One row per (duel, seat) that paid a rebate. The unique key is the whole
-- replay defence: however often a settling client calls the award, one
-- side's entry pays at most once, to at most one upline.
create table if not exists public.ib_earnings (
  id uuid primary key default gen_random_uuid(),
  match_id text not null check (char_length(btrim(match_id)) between 3 and 64),
  trader_id text not null,
  ib_id text not null,
  stake integer not null check (stake > 0),
  fee integer not null check (fee >= 0),
  commission integer not null check (commission >= 0),
  -- Snapshot of the ladder at the moment of payment: an admin re-typing a
  -- tier later never rewrites what a past duel actually paid.
  tier_level integer not null,
  tier_rate integer not null,
  created_at timestamptz not null default now(),
  unique (match_id, trader_id),
  check (trader_id <> ib_id)
);

create index if not exists idx_ib_earnings_ib
  on public.ib_earnings (ib_id, created_at desc);

-- Audit of the admin's hand on a desk balance. Nothing here moves coins on
-- its own; it exists so a corrected commission is traceable to who did it.
create table if not exists public.ib_adjustments (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  delta integer not null check (delta <> 0),
  note text,
  actor_id text not null,
  created_at timestamptz not null default now()
);

alter table public.referrals enable row level security;
alter table public.ib_config enable row level security;
alter table public.ib_tiers enable row level security;
alter table public.ib_balances enable row level security;
alter table public.ib_earnings enable row level security;
alter table public.ib_adjustments enable row level security;

drop policy if exists referrals_read_parties on public.referrals;
drop policy if exists ib_config_read on public.ib_config;
drop policy if exists ib_tiers_read on public.ib_tiers;
drop policy if exists ib_balances_read on public.ib_balances;
drop policy if exists ib_earnings_read on public.ib_earnings;
drop policy if exists ib_adjustments_read on public.ib_adjustments;

-- Both halves of a pairing can read the row — the inviter to count their
-- team, the invitee to see whose rebate line they sit on — and an admin
-- reads all of them. There is no insert / update / delete policy anywhere
-- in this section: the writers below own every word.
create policy referrals_read_parties
  on public.referrals for select
  using (
    auth.uid()::text = inviter_id
    or auth.uid()::text = invitee_id
    or public.is_admin()
  );

-- The terms and the ladder are the copy the affiliate screen prints, so any
-- signed-in player may read them; nobody but an admin writes them.
create policy ib_config_read
  on public.ib_config for select
  using (auth.uid() is not null);

create policy ib_tiers_read
  on public.ib_tiers for select
  using (auth.uid() is not null);

create policy ib_balances_read
  on public.ib_balances for select
  using (auth.uid()::text = player_id or public.is_admin());

create policy ib_earnings_read
  on public.ib_earnings for select
  using (auth.uid()::text = ib_id or public.is_admin());

create policy ib_adjustments_read
  on public.ib_adjustments for select
  using (public.is_admin());

grant select on public.referrals, public.ib_config, public.ib_tiers,
  public.ib_balances, public.ib_earnings, public.ib_adjustments to authenticated;

-- Writers -------------------------------------------------------------

-- Called from handle_new_user(), never from the browser: EXECUTE stays with the
-- owner and the auth.uid() guard inside refuses an API call outright, so no
-- client can attribute an account of its choosing. The row it writes pays
-- nothing by itself — it is the line the rebate below is measured against.
create or replace function public.record_referral_signup(
  p_code text,
  p_invitee uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_inviter text;
  v_id uuid;
begin
  -- Trigger-only. The signup trigger runs with no request JWT attached, so an
  -- `auth.uid()` that is set means somebody called this over the API instead of
  -- the account appearing — which is exactly how a free desk would be farmed.
  if auth.uid() is not null then
    return false;
  end if;

  if p_invitee is null or v_code = '' then
    return false;
  end if;

  -- The code is a callsign, so a link that named nobody simply pairs nobody.
  select id::text into v_inviter
    from public.profiles
   where username = v_code
   limit 1;

  if v_inviter is null or v_inviter = p_invitee::text then
    return false;
  end if;

  insert into public.referrals (inviter_id, invitee_id, invite_code)
  values (v_inviter, p_invitee::text, v_code)
  on conflict (invitee_id) do nothing
  returning id into v_id;

  -- The unique invitee_id is the whole anti-duplication story: this account is
  -- already attributed somewhere else, so a second link changes nothing.
  return v_id is not null;
end;
$$;

revoke all on function public.record_referral_signup(text, uuid) from public;

-- The funded marker runs as a trigger rather than inside approve_crypto_deposit()
-- for the same reason the mailbox does: it fires on the row flipping to `paid`,
-- so it sees every approval path — including one a future build adds — without
-- that path having to remember to promote anyone. It stamps the pairing only:
-- no coin moves here, the ladder the award reads is measured off these stamps.
create or replace function public.ib_mark_funded()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'paid' then
    return new;
  end if;

  -- First approved deposit only: the `is null` guard means a second, larger
  -- deposit re-stamps nothing and an IB never re-clears a threshold early.
  update public.referrals
     set funded_at = coalesce(new.reviewed_at, now())
   where invitee_id = new.player_id
     and funded_at is null;

  return new;
end;
$$;

revoke all on function public.ib_mark_funded() from public;

drop trigger if exists trg_crypto_deposits_referral on public.crypto_deposits;
drop trigger if exists trg_crypto_deposits_ib_funded on public.crypto_deposits;
create trigger trg_crypto_deposits_ib_funded
  after update of status on public.crypto_deposits
  for each row execute function public.ib_mark_funded();

drop function if exists public.referral_on_deposit_paid();

-- The rebate itself. The settling client of each seat calls this with the
-- duel id and that player's own entry; everything else — who is upline, what
-- tier they sit at, what the fee was, what the house floor leaves — is decided
-- here, from the rows Postgres already holds. The caller can name nothing but
-- its own stake, and the (match_id, trader_id) key makes a second call pay 0.
create or replace function public.award_ib_commission(p_match_id text, p_stake integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trader text := auth.uid()::text;
  v_cfg public.ib_config%rowtype;
  v_upline text;
  v_level integer;
  v_rate integer;
  v_fee integer;
  v_commission integer;
  v_max_ib integer;
  v_id uuid;
begin
  if v_trader is null
     or p_match_id is null
     or char_length(btrim(p_match_id)) not between 3 and 64 then
    return 0;
  end if;

  -- Live entries only: the arena's tickets start at 100 and run up to whatever
  -- a wallet can cover (no house ceiling on a challenge). Anything outside a
  -- sane band is a bug or a probe, and neither is worth a coin.
  if coalesce(p_stake, 0) < 100 or p_stake > 1000000 then
    return 0;
  end if;

  select * into v_cfg from public.ib_config where singleton = 1;
  if not found or not v_cfg.enabled then
    return 0;
  end if;

  select inviter_id into v_upline
    from public.referrals
   where invitee_id = v_trader;
  if v_upline is null then
    return 0;
  end if;

  -- The ladder is read here, not trusted from the client: highest active
  -- tier whose funded-downline threshold the upline clears.
  select t.level, t.rate_per_100 into v_level, v_rate
    from public.ib_tiers t
   where t.active
     and t.min_funded <= (
       select count(*)
         from public.referrals
        where inviter_id = v_upline
          and funded_at is not null
     )
   order by t.min_funded desc, t.level desc
   limit 1;
  if not found then
    return 0;
  end if;

  v_fee := floor(2 * p_stake * v_cfg.house_fee_pct / 100.0)::int;
  v_commission := floor(p_stake * v_rate / 100.0)::int;
  -- The house floor outlives any tier an admin types: the rebate is trimmed
  -- until at least min_house_pct_of_fee of this duel's fee stays upstairs.
  v_max_ib := floor(v_fee * (100 - v_cfg.min_house_pct_of_fee) / 100.0)::int;
  v_commission := greatest(0, least(v_commission, v_max_ib));

  insert into public.ib_earnings
    (match_id, trader_id, ib_id, stake, fee, commission, tier_level, tier_rate)
  values (btrim(p_match_id), v_trader, v_upline, p_stake, v_fee,
          v_commission, v_level, v_rate)
  on conflict (match_id, trader_id) do nothing
  returning id into v_id;

  if v_id is null then
    return 0;
  end if;

  if v_commission > 0 then
    insert into public.ib_balances (player_id, balance, lifetime_earned, updated_at)
    values (v_upline, v_commission, v_commission, now())
    on conflict (player_id) do update
      set balance         = public.ib_balances.balance + v_commission,
          lifetime_earned = public.ib_balances.lifetime_earned + v_commission,
          updated_at      = now();
  end if;

  return v_commission;
end;
$$;

revoke all on function public.award_ib_commission(text, integer) from public;
grant execute on function public.award_ib_commission(text, integer) to authenticated;

-- The one door out of the desk and into the wallet. The player owns the move:
-- the coins leave ib_balances, land in player_balances, and the trip is
-- booked once to the wallet ledger as kind 'referral'. From there the normal
-- reviewed crypto-withdrawal flow pays them out like any other coin — an IB
-- never withdraws commissions directly, which keeps one money path for audit.
create or replace function public.transfer_ib_balance()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player text := auth.uid()::text;
  v_amt integer;
begin
  if v_player is null then
    return 0;
  end if;

  -- Lock the desk row: two tabs pressing Transfer at the same moment move
  -- the coins once, not twice.
  select balance into v_amt
    from public.ib_balances
   where player_id = v_player
   for update;

  if v_amt is null or v_amt <= 0 then
    return 0;
  end if;

  update public.ib_balances
     set balance = 0, updated_at = now()
   where player_id = v_player;

  insert into public.player_balances (player_id, virtual_balance, updated_at)
  values (v_player, v_amt, now())
  on conflict (player_id) do update
    set virtual_balance = public.player_balances.virtual_balance + v_amt,
        updated_at      = now();

  perform public.record_ledger(
    v_player, 'referral', v_amt,
    'IB commission transfer to wallet',
    'ib_transfer', 'transfer:' || extract(epoch from now())::bigint::text
  );

  return v_amt;
end;
$$;

revoke all on function public.transfer_ib_balance() from public;
grant execute on function public.transfer_ib_balance() to authenticated;

-- What the desk looks like to the one player who owns it — the tier line,
-- the funded count it was measured from, and the next rung. Reads through the
-- definer so the pairings behind the count stay invisible to everyone else.
create or replace function public.ib_tier_for(p_player text)
returns table (
  level integer,
  tier_name text,
  rate_per_100 integer,
  funded_referrals bigint,
  next_level integer,
  next_min_funded integer,
  need_for_next bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_funded bigint;
begin
  if p_player is null
     or (auth.uid()::text <> p_player and not public.is_admin()) then
    return;
  end if;

  select count(*) into v_funded
    from public.referrals
   where inviter_id = p_player
     and funded_at is not null;

  return query
  with here_tier as (
    select t.level, t.name, t.rate_per_100
      from public.ib_tiers t
     where t.active and t.min_funded <= v_funded
     order by t.min_funded desc, t.level desc
     limit 1
  ), next_tier as (
    select t.level, t.min_funded
      from public.ib_tiers t
     where t.active and t.min_funded > v_funded
     order by t.min_funded asc, t.level asc
     limit 1
  )
  select c.level,
         c.name,
         c.rate_per_100,
         v_funded,
         n.level,
         n.min_funded,
         greatest(0, coalesce(n.min_funded, 0)::bigint - v_funded)
    from here_tier c
    left join next_tier n on true;
end;
$$;

revoke all on function public.ib_tier_for(text) from public;
grant execute on function public.ib_tier_for(text) to authenticated;

-- The rebate ladder, counted by the database instead of handed out as raw
-- rows: a player sees the league table — team size, funded heads, commission
-- ever paid — without being able to read anybody else's pairings or desks.
-- The shape changed with the IB rebuild, so the old signature goes first:
-- Postgres refuses to alter a return type in place.
drop function if exists public.referral_leaderboard(integer);
create or replace function public.referral_leaderboard(p_limit integer default 10)
returns table (callsign text, invites bigint, funded bigint, coins bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select p.username,
         s.invites,
         s.funded,
         coalesce(e.coins, 0)::bigint
    from (
      select r.inviter_id,
             count(*)::bigint as invites,
             count(r.funded_at)::bigint as funded
        from public.referrals r
       group by r.inviter_id
    ) s
    join public.profiles p on p.id::text = s.inviter_id
    left join (
      select e.ib_id, sum(e.commission) as coins
        from public.ib_earnings e
       group by e.ib_id
    ) e on e.ib_id = s.inviter_id
   order by coalesce(e.coins, 0) desc, s.funded desc, s.invites desc
   limit greatest(1, least(coalesce(p_limit, 10), 50));
end;
$$;

revoke all on function public.referral_leaderboard(integer) from public;
grant execute on function public.referral_leaderboard(integer) to authenticated;

-- Admin writers --------------------------------------------------------
-- SECURITY DEFINER, EXECUTE revoked from public and granted to
-- authenticated, and each one re-checks public.is_admin() first — the same
-- shape the announcement console uses. These are the only doors that let a
-- human retune the program; everything player-side is read-only or the two
-- fixed actions above.

create or replace function public.admin_save_ib_config(
  p_enabled boolean,
  p_house_fee_pct integer,
  p_min_house_pct integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'admin_save_ib_config: admin only'
      using hint = 'Set role = ''admin'' on the profile row first.';
  end if;

  update public.ib_config
     set enabled = coalesce(p_enabled, enabled),
         house_fee_pct = coalesce(p_house_fee_pct, house_fee_pct),
         min_house_pct_of_fee = coalesce(p_min_house_pct, min_house_pct_of_fee),
         updated_at = now()
   where singleton = 1;

  if not found then
    insert into public.ib_config (singleton, enabled, house_fee_pct, min_house_pct_of_fee)
    values (1, coalesce(p_enabled, true), coalesce(p_house_fee_pct, 15),
            coalesce(p_min_house_pct, 60))
    on conflict (singleton) do nothing;
  end if;

  return true;
end;
$$;

-- One row of the ladder at a time. Levels are 1..9 and the checks on the
-- table do the clamping, so a fat-fingered rate cannot silently out-earn the
-- house: award_ib_commission() still trims every payment against the floor.
create or replace function public.admin_save_ib_tier(
  p_level integer,
  p_name text,
  p_rate integer,
  p_min_funded integer,
  p_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := left(btrim(coalesce(p_name, '')), 40);
begin
  if not public.is_admin() then
    raise exception 'admin_save_ib_tier: admin only'
      using hint = 'Set role = ''admin'' on the profile row first.';
  end if;

  if p_level is null or p_level not between 1 and 9 then
    raise exception 'admin_save_ib_tier: levels run 1 to 9'
      using errcode = '22023';
  end if;

  if v_name = '' then
    raise exception 'admin_save_ib_tier: the rung needs a name'
      using errcode = '22023';
  end if;

  insert into public.ib_tiers (level, name, rate_per_100, min_funded, active, updated_at)
  values (p_level, v_name, coalesce(p_rate, 0), coalesce(p_min_funded, 0),
          coalesce(p_active, true), now())
  on conflict (level) do update
    set name         = excluded.name,
        rate_per_100 = excluded.rate_per_100,
        min_funded   = excluded.min_funded,
        active       = excluded.active,
        updated_at   = now();

  return true;
end;
$$;

-- History keeps its tier_level ints, so retiring a rung never strands the
-- earnings rows already paid at it.
create or replace function public.admin_delete_ib_tier(p_level integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'admin_delete_ib_tier: admin only'
      using hint = 'Set role = ''admin'' on the profile row first.';
  end if;

  delete from public.ib_tiers where level = p_level;

  if not found then
    raise exception 'admin_delete_ib_tier: no rung at level %', p_level
      using errcode = 'P0002';
  end if;

  return true;
end;
$$;

-- The operator's hand on a desk: a credit when the arena owes a commission
-- it failed to pay, a debit when one was paid that should not have been.
-- Credits raise lifetime earnings too — money the desk genuinely made;
-- debits claw the parked balance back and leave the lifetime record alone.
-- Every move writes one ib_adjustments row with the admin behind it.
create or replace function public.admin_adjust_ib_balance(
  p_player_id text,
  p_delta integer,
  p_note text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player text := btrim(coalesce(p_player_id, ''));
  v_balance integer;
begin
  if not public.is_admin() then
    raise exception 'admin_adjust_ib_balance: admin only'
      using hint = 'Set role = ''admin'' on the profile row first.';
  end if;

  if v_player = '' or coalesce(p_delta, 0) = 0 then
    raise exception 'admin_adjust_ib_balance: a player and a non-zero delta are required'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id::text = v_player) then
    raise exception 'admin_adjust_ib_balance: no such player %', v_player
      using errcode = 'P0002';
  end if;

  insert into public.ib_balances (player_id, balance, lifetime_earned, updated_at)
  values (v_player, greatest(0, p_delta), greatest(0, p_delta), now())
  on conflict (player_id) do update
    set balance = greatest(0, public.ib_balances.balance + p_delta),
        lifetime_earned = case when p_delta > 0
          then public.ib_balances.lifetime_earned + p_delta
          else public.ib_balances.lifetime_earned end,
        updated_at = now();

  select balance into v_balance from public.ib_balances where player_id = v_player;

  insert into public.ib_adjustments (player_id, delta, note, actor_id)
  values (v_player, p_delta,
          nullif(btrim(coalesce(p_note, '')), ''),
          coalesce(auth.uid()::text, 'system'));

  return v_balance;
end;
$$;

revoke all on function public.admin_save_ib_config(boolean, integer, integer) from public;
grant execute on function public.admin_save_ib_config(boolean, integer, integer) to authenticated;
revoke all on function public.admin_save_ib_tier(integer, text, integer, integer, boolean) from public;
grant execute on function public.admin_save_ib_tier(integer, text, integer, integer, boolean) to authenticated;
revoke all on function public.admin_delete_ib_tier(integer) from public;
grant execute on function public.admin_delete_ib_tier(integer) to authenticated;
revoke all on function public.admin_adjust_ib_balance(text, integer, text) from public;
grant execute on function public.admin_adjust_ib_balance(text, integer, text) to authenticated;

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
-- The bonus-shaped desk this program replaced: the config table goes, and
-- the pairing rows in referrals stay — they are the attribution, not a payout.
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
  'The coin wallet: bought by crypto deposit, spent on Live entries, topped up by pot payouts and rewards.';

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
--      and proname in ('approve_crypto_deposit','reject_crypto_deposit',
--                      'request_crypto_withdraw','approve_crypto_withdraw',
--                      'reject_crypto_withdraw','is_admin','handle_new_user',
--                      'admin_adjust_coins','admin_set_player_status',
--                      'record_ledger','admin_save_announcement',
--                      'admin_set_announcement_live',
--                      'admin_delete_announcement','record_referral_signup',
--                      'ib_mark_funded','ib_tier_for','award_ib_commission',
--                      'transfer_ib_balance','referral_leaderboard',
--                      'admin_save_ib_config','admin_save_ib_tier',
--                      'admin_delete_ib_tier','admin_adjust_ib_balance');
-- =====================================================================
