import { describe, expect, it } from 'vitest';
import { computeBattleStats, recentForm } from '@/lib/profile/stats';

const battle = (result: 'win' | 'loss' | 'draw', createdAt: string) => ({ result, createdAt });

describe('computeBattleStats', () => {
  it('returns empty aggregates for a new trader', () => {
    expect(computeBattleStats([])).toEqual({
      total: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      currentStreak: 0,
      highestStreak: 0,
    });
  });

  it('counts totals, win rate and the current streak', () => {
    const stats = computeBattleStats([
      battle('win', '2026-10-01T10:00:00.000Z'),
      battle('win', '2026-10-02T10:00:00.000Z'),
      battle('loss', '2026-10-03T10:00:00.000Z'),
      battle('win', '2026-10-04T10:00:00.000Z'),
      battle('win', '2026-10-05T10:00:00.000Z'),
    ]);

    expect(stats.total).toBe(5);
    expect(stats.wins).toBe(4);
    expect(stats.losses).toBe(1);
    expect(stats.winRate).toBe(80);
    expect(stats.currentStreak).toBe(2);
    expect(stats.highestStreak).toBe(2);
  });

  it('sorts records before deriving streaks', () => {
    const stats = computeBattleStats([
      battle('win', '2026-10-05T10:00:00.000Z'),
      battle('win', '2026-10-03T10:00:00.000Z'),
      battle('win', '2026-10-01T10:00:00.000Z'),
    ]);

    expect(stats.currentStreak).toBe(3);
    expect(stats.highestStreak).toBe(3);
  });

  it('treats a draw as a streak break, not a loss', () => {
    const stats = computeBattleStats([
      battle('win', '2026-10-01T10:00:00.000Z'),
      battle('draw', '2026-10-02T10:00:00.000Z'),
      battle('win', '2026-10-03T10:00:00.000Z'),
    ]);

    expect(stats.losses).toBe(0);
    expect(stats.draws).toBe(1);
    expect(stats.currentStreak).toBe(1);
    expect(stats.highestStreak).toBe(1);
  });

  it('reports the newest five results as recent form', () => {
    const rows = [
      battle('loss', '2026-10-01T10:00:00.000Z'),
      battle('win', '2026-10-02T10:00:00.000Z'),
      battle('draw', '2026-10-03T10:00:00.000Z'),
      battle('win', '2026-10-04T10:00:00.000Z'),
      battle('win', '2026-10-05T10:00:00.000Z'),
      battle('loss', '2026-10-06T10:00:00.000Z'),
    ];

    expect(recentForm(rows, 5)).toEqual(['loss', 'win', 'win', 'draw', 'win']);
  });
});
