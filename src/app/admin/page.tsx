'use client';

/**
 * /admin
 * Money console: a compact, Gmail-style list of everything that has moved
 * through the arena, with a reading pane for the selected event. The sidebar
 * owns navigation; this page owns the data.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Banknote,
  Coins,
  Inbox,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type {
  CryptoDeposit,
  DepositStatus,
  WithdrawRequest,
  WithdrawalStatus,
} from '@/lib/economy/types';
import { formatUsd } from '@/lib/economy/deposit';
import { inDateRange, textMatches } from '@/lib/admin/rules';
import { Stat, shorten, when } from '@/components/admin/admin-bits';
import { fetchDepositQueue, fetchPlayerNames, fetchWithdrawQueue } from '@/lib/supabase/wallet';

type MoneyStatus = DepositStatus | WithdrawalStatus;
type ActivityKind = 'deposit' | 'withdrawal';
type Filter = 'all' | 'pending' | 'deposit' | 'withdrawal';
type StatusFilter = 'all' | MoneyStatus;

interface ActivityRow {
  /** The deposit or payout row id, so a link can point at this exact entry. */
  id: string;
  key: string;
  kind: ActivityKind;
  playerId?: string;
  coins: number | null;
  usd: number | null;
  status: MoneyStatus;
  symbol: string;
  network: string;
  reference: string;
  referenceLabel: string;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

const PILL: Record<MoneyStatus, string> = {
  pending: 'bg-[var(--amber,#f59e0b)]/10 text-[var(--amber,#f59e0b)] border-[var(--amber,#f59e0b)]/30',
  paid: 'bg-[var(--up)]/10 text-[var(--up)] border-[var(--up)]/30',
  rejected: 'bg-[var(--down)]/10 text-[var(--down)] border-[var(--down)]/30',
};

const LABEL: Record<ActivityKind, Record<MoneyStatus, string>> = {
  deposit: { pending: 'Pending', paid: 'Credited', rejected: 'Rejected' },
  withdrawal: { pending: 'Awaiting payout', paid: 'Sent', rejected: 'Refunded' },
};

/** Single-line rows only have room for the short status. */
const SHORT: Record<MoneyStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  rejected: 'Rejected',
};

function shortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function AdminConsolePage() {
  const [deposits, setDeposits] = useState<CryptoDeposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawRequest[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [player, setPlayer] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    const [depositQueue, withdrawQueue] = await Promise.all([
      fetchDepositQueue(),
      fetchWithdrawQueue(),
    ]);

    if (depositQueue === null && withdrawQueue === null) {
      setUnavailable(true);
      setDeposits([]);
      setWithdrawals([]);
      return;
    }

    const nextDeposits = depositQueue ?? [];
    const nextWithdrawals = withdrawQueue ?? [];
    setUnavailable(false);
    setDeposits(nextDeposits);
    setWithdrawals(nextWithdrawals);

    const ids = [
      ...new Set(
        [...nextDeposits, ...nextWithdrawals]
          .map((entry) => entry.playerId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    setNames(await fetchPlayerNames(ids));
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    await load();
    setLoading(false);
  }, [load]);

  useEffect(() => {
    // Fetch-on-mount against Postgres; every state write lands after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const pendingDeposits = deposits.filter((entry) => entry.status === 'pending');
  const pendingWithdrawals = withdrawals.filter((entry) => entry.status === 'pending');
  const creditedCoins = deposits
    .filter((entry) => entry.status === 'paid')
    .reduce((total, entry) => total + (entry.coins ?? 0), 0);
  const paidOutCoins = withdrawals
    .filter((entry) => entry.status === 'paid')
    .reduce((total, entry) => total + entry.coins, 0);

  const activity: ActivityRow[] = [
    ...deposits.map((entry) => ({
      id: entry.id,
      key: `deposit:${entry.id}`,
      kind: 'deposit' as const,
      playerId: entry.playerId,
      coins: entry.coins,
      usd: entry.expectedUsd,
      status: entry.status,
      symbol: entry.symbol,
      network: entry.network,
      reference: entry.txid,
      referenceLabel: 'Transaction',
      note: entry.note,
      createdAt: entry.createdAt,
      reviewedAt: entry.reviewedAt,
    })),
    ...withdrawals.map((entry) => ({
      id: entry.id,
      key: `withdrawal:${entry.id}`,
      kind: 'withdrawal' as const,
      playerId: entry.playerId,
      coins: entry.coins,
      usd: entry.netUsd,
      status: entry.status,
      symbol: entry.symbol,
      network: entry.network,
      reference: entry.address,
      referenceLabel: 'Destination',
      note: entry.note,
      createdAt: entry.createdAt,
      reviewedAt: entry.reviewedAt,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const visible = activity.filter((row) => {
    if (filter === 'pending' && row.status !== 'pending') return false;
    if (filter !== 'all' && filter !== 'pending' && row.kind !== filter) return false;
    if (statusFilter !== 'all' && row.status !== statusFilter) return false;
    if (!inDateRange(row.createdAt, from, to)) return false;
    // The player box matches the resolved username or the raw id, so a
    // reviewer can paste either.
    return textMatches(player, names[row.playerId ?? ''], row.playerId);
  });

  const narrowed = Boolean(player.trim()) || statusFilter !== 'all' || Boolean(from) || Boolean(to);
  const clearFilters = () => {
    setPlayer('');
    setStatusFilter('all');
    setFrom('');
    setTo('');
  };

  const selected = visible.find((row) => row.key === selectedKey) ?? visible[0] ?? null;
  const selectedName = selected
    ? names[selected.playerId ?? ''] ?? shorten(selected.playerId ?? 'unknown', 10, 6)
    : '';

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: activity.length },
    {
      id: 'pending',
      label: 'Pending',
      count: activity.filter((row) => row.status === 'pending').length,
    },
    { id: 'deposit', label: 'Deposits', count: deposits.length },
    { id: 'withdrawal', label: 'Payouts', count: withdrawals.length },
  ];

  return (
    // xl: the feed is the height of the content column — rows sit at the top,
    // the rest of the column stays empty, and the frame still reaches the
    // bottom of the screen when there is nothing to review.
    <div className="flex min-h-0 flex-col gap-4 animate-slide-up xl:h-full">
      {/* Page head */}
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-[var(--text)] tracking-tight">
            Money <span className="gradient-text">Console</span>
          </h1>
          <p className="text-sm text-[var(--text-secondary)] truncate">
            Verify money in and sign off money out — approvals run inside Postgres.
          </p>
        </div>

        <button
          onClick={() => void reload()}
          disabled={loading}
          className="shrink-0 px-3.5 py-2 bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text)] text-xs font-bold hover:border-[var(--purple)] transition-colors disabled:opacity-60 cursor-pointer flex items-center gap-2"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Reload
        </button>
      </div>

      {/* Stats — one strip, separated by hairlines */}
      <div className="card p-0 shrink-0 grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border)]">
        <Stat
          bare
          icon={<ArrowDownToLine size={15} />}
          label="Deposits to review"
          value={String(pendingDeposits.length)}
        />
        <Stat
          bare
          icon={<ArrowUpFromLine size={15} />}
          label="Payouts to review"
          value={String(pendingWithdrawals.length)}
        />
        <Stat
          bare
          icon={<Coins size={15} />}
          label="Coins credited"
          value={creditedCoins.toLocaleString()}
        />
        <Stat
          bare
          icon={<Banknote size={15} />}
          label="Coins paid out"
          value={paidOutCoins.toLocaleString()}
        />
      </div>

      {unavailable && (
        <div className="card shrink-0 p-4 text-xs text-[var(--text-secondary)]">
          The money queues are unreadable right now — the{' '}
          <code className="text-[var(--purple-light)]">crypto_deposits</code> /{' '}
          <code className="text-[var(--purple-light)]">crypto_withdrawals</code> tables are missing or
          the Supabase keys are unset. Run{' '}
          <code className="text-[var(--purple-light)]">supabase/setup.sql</code>, then reload.
        </div>
      )}

      {/* Gmail-style list + reading pane */}
      <div className="card p-0 overflow-hidden xl:flex xl:min-h-[380px] xl:flex-1 xl:flex-col">
        <div className="grid xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(380px,440px)_1fr]">
          <div className="flex min-h-0 min-w-0 flex-col border-b border-[var(--border)] xl:border-b-0 xl:border-r">
            <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--border)] p-2">
              {filters.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFilter(item.id)}
                  className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors cursor-pointer ${
                    filter === item.id
                      ? 'bg-[var(--purple)] text-white'
                      : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                  }`}
                >
                  {item.label}
                  <span className="ml-1 opacity-70">{item.count}</span>
                </button>
              ))}
            </div>

            {/* Player · status · date range: the three cuts a reviewer asks for. */}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--border)] p-2">
              <span className="hidden items-center gap-1 pe-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] sm:inline-flex">
                <SlidersHorizontal size={11} /> Filter
              </span>

              <label className="relative min-w-[120px] flex-1">
                <Search
                  size={12}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                />
                <input
                  value={player}
                  onChange={(event) => setPlayer(event.target.value)}
                  placeholder="Player"
                  aria-label="Filter by player"
                  className="h-7 w-full border border-[var(--border)] bg-[var(--surface-muted)] pl-6 pr-2 text-[11px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--purple)] focus:outline-none"
                />
              </label>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                aria-label="Filter by status"
                className="h-7 border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 text-[11px] text-[var(--text)] cursor-pointer focus:border-[var(--purple)] focus:outline-none"
              >
                <option value="all">Any status</option>
                <option value="pending">Pending</option>
                <option value="paid">Settled</option>
                <option value="rejected">Rejected</option>
              </select>

              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  aria-label="From date"
                  className="h-7 w-[112px] border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 text-[11px] text-[var(--text)] focus:border-[var(--purple)] focus:outline-none"
                />
                <span className="text-[10px] text-[var(--text-muted)]">→</span>
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  aria-label="To date"
                  className="h-7 w-[112px] border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 text-[11px] text-[var(--text)] focus:border-[var(--purple)] focus:outline-none"
                />
              </div>

              {narrowed && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-7 items-center gap-1 border border-[var(--border)] px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer"
                >
                  <X size={11} /> Clear
                </button>
              )}
            </div>

            <div className="max-h-[560px] overflow-y-auto xl:max-h-none xl:min-h-0 xl:flex-1">
              {visible.length === 0 && (
                <div className="px-4 py-10 text-center text-xs text-[var(--text-muted)]">
                  {narrowed
                    ? 'No money activity matches those filters.'
                    : 'No money activity in this view.'}
                </div>
              )}

              {visible.map((row) => {
                const active = selected?.key === row.key;
                return (
                  <button
                    key={row.key}
                    onClick={() => setSelectedKey(row.key)}
                    className={`flex h-12 w-full items-center gap-2 border-b border-[var(--border)]/60 px-3 text-left transition-colors cursor-pointer ${
                      active ? 'bg-[var(--surface-muted)]' : 'hover:bg-[var(--surface-muted)]/60'
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center border ${
                        row.kind === 'deposit'
                          ? 'bg-[var(--up)]/10 text-[var(--up)] border-[var(--up)]/25'
                          : 'bg-[var(--purple)]/10 text-[var(--purple)] border-[var(--purple)]/25'
                      }`}
                    >
                      {row.kind === 'deposit' ? (
                        <ArrowDownToLine size={13} />
                      ) : (
                        <ArrowUpFromLine size={13} />
                      )}
                    </span>

                    <span className="w-[96px] shrink-0 truncate text-xs font-bold text-[var(--text)]">
                      {row.kind === 'deposit' ? 'Deposit' : 'Payout'} · {row.symbol}
                    </span>

                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">
                      {names[row.playerId ?? ''] ?? shorten(row.playerId ?? 'unknown', 8, 4)}
                    </span>

                    <span className="w-[60px] shrink-0 text-right font-mono text-[11px] text-[var(--text-muted)]">
                      {row.coins === null ? '—' : `${row.coins.toLocaleString()}C`}
                    </span>

                    <span
                      className={`shrink-0 border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${PILL[row.status]}`}
                    >
                      {SHORT[row.status]}
                    </span>

                    <span className="w-[40px] shrink-0 text-right text-[10px] text-[var(--text-muted)]">
                      {shortDate(row.createdAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col bg-[var(--surface-muted)]/25">
            {selected ? (
              <ActivityDetail row={selected} name={selectedName} />
            ) : (
              <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
                <Inbox size={24} className="text-[var(--text-muted)]" />
                <p className="text-sm font-bold text-[var(--text)]">Select a money event</p>
                <p className="max-w-sm text-xs text-[var(--text-secondary)]">
                  Deposits and payouts appear here the moment they are submitted or reviewed.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityDetail({ row, name }: { row: ActivityRow; name: string }) {
  // A deposit link carries the row so the queue opens on this exact request
  // instead of dropping the reviewer at the top of the list.
  const queue =
    row.kind === 'deposit'
      ? `/admin/deposits?focus=${encodeURIComponent(row.id)}`
      : '/admin/withdrawals';

  return (
    // One fitted panel: the body scrolls, the footer sits on the bottom edge.
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              {row.kind === 'deposit' ? 'Deposit desk' : 'Payout desk'}
            </span>
            <h2 className="mt-1 text-lg font-bold text-[var(--text)]">
              {row.kind === 'deposit' ? 'Deposit' : 'Payout'} · {row.symbol}
              <span className="font-normal text-[var(--text-muted)]"> / {row.network}</span>
            </h2>
          </div>
          <span
            className={`shrink-0 px-2.5 py-1 border text-[10px] font-bold uppercase tracking-wider ${PILL[row.status]}`}
          >
            {LABEL[row.kind][row.status]}
          </span>
        </div>

        <div className="flex items-center gap-2.5 border border-[var(--border)] bg-[var(--surface)] p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--surface-muted)] border border-[var(--border)] text-xs font-black uppercase text-[var(--text)]">
            {name.charAt(0)}
          </span>
          <div className="min-w-0">
            <span className="block text-sm font-bold text-[var(--text)] truncate">{name}</span>
            <span className="block font-mono text-[10px] text-[var(--text-muted)]">
              {shorten(row.playerId ?? '—', 10, 6)}
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)]">
          <Fact
            label="Coins"
            value={row.coins === null ? 'Awaiting review' : row.coins.toLocaleString()}
          />
          <Fact label="Value" value={row.usd === null ? '—' : formatUsd(row.usd)} />
          <Fact label="Submitted" value={when(row.createdAt)} />
          <Fact label="Reviewed" value={row.reviewedAt ? when(row.reviewedAt) : 'Not yet'} />
        </dl>

        <div className="border border-[var(--border)] bg-[var(--surface)] p-3">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            {row.referenceLabel}
          </span>
          <span className="mt-1 block break-all font-mono text-xs text-[var(--text)]">
            {row.reference}
          </span>
        </div>

        {row.note && (
          <div className="border border-[var(--border)] bg-[var(--surface)] p-3">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              {row.status === 'rejected' ? 'Reason' : 'Reference'}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-[var(--text-secondary)]">
              {row.note}
            </span>
          </div>
        )}
      </div>

      {/* mt-auto keeps the action on the bottom edge when the body is short. */}
      <div className="mt-auto border-t border-[var(--border)] px-5 py-3">
        <Link
          href={queue}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--purple)] hover:underline"
        >
          Open {row.kind === 'deposit' ? 'deposit review' : 'payout queue'} <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--surface)] px-3 py-2">
      <dt className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-xs font-semibold text-[var(--text)] truncate">
        {value}
      </dd>
    </div>
  );
}
