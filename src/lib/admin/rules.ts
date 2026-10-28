/**
 * rules.ts
 * The console's judgement calls, kept pure so they can be tested without a
 * database: when a payout needs a second signature, which deposit rows share
 * a TxID, how often a payout address has been paid before, and how the
 * player / status / date filters narrow a list.
 */
import type { LedgerKind } from './types';

/**
 * A payout at or above this many coins needs two different admins. Mirrors
 * the `v_threshold` constant in approve_crypto_withdraw() — $50 at the flat
 * peg. Change both or neither: the SQL is what actually enforces it.
 */
export const DUAL_APPROVAL_COINS = 5_000;

/** Whether signing this payout off only records the first of two votes. */
export function needsDualApproval(coins: number): boolean {
  return Number.isFinite(coins) && coins >= DUAL_APPROVAL_COINS;
}

/** Money rows the duplicate check looks at: a hash still claims a credit. */
const CLAIMING_STATUSES = ['pending', 'paid'];

interface TxidRow {
  id: string;
  txid: string;
  status: string;
}

/**
 * The other deposit that already holds this transaction hash, if any.
 * approve_crypto_deposit() refuses the credit and a trigger refuses the
 * insert, so this only exists to show the clash before a reviewer clicks.
 */
export function findTxidConflict<T extends TxidRow>(
  rows: T[],
  txid: string,
  selfId?: string,
): T | null {
  const hash = txid.trim().toLowerCase();
  if (!hash) return null;

  return (
    rows.find(
      (row) =>
        row.id !== selfId &&
        row.txid.trim().toLowerCase() === hash &&
        CLAIMING_STATUSES.includes(row.status),
    ) ?? null
  );
}

export interface AddressHistory {
  /** Every earlier request to this address, whatever its status. */
  total: number;
  /** Earlier requests that were actually paid out. */
  paid: number;
}

/**
 * How often this payout address has been used before. Reusing an address is
 * not wrong on its own — a player may own one wallet — but a reviewer should
 * have to look at it before signing, so the queue states the count.
 */
export function addressHistory<T extends { id: string; address: string; status: string }>(
  rows: T[],
  address: string,
  selfId?: string,
): AddressHistory {
  const needle = address.trim().toLowerCase();
  if (!needle) return { total: 0, paid: 0 };

  const earlier = rows.filter(
    (row) => row.id !== selfId && row.address.trim().toLowerCase() === needle,
  );

  return {
    total: earlier.length,
    paid: earlier.filter((row) => row.status === 'paid').length,
  };
}

/** Inclusive `YYYY-MM-DD` bounds. Empty means "no bound on that side". */
export function inDateRange(iso: string | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!iso) return false;

  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;

  if (from) {
    const start = new Date(`${from}T00:00:00`).getTime();
    if (!Number.isNaN(start) && time < start) return false;
  }
  if (to) {
    const end = new Date(`${to}T23:59:59.999`).getTime();
    if (!Number.isNaN(end) && time > end) return false;
  }
  return true;
}

/** Case-insensitive substring match across the fields given. */
export function textMatches(needle: string, ...fields: (string | null | undefined)[]): boolean {
  const query = needle.trim().toLowerCase();
  if (!query) return true;
  return fields.some((field) => (field ?? '').toLowerCase().includes(query));
}

export type LedgerFilter = 'all' | LedgerKind;

/** The ledger's own type filter, layered on top of player and date bounds. */
export function filterLedger<
  T extends { kind: LedgerKind; playerId: string; createdAt: string; reason: string | null },
>(
  rows: T[],
  options: {
    kind: LedgerFilter;
    player: string;
    from: string;
    to: string;
    /** Resolved usernames, so the box matches a name and not just an id. */
    names?: Record<string, string>;
  },
): T[] {
  return rows.filter((row) => {
    if (options.kind !== 'all' && row.kind !== options.kind) return false;
    if (!inDateRange(row.createdAt, options.from, options.to)) return false;
    return textMatches(options.player, row.playerId, row.reason, options.names?.[row.playerId]);
  });
}

/** Ledger +/- split for a summary strip. */
export function sumByDirection(rows: { coins: number }[]): { credited: number; debited: number } {
  return rows.reduce(
    (totals, row) => {
      if (row.coins >= 0) totals.credited += row.coins;
      else totals.debited += Math.abs(row.coins);
      return totals;
    },
    { credited: 0, debited: 0 },
  );
}
