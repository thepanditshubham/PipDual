import { NOTIONAL_PER_SIZE, START_BALANCE, TICKS } from './constants';
import type { Action, GameMode, Position, ScoreResult, SimulationResult, Trade } from './types';

/**
 * Simulate a match given a price array and a set of player actions.
 * 
 * Key rules:
 * - Actions at tick `t` fill at `prices[t+1]` (next-tick fill)
 * - One open position at a time
 * - SL/TP checked every tick on the open position
 * - Forced close at tick TICKS
 * - `upTo` parameter prevents reading prices beyond that index (no future leaks)
 */
export function simulate(
  prices: number[],
  actions: Action[],
  upTo?: number,
): SimulationResult {
    const maxTick = upTo !== undefined ? Math.min(upTo, prices.length - 1) : Math.min(TICKS, prices.length - 1);
  let balance = START_BALANCE;
  let position: Position | null = null;
  const trades: Trade[] = [];
  const equity: number[] = [];

  // Sort actions by tick
  const sortedActions = [...actions].sort((a, b) => a.t - b.t);

  // Build a map of tick -> actions for fast lookup
  const actionMap = new Map<number, Action[]>();
  for (const action of sortedActions) {
    if (action.t > maxTick) continue; // Skip out-of-range actions
    const existing = actionMap.get(action.t) || [];
    existing.push(action);
    actionMap.set(action.t, existing);
  }

  for (let tick = 0; tick <= maxTick; tick++) {
    // 1. Check SL/TP on open position at this tick's price
    if (position && tick > 0 && tick <= maxTick) {
      const currentPrice = prices[tick];
      const entryPrice = position.entryPrice;
      const pctChange = (currentPrice - entryPrice) / entryPrice;
      const directedChange = position.direction === 'long' ? pctChange : -pctChange;

      // Check Stop Loss
      if (position.slPct !== undefined && position.slPct > 0) {
        if (directedChange <= -(position.slPct / 100)) {
          const pnl = computePnl(position.direction, entryPrice, currentPrice, position.size);
          trades.push({
            direction: position.direction,
            entryPrice,
            exitPrice: currentPrice,
            size: position.size,
            entryTick: position.entryTick,
            exitTick: tick,
            pnl,
            reason: 'sl',
          });
          balance += pnl;
          position = null;
        }
      }

      // Check Take Profit (only if position still exists)
      if (position && position.tpPct !== undefined && position.tpPct > 0) {
        if (directedChange >= position.tpPct / 100) {
          const pnl = computePnl(position.direction, entryPrice, currentPrice, position.size);
          trades.push({
            direction: position.direction,
            entryPrice,
            exitPrice: currentPrice,
            size: position.size,
            entryTick: position.entryTick,
            exitTick: tick,
            pnl,
            reason: 'tp',
          });
          balance += pnl;
          position = null;
        }
      }
    }

    // 2. Process actions that were submitted at the PREVIOUS tick (fill at t+1)
    const prevTickActions = actionMap.get(tick - 1);
    if (prevTickActions && tick <= maxTick && tick < prices.length) {
      for (const action of prevTickActions) {
        const fillPrice = prices[tick]; // Fill at next tick's price

        if (action.type === 'close') {
          if (position) {
            const pnl = computePnl(position.direction, position.entryPrice, fillPrice, position.size);
            trades.push({
              direction: position.direction,
              entryPrice: position.entryPrice,
              exitPrice: fillPrice,
              size: position.size,
              entryTick: position.entryTick,
              exitTick: tick,
              pnl,
              reason: 'close',
            });
            balance += pnl;
            position = null;
          }
        } else if (action.type === 'buy' || action.type === 'sell') {
          const actionDir: 'long' | 'short' = action.type === 'buy' ? 'long' : 'short';

          if (!position) {
            position = {
              direction: actionDir,
              entryPrice: fillPrice,
              size: action.size,
              entryTick: tick,
              slPct: action.slPct,
              tpPct: action.tpPct,
            };
          } else if (position.direction === actionDir) {
            // Scale into position (multi-order pyramiding)
            const newTotalSize = position.size + action.size;
            const weightedEntry =
              (position.entryPrice * position.size + fillPrice * action.size) / newTotalSize;
            position.entryPrice = Math.round(weightedEntry * 100) / 100;
            position.size = newTotalSize;
            if (action.slPct) position.slPct = action.slPct;
            if (action.tpPct) position.tpPct = action.tpPct;
          } else {
            // Opposite order: reduce or reverse position
            if (action.size >= position.size) {
              const pnl = computePnl(position.direction, position.entryPrice, fillPrice, position.size);
              trades.push({
                direction: position.direction,
                entryPrice: position.entryPrice,
                exitPrice: fillPrice,
                size: position.size,
                entryTick: position.entryTick,
                exitTick: tick,
                pnl,
                reason: 'close',
              });
              balance += pnl;

              const remSize: number = action.size - position.size;
              if (remSize > 0) {
                position = {
                  direction: actionDir,
                  entryPrice: fillPrice,
                  size: remSize,
                  entryTick: tick,
                  slPct: action.slPct,
                  tpPct: action.tpPct,
                };
              } else {
                position = null;
              }
            } else {
              // Partial close
              const pnl = computePnl(position.direction, position.entryPrice, fillPrice, action.size);
              trades.push({
                direction: position.direction,
                entryPrice: position.entryPrice,
                exitPrice: fillPrice,
                size: action.size,
                entryTick: position.entryTick,
                exitTick: tick,
                pnl,
                reason: 'close',
              });
              balance += pnl;
              position.size -= action.size;
            }
          }
        }
      }
    }

    // 3. Record equity (balance + unrealised P&L)
    if (tick <= maxTick && tick < prices.length) {
      const unrealised = position
        ? computePnl(position.direction, position.entryPrice, prices[tick], position.size)
        : 0;
      equity.push(balance + unrealised);
    }
  }

  // 4. Force-close at the end of the match (only when match completes at TICKS)
  if (position && maxTick >= TICKS && maxTick < prices.length) {
    const exitPrice = prices[maxTick];
    const pnl = computePnl(position.direction, position.entryPrice, exitPrice, position.size);
    trades.push({
      direction: position.direction,
      entryPrice: position.entryPrice,
      exitPrice,
      size: position.size,
      entryTick: position.entryTick,
      exitTick: maxTick,
      pnl,
      reason: 'forced',
    });
    balance += pnl;
    position = null;

    // Update last equity point
    if (equity.length > 0) {
      equity[equity.length - 1] = balance;
    }
  }

  // 5. Compute max drawdown from equity curve (peak-to-trough)
  const maxDrawdown = computeMaxDrawdown(equity);

  const unrealised = position && maxTick < prices.length
    ? computePnl(position.direction, position.entryPrice, prices[maxTick], position.size)
    : 0;
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0) + unrealised;

  return {
    pnl: totalPnl,
    maxDrawdown,
    trades,
    equity,
    openPosition: position,
  };
}

/** Compute P&L for a single position */
function computePnl(
  direction: 'long' | 'short',
  entryPrice: number,
  exitPrice: number,
  size: number,
): number {
  const dir = direction === 'long' ? 1 : -1;
  return dir * ((exitPrice - entryPrice) / entryPrice) * size * NOTIONAL_PER_SIZE;
}

/** Compute max drawdown from an equity curve */
function computeMaxDrawdown(equity: number[]): number {
  if (equity.length === 0) return 0;

  let peak = equity[0];
  let maxDD = 0;

  for (const value of equity) {
    if (value > peak) {
      peak = value;
    }
    const dd = peak - value;
    if (dd > maxDD) {
      maxDD = dd;
    }
  }

  return maxDD;
}

/**
 * Score a simulation result based on game mode.
 * - standard: score = pnl
 * - risk: score = pnl - maxDrawdown
 * Tiebreaker: lower drawdown > fewer trades > draw
 */
export function score(result: SimulationResult, mode: GameMode): ScoreResult {
  const s = mode === 'standard' ? result.pnl : result.pnl - result.maxDrawdown;

  return {
    score: Math.round(s * 100) / 100,
    pnl: Math.round(result.pnl * 100) / 100,
    maxDrawdown: Math.round(result.maxDrawdown * 100) / 100,
    tradeCount: result.trades.length,
  };
}

/**
 * Determine the winner between two score results.
 * Returns: 1 if p1 wins, 2 if p2 wins, 0 if draw.
 */
export function determineWinner(p1: ScoreResult, p2: ScoreResult): 0 | 1 | 2 {
  if (p1.score > p2.score) return 1;
  if (p2.score > p1.score) return 2;

  // Tiebreaker 1: lower drawdown wins
  if (p1.maxDrawdown < p2.maxDrawdown) return 1;
  if (p2.maxDrawdown < p1.maxDrawdown) return 2;

  // Tiebreaker 2: fewer trades wins
  if (p1.tradeCount < p2.tradeCount) return 1;
  if (p2.tradeCount < p1.tradeCount) return 2;

  return 0; // Draw
}

/**
 * Elo rating calculation.
 * K=32 for all players.
 */
export function computeElo(
  ratingA: number,
  ratingB: number,
  result: 0 | 1 | 2,
): { newA: number; newB: number } {
  const K = 32;
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;

  let scoreA: number;
  let scoreB: number;

  if (result === 1) {
    scoreA = 1;
    scoreB = 0;
  } else if (result === 2) {
    scoreA = 0;
    scoreB = 1;
  } else {
    scoreA = 0.5;
    scoreB = 0.5;
  }

  return {
    newA: Math.round(ratingA + K * (scoreA - expectedA)),
    newB: Math.round(ratingB + K * (scoreB - expectedB)),
  };
}
