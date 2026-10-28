/**
 * wallet.ts
 * Supabase persistence for the coin wallet and crypto deposits.
 * Every call is safe without Supabase configured — the client store stays the
 * source of truth and these functions quietly no-op, which is how the rest of
 * the app already behaves offline.
 *
 * A deposit is written `pending` and stays pending: only the admin RPCs below
 * flip it, and only those RPCs move coins. No client here can credit itself.
 * A withdrawal is the mirror image: the coins leave the wallet inside
 * `request_crypto_withdraw()`, so a player can never spend what is already
 * queued for payout, and only an admin rejection puts them back.
 */
import { getSupabase } from './client';
import type {
  CryptoDeposit,
  DepositStatus,
  WithdrawRequest,
  WithdrawalStatus,
} from '@/lib/economy/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Stored coin balance, or null when nothing could be read.
 * `player_balances` is authoritative; setup.sql backfills a row for every
 * profile, so there is no second place to look.
 */
export async function fetchCoins(playerId: string): Promise<number | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('player_balances')
    .select('virtual_balance')
    .eq('player_id', playerId)
    .maybeSingle();

  if (error || !data) return null;
  return (data.virtual_balance as number | null) ?? null;
}

/** Materialise a zero balance for a player that has no wallet row anywhere. */
export async function ensureCoins(playerId: string): Promise<number | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const stored = await fetchCoins(playerId);
  if (stored !== null) return stored;

  // One round trip: insert-if-missing and return the row in the same call.
  const { data, error } = await sb
    .from('player_balances')
    .upsert(
      {
        player_id: playerId,
        virtual_balance: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'player_id', ignoreDuplicates: true },
    )
    .select('virtual_balance')
    .maybeSingle();

  if (!error && data) return (data.virtual_balance as number) ?? 0;
  return (await fetchCoins(playerId)) ?? 0;
}

/** Write the authoritative coin balance. */
export async function upsertCoins(playerId: string, coins: number): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('player_balances').upsert(
    { player_id: playerId, virtual_balance: coins, updated_at: new Date().toISOString() },
    { onConflict: 'player_id' },
  );
  if (error) console.warn('[wallet] balance upsert failed:', error.message);
}

/**
 * Whether money can reach a reviewer at all. False means no Supabase is
 * configured, so there is no queue and no approval — the deposit store falls
 * back to crediting locally and the withdrawal store to settling locally, so
 * the arena stays testable offline.
 */
export function isDepositBackendAvailable(): boolean {
  return getSupabase() !== null;
}

/** Columns of public.crypto_deposits, mapped both ways below. */
interface DepositRow {
  id: string;
  player_id: string;
  pack_id: string;
  coins: number | null;
  asset_id: string;
  symbol: string;
  network: string;
  expected_usd: number | null;
  address: string;
  memo: string | null;
  txid: string;
  status: DepositStatus;
  note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const DEPOSIT_COLUMNS =
  'id, player_id, pack_id, coins, asset_id, symbol, network, expected_usd, address, memo, txid, status, note, created_at, reviewed_at';

function rowToDeposit(row: DepositRow): CryptoDeposit {
  return {
    id: row.id,
    playerId: row.player_id,
    packId: row.pack_id,
    coins: row.coins,
    assetId: row.asset_id,
    symbol: row.symbol,
    network: row.network,
    expectedUsd: row.expected_usd,
    address: row.address,
    memo: row.memo,
    txid: row.txid,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

/**
 * Park a deposit server-side so money is never tracked only in a browser.
 * Guest ids are not UUIDs and the column would reject them — real payment
 * history only exists for signed-in players. The status written here is
 * always the row's current one; `paid` can only arrive from the RPC.
 *
 * The insert is also where a second claim of the same hash is refused: a
 * trigger raises 23505 while that hash is pending or paid, so the answer
 * here decides whether the claim exists at all.
 */
export interface SavedDeposit {
  ok: boolean;
  error: string | null;
}

export async function saveCryptoDeposit(
  playerId: string,
  deposit: CryptoDeposit,
): Promise<SavedDeposit> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Deposits are not available offline.' };
  if (!UUID_RE.test(playerId)) {
    return { ok: false, error: 'Sign in with a full account to deposit.' };
  }

  const { error } = await sb.from('crypto_deposits').upsert(
    {
      id: deposit.id,
      player_id: playerId,
      pack_id: deposit.packId,
      coins: deposit.coins,
      asset_id: deposit.assetId,
      symbol: deposit.symbol,
      network: deposit.network,
      expected_usd: deposit.expectedUsd,
      address: deposit.address,
      memo: deposit.memo,
      txid: deposit.txid,
      status: deposit.status,
      note: deposit.note,
      created_at: deposit.createdAt,
      reviewed_at: deposit.reviewedAt,
    },
    { onConflict: 'id' },
  );

  if (error) {
    console.warn('[wallet] deposit save failed:', error.message);
    // 23505 is the one-hash-one-claim rule. It can come from the trigger or
    // from the open-claim unique index, which both mean the same thing to the
    // player, so the sentence is written once here.
    if (error.code === '23505') {
      return {
        ok: false,
        error:
          'That transaction hash is already claimed — it is under review or already credited. If an earlier claim was rejected, you can submit it again.',
      };
    }
    return { ok: false, error: 'The claim could not be saved. Try again in a moment.' };
  }

  return { ok: true, error: null };
}

/**
 * A player's own deposits, newest first. Null means the read was unavailable
 * (offline build), which the caller distinguishes from an empty history.
 */
export async function fetchMyDeposits(playerId: string): Promise<CryptoDeposit[] | null> {
  const sb = getSupabase();
  if (!sb || !UUID_RE.test(playerId)) return null;

  const { data, error } = await sb
    .from('crypto_deposits')
    .select(DEPOSIT_COLUMNS)
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('[wallet] deposit read failed:', error.message);
    return null;
  }
  return (data as DepositRow[]).map(rowToDeposit);
}

/**
 * The review queue for the admin screen. RLS lets an admin read every row and
 * nobody else's, so a non-admin calling this simply gets their own back.
 */
export async function fetchDepositQueue(): Promise<CryptoDeposit[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('crypto_deposits')
    .select(DEPOSIT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.warn('[wallet] deposit queue read failed:', error.message);
    return null;
  }
  return (data as DepositRow[]).map(rowToDeposit);
}

/**
 * Usernames for the ids in a money queue, so a reviewer reads names instead
 * of UUIDs. Neither table has a foreign key, so this is a second query rather
 * than an embed; a missing profile just falls back to the raw id.
 */
export async function fetchPlayerNames(playerIds: string[]): Promise<Record<string, string>> {
  const sb = getSupabase();
  if (!sb || playerIds.length === 0) return {};

  const { data, error } = await sb
    .from('profiles')
    .select('id, username')
    .in('id', playerIds);

  if (error) {
    console.warn('[wallet] profile names read failed:', error.message);
    return {};
  }
  return (data as { id: string; username: string | null }[]).reduce<Record<string, string>>(
    (names, row) => {
      names[row.id] = row.username ?? row.id;
      return names;
    },
    {},
  );
}

export interface ReviewResult {
  ok: boolean;
  /** Coins moved by the call: credited by a deposit approval, returned by a
   *  withdrawal rejection. 0 for a rejection or a failure. */
  coins: number;
  error: string | null;
}

const NOTHING_DONE: ReviewResult = { ok: false, coins: 0, error: 'Money review is not available offline.' };

/**
 * Approve a deposit: the reviewer names the coin amount, and the RPC flips the
 * row, stamps that amount onto it, and credits the wallet in one transaction —
 * so a double click cannot pay twice and no client can credit itself. Returns
 * the coins credited.
 */
export async function approveDeposit(
  depositId: string,
  coins: number,
  paymentRef?: string,
): Promise<ReviewResult> {
  const sb = getSupabase();
  if (!sb) return NOTHING_DONE;

  const credit = Math.floor(coins);
  if (!Number.isFinite(credit) || credit <= 0) {
    return { ok: false, coins: 0, error: 'Enter a positive coin amount to credit.' };
  }

  const { data, error } = await sb.rpc('approve_crypto_deposit', {
    p_id: depositId,
    p_coins: credit,
    p_ref: paymentRef?.trim() || null,
  });

  if (error) return { ok: false, coins: 0, error: error.message };
  const moved = typeof data === 'number' ? data : 0;
  if (moved <= 0) {
    return { ok: false, coins: 0, error: 'Nothing to do — that deposit is not pending.' };
  }
  return { ok: true, coins: moved, error: null };
}

/** Reject a deposit with the reason the player is shown. Credits nothing. */
export async function rejectDeposit(depositId: string, note: string): Promise<ReviewResult> {
  const sb = getSupabase();
  if (!sb) return NOTHING_DONE;

  const { data, error } = await sb.rpc('reject_crypto_deposit', {
    p_id: depositId,
    p_note: note.trim() || 'Rejected.',
  });

  if (error) return { ok: false, coins: 0, error: error.message };
  if (data !== true) {
    return { ok: false, coins: 0, error: 'Nothing to do — that deposit is not pending.' };
  }
  return { ok: true, coins: 0, error: null };
}

/* -------------------------------------------------------------------------- */
/* Withdrawals                                                                */
/* -------------------------------------------------------------------------- */

/** Columns of public.crypto_withdrawals, mapped both ways below. */
interface WithdrawRow {
  id: string;
  player_id: string;
  coins: number;
  gross_usd: number;
  fee_usd: number;
  net_usd: number;
  asset_id: string;
  symbol: string;
  network: string;
  address: string;
  memo: string | null;
  status: WithdrawalStatus;
  note: string | null;
  first_approved_by: string | null;
  first_approved_at: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const WITHDRAW_COLUMNS =
  'id, player_id, coins, gross_usd, fee_usd, net_usd, asset_id, symbol, network, address, memo, status, note, first_approved_by, first_approved_at, created_at, reviewed_at';

function rowToWithdraw(row: WithdrawRow): WithdrawRequest {
  return {
    id: row.id,
    playerId: row.player_id,
    coins: row.coins,
    grossUsd: row.gross_usd,
    feeUsd: row.fee_usd,
    netUsd: row.net_usd,
    assetId: row.asset_id,
    symbol: row.symbol,
    network: row.network,
    address: row.address,
    memo: row.memo,
    status: row.status,
    note: row.note,
    firstApprovedBy: row.first_approved_by,
    firstApprovedAt: row.first_approved_at,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

export interface NewWithdrawRpc {
  coins: number;
  assetId: string;
  address: string;
  memo?: string | null;
}

/** Columns a database that has not run the admin-operations SQL still has. */
const WITHDRAW_COLUMNS_LEGACY =
  'id, player_id, coins, gross_usd, fee_usd, net_usd, asset_id, symbol, network, address, memo, status, note, created_at, reviewed_at';

/** Postgres' "undefined column" — the shape of a half-migrated database. */
const UNDEFINED_COLUMN = '42703';

/**
 * Read payout rows, tolerating a database that predates the dual-approval
 * columns. Losing the queue because two columns are missing would leave
 * real money unpayable, so the second read drops them and the UI simply
 * reports no signature on file.
 */
async function readWithdrawals(
  build: (
    columns: string,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>,
): Promise<WithdrawRequest[] | null> {
  let result = await build(WITHDRAW_COLUMNS);

  if (result.error?.code === UNDEFINED_COLUMN) {
    console.warn('[wallet] withdrawal columns missing — reading the legacy shape.');
    result = await build(WITHDRAW_COLUMNS_LEGACY);
  }

  if (result.error) {
    console.warn('[wallet] withdrawal read failed:', result.error.message);
    return null;
  }

  return ((result.data ?? []) as WithdrawRow[]).map(rowToWithdraw);
}

/**
 * Escrow coins and queue a payout in one round trip. The RPC — not this
 * client — works out the dollars from the coin count and takes the balance
 * down, so a tampered request cannot invent a rate, dodge the fee, or spend
 * coins it is already holding out for a payout. Returns the row id on success.
 */
export async function requestCryptoWithdraw(
  playerId: string,
  input: NewWithdrawRpc,
): Promise<{ id: string | null; error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { id: null, error: 'Withdrawals are not available offline.' };
  if (!UUID_RE.test(playerId)) return { id: null, error: 'Sign in with a full account to withdraw.' };

  const { data, error } = await sb.rpc('request_crypto_withdraw', {
    p_player_id: playerId,
    p_coins: input.coins,
    p_asset_id: input.assetId,
    p_address: input.address.trim(),
    p_memo: input.memo?.trim() || null,
  });

  if (error) return { id: null, error: error.message };
  const id = typeof data === 'string' ? data : null;
  if (!id) return { id: null, error: 'The payout could not be queued.' };
  return { id, error: null };
}

/**
 * A player's own payouts, newest first. Null means the read was unavailable
 * (offline build), which the caller distinguishes from an empty history.
 */
export async function fetchMyWithdrawals(playerId: string): Promise<WithdrawRequest[] | null> {
  const sb = getSupabase();
  if (!sb || !UUID_RE.test(playerId)) return null;

  return readWithdrawals((columns) =>
    sb
      .from('crypto_withdrawals')
      .select(columns)
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(50),
  );
}

/** The payout queue for the admin screen; RLS narrows it to an admin's eyes. */
export async function fetchWithdrawQueue(): Promise<WithdrawRequest[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  return readWithdrawals((columns) =>
    sb
      .from('crypto_withdrawals')
      .select(columns)
      .order('created_at', { ascending: false })
      .limit(200),
  );
}

/**
 * What a payout approval did. `awaiting_second` means the row is above the
 * dual-approval threshold and the first admin's signature is now on it.
 */
export type WithdrawApprovalState = 'paid' | 'awaiting_second' | 'none';

export interface WithdrawApproval extends ReviewResult {
  state: WithdrawApprovalState;
}

/**
 * Sign off a payout as paid once it has been sent on-chain. Coins are already
 * out of the wallet — this only closes the row, so it moves nothing. A payout
 * at or above the threshold parks with this admin's signature and waits for a
 * second, different admin.
 */
export async function approveWithdraw(
  withdrawId: string,
  txRef?: string,
): Promise<WithdrawApproval> {
  const sb = getSupabase();
  if (!sb) return { ...NOTHING_DONE, state: 'none' };

  const { data, error } = await sb.rpc('approve_crypto_withdraw', {
    p_id: withdrawId,
    p_ref: txRef?.trim() || null,
  });

  if (error) return { ok: false, coins: 0, error: error.message, state: 'none' };

  if (data === 'paid') return { ok: true, coins: 0, error: null, state: 'paid' };
  if (data === 'awaiting_second') {
    return { ok: true, coins: 0, error: null, state: 'awaiting_second' };
  }

  return {
    ok: false,
    coins: 0,
    error: 'Nothing to do — that withdrawal is not pending.',
    state: 'none',
  };
}

/**
 * Turn a payout down and return the escrowed coins. The refund happens in the
 * same SQL transaction as the status flip, so a rejection can never strand a
 * player's coins in an escrow that no longer exists.
 */
export async function rejectWithdraw(withdrawId: string, note: string): Promise<ReviewResult> {
  const sb = getSupabase();
  if (!sb) return NOTHING_DONE;

  const { data, error } = await sb.rpc('reject_crypto_withdraw', {
    p_id: withdrawId,
    p_note: note.trim() || 'Rejected.',
  });

  if (error) return { ok: false, coins: 0, error: error.message };
  const coins = typeof data === 'number' ? data : 0;
  if (coins <= 0) {
    return { ok: false, coins: 0, error: 'Nothing to do — that withdrawal is not pending.' };
  }
  return { ok: true, coins, error: null };
}
