'use client';

import { CalendarClock, Flame, Target, TrendingUp } from 'lucide-react';
import { useProgressStore } from '@/lib/progress/store';
import { levelFromXp, rankPosition } from '@/lib/progress';
import { claimableMissionCount } from '@/lib/progress/missions';
import { seasonAt, seasonCountdownLabel } from '@/lib/progress/season';
import type { ProgressTab } from '@/lib/progress/types';
import { ProgressBar, useNow } from './bits';

/**
 * Always-visible progress header (spec §10): level + XP meter, rank meter,
 * season clock and the live streak. Every block doubles as a tab shortcut.
 */
export function ProgressHeader({ onTab }: { onTab: (tab: ProgressTab) => void }) {
  const xp = useProgressStore((s) => s.xp);
  const rank = useProgressStore((s) => s.rank);
  const streak = useProgressStore((s) => s.streak);
  const missions = useProgressStore((s) => s.missions);
  const activeTitle = useProgressStore((s) => s.activeTitle);

  const now = useNow(30_000);
  const level = levelFromXp(xp);
  const position = rankPosition(rank.rp);
  const season = seasonAt(new Date(now));
  const claimable = claimableMissionCount(missions);
  const inPlacement = rank.placementPlayed < rank.placementTarget;
  const dailyDone = missions.daily.filter((entry) => entry.claimed).length;

  return (
    <div className="relative border-b border-[var(--term-border)] bg-[var(--term-panel-deep)]/70 p-4 space-y-3">
      <div className="flex items-center gap-3">
        {/* Rank emblem */}
        <button
          type="button"
          onClick={() => onTab('rank')}
          className="w-12 h-12 rounded-lg shrink-0 flex flex-col items-center justify-center border cursor-pointer transition-colors hover:brightness-125"
          style={{ borderColor: `${position.color}66`, background: `${position.color}14` }}
          title={`${position.tierLabel} · ${rank.rp} RP`}
        >
          <span className="text-[13px] font-black leading-none" style={{ color: position.color }}>
            {position.tier.slice(0, 2).toUpperCase()}
          </span>
          <span className="text-[9px] font-mono font-bold text-[var(--term-label)] leading-none mt-1">
            {position.division ?? 'TOP'}
          </span>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-bold text-[var(--term-strong)] font-mono">Lv. {level.level}</span>
              {activeTitle && (
                <span className="text-[10px] font-mono text-[var(--term-amber)] truncate">“{activeTitle}”</span>
              )}
            </div>
            <span className="text-[11px] font-mono text-[var(--term-label)] tabular-nums shrink-0">
              {level.isMax ? 'MAX LEVEL' : `${level.intoLevel.toLocaleString()} / ${level.needed.toLocaleString()} XP`}
            </span>
          </div>
          <div className="mt-1.5">
            <ProgressBar percent={level.percent} color="#f0a53a" />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[10px] font-mono text-[var(--term-soft)]">
            <span className="truncate">
              <span style={{ color: position.color }} className="font-bold">
                {inPlacement ? `Placement ${rank.placementPlayed}/${rank.placementTarget}` : position.tierLabel}
              </span>
              {!inPlacement && <> · {rank.rp.toLocaleString()} RP</>}
            </span>
            <span className="shrink-0">{level.isMax ? 'Prestige' : `${level.needed - level.intoLevel} XP to Lv. ${level.level + 1}`}</span>
          </div>
        </div>
      </div>

      {/* Quick blocks */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onTab('rank')}
          className="p-2 rounded bg-[var(--term-bg)]/80 border border-[var(--term-border)] hover:border-[var(--term-border-hi)] text-left cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--term-soft)] uppercase">
            <span className="flex items-center gap-1"><TrendingUp size={10} /> RP meter</span>
            <span className="text-[var(--term-label)]">{inPlacement ? '—' : `${position.percent}%`}</span>
          </div>
          <p className="text-[11px] font-bold text-[var(--term-strong)] mt-0.5 truncate">
            {inPlacement ? 'Unranked to Silver II' : position.nextLabel ?? 'Ladder peak'}
          </p>
          {!inPlacement && (
            <div className="mt-1">
              <ProgressBar percent={position.percent} color={position.color} height={3} />
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={() => onTab('missions')}
          className="p-2 rounded bg-[var(--term-bg)]/80 border border-[var(--term-border)] hover:border-[var(--term-border-hi)] text-left cursor-pointer transition-colors relative"
        >
          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--term-soft)] uppercase">
            <span className="flex items-center gap-1"><Target size={10} /> Missions</span>
            <span className={claimable > 0 ? 'text-[var(--term-buy)] font-bold' : 'text-[var(--term-label)]'}>
              {claimable > 0 ? `${claimable} ready` : `${dailyDone}/${missions.daily.length}`}
            </span>
          </div>
          <p className="text-[11px] font-bold text-[var(--term-strong)] mt-0.5 truncate">
            {claimable > 0 ? 'Claim your rewards' : 'Daily set in progress'}
          </p>
          {claimable > 0 && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--term-buy)] animate-pulse" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onTab('stats')}
          className="p-2 rounded bg-[var(--term-bg)]/80 border border-[var(--term-border)] hover:border-[var(--term-border-hi)] text-left cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--term-soft)] uppercase">
            <span className="flex items-center gap-1"><Flame size={10} /> Streak</span>
            <span className="text-[var(--term-amber)] font-bold">{streak.days}d</span>
          </div>
          <p className="text-[11px] font-bold text-[var(--term-strong)] mt-0.5 truncate">
            {streak.days >= 7 ? 'Day-7 chest ready' : `Day ${Math.min(7, streak.days + 1)} tomorrow`}
          </p>
        </button>
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--term-muted)]">
        <span className="flex items-center gap-1">
          <CalendarClock size={10} /> Season {season.number} · {seasonCountdownLabel(season)}
        </span>
        <span>Resets 00:00 IST</span>
      </div>
    </div>
  );
}
