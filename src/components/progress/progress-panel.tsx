'use client';

import { useState } from 'react';
import { Award, BarChart3, Crown, Info, Target, Trophy } from 'lucide-react';
import { useProgressStore } from '@/lib/progress/store';
import { claimableMissionCount } from '@/lib/progress/missions';
import type { ProgressTab } from '@/lib/progress/types';
import { ProgressHeader } from './progress-header';
import { RankTab } from './rank-tab';
import { MissionsTab } from './missions-tab';
import { AchievementsTab } from './achievements-tab';
import { LeaderboardTab } from './leaderboard-tab';
import { StatsTab } from './stats-tab';
import { sound } from '@/components/terminal/sound';
import { useHydrated } from './bits';

const TABS: { id: ProgressTab; label: string; icon: typeof Crown }[] = [
  { id: 'rank', label: 'Rank', icon: Crown },
  { id: 'missions', label: 'Missions', icon: Target },
  { id: 'achievements', label: 'Achievements', icon: Award },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
];

/**
 * The lobby Progress screen (spec §10): one tab, five sub-tabs, and a header
 * that stays visible whichever sub-tab is open.
 */
export function ProgressPanel({
  initialTab = 'rank',
  className = '',
}: {
  initialTab?: ProgressTab;
  className?: string;
}) {
  const [tab, setTab] = useState<ProgressTab>(initialTab);
  const mounted = useHydrated();
  const userId = useProgressStore((s) => s.userId);
  const missions = useProgressStore((s) => s.missions);

  if (!mounted || !userId) {
    return (
      <div className={`bg-[var(--term-surface)]/70 backdrop-blur-md border border-[var(--term-border)] rounded-xl p-5 space-y-3 animate-pulse ${className}`}>
        <div className="h-12 rounded bg-[var(--term-raised)]" />
        <div className="h-2 rounded bg-[var(--term-raised)]" />
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-8 rounded bg-[var(--term-raised)]" />
          ))}
        </div>
        <div className="h-40 rounded bg-[var(--term-raised)]" />
      </div>
    );
  }

  const claimable = claimableMissionCount(missions);

  return (
    <div className={`bg-[var(--term-surface)]/70 backdrop-blur-md border border-[var(--term-border)] rounded-xl overflow-hidden animate-in fade-in duration-200 ${className}`}>
      <ProgressHeader onTab={setTab} />

      {/* Sub-tabs */}
      <div role="tablist" aria-label="Progress sections" className="grid grid-cols-5 bg-[var(--term-panel-deep)]/60 border-b border-[var(--term-border)]">
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const active = tab === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                sound.playClick();
                setTab(entry.id);
              }}
              className={`relative h-10 flex items-center justify-center gap-1.5 text-[11px] font-bold transition-colors cursor-pointer border-b-2 ${
                active
                  ? 'text-[var(--term-strong)] border-[var(--term-accent)] bg-[var(--term-raised)]/70'
                  : 'text-[var(--term-soft)] border-transparent hover:text-[var(--term-strong)]'
              }`}
            >
              <Icon size={12} className={active ? 'text-[var(--term-accent)]' : ''} />
              <span className="hidden sm:inline">{entry.label}</span>
              {entry.id === 'missions' && claimable > 0 && (
                <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-[var(--term-buy)] animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      <div className="p-4 md:p-5 max-h-[560px] overflow-y-auto">
        {tab === 'rank' && <RankTab />}
        {tab === 'missions' && <MissionsTab />}
        {tab === 'achievements' && <AchievementsTab />}
        {tab === 'leaderboard' && <LeaderboardTab />}
        {tab === 'stats' && <StatsTab />}
      </div>

      <div className="px-4 py-2 border-t border-[var(--term-border)] flex items-center justify-between text-[9px] font-mono text-[var(--term-dim)]">
        <span className="flex items-center gap-1">
          <Info size={9} /> Nothing on this screen can be bought — rewards come from play.
        </span>
        <span>Server-verified settlement</span>
      </div>
    </div>
  );
}
