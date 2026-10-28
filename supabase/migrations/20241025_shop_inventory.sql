-- ============================================================
-- PIP DUEL  ·  Shop & Inventory Schema
-- Run this in the Supabase SQL editor (Dashboard ? SQL Editor)
-- ============================================================

-- 1. Shop catalogue (read-only, seeded by admin)
CREATE TABLE IF NOT EXISTS public.shop_items (
  id            TEXT PRIMARY KEY,
  category      TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  rarity        TEXT NOT NULL DEFAULT ''Common'',
  price         INTEGER NOT NULL DEFAULT 0,
  icon          TEXT,
  gradient      TEXT,
  glow          TEXT,
  accent        TEXT,
  available     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.shop_items (id, category, name, description, rarity, price, icon, gradient, glow, accent)
VALUES
  (''default'',  ''frames'', ''Tactical Standard Carbon'',
   ''Standard military dark matte border with signal accent badge.'',
   ''Common'', 0, ''shield'',
   ''from-[#222822] to-[#141814]'', ''border border-[#2a302a]'', ''#ff7a2f''),
  (''crimson'',  ''frames'', ''Crimson Apex Warrior Frame'',
   ''Aggressive battle-tested crimson armor border with fiery red ambient reflection.'',
   ''Epic'', 1500, ''fire'',
   ''from-[#ff5c68] via-[#e63946] to-[#7f1d1d]'',
   ''shadow-[0_0_18px_rgba(255,92,104,0.5)] border border-[#ff5c68]'', ''#ff5c68''),
  (''cyber'',    ''frames'', ''Cyber Matrix Neon Frame'',
   ''Electrified high-tech green cyber-grid frame with digital pulse lines.'',
   ''Epic'', 1800, ''zap'',
   ''from-[#3ddc97] via-[#00b4d8] to-[#023e8a]'',
   ''shadow-[0_0_18px_rgba(61,220,151,0.5)] border border-[#3ddc97]'', ''#3ddc97''),
  (''gold'',     ''frames'', ''24K Midas Golden Frame'',
   ''Forged with pure bullion finish. Displays an animated 24K gold radiance.'',
   ''Legendary'', 2500, ''crown'',
   ''from-[#ffe066] via-[#f59f00] to-[#b8860b]'',
   ''shadow-[0_0_20px_rgba(255,215,0,0.6)] border border-[#ffd43b]'', ''#ffd700'')
ON CONFLICT (id) DO NOTHING;

-- 2. Player inventory
CREATE TABLE IF NOT EXISTS public.player_inventory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     TEXT NOT NULL,
  item_id       TEXT NOT NULL REFERENCES public.shop_items(id),
  equipped      BOOLEAN NOT NULL DEFAULT FALSE,
  purchased_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_player_inventory_player ON public.player_inventory (player_id);

-- 3. Player virtual balances
CREATE TABLE IF NOT EXISTS public.player_balances (
  player_id       TEXT PRIMARY KEY,
  virtual_balance INTEGER NOT NULL DEFAULT 10000,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Row-Level Security
ALTER TABLE public.shop_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_balances  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shop_items_public_read"  ON public.shop_items FOR SELECT USING (TRUE);
CREATE POLICY "inventory_read_own"      ON public.player_inventory FOR SELECT USING (TRUE);
CREATE POLICY "inventory_insert_own"    ON public.player_inventory FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "inventory_update_own"    ON public.player_inventory FOR UPDATE USING (TRUE);
CREATE POLICY "balances_read_own"       ON public.player_balances FOR SELECT USING (TRUE);
CREATE POLICY "balances_upsert_own"     ON public.player_balances FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "balances_update_own"     ON public.player_balances FOR UPDATE USING (TRUE);
