/**
 * deposit.ts
 * Pure deposit maths and validation. Nothing here credits a wallet: a deposit
 * is created `pending` and only a reviewer's approval (an admin RPC, not this
 * file) moves coins. Everything the UI asks about amounts, addresses, hashes
 * and explorer links is answered here so the rules are testable alone.
 */
import {
  COINS_PER_USD,
  COIN_PACKS,
  MAX_DEPOSIT_USD,
  MIN_DEPOSIT_USD,
  cryptoAssets,
} from './config';
import type { CoinPackDef, CryptoAssetDef, CryptoDeposit } from './types';

/** Transaction-hash shapes per rail, loose enough for testnet ids. */
const TXID_PATTERNS: Record<string, RegExp> = {
  btc: /^[0-9a-fA-F]{64}$/,
  eth: /^0x[0-9a-fA-F]{64}$/,
  'usdt-erc20': /^0x[0-9a-fA-F]{64}$/,
  'usdt-bep20': /^0x[0-9a-fA-F]{64}$/,
  'usdt-trc20': /^([0-9a-fA-F]{64}|[0-9]{1,20})$/,
  sol: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  xrp: /^[0-9a-fA-F]{64}$/,
};

/** Coin value of a dollar amount. Fractional dust never reaches the wallet. */
export function coinsFor(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.floor(usd * COINS_PER_USD);
}

/** Dollar value of a coin balance, for showing what a tier is worth. */
export function usdFor(coins: number): number {
  if (!Number.isFinite(coins) || coins <= 0) return 0;
  return coins / COINS_PER_USD;
}

/** Named coin tier by id, or null when the id is not on the menu. */
export function packFor(packId: string): CoinPackDef | null {
  return COIN_PACKS.find((pack) => pack.id === packId) ?? null;
}

/** Rail by id, including rails with no address configured. */
export function assetFor(assetId: string): CryptoAssetDef | null {
  return cryptoAssets().find((asset) => asset.id === assetId) ?? null;
}

/** Rails the arena can actually be paid on — an unset address hides the asset. */
export function acceptedAssets(): CryptoAssetDef[] {
  return cryptoAssets().filter((asset) => asset.address.length > 0);
}

/** Reason the rail cannot be paid to right now: unknown, or no address set. */
export function validateAsset(assetId: string): string | null {
  const asset = assetFor(assetId);
  if (!asset) return 'Choose a coin and network.';
  if (asset.address.length === 0) {
    return `${asset.symbol} on ${asset.network} is not accepting deposits yet — pick another rail.`;
  }
  return null;
}

/** Reason the tier cannot be deposited, or null when it can. */
export function validatePack(packId: string): string | null {
  const pack = packFor(packId);
  if (!pack) return 'Choose a coin pack.';
  if (pack.usd < MIN_DEPOSIT_USD) {
    return `Minimum deposit is ${formatUsd(MIN_DEPOSIT_USD)}.`;
  }
  if (pack.usd > MAX_DEPOSIT_USD) {
    return `Maximum single deposit is ${formatUsd(MAX_DEPOSIT_USD)}.`;
  }
  return null;
}

/**
 * Reason the pasted hash is unusable. This only checks shape: a well-formed
 * hash is still not proof of payment, which is why the row stays pending.
 */
export function validateTxId(assetId: string, txid: string): string | null {
  const asset = assetFor(assetId);
  if (!asset) return 'Choose a coin and network.';

  const trimmed = txid.trim();
  if (!trimmed) return 'Paste the transaction hash (TxID) of the payment.';
  if (/\s/.test(trimmed)) return 'A TxID cannot contain spaces.';

  const pattern = TXID_PATTERNS[asset.id];
  if (pattern && !pattern.test(trimmed)) {
    return `That does not look like a ${asset.symbol} transaction hash.`;
  }
  return null;
}

/** Memo / destination tag is mandatory on shared-address rails. */
export function validateMemo(assetId: string, memo: string): string | null {
  const asset = assetFor(assetId);
  if (!asset?.memoRequired) return null;
  return memo.trim() ? null : `${asset?.symbol} needs the memo / destination tag shown with the address.`;
}

/**
 * Destination tag / memo for a shared house address, derived from the account
 * id so it is stable per player and needs no server-side allocation. XRPL
 * tags are 32-bit integers, hence the modulo; a reviewer maps tag to player
 * the same way. Collisions are possible above ~77k accounts, so the admin
 * queue always shows the account id beside the tag.
 */
export function memoForUser(userId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return String((hash % 0xfffffffe) + 1);
}

/**
 * What the player has to send. Stablecoins are quoted in whole units because
 * $10 of USDT is exactly 10 USDT; volatile assets can only be quoted as a USD
 * value, since their coin amount moves with the market until confirmed.
 */
export function expectedAmountText(asset: CryptoAssetDef, usd: number): string {
  if (asset.stable) {
    return `${usd.toFixed(asset.decimals)} ${asset.symbol}`;
  }
  return `≈ ${formatUsd(usd)} worth of ${asset.symbol}`;
}

/** Public explorer URL for a hash; empty when the rail is unknown. */
export function explorerUrl(assetId: string, txid: string): string {
  const asset = assetFor(assetId);
  if (!asset || !txid.trim()) return '';
  return asset.explorerTx(txid.trim());
}

export interface NewDepositInput {
  packId: string;
  assetId: string;
  txid: string;
  memo?: string;
}

/**
 * A deposit a player submits. There is no amount: they pick a rail, send
 * whatever they like to the house address, and paste the TxID. A reviewer
 * confirms the transfer on-chain and names the coin amount when approving.
 */
export interface DepositSubmission {
  assetId: string;
  txid: string;
  memo?: string;
}

/**
 * Build a pending deposit from a validated pack + rail pair. Throws on an
 * unknown pack or an unconfigured rail rather than writing a row that no
 * reviewer could honour; shape errors are caught by the panel first.
 */
export function newCryptoDeposit(
  input: NewDepositInput,
  now: Date = new Date(),
): CryptoDeposit {
  const pack = packFor(input.packId);
  if (!pack) throw new Error(`Unknown coin pack: ${input.packId}`);

  const asset = assetFor(input.assetId);
  if (!asset) throw new Error(`Unknown deposit asset: ${input.assetId}`);
  if (!asset.address.trim()) throw new Error(`${asset.symbol} deposits are not configured`);

  return {
    id: `dep_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    packId: pack.id,
    coins: pack.coins,
    assetId: asset.id,
    symbol: asset.symbol,
    network: asset.network,
    expectedUsd: pack.usd,
    address: asset.address,
    memo: asset.memoRequired ? (input.memo?.trim() || null) : null,
    txid: input.txid.trim(),
    status: 'pending',
    note: null,
    createdAt: now.toISOString(),
    reviewedAt: null,
  };
}

/**
 * Build a pending deposit from a validated rail + TxID. No coins and no USD
 * value are attached yet — the reviewer sets those at approval — so the row is
 * purely a claim to check. Throws on an unconfigured rail rather than writing a
 * row no reviewer could honour; shape is caught by the form first.
 */
export function newDeposit(
  input: DepositSubmission,
  now: Date = new Date(),
): CryptoDeposit {
  const asset = assetFor(input.assetId);
  if (!asset) throw new Error(`Unknown deposit asset: ${input.assetId}`);
  if (!asset.address.trim()) throw new Error(`${asset.symbol} deposits are not configured`);

  return {
    id: `dep_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    packId: 'custom',
    coins: null,
    assetId: asset.id,
    symbol: asset.symbol,
    network: asset.network,
    expectedUsd: null,
    address: asset.address,
    memo: asset.memoRequired ? (input.memo?.trim() || null) : null,
    txid: input.txid.trim(),
    status: 'pending',
    note: null,
    createdAt: now.toISOString(),
    reviewedAt: null,
  };
}

/** Dollar label used across the deposit UI. */
export function formatUsd(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `$${safe.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
