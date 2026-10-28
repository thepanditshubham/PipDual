-- ====================================================================
-- Pip Duel Database Schema & RLS Migrations
-- Virtual Trading Battles by Forexwala
-- ====================================================================

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL CHECK (username ~ '^[a-z0-9_]{3,16}$'),
  display_name TEXT,
  avatar_url TEXT,
  country TEXT DEFAULT 'IN',
  language TEXT DEFAULT 'en',
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  rating INT DEFAULT 1200,
  risk_rating INT DEFAULT 1200,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Market Segments Table
CREATE TABLE IF NOT EXISTS public.segments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  asset TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  ticks JSONB NOT NULL,
  source TEXT DEFAULT 'synthetic',
  license_note TEXT DEFAULT 'Virtual money only. Educational use.',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Matches Table
CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room TEXT NOT NULL,
  seed BIGINT NOT NULL,
  segment_id TEXT REFERENCES public.segments(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('standard', 'risk')),
  p1 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  p2 UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  p2_is_bot BOOLEAN DEFAULT false,
  p1_score NUMERIC,
  p2_score NUMERIC,
  winner UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'finished', 'forfeit', 'disputed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Match Actions Table (Anti-cheat & Replay verification)
CREATE TABLE IF NOT EXISTS public.match_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, player)
);

-- 5. Ratings History Table
CREATE TABLE IF NOT EXISTS public.ratings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  before_rating INT NOT NULL,
  after_rating INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Match Flags Table (Flagged suspicious/cheating matches)
CREATE TABLE IF NOT EXISTS public.match_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Views for Leaderboard
CREATE OR REPLACE VIEW public.leaderboard_all AS
SELECT 
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.rating,
  p.risk_rating,
  COUNT(m.id) AS total_duels,
  COUNT(CASE WHEN m.winner = p.id THEN 1 END) AS wins,
  COUNT(CASE WHEN m.winner IS NOT NULL AND m.winner != p.id THEN 1 END) AS losses,
  ROUND(
    CASE 
      WHEN COUNT(m.id) > 0 
      THEN (COUNT(CASE WHEN m.winner = p.id THEN 1 END)::NUMERIC / COUNT(m.id)::NUMERIC) * 100 
      ELSE 0 
    END, 1
  ) AS win_rate
FROM public.profiles p
LEFT JOIN public.matches m ON (m.p1 = p.id OR m.p2 = p.id) AND m.status = 'finished'
WHERE m.id IS NULL OR m.id NOT IN (SELECT match_id FROM public.match_flags)
GROUP BY p.id, p.username, p.display_name, p.avatar_url, p.rating, p.risk_rating
ORDER BY p.rating DESC;

CREATE OR REPLACE VIEW public.leaderboard_weekly AS
SELECT 
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.rating,
  p.risk_rating,
  COUNT(m.id) AS total_duels,
  COUNT(CASE WHEN m.winner = p.id THEN 1 END) AS wins
FROM public.profiles p
JOIN public.matches m ON (m.p1 = p.id OR m.p2 = p.id) AND m.status = 'finished'
WHERE m.created_at >= NOW() - INTERVAL '7 days'
  AND m.id NOT IN (SELECT match_id FROM public.match_flags)
GROUP BY p.id, p.username, p.display_name, p.avatar_url, p.rating, p.risk_rating
ORDER BY wins DESC, p.rating DESC;

CREATE OR REPLACE VIEW public.leaderboard_daily AS
SELECT 
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.rating,
  p.risk_rating,
  COUNT(m.id) AS total_duels,
  COUNT(CASE WHEN m.winner = p.id THEN 1 END) AS wins
FROM public.profiles p
JOIN public.matches m ON (m.p1 = p.id OR m.p2 = p.id) AND m.status = 'finished'
WHERE m.created_at >= NOW() - INTERVAL '24 hours'
  AND m.id NOT IN (SELECT match_id FROM public.match_flags)
GROUP BY p.id, p.username, p.display_name, p.avatar_url, p.rating, p.risk_rating
ORDER BY wins DESC, p.rating DESC;

-- 8. Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_flags ENABLE ROW LEVEL SECURITY;

-- Profiles: Anyone can view public profiles. Users can update only their own profile.
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Segments: Anyone can read enabled segments. Only admin can insert/update.
CREATE POLICY "Enabled segments are viewable by everyone" ON public.segments
  FOR SELECT USING (enabled = true);

CREATE POLICY "Admins can manage segments" ON public.segments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Matches: Everyone can view finished matches.
CREATE POLICY "Matches viewable by players or public if finished" ON public.matches
  FOR SELECT USING (status = 'finished' OR p1 = auth.uid() OR p2 = auth.uid());

-- Match writing restricted to service role (server API)
-- Match actions viewable by participants
CREATE POLICY "Match actions viewable by match participants" ON public.match_actions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.matches WHERE id = match_id AND (p1 = auth.uid() OR p2 = auth.uid()))
  );

-- 9. Trigger on Auth User Created to insert Profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', 'trader_' || substring(new.id::text, 1, 6)),
    COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', 'Trader'),
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
