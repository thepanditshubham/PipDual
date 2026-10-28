import { LEVEL_CAP } from './config';
import type { LevelProgress } from './types';

/** XP required to go from `level` to `level + 1`. */
export function xpStep(level: number): number {
  return 100 + 10 * (level - 1);
}

/** Total XP needed to reach `level` from level 1. */
export function totalXpForLevel(level: number): number {
  if (level <= 1) return 0;
  const n = Math.min(level, LEVEL_CAP);
  // Sum of xpStep(1..n-1) = (n-1) * (5n + 90)
  return (n - 1) * (5 * n + 90);
}

export function levelFromXp(totalXp: number): LevelProgress {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;

  while (level < LEVEL_CAP && xp >= totalXpForLevel(level + 1)) {
    level += 1;
  }

  if (level >= LEVEL_CAP) {
    return {
      level: LEVEL_CAP,
      intoLevel: 0,
      needed: 0,
      percent: 100,
      totalXp: xp,
      isMax: true,
    };
  }

  const floorXp = totalXpForLevel(level);
  const needed = xpStep(level);
  const intoLevel = xp - floorXp;

  return {
    level,
    intoLevel,
    needed,
    percent: Math.min(100, Math.round((intoLevel / needed) * 100)),
    totalXp: xp,
    isMax: false,
  };
}

/** XP credited for one match, before the discipline bonus. */
export function baseMatchXp(
  mode: 'ranked' | 'friendly' | 'practice',
  result: 'win' | 'loss' | 'draw',
): number {
  if (mode === 'practice') return 10;
  if (mode === 'friendly') {
    return Math.round(baseMatchXp('ranked', result) * 0.5);
  }
  if (result === 'win') return 50;
  if (result === 'loss') return 25;
  return 30;
}
