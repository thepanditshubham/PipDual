'use client';

/**
 * lobby-rail.tsx
 * The lobby's left rail, laid out the way a social profile rail reads: a
 * name-and-headline identity card (no cover, no avatar), the career snapshot
 * under it, a one-line one hairline list of every screen the rail can open.
 *
 * Pure presentation — the lobby owns the state. Every figure is passed in from
 * the same store read the ticket uses, so the rail can never quote a win rate
 * the rest of the page disagrees with.
 */
import Link from 'next/link';
import {
  Settings, Mail, HelpCircle, ChevronRight, Pencil, History,
} from 'lucide-react';
import { ACHIEVEMENTS } from '@/lib/progress/config';
import { sound } from '@/components/terminal/sound';
import type { UserProfile } from '@/lib/auth/types';

/** Every screen the lobby's center column can show. */
export type LobbyTab = 'ticket' | 'stats' | 'settings' | 'mail' | 'support';

export interface LobbyLeftRailProps {
  user: UserProfile | null;
  rating: number;
  tier: { label: string; color: string };
  winRate: number;
  played: number;
  wins: number;
  /** The active title, if the player has pinned one. */
  title: string;
  /** Pinned achievement ids, shown as small badges under the headline. */
  pinned: string[];
  unreadMail: number;
  activeTab: LobbyTab;
  onNavigate: (tab: LobbyTab) => void;
}

export function LobbyLeftRail({
  user,
  rating,
  tier,
  winRate,
  played,
  wins,
  title,
  pinned,
  unreadMail,
  activeTab,
  onNavigate,
}: LobbyLeftRailProps) {
  const open = (tab: LobbyTab) => {
    sound.playClick();
    onNavigate(tab);
  };

  const navRows: { id: LobbyTab; label: string; Icon: typeof Settings; badge?: number; hint?: string }[] = [
    { id: 'settings', label: 'Settings', Icon: Settings },
    { id: 'mail', label: 'Mail', Icon: Mail, badge: unreadMail },
    { id: 'support', label: 'How to play', Icon: HelpCircle },
  ];

  return (
    // Between md and lg the rail has no sidebar to live in, so its cards pair
    // up two-across instead of stretching the full width of the page.
    <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:block lg:space-y-3">
      {/* ── Identity ───────────────────────────────────────────────────────
          Name and headline only — no cover and no profile picture — then the
          dashed action row that a social profile puts under the headline. */}
      <div className="overflow-hidden rounded-lg border border-[var(--term-border)] bg-[var(--term-panel)]/90 backdrop-blur-md">
        <div className="px-4 pb-3 pt-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-[15px] font-bold leading-tight text-[var(--term-strong)]">
              {user?.displayName || 'Trader'}
            </h3>
            <button
              onClick={() => open('settings')}
              title="Edit profile"
              aria-label="Edit profile"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--term-border-hi)] bg-[var(--term-raised)] text-[var(--term-label)] transition-colors hover:border-[var(--term-accent)]/50 hover:text-[var(--term-accent)] cursor-pointer"
            >
              <Pencil size={12} />
            </button>
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--term-label)]">
            {title ? `“${title}”` : `${winRate}% win rate`}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] font-mono">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: tier.color }}
              aria-hidden="true"
            />
            <span className="font-bold" style={{ color: tier.color }}>
              {tier.label}
            </span>
            <span className="text-[var(--term-dim)]">· {rating} ELO</span>
          </p>

          {pinned.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {pinned.map((id) => (
                <span
                  key={id}
                  className="rounded border border-[var(--term-accent)]/40 bg-[var(--term-accent)]/10 px-1.5 py-0.5 text-[9px] font-mono font-bold text-[var(--term-accent-text)]"
                >
                  {ACHIEVEMENTS.find((entry) => entry.id === id)?.name ?? id}
                </span>
              ))}
            </div>
          )}
        </div>

        <Link
          href="/history"
          className="flex w-full items-center gap-1.5 border-t border-dashed border-[var(--term-border-hi)] px-4 py-2 text-[11px] font-bold text-[var(--term-label)] transition-colors hover:bg-[var(--term-raised)]/50 hover:text-[var(--term-strong)]"
        >
          <History size={11} />
          Match history
        </Link>
      </div>

      {/* ── Career snapshot ────────────────────────────────────────────────
          Three hairline rows, the way a profile-analytics card counts things,
          and one link into the full stats screen. */}
      <div className="overflow-hidden rounded-lg border border-[var(--term-border)] bg-[var(--term-panel)]/90 backdrop-blur-md">
        <div className="flex items-center px-4 py-2.5">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--term-soft)]">
            Career
          </span>
        </div>
        <div className="divide-y divide-[var(--term-border)] border-t border-[var(--term-border)]">
          {[
            { label: 'Duels played', value: played.toLocaleString() },
            { label: 'Duels won', value: wins.toLocaleString() },
            { label: 'Win rate', value: `${winRate}%` },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between px-4 py-2">
              <span className="text-[11px] text-[var(--term-label)]">{row.label}</span>
              <span className="text-[11px] font-mono font-bold text-[var(--term-strong)]">
                {row.value}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={() => open('stats')}
          className="w-full border-t border-[var(--term-border)] px-4 py-2 text-left text-[11px] font-bold text-[var(--term-accent-text)] hover:underline cursor-pointer"
        >
          View all stats ›
        </button>
      </div>

      {/* ── Rail nav ───────────────────────────────────────────────────────
          One card, one hairline per row — the same shape the reference rail
          gives its saved-items list. */}
      <div className="overflow-hidden rounded-lg border border-[var(--term-border)] bg-[var(--term-panel)]/90 backdrop-blur-md">
        {navRows.map(({ id, label, Icon, badge, hint }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => open(id)}
              title={hint}
              aria-current={active ? 'page' : undefined}
              className={`flex w-full items-center gap-2.5 border-b border-[var(--term-border)] px-4 py-2.5 text-left transition-colors cursor-pointer last:border-b-0 ${
                active
                  ? 'bg-[var(--term-raised)]/60 text-[var(--term-strong)]'
                  : 'text-[var(--term-text)] hover:bg-[var(--term-raised)]/50'
              }`}
            >
              <Icon
                size={15}
                className={active ? 'text-[var(--term-accent)]' : 'text-[var(--term-muted)]'}
              />
              <span className="flex-1 text-[12px] font-semibold">{label}</span>
              {badge ? (
                <span className="rounded-full bg-[var(--term-primary)] px-1.5 py-0.5 text-[10px] font-mono font-bold leading-none text-[var(--term-canvas)]">
                  {badge}
                </span>
              ) : null}
              <ChevronRight
                size={13}
                className={active ? 'text-[var(--term-accent)]' : 'text-[var(--term-dim)]'}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
