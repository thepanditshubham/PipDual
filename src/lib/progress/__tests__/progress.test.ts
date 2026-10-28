import { describe, expect, it } from 'vitest';

import {
  DAILY_MISSION_COUNT,
  PLACEMENT_MATCHES,
  SEASON_RESET_FACTOR,
  WEEKLY_MISSION_COUNT,
} from '@/lib/progress/config';
import { applyMatch, emptyProgressData } from '@/lib/progress/engine';
import { createMissionState, ensureMissionPeriods } from '@/lib/progress/missions';
import { applyDecay, createRankState, moveRp, rankPosition, rpDelta } from '@/lib/progress/rank';
import { seasonAt, softResetRank } from '@/lib/progress/season';
import { istDayKey, msUntilDailyReset } from '@/lib/progress/time';
import { levelFromXp, totalXpForLevel, xpStep } from '@/lib/progress/xp';
import type { MatchRecordInput, ProgressData } from '@/lib/progress/types';

const NOW = new Date('2026-10-27T12:00:00.000Z');

function record(overrides: Partial<MatchRecordInput> = {}): MatchRecordInput {
  return {
    matchId: 'm_test_1',
    room: 'TEST1',
    mode: 'ranked',
    pair: 'XAU/USD',
    durationSeconds: 300,
    outcome: 'win',
    pipMargin: 0,
    opponentRp: 1000,
    actions: [],
    trades: [],
    equity: [10_000],
    ticksTotal: 480,
    currentPrice: 2000,
    openPosition: null,
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

/** A snapshot already past placements, sitting at 1,000 RP (Silver I). */
function placed(overrides: Partial<ProgressData> = {}): ProgressData {
  const base = emptyProgressData('user-1', NOW);
  return {
    ...base,
    rank: {
      ...createRankState(base.rank.seasonId, PLACEMENT_MATCHES),
      placementPlayed: PLACEMENT_MATCHES,
      placementWins: 3,
      rp: 1000,
      peakRp: 1000,
    },
    ...overrides,
  };
}

describe('xp curve', () => {
  it('steps by 10 XP per level starting at 100', () => {
    expect(xpStep(1)).toBe(100);
    expect(xpStep(5)).toBe(140);
    expect(totalXpForLevel(2)).toBe(100);
    expect(totalXpForLevel(3)).toBe(210);
  });

  it('maps total XP onto level progress', () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, intoLevel: 0, needed: 100 });
    expect(levelFromXp(100)).toMatchObject({ level: 2, intoLevel: 0, needed: 110 });
    expect(levelFromXp(155)).toMatchObject({ level: 2, intoLevel: 55, percent: 50 });
  });

  it('caps at level 100', () => {
    const maxed = levelFromXp(totalXpForLevel(100) + 5_000_000);
    expect(maxed.level).toBe(100);
    expect(maxed.isMax).toBe(true);
    expect(maxed.percent).toBe(100);
  });
});

describe('rank ladder', () => {
  it('resolves 200-RP divisions, III to I', () => {
    expect(rankPosition(0)).toMatchObject({ tierLabel: 'Bronze III', floor: 0 });
    expect(rankPosition(200)).toMatchObject({ tierLabel: 'Bronze II', floor: 200 });
    expect(rankPosition(600)).toMatchObject({ tierLabel: 'Silver III', floor: 600 });
    expect(rankPosition(1100)).toMatchObject({ tierLabel: 'Silver I', floor: 1000 });
    expect(rankPosition(1250)).toMatchObject({ tierLabel: 'Gold III', floor: 1200 });
  });

  it('tops out at Master — Market Wizard is the leaderboard designation', () => {
    const master = rankPosition(3200);
    expect(master.tier).toBe('Master');
    expect(master.tierLabel).toBe('Master');
    expect(master.division).toBeNull();
  });

  it('pays +15 RP for an even win and nothing for a draw', () => {
    expect(rpDelta('win', 0, 1000, 1000)).toBe(15);
    expect(rpDelta('draw', 40, 1000, 1000)).toBe(0);
    // The margin bonus is margin / 5, capped at +10 (a 50+ pip gap).
    expect(rpDelta('win', 25, 1000, 1000)).toBe(20);
    expect(rpDelta('win', 500, 1000, 1000)).toBe(25);
  });

  it('scales with opponent strength and floors losses at −5', () => {
    expect(rpDelta('win', 0, 1000, 1400)).toBe(20);
    expect(rpDelta('win', 0, 1400, 1000)).toBe(10);
    // Losing to a far stronger rival is the mildest possible loss.
    expect(rpDelta('loss', 0, 1000, 2000)).toBe(-5);
    expect(rpDelta('loss', 0, 1400, 1000)).toBe(-15);
  });

  it('gives a freshly promoted player a 3-match shield', () => {
    const state = { ...createRankState('S1', PLACEMENT_MATCHES), rp: 590, placementPlayed: PLACEMENT_MATCHES };
    const promoted = moveRp(state, 610, NOW);

    expect(promoted.promoted).toBe(true);
    expect(promoted.state.shieldMatches).toBe(3);

    const dropped = moveRp(promoted.state, 380, NOW);

    expect(dropped.shielded).toBe(true);
    expect(dropped.demoted).toBe(false);
    expect(dropped.state.rp).toBe(600); // held at the Silver III floor
  });

  it('never decays below the Gold floor', () => {
    const idle = {
      ...createRankState('S1', PLACEMENT_MATCHES),
      rp: 1210,
      placementPlayed: PLACEMENT_MATCHES,
      lastRankedAt: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const result = applyDecay(idle, NOW);

    expect(result.decayed).toBe(10);
    expect(result.state.rp).toBe(1200);
    expect(applyDecay(result.state, NOW).decayed).toBe(0);
  });

  it('does not decay a player who played inside the 14-day window', () => {
    const recent = {
      ...createRankState('S1', PLACEMENT_MATCHES),
      rp: 1500,
      lastRankedAt: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    };

    expect(applyDecay(recent, NOW).decayed).toBe(0);
  });
});

describe('IST periods and seasons', () => {
  it('rolls the day key at 00:00 IST (18:30 UTC)', () => {
    expect(istDayKey(new Date('2026-10-27T18:29:00Z'))).toBe('2026-10-27');
    expect(istDayKey(new Date('2026-10-27T18:30:00Z'))).toBe('2026-10-28');
    expect(msUntilDailyReset(new Date('2026-10-27T18:30:00Z'))).toBe(24 * 60 * 60 * 1000);
  });

  it('counts 8-week seasons from the 2026-10-05 IST epoch', () => {
    expect(seasonAt(new Date('2026-10-05T00:00:00+05:30'))).toMatchObject({ number: 1, id: 'S1' });
    expect(seasonAt(new Date('2026-11-30T00:00:00+05:30')).number).toBe(2);
  });

  it('soft resets RP to 60% at a season boundary', () => {
    const rank = { ...createRankState('S1', PLACEMENT_MATCHES), rp: 2000 };
    const reset = softResetRank(rank, 'S2');

    expect(reset.rp).toBe(Math.floor(2000 * SEASON_RESET_FACTOR));
    expect(reset.placementPlayed).toBe(0);
    expect(reset.history).toHaveLength(0);
  });
});

describe('missions', () => {
  it('draws the daily and weekly pools deterministically per user', () => {
    const a = createMissionState('user-1', NOW);
    const b = createMissionState('user-1', NOW);

    expect(a.daily).toHaveLength(DAILY_MISSION_COUNT);
    expect(a.weekly).toHaveLength(WEEKLY_MISSION_COUNT);
    expect(a.daily.map((m) => m.missionId)).toEqual(b.daily.map((m) => m.missionId));
    // No duplicates inside a period.
    expect(new Set(a.daily.map((m) => m.missionId)).size).toBe(DAILY_MISSION_COUNT);
  });

  it('redraws when the IST day or week rolls over', () => {
    const state = createMissionState('user-1', NOW);
    const nextDay = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);

    const sameDay = ensureMissionPeriods('user-1', state, NOW);
    expect(sameDay.rolledDaily).toBe(false);

    const rolled = ensureMissionPeriods('user-1', state, nextDay);
    expect(rolled.rolledDaily).toBe(true);
    expect(rolled.state.dailyKey).toBe(istDayKey(nextDay));
    expect(rolled.state.rerollsUsed).toBe(0);
  });
});

describe('match settlement', () => {
  it('settles once per match id', () => {
    const first = applyMatch(placed(), record(), NOW);

    expect(first).not.toBeNull();
    expect(first!.data.settledMatchIds).toContain('m_test_1');
    expect(first!.packet.rp).toBe(15);

    const replay = applyMatch(first!.data, record(), NOW);
    expect(replay).toBeNull();
  });

  it('credits XP, coins and a ranked win', () => {
    const packet = applyMatch(placed(), record(), NOW)!.packet;

    expect(packet.result).toBe('win');
    expect(packet.xp).toBeGreaterThanOrEqual(50);
    expect(packet.coins).toBeGreaterThanOrEqual(20);
    expect(packet.rankAfter.tierLabel).toBe('Silver I');
    expect(packet.demoted).toBe(false);
  });

  it('completes placements at 5 matches and seeds RP from the win rate', () => {
    const base = emptyProgressData('user-1', NOW);
    let data = base;

    for (let index = 0; index < PLACEMENT_MATCHES; index += 1) {
      const result = applyMatch(
        data,
        record({ matchId: `m_place_${index}`, outcome: index < 4 ? 'win' : 'loss' }),
        NOW,
      );
      expect(result).not.toBeNull();
      data = result!.data;

      if (index < PLACEMENT_MATCHES - 1) {
        expect(result!.packet.placementDone).toBe(false);
        expect(result!.packet.rp).toBe(0);
      } else {
        // 4 wins out of 5 clears the 75% band → Silver III (600 RP).
        expect(result!.packet.placementDone).toBe(true);
        expect(result!.packet.rp).toBe(600);
      }
    }

    expect(data.rank.placementPlayed).toBe(PLACEMENT_MATCHES);
    expect(data.rank.history[0].rp).toBe(600);
  });

  it('never touches RP in practice or friendly duels', () => {
    const practice = applyMatch(placed(), record({ mode: 'practice' }), NOW)!;
    expect(practice.packet.rp).toBe(0);
    expect(practice.packet.rankAfter.floor).toBe(1000);

    const friendly = applyMatch(placed(), record({ mode: 'friendly' }), NOW)!;
    expect(friendly.packet.rp).toBe(0);
    expect(friendly.packet.coins).toBe(5);
  });

  it('counts career stats and pushes a notice for the lobby', () => {
    const result = applyMatch(placed(), record(), NOW)!;

    expect(result.data.stats.matches).toBe(1);
    expect(result.data.stats.wins).toBe(1);
    expect(result.data.stats.rankedStreak).toBe(1);
    expect(result.data.notices[0].tone).toBe('good');
  });
});
