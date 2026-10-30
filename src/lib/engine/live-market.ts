import type { Candle } from './types';
import { TIMEFRAME_SECONDS, type Timeframe } from './market-feed';
import { MINUTES_PER_DAY, TICKS_PER_BAR } from './constants';
import {
  aggregateCandlesStrict,
  formingBarFromTicks,
  mergeFormingCandle,
  subMinuteCandles,
} from './candles';
import { dayIndexForTime, dayStartTime, getGeneratedDay, hashInt } from './synthetic-market';
import type { SyntheticPair } from './synthetic-market';
import { SYNTH_PAIR } from './synthetic-market';

/**
 * ── A market that is always moving ─────────────────────────────
 *
 * A duel trades its own minutes live. A terminal that is only *watching* runs the same
 * generator at 1×: one minute of the market is one minute of the wall clock, a tick
 * prints every LIVE_TICK_SECONDS, and the candles keep arriving for as long as the tab
 * is open.
 *
 * Each visit carries its own seed, so the chart on screen has never existed before and
 * will never exist again. That is not decoration. The window a duel trades is picked by
 * the clock, so a public chart of *that* series would hand a prepared player the first
 * minutes of the window their next duel is about to replay. A per-session seed removes
 * the question: there is nothing here to study in advance, because this is not the
 * market anyone is trading.
 *
 * What stays canonical is the bar. A day of 1-minute candles is still a pure function of
 * (salt, dayIndex), and the live candle is read from the same tick path that seals it, so
 * the last slot of a minute already shows the finished bar — a streaming terminal never
 * repaints history. No server, no feed, nothing to go down.
 */

/** Seconds one live tick occupies. TICKS_PER_BAR of these fill a one-minute bar. */
export const LIVE_TICK_SECONDS = Math.floor(60 / TICKS_PER_BAR);

/** How much 1-minute history a live chart opens with: 12 hours, then it only appends. */
export const LIVE_HISTORY_MINUTES = 720;

/**
 * A seed for one viewing session: clock plus entropy, so a repeat would need the same
 * draw in the same millisecond. Nothing staked rides on this chart — it settles no
 * matches — so Math.random is a fine default, and it stays injectable for tests.
 */
export function liveSessionSeed(nowMs: number = Date.now(), random: () => number = Math.random): number {
  const clock = Math.floor(nowMs) % 2147483647;
  const entropy = Math.floor(random() * 2147483647);
  return (clock ^ entropy) || 1;
}

/**
 * The pair as this session sees it. A different salt is a different series on the same
 * calendar: same ticker, same decimals, same session-shaped volatility, no shared bars.
 */
export function livePairFor(pair: SyntheticPair, sessionSeed: number): SyntheticPair {
  return { ...pair, salt: hashInt(pair.salt, sessionSeed) };
}

export interface LiveMarket {
  /** The instrument as this session sees it — ticker and decimals, plus its own salt. */
  pair: SyntheticPair;
  /** Instant this snapshot was taken at (epoch ms). The market is a function of it. */
  nowMs: number;
  /** Day of the series the clock is inside right now. */
  dayIndex: number;
  /** Minute of that day the current bar belongs to, 0–1439. */
  minuteOfDay: number;
  /** 0–TICKS_PER_BAR-1 slot inside the current minute. */
  subTick: number;
  /**
   * Position of the newest tick inside the series, and the only thing the wall clock has
   * to agree on: two viewers at the same second hold the same candle out of whichever
   * series their seeds deal them.
   */
  tickIndex: number;
  /** Completed one-minute bars, oldest first. Never contains the forming one. */
  sealed1m: Candle[];
  /** The minute printing right now, from the ticks already printed. */
  forming: Candle;
  /** The newest printed price. */
  lastPrice: number;
  /** Close of the same minute 24 hours ago — the reference on a market that never shuts. */
  referencePrice: number;
  /** Today's open, high and low so far. */
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  /** Milliseconds until the next tick prints. */
  nextTickInMs: number;
}

/** The bar at a global minute index — day 0, minute 0 being the pair's first candle. */
function barAtMinuteIndex(index: number, pair: SyntheticPair): Candle {
  const dayIndex = Math.floor(index / MINUTES_PER_DAY);
  const minute = index - dayIndex * MINUTES_PER_DAY;
  return getGeneratedDay(dayIndex, pair).bars[minute];
}

/**
 * Bars covering global minutes [from, to). Walks day by day, so a window that crosses
 * UTC midnight simply continues into the next day instead of stopping at the seam.
 */
function spanMinuteIndex(from: number, to: number, pair: SyntheticPair): Candle[] {
  const start = Math.max(0, from);
  const out: Candle[] = [];
  let minute = start;

  while (minute < to) {
    const dayIndex = Math.floor(minute / MINUTES_PER_DAY);
    const minuteOfDay = minute - dayIndex * MINUTES_PER_DAY;
    const take = Math.min(to - minute, MINUTES_PER_DAY - minuteOfDay);
    const bars = getGeneratedDay(dayIndex, pair).bars;
    for (let i = 0; i < take; i++) out.push(bars[minuteOfDay + i]);
    minute += take;
  }

  return out;
}

/** Where the wall clock sits inside the series, in the same units the generator uses. */
export function liveClockAt(nowMs: number, pair: SyntheticPair = SYNTH_PAIR) {
  const nowSec = Math.floor(nowMs / 1000);
  const dayIndex = dayIndexForTime(nowMs, pair);
  const dayStart = dayStartTime(dayIndex, pair);
  const secondOfDay = Math.max(0, nowSec - dayStart);
  // Clamped so a clock race exactly at midnight still names a bar that exists.
  const minuteOfDay = Math.min(MINUTES_PER_DAY - 1, Math.floor(secondOfDay / 60));
  const secondOfMinute = secondOfDay - minuteOfDay * 60;
  const subTick = Math.min(TICKS_PER_BAR - 1, Math.floor(secondOfMinute / LIVE_TICK_SECONDS));

  return {
    dayIndex,
    minuteOfDay,
    subTick,
    minuteIndex: dayIndex * MINUTES_PER_DAY + minuteOfDay,
    msIntoMinute: nowMs - (dayStart + minuteOfDay * 60) * 1000,
  };
}

/**
 * The market as it stands at `nowMs`: history up to the last completed minute, plus the
 * minute currently printing. Pure — the same (pair, instant) yields the same candles on
 * any device, which is what makes a chart that runs for days drift-free.
 */
export function getLiveMarket(
  pair: SyntheticPair = SYNTH_PAIR,
  nowMs: number = Date.now(),
  historyMinutes: number = LIVE_HISTORY_MINUTES,
): LiveMarket {
  const clock = liveClockAt(nowMs, pair);
  const { dayIndex, minuteOfDay, subTick, minuteIndex } = clock;

  const day = getGeneratedDay(dayIndex, pair);
  const bar = day.bars[minuteOfDay];
  const first = minuteOfDay * TICKS_PER_BAR;
  const forming = formingBarFromTicks(day.ticks, bar, first, first + subTick, TICKS_PER_BAR);

  const sealed1m = spanMinuteIndex(minuteIndex - historyMinutes, minuteIndex, pair);

  // Today so far, extremes included from the forming minute onward — a session high
  // made seconds ago is a session high.
  let dayHigh = -Infinity;
  let dayLow = Infinity;
  for (let m = 0; m <= minuteOfDay; m++) {
    const b = m === minuteOfDay ? forming : day.bars[m];
    if (b.high > dayHigh) dayHigh = b.high;
    if (b.low < dayLow) dayLow = b.low;
  }

  const referenceIndex = minuteIndex - MINUTES_PER_DAY;
  const referencePrice =
    referenceIndex >= 0 ? barAtMinuteIndex(referenceIndex, pair).close : (sealed1m[0]?.open ?? pair.genesisPrice);

  const tickMs = LIVE_TICK_SECONDS * 1000;

  return {
    pair,
    nowMs,
    dayIndex,
    minuteOfDay,
    subTick,
    tickIndex: minuteIndex * TICKS_PER_BAR + subTick,
    sealed1m,
    forming,
    lastPrice: forming.close,
    referencePrice,
    dayOpen: day.bars[0].open,
    dayHigh,
    dayLow,
    nextTickInMs: tickMs - (clock.msIntoMinute % tickMs),
  };
}

/**
 * The series to draw for one timeframe: history aggregated into buckets, with the
 * forming minute folded into whichever bucket owns it. On 1m this is the raw feed, so
 * the candle on the right edge is always the one that is printing; on 15s / 30s the
 * same prices are sliced finer than a minute.
 */
export function getLiveCandles(market: LiveMarket, timeframe: Timeframe): Candle[] {
  const intervalSeconds = TIMEFRAME_SECONDS[timeframe] ?? 60;
  if (intervalSeconds === 60) return [...market.sealed1m, market.forming];
  if (intervalSeconds < 60) return subMinuteLive(market, intervalSeconds);

  const buckets = aggregateCandlesStrict(market.sealed1m, intervalSeconds);
  return mergeFormingCandle(buckets, market.forming, intervalSeconds);
}

/**
 * The 15s / 30s view: every sealed minute sliced at the frame's own resolution from the
 * tick path that sealed it, then the minute in hand sliced as far as it has printed.
 */
function subMinuteLive(market: LiveMarket, intervalSeconds: number): Candle[] {
  const ticksPerCandle = (TICKS_PER_BAR * intervalSeconds) / 60;
  const out: Candle[] = [];
  let ticks: number[] = [];
  let ticksDay = -1;

  for (const bar of market.sealed1m) {
    const barDay = dayIndexForTime(bar.time * 1000, market.pair);
    if (barDay !== ticksDay) {
      ticksDay = barDay;
      ticks = getGeneratedDay(barDay, market.pair).ticks;
    }
    const minuteOfDay = Math.floor((bar.time - dayStartTime(barDay, market.pair)) / 60);
    const base = minuteOfDay * TICKS_PER_BAR;
    out.push(
      ...subMinuteCandles([bar], ticks.slice(base, base + TICKS_PER_BAR), 0, TICKS_PER_BAR - 1, ticksPerCandle),
    );
  }

  const liveDay = getGeneratedDay(market.dayIndex, market.pair);
  const liveBase = market.minuteOfDay * TICKS_PER_BAR;
  out.push(
    ...subMinuteCandles(
      [liveDay.bars[market.minuteOfDay]],
      liveDay.ticks.slice(liveBase, liveBase + market.subTick + 1),
      0,
      market.subTick,
      ticksPerCandle,
    ),
  );

  return out;
}
