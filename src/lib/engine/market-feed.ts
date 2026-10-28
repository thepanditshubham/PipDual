import type { Candle } from './types';
import {
  sliceXauusdForMatch,
  aggregateCandlesStrict,
  MINUTES_PER_DAY,
} from './xauusd-data';

export type Timeframe = '1m' | '5m' | '15m' | '1h';

export interface MarketDataset {
  seed: number;
  baseTime: number; // UNIX seconds – start of battle day
  instrument: 'XAU/USD';
  segmentName: string;
  source: string;

  // ── Context history (2 full days, pre-loaded on chart) ──
  historicalCandles1m: Candle[];
  historicalCandles5m: Candle[];
  historicalCandles15m: Candle[];
  historicalCandles1h: Candle[];

  // ── Battle day (full 1,440 1m bars, replayed across the selected match length) ──
  battleCandles1m: Candle[];

  /**
   * battleTicks: 1 price per battle 1m bar (= 1,440 ticks).
   * Drives the simulation engine. Tick length = match seconds / 1,440 (5 / 10 / 15 min).
   */
  liveTicks: number[];

  startPrice: number;

  /** Label for the battle day, e.g. "Jan 10, 2024" */
  battleDayLabel: string;
  /** Label for the context days, e.g. "Jan 8–9, 2024" */
  contextDayLabel: string;
}

/**
 * Generate match dataset using authentic XAU/USD Spot Gold data.
 * - 2 context days (Jan 8–9 or similar) pre-loaded as history on chart
 * - 1 battle day (1,440 1m bars) replays live across the ticket's 5 / 10 / 15 min length
 */
export function generateBattleMarket(seed: number): MarketDataset {
  const slice = sliceXauusdForMatch(seed);

  return {
    seed,
    baseTime: slice.battleStartBar.time,
    instrument: 'XAU/USD',
    segmentName: slice.description,
    source: `XAU/USD Spot Gold (${slice.contextDayLabel} context → ${slice.battleDayLabel} live)`,
    historicalCandles1m: slice.contextCandles1m,
    historicalCandles5m: slice.contextCandles5m,
    historicalCandles15m: slice.contextCandles15m,
    historicalCandles1h: slice.contextCandles1h,
    battleCandles1m: slice.battleCandles1m,
    liveTicks: slice.battleTicks,         // 1,440 ticks
    startPrice: slice.startPrice,
    battleDayLabel: slice.battleDayLabel,
    contextDayLabel: slice.contextDayLabel,
  };
}

/**
 * Returns active candles for the requested timeframe.
 *
 * PRE-BATTLE (currentTick ≤ 0):
 *   Returns only the pre-loaded context history (2 days).
 *
 * DURING BATTLE:
 *   Appends live-forming battle bars from the battle day's 1m candles,
 *   one bar per tick (currentTick = bar index into battleCandles1m).
 *   Multi-timeframe views are strictly aggregated from the same source.
 */
export function getCandlesForTimeframe(
  market: MarketDataset,
  timeframe: Timeframe,
  currentTick: number,
  _battleStartTime: number   // kept for API compat; battle timestamps come from battleCandles1m
): Candle[] {
  let baseHistorical: Candle[];

  switch (timeframe) {
    case '5m':
      baseHistorical = market.historicalCandles5m;
      break;
    case '15m':
      baseHistorical = market.historicalCandles15m;
      break;
    case '1h':
      baseHistorical = market.historicalCandles1h;
      break;
    case '1m':
    default:
      baseHistorical = market.historicalCandles1m;
      break;
  }

  // Pre-battle: just show historical context
  if (currentTick <= 0 || market.battleCandles1m.length === 0) {
    return baseHistorical;
  }

  // Slice the battle day up to the current bar (one 1m bar = one tick)
  const activeBattleBars = market.battleCandles1m.slice(0, currentTick);

  if (timeframe === '1m') {
    return [...baseHistorical, ...activeBattleBars];
  }

  const intervalSeconds = timeframe === '5m' ? 300 : timeframe === '15m' ? 900 : 3600;
  const aggregatedLiveBars = aggregateCandlesStrict(activeBattleBars, intervalSeconds);

  return [...baseHistorical, ...aggregatedLiveBars];
}

/** Total number of battle ticks (= MINUTES_PER_DAY = 1,440) */
export const TOTAL_BATTLE_TICKS = MINUTES_PER_DAY;

