-- ============================================================
-- PIP DUEL - Profile frames: artwork catalogue + starter frame
-- Apply after 20261029090000_store_system.sql.
--
-- Frames stopped being CSS colours and became real artwork: one
-- transparent PNG per item at public/frames/<id>.png, cut out by
-- scripts/crop-frames.mjs, ids owned by src/lib/shop/catalog.ts.
--
-- Every account now leaves onboarding already wearing the Copper
-- Standard, so the equipped frame has to exist server-side as well as
-- in the browser store: the profile column says what is worn, the
-- inventory rows say that it was granted rather than bought.
-- ============================================================

-- 1. Frame state on the profile -------------------------------
-- The login page reads both columns; before this they silently fell
-- back to 'default' in the client.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_frame TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS owned_frames TEXT[] NOT NULL DEFAULT ARRAY['default']::TEXT[];

COMMENT ON COLUMN public.profiles.avatar_frame IS
  'Catalogue id of the equipped frame; art ships at public/frames/<id>.png.';

-- 2. Starter frame grant --------------------------------------
CREATE OR REPLACE FUNCTION public.grant_starter_frame()
RETURNS trigger AS $$
BEGIN
  -- Legacy mirror the lobby still reads.
  INSERT INTO public.player_inventory (player_id, item_id, equipped)
  VALUES (NEW.id::TEXT, 'default', TRUE)
  ON CONFLICT (player_id, item_id) DO NOTHING;

  -- Store System inventory (spec 11), same row in the new shape.
  INSERT INTO public.inventory (user_id, item_id, acquired_via, equipped)
  VALUES (NEW.id::TEXT, 'default', 'grant', TRUE)
  ON CONFLICT (user_id, item_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_profiles_starter_frame ON public.profiles;
CREATE TRIGGER trg_profiles_starter_frame
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.grant_starter_frame();

-- 3. Backfill accounts created before the frame system --------
UPDATE public.profiles
SET avatar_frame = 'default'
WHERE avatar_frame IS NULL OR avatar_frame = '';

INSERT INTO public.player_inventory (player_id, item_id, equipped)
SELECT p.id::TEXT, 'default', TRUE FROM public.profiles p
ON CONFLICT (player_id, item_id) DO NOTHING;

INSERT INTO public.inventory (user_id, item_id, acquired_via, equipped)
SELECT p.id::TEXT, 'default', 'grant', TRUE FROM public.profiles p
ON CONFLICT (user_id, item_id) DO NOTHING;

-- 4. Frame art in the server-side catalogue mirror ------------
-- store_items exists so the server can validate what the client sells.
-- Only the frames that ship artwork are listed; the CSS-only legacy ids
-- stay client-side until the catalogue is generated from one source.

INSERT INTO public.store_items (id, name, slot, rarity, description, price_coins, price_gems, starter)
VALUES
  ('default',                'Copper Standard',   'frame', 'common',    'Plain burnished copper ring, worn from sign-up.', NULL,   NULL,   TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.store_items (id, name, slot, rarity, price_coins, price_gems)
VALUES
  ('frame_rose',             'Rose Gold Sigil',   'frame', 'rare',      150,  60),
  ('frame_amethyst',         'Amethyst Wings',    'frame', 'epic',      400, 150),
  ('frame_chrome',           'Chrome Sentinel',   'frame', 'epic',      400, 150),
  ('frame_solar',            'Solar Flame',       'frame', 'legendary', 1000, 300),
  ('frame_regalia',          'Royal Regalia',     'frame', 'legendary', 1000, 300),
  ('frame_sterling_wings',   'Sterling Wings',    'frame', 'rare',      150,  60),
  ('frame_sterling_crest',   'Sterling Crest',    'frame', 'rare',      150,  60),
  ('frame_sterling_ram',     'Sterling Ram',      'frame', 'rare',      150,  60),
  ('frame_sterling_flare',   'Sterling Flare',    'frame', 'epic',      400, 150),
  ('frame_sterling_sweep',   'Sterling Sweep',    'frame', 'epic',      400, 150),
  ('frame_sterling_band',    'Sterling Band',     'frame', 'epic',      400, 150),
  ('frame_bullion_wings',    'Bullion Wings',     'frame', 'epic',      400, 150),
  ('frame_bullion_flare',    'Bullion Flare',     'frame', 'epic',      400, 150),
  ('frame_bullion_ram',      'Bullion Ram',       'frame', 'epic',      400, 150),
  ('frame_bullion_crest',    'Bullion Crest',     'frame', 'legendary', 1000, 300),
  ('frame_bullion_sweep',    'Bullion Sweep',     'frame', 'legendary', 1000, 300),
  ('frame_bullion_band',     'Bullion Band',      'frame', 'legendary', 1000, 300)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    slot = EXCLUDED.slot,
    rarity = EXCLUDED.rarity,
    price_coins = EXCLUDED.price_coins,
    price_gems = EXCLUDED.price_gems;
