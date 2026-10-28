-- ============================================================
-- PIP DUEL - Store System Schema (spec 11)
-- Apply after 20241025_shop_inventory.sql.
-- Run in the Supabase SQL editor, or `supabase db push`.
--
-- Coins are earned, Gems are bought. Neither converts to the other
-- and neither expires. Every balance change is one wallet_ledger row
-- keyed by an idempotency key, so a retried webhook is a no-op.
-- ============================================================

-- 0. Legacy wallet + inventory adjustments -------------------

-- The auth wallet stores Gems next to Coins on the legacy balance row.
ALTER TABLE public.player_balances
  ADD COLUMN IF NOT EXISTS virtual_gems INTEGER NOT NULL DEFAULT 0;

-- Cosmetic ids now come from the client catalogue
-- (src/lib/shop/catalog.ts), not from the four seeded frames, so the
-- legacy foreign key has to go.
ALTER TABLE public.player_inventory
  DROP CONSTRAINT IF EXISTS player_inventory_item_id_fkey;

-- 1. Item catalogue mirror ----------------------------------
-- Source of truth stays src/lib/shop/catalog.ts; this table exists so
-- the server can validate prices and marketplace bounds.

CREATE TABLE IF NOT EXISTS public.store_items (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slot        TEXT NOT NULL CHECK (slot IN
                ('chart','candles','frame','avatar','finisher','title','background','chat')),
  rarity      TEXT NOT NULL CHECK (rarity IN ('common','rare','epic','legendary')),
  description TEXT,
  price_coins INTEGER,
  price_gems  INTEGER,
  accent      TEXT,
  starter     BOOLEAN NOT NULL DEFAULT FALSE,
  pass_only   BOOLEAN NOT NULL DEFAULT FALSE,
  limited     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Append-only currency ledger -----------------------------

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  currency        TEXT NOT NULL CHECK (currency IN ('coins','gems')),
  amount          INTEGER NOT NULL CHECK (amount <> 0),
  reason          TEXT NOT NULL CHECK (reason IN
                    ('shop','bundle','pass','gems','market','fee','creator','streak','refund','grant')),
  ref_type        TEXT NOT NULL CHECK (ref_type IN
                    ('item','order','season','listing','trade','code')),
  ref_id          TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user
  ON public.wallet_ledger (user_id, created_at DESC);

-- Reconciliation view: the ledger net must match player_balances.
CREATE OR REPLACE VIEW public.wallet_ledger_totals AS
SELECT user_id, currency, SUM(amount)::BIGINT AS net
FROM public.wallet_ledger
GROUP BY user_id, currency;

-- 3. Inventory (one active item per slot, escrow while listed) ----

CREATE TABLE IF NOT EXISTS public.inventory (
  user_id      TEXT NOT NULL,
  item_id      TEXT NOT NULL,
  acquired_via TEXT NOT NULL DEFAULT 'shop' CHECK (acquired_via IN
                 ('shop','pass','market','grant')),
  equipped     BOOLEAN NOT NULL DEFAULT FALSE,
  locked_until TIMESTAMPTZ,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_equipped
  ON public.inventory (user_id) WHERE equipped;

-- 4. Season pass state ---------------------------------------

CREATE TABLE IF NOT EXISTS public.season_pass_state (
  user_id       TEXT NOT NULL,
  season_id     TEXT NOT NULL,
  premium       BOOLEAN NOT NULL DEFAULT FALSE,
  premium_plus  BOOLEAN NOT NULL DEFAULT FALSE,
  bonus_tiers   INTEGER NOT NULL DEFAULT 0 CHECK (bonus_tiers >= 0),
  tiers_bought  INTEGER NOT NULL DEFAULT 0 CHECK (tiers_bought BETWEEN 0 AND 20),
  claimed_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  pass_xp       INTEGER NOT NULL DEFAULT 0 CHECK (pass_xp >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, season_id)
);

-- 5. Gem orders (sandbox gateway) ----------------------------

CREATE TABLE IF NOT EXISTS public.orders (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  product      TEXT NOT NULL,
  amount_inr   INTEGER NOT NULL CHECK (amount_inr >= 0),
  gems         INTEGER NOT NULL CHECK (gems >= 0),
  method       TEXT NOT NULL CHECK (method IN ('upi','card','netbanking')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
                 ('pending','paid','failed','refunded')),
  gateway_ref  TEXT,
  creator_code TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_user
  ON public.orders (user_id, created_at DESC);

-- One paid order per gateway reference: a replayed webhook cannot
-- credit the same payment twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_gateway_ref
  ON public.orders (gateway_ref) WHERE gateway_ref IS NOT NULL AND status = 'paid';

-- 6. Marketplace (Phase 3) -----------------------------------

CREATE TABLE IF NOT EXISTS public.market_listings (
  id          TEXT PRIMARY KEY,
  seller_id   TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  price_coins INTEGER NOT NULL CHECK (price_coins > 0),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN
                ('active','sold','expired','cancelled')),
  simulated   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_live
  ON public.market_listings (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_market_item
  ON public.market_listings (item_id, price_coins) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.market_trades (
  id         TEXT PRIMARY KEY,
  listing_id TEXT REFERENCES public.market_listings(id) ON DELETE SET NULL,
  item_id    TEXT NOT NULL,
  buyer_id   TEXT NOT NULL,
  seller_id  TEXT NOT NULL,
  price      INTEGER NOT NULL CHECK (price >= 0),
  fee        INTEGER NOT NULL DEFAULT 0 CHECK (fee >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_trades_buyer
  ON public.market_trades (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_trades_seller
  ON public.market_trades (seller_id, created_at DESC);

-- 7. Creator codes -------------------------------------------

CREATE TABLE IF NOT EXISTS public.creator_codes (
  code            TEXT PRIMARY KEY,
  creator         TEXT NOT NULL,
  tier            TEXT NOT NULL DEFAULT 'starter' CHECK (tier IN
                    ('starter','pro','partner')),
  commission_rate NUMERIC(4,3) NOT NULL DEFAULT 0.100
                    CHECK (commission_rate >= 0 AND commission_rate <= 0.500),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.creator_codes (code, creator, tier, commission_rate)
VALUES
  ('FOREXWALA', 'ForexWala', 'partner', 0.200),
  ('PIPKING',   'Pip King',  'pro',     0.150),
  ('GOLDHUNT',  'Gold Hunt', 'starter', 0.100)
ON CONFLICT (code) DO NOTHING;

-- One code per account, locked before the first Gem purchase.
CREATE TABLE IF NOT EXISTS public.creator_attributions (
  user_id     TEXT PRIMARY KEY,
  code        TEXT NOT NULL REFERENCES public.creator_codes(code),
  attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bonus_paid  BOOLEAN NOT NULL DEFAULT FALSE
);

-- 8. Row-level security --------------------------------------
-- The app talks to Supabase with the anon key and its own auth ids,
-- matching the permissive policies used by the existing schema.

ALTER TABLE public.store_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_pass_state    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_listings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_trades        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_codes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_items_read      ON public.store_items;
DROP POLICY IF EXISTS ledger_read           ON public.wallet_ledger;
DROP POLICY IF EXISTS ledger_insert         ON public.wallet_ledger;
DROP POLICY IF EXISTS inventory_read        ON public.inventory;
DROP POLICY IF EXISTS inventory_insert      ON public.inventory;
DROP POLICY IF EXISTS inventory_update      ON public.inventory;
DROP POLICY IF EXISTS pass_read             ON public.season_pass_state;
DROP POLICY IF EXISTS pass_insert           ON public.season_pass_state;
DROP POLICY IF EXISTS pass_update           ON public.season_pass_state;
DROP POLICY IF EXISTS orders_read           ON public.orders;
DROP POLICY IF EXISTS orders_insert         ON public.orders;
DROP POLICY IF EXISTS orders_update         ON public.orders;
DROP POLICY IF EXISTS listings_read         ON public.market_listings;
DROP POLICY IF EXISTS listings_insert       ON public.market_listings;
DROP POLICY IF EXISTS listings_update       ON public.market_listings;
DROP POLICY IF EXISTS trades_read           ON public.market_trades;
DROP POLICY IF EXISTS trades_insert         ON public.market_trades;
DROP POLICY IF EXISTS creator_codes_read    ON public.creator_codes;
DROP POLICY IF EXISTS attribution_read      ON public.creator_attributions;
DROP POLICY IF EXISTS attribution_insert    ON public.creator_attributions;
DROP POLICY IF EXISTS attribution_update    ON public.creator_attributions;

CREATE POLICY store_items_read   ON public.store_items FOR SELECT USING (TRUE);

-- The ledger is append-only: SELECT + INSERT only, no UPDATE/DELETE
-- policy, so a client can never rewrite history.
CREATE POLICY ledger_read        ON public.wallet_ledger FOR SELECT USING (TRUE);
CREATE POLICY ledger_insert      ON public.wallet_ledger FOR INSERT WITH CHECK (TRUE);

CREATE POLICY inventory_read     ON public.inventory FOR SELECT USING (TRUE);
CREATE POLICY inventory_insert   ON public.inventory FOR INSERT WITH CHECK (TRUE);
CREATE POLICY inventory_update   ON public.inventory FOR UPDATE USING (TRUE);

CREATE POLICY pass_read          ON public.season_pass_state FOR SELECT USING (TRUE);
CREATE POLICY pass_insert        ON public.season_pass_state FOR INSERT WITH CHECK (TRUE);
CREATE POLICY pass_update        ON public.season_pass_state FOR UPDATE USING (TRUE);

CREATE POLICY orders_read        ON public.orders FOR SELECT USING (TRUE);
CREATE POLICY orders_insert      ON public.orders FOR INSERT WITH CHECK (TRUE);
CREATE POLICY orders_update      ON public.orders FOR UPDATE USING (TRUE);

CREATE POLICY listings_read      ON public.market_listings FOR SELECT USING (TRUE);
CREATE POLICY listings_insert    ON public.market_listings FOR INSERT WITH CHECK (TRUE);
CREATE POLICY listings_update    ON public.market_listings FOR UPDATE USING (TRUE);

CREATE POLICY trades_read        ON public.market_trades FOR SELECT USING (TRUE);
CREATE POLICY trades_insert      ON public.market_trades FOR INSERT WITH CHECK (TRUE);

CREATE POLICY creator_codes_read ON public.creator_codes FOR SELECT USING (TRUE);
CREATE POLICY attribution_read   ON public.creator_attributions FOR SELECT USING (TRUE);
CREATE POLICY attribution_insert ON public.creator_attributions FOR INSERT WITH CHECK (TRUE);
CREATE POLICY attribution_update ON public.creator_attributions FOR UPDATE USING (TRUE);
