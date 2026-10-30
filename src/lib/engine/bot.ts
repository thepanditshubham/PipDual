import { rng } from './rng';
import type { Action } from './types';

/** Prints used to measure directional momentum — twenty seconds of the match. */
const LOOKBACK = 20;
/** Prints of history used to scale the trigger to the market's own recent volatility. */
const VOL_WINDOW = 120;
/** Momentum must beat this many typical single-print moves to count as a signal. */
const VOL_MULTIPLE = 2.5;

/**
 * Deterministic bot that only sees past prices.
 * Strategy: momentum entry with SL 0.4% and TP 0.6%, random hold times.
 * The trigger is scaled by the recent average bar move, so the bot still trades
 * on a quiet generated day (a fixed 0.1% threshold never fired at all).
 * The bot is seeded so the same seed produces the same actions.
 */
export function botActions(prices: number[], seed: number): Action[] {
  const rand = rng(seed + 42);
  const actions: Action[] = [];
  let inPosition = false;
  let lastEntryTick = -1;
  const maxTick = prices.length - 2; // Can't act beyond TICKS-2

  for (let t = LOOKBACK + 1; t < maxTick; t++) {
    // Only see past prices
    if (inPosition) {
      // Random hold: close after 20-75 seconds
      const holdTime = t - lastEntryTick;
      const targetHold = 20 + Math.floor(rand() * 56);

      if (holdTime >= targetHold) {
        actions.push({
          t,
          type: 'close',
          size: 1,
        });
        inPosition = false;
        continue;
      }

      // Skip – let SL/TP handle exits
      continue;
    }

    // Not in position – look for momentum signal (~20% chance per tick)
    if (rand() >= 0.2) continue;

    const momentum =
      (prices[t] - prices[t - LOOKBACK]) / prices[t - LOOKBACK];

    // Average single-bar move over the recent window (past data only)
    let volSum = 0;
    let volCount = 0;
    for (let k = Math.max(1, t - VOL_WINDOW); k <= t; k++) {
      volSum += Math.abs(prices[k] - prices[k - 1]) / prices[k - 1];
      volCount++;
    }
    const vol = volCount > 0 ? volSum / volCount : 0;
    const threshold = Math.max(vol * VOL_MULTIPLE, 1e-5);

    if (Math.abs(momentum) > threshold) {
      const size = rand() < 0.3 ? 2 : 1; // 30% chance of size 2

      actions.push({
        t,
        type: momentum > 0 ? 'buy' : 'sell',
        size,
        slPct: 0.4,
        tpPct: 0.6,
      });
      inPosition = true;
      lastEntryTick = t;
    }
  }

  return actions;
}
