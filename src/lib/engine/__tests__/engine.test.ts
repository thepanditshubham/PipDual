import { describe, it, expect } from 'vitest';
import {
  rng,
  makeTicks,
  simulate,
  score,
  determineWinner,
  computeElo,
  botActions,
  TICKS,
  START_BALANCE,
  NOTIONAL_PER_SIZE,
} from '../index';
import type { Action, ScoreResult } from '../types';

describe('Deterministic Engine', () => {
  it('PRNG is deterministic with the same seed', () => {
    const rand1 = rng(12345);
    const rand2 = rng(12345);
    const series1 = Array.from({ length: 10 }, () => rand1());
    const series2 = Array.from({ length: 10 }, () => rand2());
    expect(series1).toEqual(series2);
  });

  it('makeTicks produces identical price series for same seed', () => {
    const ticks1 = makeTicks(999);
    const ticks2 = makeTicks(999);
    expect(ticks1).toEqual(ticks2);
    expect(ticks1.length).toBe(TICKS + 2);
    expect(ticks1[0]).toBe(1000);
  });

  it('enforces next-tick fill rule (order at t fills at t+1)', () => {
    // Construct controlled prices: [1000, 1005, 1010, 1020, 1015, ...]
    const prices = new Array(TICKS + 2).fill(1000);
    prices[10] = 1000;
    prices[11] = 1010; // Fill price for action submitted at t=10
    prices[15] = 1020;
    prices[16] = 1030; // Fill price for close action submitted at t=15

    const actions: Action[] = [
      { t: 10, type: 'buy', size: 1 },
      { t: 15, type: 'close', size: 1 },
    ];

    const result = simulate(prices, actions);
    expect(result.trades.length).toBe(1);
    const trade = result.trades[0];
    expect(trade.entryTick).toBe(11);
    expect(trade.entryPrice).toBe(1010);
    expect(trade.exitTick).toBe(16);
    expect(trade.exitPrice).toBe(1030);

    // pnl = (1030 - 1010) / 1010 * 1 * NOTIONAL_PER_SIZE
    const expectedPnl = ((1030 - 1010) / 1010) * 1 * NOTIONAL_PER_SIZE;
    expect(trade.pnl).toBeCloseTo(expectedPnl, 2);
  });

  it('triggers Stop Loss accurately', () => {
    const prices = new Array(TICKS + 2).fill(1000);
    prices[5] = 1000; // action at 5
    prices[6] = 1000; // fill at 6 at 1000
    prices[7] = 998;  // -0.2%
    prices[8] = 994;  // -0.6% -> should trigger 0.5% SL

    const actions: Action[] = [
      { t: 5, type: 'buy', size: 1, slPct: 0.5 },
    ];

    const result = simulate(prices, actions);
    expect(result.trades.length).toBe(1);
    expect(result.trades[0].reason).toBe('sl');
    expect(result.trades[0].exitTick).toBe(8);
    expect(result.trades[0].exitPrice).toBe(994);
  });

  it('triggers Take Profit accurately', () => {
    const prices = new Array(TICKS + 2).fill(1000);
    prices[5] = 1000;
    prices[6] = 1000; // fill at 6
    prices[7] = 1005; // +0.5%
    prices[8] = 1012; // +1.2% -> should trigger 1.0% TP

    const actions: Action[] = [
      { t: 5, type: 'buy', size: 1, tpPct: 1.0 },
    ];

    const result = simulate(prices, actions);
    expect(result.trades.length).toBe(1);
    expect(result.trades[0].reason).toBe('tp');
    expect(result.trades[0].exitTick).toBe(8);
    expect(result.trades[0].exitPrice).toBe(1012);
  });

  it('enforces no-future-leak in simulate with upTo parameter', () => {
    const prices = makeTicks(42);
    const actions: Action[] = [
      { t: 5, type: 'buy', size: 1 },
      { t: 20, type: 'close', size: 1 },
      { t: 30, type: 'sell', size: 2 },
    ];

    // Simulating up to tick 15 should only see actions and prices up to tick 15
    const simUpTo15 = simulate(prices, actions, 15);
    expect(simUpTo15.trades.length).toBe(0); // position entered at t=6 is still open (or forced at 15)
    expect(simUpTo15.equity.length).toBe(16); // ticks 0..15
  });

  it('scores correctly for standard and risk modes', () => {
    const mockResult = {
      pnl: 500,
      maxDrawdown: 150,
      trades: [
        {
          direction: 'long' as const,
          entryPrice: 1000,
          exitPrice: 1010,
          size: 1,
          entryTick: 1,
          exitTick: 10,
          pnl: 500,
          reason: 'close' as const,
        },
      ],
      equity: [START_BALANCE, START_BALANCE + 500],
      openPosition: null,
    };

    const standardScore = score(mockResult, 'standard');
    expect(standardScore.score).toBe(500);

    const riskScore = score(mockResult, 'risk');
    expect(riskScore.score).toBe(350); // 500 - 150
  });

  it('resolves tie-breaks by lower drawdown, then fewer trades, then draw', () => {
    const p1: ScoreResult = { score: 200, pnl: 200, maxDrawdown: 50, tradeCount: 3 };
    const p2: ScoreResult = { score: 200, pnl: 200, maxDrawdown: 80, tradeCount: 2 };
    // Same score -> lower drawdown wins (p1)
    expect(determineWinner(p1, p2)).toBe(1);

    const p3: ScoreResult = { score: 200, pnl: 200, maxDrawdown: 50, tradeCount: 2 };
    // Same score and same drawdown -> fewer trades wins (p3 over p1)
    expect(determineWinner(p1, p3)).toBe(2);

    const p4: ScoreResult = { score: 200, pnl: 200, maxDrawdown: 50, tradeCount: 2 };
    // Exact tie
    expect(determineWinner(p3, p4)).toBe(0);
  });

  it('computes Elo ratings correctly with K=32', () => {
    const { newA, newB } = computeElo(1200, 1200, 1);
    expect(newA).toBe(1216);
    expect(newB).toBe(1184);

    const draw = computeElo(1200, 1200, 0);
    expect(draw.newA).toBe(1200);
    expect(draw.newB).toBe(1200);
  });

  it('botActions produces deterministic actions given same price and seed', () => {
    const prices = makeTicks(555);
    const actions1 = botActions(prices, 12345);
    const actions2 = botActions(prices, 12345);
    expect(actions1).toEqual(actions2);
    expect(actions1.length).toBeGreaterThan(0);
  });
});
