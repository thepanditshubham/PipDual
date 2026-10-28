'use client';

import { BarChart3, Info } from 'lucide-react';
import { useProgressStore } from '@/lib/progress/store';
import { StatsTab } from './stats-tab';
import { useHydrated } from './bits';

/**
 * The lobby Stats screen: what the player's own duels add up to. A single
 * screen with no sub-tabs — the progression framing (levels, missions,
 * achievements, rank ladders) is not represented here.
 */
export function StatsPanel({ className = '' }: { className?: string }) {
  const mounted = useHydrated();
  const userId = useProgressStore((s) => s.userId);

  if (!mounted || !userId) {
    return (
      <div className={`bg-[var(--term-surface)]/70 backdrop-blur-md border border-[var(--term-border)] rounded-xl p-5 space-y-3 animate-pulse ${className}`}>
        <div className="h-5 w-40 rounded bg-[var(--term-raised)]" />
        <div className="h-40 rounded bg-[var(--term-raised)]" />
      </div>
    );
  }

  return (
    <div className={`bg-[var(--term-surface)]/70 backdrop-blur-md border border-[var(--term-border)] rounded-xl overflow-hidden animate-in fade-in duration-200 ${className}`}>
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-[var(--term-border)] bg-[var(--term-panel-deep)]/70 px-4 py-3">
        <BarChart3 size={14} className="text-[var(--term-accent)] shrink-0" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono">
          Stats
        </h3>
      </div>

      {/* No height cap: the panel grows with the stats and the page scrolls,
          so there is never a scrollbar inside the card. */}
      <div className="p-4 md:p-5">
        <StatsTab />
      </div>

      <div className="px-4 py-2 border-t border-[var(--term-border)] flex items-center justify-between text-[9px] font-mono text-[var(--term-dim)]">
        <span className="flex items-center gap-1">
          <Info size={9} /> Stats only count duels the server has settled.
        </span>
        <span>Server-verified settlement</span>
      </div>
    </div>
  );
}
