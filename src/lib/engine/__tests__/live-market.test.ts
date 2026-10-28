import { describe, it, expect } from 'vitest';
import { MINUTES_PER_DAY, TICKS_PER_BAR } from '../constants';
import type { Candle } from '../types';
import { SYNTH_PAIR, SYNTH_PAIRS, dayStartTime, getGeneratedDay } from '../synthetic-market';
import {
  LIVE_HISTORY_MINUTES,
  LIVE_TICK_SECONDS,
  getLiveCandles,
  getLiveMarket,
  liveClockAt,
  livePairFor,
  liveSessionSeed,
} from '../live-market';

/**
 * The live terminal has one job: never show a candle that contradicts the market.
 * It runs at one times on a seed nobody has seen, so its promise is not fairness
 * between players — it is that the streaming price is the same price the generator
 * will seal a minute from, and that a chart open for a week keeps printing.
 */

// A fixed instant inside a generated day: 14:37:05 UTC on day 300.
const AT = (minuteOfHour: number, secondOfMinute = 0) =>
  (dayStartTime(300) + 14 * 3600 + minuteOfHour * 60 + secondOfMinute) * 1000;

/** Every field a candle has, compared by value — never by object identity. */
function sameBar(a: Candle, b: Candle): boolean {
  return a.time === b.time && a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close;
}

/** Where the clock says the newest tick sits, worked out independently of the market. */
const tickOf = (clock: { minuteIndex: number; subTick: number }) =>
  clock.minuteIndex * TICKS_PER_BAR + clock.subTick;

describe('Session seeds', () => {
  it('deals a different series for a different seed', () => {
    const one = livePairFor(SYNTH_PAIR, liveSessionSeed(1_700_000_000_000, () => 0.25));
    const two = livePairFor(SYNTH_PAIR, liveSessionSeed(1_700_000_000_500, () => 0.75));

    expect(one.salt).not.toBe(two.salt);
    expect(one.symbol).toBe(SYNTH_PAIR.symbol);
    expect(one.digits).toBe(SYNTH_PAIR.digits);
    // Same calendar, same ticker, nothing shared about the prices.
    expect(getGeneratedDay(5, one).bars).not.toEqual(getGeneratedDay(5, two).bars);
  });

  it('keeps the pairs apart even under one shared session seed', () => {
    const seed = liveSessionSeed(1_700_000_000_000, () => 0.5);
    const golds = SYNTH_PAIRS.map((p) => livePairFor(p, seed));

    expect(new Set(golds.map((p) => p.salt)).size).toBe(SYNTH_PAIRS.length);
    // Gold and crude must not be the same curve wearing different tickers.
    expect(getGeneratedDay(9, golds[0]).bars[300].close).not.toBe(getGeneratedDay(9, golds[2]).bars[300].close);
  });

  it('is a seed that will not come again', () => {
    // With no entropy the seed is the clock itself, so two visits in different
    // milliseconds cannot collide.
    expect(liveSessionSeed(1_700_000_000_000, () => 0)).not.toBe(liveSessionSeed(1_700_000_000_001, () => 0));

    // With entropy, a repeat would need the same draw in the same millisecond.
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(liveSessionSeed(Date.now(), Math.random));
    expect(seen.size).toBe(500);

    // And it never collapses to 0, which would stall the PRNG.
    expect(liveSessionSeed(0, () => 0)).not.toBe(0);
  });
});

describe('Live market at one times', () => {
  it('maps the wall clock onto the minute and tick that contain it', () => {
    const clock = liveClockAt(AT(37, 5));
    expect(clock.minuteOfDay).toBe(14 * 60 + 37);
    expect(clock.subTick).toBe(1); // 5 seconds into a 5-second slot
    expect(clock.dayIndex).toBe(300);

    // A tick lasts LIVE_TICK_SECONDS, so the slot does not move inside itself.
    expect(liveClockAt(AT(37, 5) + 4999).subTick).toBe(1);
    expect(liveClockAt(AT(37, 10)).subTick).toBe(2);
    expect(tickOf(liveClockAt(AT(37, 10)))).toBe(tickOf(clock) + 1);

    const market = getLiveMarket(SYNTH_PAIR, AT(37, 5));
    expect(market.forming.time).toBe(dayStartTime(300) + (14 * 3600 + 37 * 60));
    expect(market.tickIndex).toBe(tickOf(clock));
    // Countdown to the next print, always inside one tick.
    expect(market.nextTickInMs).toBeGreaterThan(0);
    expect(market.nextTickInMs).toBeLessThanOrEqual(LIVE_TICK_SECONDS * 1000);
  });

  it('hands over history up to the last completed minute, and no further', () => {
    const market = getLiveMarket(SYNTH_PAIR, AT(37, 20));
    const sealed = market.sealed1m;

    expect(sealed.length).toBe(LIVE_HISTORY_MINUTES);
    expect(sealed[sealed.length - 1].time).toBe(market.forming.time - 60);
    for (let i = 1; i < sealed.length; i++) {
      expect(sealed[i].time - sealed[i - 1].time).toBe(60);
    }
    // The forming price really is the newest tick of the forming minute.
    const day = getGeneratedDay(300);
    const first = (14 * 60 + 37) * TICKS_PER_BAR;
    expect(market.lastPrice).toBe(day.ticks[first + 4]);
  });

  it('is pure: the same instant twice gives the same market', () => {
    const ms = AT(12, 33);
    expect(getLiveMarket(SYNTH_PAIR, ms)).toEqual(getLiveMarket(SYNTH_PAIR, ms));
  });

  it('seals without repainting: the last slot of a minute is the finished bar', () => {
    // This is the whole guarantee a streaming chart needs — a candle that has run out
    // of seconds must already look exactly like the candle it becomes.
    for (const minute of [0, 1, 59, 60, 880, 1439]) {
      const ms = (dayStartTime(300) + minute * 60 + 60 - LIVE_TICK_SECONDS) * 1000;
      const market = getLiveMarket(SYNTH_PAIR, ms);
      expect(market.forming).toEqual(getGeneratedDay(300).bars[minute]);
    }
  });

  it('never lets the live candle step outside the bar it is printing', () => {
    const day = getGeneratedDay(300);

    for (const sub of [0, 1, 5, 10, TICKS_PER_BAR - 1]) {
      const market = getLiveMarket(SYNTH_PAIR, AT(37, sub * LIVE_TICK_SECONDS));
      const bar = day.bars[14 * 60 + 37];
      expect(market.forming.time).toBe(bar.time);
      expect(market.forming.open).toBe(bar.open);
      expect(market.forming.high).toBeLessThanOrEqual(bar.high);
      expect(market.forming.low).toBeGreaterThanOrEqual(bar.low);
      expect(market.forming.close).toBe(day.ticks[(14 * 60 + 37) * TICKS_PER_BAR + sub]);
    }
  });

  it('prints straight through UTC midnight', () => {
    const lateNight = getLiveMarket(SYNTH_PAIR, (dayStartTime(300) + 86400 - 20) * 1000);
    expect(lateNight.minuteOfDay).toBe(MINUTES_PER_DAY - 1);
    expect(lateNight.forming.time).toBe(dayStartTime(300) + 86400 - 60);

    const justAfter = getLiveMarket(SYNTH_PAIR, (dayStartTime(300) + 86400 + 3) * 1000);
    expect(justAfter.dayIndex).toBe(301);
    expect(justAfter.minuteOfDay).toBe(0);
    // The new day opens on the price the old day closed on — the seam a chart would
    // otherwise show as a gap at midnight.
    expect(justAfter.forming.open).toBe(getGeneratedDay(300).bars[MINUTES_PER_DAY - 1].close);
    expect(justAfter.forming.time - lateNight.forming.time).toBe(60);
  });

  it('reports the day it is trading, and a 24 hours-ago reference', () => {
    const market = getLiveMarket(SYNTH_PAIR, AT(37, 0));
    const day = getGeneratedDay(300);

    expect(market.dayOpen).toBe(day.bars[0].open);
    expect(market.dayHigh).toBeGreaterThanOrEqual(market.dayLow);
    expect(market.dayHigh).toBeGreaterThanOrEqual(market.lastPrice);
    expect(market.dayLow).toBeLessThanOrEqual(market.lastPrice);
    // The same minute one day earlier, which is the only reference a 24/7 market has.
    expect(market.referencePrice).toBe(getGeneratedDay(299).bars[14 * 60 + 37].close);
  });
});

describe('Live chart series', () => {
  const market = getLiveMarket(SYNTH_PAIR, AT(37, 5));

  it('shows the printing candle at the right edge on every timeframe', () => {
    for (const tf of ['1m', '5m', '15m', '1h'] as const) {
      const bars = getLiveCandles(market, tf);
      const last = bars[bars.length - 1];
      expect(last.close).toBe(market.lastPrice);
      expect(last.time).toBeLessThanOrEqual(market.forming.time);
      expect(last.high).toBeGreaterThanOrEqual(last.low);
    }
    // 1m is the raw feed; the rest are coarser views of the same prints.
    expect(getLiveCandles(market, '1m').length).toBeGreaterThan(getLiveCandles(market, '5m').length);
  });

  it('keeps every timeframe in strict time order, across bucket edges too', () => {
    const instants = [AT(0, 0), AT(59, 0), AT(59, 55), AT(0, 5), AT(14, 0), AT(15, 0)];
    const violations: string[] = [];

    for (const ms of instants) {
      const snap = getLiveMarket(SYNTH_PAIR, ms);
      for (const tf of ['1m', '5m', '15m', '1h'] as const) {
        const bars = getLiveCandles(snap, tf);
        for (let i = 1; i < bars.length; i++) {
          if (bars[i].time <= bars[i - 1].time) violations.push(`${tf}@${ms}: ${bars[i - 1].time} then ${bars[i].time}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('rolls the window without moving a bar it already drew', () => {
    const before = getLiveCandles(getLiveMarket(SYNTH_PAIR, AT(20, 0)), '1m');
    const after = getLiveCandles(getLiveMarket(SYNTH_PAIR, AT(21, 0)), '1m');

    // A fixed window: one minute off the left, one onto the right.
    expect(after.length).toBe(before.length);

    // The candle that was printing a minute ago is sealed now, and identical to the bar
    // the generator holds — nothing about it moved while it was being drawn.
    expect(after[after.length - 2]).toEqual(getGeneratedDay(300).bars[14 * 60 + 20]);

    const problems: string[] = [];
    for (let i = 0; i < after.length - 2; i++) {
      if (after[i].time !== before[i + 1].time || !sameBar(after[i], before[i + 1])) {
        problems.push(`${i}: ${after[i].time} is not the bar that was there`);
      }
    }
    expect(problems).toEqual([]);
  });
});
