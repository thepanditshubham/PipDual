-- ====================================================================
-- 20261101_security_hardening_test.sql
-- Regression tests for migrations/20261101120000_security_hardening.sql.
--
-- Run in a STAGING project's SQL editor (it runs as postgres, which is what
-- lets it switch roles). Everything happens inside one transaction that is
-- rolled back at the end, so no rows survive.
--
-- Each block prints PASS or raises FAIL. A raise aborts the transaction, so
-- the first failure is the one you see.
-- ====================================================================

begin;

-- Pick a non-admin to impersonate. The tests need a real profile row.
do $$
declare
  v_uid uuid;
begin
  select id into v_uid from public.profiles where role <> 'admin' limit 1;
  if v_uid is null then
    raise exception 'SETUP: no non-admin profile to test with';
  end if;
  perform set_config('test.uid', v_uid::text, true);
  raise notice 'Impersonating %', v_uid;
end $$;

-- Become that player, the way PostgREST does it.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- --------------------------------------------------------------------
-- T1: a player cannot make themselves an admin  (PD-001)
-- Blocked either by the column grant (42501) or by trg_profile_authority.
-- --------------------------------------------------------------------
do $$
declare
  v_uid  uuid := current_setting('test.uid')::uuid;
  v_role text;
begin
  begin
    update public.profiles set role = 'admin' where id = v_uid;
  exception when others then
    raise notice 'T1 blocked: % (%)', sqlerrm, sqlstate;
  end;

  select role into v_role from public.profiles where id = v_uid;
  if v_role = 'admin' then
    raise exception 'FAIL T1: role escalated to admin';
  end if;
  raise notice 'PASS T1: role is unchanged';
end $$;

-- --------------------------------------------------------------------
-- T2: the cosmetic columns still work  (no false positive from T1)
-- --------------------------------------------------------------------
do $$
declare
  v_uid  uuid := current_setting('test.uid')::uuid;
  v_name text;
begin
  update public.profiles
     set display_name = 'audit_test'
   where id = v_uid;

  select display_name into v_name from public.profiles where id = v_uid;
  if v_name is distinct from 'audit_test' then
    raise exception 'FAIL T2: display_name did not update';
  end if;
  raise notice 'PASS T2: display_name still writable';
end $$;

-- --------------------------------------------------------------------
-- T3: a wallet padded in the browser cannot be withdrawn  (PD-002)
-- --------------------------------------------------------------------
insert into public.player_balances (player_id, virtual_balance, updated_at)
values (current_setting('test.uid'), 100000, now())
on conflict (player_id) do update
  set virtual_balance = 100000, updated_at = now();

do $$
declare
  v_id text;
begin
  begin
    v_id := public.request_crypto_withdraw(
      current_setting('test.uid'), 500, 'usdt-bep20',
      '0x' || repeat('1', 40), null
    );
    raise exception 'FAIL T3: payout accepted browser coins (%)', v_id;
  exception when others then
    if sqlerrm like 'FAIL T3%' then raise; end if;
    raise notice 'PASS T3: refused — %', sqlerrm;
  end;
end $$;

-- --------------------------------------------------------------------
-- T4: money that really arrived can be paid out
-- The ledger is the record of that; inserting here stands in for
-- approve_crypto_deposit(), which writes the same row.
-- --------------------------------------------------------------------
reset role;

insert into public.wallet_ledger (player_id, kind, coins, reason, ref_type)
values (current_setting('test.uid'), 'deposit', 5000, 'audit fixture', 'test');

set local role authenticated;

do $$
declare
  v_id text;
begin
  v_id := public.request_crypto_withdraw(
    current_setting('test.uid'), 500, 'usdt-bep20',
    '0x' || repeat('2', 40), null
  );
  if v_id is null or v_id not like 'wd_%' then
    raise exception 'FAIL T4: honest payout was refused';
  end if;
  raise notice 'PASS T4: payout queued as %', v_id;
end $$;

-- --------------------------------------------------------------------
-- T5: the second payout is capped by what is left in the ledger
-- 5000 deposited − 500 already escrowed = 4500 withdrawable, wallet 99500.
-- --------------------------------------------------------------------
do $$
declare
  v_id text;
begin
  begin
    v_id := public.request_crypto_withdraw(
      current_setting('test.uid'), 4600, 'usdt-bep20',
      '0x' || repeat('3', 40), null
    );
    raise exception 'FAIL T5: payout beyond the ledger was accepted (%)', v_id;
  exception when others then
    if sqlerrm like 'FAIL T5%' then raise; end if;
    raise notice 'PASS T5: capped — %', sqlerrm;
  end;
end $$;

reset role;

-- Nothing above is kept: the fixtures, the ledger row and the withdrawal
-- all disappear with the rollback.
rollback;
