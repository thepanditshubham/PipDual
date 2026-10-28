import type {
  BehaviorTag,
  CareerStats,
  GameModeTag,
  MatchAnalysis,
  TraderDNA,
} from './types';
import { istWeekKey } from './time';

export function emptyStats(): CareerStats {
  return {
    matches: 0,
    rankedMatches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    totalPips: 0,
    bestPips: 0,
    worstPips: 0,
    totalTrades: 0,
    slTrades: 0,
    maxDrawdown: 0,
    holdSeconds: 0,
    holdSamples: 0,
    reentrySamples: 0,
    reentrySeconds: 0,
    riskRatioSum: 0,
    riskRatioSamples: 0,
    rSum: 0,
    rSamples: 0,
    disciplineSum: 0,
    disciplineSamples: 0,
    disciplineHistory: [],
    behavior: {
      revenge_trade: 0,
      overtrading: 0,
      early_exit: 0,
      stop_moved_wider: 0,
      held_loser: 0,
    },
    pairs: {},
    rankedStreak: 0,
    bestRankedStreak: 0,
    sniperMatches: 0,
    comebackWins: 0,
    noRevengeMatches: 0,
    slAlwaysMatches: 0,
    goldWins: 0,
    perfectPipWins: 0,
    nemesisWins: {},
    lastMatchAt: null,
  };
}

export function applyMatchToStats(
  stats: CareerStats,
  input: {
    mode: GameModeTag;
    pair: string;
    outcome: 'win' | 'loss' | 'draw';
    pips: number;
    discipline: number;
    opponentKey?: string;
    photoFinish: boolean;
    analysis: MatchAnalysis;
    createdAt: string;
  },
): CareerStats {
  const next: CareerStats = {
    ...stats,
    behavior: { ...stats.behavior },
    pairs: { ...stats.pairs },
    nemesisWins: { ...stats.nemesisWins },
    disciplineHistory: [...stats.disciplineHistory],
  };

  const ranked = input.mode === 'ranked';
  const win = input.outcome === 'win';

  next.matches += 1;
  if (ranked) next.rankedMatches += 1;
  if (win) next.wins += 1;
  else if (input.outcome === 'loss') next.losses += 1;
  else next.draws += 1;

  next.totalPips = round2(next.totalPips + input.pips);
  next.bestPips = Math.max(next.bestPips, input.pips);
  next.worstPips = Math.min(next.worstPips, input.pips);

  next.totalTrades += input.analysis.trades.length;
  next.slTrades += input.analysis.trades.filter((trade) => (trade.slPct ?? 0) > 0).length;

  next.holdSeconds += input.analysis.avgHoldSeconds * Math.max(1, input.analysis.trades.length);
  next.holdSamples += input.analysis.trades.length;

  if (input.analysis.reentryDelay !== null) {
    next.reentrySamples += 1;
    next.reentrySeconds += input.analysis.reentryDelay;
  }

  next.riskRatioSum += input.analysis.riskRatio;
  next.riskRatioSamples += 1;

  if (input.analysis.avgR > 0) {
    next.rSum += input.analysis.avgR;
    next.rSamples += 1;
  }

  next.disciplineSum += input.discipline;
  next.disciplineSamples += 1;
  next.disciplineHistory = [...next.disciplineHistory, input.discipline].slice(-20);

  for (const tag of Object.keys(input.analysis.behaviorTags) as BehaviorTag[]) {
    next.behavior[tag] += input.analysis.behaviorTags[tag] ?? 0;
  }

  const pair = next.pairs[input.pair] ?? { matches: 0, wins: 0 };
  next.pairs[input.pair] = {
    matches: pair.matches + 1,
    wins: pair.wins + (win ? 1 : 0),
  };

  if (ranked) {
    next.rankedStreak = win ? next.rankedStreak + 1 : 0;
    next.bestRankedStreak = Math.max(next.bestRankedStreak, next.rankedStreak);
  }

  if (input.analysis.achievements.sniper) next.sniperMatches += 1;
  if (input.analysis.achievements.comeback) next.comebackWins += 1;
  if (input.analysis.achievements.no_revenge) next.noRevengeMatches += 1;
  if (input.analysis.achievements.sl_always) next.slAlwaysMatches += 1;
  if (win && input.pair === 'XAU/USD') next.goldWins += 1;
  if (input.photoFinish) next.perfectPipWins += 1;

  if (win && input.opponentKey) {
    next.nemesisWins[input.opponentKey] = (next.nemesisWins[input.opponentKey] ?? 0) + 1;
  }

  next.lastMatchAt = input.createdAt;
  return next;
}

/* ─────────────────────────────── derived ──────────────────────────────── */

export function winRate(stats: CareerStats): number {
  const played = stats.wins + stats.losses + stats.draws;
  return played > 0 ? round2((stats.wins / played) * 100) : 0;
}

export function slUsagePercent(stats: CareerStats): number {
  return stats.totalTrades > 0 ? round2((stats.slTrades / stats.totalTrades) * 100) : 0;
}

export function averageHoldSeconds(stats: CareerStats): number {
  return stats.holdSamples > 0 ? round2(stats.holdSeconds / stats.holdSamples) : 0;
}

export function averageReentrySeconds(stats: CareerStats): number {
  return stats.reentrySamples > 0 ? round2(stats.reentrySeconds / stats.reentrySamples) : 0;
}

export function averageRiskRatio(stats: CareerStats): number {
  return stats.riskRatioSamples > 0 ? round2(stats.riskRatioSum / stats.riskRatioSamples) : 1;
}

export function averageR(stats: CareerStats): number {
  return stats.rSamples > 0 ? round2(stats.rSum / stats.rSamples) : 0;
}

export function rollingDiscipline(stats: CareerStats): number {
  if (stats.disciplineHistory.length === 0) return 0;
  const sum = stats.disciplineHistory.reduce((acc, value) => acc + value, 0);
  return Math.round(sum / stats.disciplineHistory.length);
}

export function disciplineLabel(score: number): 'Disciplined' | 'Developing' | 'Needs work' {
  if (score >= 80) return 'Disciplined';
  if (score >= 60) return 'Developing';
  return 'Needs work';
}

export function tradesPerMatch(stats: CareerStats): number {
  return stats.matches > 0 ? round2(stats.totalTrades / stats.matches) : 0;
}

/* ─────────────────────────────── Trader DNA ───────────────────────────── */

export function computeDna(stats: CareerStats, now: Date = new Date()): TraderDNA {
  const weekKey = istWeekKey(now);
  const discipline = rollingDiscipline(stats);
  const sl = slUsagePercent(stats);
  const riskRatio = averageRiskRatio(stats);
  const avgTrades = tradesPerMatch(stats);
  const winPct = winRate(stats);
  const avgR = averageR(stats);
  const reentry = averageReentrySeconds(stats);

  const riskConsistency =
    stats.riskRatioSamples === 0 ? 60 : riskRatio <= 2 ? 100 : Math.max(0, 100 - (riskRatio - 2) * 50);
  const risk = clamp(
    stats.totalTrades === 0 ? 50 : sl * 0.55 + riskConsistency * 0.45,
    0,
    100,
  );

  const patienceBase = clamp(100 - Math.max(0, avgTrades - 2) * 14, 0, 100);
  const reentryBonus =
    stats.reentrySamples === 0 ? 60 : clamp((reentry / 30) * 100, 0, 100);
  const patience = Math.round(patienceBase * 0.7 + reentryBonus * 0.3);

  const timing = stats.matches === 0
    ? 50
    : Math.round(clamp(winPct * 0.7 + clamp(avgR / 3, 0, 1) * 100 * 0.3, 0, 100));

  const lossRate = stats.matches > 0 ? (stats.losses / stats.matches) * 100 : 0;
  const drawdownPressure = stats.maxDrawdown > 0 ? Math.min(40, stats.maxDrawdown / 25) : 0;
  const consistency = stats.matches === 0
    ? 50
    : Math.round(clamp(100 - lossRate * 0.4 - drawdownPressure, 0, 100));

  return {
    weekKey,
    risk: Math.round(risk),
    patience,
    timing,
    discipline: discipline || 50,
    consistency,
    insight: dnaInsight({ discipline, sl, reentry, avgTrades, risk }),
  };
}

function dnaInsight(input: {
  discipline: number;
  sl: number;
  reentry: number;
  avgTrades: number;
  risk: number;
}): string {
  if (input.discipline > 0 && input.discipline >= 80) {
    return 'Process is your edge — keep the same routine and let results follow.';
  }
  if (input.sl > 0 && input.sl < 80) {
    return 'Missing stop losses is costing you Discipline. Attach one to every entry.';
  }
  if (input.reentry > 0 && input.reentry < 30) {
    return `You re-enter ~${Math.round(input.reentry)}s after a loss; wait 30s to avoid revenge trades.`;
  }
  if (input.avgTrades > 6) {
    return 'Fewer, higher-conviction trades suit you better — try 3 or fewer per duel.';
  }
  if (input.risk < 55) {
    return 'Keep lot sizes within 2x of each other to stabilise risk per trade.';
  }
  return 'Steady baseline. Focus on patience and a fixed stop-loss rule this week.';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
