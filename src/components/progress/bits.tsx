'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

const noopSubscribe = () => () => {};

/**
 * True once the client has hydrated. The progress store rehydrates from
 * localStorage, so anything reading it must wait for the client render or the
 * server markup and the first client render disagree.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** A 1s clock for reset countdowns; keeps the progress tabs self-updating. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function ProgressBar({
  percent,
  color = 'var(--term-accent)',
  height = 6,
  track = 'var(--term-raised)',
}: {
  percent: number;
  color?: string;
  height?: number;
  track?: string;
}) {
  const value = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, background: track }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${value}%`, background: color }}
      />
    </div>
  );
}

export function Chip({
  children,
  color = 'var(--term-label)',
  dim = false,
}: {
  children: ReactNode;
  color?: string;
  dim?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wide border"
      style={{
        color: dim ? 'var(--term-soft)' : color,
        borderColor: dim ? 'var(--term-border)' : `color-mix(in srgb, ${color} 27%, transparent)`,
        background: dim ? 'var(--term-bg)' : `color-mix(in srgb, ${color} 8%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  accent = 'var(--term-text)',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="p-2.5 rounded bg-[var(--term-bg)]/80 border border-[var(--term-border)] min-w-0">
      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--term-soft)] truncate">{label}</p>
      <p className="text-sm font-bold font-mono tabular-nums truncate mt-0.5" style={{ color: accent }}>
        {value}
      </p>
      {hint && <p className="text-[10px] text-[var(--term-muted)] truncate mt-0.5">{hint}</p>}
    </div>
  );
}

export function SectionTitle({
  icon,
  children,
  right,
}: {
  icon?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono truncate">
          {children}
        </h4>
      </div>
      {right}
    </div>
  );
}

export function ProgressEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="py-8 text-center text-xs font-mono text-[var(--term-muted)] border border-dashed border-[var(--term-border)] rounded-lg">
      {children}
    </div>
  );
}

export function CoinIcon() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/coin.png" alt="Coin" className="w-3.5 h-3.5 object-contain" />;
}

export function pct(value: number): string {
  return `${Math.round(value)}%`;
}
