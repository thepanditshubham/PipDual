-- ====================================================================
-- PIP DUEL — PROGRESS SYSTEM
-- Level/XP, rank (RP), missions, achievements, career stats, seasons
-- Apply with: Supabase Dashboard → SQL Editor → paste, or `supabase db push`
-- ====================================================================

-- 1. Seasons ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seasons (
  id TEXT PRIMARY KEY,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reset_factor NUMERIC NOT NULL DEFAULT 0.6,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.seasons (id, starts_at, ends_at, reset_factor)
VALUES ('S1', '2026-10-05T00:00:00+05:30', '2026-11-30T00:00:00+05:30', 0.6)
ON CONFLICT (id) DO NOTHING;

-- 2. Player progress (XP meter) -------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_progress (
  user_id TEXT PRIMARY KEY,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  season_pass_xp INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_login_date TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Rank state (RP ladder) -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.rank_state (
  user_id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL DEFAULT 'S1',
  rp INTEGER NOT NULL DEFAULT 0,
  peak_rp INTEGER NOT NULL DEFAULT 0,
  highest_tier TEXT NOT NULL DEFAULT 'Bronze',
  placement_played INTEGER NOT NULL DEFAULT 0,
  placement_wins INTEGER NOT NULL DEFAULT 0,
  placement_target INTEGER NOT NULL DEFAULT 5,
  shield_matches INTEGER NOT NULL DEFAULT 0,
  weekly_rp INTEGER NOT NULL DEFAULT 0,
  weekly_key TEXT,
  last_ranked_at TIMESTAMPTZ,
  last_decay_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Match results (one row per player per match, idempotent) --------------
CREATE TABLE IF NOT EXISTS public.match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('ranked', 'friendly', 'practice')),
  pair TEXT NOT NULL DEFAULT 'XAU/USD',
  duration INTEGER NOT NULL,
  pips NUMERIC,
  result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
  rp_delta INTEGER NOT NULL DEFAULT 0,
  xp_delta INTEGER NOT NULL DEFAULT 0,
  coins_delta INTEGER NOT NULL DEFAULT 0,
  discipline_score INTEGER NOT NULL DEFAULT 0,
  pip_margin NUMERIC DEFAULT 0,
  opponent_rp INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS match_results_user_time_idx
  ON public.match_results (user_id, created_at DESC);

-- 5. Trade events (raw material for discipline + Trader DNA) ---------------
CREATE TABLE IF NOT EXISTS public.trade_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  side TEXT NOT NULL,
  lot INTEGER NOT NULL,
  entry_ts NUMERIC NOT NULL,
  exit_ts NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC NOT NULL,
  sl NUMERIC,
  tp NUMERIC,
  sl_moved BOOLEAN DEFAULT FALSE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trade_events_match_idx ON public.trade_events (match_id, user_id);

-- 6. Missions --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.missions_catalog (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('daily', 'weekly')),
  title TEXT NOT NULL,
  description TEXT,
  metric TEXT NOT NULL,
  target INTEGER NOT NULL,
  reward_xp INTEGER NOT NULL DEFAULT 0,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.user_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  mission_id TEXT NOT NULL REFERENCES public.missions_catalog(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  UNIQUE (user_id, mission_id, period_key)
);

CREATE INDEX IF NOT EXISTS user_missions_period_idx ON public.user_missions (user_id, period_key);

-- 7. Achievements ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.achievements_catalog (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  metric TEXT NOT NULL,
  bronze_target INTEGER NOT NULL,
  silver_target INTEGER NOT NULL,
  gold_target INTEGER NOT NULL,
  reward_bronze INTEGER NOT NULL DEFAULT 20,
  reward_silver INTEGER NOT NULL DEFAULT 50,
  reward_gold INTEGER NOT NULL DEFAULT 100,
  title_unlock TEXT,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL REFERENCES public.achievements_catalog(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0,
  unlocked_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  UNIQUE (user_id, achievement_id)
);

-- 8. Behaviour tags --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.behavior_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS behavior_tags_match_idx ON public.behavior_tags (match_id, user_id);

-- 9. Leaderboard snapshots (5-minute cached boards) ------------------------
CREATE TABLE IF NOT EXISTS public.leaderboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  season_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  score NUMERIC NOT NULL,
  taken_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leaderboard_snapshots_board_idx
  ON public.leaderboard_snapshots (board, scope, season_id, rank);

-- 10. Catalogs seed --------------------------------------------------------
INSERT INTO public.missions_catalog (id, type, title, description, metric, target, reward_xp, reward_coins)
VALUES
  ('daily_play_3', 'daily', 'Play 3 matches', 'Any mode counts — practice included.', 'matches_played', 3, 60, 0),
  ('daily_sl_always', 'daily', 'Use a stop loss in every trade of a match', 'Risk control is the fastest route to consistency.', 'sl_match', 1, 80, 0),
  ('daily_gold_win', 'daily', 'Win a Gold (XAU/USD) duel', 'Take a ranked victory on spot gold.', 'gold_wins', 1, 0, 30),
  ('daily_patience', 'daily', 'Finish a match with 2 or fewer trades', 'Reward patience, not screen time.', 'low_trade_match', 1, 50, 0),
  ('daily_ranked_5m', 'daily', 'Win a 5m ranked duel', 'The shortest format still demands a plan.', 'ranked_5m_wins', 1, 60, 0),
  ('daily_discipline', 'daily', 'Score 70+ Discipline in a match', 'Process over outcome.', 'discipline_70', 1, 0, 40),
  ('weekly_ranked_wins', 'weekly', 'Win 10 ranked duels', 'The weekly ladder grind.', 'ranked_wins', 10, 300, 100),
  ('weekly_discipline', 'weekly', 'Discipline score 70+ in 5 matches', 'Consistency across the week.', 'discipline_70', 5, 250, 0),
  ('weekly_volume', 'weekly', 'Play 20 matches', 'Volume builds the habit.', 'matches_played', 20, 150, 100)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  metric = EXCLUDED.metric,
  target = EXCLUDED.target,
  reward_xp = EXCLUDED.reward_xp,
  reward_coins = EXCLUDED.reward_coins;

INSERT INTO public.achievements_catalog
  (id, category, name, description, metric, bronze_target, silver_target, gold_target,
   reward_bronze, reward_silver, reward_gold, title_unlock, hidden)
VALUES
  ('sniper', 'Skill', 'Sniper', 'Win a duel with 3 trades, all above +20 pips.', 'sniper', 1, 5, 25, 20, 50, 100, 'The Scalper', FALSE),
  ('comeback_king', 'Skill', 'Comeback King', 'Win after being 100 pips behind.', 'comeback', 1, 3, 10, 20, 50, 100, 'Comeback King', FALSE),
  ('no_revenge', 'Discipline', 'No Revenge', 'Wait 30s after a loss before the next trade.', 'no_revenge', 10, 50, 200, 20, 50, 100, NULL, FALSE),
  ('sl_always', 'Discipline', 'SL Always', 'Stop loss on every trade in a match.', 'sl_always', 5, 25, 100, 20, 50, 100, 'Risk Manager', FALSE),
  ('hot_streak', 'Streak', 'Hot Streak', 'Consecutive ranked wins.', 'hot_streak', 3, 5, 10, 20, 50, 100, 'Streak Hunter', FALSE),
  ('gold_master', 'Mastery', 'Gold Master', 'Wins on XAU/USD.', 'gold_master', 10, 50, 200, 20, 50, 100, 'Gold Standard', FALSE),
  ('perfect_pip', 'Hidden', 'Photo Finish', 'Win a duel by exactly 1.0 pip.', 'perfect_pip', 1, 1, 1, 0, 0, 100, 'Photo Finish', TRUE),
  ('nemesis', 'Rivalry', 'Nemesis', 'Beat the same player 5 times.', 'nemesis', 1, 3, 10, 20, 50, 100, 'Nemesis', FALSE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  bronze_target = EXCLUDED.bronze_target,
  silver_target = EXCLUDED.silver_target,
  gold_target = EXCLUDED.gold_target,
  title_unlock = EXCLUDED.title_unlock;

-- 11. Leaderboard view -----------------------------------------------------
CREATE OR REPLACE VIEW public.progress_leaderboard
WITH (security_invoker = true) AS
SELECT
  p.id::text AS user_id,
  p.username,
  p.display_name,
  p.country,
  r.season_id,
  r.rp,
  r.weekly_rp AS week_rp,
  r.placement_played,
  COALESCE(stats.matches, 0) AS matches,
  COALESCE(stats.wins, 0) AS wins
FROM public.profiles p
JOIN public.rank_state r ON r.user_id = p.id::text
LEFT JOIN (
  SELECT user_id,
         COUNT(*) FILTER (WHERE mode = 'ranked') AS matches,
         COUNT(*) FILTER (WHERE result = 'win') AS wins
  FROM public.match_results
  GROUP BY user_id
) stats ON stats.user_id = p.id::text
WHERE r.placement_played >= r.placement_target;

-- 12. League table for weekly boards (kept separate so season rows stay) --
CREATE OR REPLACE VIEW public.progress_weekly_leaderboard
WITH (security_invoker = true) AS
SELECT
  p.id::text AS user_id,
  p.username,
  p.display_name,
  p.country,
  r.weekly_key,
  r.weekly_rp
FROM public.profiles p
JOIN public.rank_state r ON r.user_id = p.id::text
WHERE r.weekly_key IS NOT NULL;

-- 13. Row level security ---------------------------------------------------
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rank_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.behavior_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Seasons are public" ON public.seasons;
CREATE POLICY "Seasons are public" ON public.seasons FOR SELECT USING (true);

DROP POLICY IF EXISTS "Mission catalog is public" ON public.missions_catalog;
CREATE POLICY "Mission catalog is public" ON public.missions_catalog FOR SELECT USING (true);

DROP POLICY IF EXISTS "Achievement catalog is public" ON public.achievements_catalog;
CREATE POLICY "Achievement catalog is public" ON public.achievements_catalog FOR SELECT USING (true);

DROP POLICY IF EXISTS "Leaderboard snapshots are public" ON public.leaderboard_snapshots;
CREATE POLICY "Leaderboard snapshots are public" ON public.leaderboard_snapshots FOR SELECT USING (true);

-- Players read and write only their own progress rows.
DROP POLICY IF EXISTS "Own progress" ON public.player_progress;
CREATE POLICY "Own progress" ON public.player_progress
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Own rank" ON public.rank_state;
CREATE POLICY "Own rank" ON public.rank_state
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Own match results" ON public.match_results;
CREATE POLICY "Own match results" ON public.match_results
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Own trade events" ON public.trade_events;
CREATE POLICY "Own trade events" ON public.trade_events
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Own mission rows" ON public.user_missions;
CREATE POLICY "Own mission rows" ON public.user_missions
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Own achievement rows" ON public.user_achievements;
CREATE POLICY "Own achievement rows" ON public.user_achievements
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Own behavior tags" ON public.behavior_tags;
CREATE POLICY "Own behavior tags" ON public.behavior_tags
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

-- ====================================================================
-- End of progress schema.
-- Coins keep living in public.player_balances (wallet) — progress rows
-- only track XP, RP and mission/achievement state.
-- ====================================================================
