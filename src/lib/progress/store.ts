'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from '@/lib/auth/store';
import {
  DAILY_BONUS_COINS,
  STREAK_FREEZE_COST,
  achievementDef,
  missionDef,
  unlocksAt,
} from './config';
import { applyMatch, emptyProgressData } from './engine';
import { allDailyMissionsDone, ensureMissionPeriods, rerollDailyMissions } from './missions';
import { applyDecay, rankPosition } from './rank';
import { fetchRemoteProgress, syncSettlement, syncSnapshot } from './remote';
import { seasonAt } from './season';
import { computeDna } from './stats';
import { dayGap, istDayKey } from './time';
import { levelFromXp } from './xp';
import type {
  Celebration,
  MatchRecordInput,
  ProgressData,
  RewardPacket,
} from './types';

const STREAK_CHEST_COINS = 100;

interface ProgressStore extends ProgressData {
  bindUser: (userId: string) => void;
  recordLogin: () => void;
  settleMatch: (record: MatchRecordInput) => RewardPacket | null;
  claimMission: (missionId: string) => void;
  claimDailyBonus: () => void;
  rerollDaily: () => boolean;
  pinBadge: (achievementId: string) => void;
  equipTitle: (title: string | null) => void;
  /** Add a title earned outside the achievement track (season pass). */
  grantTitle: (title: string) => void;
  claimStreakChest: () => void;
  useStreakFreeze: () => boolean;
  dismissCelebration: (id: string) => void;
  clearNotices: () => void;
  hydrateRemote: () => Promise<void>;
  resetProgress: () => void;
}

function toData(state: ProgressData): ProgressData {
  return {
    userId: state.userId,
    xp: state.xp,
    seasonPassXp: state.seasonPassXp,
    rank: state.rank,
    stats: state.stats,
    missions: state.missions,
    achievements: state.achievements,
    pinned: state.pinned,
    titles: state.titles,
    activeTitle: state.activeTitle,
    streak: state.streak,
    practice: state.practice,
    dna: state.dna,
    settledMatchIds: state.settledMatchIds,
    celebrations: state.celebrations,
    notices: state.notices,
    lastLoginAt: state.lastLoginAt,
  };
}

function celebration(
  kind: Celebration['kind'],
  title: string,
  subtitle: string,
  details: string[],
): Celebration {
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title,
    subtitle,
    details,
    at: new Date().toISOString(),
  };
}

function levelUpCelebration(before: number, after: number, xpGain: number): Celebration | null {
  if (after <= before) return null;
  const details: string[] = [];
  for (let level = before + 1; level <= after; level += 1) details.push(...unlocksAt(level));
  return celebration(
    'level',
    `Level ${after}`,
    `+${xpGain} XP`,
    details.length > 0 ? details : ['XP is climbing. Keep the streak alive.'],
  );
}

export const useProgressStore = create<ProgressStore>()(
  persist(
    (set, get) => ({
      ...emptyProgressData(null),

      bindUser: (userId) => {
        if (!userId) return;
        const now = new Date();
        const state = get();

        if (state.userId !== userId) {
          set({ ...emptyProgressData(userId, now) });
        } else {
          // Returning player: roll seasons/missions forward before showing UI.
          const season = seasonAt(now);
          if (state.rank.seasonId !== season.id) {
            set({ ...emptyProgressData(userId, now) });
          }
        }

        get().recordLogin();
        void get().hydrateRemote();
      },

      recordLogin: () => {
        const now = new Date();
        const state = get();
        if (!state.userId) return;

        const today = istDayKey(now);
        const periods = ensureMissionPeriods(state.userId, state.missions, now);

        let rank = state.rank;
        const celebrations: Celebration[] = [];

        const season = seasonAt(now);
        if (rank.seasonId !== season.id) {
          const reset = emptyProgressData(state.userId, now).rank;
          rank = reset;
          celebrations.push(
            celebration(
              'season',
              `Season ${season.number} Started`,
              `${rankPosition(rank.rp).tierLabel} after soft reset`,
              [`${rank.placementTarget} placement matches to re-enter the ladder.`],
            ),
          );
        }

        const decay = applyDecay(rank, now);
        rank = decay.state;
        if (decay.decayed > 0) {
          celebrations.push(
            celebration('rank', 'Inactivity Decay', `−${decay.decayed} RP`, [
              'Play a ranked duel to stop the weekly decay.',
            ]),
          );
        }

        let streak = { ...state.streak };
        if (streak.lastLoginDay !== today) {
          if (!streak.lastLoginDay) {
            streak = { days: 1, lastLoginDay: today, cycleClaimed: false, pendingRestore: null };
          } else {
            const gap = dayGap(streak.lastLoginDay, today);
            if (gap === 1) {
              const days = streak.days >= 7 ? 1 : streak.days + 1;
              streak = {
                days,
                lastLoginDay: today,
                cycleClaimed: false,
                pendingRestore: null,
              };
            } else if (gap > 1) {
              streak = {
                days: 1,
                lastLoginDay: today,
                cycleClaimed: false,
                pendingRestore: { days: streak.days, missedDay: streak.lastLoginDay },
              };
            }
          }
        }

        const dna = computeDna(state.stats, now);

        set({
          rank,
          missions: periods.state,
          streak,
          dna,
          lastLoginAt: now.toISOString(),
          celebrations: [...celebrations, ...state.celebrations].slice(0, 12),
        });

        void syncSnapshot(state.userId, toData(get()));
      },

      settleMatch: (record) => {
        const state = get();
        if (!state.userId) return null;
        if (state.settledMatchIds.includes(record.matchId)) return null;

        const result = applyMatch(toData(state), record, new Date());
        if (!result) return null;

        set({ ...result.data });

        if (result.packet.coins > 0) {
          useAuthStore.getState().addCoins(result.packet.coins);
        }

        void syncSettlement(state.userId, record, result.analysis, result.data, result.packet);
        return result.packet;
      },

      claimMission: (missionId) => {
        const state = get();
        if (!state.userId) return;

        const now = new Date();
        const periods = ensureMissionPeriods(state.userId, state.missions, now);
        const missions = periods.state;
        const mission = [...missions.daily, ...missions.weekly].find((m) => m.missionId === missionId);
        const def = mission ? missionDef(missionId) : undefined;
        if (!mission || !def || mission.claimed || mission.progress < def.target) return;

        const before = levelFromXp(state.xp).level;
        const xp = state.xp + def.rewardXp;
        const after = levelFromXp(xp).level;

        const markClaimed = (list: typeof missions.daily) =>
          list.map((entry) => (entry.missionId === missionId ? { ...entry, claimed: true } : entry));

        const levelCelebration = levelUpCelebration(before, after, def.rewardXp);

        set({
          xp,
          seasonPassXp: state.seasonPassXp + def.rewardXp,
          missions: {
            ...missions,
            daily: markClaimed(missions.daily),
            weekly: markClaimed(missions.weekly),
          },
          dna: computeDna(state.stats, now),
          celebrations: levelCelebration
            ? [levelCelebration, ...state.celebrations].slice(0, 12)
            : state.celebrations,
        });

        if (def.rewardCoins > 0) useAuthStore.getState().addCoins(def.rewardCoins);
        void syncSnapshot(state.userId, toData(get()));
      },

      claimDailyBonus: () => {
        const state = get();
        if (!state.userId) return;
        const periods = ensureMissionPeriods(state.userId, state.missions, new Date());
        if (periods.state.bonusClaimed || !allDailyMissionsDone(periods.state)) return;

        set({ missions: { ...periods.state, bonusClaimed: true } });
        useAuthStore.getState().addCoins(DAILY_BONUS_COINS);
        void syncSnapshot(state.userId, toData(get()));
      },

      rerollDaily: () => {
        const state = get();
        if (!state.userId) return false;
        if (levelFromXp(state.xp).level < 5) return false;
        if (state.missions.rerollsUsed >= 1) return false;

        const next = rerollDailyMissions(state.userId, state.missions);
        set({ missions: next });
        void syncSnapshot(state.userId, toData(get()));
        return true;
      },

      pinBadge: (achievementId) => {
        const state = get();
        const progress = state.achievements[achievementId];
        const def = achievementDef(achievementId);
        if (!def || !progress) return;
        if (progress.progress < def.tiers[0].target) return;

        const pinned = state.pinned.includes(achievementId)
          ? state.pinned.filter((id) => id !== achievementId)
          : state.pinned.length >= 3
            ? [...state.pinned.slice(1), achievementId]
            : [...state.pinned, achievementId];

        set({ pinned });
        if (state.userId) void syncSnapshot(state.userId, toData(get()));
      },

      equipTitle: (title) => {
        if (title !== null && !get().titles.includes(title)) return;
        set({ activeTitle: title });
      },

      grantTitle: (title) => {
        const text = title.trim();
        if (!text) return;
        const state = get();
        if (state.titles.includes(text)) return;
        set({
          titles: [...state.titles, text],
          activeTitle: state.activeTitle ?? text,
        });
        if (state.userId) void syncSnapshot(state.userId, toData(get()));
      },

      claimStreakChest: () => {
        const state = get();
        if (!state.userId) return;
        if (state.streak.days < 7 || state.streak.cycleClaimed) return;
        set({ streak: { ...state.streak, cycleClaimed: true } });
        useAuthStore.getState().addCoins(STREAK_CHEST_COINS);
        void syncSnapshot(state.userId, toData(get()));
      },

      useStreakFreeze: () => {
        const state = get();
        if (!state.userId) return false;
        const pending = state.streak.pendingRestore;
        if (!pending) return false;
        const wallet = useAuthStore.getState().user?.virtualBalance ?? 0;
        if (wallet < STREAK_FREEZE_COST) return false;

        useAuthStore.getState().addCoins(-STREAK_FREEZE_COST);
        set({
          streak: { ...state.streak, days: pending.days, pendingRestore: null },
        });
        void syncSnapshot(state.userId, toData(get()));
        return true;
      },

      dismissCelebration: (id) => {
        set({ celebrations: get().celebrations.filter((entry) => entry.id !== id) });
      },

      clearNotices: () => set({ notices: [] }),

      hydrateRemote: async () => {
        const state = get();
        if (!state.userId) return;
        const remote = await fetchRemoteProgress(state.userId);
        if (!remote) return;
        const current = get();
        if (!current.userId || current.userId !== state.userId) return;
        if (remote.matches <= current.stats.matches) return;

        set({
          xp: Math.max(current.xp, remote.xp),
          rank: {
            ...current.rank,
            ...remote.rank,
            history: current.rank.history,
          },
          streak: {
            ...current.streak,
            days: Math.max(current.streak.days, remote.streakDays),
            lastLoginDay: remote.lastLoginDate ?? current.streak.lastLoginDay,
          },
        });
      },

      resetProgress: () => {
        set({ ...emptyProgressData(get().userId) });
      },
    }),
    {
      name: 'pip-duel-progress-v1',
      version: 1,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<ProgressData>;
        const base = emptyProgressData(saved.userId ?? null);
        return {
          ...current,
          ...base,
          ...saved,
          stats: { ...base.stats, ...(saved.stats ?? {}) },
          rank: { ...base.rank, ...(saved.rank ?? {}) },
          missions: { ...base.missions, ...(saved.missions ?? {}) },
          achievements: { ...base.achievements, ...(saved.achievements ?? {}) },
          streak: { ...base.streak, ...(saved.streak ?? {}) },
          practice: { ...base.practice, ...(saved.practice ?? {}) },
          dna: { ...base.dna, ...(saved.dna ?? {}) },
        };
      },
    },
  ),
);
