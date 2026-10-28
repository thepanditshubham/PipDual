'use client';

/**
 * /admin/ledger
 * The wallet's own history: one row per coin movement, whatever moved it.
 * Deposits, payout escrows, refunds, affiliate rewards and manual adjustments
 * all land in the same table from inside the Postgres functions that touch a
 * balance, so this page cannot disagree with a player's wallet.
 *
 * A manual adjustment is the one write here. It opens a reason-first form and
 * calls admin_adjust_coins(), which refuses to overdraw and writes its own
 * ledger row — the console never updates a balance directly.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  Coins,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Wallet,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { adjustCoins, fetchLedger, fetchPlayers } from '@/lib/supabase/admin';
import { fetchPlayerNames } from '@/lib/supabase/wallet';
import { filterLedger, sumByDirection, textMatches, type LedgerFilter } from '@/lib/admin/rules';
import type { AdminPlayer, LedgerEntry, LedgerKind } from '@/lib/admin/types';
import {
  Gate,
  Notice,
  PageHead,
  Pill,
  Stat,
  StatStrip,
  coinsText,
  shorten,
  when,
  type PillTone,
} from '@/components/admin/admin-bits';

const KIND: Record<LedgerKind, { label: string; tone: PillTone }> = {
  deposit: { label: 'Deposit', tone: 'ok' },
  payout: { label: 'Payout', tone: 'accent' },
  payout_refund: { label: 'Refund', tone: 'pending' },
  adjustment: { label: 'Adjustment', tone: 'neutral' },
  referral: { label: 'IB transfer', tone: 'ok' },
};

const KIND_FILTERS: { id: LedgerFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'deposit', label: 'Deposits' },
  { id: 'payout', label: 'Payouts' },
  { id: 'payout_refund', label: 'Refunds' },
  { id: 'referral', label: 'IB transfers' },
  { id: 'adjustment', label: 'Adjustments' },
];

export default function AdminLedgerPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [kind, setKind] = useState<LedgerFilter>('all');
  const [player, setPlayer] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Manual adjustment form.
  const [adjusting, setAdjusting] = useState(false);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [playerQuery, setPlayerQuery] = useState('');
  const [target, setTarget] = useState<AdminPlayer | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const rows = await fetchLedger({ limit: 200 });
    if (rows === null) {
      setUnavailable(true);
      setEntries([]);
      return;
    }

    setUnavailable(false);
    setEntries(rows);
    setNames(await fetchPlayerNames([...new Set(rows.map((row) => row.playerId))]));
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    await load();
    setLoading(false);
  }, [load]);

  useEffect(() => {
    // Fetch-on-mount against Postgres; every state write lands after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const openAdjust = useCallback(async () => {
    setAdjusting(true);
    setMessage(null);
    if (players.length === 0) {
      setPlayers((await fetchPlayers(300)) ?? []);
    }
  }, [players.length]);

  const visible = useMemo(
    () =>
      filterLedger(entries, {
        kind,
        player: player.trim(),
        from,
        to,
        names,
      }),
    [entries, kind, player, from, to, names],
  );

  const totals = sumByDirection(visible);
  const narrowed = kind !== 'all' || Boolean(player.trim()) || Boolean(from) || Boolean(to);

  const clearFilters = () => {
    setKind('all');
    setPlayer('');
    setFrom('');
    setTo('');
  };

  const nameFor = (id: string) => names[id] ?? shorten(id, 8, 4);

  const candidates = useMemo(() => {
    if (!playerQuery.trim()) return players.slice(0, 6);
    return players
      .filter((entry) => textMatches(playerQuery, entry.username, entry.id, entry.displayName))
      .slice(0, 6);
  }, [players, playerQuery]);

  const coins = Math.trunc(Number(amount));
  const amountValid = Number.isFinite(coins) && coins !== 0;
  const reasonValid = reason.trim().length >= 3;

  const submitAdjust = async () => {
    if (!target || !amountValid || !reasonValid) return;
    setBusy(true);
    const result = await adjustCoins(target.id, coins, reason);
    setBusy(false);

    if (!result.ok) {
      setMessage({ ok: false, text: result.error ?? 'The adjustment failed.' });
      return;
    }

    setMessage({
      ok: true,
      text: `${coins > 0 ? 'Credited' : 'Debited'} ${Math.abs(coins).toLocaleString()} coins ${
        coins > 0 ? 'to' : 'from'
      } ${target.username} — new balance ${(result.value ?? 0).toLocaleString()}.`,
    });
    setTarget(null);
    setPlayerQuery('');
    setAmount('');
    setReason('');
    setAdjusting(false);
    await load();
  };

  if (!user) {
    return (
      <Gate
        title="Sign in required"
        body="The wallet ledger is only visible to a signed-in admin account."
      />
    );
  }

  if (!isAdmin) {
    return (
      <Gate
        title="Admin access only"
        body={`Signed in as ${user.username}, which is not an admin account. Set role = 'admin' on this profile's row in Supabase to read the ledger.`}
      />
    );
  }

  return (
    <div className="space-y-4 animate-slide-up">
      <PageHead
        eyebrow={
          <>
            <BookOpen size={12} className="text-[var(--purple)]" /> Money
          </>
        }
        title="Wallet"
        accent="ledger"
        body="Every coin the wallet moved, newest first. Rows are written by the same Postgres functions that move the balance, so a deposit, an escrow and a refund all land here without anyone retyping a number."
        actions={
          <>
            <button
              onClick={() => void reload()}
              disabled={loading}
              className="flex items-center gap-2 border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs font-bold text-[var(--text)] transition-colors hover:border-[var(--purple)] disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Reload
            </button>
            <button
              onClick={() => void openAdjust()}
              className="flex items-center gap-2 bg-[var(--purple)] px-3.5 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 cursor-pointer"
            >
              <ArrowLeftRight size={13} /> Adjust coins
            </button>
          </>
        }
      />

      <StatStrip cols={4}>
        <Stat bare icon={<Coins size={13} />} label="Credited in view" value={totals.credited.toLocaleString()} />
        <Stat bare icon={<ArrowLeftRight size={13} />} label="Debited in view" value={totals.debited.toLocaleString()} />
        <Stat
          bare
          icon={<Wallet size={13} />}
          label="Net movement"
          value={coinsText(totals.credited - totals.debited)}
        />
        <Stat bare icon={<BookOpen size={13} />} label="Rows in view" value={String(visible.length)} />
      </StatStrip>

      {unavailable && (
        <div className="card p-4 text-xs text-[var(--text-secondary)]">
          The ledger is unreadable right now — the{' '}
          <code className="text-[var(--purple-light)]">wallet_ledger</code> table is missing or the
          Supabase keys are unset. Re-run{' '}
          <code className="text-[var(--purple-light)]">supabase/setup.sql</code>, then reload.
        </div>
      )}

      {message && <Notice ok={message.ok} text={message.text} />}

      {adjusting && (
        <div className="card p-4 space-y-3 animate-slide-up">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[var(--text)]">Manual adjustment</h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                A support credit or a correction. A reason is required and the RPC refuses to push a
                wallet below zero.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAdjusting(false)}
              className=" border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              aria-label="Close adjustment form"
            >
              <X size={14} />
            </button>
          </div>

          {target ? (
            <div className="flex items-center gap-2 border border-[var(--border)] bg-[var(--surface-muted)] p-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--border)] bg-[var(--surface)] text-[11px] font-black uppercase text-[var(--text)]">
                {target.username.charAt(0)}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-xs font-bold text-[var(--text)]">
                  {target.username}
                </span>
                <span className="block font-mono text-[10px] text-[var(--text-muted)]">
                  {target.coins.toLocaleString()} coins · {shorten(target.id, 8, 4)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTarget(null)}
                className=" px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="relative block">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                />
                <input
                  value={playerQuery}
                  onChange={(event) => setPlayerQuery(event.target.value)}
                  placeholder="Find a player by username or id"
                  className="h-9 w-full border border-[var(--border)] bg-[var(--surface-muted)] pl-8 pr-3 text-xs text-[var(--text)] focus:border-[var(--purple)] focus:outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setTarget(entry)}
                    className=" border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[10px] font-bold text-[var(--text-secondary)] hover:border-[var(--purple)] hover:text-[var(--text)] cursor-pointer"
                  >
                    {entry.username}
                    <span className="ml-1 font-mono opacity-60">
                      {entry.coins.toLocaleString()}C
                    </span>
                  </button>
                ))}
                {candidates.length === 0 && (
                  <span className="text-[11px] text-[var(--text-muted)]">No player matches that.</span>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Coins (+/−)
              </label>
              <input
                type="number"
                step={1}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="e.g. 500 or -250"
                className="h-9 w-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 font-mono text-xs text-[var(--text)] focus:border-[var(--purple)] focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Reason (required)
              </label>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. deposit paid on the wrong account"
                className="h-9 w-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-xs text-[var(--text)] focus:border-[var(--purple)] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void submitAdjust()}
              disabled={!target || !amountValid || !reasonValid || busy}
              className=" bg-[var(--purple)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Writing…' : 'Post adjustment'}
            </button>
            <span className="text-[10px] text-[var(--text-muted)]">
              {amountValid
                ? `${coinsText(coins)} coins · ${reasonValid ? 'reason ok' : 'add a reason'}`
                : 'Enter a non-zero amount.'}
            </span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] p-2">
          {KIND_FILTERS.map((item) => (
            <button
              key={item.id}
              onClick={() => setKind(item.id)}
              className={` px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                kind === item.id
                  ? 'bg-[var(--purple)] text-white'
                  : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text)]'
              }`}
            >
              {item.label}
              <span className="ml-1 opacity-70">
                {item.id === 'all'
                  ? entries.length
                  : entries.filter((row) => row.kind === item.id).length}
              </span>
            </button>
          ))}

          <label className="relative ms-auto min-w-[150px] flex-1 sm:max-w-[240px]">
            <Search
              size={12}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              value={player}
              onChange={(event) => setPlayer(event.target.value)}
              placeholder="Player or reason"
              aria-label="Filter the ledger by player"
              className="h-7 w-full border border-[var(--border)] bg-[var(--surface-muted)] pl-6 pr-2 text-[11px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--purple)] focus:outline-none"
            />
          </label>

          <div className="flex items-center gap-1">
            <SlidersHorizontal size={11} className="text-[var(--text-muted)]" />
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

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] uppercase text-[var(--text-muted)] font-semibold tracking-wider">
                <th className="p-3">When</th>
                <th className="p-3">Player</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right">Coins</th>
                <th className="p-3 text-right">Balance after</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[var(--text-muted)]">
                    {loading
                      ? 'Loading the ledger…'
                      : narrowed
                        ? 'No ledger row matches those filters.'
                        : 'No coin has moved yet.'}
                  </td>
                </tr>
              )}

              {visible.map((row) => (
                <tr key={row.id} className="h-12 hover:bg-[var(--surface-muted)] transition-colors">
                  <td className="whitespace-nowrap p-3 text-[var(--text-muted)]">
                    {when(row.createdAt)}
                  </td>
                  <td className="p-3">
                    <span className="block truncate font-semibold text-[var(--text)]">
                      {nameFor(row.playerId)}
                    </span>
                    <span className="block font-mono text-[10px] text-[var(--text-muted)]">
                      {shorten(row.playerId, 8, 4)}
                    </span>
                  </td>
                  <td className="p-3">
                    <Pill tone={KIND[row.kind].tone}>{KIND[row.kind].label}</Pill>
                  </td>
                  <td
                    className={`p-3 text-right font-mono font-bold ${
                      row.coins >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]'
                    }`}
                  >
                    {coinsText(row.coins)}
                  </td>
                  <td className="p-3 text-right font-mono text-[var(--text-secondary)]">
                    {row.balanceAfter === null ? '—' : row.balanceAfter.toLocaleString()}
                  </td>
                  <td className="max-w-[260px] p-3">
                    <span className="line-clamp-2 text-[var(--text-secondary)]">
                      {row.reason ?? '—'}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-[10px] text-[var(--text-muted)]">
                    {row.refId ? (
                      <span title={row.refId}>
                        {row.refType ?? 'ref'} · {shorten(row.refId, 10, 4)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-[var(--text-muted)]">
        Showing the last 200 movements. Live duel stakes settle through the play client, so only
        deposits, payouts, refunds and manual adjustments are ledgered here.
      </p>
    </div>
  );
}
