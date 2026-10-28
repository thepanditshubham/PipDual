/**
 * types.ts
 * The economy has one currency (coins) and two money movements: a deposit,
 * which a reviewer verifies before it credits anything, and a withdrawal,
 * which escrows coins the moment it is requested and pays out only once an
 * admin signs it off. Both sit inert until a human acts on them.
 */

/**
 * Deposit lifecycle. There is no 'failed': a payment the reviewer cannot match
 * to this platform is `rejected` with a note, because on-chain transfers are
 * not something the arena can reverse.
 */
export type DepositStatus = 'pending' | 'paid' | 'rejected';

/** A deposit row, mirroring public.crypto_deposits. */
export interface CryptoDeposit {
  id: string;
  /**
   * Owner of the row. Set when read back from Supabase and absent on a
   * deposit just created locally — the admin queue needs it to name players.
   */
  playerId?: string;
  /** Which rail paid in. A submission carries no preset tier, so this is
   *  always 'custom'; kept for the admin label and the NOT NULL column. */
  packId: string;
  /**
   * Coins credited. Null while a submission only names a TxID — the reviewer
   * decides the amount and approves it, at which point this becomes a number.
   */
  coins: number | null;
  /** Asset rail id, e.g. 'usdt-trc20'. */
  assetId: string;
  symbol: string;
  network: string;
  /**
   * USD value the reviewer credited the deposit at, derived from the coins.
   * Null until approved — the player no longer declares an amount, so there is
   * nothing to expect until a human names one.
   */
  expectedUsd: number | null;
  /** House address shown to the player, snapshotted at submit time. */
  address: string;
  /** Destination tag / memo. Required on rails that share one address. */
  memo: string | null;
  /** Transaction hash the player pasted. Never trusted, only verified. */
  txid: string;
  status: DepositStatus;
  /** Admin note: a payment reference when paid, a reason when rejected. */
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

/*
 * Withdrawal lifecycle. `pending` means the coins are already escrowed — they
 * are out of the player's spendable balance and waiting on a payout. A
 * rejection puts them back; there is no other way for escrow to return.
 */
export type WithdrawalStatus = 'pending' | 'paid' | 'rejected';

/** A payout request, mirroring public.crypto_withdrawals. */
export interface WithdrawRequest {
  id: string;
  /** Set when read back from Supabase; absent on a locally created request. */
  playerId?: string;
  /** Coins escrowed for this payout. */
  coins: number;
  /** Coins converted at face value, before the fee. */
  grossUsd: number;
  /** On-chain fee taken off the payout, never added on top. */
  feeUsd: number;
  /** What the player actually receives. */
  netUsd: number;
  assetId: string;
  symbol: string;
  network: string;
  /** Where the player asked for the money to go. */
  address: string;
  memo: string | null;
  status: WithdrawalStatus;
  /** TxID of the payout when paid; the reason when rejected. */
  note: string | null;
  /**
   * First of two signatures on a large payout. Set while the row is still
   * pending; the second admin closes it.
   */
  firstApprovedBy?: string | null;
  firstApprovedAt?: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

/** Preset coin tiers offered on the deposit screen. */
export interface CoinPackDef {
  id: string;
  label: string;
  coins: number;
  usd: number;
}

/** A crypto rail the arena can be paid on. */
export interface CryptoAssetDef {
  id: string;
  /** Ticker the player sees, e.g. 'USDT'. */
  symbol: string;
  name: string;
  /** Chain label, e.g. 'TRC20'. */
  network: string;
  /**
   * House address from env. Empty means the arena is not accepting this
   * asset yet, and the UI hides it rather than showing a blank field.
   */
  address: string;
  /** Rails that route by shared address need a tag per player. */
  memoRequired: boolean;
  /** Stablecoins are quoted in units; everything else in USD value. */
  stable: boolean;
  /** Display precision for the amount the player should send. */
  decimals: number;
  /** Public path of a QR image for this rail, shown beside the address. */
  qr?: string;
  /** Explorer template for a transaction hash, used by both panels. */
  explorerTx: (txid: string) => string;
}
