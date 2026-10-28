import {
  DAILY_MISSION_COUNT,
  DAILY_POOL,
  WEEKLY_MISSION_COUNT,
  WEEKLY_POOL,
  missionDef,
} from './config';
import { istDayKey, istWeekKey } from './time';
import type { MissionMetrics, MissionState, UserMission } from './types';

export function createMissionState(userId: string, now: Date = new Date()): MissionState {
  const dailyKey = istDayKey(now);
  const weeklyKey = istWeekKey(now);
  return {
    dailyKey,
    weeklyKey,
    daily: drawMissions(userId, dailyKey, 0, DAILY_POOL, DAILY_MISSION_COUNT),
    weekly: drawMissions(userId, weeklyKey, 0, WEEKLY_POOL, WEEKLY_MISSION_COUNT),
    bonusClaimed: false,
    rerollsUsed: 0,
  };
}

/** Re-draw daily/weekly missions when their IST period keys roll over. */
export function ensureMissionPeriods(
  userId: string,
  state: MissionState,
  now: Date = new Date(),
): { state: MissionState; rolledDaily: boolean; rolledWeekly: boolean } {
  const dailyKey = istDayKey(now);
  const weeklyKey = istWeekKey(now);

  if (state.dailyKey === dailyKey && state.weeklyKey === weeklyKey) {
    return { state, rolledDaily: false, rolledWeekly: false };
  }

  const rolledDaily = state.dailyKey !== dailyKey;
  const rolledWeekly = state.weeklyKey !== weeklyKey;

  return {
    state: {
      dailyKey: rolledDaily ? dailyKey : state.dailyKey,
      weeklyKey: rolledWeekly ? weeklyKey : state.weeklyKey,
      daily: rolledDaily
        ? drawMissions(userId, dailyKey, 0, DAILY_POOL, DAILY_MISSION_COUNT)
        : state.daily,
      weekly: rolledWeekly
        ? drawMissions(userId, weeklyKey, 0, WEEKLY_POOL, WEEKLY_MISSION_COUNT)
        : state.weekly,
      bonusClaimed: rolledDaily ? false : state.bonusClaimed,
      rerollsUsed: rolledDaily ? 0 : state.rerollsUsed,
    },
    rolledDaily,
    rolledWeekly,
  };
}

export function rerollDailyMissions(
  userId: string,
  state: MissionState,
): MissionState {
  const salt = state.rerollsUsed + 1;
  return {
    ...state,
    daily: drawMissions(userId, state.dailyKey, salt, DAILY_POOL, DAILY_MISSION_COUNT),
    rerollsUsed: salt,
    bonusClaimed: false,
  };
}

export function advanceMissions(
  state: MissionState,
  metrics: MissionMetrics,
): { missions: MissionState; completedIds: string[] } {
  const completed: string[] = [];
  const bump = (mission: UserMission): UserMission => {
    const def = missionDef(mission.missionId);
    if (!def || mission.claimed) return mission;
    const increment = metrics[def.metric] ?? 0;
    if (increment <= 0 || mission.progress >= def.target) return mission;
    const progress = Math.min(def.target, mission.progress + increment);
    if (progress >= def.target) completed.push(mission.missionId);
    return { ...mission, progress };
  };

  return {
    missions: {
      ...state,
      daily: state.daily.map(bump),
      weekly: state.weekly.map(bump),
    },
    completedIds: completed,
  };
}

export function allDailyMissionsDone(state: MissionState): boolean {
  if (state.daily.length === 0) return false;
  return state.daily.every((mission) => {
    const def = missionDef(mission.missionId);
    return def ? mission.progress >= def.target : false;
  });
}

export function dailyBonusClaimable(state: MissionState): boolean {
  return !state.bonusClaimed && allDailyMissionsDone(state);
}

export function claimableMissionCount(state: MissionState): number {
  const isClaimable = (mission: UserMission) => {
    const def = missionDef(mission.missionId);
    return !!def && !mission.claimed && mission.progress >= def.target;
  };
  return [...state.daily, ...state.weekly].filter(isClaimable).length + (dailyBonusClaimable(state) ? 1 : 0);
}

export function missionTotals(now: Date = new Date()): { dailyKey: string; weeklyKey: string } {
  return { dailyKey: istDayKey(now), weeklyKey: istWeekKey(now) };
}

/* ─────────────────────────── deterministic draw ─────────────────────────── */

function drawMissions<T extends { id: string }>(
  userId: string,
  periodKey: string,
  salt: number,
  pool: readonly T[],
  count: number,
): UserMission[] {
  if (pool.length === 0) return [];
  const random = mulberry32(hash(`${userId}:${periodKey}:${salt}`));
  const bag = [...pool];

  // Fisher-Yates with the seeded generator keeps the daily set stable per user.
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }

  return bag.slice(0, Math.min(count, bag.length)).map((entry) => ({
    missionId: entry.id,
    progress: 0,
    claimed: false,
  }));
}

export function missionMetricsFromMatch(input: {
  rankedWin: boolean;
  pair: string;
  trades: number;
  slAlways: boolean;
  discipline: number;
  durationSeconds: number;
}): MissionMetrics {
  return {
    matches_played: 1,
    ranked_wins: input.rankedWin ? 1 : 0,
    gold_wins: input.rankedWin && input.pair === 'XAU/USD' ? 1 : 0,
    sl_match: input.slAlways ? 1 : 0,
    low_trade_match: input.trades > 0 && input.trades <= 2 ? 1 : 0,
    ranked_5m_wins: input.rankedWin && input.durationSeconds === 300 ? 1 : 0,
    discipline_70: input.discipline >= 70 ? 1 : 0,
  };
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
