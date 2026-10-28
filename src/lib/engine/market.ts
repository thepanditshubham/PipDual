import { rng } from './rng';
import { TICKS } from './constants';
import type { Candle } from './types';

/**
 * Generate a seeded price walk starting at 1000.
 * Regime changes (drift + volatility re-roll) happen with ~4% chance per tick.
 * 3-sample noise averaging smooths the walk.
 * Returns TICKS + 2 prices (extra for next-tick fills at boundaries).
 */
export function makeTicks(seed: number): number[] {
  const rand = rng(seed);
  const length = TICKS + 2;
  const prices: number[] = [1000];

  let drift = (rand() - 0.5) * 0.002; // initial drift
  let volatility = 0.001 + rand() * 0.003; // initial volatility

  for (let i = 1; i < length; i++) {
    // Regime change with ~4% probability
    if (rand() < 0.04) {
      drift = (rand() - 0.5) * 0.004;
      volatility = 0.001 + rand() * 0.005;
    }

    // 3-sample noise averaging
    const noise =
      ((rand() - 0.5) + (rand() - 0.5) + (rand() - 0.5)) / 3;

    const change = drift + volatility * noise;
    const prev = prices[i - 1];
    prices.push(Math.max(1, prev * (1 + change)));
  }

  return prices;
}

/**
 * Aggregate tick-level prices into OHLC candles.
 * @param ticks - array of prices (one per tick)
 * @param timeframeTicks - number of ticks per candle (1=tick, 10=5s, 30=15s, 60=30s)
 */
export function toCandles(ticks: number[], timeframeTicks: number): Candle[] {
  const candles: Candle[] = [];

  for (let i = 0; i < ticks.length; i += timeframeTicks) {
    const slice = ticks.slice(i, i + timeframeTicks);
    if (slice.length === 0) break;

    candles.push({
      time: i,
      open: slice[0],
      high: Math.max(...slice),
      low: Math.min(...slice),
      close: slice[slice.length - 1],
    });
  }

  return candles;
}

/**
 * Apply blind-market transformations to a price array:
 * - Rebase to 1000
 * - Optionally invert (flip direction)
 * - Scale volatility ±20%
 */
export function blindTransform(
  ticks: number[],
  matchSeed: number,
): number[] {
  const rand = rng(matchSeed + 9999);
  const shouldInvert = rand() < 0.5;
  const volScale = 0.8 + rand() * 0.4; // 0.8 to 1.2

  const base = ticks[0];
  const rebased = ticks.map((p) => p / base);

  if (shouldInvert) {
    // Invert: 2 - normalised price (mirrors around 1.0)
    const inverted = rebased.map((p) => 2 - p);
    // Scale volatility around the mean
    const mean = inverted.reduce((a, b) => a + b, 0) / inverted.length;
    return inverted.map((p) => (mean + (p - mean) * volScale) * 1000);
  }

  // Scale volatility around the mean
  const mean = rebased.reduce((a, b) => a + b, 0) / rebased.length;
  return rebased.map((p) => (mean + (p - mean) * volScale) * 1000);
}
