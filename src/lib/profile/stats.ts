import type { BattleResult } from './types';

export interface BattleLike {
  result: BattleResult;
  createdAt: string;
}

export interface DerivedBattleStats {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  currentStreak: number;
  highestStreak: number;
}

/**
 * Derives display statistics from the platform battle rows. The database keeps
 * the authoritative aggregate inside get_player_profile(); this mirror is used
 * by tests and by the overview's recent-form strip, never as an input to a
 * profile write.
 */
export function computeBattleStats(rows: BattleLike[]): DerivedBattleStats {
  const ordered = [...rows].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  let wins = 0;
  let losses = 0;
  let draws = 0;
  let currentStreak = 0;
  let highestStreak = 0;

  for (const row of ordered) {
    if (row.result === 'win') {
      wins += 1;
      currentStreak += 1;
      highestStreak = Math.max(highestStreak, currentStreak);
    } else if (row.result === 'loss') {
      losses += 1;
      currentStreak = 0;
    } else {
      draws += 1;
      currentStreak = 0;
    }
  }

  const total = ordered.length;
  return {
    total,
    wins,
    losses,
    draws,
    winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
    currentStreak,
    highestStreak,
  };
}

/** W/L/D strip for the last N battles, newest first. */
export function recentForm(rows: BattleLike[], limit = 5): BattleResult[] {
  return [...rows]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
    .map((row) => row.result);
}
