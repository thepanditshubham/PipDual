'use client';

/**
 * /admin/players/[id]
 * One account, everything an admin needs to decide something: the wallet and
 * its last few ledger rows, the duels it played, the money it queued, and the
 * buttons that adjust coins or lock the account. Both writes go through
 * Postgres functions, so this page can ask but never set a balance itself.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowLeftRight,
  BookOpen,
  Coins,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Swords,
  Users,
  UserX,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import {
  adjustCoins,
  fetchLedger,
  fetchPlayer,
  fetchPlayerDuels,
  fetchPlayerMoney,
  setPlayerStatus,
} from '@/lib/supabase/admin';
import type { AdminPlayer, LedgerEntry, PlayerDuel, PlayerStatus } from '@/lib/admin/types';
import type { CryptoDeposit, WithdrawRequest } from '@/lib/economy/types';
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

const STATUS_TONE: Record<PlayerStatus, PillTone> = {
  active: 'ok',
  suspended: 'pending',
  banned: 'bad',
};

const STATUS_LABEL: Record<PlayerStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  banned: 'Banned',
};

const KIND_LABEL: Record<LedgerEntry['kind'], string> = {
  deposit: 'Deposit',
  payout: 'Payout',
  payout_refund: 'Refund',
  adjustment: 'Adjustment',
};

const OUTCOME_TONE: Record<PlayerDuel['outcome'], PillTone> = {
  win: 'ok',
  loss: 'bad',
  draw: 'neutral',
  open: 'accent',
};

const DEPOSIT_TONE: Record<CryptoDeposit['status'], PillTone> = {
  pending: 'pending',
  paid: 'ok',
  rejected: 'bad',
};

const DEPOSIT_LABEL: Record<CryptoDeposit['status'], string> = {
  pending: 'Pending',
  paid: 'Credited',
  rejected: 'Rejected',
};

const WITHDRAW_TONE: Record<WithdrawRequest['status'], PillTone> = {
  pending: 'pending',
  paid: 'ok',
  rejected: 'bad',
};

const WITHDRAW_LABEL: Record<WithdrawRequest['status'], string> = {
  pending: 'Awaiting payout',
  paid: 'Sent',
  rejected: 'Refunded',
};

export default function AdminPlayerPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const params = useParams();
  const rawId = params?.id;
  const playerId = Array.isArray(rawId) ? rawId[0] : rawId ?? '';

  const [player, setPlayer] = useState<AdminPlayer | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [duels, setDuels] = useState<PlayerDuel[]>([]);
  const [money, setMoney] = useState<{ deposits: CryptoDeposit[]; withdrawals: WithdrawRequest[] }>({
    deposits: [],
    withdrawals: [],
  });
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [adjustBusy, setAdjustBusy] = useState(false);

  const [statusPrompt, setStatusPrompt] = useState<PlayerStatus | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);

  const load = useCallback(async () => {
    if (!playerId) return;

    const [nextPlayer, nextLedger, nextDuels, nextMoney] = await Promise.all([
      fetchPlayer(playerId),
      fetchLedger({ playerId, limit: 12 }),
      fetchPlayerDuels(playerId, 8),
      fetchPlayerMoney(playerId),
    ]);

    if (!nextPlayer) {
      setMissing(true);
      setPlayer(null);
      return;
    }

    setMissing(false);
    setPlayer(nextPlayer);
    setLedger(nextLedger ?? []);
    setDuels(nextDuels ?? []);
    setMoney(nextMoney ?? { deposits: [], withdrawals: [] });
  }, [playerId]);

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

  const coins = Math.trunc(Number(amount));
  const amountValid = Number.isFinite(coins) && coins !== 0;
  const reasonValid = reason.trim().length >= 3;

  const isSelf = player?.id === user?.id;

  const submitAdjust = async () => {
    if (!player || !amountValid || !reasonValid) return;
    setAdjustBusy(true);
    const result = await adjustCoins(player.id, coins, reason);
    setAdjustBusy(false);

    if (!result.ok) {
      setMessage({ ok: false, text: result.error ?? 'The adjustment failed.' });
      return;
    }

    setMessage({
      ok: true,
      text: `${coins > 0 ? 'Credited' : 'Debited'} ${Math.abs(coins).toLocaleString()} coins — new balance ${(result.value ?? 0).toLocaleString()}.`,
    });
    setAmount('');
    setReason('');
    await load();
  };

  const submitStatus = async () => {
    if (!player || !statusPrompt) return;
    setStatusBusy(true);
    const result = await setPlayerStatus(player.id, statusPrompt, statusNote);
    setStatusBusy(false);

    if (!result.ok) {
      setMessage({ ok: false, text: result.error ?? 'The status change failed.' });
      return;
    }

    setMessage({
      ok: true,
      text:
        statusPrompt === 'active'
          ? `${player.username} can play again.`
          : `${player.username} is now ${STATUS_LABEL[statusPrompt].toLowerCase()}.`,
    });
    setStatusPrompt(null);
    setStatusNote('');
    await load();
  };

  const depositsTotal = useMemo(
    () =>
      money.deposits
        .filter((entry) => entry.status === 'paid')
        .reduce((total, entry) => total + (entry.coins ?? 0), 0),
    [money.deposits],
  );

  if (!user) {
    return <Gate title="Sign in required" body="A player profile is only visible to an admin." />;
  }

  if (!isAdmin) {
    return (
      <Gate
        title="Admin access only"
        body={`Signed in as ${user.username}, which is not an admin account.`}
      />
    );
  }

  if (missing) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/players"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--purple)] hover:underline"
        >
          <ArrowLeft size={12} /> Directory
        </Link>
        <div className="card p-6 text-sm text-[var(--text-secondary)]">
          That player could not be read. The id may be wrong, or{' '}
          <code className="text-[var(--purple-light)]">profiles</code> is unreachable — check the
          Supabase keys and re-run <code className="text-[var(--purple-light)]">supabase/setup.sql</code>.
        </div>
      </div>
    );
  }

  if (!player) {
    return <div className="card p-6 text-sm text-[var(--text-secondary)]">Loading player…</div>;
  }

  return (
    <div className="space-y-4 animate-slide-up">
      <PageHead
        eyebrow={
          <Link
            href="/admin/players"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--text)]"
          >
            <ArrowLeft size={12} /> Directory
          </Link>
        }
        title={player.username}
        body={`${shorten(player.id, 12, 8)} · joined ${when(player.createdAt)}`}
        actions={
          <>
            <button
              onClick={() => void reload()}
              disabled={loading}
              className="flex items-center gap-2 border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs font-bold text-[var(--text)] transition-colors hover:border-[var(--purple)] disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Reload
            </button>
            {player.status !== 'suspended' && (
              <button
                onClick={() => setStatusPrompt('suspended')}
                disabled={isSelf}
                title={isSelf ? 'You cannot change your own account status' : undefined}
                className="flex items-center gap-1.5 border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-bold text-[var(--text)] transition-colors hover:border-[var(--amber,#f59e0b)] disabled:opacity-40 cursor-pointer"
              >
                <UserX size={13} /> Suspend
              </button>
            )}
            {player.status !== 'banned' && (
              <button
                onClick={() => setStatusPrompt('banned')}
                disabled={isSelf}
                title={isSelf ? 'You cannot change your own account status' : undefined}
                className="flex items-center gap-1.5 border border-[var(--down)]/40 bg-[var(--down)]/5 px-3 py-2 text-xs font-bold text-[var(--down)] transition-colors hover:bg-[var(--down)]/10 disabled:opacity-40 cursor-pointer"
              >
                <ShieldAlert size={13} /> Ban
              </button>
            )}
            {player.status !== 'active' && (
              <button
                onClick={() => setStatusPrompt('active')}
                disabled={isSelf}
                className="flex items-center gap-1.5 border border-[var(--up)]/40 bg-[var(--up)]/10 px-3 py-2 text-xs font-bold text-[var(--up)] transition-colors hover:bg-[var(--up)]/20 disabled:opacity-40 cursor-pointer"
              >
                <Sparkles size={13} /> Unban
              </button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={STATUS_TONE[player.status]}>{STATUS_LABEL[player.status]}</Pill>
        {player.role === 'admin' && <Pill tone="accent">Administrator</Pill>}
        {player.statusNote && (
          <span className="text-[11px] text-[var(--text-secondary)]">
            Note: {player.statusNote}
            {player.statusChangedAt ? ` · ${when(player.statusChangedAt)}` : ''}
          </span>
        )}
      </div>

      {message && <Notice ok={message.ok} text={message.text} />}

      {statusPrompt && (
        <div className="card space-y-3 p-4">
          <h2 className="text-sm font-bold text-[var(--text)]">
            {statusPrompt === 'active'
              ? `Restore ${player.username}`
              : `${STATUS_LABEL[statusPrompt]} ${player.username}`}
          </h2>
          <p className="text-[11px] text-[var(--text-secondary)]">
            {statusPrompt === 'active'
              ? 'The account can play and withdraw again. The lock note is cleared.'
              : 'The lock is recorded on the profile and shown here. Nothing is deleted — coins, history and ledger rows stay where they are.'}
          </p>
          <input
            value={statusNote}
            onChange={(event) => setStatusNote(event.target.value)}
            placeholder={
              statusPrompt === 'active' ? 'optional note' : 'why the account is being locked'
            }
            className="h-9 w-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-xs text-[var(--text)] focus:border-[var(--purple)] focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => void submitStatus()}
              disabled={statusBusy}
              className={` px-4 py-2 text-xs font-bold text-white disabled:opacity-50 cursor-pointer ${
                statusPrompt === 'active' ? 'bg-[var(--up)]' : 'bg-[var(--down)]'
              }`}
            >
              {statusBusy ? 'Saving…' : `Confirm ${STATUS_LABEL[statusPrompt].toLowerCase()}`}
            </button>
            <button
              onClick={() => {
                setStatusPrompt(null);
                setStatusNote('');
              }}
              className=" border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <StatStrip>
        <Stat bare icon={<Coins size={13} />} label="Wallet" value={player.coins.toLocaleString()} />
        <Stat bare icon={<Swords size={13} />} label="Rating" value={String(player.rating)} />
        <Stat
          bare
          icon={<Users size={13} />}
          label="Deposits"
          value={`${money.deposits.length} · ${depositsTotal.toLocaleString()}C`}
        />
        <Stat bare icon={<BookOpen size={13} />} label="Payouts" value={String(money.withdrawals.length)} />
      </StatStrip>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Wallet + adjust + ledger tail */}
        <div className="card p-0 overflow-hidden">
          <div className="border-b border-[var(--border)] p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-[var(--text)]">
                <Coins size={14} className="text-[var(--purple)]" /> Balance
              </h2>
              <span className="font-mono text-lg font-extrabold text-[var(--text)]">
                {player.coins.toLocaleString()}
                <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">coins</span>
              </span>
            </div>

            <div className="mt-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
                <input
                  type="number"
                  step={1}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="+/− coins"
                  aria-label="Coins to adjust"
                  className="h-9 w-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 font-mono text-xs text-[var(--text)] focus:border-[var(--purple)] focus:outline-none"
                />
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="reason (required)"
                  aria-label="Reason for the adjustment"
                  className="h-9 w-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-xs text-[var(--text)] focus:border-[var(--purple)] focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void submitAdjust()}
                  disabled={!amountValid || !reasonValid || adjustBusy}
                  className="flex items-center gap-1.5 bg-[var(--purple)] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
                >
                  <ArrowLeftRight size={13} />
                  {adjustBusy ? 'Writing…' : 'Adjust coins'}
                </button>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {!amountValid || !reasonValid
                    ? 'Amount and reason, both required.'
                    : player.coins + coins < 0
                      ? 'That would take the wallet below zero.'
                      : `${coinsText(coins)} → ${(player.coins + coins).toLocaleString()}`}
                </span>
              </div>
            </div>
          </div>

          <div>
            <p className="border-b border-[var(--border)] bg-[var(--surface-muted)]/50 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Ledger tail
            </p>
            <table className="w-full text-left border-collapse text-xs">
              <tbody className="divide-y divide-[var(--border)]">
                {ledger.length === 0 && (
                  <tr>
                    <td className="p-4 text-center text-[var(--text-muted)]">
                      No coin movement on this account yet.
                    </td>
                  </tr>
                )}
                {ledger.map((row) => (
                  <tr key={row.id} className="h-12">
                    <td className="whitespace-nowrap p-3 text-[var(--text-muted)]">
                      {when(row.createdAt)}
                    </td>
                    <td className="p-3 text-[var(--text-secondary)]">{KIND_LABEL[row.kind]}</td>
                    <td
                      className={`p-3 text-right font-mono font-bold ${
                        row.coins >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]'
                      }`}
                    >
                      {coinsText(row.coins)}
                    </td>
                    <td className="p-3 text-right font-mono text-[10px] text-[var(--text-muted)]">
                      {row.balanceAfter === null ? '—' : row.balanceAfter.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-[var(--border)] px-4 py-2">
              <Link
                href="/admin/ledger"
                className="text-[11px] font-bold text-[var(--purple)] hover:underline"
              >
                Open the full ledger →
              </Link>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Duels */}
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-[var(--text)]">
                <Swords size={14} className="text-[var(--purple)]" /> Recent duels
              </h2>
              <Link
                href="/admin/reports"
                className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                Flags →
              </Link>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <tbody className="divide-y divide-[var(--border)]">
                {duels.length === 0 && (
                  <tr>
                    <td className="p-4 text-center text-[var(--text-muted)]">
                      No finished duel on this account.
                    </td>
                  </tr>
                )}
                {duels.map((duel) => (
                  <tr key={duel.id} className="h-12">
                    <td className="whitespace-nowrap p-3 text-[var(--text-muted)]">
                      {when(duel.createdAt)}
                    </td>
                    <td className="p-3">
                      <span className="block truncate font-semibold text-[var(--text)]">
                        {duel.opponentName}
                      </span>
                      <span className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                        {duel.mode}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-[var(--text-secondary)]">
                      {duel.score ?? '—'}–{duel.opponentScore ?? '—'}
                    </td>
                    <td className="p-3 text-right">
                      <Pill tone={OUTCOME_TONE[duel.outcome]}>{duel.outcome}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--text-muted)]">
              Integrity flags are written by the anti-cheat pass and reviewed in Match reports.
            </p>
          </div>

          {/* Money history */}
          <div className="card p-0 overflow-hidden">
            <div className="border-b border-[var(--border)] p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-[var(--text)]">
                <BookOpen size={14} className="text-[var(--purple)]" /> Money history
              </h2>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <tbody className="divide-y divide-[var(--border)]">
                  {money.deposits.length === 0 && money.withdrawals.length === 0 && (
                    <tr>
                      <td className="p-4 text-center text-[var(--text-muted)]">
                        No deposit or payout has been queued.
                      </td>
                    </tr>
                  )}

                  {money.deposits.map((entry) => (
                    <tr key={entry.id} className="h-12">
                      <td className="whitespace-nowrap p-3 text-[var(--text-muted)]">
                        {when(entry.createdAt)}
                      </td>
                      <td className="p-3 text-[var(--text-secondary)]">
                        Deposit · {entry.symbol}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-[var(--up)]">
                        {entry.coins === null ? '—' : coinsText(entry.coins)}
                      </td>
                      <td className="p-3 text-right">
                        <Pill tone={DEPOSIT_TONE[entry.status]}>{DEPOSIT_LABEL[entry.status]}</Pill>
                      </td>
                    </tr>
                  ))}

                  {money.withdrawals.map((entry) => (
                    <tr key={entry.id} className="h-12">
                      <td className="whitespace-nowrap p-3 text-[var(--text-muted)]">
                        {when(entry.createdAt)}
                      </td>
                      <td className="p-3 text-[var(--text-secondary)]">Payout · {entry.network}</td>
                      <td className="p-3 text-right font-mono font-bold text-[var(--down)]">
                        {coinsText(-entry.coins)}
                      </td>
                      <td className="p-3 text-right">
                        <Pill tone={WITHDRAW_TONE[entry.status]}>{WITHDRAW_LABEL[entry.status]}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
