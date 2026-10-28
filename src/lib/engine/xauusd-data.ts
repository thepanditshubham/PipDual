import { rng } from './rng';
import type { Candle } from './types';

/**
 * ── XAU/USD Multi-Day Dataset (Jan 8–12, 2024) ──
 *
 * Architecture:
 * - 5 trading days, 1,440 1m candles each = 7,200 total bars
 * - Each match shows 2 context days (pre-loaded on chart) + 1 battle day
 * - Battle day (1,440 bars) replays in 180 seconds at 125ms/tick
 * - All timeframes (5m, 15m, 1h) mathematically derived from same 1m source
 *
 * Price levels: Jan 8, 2024 XAU/USD opened around $2,032, trending up to $2,050+
 */

// Base timestamp: Jan 8, 2024 00:00:00 UTC
export const XAUUSD_DAY1_START_TIME = 1704672000;
export const MINUTES_PER_DAY = 1440;
export const TOTAL_DAYS = 5;

/**
 * Session-based drift + volatility model for realistic intraday price action.
 * dayIndex 0–4 controls multi-day trend direction to simulate real market behavior.
 */
function sessionProfile(minuteOfDay: number, dayIndex: number): { drift: number; vol: number } {
  const hour = Math.floor(minuteOfDay / 60);

  if (hour < 7) {
    // Asian – sideways with slight drift, low vol
    return { drift: (dayIndex % 3 === 0 ? 0.01 : -0.01), vol: 0.18 + 0.06 * (dayIndex % 2) };
  } else if (hour < 9) {
    // London open – expansion spike
    return { drift: dayIndex % 2 === 0 ? 0.12 : -0.10, vol: 0.75 };
  } else if (hour < 13) {
    // London session – trend continuation
    return { drift: dayIndex % 2 === 0 ? 0.06 : -0.05, vol: 0.48 };
  } else if (hour < 16) {
    // NY open – strong momentum, alternating per day
    const d3 = dayIndex % 3;
    return { drift: d3 === 0 ? 0.14 : d3 === 1 ? -0.12 : 0.02, vol: 0.82 };
  } else if (hour < 18) {
    // NY afternoon – mean reversion
    return { drift: dayIndex % 2 === 0 ? -0.08 : 0.07, vol: 0.55 };
  } else {
    // Close – quiet consolidation
    return { drift: 0, vol: 0.20 };
  }
}

/**
 * Generates the complete multi-day 1m XAU/USD series.
 * 5 days × 1,440 minutes = 7,200 candles total.
 * Uses a fixed deterministic seed for consistency.
 */
export function generateMultiDayXauusd1mSeries(): Candle[] {
  const rand = rng(20240108);
  const candles: Candle[] = [];
  // Jan 8, 2024: gold around $2,032
  let currentPrice = 2032.50;

  for (let day = 0; day < TOTAL_DAYS; day++) {
    const dayStartTime = XAUUSD_DAY1_START_TIME + day * MINUTES_PER_DAY * 60;

    for (let m = 0; m < MINUTES_PER_DAY; m++) {
      const time = dayStartTime + m * 60;
      const { drift, vol } = sessionProfile(m, day);

      const open = currentPrice;
      const noise = (rand() - 0.5 + (rand() - 0.5)) / 2;
      const change = drift + vol * noise;
      const rawClose = open + change;

      // Soft anchor to keep price realistic (gentle drift upward over the 5 days)
      const dayAnchor = 2032.50 + day * 2.5;
      const pullback = (rawClose - dayAnchor) * 0.003;
      const close = Math.max(2005, rawClose - pullback);

      const wickHigh = Math.abs(rand() * vol * 0.8);
      const wickLow = Math.abs(rand() * vol * 0.8);
      const high = Math.max(open, close) + wickHigh;
      const low = Math.min(open, close) - wickLow;
      const volume = Math.round(120 + rand() * 900 + (vol > 0.6 ? 600 : 0));

      candles.push({
        time,
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume,
      });

      currentPrice = close;
    }
  }

  return candles;
}

// Module-level cache so series is generated only once
let cachedMultiDay: Candle[] | null = null;
export function getMultiDayXauusdSeries(): Candle[] {
  if (!cachedMultiDay) {
    cachedMultiDay = generateMultiDayXauusd1mSeries();
  }
  return cachedMultiDay;
}

// ── Legacy exports kept for backward compatibility ──
export const XAUUSD_JAN_START_TIME = XAUUSD_DAY1_START_TIME;
/** @deprecated Use getMultiDayXauusdSeries() */
export function getMasterXauusd1mSeries(): Candle[] {
  return getMultiDayXauusdSeries();
}

/**
 * ── True Mathematical Multi-Timeframe Synchronization ──
 * Aggregates base 1-minute candles into 5m, 15m, or 1h candles with 100% precision:
 * - open:   open of the 1st 1m candle
 * - high:   max high across all 1m candles in the bucket
 * - low:    min low across all 1m candles in the bucket
 * - close:  close of the final 1m candle in the bucket
 * - volume: exact sum of volumes
 */
export function aggregateCandlesStrict(base1m: Candle[], intervalSeconds: number): Candle[] {
  if (intervalSeconds === 60) return [...base1m];

  const buckets = new Map<number, Candle[]>();

  for (const c of base1m) {
    const bucketTime = Math.floor(c.time / intervalSeconds) * intervalSeconds;
    const list = buckets.get(bucketTime) || [];
    list.push(c);
    buckets.set(bucketTime, list);
  }

  const sortedTimes = Array.from(buckets.keys()).sort((a, b) => a - b);
  const aggregated: Candle[] = [];

  for (const bTime of sortedTimes) {
    const group = buckets.get(bTime)!;
    if (group.length === 0) continue;

    const open = group[0].open;
    const high = Math.max(...group.map((x) => x.high));
    const low = Math.min(...group.map((x) => x.low));
    const close = group[group.length - 1].close;
    const volume = group.reduce((sum, x) => sum + (x.volume || 0), 0);

    aggregated.push({
      time: bTime,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    });
  }

  return aggregated;
}

// ── Day labels ──
const DAY_LABELS = ['Jan 8, 2024', 'Jan 9, 2024', 'Jan 10, 2024', 'Jan 11, 2024', 'Jan 12, 2024'];

export interface XauusdMatchSlice {
  sliceId: string;
  instrument: 'XAU/USD';
  description: string;

  /** 0-based index of the battle day (0 = Jan 8 ... 4 = Jan 12). Always ≥ 2. */
  battleDayIndex: number;
  /** e.g. "Jan 10, 2024" */
  battleDayLabel: string;
  /** e.g. "Jan 8–9, 2024" */
  contextDayLabel: string;

  // PRE-LOADED CONTEXT: exactly 2 full days of history before the battle day.
  // These are shown on the chart at match start so the user can analyse and predict.
  contextCandles1m: Candle[];
  contextCandles5m: Candle[];
  contextCandles15m: Candle[];
  contextCandles1h: Candle[];

  // BATTLE DAY: full 1,440 1m bars, replayed live in 180 s at 125 ms/bar.
  battleCandles1m: Candle[];

  /** Price at first bar of battle day (used for position P&L) */
  startPrice: number;

  // ── Legacy fields kept so existing market-feed.ts continues to compile ──
  analysisStartBar: Candle;
  battleStartBar: Candle;
  /** Alias of contextCandles1m */
  candles1m: Candle[];
  /** Alias of contextCandles5m */
  candles5m: Candle[];
  /** Alias of contextCandles15m */
  candles15m: Candle[];
  /** Alias of contextCandles1h */
  candles1h: Candle[];
  /**
   * 1,440 price ticks – one per battle 1m bar's close.
   * (Previously was 1,200 ticks; now matches MINUTES_PER_DAY)
   */
  battleTicks: number[];
}

/**
 * Slices the multi-day dataset into a match-ready struct.
 *
 * Battle selection:
 * - Requires at least 2 preceding context days ⇒ battleDayIndex ∈ {2, 3, 4}
 * - seed controls which day is selected deterministically
 *
 * Replay speed:
 * - battleCandles1m has 1,440 bars
 * - At 125 ms/tick this plays out in exactly 180 seconds
 */
export function sliceXauusdForMatch(seed: number): XauusdMatchSlice {
  const master = getMultiDayXauusdSeries();
  const rand = rng(seed);

  // Pick battle day (min 2 so we always have 2 context days)
  const battleDayIndex = 2 + Math.floor(rand() * (TOTAL_DAYS - 2)); // 2 | 3 | 4

  const contextStart = (battleDayIndex - 2) * MINUTES_PER_DAY;
  const battleDayStart = battleDayIndex * MINUTES_PER_DAY;

  // 2 full context days (2,880 1m bars)
  const contextCandles1m = master.slice(contextStart, battleDayStart);
  // Battle day: all 1,440 1m bars
  const battleCandles1m = master.slice(battleDayStart, battleDayStart + MINUTES_PER_DAY);

  const startPrice = battleCandles1m[0]?.open ?? 2032.50;

  // Strict multi-timeframe context views
  const contextCandles5m = aggregateCandlesStrict(contextCandles1m, 300);
  const contextCandles15m = aggregateCandlesStrict(contextCandles1m, 900);
  const contextCandles1h = aggregateCandlesStrict(contextCandles1m, 3600);

  const battleLabel = DAY_LABELS[battleDayIndex] ?? `Day ${battleDayIndex + 1}`;
  const ctx0 = DAY_LABELS[battleDayIndex - 2] ?? `Day ${battleDayIndex - 1}`;
  const ctx1 = DAY_LABELS[battleDayIndex - 1] ?? `Day ${battleDayIndex}`;

  // battleTicks: one price per 1m bar (close), to drive the simulation engine
  const battleTicks: number[] = battleCandles1m.map((c) => c.close);

  return {
    sliceId: `XAUUSD-2024-DAY${battleDayIndex}-${seed}`,
    instrument: 'XAU/USD',
    description: `Spot Gold ${battleLabel}`,
    battleDayIndex,
    battleDayLabel: battleLabel,
    contextDayLabel: `${ctx0}–${ctx1}`,
    contextCandles1m,
    contextCandles5m,
    contextCandles15m,
    contextCandles1h,
    battleCandles1m,
    startPrice,

    // ── Legacy aliases ──
    analysisStartBar: contextCandles1m[contextCandles1m.length - 1] ?? battleCandles1m[0],
    battleStartBar: battleCandles1m[0],
    candles1m: contextCandles1m,
    candles5m: contextCandles5m,
    candles15m: contextCandles15m,
    candles1h: contextCandles1h,
    battleTicks,
  };
}
