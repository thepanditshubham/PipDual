'use client';

/**
 * wallet-bits.tsx
 * Shared pieces of the wallet panel: the copyable address row, the status
 * pills for both money directions, and the shortener used on hashes and
 * addresses alike. Kept separate because a payout and a deposit have to read
 * the same way — an amber "pending" must mean waiting in both tabs.
 */
import { useState } from 'react';
import { CheckCircle2, Copy } from 'lucide-react';
import { sound } from '@/components/terminal/sound';
import type { DepositStatus, WithdrawalStatus } from '@/lib/economy/types';

/** Middle-out truncation: the ends are what a human compares by eye. */
export function shortId(value: string, head = 10, tail = 6): string {
  return value.length > head + tail + 3
    ? `${value.slice(0, head)}…${value.slice(-tail)}`
    : value;
}

export function AddressField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      sound.playClick();
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the text is on screen to select manually */
    }
  };

  return (
    <div className="flex items-start justify-between gap-2 p-2 rounded bg-[var(--term-bg)] border border-[var(--term-border)]">
      <div className="min-w-0">
        <span className="block text-[9px] uppercase tracking-wider text-[var(--term-dim)]">{label}</span>
        <span className="block text-[11px] font-mono text-[var(--term-strong)] break-all leading-snug">
          {value}
        </span>
      </div>
      <button
        type="button"
        onClick={copy}
        title={`Copy ${label.toLowerCase()}`}
        className="shrink-0 h-6 w-6 rounded border border-[var(--term-border)] bg-[var(--term-raised)] text-[var(--term-muted)] hover:text-[var(--term-primary)] transition-colors cursor-pointer flex items-center justify-center"
      >
        {copied ? <CheckCircle2 size={11} className="text-[var(--term-buy)]" /> : <Copy size={11} />}
      </button>
    </div>
  );
}

const AMBER = 'border-[var(--term-amber)]/40 text-[var(--term-amber)] bg-[var(--term-amber)]/10';
const GREEN = 'border-[var(--term-buy)]/40 text-[var(--term-buy)] bg-[var(--term-buy)]/10';
const RED = 'border-[var(--term-sell)]/40 text-[var(--term-sell)] bg-[var(--term-sell)]/10';

export const DEPOSIT_STATUS_STYLE: Record<DepositStatus, string> = {
  pending: AMBER,
  paid: GREEN,
  rejected: RED,
};

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  pending: 'Pending review',
  paid: 'Credited',
  rejected: 'Rejected',
};

export const WITHDRAWAL_STATUS_STYLE: Record<WithdrawalStatus, string> = {
  pending: AMBER,
  paid: GREEN,
  rejected: RED,
};

export const WITHDRAWAL_STATUS_LABEL: Record<WithdrawalStatus, string> = {
  pending: 'Pending payout',
  paid: 'Sent',
  rejected: 'Refunded',
};

export function StatusPill({
  status,
  map,
}: {
  status: DepositStatus | WithdrawalStatus;
  map: 'deposit' | 'withdraw';
}) {
  const style = map === 'deposit' ? DEPOSIT_STATUS_STYLE : WITHDRAWAL_STATUS_STYLE;
  const label = map === 'deposit' ? DEPOSIT_STATUS_LABEL : WITHDRAWAL_STATUS_LABEL;
  return (
    <span
      className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide shrink-0 ${style[status]}`}
    >
      {label[status]}
    </span>
  );
}

export function HistoryRow({
  primary,
  secondary,
  status,
  map,
  children,
}: {
  primary: string;
  secondary: string;
  status: DepositStatus | WithdrawalStatus;
  map: 'deposit' | 'withdraw';
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded bg-[var(--term-bg)] border border-[var(--term-border)]">
      <div className="min-w-0">
        <span className="block text-[11px] font-mono font-bold text-[var(--term-strong)]">{primary}</span>
        <span className="block text-[10px] font-mono text-[var(--term-dim)] truncate">{secondary}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {children}
        <StatusPill status={status} map={map} />
      </div>
    </div>
  );
}

/** Section label used above every step in both forms. */
export function StepLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--term-muted)]">
      {children}
    </span>
  );
}
