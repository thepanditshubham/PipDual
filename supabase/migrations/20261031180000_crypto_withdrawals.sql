-- ====================================================================
-- 20261031180000_crypto_withdrawals.sql
-- Payouts: coins go back out of the arena as stablecoin. Mirrors
-- src/lib/economy/types.ts:WithdrawRequest.
--
-- The rule that matters: escrow happens inside request_crypto_withdraw(), in
-- the same transaction that queues the row. A client cannot queue a payout
-- without the coins leaving its balance, cannot invent its own rate or fee,
-- and cannot spend twice what it asked to be paid. An admin rejection is the
-- only path that puts the coins back.
--
-- The economy numbers below (100 coins per USD, $5 floor, $1 fee) are mirrored
-- from src/lib/economy/config.ts. A test in
-- src/lib/economy/__tests__/economy.test.ts fails if the two drift.
-- ====================================================================

-- 1. Payout rows ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.crypto_withdrawals (
  id           TEXT PRIMARY KEY,
  player_id    TEXT NOT NULL,
  -- Coins held out of the wallet from the moment of the request.
  coins        INTEGER NOT NULL CHECK (coins > 0),
  -- Derived by the function, never supplied by the caller.
  gross_usd    NUMERIC(10, 2) NOT NULL CHECK (gross_usd > 0),
  fee_usd      NUMERIC(10, 2) NOT NULL CHECK (fee_usd >= 0),
  net_usd      NUMERIC(10, 2) NOT NULL CHECK (net_usd >= 0),
  asset_id     TEXT NOT NULL,
  symbol       TEXT NOT NULL,
  network      TEXT NOT NULL,
  -- Where the player asked for the money to go. Kept verbatim so a dispute
  -- can be settled against what was actually signed off.
  address      TEXT NOT NULL,
  -- Memo/tag for exchange-held receiving accounts. Optional.
  memo         TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
                 ('pending', 'paid', 'rejected')),
  -- Payout TxID on an approval, reason on a rejection.
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crypto_withdrawals_player
  ON public.crypto_withdrawals (player_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crypto_withdrawals_pending
  ON public.crypto_withdrawals (created_at)
  WHERE status = 'pending';

-- 2. Row-Level Security -------------------------------------------
-- Read your own payouts, admins read every one. There is no INSERT, UPDATE or
-- DELETE policy on purpose: the definer functions below are the only writers,
-- so a client cannot forge a paid row or refund itself.

ALTER TABLE public.crypto_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crypto_withdrawals_read ON public.crypto_withdrawals;

CREATE POLICY crypto_withdrawals_read
  ON public.crypto_withdrawals FOR SELECT
  USING (auth.uid()::text = player_id OR public.is_admin());

-- 3. Requesting a payout -------------------------------------------

CREATE OR REPLACE FUNCTION public.request_crypto_withdraw(
  p_player_id TEXT,
  p_coins     INTEGER,
  p_asset_id  TEXT,
  p_address   TEXT,
  p_memo      TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rail     RECORD;
  v_balance  INTEGER;
  v_gross    NUMERIC(10, 2);
  v_net      NUMERIC(10, 2);
  v_id       TEXT;
  v_address  TEXT := trim(coalesce(p_address, ''));
BEGIN
  IF auth.uid() IS NULL OR auth.uid()::text <> p_player_id THEN
    RAISE EXCEPTION 'request_crypto_withdraw: a payout can only be queued for your own account'
      USING ERRCODE = '42501';
  END IF;

  IF p_coins IS NULL OR p_coins < 500 THEN
    RAISE EXCEPTION 'The minimum withdrawal is 500 coins ($5).';
  END IF;

  -- Rails the arena pays out on, with the address shape each one accepts.
  SELECT r.* INTO v_rail FROM (VALUES
    ('usdt-bep20', 'USDT', 'BEP20 (BSC)', '^0x[0-9A-Fa-f]{40}$'::TEXT),
    ('usdt-trc20', 'USDT', 'TRC20',       '^T[1-9A-HJ-NP-Za-km-z]{33}$'::TEXT)
  ) AS r(asset_id, symbol, network, pattern)
  WHERE r.asset_id = p_asset_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That network is not accepting payouts right now.';
  END IF;

  IF v_address = '' OR v_address !~ v_rail.pattern THEN
    RAISE EXCEPTION 'That is not a valid % address.', v_rail.network;
  END IF;

  IF length(coalesce(p_memo, '')) > 32 THEN
    RAISE EXCEPTION 'That payout memo is too long.';
  END IF;

  v_gross := ROUND(p_coins / 100.0, 2);
  v_net   := v_gross - 1.00;
  IF v_net <= 0 THEN
    RAISE EXCEPTION 'That payout would not survive its own network fee.';
  END IF;

  -- Lock the wallet before reading it, so two concurrent requests cannot each
  -- see enough balance to cover the whole amount.
  SELECT virtual_balance INTO v_balance
    FROM public.player_balances
   WHERE player_id = p_player_id
     FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'You have no coins to withdraw yet.';
  END IF;
  IF v_balance < p_coins THEN
    RAISE EXCEPTION 'Insufficient coins — you hold %.', v_balance;
  END IF;

  UPDATE public.player_balances
     SET virtual_balance = virtual_balance - p_coins,
         updated_at      = NOW()
   WHERE player_id = p_player_id;

  v_id := 'wd_' || gen_random_uuid()::text;

  INSERT INTO public.crypto_withdrawals (
    id, player_id, coins, gross_usd, fee_usd, net_usd,
    asset_id, symbol, network, address, memo, status
  ) VALUES (
    v_id, p_player_id, p_coins, v_gross, 1.00, v_net,
    v_rail.asset_id, v_rail.symbol, v_rail.network, v_address,
    NULLIF(trim(p_memo), ''), 'pending'
  );

  RETURN v_id;
END;
$$;

-- 4. Reviewing a payout --------------------------------------------
-- Approval moves nothing: the coins left the wallet when the request was made.
-- It only records that the transfer happened. Rejection is the reverse of the
-- escrow and must hand the coins back in the same transaction.

CREATE OR REPLACE FUNCTION public.approve_crypto_withdraw(
  p_id  TEXT,
  p_ref TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  w public.crypto_withdrawals%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'approve_crypto_withdraw: admin only'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO w
    FROM public.crypto_withdrawals
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND OR w.status <> 'pending' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.crypto_withdrawals
     SET status      = 'paid',
         note        = COALESCE(p_ref, w.note),
         reviewed_at = NOW()
   WHERE id = p_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_crypto_withdraw(
  p_id   TEXT,
  p_note TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  w public.crypto_withdrawals%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'reject_crypto_withdraw: admin only'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO w
    FROM public.crypto_withdrawals
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND OR w.status <> 'pending' THEN
    RETURN 0;
  END IF;

  UPDATE public.crypto_withdrawals
     SET status      = 'rejected',
         note        = COALESCE(NULLIF(trim(p_note), ''), 'Rejected.'),
         reviewed_at = NOW()
   WHERE id = p_id;

  INSERT INTO public.player_balances (player_id, virtual_balance, updated_at)
  VALUES (w.player_id, w.coins, NOW())
  ON CONFLICT (player_id) DO UPDATE
    SET virtual_balance = public.player_balances.virtual_balance + w.coins,
        updated_at      = NOW();

  RETURN w.coins;
END;
$$;

REVOKE ALL ON FUNCTION public.request_crypto_withdraw(TEXT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_crypto_withdraw(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_crypto_withdraw(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_crypto_withdraw(TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_crypto_withdraw(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_crypto_withdraw(TEXT, TEXT) TO authenticated;

COMMENT ON TABLE public.crypto_withdrawals IS
  'Player-requested payouts. Coins are escrowed at request time; approve_crypto_withdraw() closes the row, reject_crypto_withdraw() returns the coins.';
COMMENT ON FUNCTION public.request_crypto_withdraw IS
  'Queues a payout for the calling player, deriving gross/fee/net from the coin count and deducting those coins from player_balances in the same transaction.';
COMMENT ON FUNCTION public.reject_crypto_withdraw IS
  'Admin-only. Refuses a pending payout and returns its escrowed coins. Idempotent: returns 0 when the row was not pending.';
