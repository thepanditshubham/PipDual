-- ====================================================================
-- 20261101090000_admin_operations.sql
-- The admin console grows a wallet ledger, a player directory with
-- suspend/ban, a duplicate-TxID guard on deposits, and a second sign-off
-- on large payouts.
--
-- The rule that matters is unchanged: coins only move inside a definer
-- function, and every movement leaves one wallet_ledger row behind in the
-- same transaction. A client can read its own ledger and nothing else;
-- an admin can read every row but still cannot write one.
--
-- supabase/setup.sql carries the same statements — it is what provisions
-- the project, and this file is the historical record of the change.
-- ====================================================================

-- 1. Player status ------------------------------------------------
-- Suspension is a lock on the account, not a role. `banned` is the
-- terminal form; `suspended` is the reversible one.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status_note TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active', 'suspended', 'banned'));

-- 2. Wallet ledger ------------------------------------------------
-- One row per money movement. `coins` is signed: positive credits the
-- wallet, negative debits it. `balance_after` is the wallet as it stood
-- once the row was applied, so a reviewer can replay a balance without
-- summing the whole table.

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id            BIGSERIAL PRIMARY KEY,
  player_id     TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN
                  ('deposit', 'payout', 'payout_refund', 'adjustment')),
  coins         INTEGER NOT NULL CHECK (coins <> 0),
  balance_after INTEGER,
  reason        TEXT,
  -- What caused the row: 'deposit' / 'withdrawal' plus the row id.
  ref_type      TEXT,
  ref_id        TEXT,
  -- The admin behind a manual adjustment; NULL for player-driven money.
  actor_id      UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_player
  ON public.wallet_ledger (player_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_created
  ON public.wallet_ledger (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_ref
  ON public.wallet_ledger (ref_type, ref_id);

ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_ledger_read ON public.wallet_ledger;

-- Read your own ledger, or every row as an admin. No INSERT, UPDATE or
-- DELETE policy on purpose: record_ledger() is the only writer.
CREATE POLICY wallet_ledger_read
  ON public.wallet_ledger FOR SELECT
  USING (auth.uid()::text = player_id OR public.is_admin());

-- 3. The one writer ----------------------------------------------
-- Called from inside the definer functions below, after the balance has
-- already moved, so the ledger can never disagree with the wallet.

CREATE OR REPLACE FUNCTION public.record_ledger(
  p_player_id TEXT,
  p_kind      TEXT,
  p_coins     INTEGER,
  p_reason    TEXT DEFAULT NULL,
  p_ref_type  TEXT DEFAULT NULL,
  p_ref_id    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  IF p_coins IS NULL OR p_coins = 0 THEN
    RAISE EXCEPTION 'record_ledger: a non-zero coin amount is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT virtual_balance INTO v_balance
    FROM public.player_balances
   WHERE player_id = p_player_id;

  INSERT INTO public.wallet_ledger (
    player_id, kind, coins, balance_after, reason, ref_type, ref_id, actor_id
  ) VALUES (
    p_player_id, p_kind, p_coins, v_balance,
    NULLIF(trim(coalesce(p_reason, '')), ''), p_ref_type, p_ref_id,
    -- Only a manual adjustment has an admin behind it; deposits and payouts
    -- are driven by the player's own row.
    CASE WHEN p_kind = 'adjustment' THEN auth.uid() ELSE NULL END
  );
END;
$$;

-- Internal only: the definer functions run as the table owner, so no
-- client needs EXECUTE on this.
REVOKE ALL ON FUNCTION public.record_ledger(TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC;

-- 4. Manual adjustment -------------------------------------------
-- The only way an admin touches a balance directly. It writes a ledger
-- row in the same transaction and refuses to overdraw, so a typo cannot
-- erase a balance.

CREATE OR REPLACE FUNCTION public.admin_adjust_coins(
  p_player_id TEXT,
  p_coins     INTEGER,
  p_reason    TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_balance INTEGER;
  v_reason  TEXT := trim(coalesce(p_reason, ''));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_adjust_coins: admin only'
      USING ERRCODE = '42501';
  END IF;

  IF p_coins IS NULL OR p_coins = 0 THEN
    RAISE EXCEPTION 'Enter a non-zero coin amount — use the sign to credit or debit.'
      USING ERRCODE = '22023';
  END IF;

  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'An adjustment needs a reason of at least 3 characters.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.player_balances (player_id, virtual_balance, updated_at)
  VALUES (p_player_id, 0, NOW())
  ON CONFLICT (player_id) DO NOTHING;

  SELECT virtual_balance INTO v_balance
    FROM public.player_balances
   WHERE player_id = p_player_id
     FOR UPDATE;

  IF v_balance + p_coins < 0 THEN
    RAISE EXCEPTION 'That would take the wallet below zero — it holds % coins.', v_balance
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.player_balances
     SET virtual_balance = virtual_balance + p_coins,
         updated_at      = NOW()
   WHERE player_id = p_player_id;

  PERFORM public.record_ledger(p_player_id, 'adjustment', p_coins, v_reason);

  SELECT virtual_balance INTO v_balance
    FROM public.player_balances
   WHERE player_id = p_player_id;

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_coins(TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_coins(TEXT, INTEGER, TEXT) TO authenticated;

-- 5. Suspend / ban -------------------------------------------------
-- An admin can lock any other account. Nobody can lock themselves out,
-- which is the one mistake this screen could make unrecoverable.

CREATE OR REPLACE FUNCTION public.admin_set_player_status(
  p_player_id TEXT,
  p_status    TEXT,
  p_note      TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_set_player_status: admin only'
      USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('active', 'suspended', 'banned') THEN
    RAISE EXCEPTION 'Unknown account status %', p_status
      USING ERRCODE = '22023';
  END IF;

  IF p_player_id = auth.uid()::text THEN
    RAISE EXCEPTION 'You cannot change your own account status.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET status            = p_status,
         status_note       = NULLIF(trim(coalesce(p_note, '')), ''),
         status_changed_at = NOW()
   WHERE id::text = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player % not found.', p_player_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_player_status(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_player_status(TEXT, TEXT, TEXT) TO authenticated;

-- 6. Duplicate TxID guard on submission ----------------------------
-- approve_crypto_deposit() already refuses to credit a TxID twice. This
-- closes the earlier hole: two players could park the same hash as two
-- pending rows and only discover the clash at review time. A rejected
-- hash may be resubmitted — only pending and paid rows claim one.

CREATE OR REPLACE FUNCTION public.guard_deposit_txid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.crypto_deposits d
     WHERE d.txid = NEW.txid
       AND d.id <> NEW.id
       AND d.status IN ('pending', 'paid')
  ) THEN
    RAISE EXCEPTION 'That transaction hash is already claimed — it is under review or already credited. If an earlier claim was rejected, you can submit it again.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deposit_txid_once ON public.crypto_deposits;
CREATE TRIGGER trg_deposit_txid_once
  BEFORE INSERT ON public.crypto_deposits
  FOR EACH ROW EXECUTE FUNCTION public.guard_deposit_txid();

-- The trigger gives the friendly error; this index is what holds when two
-- submissions race and both pass the trigger's existence check. Rows a
-- pre-guard database already collected are settled first: the earliest open
-- claim keeps the hash, later PENDING ones are rejected, paid rows untouched.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY txid ORDER BY created_at, id) AS rn
    FROM public.crypto_deposits
   WHERE status IN ('pending', 'paid')
)
UPDATE public.crypto_deposits d
   SET status      = 'rejected',
       note        = COALESCE(d.note, 'Duplicate claim of the same transaction hash.'),
       reviewed_at = NOW()
  FROM ranked r
 WHERE d.id = r.id
   AND r.rn > 1
   AND d.status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uq_crypto_deposits_open_txid
  ON public.crypto_deposits (txid)
  WHERE status IN ('pending', 'paid');

-- 7. Dual approval on large payouts --------------------------------
-- Above the threshold a payout needs two different admins. The first
-- sign-off stamps the row and leaves it pending; the second closes it.
-- Below the threshold one signature is still enough.

ALTER TABLE public.crypto_withdrawals
  ADD COLUMN IF NOT EXISTS first_approved_by UUID;

ALTER TABLE public.crypto_withdrawals
  ADD COLUMN IF NOT EXISTS first_approved_at TIMESTAMPTZ;

ALTER TABLE public.crypto_withdrawals
  ADD COLUMN IF NOT EXISTS approved_by UUID;

DROP FUNCTION IF EXISTS public.approve_crypto_withdraw(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.approve_crypto_withdraw(
  p_id  TEXT,
  p_ref TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Mirrors DUAL_APPROVAL_COINS in src/lib/admin/rules.ts. A payout this
  -- large needs two admins; the threshold is a constant, never an argument
  -- a caller could lower.
  v_threshold CONSTANT INTEGER := 5000;
  w           public.crypto_withdrawals%ROWTYPE;
  v_uid       UUID := auth.uid();
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
    RETURN 'none';
  END IF;

  -- Small payouts still need one signature.
  IF w.coins < v_threshold THEN
    UPDATE public.crypto_withdrawals
       SET status      = 'paid',
           note        = COALESCE(p_ref, w.note),
           approved_by = v_uid,
           reviewed_at = NOW()
     WHERE id = p_id;

    RETURN 'paid';
  END IF;

  -- Large payout, nobody has signed yet: record the first signature.
  IF w.first_approved_by IS NULL THEN
    UPDATE public.crypto_withdrawals
       SET first_approved_by = v_uid,
           first_approved_at = NOW(),
           note              = COALESCE(p_ref, w.note)
     WHERE id = p_id;

    RETURN 'awaiting_second';
  END IF;

  IF w.first_approved_by = v_uid THEN
    RAISE EXCEPTION 'You already signed this payout — a second admin has to confirm it.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.crypto_withdrawals
     SET status      = 'paid',
         note        = COALESCE(p_ref, w.note),
         approved_by = v_uid,
         reviewed_at = NOW()
   WHERE id = p_id;

  RETURN 'paid';
END;
$$;

REVOKE ALL ON FUNCTION public.approve_crypto_withdraw(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_crypto_withdraw(TEXT, TEXT) TO authenticated;

-- 8. Existing movements write ledger rows -------------------------
-- Re-created in full so the ledger and the wallet cannot drift. Only the
-- ledger call is new; every guard is unchanged.

CREATE OR REPLACE FUNCTION public.approve_crypto_deposit(
  p_id    TEXT,
  p_coins INTEGER,
  p_ref   TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  d public.crypto_deposits%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'approve_crypto_deposit: admin only'
      USING ERRCODE = '42501';
  END IF;

  IF p_coins IS NULL OR p_coins <= 0 THEN
    RAISE EXCEPTION 'approve_crypto_deposit: a positive coin amount is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO d
    FROM public.crypto_deposits
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit % not found', p_id;
  END IF;

  IF d.status <> 'pending' THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.crypto_deposits
     WHERE txid = d.txid AND status = 'paid' AND id <> p_id
  ) THEN
    RAISE EXCEPTION 'that TxID was already credited to deposit %', p_id
      USING ERRCODE = '23505';
  END IF;

  UPDATE public.crypto_deposits
     SET status       = 'paid',
         coins        = p_coins,
         expected_usd = GREATEST(1, CEIL(p_coins / 100.0)::int),
         note         = COALESCE(p_ref, d.note),
         reviewed_at  = NOW()
   WHERE id = p_id;

  INSERT INTO public.player_balances (player_id, virtual_balance, updated_at)
  VALUES (d.player_id, p_coins, NOW())
  ON CONFLICT (player_id) DO UPDATE
    SET virtual_balance = public.player_balances.virtual_balance + p_coins,
        updated_at      = NOW();

  PERFORM public.record_ledger(
    d.player_id, 'deposit', p_coins,
    COALESCE(NULLIF(trim(coalesce(p_ref, '')), ''), 'Crypto deposit approved'),
    'deposit', p_id
  );

  RETURN p_coins;
END;
$$;

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

  PERFORM public.record_ledger(
    p_player_id, 'payout', -p_coins, 'Payout escrowed', 'withdrawal', v_id
  );

  RETURN v_id;
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

  PERFORM public.record_ledger(
    w.player_id, 'payout_refund', w.coins,
    COALESCE(NULLIF(trim(p_note), ''), 'Payout refused'),
    'withdrawal', p_id
  );

  RETURN w.coins;
END;
$$;

REVOKE ALL ON FUNCTION public.request_crypto_withdraw(TEXT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_crypto_withdraw(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_crypto_withdraw(TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_crypto_withdraw(TEXT, TEXT) TO authenticated;

COMMENT ON TABLE public.wallet_ledger IS
  'One row per coin movement. Written only by record_ledger() from inside the definer functions that move the balance.';
COMMENT ON FUNCTION public.admin_adjust_coins IS
  'Admin-only manual adjustment. Requires a reason, refuses to overdraw, and writes the matching wallet_ledger row.';
COMMENT ON FUNCTION public.approve_crypto_withdraw IS
  'Admin-only. Returns paid / awaiting_second / none; payouts at or above the dual-approval threshold need two different admins.';
COMMENT ON FUNCTION public.guard_deposit_txid IS
  'Refuses a deposit insert whose TxID is already held by a pending or paid row. A rejected hash may be resubmitted.';
COMMENT ON INDEX public.uq_crypto_deposits_open_txid IS
  'One pending-or-paid claim per transaction hash, enforced atomically under concurrent submissions.';
