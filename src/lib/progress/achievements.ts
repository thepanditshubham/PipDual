import { ACHIEVEMENTS, achievementDef } from './config';
import type {
  AchievementMetric,
  AchievementProgress,
  AchievementTier,
  AchievementTierDef,
} from './types';

export function createAchievementState(): Record<string, AchievementProgress> {
  const state: Record<string, AchievementProgress> = {};
  for (const def of ACHIEVEMENTS) {
    state[def.id] = { progress: 0, claimed: {} };
  }
  return state;
}

export interface AchievementUnlock {
  id: string;
  name: string;
  tier: AchievementTier;
  title?: string;
  coins: number;
}

/**
 * Fold one match into the achievement counters.
 * `absolute` metrics (win streaks, nemesis counts) overwrite rather than add.
 */
export function advanceAchievements(
  state: Record<string, AchievementProgress>,
  contributions: Partial<Record<AchievementMetric, number>>,
  absolute: Partial<Record<AchievementMetric, number>> = {},
): { state: Record<string, AchievementProgress>; unlocked: AchievementUnlock[] } {
  const next: Record<string, AchievementProgress> = { ...state };
  const unlocked: AchievementUnlock[] = [];

  for (const def of ACHIEVEMENTS) {
    const current = next[def.id] ?? { progress: 0, claimed: {} };
    const before = current.progress;
    const additive = contributions[def.metric] ?? 0;
    const absoluteValue = absolute[def.metric];
    const progress = Math.max(before, absoluteValue ?? 0) + additive;

    if (progress === before) continue;

    next[def.id] = { ...current, progress };

    for (const tier of def.tiers) {
      if (before < tier.target && progress >= tier.target && !current.claimed[tier.tier]) {
        unlocked.push({
          id: def.id,
          name: def.name,
          tier: tier.tier,
          title: tier.tier === 'gold' ? def.title : undefined,
          coins: tier.coins,
        });
      }
    }
  }

  return { state: next, unlocked };
}

export function claimableAchievementCount(state: Record<string, AchievementProgress>): number {
  let total = 0;
  for (const def of ACHIEVEMENTS) {
    const progress = state[def.id]?.progress ?? 0;
    for (const tier of def.tiers) {
      if (progress >= tier.target && !state[def.id]?.claimed?.[tier.tier]) total += 1;
    }
  }
  return total;
}

export function tierUnlocked(progress: AchievementProgress | undefined, tier: AchievementTierDef): boolean {
  return (progress?.progress ?? 0) >= tier.target;
}

export function nextTier(
  id: string,
  progress: AchievementProgress | undefined,
): AchievementTierDef | null {
  const def = achievementDef(id);
  if (!def) return null;
  return def.tiers.find((tier) => (progress?.progress ?? 0) < tier.target) ?? null;
}

export function isFullyUnlocked(id: string, progress: AchievementProgress | undefined): boolean {
  const def = achievementDef(id);
  if (!def) return false;
  const last = def.tiers[def.tiers.length - 1];
  return (progress?.progress ?? 0) >= last.target;
}

export function achievementProgressRatio(
  id: string,
  progress: AchievementProgress | undefined,
): number {
  const def = achievementDef(id);
  if (!def) return 0;
  const value = progress?.progress ?? 0;
  const next = def.tiers.find((tier) => value < tier.target);
  if (!next) return 100;
  const previous = [...def.tiers].reverse().find((tier) => value >= tier.target);
  const base = previous?.target ?? 0;
  const span = Math.max(1, next.target - base);
  return Math.min(100, Math.round(((value - base) / span) * 100));
}
