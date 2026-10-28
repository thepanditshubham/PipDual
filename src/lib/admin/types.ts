/**
 * types.ts
 * Shapes the admin console reads back from Postgres. Everything here mirrors
 * a table or an RPC in supabase/setup.sql — the console never invents a
 * balance, only displays what the database last wrote.
 */

/** What moved the coins. Mirrors the wallet_ledger.kind check constraint. */
export type LedgerKind = 'deposit' | 'payout' | 'payout_refund' | 'adjustment' | 'referral';

/** One row of public.wallet_ledger. `coins` is signed. */
export interface LedgerEntry {
  id: number;
  playerId: string;
  kind: LedgerKind;
  /** Positive credits the wallet, negative debits it. */
  coins: number;
  /** The wallet once this row was applied. */
  balanceAfter: number | null;
  reason: string | null;
  refType: string | null;
  refId: string | null;
  /** The admin behind a manual adjustment. */
  actorId: string | null;
  createdAt: string;
}

/** Account lock state. `banned` is the terminal form of `suspended`. */
export type PlayerStatus = 'active' | 'suspended' | 'banned';

/** A profile + its wallet, which is what the player directory lists. */
export interface AdminPlayer {
  id: string;
  username: string;
  displayName: string | null;
  rating: number;
  role: 'user' | 'admin';
  status: PlayerStatus;
  statusNote: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  coins: number;
}

/** A finished duel from one player's point of view. */
export interface PlayerDuel {
  id: string;
  mode: 'standard' | 'risk';
  status: string;
  /** The listed player's score, and the opponent's. */
  score: number | null;
  opponentScore: number | null;
  opponentId: string | null;
  opponentName: string;
  opponentIsBot: boolean;
  outcome: 'win' | 'loss' | 'draw' | 'open';
  createdAt: string;
}

/** Result of a money-moving admin action. */
export interface AdminResult<T = void> {
  ok: boolean;
  value: T | null;
  error: string | null;
}

export const FAILED: AdminResult<never> = {
  ok: false,
  value: null,
  error: 'The admin backend is not available offline.',
};
