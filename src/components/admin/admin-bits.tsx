'use client';

/**
 * admin-bits.tsx
 * The two money queues under /admin share a shell: a gate for anyone who is
 * not an admin, a stat strip, and the same way of rendering an id and a
 * timestamp so a reviewer's eye does not have to relearn the table.
 */
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

/** Middle-out truncation — the ends of a hash or address are what a human compares. */
export function shorten(value: string, head = 14, tail = 8): string {
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

export function when(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

export function Stat({
  icon,
  label,
  value,
  bare = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  /** Drop the card wrapper when the parent already draws the hairline grid. */
  bare?: boolean;
}) {
  return (
    <div className={`${bare ? '' : 'card'} flex items-center gap-3 px-4 py-3`}>
      <span className="h-9 w-9 bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center text-[var(--purple-light)] shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <span className="block text-xl leading-tight font-extrabold text-[var(--text)] font-mono truncate">
          {value}
        </span>
        <span className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold truncate">
          {label}
        </span>
      </div>
    </div>
  );
}

export function Gate({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-2xl mx-auto px-5 py-24 text-center space-y-4">
      <ShieldAlert className="mx-auto text-[var(--down)]" size={32} />
      <h1 className="text-3xl font-extrabold text-[var(--text)]">{title}</h1>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{body}</p>
      <Link href="/lobby" className="inline-block text-xs font-bold text-[var(--purple)] hover:underline">
        ← Back to the lobby
      </Link>
    </div>
  );
}

/** Tone of a status pill: waiting, settled, refused, or merely notable. */
export type PillTone = 'pending' | 'ok' | 'bad' | 'neutral' | 'accent';

const PILL_TONE: Record<PillTone, string> = {
  pending: 'border-[var(--amber,#f59e0b)]/30 bg-[var(--amber,#f59e0b)]/10 text-[var(--amber,#f59e0b)]',
  ok: 'border-[var(--up)]/30 bg-[var(--up)]/10 text-[var(--up)]',
  bad: 'border-[var(--down)]/30 bg-[var(--down)]/10 text-[var(--down)]',
  neutral: 'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]',
  accent: 'border-[var(--purple)]/30 bg-[var(--purple)]/10 text-[var(--purple)]',
};

/** The one status chip every admin table uses, so the eye learns it once. */
export function Pill({
  tone,
  children,
  title,
}: {
  tone: PillTone;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PILL_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Signed coins: a credit reads +1,200, a debit reads −500. */
export function coinsText(coins: number): string {
  const sign = coins < 0 ? '−' : '+';
  return `${sign}${Math.abs(coins).toLocaleString()}`;
}

/** A page title with an optional eyebrow and a right-hand actions slot. */
export function PageHead({
  eyebrow,
  title,
  accent,
  body,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  accent?: string;
  body?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
          {title} {accent && <span className="gradient-text">{accent}</span>}
        </h1>
        {body && (
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">{body}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** The result of the last action, good or bad. */
export function Notice({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div
      role="status"
      className={`card border p-3 text-xs font-medium ${
        ok ? 'border-[var(--up)]/30 text-[var(--up)]' : 'border-[var(--down)]/30 text-[var(--down)]'
      }`}
    >
      {text}
    </div>
  );
}

/** Hairline-split metric grid, the shape every admin strip uses. */
export function StatStrip({
  cols = 4,
  children,
}: {
  cols?: 3 | 4;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`card p-0 grid grid-cols-1 divide-y divide-[var(--border)] lg:divide-y-0 lg:divide-x ${
        cols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
      }`}
    >
      {children}
    </div>
  );
}
