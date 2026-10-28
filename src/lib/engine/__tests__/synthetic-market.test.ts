import { describe, it, expect } from 'vitest';
import { DISPLAY_TICKS, MINUTES_PER_DAY, PLAY_BARS, TICKS_PER_BAR } from '../constants';
import {
  SYNTH_PAIR,
  SYNTH_PAIRS,
  battleStartMinuteForTime,
  dayIndexForTime,
  dayLabel,
  dayOpenPrice,
  dayStartTime,
  getGeneratedDay,
  sessionLabel,
} from '../synthetic-market';
import { generateBattleMarket, getCandlesForTimeframe } from '../market-feed';

/**
 * The synthetic pair has to hold three promises the duel's fairness rests on:
 * identical bars wherever and whenever they are computed, a series that never runs
 * out or seams, and a tick path that can never contradict the bar it came from.
 */
describe('Endless synthetic market', () => {
  it('generates a full day of contiguous one-minute bars on the pair calendar', () => {
    const day = getGeneratedDay(40);
    expect(day.bars.length).toBe(MINUTES_PER_DAY);
    expect(day.bars[0].time).toBe(dayStartTime(40));
    expect(day.bars[1].time - day.bars[0].time).toBe(60);
    expect(day.bars[MINUTES_PER_DAY - 1].time - day.bars[0].time).toBe(MINUTES_PER_DAY * 60 - 60);
  });

  it('is deterministic: the same day twice, and after the cache has been evicted', () => {
    const before = getGeneratedDay(40);
    expect(before.bars).toEqual(getGeneratedDay(40).bars);

    // Walk far more days than the cache holds, then come back.
    for (let d = 100; d < 140; d++) getGeneratedDay(d);
    expect(getGeneratedDay(40).bars).toEqual(before.bars);
    expect(getGeneratedDay(40).ticks).toEqual(before.ticks);
  });

  it('keeps every pair on its own prices, in the order they were first looked up', () => {
    // The daily-open walk is cached by pair as well as day. Cached by day alone, the
    // first instrument asked would have answered for every one asked after it.
    const gold = SYNTH_PAIRS[0];
    const euro = SYNTH_PAIRS[1];

    const goldFirst = dayOpenPrice(300, gold);
    const euroOpen = dayOpenPrice(300, euro);

    expect(euroOpen).not.toBe(goldFirst);
    expect(dayOpenPrice(300, gold)).toBe(goldFirst);
    expect(getGeneratedDay(300, gold).bars[0].open).toBe(goldFirst);
  });

  it('stays sane on an instrument priced near one, where a fixed tick floor would swamp it', () => {
    const euro = SYNTH_PAIRS.find((p) => p.symbol === 'EUR/USD')!;
    const day = getGeneratedDay(300, euro);

    expect(day.bars[0].open).toBeGreaterThan(0.5);
    expect(day.bars[0].open).toBeLessThan(2);

    for (const c of day.bars.slice(0, 150)) {
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
      // Five decimals are really printed, not rounded onto gold-scale steps.
      expect(Math.round(c.close * 100000) / 100000).toBe(c.close);
    }
  });

  it('reconstructs ticks inside the bar for every pair on the roster', () => {
    for (const pair of SYNTH_PAIRS) {
      const day = getGeneratedDay(123, pair);
      for (const m of [0, 41, 600, MINUTES_PER_DAY - 1]) {
        const bar = day.bars[m];
        const ticks = day.ticks.slice(m * TICKS_PER_BAR, (m + 1) * TICKS_PER_BAR);
        expect(ticks[0]).toBe(bar.open);
        expect(ticks[ticks.length - 1]).toBe(bar.close);
        expect(Math.max(...ticks)).toBe(bar.high);
        expect(Math.min(...ticks)).toBe(bar.low);
      }
    }
  });

  it('produces valid OHLC on every bar of a day', () => {
    for (const c of getGeneratedDay(61).bars) {
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
      expect(c.high).toBeGreaterThanOrEqual(c.low);
      expect(c.low).toBeGreaterThan(0);
    }
  });

  it('joins days without a seam: a day opens where the previous one closed', () => {
    for (const d of [7, 8, 9]) {
      const today = getGeneratedDay(d);
      expect(today.bars[0].open).toBe(dayOpenPrice(d));
      expect(today.bars[MINUTES_PER_DAY - 1].close).toBe(dayOpenPrice(d + 1));
      expect(getGeneratedDay(d + 1).bars[0].open).toBe(today.bars[MINUTES_PER_DAY - 1].close);
    }
  });

  it('stays inside a plausible price band across years of days', () => {
    const low = SYNTH_PAIR.genesisPrice * 0.4;
    const high = SYNTH_PAIR.genesisPrice * 2.2;
    for (let d = 0; d <= 800; d += 40) {
      const price = dayOpenPrice(d);
      expect(price).toBeGreaterThan(low);
      expect(price).toBeLessThan(high);
    }
  });

  it('is quieter in the Asian session than in New York', () => {
    const bars = getGeneratedDay(120).bars;
    const avgMove = (fromHour: number, toHour: number) => {
      const slice = bars.slice(fromHour * 60, toHour * 60);
      return slice.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / slice.length;
    };
    expect(avgMove(14, 16)).toBeGreaterThan(avgMove(2, 6));
  });

  it('reconstructs a tick path that agrees with its bar', () => {
    const day = getGeneratedDay(33);
    expect(day.ticks.length).toBe(MINUTES_PER_DAY * TICKS_PER_BAR);

    for (let m = 0; m < MINUTES_PER_DAY; m += 37) {
      const bar = day.bars[m];
      const ticks = day.ticks.slice(m * TICKS_PER_BAR, (m + 1) * TICKS_PER_BAR);
      expect(ticks[0]).toBe(bar.open);
      expect(ticks[ticks.length - 1]).toBe(bar.close);
      for (const p of ticks) {
        expect(p).toBeLessThanOrEqual(bar.high);
        expect(p).toBeGreaterThanOrEqual(bar.low);
      }
      // The bar's extremes are really printed, so a wick is never decoration.
      expect(Math.max(...ticks)).toBe(bar.high);
      expect(Math.min(...ticks)).toBe(bar.low);
    }
  });

  it('maps an instant onto the day and the hour window that contains it', () => {
    const dayStart = dayStartTime(300);
    expect(dayIndexForTime(dayStart * 1000)).toBe(300);
    expect(dayIndexForTime((dayStart + 86399) * 1000)).toBe(300);
    expect(dayIndexForTime((dayStart + 86400) * 1000)).toBe(301);

    // Snapped down to the hour, which is what makes one window serve a whole hour of
    // duels instead of giving every room its own chart.
    expect(battleStartMinuteForTime((dayStart + 14 * 3600 + 59) * 1000)).toBe(14 * 60);
    expect(battleStartMinuteForTime((dayStart + 14 * 3600 + 3599) * 1000)).toBe(14 * 60);
    expect(battleStartMinuteForTime((dayStart + 15 * 3600) * 1000)).toBe(15 * 60);

    // A clock set before the pair's genesis still lands on a real day, at 00:00.
    expect(dayIndexForTime((dayStartTime(0) - 400000) * 1000)).toBe(0);
    expect(battleStartMinuteForTime((dayStartTime(0) - 400000) * 1000)).toBe(0);
  });

  it('is one market for every player in the same hour', () => {
    const hourStart = (dayStartTime(300) + 14 * 3600) * 1000;
    const early = generateBattleMarket(hourStart + 61 * 1000); // duel fired 14:01
    const lateInHour = generateBattleMarket(hourStart + 58 * 60 * 1000); // and 14:58

    expect(lateInHour.liveTicks).toEqual(early.liveTicks);
    expect(lateInHour.tickPath).toEqual(early.tickPath);
    expect(lateInHour.historicalCandles1m).toEqual(early.historicalCandles1m);
    expect(lateInHour.baseTime).toBe(early.baseTime);
    expect(lateInHour.battleSessionLabel).toBe(early.battleSessionLabel);

    // The next hour is the next window of the same series, one hour along.
    const nextHour = generateBattleMarket(hourStart + 60 * 60 * 1000);
    expect(nextHour.battleCandles1m[0].time).toBe(early.battleCandles1m[0].time + 3600);

    // Re-deriving from the same instant reproduces it exactly — all a verifier needs.
    expect(generateBattleMarket(hourStart + 61 * 1000).liveTicks).toEqual(early.liveTicks);
  });

  it('names the window by when it opens', () => {
    expect(sessionLabel(59, 840)).toBe('Mar 1, 2026 · 14:00 UTC');
    expect(sessionLabel(59, 0)).toBe('Mar 1, 2026 · 00:00 UTC');
    expect(sessionLabel(59, 1380)).toBe('Mar 1, 2026 · 23:00 UTC');
  });

  it('labels days from integer civil maths, not locale or timezone', () => {
    expect(dayLabel(0)).toBe('Jan 1, 2026');
    expect(dayLabel(30)).toBe('Jan 31, 2026');
    expect(dayLabel(59)).toBe('Mar 1, 2026'); // 2026 is not a leap year
    expect(dayLabel(365)).toBe('Jan 1, 2027');
  });
});

describe('Battle market feed on the synthetic pair', () => {
  // A 14:00 UTC window on a generated day — the market every duel in that hour trades.
  const market = generateBattleMarket((dayStartTime(300) + 14 * 3600) * 1000);

  it('carries one close per battle bar for the engine, and ticks for the chart', () => {
    // PLAY_BARS are played; the extra bar keeps the engine's final read unchanged.
    expect(market.battleCandles1m.length).toBe(PLAY_BARS + 1);
    expect(market.liveTicks.length).toBe(PLAY_BARS + 1);
    expect(market.liveTicks[0]).toBe(market.battleCandles1m[0].close);
    expect(market.tickPath.length).toBe(market.battleCandles1m.length * TICKS_PER_BAR);
    expect(market.instrument).toBe(SYNTH_PAIR.symbol);
    expect(market.startPrice).toBe(market.battleCandles1m[0].open);
  });

  it('shows only context history before the battle starts', () => {
    const preBattle = getCandlesForTimeframe(market, '1m', 0, market.baseTime, 0);
    expect(preBattle.length).toBe(market.historicalCandles1m.length);
    expect(preBattle[preBattle.length - 1].time).toBeLessThan(market.baseTime);
  });

  it('grows a forming candle from ticks inside the bar the engine is on', () => {
    const cursor = 20;
    const completed = getCandlesForTimeframe(market, '1m', cursor, market.baseTime, 0);
    expect(completed[completed.length - 1]).toEqual(market.battleCandles1m[cursor - 1]);

    const forming = getCandlesForTimeframe(market, '1m', cursor, market.baseTime, 4);
    const last = forming[forming.length - 1];
    expect(forming.length).toBe(completed.length + 1);
    expect(last.time).toBe(market.battleCandles1m[cursor].time);
    expect(last.open).toBe(market.tickPath[cursor * TICKS_PER_BAR]);
    expect(last.close).toBe(market.tickPath[cursor * TICKS_PER_BAR + 4]);
    expect(last.high).toBeLessThanOrEqual(market.battleCandles1m[cursor].high);
    expect(last.low).toBeGreaterThanOrEqual(market.battleCandles1m[cursor].low);
  });

  it('finishes a candle at exactly the bar the engine settles on', () => {
    const cursor = 20;
    const wholeBar = getCandlesForTimeframe(market, '1m', cursor, market.baseTime, TICKS_PER_BAR - 1);
    const last = wholeBar[wholeBar.length - 1];
    expect(last.close).toBe(market.liveTicks[cursor]);
  });

  it('keeps every timeframe in strict time order with no duplicate buckets', () => {
    // Boundary-heavy cursors: 5m/15m/1h buckets only line up cleanly at multiples of
    // 5, 15 and 60 bars, and that is where a merge could reopen a closed bucket.
    const cursors = [0, 1, 4, 5, 14, 15, 59, 60, 119, 120, 239, 240, PLAY_BARS - 1, PLAY_BARS];
    for (const tf of ['1m', '5m', '15m', '1h'] as const) {
      const violations: string[] = [];
      for (const tick of cursors) {
        for (const sub of [0, 1, 6, TICKS_PER_BAR - 1]) {
          const bars = getCandlesForTimeframe(market, tf, tick, market.baseTime, sub);
          for (let i = 1; i < bars.length; i++) {
            if (bars[i].time <= bars[i - 1].time) violations.push(`${tf}@${tick}+${sub}: ${bars[i - 1].time} then ${bars[i].time}`);
          }
        }
      }
      expect(violations).toEqual([]);
    }
  });

  it('aggregates the live bars from the same 1-minute source', () => {
    const cursor = 60; // a full hour of battle bars
    const oneMin = getCandlesForTimeframe(market, '1m', cursor, market.baseTime, 0);
    const fiveMin = getCandlesForTimeframe(market, '5m', cursor, market.baseTime, 0);
    const hourOfBattle = market.battleCandles1m.slice(0, cursor);

    const lastFive = fiveMin[fiveMin.length - 1];
    expect(lastFive.open).toBe(hourOfBattle[cursor - 5].open);
    expect(lastFive.close).toBe(hourOfBattle[cursor - 1].close);
    expect(lastFive.high).toBe(Math.max(...hourOfBattle.slice(cursor - 5).map((c) => c.high)));
    expect(lastFive.low).toBe(Math.min(...hourOfBattle.slice(cursor - 5).map((c) => c.low)));
    expect(oneMin.length).toBeGreaterThan(fiveMin.length);
  });

  // ── The contract the chart's incremental `series.update()` path depends on ──

  /** The frame the chart is handed at one sub-tick cursor. */
  const frameAt = (display: number) =>
    getCandlesForTimeframe(market, '1m', Math.floor(display / TICKS_PER_BAR), market.baseTime, display % TICKS_PER_BAR);

  it('walks every sub-tick as an append-only series: sealed bars never move', () => {
    const problems: string[] = [];
    let prev = frameAt(0);

    for (let display = 1; display <= DISPLAY_TICKS; display++) {
      const frame = frameAt(display);
      const last = frame[frame.length - 1];
      const prevLast = prev[prev.length - 1];

      if (frame.length < prev.length) problems.push(`${display}: series shrank`);
      if (last.time < prevLast.time) problems.push(`${display}: last bar went back in time`);

      if (last.time === prevLast.time) {
        // Same time → the chart mutates that bar in place, so it may only widen.
        if (last.open !== prevLast.open) problems.push(`${display}: forming open moved`);
        if (last.high < prevLast.high) problems.push(`${display}: forming high shrank`);
        if (last.low > prevLast.low) problems.push(`${display}: forming low lifted`);
      } else if (frame[frame.length - 2] !== prevLast) {
        // New bar appended: everything before it must be the very same sealed bars.
        problems.push(`${display}: appended onto a moved bar`);
      }

      if (display % TICKS_PER_BAR !== 0 && last.close !== market.tickPath[display]) {
        problems.push(`${display}: close is not the newest tick`);
      }

      prev = frame;
    }

    expect(problems.slice(0, 6)).toEqual([]);
  });

  it('seals a candle into exactly the bar it was forming', () => {
    // On a bar's last tick the forming candle must already equal the sealed bar, so
    // the moment a candle completes the chart cannot visibly jump.
    for (const c of [0, 1, 25, 100, PLAY_BARS - 1]) {
      const shown = getCandlesForTimeframe(market, '1m', c, market.baseTime, TICKS_PER_BAR - 1);
      expect(shown[shown.length - 1]).toEqual(market.battleCandles1m[c]);
    }
  });

  it('runs a late window straight through UTC midnight', () => {
    // 23:00 UTC leaves only the last hour of that day, so a 481-bar window has to keep
    // trading into the next one — the series is endless, not reset at midnight.
    const late = generateBattleMarket((dayStartTime(300) + 23 * 3600 + 40 * 60) * 1000);
    const barsIntoNextDay = PLAY_BARS + 1 - (MINUTES_PER_DAY - 23 * 60);

    expect(late.battleStartMinute).toBe(23 * 60);
    expect(late.battleCandles1m.length).toBe(PLAY_BARS + 1);
    expect(late.liveTicks.length).toBe(PLAY_BARS + 1);
    expect(late.tickPath.length).toBe((PLAY_BARS + 1) * TICKS_PER_BAR);

    // Still one contiguous minute grid across the join, with no gap or repeat.
    for (let i = 1; i < late.battleCandles1m.length; i++) {
      expect(late.battleCandles1m[i].time - late.battleCandles1m[i - 1].time).toBe(60);
    }

    // The window crosses into day 301 at exactly the right bar, and the seam holds:
    // the last midnight bar closes on the price the next bar opens at.
    const dayEnd = MINUTES_PER_DAY - 23 * 60; // 60 bars of day 300
    expect(late.battleCandles1m[dayEnd].time).toBe(dayStartTime(301));
    expect(late.battleCandles1m[dayEnd].open).toBe(getGeneratedDay(301).bars[0].open);
    expect(late.battleCandles1m[dayEnd - 1].close).toBe(late.battleCandles1m[dayEnd].open);
    expect(barsIntoNextDay).toBeGreaterThan(0);

    // Hour buckets stay ordered and unique over the crossing, where a naive
    // per-day aggregation would emit two bars on the same hour.
    const violations: string[] = [];
    for (const tick of [dayEnd - 1, dayEnd, dayEnd + 1, PLAY_BARS]) {
      for (const sub of [0, 1, TICKS_PER_BAR - 1]) {
        const hourly = getCandlesForTimeframe(late, '1h', tick, late.baseTime, sub);
        for (let i = 1; i < hourly.length; i++) {
          if (hourly[i].time <= hourly[i - 1].time) violations.push(`${tick}+${sub}: ${hourly[i - 1].time} then ${hourly[i].time}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
