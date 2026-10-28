'use client';

import { Award, CalendarClock, Crown, Sparkles, Target, X } from 'lucide-react';
import { useProgressStore } from '@/lib/progress/store';
import type { CelebrationKind } from '@/lib/progress/types';
import { useHydrated } from './bits';

const LOOK: Record<CelebrationKind, { color: string; icon: typeof Crown }> = {
  level: { color: '#2962ff', icon: Sparkles },
  rank: { color: '#f59e0b', icon: Crown },
  achievement: { color: '#a855f7', icon: Award },
  mission: { color: '#089981', icon: Target },
  season: { color: '#38bdf8', icon: CalendarClock },
};

/**
 * Celebration queue (spec §10): level-ups, promotions, achievements, mission
 * completions and season rollovers surface one card at a time.
 */
export function ProgressCelebrations() {
  const celebrations = useProgressStore((s) => s.celebrations);
  const dismissCelebration = useProgressStore((s) => s.dismissCelebration);
  const mounted = useHydrated();

  if (!mounted || celebrations.length === 0) return null;

  const current = celebrations[0];
  const look = LOOK[current.kind] ?? LOOK.level;
  const Icon = look.icon;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="relative w-full max-w-sm rounded-xl border overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        style={{ borderColor: `color-mix(in srgb, ${look.color} 40%, transparent)`, background: 'linear-gradient(160deg, var(--term-raised), var(--term-panel-deep) 70%)' }}
        role="dialog"
        aria-modal="true"
        aria-label={current.title}
      >
        <div className="p-5 text-center space-y-3">
          <button
            type="button"
            onClick={() => dismissCelebration(current.id)}
            className="absolute top-3 right-3 w-7 h-7 rounded bg-[var(--term-raised)] border border-[var(--term-border-hi)] text-[var(--term-muted)] hover:text-[var(--term-strong)] flex items-center justify-center cursor-pointer"
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>

          <div
            className="w-14 h-14 mx-auto rounded-xl flex items-center justify-center border"
            style={{ background: `${look.color}18`, borderColor: `${look.color}66`, color: look.color }}
          >
            <Icon size={26} />
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em]" style={{ color: look.color }}>
              {current.kind === 'level' ? 'Level up' : current.kind === 'rank' ? 'Rank update' : current.kind}
            </p>
            <h3 className="text-xl font-black text-[var(--term-strong)]">{current.title}</h3>
            <p className="text-xs font-mono text-[var(--term-label)]">{current.subtitle}</p>
          </div>

          {current.details.length > 0 && (
            <div className="text-left rounded-lg bg-[var(--term-bg)] border border-[var(--term-border)] p-3 space-y-1">
              {current.details.slice(0, 5).map((detail) => (
                <p key={detail} className="text-[11px] text-[var(--term-text)] flex items-start gap-1.5">
                  <span style={{ color: look.color }}>▸</span>
                  <span className="min-w-0">{detail}</span>
                </p>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => dismissCelebration(current.id)}
            className="w-full h-9 rounded text-xs font-bold text-black cursor-pointer transition-opacity hover:opacity-90"
            style={{ background: look.color }}
          >
            Continue
          </button>

          {celebrations.length > 1 && (
            <p className="text-[10px] font-mono text-[var(--term-muted)]">1 of {celebrations.length} waiting</p>
          )}
        </div>
      </div>
    </div>
  );
}
