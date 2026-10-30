import type { Candle } from './types';
import {
  DEFAULT_MATCH_DURATION,
  MINUTES_PER_DAY,
  TICKS_PER_BAR,
  battleBarsFor,
  battleSecondsFor,
} from './constants';
import {
  aggregateCandlesStrict,
  formingBarFromTicks,
  mergeFormingCandle,
  subMinuteCandles,
} from './candles';
import {
  SYNTH_PAIR,
  battleStartMinuteForTime,
  dayIndexForTime,
  dayLabel,
  getGeneratedDay,
  getGeneratedDayBars,
  sessionLabel,
} from './synthetic-market';
import type { SyntheticPair } from './synthetic-market';

/**
 * The frames the terminal offers, in the order its toolbar prints them — the MT5
 * ladder, from a tick-level 15-second view up to four hours. The engine still settles
 * on one-minute bars; every frame here is a view of those same prices.
 */
export type Timeframe = '15s' | '30s' | '1m' | '3m' | '5m' | '10m' | '30m' | '1h' | '4h';

export const TIMEFRAMES: readonly Timeframe[] = [
  '15s', '30s', '1m', '3m', '5m', '10m', '30m', '1h', '4h',
];

/** Seconds per bar. One place the market feed and the live terminal both read. */
export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '15s': 15,
  '30s': 30,
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '10m': 600,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
};

export interface MarketDataset {
  /** Instant the battle's first bar prints — the only thing that picks the market. */
  anchorTime: number;
  baseTime: number; // UNIX seconds – first bar of the battle window
  instrument: string;
  instrumentLabel: string;
  /** Decimal places the instrument prints at. */
  digits: number;
  /** Prices reconstructed inside every displayed bar. */
  ticksPerBar: number;
  segmentName: string;
  source: string;

  /**
   * The roster entry the window was generated from. The coarse frames reach back
   * further than the two-day context, and they need the pair to do it.
   */
  pair: SyntheticPair;

  /** Generated day this duel opens on, and the minute of it where the window starts. */
  battleDayIndex: number;
  battleStartMinute: number;

  /** Wall-clock seconds the duel runs — the ticket's length, and its market window. */
  battleSeconds: number;

  // ── Context history: 2 full days plus the current day up to the battle window ──
  historicalCandles1m: Candle[];

  /**
   * Every other frame's history, built the first time that frame is opened and kept
   * for the life of this market — so a sub-tick re-render re-reads an array instead
   * of re-aggregating days of bars twelve times a minute.
   */
  historyByInterval: Map<number, Candle[]>;

  /**
   * The battle window, one bar per minute traded. The extra bar is the print the match
   * ends on: the engine reads its open (the previous bar's close) at the final whistle,
   * so the chart never has to draw a bar that has not traded yet.
   */
  battleCandles1m: Candle[];

  /**
   * Every price the market prints, one per TICK_SECONDS — the chart draws this path and
   * the engine settles on it. At 1× these are the prints a duelist actually sees, so a
   * fill is the next print rather than a bar that has not closed yet.
   */
  tickPath: number[];

  startPrice: number;

  /** Label for the battle day, e.g. "Mar 14, 2026" */
  battleDayLabel: string;
  /** Label for the context span, e.g. "Mar 12–14, 2026" */
  contextDayLabel: string;
  /** Label for the exact window, e.g. "Mar 14, 2026 · 14:00 UTC" */
  battleSessionLabel: string;
}

/**
 * `count` consecutive one-minute bars from anywhere in the series, continuing into
 * the next UTC day when the window needs them. Days join on each other's close (an
 * invariant of the generator), so a late window simply keeps trading — exactly like a
 * real spot market that prints through midnight.
 */
function getBarSpan(dayIndex: number, startMinute: number, count: number, pair: SyntheticPair) {
  const bars: Candle[] = [];
  let ticks: number[] = [];

  let day = dayIndex;
  let minute = startMinute;
  let remaining = count;

  while (remaining > 0) {
    const generated = getGeneratedDay(day, pair);
    const take = Math.min(remaining, MINUTES_PER_DAY - minute);

    for (let i = 0; i < take; i++) bars.push(generated.bars[minute + i]);
    // concat, not push(...spread): a day's worth of ticks is thousands of arguments.
    ticks = ticks.concat(generated.ticks.slice(minute * TICKS_PER_BAR, (minute + take) * TICKS_PER_BAR));

    remaining -= take;
    minute = 0;
    day++;
  }

  return { bars, ticks };
}

/**
 * Builds the market for one duel from the one global series.
 *
 * Nothing is downloaded and nothing is scheduled: the window opens on the minute the
 * battle starts and runs for exactly the ticket's length, so every client derives the
 * same ticks on the spot and the chart clock is the match clock. Same anchor → same
 * market, on any device, at any later date — which is also all a verifier needs to
 * re-run a result.
 */
export function generateBattleMarket(
  anchorTimeMs: number,
  durationSeconds: number = battleSecondsFor(DEFAULT_MATCH_DURATION),
  pair: SyntheticPair = SYNTH_PAIR,
): MarketDataset {
  const dayIndex = dayIndexForTime(anchorTimeMs, pair);
  const startMinute = battleStartMinuteForTime(anchorTimeMs, pair);
  const minutes = battleBarsFor(durationSeconds);

  const today = getGeneratedDay(dayIndex, pair);
  const previous = getGeneratedDay(dayIndex - 1, pair);
  const twoBack = getGeneratedDay(dayIndex - 2, pair);

  // Context: two full days, then today's bars up to the battle window.
  const contextCandles1m = [...twoBack.bars, ...previous.bars, ...today.bars.slice(0, startMinute)];

  // Battle: the match's own minutes, plus the bar its final read lands on.
  const span = getBarSpan(dayIndex, startMinute, minutes + 1, pair);
  const battleCandles1m = span.bars;
  const tickPath = span.ticks;

  const startPrice = battleCandles1m[0]?.open ?? pair.genesisPrice;
  const battleDayLabel = dayLabel(dayIndex, pair);
  const battleSessionLabel = sessionLabel(dayIndex, startMinute, pair);
  const contextDayLabel = `${dayLabel(dayIndex - 2, pair)} – ${battleDayLabel}`;

  return {
    anchorTime: anchorTimeMs,
    baseTime: battleCandles1m[0]?.time ?? 0,
    instrument: pair.symbol,
    instrumentLabel: pair.label,
    digits: pair.digits,
    pair,
    ticksPerBar: TICKS_PER_BAR,
    segmentName: battleSessionLabel,
    source: `${pair.symbol} synthetic series (${contextDayLabel} context → ${battleSessionLabel} live)`,
    battleDayIndex: dayIndex,
    battleStartMinute: startMinute,
    battleSeconds: minutes * 60,
    historicalCandles1m: contextCandles1m,
    historyByInterval: new Map(),
    battleCandles1m,
    tickPath,
    startPrice,
    battleDayLabel,
    contextDayLabel,
    battleSessionLabel,
  };
}

/**
 * The still-forming candle at the live cursor, built from the tick path: open is the
 * bar's first tick, high/low are only the extremes printed so far, close is the newest
 * tick. Returns null before the battle starts and for the extra bar past the window —
 * the chart never draws a bar the duel has not traded. At every later minute boundary
 * `subTick` is 0 again and the new bar really has its opening print.
 */
function formingBar(market: MarketDataset, barIndex: number, subTick: number): Candle | null {
  const bars = market.battleCandles1m;
  if (barIndex < 0 || barIndex >= bars.length - 1) return null;
  if (barIndex === 0 && subTick <= 0) return null;

  const perBar = market.ticksPerBar;
  const first = barIndex * perBar;
  const last = Math.min(first + Math.max(0, subTick), market.tickPath.length - 1);
  if (last < first) return null;

  return formingBarFromTicks(market.tickPath, bars[barIndex], first, last, perBar);
}

/** Bars a sub-minute frame opens with: eight hours of tick-level context. */
const SUB_MINUTE_CONTEXT_MINUTES = 480;

/**
 * Days a four-hour frame reaches back through. The duel context is two days, which is
 * only a dozen candles at four hours a bar; the coarsest frame wants a chart, not a
 * stub hanging off the right edge.
 */
const COARSE_CONTEXT_DAYS = 14;

/**
 * History for one frame, assembled once and then kept on the market. The 15s / 30s
 * frames are sliced from the tick path (a minute cannot be split after the fact), the
 * 4h frame reaches back further than the displayed context, and everything between is
 * the usual two days aggregated into the frame's buckets.
 */
export function getHistoryCandles(market: MarketDataset, intervalSeconds: number): Candle[] {
  const cached = market.historyByInterval.get(intervalSeconds);
  if (cached) return cached;

  let history: Candle[];

  if (intervalSeconds < 60) {
    history = subMinuteHistory(market, intervalSeconds);
  } else if (intervalSeconds >= 14400) {
    history = aggregateCandlesStrict(coarseContext(market), intervalSeconds);
  } else if (intervalSeconds === 60) {
    history = market.historicalCandles1m;
  } else {
    history = aggregateCandlesStrict(market.historicalCandles1m, intervalSeconds);
  }

  market.historyByInterval.set(intervalSeconds, history);
  return history;
}

/**
 * Tick-level context for the 15s / 30s frames: the last eight hours before the battle
 * window, sliced from the same prices the one-minute bars were built from. Only those
 * hours — two full days at 15 seconds would be eleven thousand candles to scroll past.
 */
function subMinuteHistory(market: MarketDataset, intervalSeconds: number): Candle[] {
  const ticksPerCandle = (TICKS_PER_BAR * intervalSeconds) / 60;
  const end = market.battleDayIndex * MINUTES_PER_DAY + market.battleStartMinute;
  const start = Math.max(0, end - SUB_MINUTE_CONTEXT_MINUTES);
  const span = getBarSpan(
    Math.floor(start / MINUTES_PER_DAY),
    start % MINUTES_PER_DAY,
    end - start,
    market.pair,
  );

  return subMinuteCandles(span.bars, span.ticks, 0, span.ticks.length - 1, ticksPerCandle);
}

/**
 * One-minute bars for the coarse frames: every day back to the coarse window, then the
 * battle day up to the moment the window opens. Days already cached by the generator
 * are read straight out of it, so only the first open of a coarse frame pays for them.
 */
function coarseContext(market: MarketDataset): Candle[] {
  const firstDay = Math.max(0, market.battleDayIndex - (COARSE_CONTEXT_DAYS - 1));
  const bars: Candle[] = [];

  for (let day = firstDay; day < market.battleDayIndex; day++) {
    for (const bar of getGeneratedDayBars(day, market.pair)) bars.push(bar);
  }

  const today = getGeneratedDayBars(market.battleDayIndex, market.pair);
  for (let minute = 0; minute < market.battleStartMinute; minute++) bars.push(today[minute]);

  return bars;
}

/**
 * Stitches live buckets onto the context. A frame coarser than an hour can find its
 * first live bucket already open in the history — a battle opens on the hour, but not
 * always on a four-hour boundary — so the two are folded into one candle instead of
 * printing the same timestamp twice.
 */
function joinWithHistory(history: Candle[], live: Candle[]): Candle[] {
  const last = history[history.length - 1];
  if (live.length === 0) return history;
  if (!last || live[0].time !== last.time) return [...history, ...live];

  const merged: Candle = {
    time: last.time,
    open: last.open,
    high: Math.max(last.high, live[0].high),
    low: Math.min(last.low, live[0].low),
    close: live[0].close,
    volume: (last.volume || 0) + (live[0].volume || 0),
  };

  return [...history.slice(0, -1), merged, ...live.slice(1)];
}

/**
 * Returns active candles for the requested timeframe.
 *
 * PRE-BATTLE (currentTick 0, subTick 0):
 *   Only the pre-loaded context history.
 *
 * DURING BATTLE:
 *   Completed battle bars, plus the forming bar while its candle is still printing.
 *   Frames of a minute and coarser aggregate the same source, and the forming bar is
 *   folded into whichever bucket it belongs to. The 15s / 30s frames slice the tick
 *   path instead, so their candles are built from the prices actually printed rather
 *   than from a bar that does not exist yet.
 */
export function getCandlesForTimeframe(
  market: MarketDataset,
  timeframe: Timeframe,
  currentTick: number,
  _battleStartTime: number, // kept for API compat; bar times come from battleCandles1m
  subTick = 0,
): Candle[] {
  const intervalSeconds = TIMEFRAME_SECONDS[timeframe] ?? 60;
  const history = getHistoryCandles(market, intervalSeconds);

  const bars = market.battleCandles1m;
  const completed = Math.max(0, Math.min(currentTick, bars.length));

  if (intervalSeconds < 60) {
    // Nothing has printed before the window opens.
    if (completed === 0 && subTick <= 0) return history;

    const ticksPerCandle = (TICKS_PER_BAR * intervalSeconds) / 60;
    // The newest print on screen — never the extra bar's opening tick past the window.
    const lastTradedTick = (bars.length - 1) * TICKS_PER_BAR - 1;
    const printedTick = completed * TICKS_PER_BAR + Math.max(0, Math.min(subTick, TICKS_PER_BAR - 1));
    const lastTick = Math.min(printedTick, lastTradedTick);
    return [...history, ...subMinuteCandles(bars, market.tickPath, 0, lastTick, ticksPerCandle)];
  }

  const activeBattleBars = completed > 0 ? bars.slice(0, completed) : [];
  const partial = formingBar(market, completed, subTick);

  if (intervalSeconds === 60) {
    return partial
      ? [...history, ...activeBattleBars, partial]
      : [...history, ...activeBattleBars];
  }

  const aggregatedLiveBars = aggregateCandlesStrict(activeBattleBars, intervalSeconds);
  const withForming = partial
    ? mergeFormingCandle(aggregatedLiveBars, partial, intervalSeconds)
    : aggregatedLiveBars;

  return joinWithHistory(history, withForming);
}
