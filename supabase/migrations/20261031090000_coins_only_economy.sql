-- ============================================================
-- PIP DUEL - Coins-only economy (Live entry fees + deposits)
-- Apply after 20261030090000_frame_artwork_starter.sql.
--
-- The store is gone: no cosmetics, no gems, no season pass, no
-- marketplace, no creator codes. One currency remains — coins, bought
-- at ₹1 = 1 coin and spent on the entry fee of a Live duel. Demo duels
-- stay free. Both Live entries pool, the arena burns 10%, the winner
-- collects the rest (see src/lib/economy/config.ts).
--
-- Wallet writes are still client-authoritative; `coin_orders` exists so
-- a payment has a server-side record before a real gateway is wired in.
-- ============================================================

-- 1. Retire the starter-frame machinery ------------------------
-- It granted cosmetic inventory rows on every new profile.

DROP TRIGGER IF EXISTS trg_profiles_starter_frame ON public.profiles;
DROP FUNCTION IF EXISTS public.grant_starter_frame();

-- 2. Drop the store schema -------------------------------------
-- View first: it depends on wallet_ledger.

DROP VIEW IF EXISTS public.wallet_ledger_totals;

DROP TABLE IF EXISTS public.creator_attributions;
DROP TABLE IF EXISTS public.creator_codes;
DROP TABLE IF EXISTS public.market_trades;
DROP TABLE IF EXISTS public.market_listings;
DROP TABLE IF EXISTS public.orders;
DROP TABLE IF EXISTS public.season_pass_state;
DROP TABLE IF EXISTS public.inventory;
DROP TABLE IF EXISTS public.wallet_ledger;
DROP TABLE IF EXISTS public.store_items;
DROP TABLE IF EXISTS public.player_inventory;
DROP TABLE IF EXISTS public.shop_items;

-- 3. Drop the columns the store owned --------------------------

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS avatar_frame,
  DROP COLUMN IF EXISTS owned_frames;

ALTER TABLE public.player_balances
  DROP COLUMN IF EXISTS virtual_gems;

COMMENT ON COLUMN public.player_balances.virtual_balance IS
  'The coin wallet: bought with rupees, spent on Live entries, topped up by pot payouts and rewards.';

-- 4. Deposit orders --------------------------------------------
-- Mirrors src/lib/economy/types.ts:DepositOrder. Status starts at
-- 'pending' and only ever moves forward; the gateway reference is set
-- when it confirms, and a paid reference can never repeat.

CREATE TABLE IF NOT EXISTS public.coin_orders (
  id          TEXT PRIMARY KEY,
  player_id   TEXT NOT NULL,
  amount_inr  INTEGER NOT NULL CHECK (amount_inr > 0),
  coins       INTEGER NOT NULL CHECK (coins > 0),
  method      TEXT NOT NULL CHECK (method IN ('upi', 'card', 'netbanking')),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
                ('pending', 'paid', 'failed', 'refunded')),
  gateway_ref TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coin_orders_player
  ON public.coin_orders (player_id, created_at DESC);

-- A replayed gateway callback cannot credit the same payment twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_coin_orders_gateway_ref
  ON public.coin_orders (gateway_ref)
  WHERE gateway_ref IS NOT NULL AND status = 'paid';

-- 5. Row-Level Security ----------------------------------------
-- Payment history is the one table here that is not world-readable:
-- a player sees and writes only their own orders. Deposits are blocked
-- for guests in the client, so auth.uid() is always present.

ALTER TABLE public.coin_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coin_orders_read_own   ON public.coin_orders;
DROP POLICY IF EXISTS coin_orders_insert_own ON public.coin_orders;
DROP POLICY IF EXISTS coin_orders_update_own ON public.coin_orders;

CREATE POLICY coin_orders_read_own
  ON public.coin_orders FOR SELECT USING (auth.uid()::text = player_id);
CREATE POLICY coin_orders_insert_own
  ON public.coin_orders FOR INSERT WITH CHECK (auth.uid()::text = player_id);
CREATE POLICY coin_orders_update_own
  ON public.coin_orders FOR UPDATE
  USING (auth.uid()::text = player_id)
  WITH CHECK (auth.uid()::text = player_id);
