/**
 * stakes.ts
 * Pure pot maths. No store, no Supabase, no React — the numbers a Live duel
 * pays out are decided here so they can be reasoned about and tested alone.
 *
 * A Live duel is two equal entries: each player pays `stake`, the arena burns
 * HOUSE_CUT of the pool, and the winner collects the rest. A draw returns each
 * player their own entry — nobody profits from a tie, nobody loses it.
 */
import { HOUSE_CUT, LIVE_FEES } from './config';
import type { MatchDurationId } from '@/lib/engine/constants';

export type DuelOutcome = 'win' | 'loss' | 'draw';

/** Entry fee in coins for a ticket length; unknown lengths price as the 5m game. */
export function liveFeeFor(duration: string | null | undefined): number {
  if (duration && duration in LIVE_FEES) return LIVE_FEES[duration as MatchDurationId];
  return LIVE_FEES['5m'];
}

/**
 * What the winner collects, given one player's stake. Both entries are in the
 * pool, so a win pays close to double the stake and a loss pays nothing.
 */
export function potFor(stake: number): number {
  if (stake <= 0) return 0;
  return Math.floor(2 * stake * (1 - HOUSE_CUT));
}

/** Coins the arena burns from a pot of the given stake (rounded the same way). */
export function houseBurnFor(stake: number): number {
  if (stake <= 0) return 0;
  return 2 * stake - potFor(stake);
}

/** Net coins a player walks away with after one finished duel. */
export function payoutFor(outcome: DuelOutcome, stake: number): number {
  if (stake <= 0) return 0;
  if (outcome === 'win') return potFor(stake);
  if (outcome === 'draw') return stake;
  return 0;
}

/**
 * Change in the player's balance across the whole match: the entry is paid on
 * pairing, the payout is collected on settlement.
 */
export function netFor(outcome: DuelOutcome, stake: number): number {
  return payoutFor(outcome, stake) - stake;
}
