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
