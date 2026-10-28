import type { Candle } from './types';
import { MINUTES_PER_DAY, PLAY_BARS, TICKS_PER_BAR } from './constants';
import { aggregateCandlesStrict, formingBarFromTicks, mergeFormingCandle } from './candles';
import {
  SYNTH_PAIR,
  battleStartMinuteForTime,
  dayIndexForTime,
  dayLabel,
  getGeneratedDay,
  sessionLabel,
} from './synthetic-market';
import type { SyntheticPair } from './synthetic-market';

export type Timeframe = '1m' | '5m' | '15m' | '1h';

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

  /** Generated day this duel opens on, and the minute of it where the window starts. */
  battleDayIndex: number;
  battleStartMinute: number;

  // ── Context history: 2 full days plus the current day up to the battle window ──
  historicalCandles1m: Candle[];
  historicalCandles5m: Candle[];
  historicalCandles15m: Candle[];
  historicalCandles1h: Candle[];

  /**
   * The battle window, one bar per displayed candle. PLAY_BARS are played; the extra
   * bar exists so the engine's final read (`liveTicks[PLAY_BARS]`) lands on the same
   * price it always has — the chart never draws it.
   */
  battleCandles1m: Candle[];

  /**
   * One price per battle bar (its close) — the array the simulation settles on.
   * Deliberately unchanged by the tick work: a result depends on bar closes, never on
   * how finely a candle is animated.
   */
  liveTicks: number[];

  /** ticksPerBar prices per battle bar: the chart's live resolution. */
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
 * Nothing is downloaded and nothing is scheduled: the window is found from the battle's
 * start instant, so every duel fired in the same UTC hour trades identical candles and
 * every client derives them on the spot. Same anchor → same market, on any device, at
 * any later date — which is also all a verifier needs to re-run a result.
 */
export function generateBattleMarket(anchorTimeMs: number, pair: SyntheticPair = SYNTH_PAIR): MarketDataset {
  const dayIndex = dayIndexForTime(anchorTimeMs, pair);
  const startMinute = battleStartMinuteForTime(anchorTimeMs, pair);

  const today = getGeneratedDay(dayIndex, pair);
  const previous = getGeneratedDay(dayIndex - 1, pair);
  const twoBack = getGeneratedDay(dayIndex - 2, pair);

  // Context: two full days, then today's bars up to the battle window.
  const contextCandles1m = [...twoBack.bars, ...previous.bars, ...today.bars.slice(0, startMinute)];

  // Battle: PLAY_BARS played, plus one bar so the engine's last read is unchanged.
  const span = getBarSpan(dayIndex, startMinute, PLAY_BARS + 1, pair);
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
    ticksPerBar: TICKS_PER_BAR,
    segmentName: battleSessionLabel,
    source: `${pair.symbol} synthetic series (${contextDayLabel} context → ${battleSessionLabel} live)`,
    battleDayIndex: dayIndex,
    battleStartMinute: startMinute,
    historicalCandles1m: contextCandles1m,
    historicalCandles5m: aggregateCandlesStrict(contextCandles1m, 300),
    historicalCandles15m: aggregateCandlesStrict(contextCandles1m, 900),
    historicalCandles1h: aggregateCandlesStrict(contextCandles1m, 3600),
    battleCandles1m,
    liveTicks: battleCandles1m.map((c) => c.close),
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
 * tick. Returns null before the battle starts (subTick 0), so the analysis phase never
 * shows a bar the players have not traded yet.
 */
function formingBar(market: MarketDataset, barIndex: number, subTick: number): Candle | null {
  if (subTick <= 0) return null;

  const bars = market.battleCandles1m;
  if (barIndex < 0 || barIndex >= bars.length) return null;

  const perBar = market.ticksPerBar;
  const first = barIndex * perBar;
  const last = Math.min(first + subTick, market.tickPath.length - 1);
  if (last < first) return null;

  return formingBarFromTicks(market.tickPath, bars[barIndex], first, last, perBar);
}

/**
 * Returns active candles for the requested timeframe.
 *
 * PRE-BATTLE (currentTick 0, subTick 0):
 *   Only the pre-loaded context history.
 *
 * DURING BATTLE:
 *   Completed battle bars, plus the forming bar while its candle is still printing.
 *   Higher timeframes aggregate the same source, and the forming bar is folded into
 *   whichever bucket it belongs to.
 */
export function getCandlesForTimeframe(
  market: MarketDataset,
  timeframe: Timeframe,
  currentTick: number,
  _battleStartTime: number, // kept for API compat; bar times come from battleCandles1m
  subTick = 0,
): Candle[] {
  let baseHistorical: Candle[];
  let intervalSeconds = 60;

  switch (timeframe) {
    case '5m':
      baseHistorical = market.historicalCandles5m;
      intervalSeconds = 300;
      break;
    case '15m':
      baseHistorical = market.historicalCandles15m;
      intervalSeconds = 900;
      break;
    case '1h':
      baseHistorical = market.historicalCandles1h;
      intervalSeconds = 3600;
      break;
    case '1m':
    default:
      baseHistorical = market.historicalCandles1m;
      break;
  }

  const bars = market.battleCandles1m;
  const completed = Math.max(0, Math.min(currentTick, bars.length));
  const activeBattleBars = completed > 0 ? bars.slice(0, completed) : [];
  const partial = formingBar(market, completed, subTick);

  if (intervalSeconds === 60) {
    return partial
      ? [...baseHistorical, ...activeBattleBars, partial]
      : [...baseHistorical, ...activeBattleBars];
  }

  const aggregatedLiveBars = aggregateCandlesStrict(activeBattleBars, intervalSeconds);
  const withForming = partial
    ? mergeFormingCandle(aggregatedLiveBars, partial, intervalSeconds)
    : aggregatedLiveBars;

  return [...baseHistorical, ...withForming];
}
