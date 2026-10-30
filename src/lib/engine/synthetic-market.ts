import { rng } from './rng';
import { MINUTES_PER_DAY, TICKS_PER_BAR } from './constants';
import { minValue, roundPrice } from './candles';
import type { Candle } from './types';

/**
 * ── Endless synthetic market ─────────────────────────────────────────
 *
 * One series per instrument, indexed by UTC time. A day of 1-minute bars is a pure
 * function of (pair salt, day index), so every browser — and the server when it
 * re-verifies a match — derives byte-identical candles with no feed, no cache and no
 * scheduled job. That is what keeps a pair open 24 hours a day: the series is a
 * formula over UTC minutes, so there is nothing to host and nothing to go down, and
 * two people looking at the same minute are looking at the same market.
 *
 * Invariants (asserted in __tests__/synthetic-market.test.ts):
 * - Deterministic: same (pair, dayIndex) → same bars, always, on every device.
 * - Shared: the same UTC hour maps to the same window for every player.
 * - Continuous: a day opens exactly where the previous day closed, so a battle window
 *   can run across midnight without a seam appearing on the axis.
 * - Bounded: soft mean reversion keeps the price in a plausible band forever.
 * - Tick-consistent: a bar's reconstructed tick path starts at its open, prints its
 *   exact high and low, and ends at its close — so a forming candle can never
 *   contradict the bar the engine settles on.
 *
 * Math rule: + - * / , Math.floor/round/max/min and Math.imul only. No transcendental
 * functions — they are not specified to agree across JavaScript engines, and two
 * duelists computing different candles is a fairness bug, not a rendering glitch.
 */

export interface SyntheticPair {
  /** Ticker shown on the chart and in the ticket. */
  symbol: string;
  /** Plain-language name for result screens and tooltips. */
  label: string;
  /** Mixed into every seed so this pair's series is its own. */
  salt: number;
  /** UNIX seconds of day 0 at 00:00 UTC — the pair's own calendar. */
  genesisTime: number;
  /** Price at day 0. */
  genesisPrice: number;
  /** Decimal places the instrument prints at. */
  digits: number;
}

export const SYNTH_PAIR: SyntheticPair = {
  symbol: 'XAU/USD',
  label: 'Synthetic Spot Gold',
  salt: 0x9e3779b9,
  // 2026-01-01 00:00:00 UTC
  genesisTime: 1767225600,
  genesisPrice: 2032.5,
  digits: 2,
};

/**
 * The tradable roster. Every entry is the same machinery — its own salt makes its own
 * series, so gold and the euro pair share nothing but the calendar. All of them print
 * 24 hours a day, because none of them is a feed that can drop.
 *
 * Salts are distinct 32-bit constants: hashInt XORs them into the day index, so two
 * pairs must never share one.
 */
export const SYNTH_PAIRS: SyntheticPair[] = [
  SYNTH_PAIR,
  {
    symbol: 'EUR/USD',
    label: 'Synthetic Euro Bundle',
    salt: 0x85ebca6b,
    genesisTime: 1767225600,
    genesisPrice: 1.085,
    digits: 5,
  },
  {
    symbol: 'XTI/USD',
    label: 'Synthetic Light Crude',
    salt: 0x27d4eb2d,
    genesisTime: 1767225600,
    genesisPrice: 78.4,
    digits: 2,
  },
  {
    symbol: 'BTC/USD',
    label: 'Synthetic Digital Bullion',
    salt: 0xc2b2ae35,
    genesisTime: 1767225600,
    genesisPrice: 61500,
    digits: 2,
  },
  {
    symbol: 'US30',
    label: 'Synthetic Industrial Index',
    salt: 0x165667b1,
    genesisTime: 1767225600,
    genesisPrice: 41250,
    digits: 1,
  },
];

/** Roster lookup by ticker, falling back to the flagship pair for an unknown symbol. */
export function findPair(symbol: string | null | undefined): SyntheticPair {
  return SYNTH_PAIRS.find((p) => p.symbol === symbol) ?? SYNTH_PAIR;
}

/** Integer avalanche hash. Deterministic, and never returns 0 (a 0 seed stalls mulberry32). */
export function hashInt(value: number, salt: number): number {
  let x = (value ^ salt) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x27d4eb2d);
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
  x = (x ^ (x >>> 13)) >>> 0;
  return x || 1;
}

/** UTC start of a generated day, in UNIX seconds. */
export function dayStartTime(dayIndex: number, pair: SyntheticPair = SYNTH_PAIR): number {
  return pair.genesisTime + dayIndex * 86400;
}

/** Daily open prices, computed once per (pair, day) for the whole session. */
const DAY_OPEN_CACHE = new Map<string, number>();

/**
 * Open price of `dayIndex`, reached by walking daily returns from day 0. That is a
 * few hundred iterations of integer-derived arithmetic, run at most once per pair per
 * day and then cached — which is why days join seamlessly without storing anything.
 */
export function dayOpenPrice(dayIndex: number, pair: SyntheticPair = SYNTH_PAIR): number {
  // Keyed by salt as well as day: two pairs on the same calendar must not trade opens.
  const key = `${pair.salt}:${dayIndex}`;
  const cached = DAY_OPEN_CACHE.get(key);
  if (cached !== undefined) return cached;

  const anchor = pair.genesisPrice;
  let price = anchor;

  for (let d = 0; d < dayIndex; d++) {
    const rand = rng(hashInt(d, pair.salt));
    const meanPull = ((anchor - price) / anchor) * 0.08;
    const shock = (rand() + rand() + rand() - 1.5) * 0.011;
    price = price * (1 + meanPull + shock);
    // Floor so the walk can never reach a price the chart cannot render.
    const floor = anchor * 0.15;
    if (price < floor) price = floor;
  }

  const open = roundPrice(price, pair.digits);
  if (DAY_OPEN_CACHE.size > 8192) DAY_OPEN_CACHE.clear();
  DAY_OPEN_CACHE.set(key, open);
  return open;
}

/**
 * Per-minute volatility by UTC hour: quiet Asia, expanding London open, momentum
 * London, strong NY open, fading NY afternoon, quiet close. In price units scaled to
 * a 2,000 reference, so it reads the same at any price level.
 */
function sessionVol(hour: number): number {
  if (hour < 7) return 0.34;
  if (hour < 9) return 1.5;
  if (hour < 13) return 0.95;
  if (hour < 16) return 1.6;
  if (hour < 18) return 1.05;
  return 0.38;
}

interface GeneratedDay {
  bars: Candle[];
  /** TICKS_PER_BAR prices per bar, same length as bars × TICKS_PER_BAR. */
  ticks: number[];
}

const DAY_CACHE = new Map<string, GeneratedDay>();
/** The same days' bars alone, for views that never touch the tick path. */
const BARS_CACHE = new Map<string, Candle[]>();

/**
 * The 1,440 one-minute bars of one generated day, without reconstructing its ticks.
 * A coarse history view reaches back two weeks and needs only candles, so it reads
 * these instead of paying for 86,400 prices a day.
 */
export function getGeneratedDayBars(dayIndex: number, pair: SyntheticPair = SYNTH_PAIR): Candle[] {
  const key = `${pair.salt}:${dayIndex}`;
  const cached = BARS_CACHE.get(key);
  if (cached) return cached;

  const bars = buildDayBars(dayIndex, pair);
  if (BARS_CACHE.size > 64) BARS_CACHE.clear();
  BARS_CACHE.set(key, bars);
  return bars;
}

/**
 * The 1,440 one-minute bars of one generated day, plus their tick paths.
 * A day is a Brownian bridge from its own open to the next day's open, with
 * session-shaped volatility — so the target is hit exactly and neighbours join.
 */
export function getGeneratedDay(dayIndex: number, pair: SyntheticPair = SYNTH_PAIR): GeneratedDay {
  const key = `${pair.salt}:${dayIndex}`;
  const cached = DAY_CACHE.get(key);
  if (cached) return cached;

  const bars = getGeneratedDayBars(dayIndex, pair);
  const day: GeneratedDay = { bars, ticks: buildTickPath(bars, dayIndex, pair) };
  // Room for a few days of every listed pair, so browsing the roster never thrashes
  // the generator. Above that the map is dropped whole: days are cheap to rebuild and
  // a bounded cache is what keeps a tab left open overnight from growing.
  if (DAY_CACHE.size > 24) DAY_CACHE.clear();
  DAY_CACHE.set(key, day);
  return day;
}

/** The bridge walk itself: bars only, so both caches above share one implementation. */
function buildDayBars(dayIndex: number, pair: SyntheticPair): Candle[] {
  const dayStart = dayStartTime(dayIndex, pair);
  const target = dayOpenPrice(dayIndex + 1, pair);
  const rand = rng(hashInt(dayIndex, pair.salt));
  // Some days are range-bound, some trend hard; drives both vol and how eagerly the
  // bridge chases its target.
  const activity = 0.7 + rand() * 0.7;

  const bars: Candle[] = new Array(MINUTES_PER_DAY);
  let price = dayOpenPrice(dayIndex, pair);

  for (let m = 0; m < MINUTES_PER_DAY; m++) {
    const remaining = MINUTES_PER_DAY - m;
    const vol = sessionVol(Math.floor(m / 60)) * activity;
    const priceScale = price / 2000;

    const pull = (target - price) / remaining;
    const noise = (rand() - 0.5 + (rand() - 0.5) + (rand() - 0.5)) / 1.5;

    // The last minute has nothing left to pull toward, so it just arrives: printing the
    // target as this day's final close is what lets tomorrow open on the same number.
    // (Noise is still drawn below so the wicks of the closing minute stay in sequence.)
    const rawClose = remaining === 1 ? target : price + pull + noise * vol * priceScale;

    const open = price;
    const close = roundPrice(rawClose, pair.digits);

    const wickUp = rand() * vol * priceScale * 0.6;
    const wickDown = rand() * vol * priceScale * 0.6;
    const high = roundPrice(Math.max(open, close) + wickUp, pair.digits);
    const low = roundPrice(Math.min(open, close) - wickDown, pair.digits);
    const volume = Math.round(140 + rand() * 880 + (vol > 1.1 ? 720 : 0));

    bars[m] = { time: dayStart + m * 60, open, high, low, close, volume };
    price = close;
  }

  return bars;
}

/**
 * Reconstructs TICKS_PER_BAR prices inside every bar: open first, close last, the
 * bar's exact high and low printed at hashed positions, everything clamped inside
 * the bar's own range. Purely cosmetic in isolation — but it is what lets the candle
 * move with ticks instead of appearing whole.
 */
function buildTickPath(bars: Candle[], dayIndex: number, pair: SyntheticPair): number[] {
  const n = TICKS_PER_BAR;
  const ticks = new Array<number>(MINUTES_PER_DAY * n);

  for (let m = 0; m < bars.length; m++) {
    const bar = bars[m];
    const base = m * n;
    const closeAt = n - 1; // the bar's own slot for its close: open … walk … close
    const rand = rng(hashInt(dayIndex * MINUTES_PER_DAY + m, pair.salt ^ 0x51ed27));

    const highAt = 1 + Math.floor(rand() * (closeAt - 1));
    let lowAt = 1 + Math.floor(rand() * (closeAt - 1));
    if (lowAt === highAt) lowAt = highAt === 1 ? closeAt - 1 : 1;

    ticks[base] = bar.open;
    for (let k = 1; k < closeAt; k++) {
      const index = base + k;
      if (k === highAt) {
        ticks[index] = bar.high;
        continue;
      }
      if (k === lowAt) {
        ticks[index] = bar.low;
        continue;
      }
      const remaining = closeAt - k;
      const pull = (bar.close - ticks[index - 1]) / remaining;
      const noise = (rand() - 0.5 + (rand() - 0.5)) / 2;
      // A bar can print a flat close, so the walk needs a floor — and that floor is one
      // of the instrument's own ticks, never a fixed 0.01 that would swamp a 1.08 pair.
      const span = Math.max(bar.high - bar.low, minValue(pair.digits));
      let p = ticks[index - 1] + pull + noise * span * 0.55;
      if (p > bar.high) p = bar.high;
      if (p < bar.low) p = bar.low;
      ticks[index] = roundPrice(p, pair.digits);
    }
    ticks[base + closeAt] = bar.close;
  }

  return ticks;
}

/**
 * Which generated day contains `timeMs`. Generation is unbounded, so any date — past
 * or future — already has bars. Clamped at day 0 so a clock set before the pair's
 * genesis still lands on a real trading day instead of asking for a negative one.
 */
export function dayIndexForTime(timeMs: number, pair: SyntheticPair = SYNTH_PAIR): number {
  return Math.max(0, Math.floor((Math.floor(timeMs / 1000) - pair.genesisTime) / 86400));
}

/**
 * Minute of that day where a battle window opens, snapped down to the minute.
 *
 * A duel trades the market at 1×, so its window is only as long as the match — five,
 * ten or fifteen minutes. Snapping to the hour would hand every duel fired in that hour
 * the same short window, which is easy to study in advance; a per-minute anchor opens a
 * fresh window for each match, and both terminals still derive the same one from the
 * ticket's shared start time.
 */
export function battleStartMinuteForTime(timeMs: number, pair: SyntheticPair = SYNTH_PAIR): number {
  const dayStart = dayStartTime(dayIndexForTime(timeMs, pair), pair);
  const secondOfDay = Math.max(0, Math.floor(timeMs / 1000) - dayStart);
  return Math.floor(secondOfDay / 60);
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mar 14, 2026" for a generated day, from integer civil-date maths (no locale, no timezone). */
export function dayLabel(dayIndex: number, pair: SyntheticPair = SYNTH_PAIR): string {
  const z = Math.floor(pair.genesisTime / 86400) + dayIndex + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const yi = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = m <= 2 ? yi + 1 : yi;
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

/**
 * "Oct 28, 2026 · 14:00 UTC" — the one window a battle trades, named by when it
 * starts rather than by a room code, because it is the same window every other player
 * in that hour is looking at.
 */
export function sessionLabel(dayIndex: number, startMinute: number, pair: SyntheticPair = SYNTH_PAIR): string {
  const hour = Math.floor(startMinute / 60);
  return `${dayLabel(dayIndex, pair)} · ${hour < 10 ? '0' : ''}${hour}:00 UTC`;
}
