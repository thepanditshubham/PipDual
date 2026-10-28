/**
 * withdraw.ts
 * Pure payout rules — how coins convert back to money, what a legal payout
 * address looks like on each rail, and how the network fee is applied.
 *
 * Nothing here moves a coin. The withdrawal store is the only stateful
 * surface, and even it does not decide payouts: `request_crypto_withdraw()`
 * in Postgres re-derives the numbers from the coin count, so a hand-crafted
 * request cannot quote itself a better rate or a smaller fee.
 */

import {
  COINS_PER_USD,
  MIN_WITHDRAW_USD,
  WITHDRAW_FEE_USD,
  WITHDRAW_RAIL_IDS,
  cryptoAssets,
} from './config';
import type { CryptoAssetDef, WithdrawRequest } from './types';

/* -------------------------------------------------------------------------- */
/* Rails                                                                      */
/* -------------------------------------------------------------------------- */

/** Rails the arena pays out on, in display order. A rail only appears here
 *  once its deposit address is configured — the same wallet that receives is
 *  the one that sends, so an unconfigured rail means no payout capacity. */
export function withdrawRails(): CryptoAssetDef[] {
  const byId = new Map(cryptoAssets().map((asset) => [asset.id, asset]));
  return WITHDRAW_RAIL_IDS.map((id) => byId.get(id)).filter(
    (asset): asset is CryptoAssetDef => !!asset && asset.address.length > 0
  );
}

export function railFor(assetId: string): CryptoAssetDef | undefined {
  return withdrawRails().find((asset) => asset.id === assetId);
}

/* -------------------------------------------------------------------------- */
/* Conversion                                                                 */
/* -------------------------------------------------------------------------- */

/** Coins a player must escrow to clear the withdrawal floor. */
export const MIN_WITHDRAW_COINS = MIN_WITHDRAW_USD * COINS_PER_USD;

export interface WithdrawalBreakdown {
  coins: number;
  grossUsd: number;
  feeUsd: number;
  /** What lands in the player's wallet. Never negative. */
  netUsd: number;
  /** True when the payout would not survive its own fee. */
  belowFloor: boolean;
}

/**
 * Splits an escrowed coin amount into gross / fee / net. The fee is taken out
 * of the payout rather than charged on top, which is why a player can withdraw
 * without holding gas on the chain they are paid on.
 *
 * Named apart from `payoutFor()` in stakes.ts, which answers the other
 * direction — what a won duel pays out in coins.
 */
export function withdrawalBreakdown(coins: number): WithdrawalBreakdown {
  const whole = Number.isFinite(coins) ? Math.max(0, Math.round(coins)) : 0;
  const gross = round2(whole / COINS_PER_USD);
  const net = round2(Math.max(0, gross - WITHDRAW_FEE_USD));
  return {
    coins: whole,
    grossUsd: gross,
    feeUsd: WITHDRAW_FEE_USD,
    netUsd: net,
    belowFloor: gross < MIN_WITHDRAW_USD || net <= 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

// Payout addresses are player-supplied, so the shape check is the only thing
// standing between a typo and money going where nobody can spend it.
const PAYOUT_ADDRESS_PATTERNS: Record<string, RegExp> = {
  'usdt-bep20': /^0x[0-9a-fA-F]{40}$/,
  'usdt-trc20': /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
};

const PAYOUT_ADDRESS_HINT: Record<string, string> = {
  'usdt-bep20': 'a 42-character BSC address starting with 0x',
  'usdt-trc20': 'a 34-character Tron address starting with T',
};

export function validatePayoutAddress(assetId: string, address: string): string | null {
  const rail = railFor(assetId) ?? cryptoAssets().find((a) => a.id === assetId);
  if (!rail) return 'Choose which network the payout should travel over.';
  const trimmed = address.trim();
  if (!trimmed) return 'Enter the address the payout should go to.';
  const pattern = PAYOUT_ADDRESS_PATTERNS[assetId];
  if (pattern && !pattern.test(trimmed)) {
    return `That is not a valid ${rail.network} address — expected ${PAYOUT_ADDRESS_HINT[assetId] ?? 'the address format for that chain'}.`;
  }
  if (trimmed.toLowerCase() === rail.address.toLowerCase()) {
    return 'That is the arena\'s own deposit address. Send to a wallet you control.';
  }
  return null;
}

/** Optional memo/tag. Only meaningful when the receiving address belongs to
 *  an exchange that shares one account across players. */
export function validatePayoutMemo(memo: string): string | null {
  const trimmed = memo.trim();
  if (trimmed.length > 32) return 'That tag is too long — keep it under 32 characters.';
  return null;
}

/** Every rule a payout request must satisfy, first failure wins. */
export function validateWithdraw(
  coins: number,
  assetId: string,
  address: string,
  balance: number,
  memo = ''
): string | null {
  if (!Number.isFinite(coins) || coins <= 0) return 'Enter an amount to withdraw.';
  const payout = withdrawalBreakdown(coins);
  if (payout.belowFloor) {
    return `The minimum withdrawal is ${MIN_WITHDRAW_USD} dollars (${MIN_WITHDRAW_COINS} coins).`;
  }
  if (coins > balance) {
    return `You hold ${balance.toLocaleString()} coins — ${coins.toLocaleString()} would leave the arena.`;
  }
  if (!railFor(assetId)) return 'That network is not accepting payouts right now.';
  return validatePayoutAddress(assetId, address) ?? validatePayoutMemo(memo);
}

/* -------------------------------------------------------------------------- */
/* Construction                                                               */
/* -------------------------------------------------------------------------- */

export interface NewWithdrawInput {
  coins: number;
  assetId: string;
  address: string;
  memo?: string;
}

/** Builds a pending payout request. Throws when a rule is broken so no call
 *  site can persist a withdrawal that quotes itself a different deal. */
export function newWithdrawRequest(
  input: NewWithdrawInput,
  now: Date = new Date()
): WithdrawRequest {
  const rail = railFor(input.assetId);
  if (!rail) throw new Error('Unknown payout rail');

  const payout = withdrawalBreakdown(input.coins);
  if (payout.belowFloor) throw new Error('Below the withdrawal minimum');

  const address = input.address.trim();
  if (!PAYOUT_ADDRESS_PATTERNS[rail.id] || !PAYOUT_ADDRESS_PATTERNS[rail.id].test(address)) {
    throw new Error('Payout address is not valid for that network');
  }

  return {
    id: `wd_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    coins: payout.coins,
    grossUsd: payout.grossUsd,
    feeUsd: payout.feeUsd,
    netUsd: payout.netUsd,
    assetId: rail.id,
    symbol: rail.symbol,
    network: rail.network,
    address,
    memo: input.memo?.trim() || null,
    status: 'pending',
    note: null,
    createdAt: now.toISOString(),
    reviewedAt: null,
  };
}
