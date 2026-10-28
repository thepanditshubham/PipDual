import { NOTIONAL_PER_SIZE } from '@/lib/engine/constants';
import type { Action, Trade } from '@/lib/engine/types';
import {
  COMEBACK_PIPS,
  EARLY_EXIT_COUNT,
  EARLY_EXIT_TP_FRACTION,
  MIN_REENTRY_DELAY_SECONDS,
  OVERTRADE_BASE,
  OVERTRADE_BASE_SECONDS,
  PERFECT_PIP_MARGIN,
  REVENGE_WINDOW_SECONDS,
  SNIPER_MIN_PIPS,
  SNIPER_TRADE_COUNT,
  XAU_PIP_SIZE,
} from './config';
import type {
  BehaviorTag,
  DisciplineBreakdown,
  DisciplineResult,
  MatchAnalysis,
  TradeEvent,
} from './types';

export interface AnalyzeInput {
  actions: Action[];
  trades: Trade[];
  equity: number[];
  durationSeconds: number;
  ticksTotal: number;
  currentPrice: number;
  openPosition: {
    direction: 'long' | 'short';
    entryPrice: number;
    size: number;
    entryTick: number;
    slPct?: number;
    tpPct?: number;
  } | null;
  result: 'win' | 'loss' | 'draw';
}

type TradeWithPlan = TradeEvent & { slPct?: number; tpPct?: number };

function pipValue(direction: 'long' | 'short', entry: number, exit: number): number {
  const dir = direction === 'long' ? 1 : -1;
  return (dir * (exit - entry)) / XAU_PIP_SIZE;
}

function pnlValue(direction: 'long' | 'short', entry: number, exit: number, size: number): number {
  const dir = direction === 'long' ? 1 : -1;
  return (dir * ((exit - entry) / entry)) * size * NOTIONAL_PER_SIZE;
}

/** Find the stop/take attached to a trade's opening action(s). */
function planFor(actionList: Action[], trade: TradeEvent): { slPct?: number; tpPct?: number } {
  let slPct: number | undefined;
  let tpPct: number | undefined;

  for (const action of actionList) {
    if (action.type !== 'buy' && action.type !== 'sell') continue;
    if (action.t < trade.entryTick - 1 || action.t >= trade.exitTick) continue;
    const side = action.type === 'buy' ? 'long' : 'short';
    if (side !== trade.side) continue;
    if (action.slPct !== undefined) slPct = action.slPct;
    if (action.tpPct !== undefined) tpPct = action.tpPct;
  }

  return { slPct, tpPct };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function disciplineLabel(score: number): DisciplineResult['label'] {
  if (score >= 80) return 'Disciplined';
  if (score >= 60) return 'Developing';
  return 'Needs work';
}

export function analyzeMatch(input: AnalyzeInput): MatchAnalysis {
  const secondsPerTick = input.durationSeconds / Math.max(1, input.ticksTotal);
  const tickSeconds = (tick: number) => Math.round(tick * secondsPerTick * 10) / 10;

  const rawTrades: TradeEvent[] = input.trades.map((trade, index) => {
    const side = trade.direction;
    return {
      index,
      side,
      lot: trade.size,
      entryTick: trade.entryTick,
      exitTick: trade.exitTick,
      entryTs: tickSeconds(trade.entryTick),
      exitTs: tickSeconds(trade.exitTick),
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      pips: round2(pipValue(side, trade.entryPrice, trade.exitPrice)),
      pnl: round2(trade.pnl),
      reason: trade.reason,
    };
  });

  // The engine keeps a position open at the bell (it only force-closes at the
  // 1,200-tick limit), so the room hands it over here as a synthetic trade.
  if (input.openPosition) {
    const position = input.openPosition;
    const exitTick = Math.max(position.entryTick + 1, input.ticksTotal);
    const synthetic: TradeEvent = {
      index: rawTrades.length,
      side: position.direction,
      lot: position.size,
      entryTick: position.entryTick,
      exitTick,
      entryTs: tickSeconds(position.entryTick),
      exitTs: input.durationSeconds,
      entryPrice: position.entryPrice,
      exitPrice: input.currentPrice,
      pips: round2(pipValue(position.direction, position.entryPrice, input.currentPrice)),
      pnl: round2(
        pnlValue(position.direction, position.entryPrice, input.currentPrice, position.size),
      ),
      reason: 'forced',
    };
    rawTrades.push(synthetic);
  }

  const trades: TradeWithPlan[] = rawTrades
    .map((trade) => ({ ...trade, ...planFor(input.actions, trade) }))
    .sort((a, b) => a.entryTick - b.entryTick || a.exitTick - b.exitTick)
    .map((trade, index) => ({ ...trade, index }));

  const entryTrades = dedupeEntries(trades);
  const entryCount = entryTrades.length;
  const slTrades = trades.filter((trade) => (trade.slPct ?? 0) > 0);
  const slUsage = trades.length > 0 ? slTrades.length / trades.length : 0;

  const sizes = entryTrades.map((trade) => trade.lot).filter((size) => size > 0);
  const riskRatio = sizes.length > 1 ? Math.max(...sizes) / Math.max(1, Math.min(...sizes)) : 1;

  const holdTotal = trades.reduce((sum, trade) => sum + Math.max(0, trade.exitTs - trade.entryTs), 0);
  const avgHoldSeconds = trades.length > 0 ? holdTotal / trades.length : 0;

  const rMultiples = trades
    .filter((trade) => (trade.slPct ?? 0) > 0 && (trade.tpPct ?? 0) > 0)
    .map((trade) => (trade.tpPct as number) / (trade.slPct as number));
  const avgR = rMultiples.length > 0 ? rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length : 0;

  /* ── running pip curve ── */
  let running = 0;
  let lowest = 0;
  for (const trade of [...trades].sort((a, b) => a.exitTick - b.exitTick)) {
    running += trade.pips;
    lowest = Math.min(lowest, running);
  }
  const totalPips = trades.reduce((sum, trade) => sum + trade.pips, 0);
  const maxDeficitPips = Math.abs(lowest);

  /* ── re-entry behaviour ── */
  const reentryDelays: number[] = [];
  let revengeCount = 0;
  for (let i = 0; i < entryTrades.length - 1; i += 1) {
    const currentEntry = entryTrades[i];
    const previousExit = lastExitBefore(trades, currentEntry.entryTick);
    if (!previousExit) continue;
    const delay = Math.max(0, currentEntry.entryTs - previousExit.exitTs);
    reentryDelays.push(delay);
    if (previousExit.pnl < 0 && delay <= REVENGE_WINDOW_SECONDS && currentEntry.lot > previousExit.lot) {
      revengeCount += 1;
    }
  }
  const minReentry = reentryDelays.length > 0 ? Math.min(...reentryDelays) : null;
  const hasLossBeforeEntry = trades.some(
    (trade) => trade.pnl < 0 && entryTrades.some((entry) => entry.entryTick > trade.exitTick),
  );
  const noRevenge = !hasLossBeforeEntry || (minReentry !== null && minReentry >= MIN_REENTRY_DELAY_SECONDS);

  /* ── patience: consecutive entries closer than 20s ── */
  let rushedEntries = 0;
  for (let i = 1; i < entryTrades.length; i += 1) {
    if (entryTrades[i].entryTs - entryTrades[i - 1].entryTs < 20) rushedEntries += 1;
  }

  /* ── early exits & held losers ── */
  let earlyExits = 0;
  let heldLoser = 0;
  for (const trade of trades) {
    if (trade.reason === 'forced' && trade.pnl < 0 && (trade.slPct ?? 0) <= 0) heldLoser += 1;
    if (trade.reason !== 'close' || trade.pnl <= 0 || (trade.tpPct ?? 0) <= 0) continue;
    const targetMove = (trade.tpPct as number) / 100;
    const progress = Math.abs(trade.exitPrice - trade.entryPrice) / trade.entryPrice;
    if (progress < targetEarliness(targetMove)) earlyExits += 1;
  }

  const manualLosersWithoutStop = trades.filter(
    (trade) => trade.pnl < 0 && (trade.slPct ?? 0) <= 0 && trade.reason === 'close',
  ).length;

  /* ── discipline score ── */
  const stopLoss = round2(slUsage * 30);

  let riskConsistency: number;
  if (riskRatio <= 2) riskConsistency = 20;
  else riskConsistency = round2(20 * clamp((3 - riskRatio) / 1, 0, 1));

  let noRevengeScore: number;
  if (!hasLossBeforeEntry) noRevengeScore = 20;
  else if (minReentry === null) noRevengeScore = 20;
  else noRevengeScore = round2(20 * clamp(minReentry / MIN_REENTRY_DELAY_SECONDS, 0, 1));

  const patience = entryCount <= 1
    ? 15
    : round2(15 * clamp(1 - rushedEntries / Math.max(1, entryCount - 1), 0, 1));

  const planAdherence = round2(Math.max(0, 15 - manualLosersWithoutStop * 5));

  const breakdown: DisciplineBreakdown = {
    stopLoss,
    riskConsistency,
    noRevenge: noRevengeScore,
    patience,
    planAdherence,
  };
  const score = Math.round(stopLoss + riskConsistency + noRevengeScore + patience + planAdherence);
  const discipline: DisciplineResult = {
    score: clamp(score, 0, 100),
    breakdown,
    label: disciplineLabel(score),
  };

  /* ── behaviour tags ── */
  const behaviorTags: Partial<Record<BehaviorTag, number>> = {};
  if (revengeCount > 0) behaviorTags.revenge_trade = revengeCount;
  if (trades.length > OVERTRADE_BASE * (input.durationSeconds / OVERTRADE_BASE_SECONDS)) {
    behaviorTags.overtrading = 1;
  }
  if (earlyExits >= EARLY_EXIT_COUNT) behaviorTags.early_exit = earlyExits;
  if (heldLoser > 0) behaviorTags.held_loser = heldLoser;

  /* ── per-match achievement counters ── */
  const sniper =
    input.result === 'win' &&
    trades.length === SNIPER_TRADE_COUNT &&
    trades.every((trade) => trade.pips > SNIPER_MIN_PIPS);
  const comeback = input.result === 'win' && maxDeficitPips >= COMEBACK_PIPS;

  return {
    pips: round2(totalPips),
    maxDeficitPips: round2(maxDeficitPips),
    trades,
    discipline,
    behaviorTags,
    entryCount,
    slUsage: round2(slUsage),
    riskRatio: round2(riskRatio),
    reentryDelay: minReentry,
    avgHoldSeconds: round2(avgHoldSeconds),
    avgR: round2(avgR),
    achievements: {
      sniper: sniper ? 1 : 0,
      comeback: comeback ? 1 : 0,
      no_revenge: noRevenge ? 1 : 0,
      sl_always: slUsage === 1 && trades.length > 0 ? 1 : 0,
    },
  };
}

/** Wins by exactly one pip (a draw is anything under 1.0). */
export function isPhotoFinish(pipMargin: number, result: 'win' | 'loss' | 'draw'): boolean {
  return result === 'win' && Math.abs(pipMargin - PERFECT_PIP_MARGIN) < 0.0001;
}

function targetEarliness(tpFraction: number): number {
  return tpFraction * EARLY_EXIT_TP_FRACTION;
}

function lastExitBefore(trades: TradeWithPlan[], entryTick: number): TradeWithPlan | null {
  let latest: TradeWithPlan | null = null;
  for (const trade of trades) {
    if (trade.exitTick > entryTick) continue;
    if (!latest || trade.exitTick >= latest.exitTick) latest = trade;
  }
  return latest;
}

/** One representative row per position, keyed by entry tick. */
function dedupeEntries(trades: TradeWithPlan[]): TradeWithPlan[] {
  const seen = new Map<number, TradeWithPlan>();
  for (const trade of trades) {
    if (!seen.has(trade.entryTick)) seen.set(trade.entryTick, trade);
  }
  return Array.from(seen.values()).sort((a, b) => a.entryTick - b.entryTick);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
