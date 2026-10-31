/**
 * config.ts
 * The virtual economy in one place. Coins are game credits: earned by playing,
 * never bought, transferred or redeemed. A Live entry burns coins from the
 * player's balance, and the winner collects the virtual pot minus a sink that
 * keeps the ladder from inflating forever. None of these numbers are money.
 */
import type { MatchDurationId } from '@/lib/engine/constants';

/**
 * Entry fee for a ranked duel, in coins, by ticket length. Longer duels cost
 * more because more of the player's time and rating is on the line. Practice
 * is always free; this table only applies to ranked play.
 */
export const LIVE_FEES: Record<MatchDurationId, number> = {
  '5m': 100,
  '10m': 250,
  '15m': 500,
};

/**
 * Share of the virtual pot that leaves circulation instead of paying the
 * winner. Two entrants put in `stake` each, so the winner receives
 * `2 * stake * (1 - HOUSE_CUT)`. It is a game sink, not a fee, and it cannot
 * be converted to anything.
 */
export const HOUSE_CUT = 0.15;

/** Highest ranked fee, used to warn a player before they queue. */
export const MAX_LIVE_FEE = Math.max(...Object.values(LIVE_FEES));

/**
 * Coins a new account (guest or registered) starts with. Enough for a few
 * ranked entries; more are earned in missions. There is no way to buy more.
 */
export const STARTING_COINS = 1_000;
