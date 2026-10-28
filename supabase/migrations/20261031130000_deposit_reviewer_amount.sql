-- ====================================================================
-- 20261031130000_deposit_reviewer_amount.sql
-- A deposit submission no longer declares an amount. The player picks a rail,
-- sends whatever they like, and pastes the TxID; the reviewer reads the value
-- off the explorer and names the coin amount when approving. This supersedes
-- the amount declared at submit time in 20261031120000_crypto_deposits.sql.
--
-- The rule that matters is unchanged: coins only ever move through
-- approve_crypto_deposit(), and now the reviewer — not the player — decides how
-- many. A pending row carries no coins at all.
-- ====================================================================

-- 1. A claim can exist before its amount is known -------------------
-- Drop the "always positive at insert" guarantees and let both sit NULL until
-- an approval fills them in.

ALTER TABLE public.crypto_deposits
  DROP CONSTRAINT IF EXISTS crypto_deposits_coins_check;

ALTER TABLE public.crypto_deposits
  DROP CONSTRAINT IF EXISTS crypto_deposits_expected_usd_check;

ALTER TABLE public.crypto_deposits
  ALTER COLUMN coins DROP NOT NULL,
  ALTER COLUMN expected_usd DROP NOT NULL;

-- Once credited a row must carry a real amount; only pending rows may be blank.
ALTER TABLE public.crypto_deposits
  ADD CONSTRAINT crypto_deposits_coins_when_paid CHECK (
    status <> 'paid' OR (coins IS NOT NULL AND coins > 0)
  );

-- 2. Approval now takes the coin amount the reviewer confirmed -------
-- The old (id, ref) signature credited whatever the row already claimed. That
-- claim no longer exists, so the reviewer supplies it. Re-created with the new
-- argument list; the old two-argument form is dropped so the call is unambiguous.

DROP FUNCTION IF EXISTS public.approve_crypto_deposit(TEXT, TEXT);

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

  -- The reviewer names the coins; the dollar value is derived at the flat peg
  -- (100 coins to the dollar) purely for the audit trail on the row.
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

  RETURN p_coins;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_crypto_deposit(TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_crypto_deposit(TEXT, INTEGER, TEXT) TO authenticated;

COMMENT ON FUNCTION public.approve_crypto_deposit IS
  'Admin-only. Names the coin amount the reviewer confirmed, flips a pending deposit to paid, and credits that many coins to player_balances in one transaction. Idempotent: returns 0 when the row was not pending.';
