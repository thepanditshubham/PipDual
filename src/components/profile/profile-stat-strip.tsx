'use client';

import type { PlayerStats } from '@/lib/profile/types';
import { rankPosition } from '@/lib/progress/rank';
import { formatNumber, rankLabel } from './shared';

export function ProfileStatStrip({ stats }: { stats: PlayerStats }) {
  const rank = rankPosition(stats.rankRp);
  const placed = stats.placementPlayed >= stats.placementTarget;
  const items: { label: string; value: string; hint?: string; accent?: string }[] = [
    { label: 'Duels', value: formatNumber(stats.totalDuels) },
    { label: 'Wins', value: formatNumber(stats.wins), accent: 'var(--up)' },
    { label: 'Losses', value: formatNumber(stats.losses), accent: 'var(--down)' },
    { label: 'Win rate', value: `${stats.winRate}%` },
    { label: 'Streak', value: formatNumber(stats.currentStreak), accent: stats.currentStreak > 0 ? 'var(--accent-hi)' : undefined },
    { label: 'Best streak', value: formatNumber(stats.highestStreak) },
    { label: 'Tournaments', value: formatNumber(stats.tournamentWins) },
    { label: 'Rank', value: placed ? rankLabel(stats.rankRp) : 'Unplaced', hint: placed ? `${formatNumber(stats.rankRp)} RP` : `${stats.placementPlayed}/${stats.placementTarget} placement`, accent: placed ? rank.color : undefined },
    { label: 'XP', value: formatNumber(stats.xp), hint: placed && stats.seasonRank ? `#${formatNumber(stats.seasonRank)} this season` : undefined },
  ];

  return (
    <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] sm:grid-cols-5 lg:grid-cols-9">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={`min-w-0 border-[var(--border)] px-2.5 py-2 ${
            index < items.length - 1 ? 'border-r' : ''
          } ${index < items.length - 3 ? 'border-b lg:border-b-0' : ''} ${index < 6 ? 'max-lg:border-b' : ''}`}
        >
          <p className="truncate text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {item.label}
          </p>
          <p
            className="mt-0.5 truncate font-mono text-sm font-bold tabular-nums text-[var(--text)]"
            style={item.accent ? { color: item.accent } : undefined}
          >
            {item.value}
          </p>
          {item.hint && (
            <p className="mt-0.5 truncate font-mono text-[8px] text-[var(--text-muted)]">{item.hint}</p>
          )}
        </div>
      ))}
    </div>
  );
}
