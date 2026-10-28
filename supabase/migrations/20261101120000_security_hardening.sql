-- ====================================================================
-- 20261101120000_security_hardening.sql
-- Two findings from the security audit, both reachable with nothing but
-- the public anon key that ships in every browser.
--
-- 1. A player could PATCH their own profiles row and set role = 'admin'.
--    is_admin() reads that column, so the whole admin console — coin
--    adjustments, deposit approval, payout approval, suspend/ban — opened
--    up to any account that asked.
--
-- 2. A player could PATCH player_balances to any number. The wallet is
--    client-authoritative for play coins by design, but withdrawals used
--    that same column as proof of funds, so invented coins could be
--    turned into a real USDT payout.
--
-- setup.sql carries the same statements; this file is the historical
-- record of the change.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Profile authority belongs to the server
-- --------------------------------------------------------------------
-- Column grants first: the table-level UPDATE grant is dropped and only
-- the cosmetic columns are handed back, so `PATCH {role: 'admin'}` fails
-- at the privilege check before RLS is even consulted.

revoke update on public.profiles from anon, authenticated;
grant update (username, display_name, avatar_url, country, language)
  on public.profiles to authenticated;

-- Grant changes are only as good as the next migration that forgets one,
-- so a trigger holds the same line. It compares only the fields that
-- confer authority, as jsonb, so it does not care whether a later column
-- has been added yet. auth.uid() is null for service_role and the SQL
-- editor, which is how a first admin is still appointed by hand.
create or replace function public.guard_profile_authority()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_protected constant text[] := array[
    'id', 'role', 'status', 'status_note', 'status_changed_at',
    'rating', 'risk_rating', 'created_at'
  ];
  v_key text;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  foreach v_key in array v_protected loop
    if (to_jsonb(new) -> v_key) is distinct from (to_jsonb(old) -> v_key) then
      raise exception 'That profile field is not yours to change: %', v_key
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_profile_authority on public.profiles;
create trigger trg_profile_authority
  before update on public.profiles
  for each row execute function public.guard_profile_authority();

-- --------------------------------------------------------------------
-- 2. A payout is backed by the ledger, not by the wallet
-- --------------------------------------------------------------------
-- wallet_ledger has no client write path at all: every row is written by
-- record_ledger() from inside a definer function. Its sum is therefore
-- the only trustworthy statement of how much real money a player has
-- brought in and not yet taken out. The wallet stays exactly as it is —
-- client-authoritative, which is what offline/demo play needs — but it
-- is no longer accepted as proof of funds.
--
-- Sum semantics: deposit +, adjustment ±, payout −, payout_refund +.

create or replace function public.request_crypto_withdraw(
  p_player_id text,
  p_coins integer,
  p_asset_id text,
  p_address text,
  p_memo text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rail      record;
  v_balance   integer;
  v_earned    integer;
  v_gross     numeric(10, 2);
  v_net       numeric(10, 2);
  v_id        text;
  v_address   text := trim(coalesce(p_address, ''));
begin
  if auth.uid() is null or auth.uid()::text <> p_player_id then
    raise exception 'request_crypto_withdraw: a payout can only be queued for your own account'
      using errcode = '42501';
  end if;

  if p_coins is null or p_coins < 500 then
    raise exception 'The minimum withdrawal is 500 coins ($5).';
  end if;

  select r.* into v_rail from (values
    ('usdt-bep20', 'USDT', 'BEP20 (BSC)', '^0x[0-9A-Fa-f]{40}$'::text),
    ('usdt-trc20', 'USDT', 'TRC20',       '^T[1-9A-HJ-NP-Za-km-z]{33}$'::text)
  ) as r(asset_id, symbol, network, pattern)
  where r.asset_id = p_asset_id;

  if not found then
    raise exception 'That network is not accepting payouts right now.';
  end if;

  if v_address = '' or v_address !~ v_rail.pattern then
    raise exception 'That is not a valid % address.', v_rail.network;
  end if;

  if length(coalesce(p_memo, '')) > 32 then
    raise exception 'That payout memo is too long.';
  end if;

  v_gross := round(p_coins / 100.0, 2);
  v_net   := v_gross - 1.00;
  if v_net <= 0 then
    raise exception 'That payout would not survive its own network fee.';
  end if;

  -- Lock the wallet before reading it, so two concurrent requests cannot
  -- each see enough balance to cover the whole amount.
  select virtual_balance into v_balance
    from public.player_balances
   where player_id = p_player_id
     for update;

  if v_balance is null then
    raise exception 'You have no coins to withdraw yet.';
  end if;
  if v_balance < p_coins then
    raise exception 'Insufficient coins — you hold %.', v_balance;
  end if;

  -- The second, independent check: what the ledger says was really paid in
  -- or won. Coins minted in the browser have no ledger row, so a wallet
  -- padded with them still cannot reach the payout desk.
  select coalesce(sum(coins), 0) into v_earned
    from public.wallet_ledger
   where player_id = p_player_id;

  if v_earned < p_coins then
    raise exception 'Only % of your % coins came from deposits or winnings, so % cannot be paid out. Contact support if you believe this is wrong.', v_earned, v_balance, p_coins
      using errcode = '22023';
  end if;

  update public.player_balances
     set virtual_balance = virtual_balance - p_coins,
         updated_at      = now()
   where player_id = p_player_id;

  v_id := 'wd_' || gen_random_uuid()::text;

  insert into public.crypto_withdrawals (
    id, player_id, coins, gross_usd, fee_usd, net_usd,
    asset_id, symbol, network, address, memo, status
  ) values (
    v_id, p_player_id, p_coins, v_gross, 1.00, v_net,
    v_rail.asset_id, v_rail.symbol, v_rail.network, v_address,
    nullif(trim(p_memo), ''), 'pending'
  );

  perform public.record_ledger(
    p_player_id, 'payout', -p_coins, 'Payout escrowed', 'withdrawal', v_id
  );

  return v_id;
end;
$$;

revoke all on function public.request_crypto_withdraw(text, integer, text, text, text) from public;
grant execute on function public.request_crypto_withdraw(text, integer, text, text, text) to authenticated;
