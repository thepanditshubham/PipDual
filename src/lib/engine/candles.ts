import type { Candle } from './types';

/**
 * Candle maths shared by the market generator and the chart.
 *
 * Everything here is pure and uses only + - * / and Math.round/floor/max/min:
 * no transcendental functions, because those are not specified to agree between
 * JavaScript engines, and two duelists must compute identical candles.
 */

/** Exact powers of ten, so rounding never depends on libm behaviour. */
const POW10 = [1, 10, 100, 1000, 10000, 100000, 1000000];

/** Rounds to the instrument's decimal places without floating-point drift. */
export function roundPrice(value: number, digits: number): number {
  const factor = POW10[Math.min(Math.max(digits, 0), POW10.length - 1)];
  return Math.round(value * factor) / factor;
}

/**
 * The smallest price step an instrument can print. Generator maths that needs a
 * "one tick" floor takes it from the pair's decimals rather than a hard-coded number,
 * so the same code is sane on a 2,000-point metal and a 1.08 currency pair alike.
 */
export function minValue(digits: number): number {
  return 1 / POW10[Math.min(Math.max(digits, 0), POW10.length - 1)];
}

/**
 * The candle as it looks part-way through a bar: open is the bar's first tick, high
 * and low are only the extremes printed so far, close is the newest tick. Read from
 * the same tick path that seals into the finished bar, so a live candle can never
 * contradict the candle it becomes — which is what lets a terminal stream a market
 * instead of repainting it.
 */
export function formingBarFromTicks(
  ticks: number[],
  bar: Candle,
  first: number,
  last: number,
  ticksPerBar: number,
): Candle {
  let high = ticks[first];
  let low = ticks[first];
  for (let i = first; i <= last; i++) {
    const price = ticks[i];
    if (price > high) high = price;
    if (price < low) low = price;
  }

  const seenTicks = last - first + 1;
  return {
    time: bar.time,
    open: ticks[first],
    high,
    low,
    close: ticks[last],
    volume: Math.round(((bar.volume || 0) * seenTicks) / ticksPerBar),
  };
}

/**
 * Aggregates 1-minute candles into a larger fixed interval with exact OHLC:
 * open of the first bar, max high, min low, close of the last bar, summed volume.
 * Buckets are anchored to absolute time, so they line up with the axis at any offset.
 */
export function aggregateCandlesStrict(base1m: Candle[], intervalSeconds: number): Candle[] {
  if (intervalSeconds <= 60) return base1m.map((c) => ({ ...c }));

  const buckets = new Map<number, Candle[]>();

  for (const c of base1m) {
    const bucketTime = Math.floor(c.time / intervalSeconds) * intervalSeconds;
    const list = buckets.get(bucketTime);
    if (list) list.push(c);
    else buckets.set(bucketTime, [c]);
  }

  const sortedTimes = Array.from(buckets.keys()).sort((a, b) => a - b);
  const aggregated: Candle[] = [];

  for (const bTime of sortedTimes) {
    const group = buckets.get(bTime)!;
    if (group.length === 0) continue;

    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const bar of group) {
      if (bar.high > high) high = bar.high;
      if (bar.low < low) low = bar.low;
      volume += bar.volume || 0;
    }

    aggregated.push({
      time: bTime,
      open: group[0].open,
      high,
      low,
      close: group[group.length - 1].close,
      volume,
    });
  }

  return aggregated;
}

/**
 * Folds a still-forming 1-minute bar into the aggregated series it belongs to:
 * extends the open bucket, or opens a new one. The forming bar only ever contributes
 * prices the market has already printed, so the bucket's high/low grow and its close
 * crawls — exactly what a live candle does on a real terminal.
 */
export function mergeFormingCandle(buckets: Candle[], forming: Candle, intervalSeconds: number): Candle[] {
  if (intervalSeconds <= 60) return [...buckets, forming];

  const bucketTime = Math.floor(forming.time / intervalSeconds) * intervalSeconds;
  const last = buckets[buckets.length - 1];

  if (last && last.time === bucketTime) {
    const merged: Candle = {
      ...last,
      high: Math.max(last.high, forming.high),
      low: Math.min(last.low, forming.low),
      close: forming.close,
      volume: (last.volume || 0) + (forming.volume || 0),
    };
    return [...buckets.slice(0, -1), merged];
  }

  return [
    ...buckets,
    {
      time: bucketTime,
      open: forming.open,
      high: forming.high,
      low: forming.low,
      close: forming.close,
      volume: forming.volume || 0,
    },
  ];
}
