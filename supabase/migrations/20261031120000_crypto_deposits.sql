-- ====================================================================
-- 20261031120000_crypto_deposits.sql
-- Deposits move from a simulated rupee gateway to crypto transfers that a
-- human reviews. Mirrors src/lib/economy/types.ts:CryptoDeposit.
--
-- The rule that matters: a player can write a pending row and nothing else.
-- Coins only ever appear through approve_crypto_deposit(), which flips the row
-- and credits the wallet inside one transaction — so no client can credit
-- itself, rename its own amount, or get paid twice for the same TxID.
-- ====================================================================

-- 1. The rupee order table is dead ---------------------------------
-- Never carried real payment history in this build (the gateway was
-- simulated), and its columns cannot describe an on-chain transfer.

DROP TABLE IF EXISTS public.coin_orders;

-- 2. Admin predicate -----------------------------------------------
-- SECURITY DEFINER so it reads profiles without tripping over the RLS on
-- profiles itself; used by both the policies and the review functions.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 3. Deposit entries -----------------------------------------------

CREATE TABLE IF NOT EXISTS public.crypto_deposits (
  id           TEXT PRIMARY KEY,
  player_id    TEXT NOT NULL,
  pack_id      TEXT NOT NULL,
  coins        INTEGER NOT NULL CHECK (coins > 0),
  asset_id     TEXT NOT NULL,
  symbol       TEXT NOT NULL,
  network      TEXT NOT NULL,
  -- USD value of the pack chosen. Stablecoins must send exactly this many
  -- units; volatile assets are judged on what the transfer settled at.
  expected_usd INTEGER NOT NULL CHECK (expected_usd > 0),
  -- House address as shown to the player at submit time, kept so a later
  -- rotation of the wallet cannot invalidate an old claim under review.
  address      TEXT NOT NULL,
  -- Destination tag for shared-address rails (XRPL and friends).
  memo         TEXT,
  txid         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
                 ('pending', 'paid', 'rejected')),
  -- Payment reference on an approval, reason on a rejection.
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crypto_deposits_player
  ON public.crypto_deposits (player_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crypto_deposits_pending
  ON public.crypto_deposits (created_at)
  WHERE status = 'pending';

-- One transaction can fund exactly one credit, however many rows quote it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crypto_deposits_paid_txid
  ON public.crypto_deposits (txid)
  WHERE status = 'paid';

-- 4. Row-Level Security -------------------------------------------
-- Payment history stays private: a player reads their own rows, an admin reads
-- every row. There is no UPDATE or DELETE policy on purpose — review happens
-- through the definer functions below.

ALTER TABLE public.crypto_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crypto_deposits_read ON public.crypto_deposits;
DROP POLICY IF EXISTS crypto_deposits_insert_pending ON public.crypto_deposits;

CREATE POLICY crypto_deposits_read
  ON public.crypto_deposits FOR SELECT
  USING (auth.uid()::text = player_id OR public.is_admin());

CREATE POLICY crypto_deposits_insert_pending
  ON public.crypto_deposits FOR INSERT
  WITH CHECK (
    auth.uid()::text = player_id
    AND status = 'pending'
  );

-- 5. Review actions ------------------------------------------------
-- Both return whether anything actually happened, so a double click or a
-- replayed request reports "nothing to do" instead of paying again.

CREATE OR REPLACE FUNCTION public.approve_crypto_deposit(
  p_id  TEXT,
  p_ref TEXT DEFAULT NULL
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

  -- Row lock makes two concurrent approvals of the same id serialise.
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
     SET status      = 'paid',
         note        = COALESCE(p_ref, d.note),
         reviewed_at = NOW()
   WHERE id = p_id;

  INSERT INTO public.player_balances (player_id, virtual_balance, updated_at)
  VALUES (d.player_id, d.coins, NOW())
  ON CONFLICT (player_id) DO UPDATE
    SET virtual_balance = public.player_balances.virtual_balance + d.coins,
        updated_at      = NOW();

  RETURN d.coins;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_crypto_deposit(
  p_id   TEXT,
  p_note TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  d public.crypto_deposits%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'reject_crypto_deposit: admin only'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO d
    FROM public.crypto_deposits
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND OR d.status <> 'pending' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.crypto_deposits
     SET status      = 'rejected',
         note        = COALESCE(NULLIF(trim(p_note), ''), 'Rejected.'),
         reviewed_at = NOW()
   WHERE id = p_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_crypto_deposit(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_crypto_deposit(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_crypto_deposit(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_crypto_deposit(TEXT, TEXT) TO authenticated;

COMMENT ON TABLE public.crypto_deposits IS
  'Player-submitted crypto deposits awaiting review. Status pending credits nothing; only approve_crypto_deposit() pays.';
COMMENT ON FUNCTION public.approve_crypto_deposit IS
  'Admin-only. Flips a pending deposit to paid and credits its coins to player_balances in the same transaction. Idempotent: returns 0 when the row was not pending.';
