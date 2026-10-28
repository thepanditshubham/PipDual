-- ============================================================
-- PIP DUEL  ·  Friends Schema
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor)
-- ============================================================

-- 1. Friend requests & friendships
--    One row per pair. player ids are TEXT so guest sessions and
--    registered auth uuids can live in the same table.
CREATE TABLE IF NOT EXISTS public.player_friends (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  TEXT NOT NULL,
  addressee_id  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (requester_id <> addressee_id),
  UNIQUE (requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_player_friends_requester ON public.player_friends (requester_id);
CREATE INDEX IF NOT EXISTS idx_player_friends_addressee ON public.player_friends (addressee_id);

-- 2. Row-Level Security
--    The browser client uses the anon key without a Supabase auth session,
--    so the policies mirror the shop tables (permissive, app-level ownership).
ALTER TABLE public.player_friends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friends_read"   ON public.player_friends;
DROP POLICY IF EXISTS "friends_insert" ON public.player_friends;
DROP POLICY IF EXISTS "friends_update" ON public.player_friends;
DROP POLICY IF EXISTS "friends_delete" ON public.player_friends;

CREATE POLICY "friends_read"   ON public.player_friends FOR SELECT USING (TRUE);
CREATE POLICY "friends_insert" ON public.player_friends FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "friends_update" ON public.player_friends FOR UPDATE USING (TRUE);
CREATE POLICY "friends_delete" ON public.player_friends FOR DELETE USING (TRUE);

-- 3. Keep updated_at honest on accept / re-request
CREATE OR REPLACE FUNCTION public.touch_player_friends()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_player_friends_touch ON public.player_friends;
CREATE TRIGGER trg_player_friends_touch
  BEFORE UPDATE ON public.player_friends
  FOR EACH ROW EXECUTE FUNCTION public.touch_player_friends();
