-- ============================================================
-- PIP DUEL — Zero-initial coins & gems
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor)
-- ============================================================

-- 1. Coins start at 0 for every new player
ALTER TABLE public.player_balances
  ALTER COLUMN virtual_balance SET DEFAULT 0;

-- 2. Gems live on the same wallet row and also start at 0
ALTER TABLE public.player_balances
  ADD COLUMN IF NOT EXISTS virtual_gems INTEGER NOT NULL DEFAULT 0;

-- 3. Wallet rows still holding the old 10,000 bootstrap default are reset.
--    Remove this block if existing players should keep their current coins.
UPDATE public.player_balances
   SET virtual_balance = 0,
       updated_at = NOW()
 WHERE virtual_balance = 10000;
