'use client';

import { useState, type ReactNode } from 'react';
import {
  Award, Crosshair, Crown, Flame, Shield, ShieldCheck, Swords,
  Target, TrendingUp,
} from 'lucide-react';
import { rankPosition } from '@/lib/progress/rank';
import type { BattleResult, PlayerAchievement, PlayerBattle } from '@/lib/profile/types';

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] ${className}`}>
      {children}
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            {eyebrow}
          </p>
        )}
        <h2 className="truncate text-sm font-bold text-[var(--text)]">{title}</h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center">
      {icon && (
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)]">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3>
      <p className="max-w-sm text-[11px] leading-relaxed text-[var(--text-secondary)]">{body}</p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function ProfileAvatar({
  src,
  name,
  className = 'h-20 w-20 text-xl',
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'PD';

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-hi)] bg-[linear-gradient(135deg,#3a3a58_0%,#4a3a2a_100%)] font-bold text-[var(--accent-hi)] ${className}`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  );
}

export function CoverImage({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <img
      src={src}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function OnlinePill({ online }: { online: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)]/85 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] backdrop-blur">
      <span
        className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-[var(--up)]' : 'bg-[var(--text-muted)]'}`}
      />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

export function VerifiedPill({ verified }: { verified: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
        verified
          ? 'border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent-hi)]'
          : 'border-[var(--border)] bg-[var(--surface)]/85 text-[var(--text-muted)]'
      }`}
    >
      <ShieldCheck size={10} />
      {verified ? 'Verified' : 'Unverified'}
    </span>
  );
}

export function ResultBadge({ result }: { result: BattleResult }) {
  const styles =
    result === 'win'
      ? 'border-[var(--up)]/35 bg-[var(--up)]/10 text-[var(--up)]'
      : result === 'loss'
        ? 'border-[var(--down)]/35 bg-[var(--down)]/10 text-[var(--down)]'
        : 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]';
  const label = result === 'win' ? 'Victory' : result === 'loss' ? 'Defeat' : 'Draw';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${styles}`}>
      {label}
    </span>
  );
}

export function ModeBadge({ mode }: { mode: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
      {mode === 'ranked' ? 'Ranked' : mode === 'friendly' ? 'Friendly' : mode === 'tournament' ? 'Tournament' : 'Practice'}
    </span>
  );
}

const RARITY = {
  bronze: { label: 'Bronze', color: '#d9a06f', bg: 'rgba(217,160,111,0.12)', border: 'rgba(217,160,111,0.35)' },
  silver: { label: 'Silver', color: '#b9c6da', bg: 'rgba(185,198,218,0.12)', border: 'rgba(185,198,218,0.35)' },
  gold: { label: 'Gold', color: 'var(--accent-hi)', bg: 'rgba(255,194,92,0.12)', border: 'rgba(255,194,92,0.38)' },
} as const;

export function RarityBadge({ rarity }: { rarity: PlayerAchievement['rarity'] }) {
  const style = RARITY[rarity];
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
      style={{ color: style.color, background: style.bg, borderColor: style.border }}
    >
      {style.label}
    </span>
  );
}

const ACHIEVEMENT_ICONS: Record<string, typeof Award> = {
  sniper: Crosshair,
  comeback_king: TrendingUp,
  no_revenge: ShieldCheck,
  sl_always: Shield,
  hot_streak: Flame,
  gold_master: Crown,
  perfect_pip: Target,
  nemesis: Swords,
};

export function AchievementIcon({ id, size = 17 }: { id: string; size?: number }) {
  const Icon = ACHIEVEMENT_ICONS[id] ?? Award;
  return <Icon size={size} />;
}

export function BattleMeta({ battle }: { battle: PlayerBattle }) {
  return (
    <span className="font-mono text-[10px] text-[var(--text-muted)]">
      {battle.instrument} · {formatDuration(battle.durationSeconds)}
    </span>
  );
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatRelative(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
}

export function formatPips(pips: number | null): string {
  if (pips === null || !Number.isFinite(Number(pips))) return '—';
  const value = Number(pips);
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)} pips`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US');
}

export function rankLabel(rp: number): string {
  return rankPosition(rp).tierLabel;
}
