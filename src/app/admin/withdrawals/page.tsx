'use client';

/**
 * /admin/withdrawals
 * The payout queue. A player's coins are already out of their wallet by the
 * time a row appears here — the request escrowed them — so this screen is not
 * about preventing a double spend. It is about the transfer the arena has to
 * make by hand: send the stablecoin on the stated chain, paste the payout
 * TxID, mark it paid. Refusing one instead returns the coins in the same
 * database call, which is why a rejection needs a reason and never a balance
 * edit.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Banknote,
  Check,
  Coins,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { explorerUrl, formatUsd } from '@/lib/economy/deposit';
import { WITHDRAW_FEE_USD } from '@/lib/economy/config';
import { DUAL_APPROVAL_COINS, addressHistory, needsDualApproval } from '@/lib/admin/rules';
import type { WithdrawRequest } from '@/lib/economy/types';
import {
  Gate,
  Notice,
  PageHead,
  Pill,
  Stat,
  StatStrip,
  shorten,
  when,
} from '@/components/admin/admin-bits';
import {
  approveWithdraw,
  fetchPlayerNames,
  fetchWithdrawQueue,
  rejectWithdraw,
} from '@/lib/supabase/wallet';

const STATUS_PILL: Record<WithdrawRequest['status'], string> = {
  pending: 'bg-[var(--amber,#f59e0b)]/10 text-[var(--amber,#f59e0b)] border-[var(--amber,#f59e0b)]/30',
  paid: 'bg-[var(--up)]/10 text-[var(--up)] border-[var(--up)]/30',
  rejected: 'bg-[var(--down)]/10 text-[var(--down)] border-[var(--down)]/30',
};

const STATUS_LABEL: Record<WithdrawRequest['status'], string> = {
  pending: 'Awaiting payout',
  paid: 'Sent',
  rejected: 'Refunded',
};

/**
 * Why a payout is refused, written for the player. The coins go back in the
 * same call, so the reason is the only thing they get to act on.
 */
const REFUSE_REASONS = [
  'The payout address is not a wallet you control',
  'That address cannot receive USDT on this network',
  'The request does not match the signed-in account',
  'The deposit history behind these coins is under review',
  'Suspected fraudulent payout request',
] as const;

export default function AdminWithdrawalsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [withdrawals, setWithdrawals] = useState<WithdrawRequest[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payRef, setPayRef] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    // Every state write sits behind the await, so the mount effect that calls
    // this does not cascade a render before the first read resolves.
    const queue = await fetchWithdrawQueue();
    if (queue === null) {
      setUnavailable(true);
      setWithdrawals([]);
      return;
    }

    setUnavailable(false);
    setWithdrawals(queue);
    // Names for both the players waiting on money and the admins who have
    // already put a first signature on a large payout.
    const ids = [
      ...new Set(
        [
          ...queue.map((entry) => entry.playerId),
          ...queue.map((entry) => entry.firstApprovedBy),
        ].filter((id): id is string => Boolean(id)),
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
    // Fetch-on-mount against Postgres is exactly the external-system sync the
    // rule allows; it cannot see that every state write lands after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const rows = useMemo(
    () => (showAll ? withdrawals : withdrawals.filter((entry) => entry.status === 'pending')),
    [withdrawals, showAll],
  );

  const pending = withdrawals.filter((entry) => entry.status === 'pending');
  const pendingCoins = pending.reduce((total, entry) => total + entry.coins, 0);
  const pendingNetUsd = pending.reduce((total, entry) => total + entry.netUsd, 0);

  const handleApprove = async (withdrawal: WithdrawRequest) => {
    setBusyId(withdrawal.id);
    setMessage(null);
    const result = await approveWithdraw(withdrawal.id, payRef);
    setBusyId(null);
    setPayingId(null);
    setPayRef('');

    if (!result.ok) {
      setMessage({ ok: false, text: result.error ?? 'Could not close the payout.' });
      await load();
      return;
    }

    if (result.state === 'awaiting_second') {
      setMessage({
        ok: true,
        text: `Your signature is on ${formatUsd(withdrawal.netUsd)} to ${
          names[withdrawal.playerId ?? ''] ?? withdrawal.playerId?.slice(0, 8) ?? 'player'
        }. A second admin has to confirm it before the row closes.`,
      });
    } else {
      setMessage({
        ok: true,
        text: `${formatUsd(withdrawal.netUsd)} marked paid to ${
          names[withdrawal.playerId ?? ''] ?? withdrawal.playerId?.slice(0, 8) ?? 'player'
        } — ${withdrawal.coins.toLocaleString()} coins leave the arena for good.`,
      });
    }
    await load();
  };

  const handleReject = async (withdrawal: WithdrawRequest) => {
    setBusyId(withdrawal.id);
    setMessage(null);
    const result = await rejectWithdraw(withdrawal.id, rejectNote);
    setBusyId(null);
    setRejectingId(null);
    setRejectNote('');

    if (!result.ok) {
      setMessage({ ok: false, text: result.error ?? 'Rejection failed.' });
      return;
    }
    setMessage({
      ok: true,
      text: `${result.coins.toLocaleString()} coins returned to ${
        names[withdrawal.playerId ?? ''] ?? withdrawal.playerId?.slice(0, 8) ?? 'player'
      }.`,
    });
    await load();
  };

  if (!user) {
    return (
      <Gate
        title="Sign in required"
        body="The payout queue is only visible to a signed-in admin account."
      />
    );
  }

  if (!isAdmin) {
    return (
      <Gate
        title="Admin access only"
        body={`Signed in as ${user.username}, which is not an admin account. Set role = 'admin' on this profile's row in Supabase to review payouts.`}
      />
    );
  }

  return (
    <div className="space-y-4 animate-slide-up">
      <PageHead
        eyebrow={
          <>
            <ShieldCheck size={12} className="text-[var(--purple)]" /> Admin access only
          </>
        }
        title="Payout"
        accent="queue"
        body="These coins are already escrowed. Send the stablecoin yourself, paste the payout TxID to close the row, or reject it to hand the coins back. Anything at or above the dual-approval line needs two admins."
        actions={
          <>
            <button
              onClick={() => void reload()}
              disabled={loading}
              className="flex items-center gap-2 border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs font-bold text-[var(--text)] transition-colors hover:border-[var(--purple)] disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Reload
            </button>
            <Link
              href="/admin/deposits"
              className=" border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs font-bold text-[var(--text)] transition-colors hover:border-[var(--purple)]"
            >
              ← Deposits
            </Link>
          </>
        }
      />

      {/* Summary */}
      <StatStrip>
        <Stat bare icon={<Coins size={13} />} label="Awaiting payout" value={String(pending.length)} />
        <Stat
          bare
          icon={<Lock size={13} />}
          label="Coins escrowed"
          value={pendingCoins.toLocaleString()}
        />
        <Stat
          bare
          icon={<Banknote size={13} />}
          label={`To send (net of ${formatUsd(WITHDRAW_FEE_USD)} fee)`}
          value={formatUsd(pendingNetUsd)}
        />
        <Stat
          bare
          icon={<UserCheck size={13} />}
          label="Second signature due"
          value={String(pending.filter((entry) => entry.firstApprovedBy).length)}
        />
      </StatStrip>

      {unavailable && (
        <div className="card p-4 text-xs text-[var(--text-secondary)]">
          Payouts are unreadable right now — the{' '}
          <code className="text-[var(--purple-light)]">crypto_withdrawals</code> table is missing or
          the Supabase keys are unset. Run{' '}
          <code className="text-[var(--purple-light)]">supabase/setup.sql</code> in the Supabase SQL
          editor, then reload.
        </div>
      )}

      {message && <Notice ok={message.ok} text={message.text} />}

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowAll(false)}
          className={` px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            !showAll
              ? 'bg-[var(--purple)] text-[var(--term-canvas)]'
              : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text)]'
          }`}
        >
          Pending <span className="opacity-70">{pending.length}</span>
        </button>
        <button
          onClick={() => setShowAll(true)}
          className={` px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            showAll
              ? 'bg-[var(--purple)] text-[var(--term-canvas)]'
              : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text)]'
          }`}
        >
          All <span className="opacity-70">{withdrawals.length}</span>
        </button>

        <p className="ml-auto text-[10px] text-[var(--text-muted)]">
          Dual approval from {DUAL_APPROVAL_COINS.toLocaleString()} coins (
          {formatUsd(DUAL_APPROVAL_COINS / 100)}) — two different admins.
        </p>
      </div>

      {/* Queue */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] uppercase text-[var(--text-muted)] font-semibold tracking-wider">
                <th className="p-4">Player</th>
                <th className="p-4">Coins</th>
                <th className="p-4">Payout</th>
                <th className="p-4">Rail</th>
                <th className="p-4">Send to</th>
                <th className="p-4">Requested</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-[var(--text-muted)]">
                    {loading ? 'Loading payouts…' : 'Nobody is waiting on a transfer.'}
                  </td>
                </tr>
              )}

              {rows.map((withdrawal) => {
                // A paid row keeps the payout TxID in its note, which is the
                // only proof the arena has that the money actually moved.
                const url =
                  withdrawal.status === 'paid'
                    ? explorerUrl(withdrawal.assetId, withdrawal.note ?? '')
                    : '';
                // Paying the same wallet again is legitimate, but the reviewer
                // should see how often it has happened before signing.
                const reuse = addressHistory(withdrawals, withdrawal.address, withdrawal.id);
                const dual = needsDualApproval(withdrawal.coins);
                const firstSigner = withdrawal.firstApprovedBy
                  ? names[withdrawal.firstApprovedBy] ?? shorten(withdrawal.firstApprovedBy, 8, 4)
                  : null;
                const signedByMe = Boolean(
                  withdrawal.firstApprovedBy && withdrawal.firstApprovedBy === user?.id,
                );
                const paying = payingId === withdrawal.id;
                const rejecting = rejectingId === withdrawal.id;
                return (
                  <Fragment key={withdrawal.id}>
                    <tr className="hover:bg-[var(--surface-muted)] transition-colors align-top">
                      <td className="p-4">
                        <span className="block font-semibold text-[var(--text)]">
                          {names[withdrawal.playerId ?? ''] ?? (withdrawal.playerId?.slice(0, 8) ?? '—')}
                        </span>
                        <span className="block font-mono text-[10px] text-[var(--text-muted)]">
                          escrowed
                        </span>
                      </td>
                      <td className="p-4 font-mono font-bold text-[var(--purple-light)]">
                        {withdrawal.coins.toLocaleString()}
                        <span className="block font-normal text-[var(--text-muted)] text-[10px]">
                          {formatUsd(withdrawal.grossUsd)} value
                        </span>
                      </td>
                      <td className="p-4 font-mono text-[var(--up)] font-bold">
                        {formatUsd(withdrawal.netUsd)}
                        <span className="block font-sans text-[10px] text-[var(--text-muted)] font-normal">
                          −{formatUsd(withdrawal.feeUsd)} fee
                        </span>
                      </td>
                      <td className="p-4 text-[var(--text-secondary)]">
                        {withdrawal.symbol}
                        <span className="block text-[10px] text-[var(--text-muted)]">{withdrawal.network}</span>
                      </td>
                      <td className="p-4 max-w-[240px]">
                        <span className="block font-mono text-[var(--text)] break-all">
                          {shorten(withdrawal.address, 12, 10)}
                        </span>
                        {withdrawal.memo && (
                          <span className="block font-mono text-[10px] text-[var(--amber,#f59e0b)]">
                            memo {withdrawal.memo}
                          </span>
                        )}
                        {reuse.total > 0 && (
                          <span className="mt-1 block">
                            <Pill
                              tone={reuse.paid > 0 ? 'pending' : 'neutral'}
                              title={`${reuse.total} earlier request(s) to this address, ${reuse.paid} paid`}
                            >
                              Used {reuse.total}× before
                            </Pill>
                          </span>
                        )}
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[10px] text-[var(--purple-light)] hover:underline flex items-center gap-1 mt-1"
                          >
                            {shorten(withdrawal.note ?? '', 10, 6)} <span aria-hidden>↗</span>
                          </a>
                        )}
                      </td>
                      <td className="p-4 text-[var(--text-muted)] whitespace-nowrap">{when(withdrawal.createdAt)}</td>
                      <td className="p-4">
                        <span
                          className={`px-2.5 py-0.5 border uppercase text-[10px] font-bold whitespace-nowrap ${STATUS_PILL[withdrawal.status]}`}
                        >
                          {STATUS_LABEL[withdrawal.status]}
                        </span>
                        {firstSigner && withdrawal.status === 'pending' && (
                          <span
                            className="mt-1 block text-[10px] text-[var(--text-muted)]"
                            title={when(withdrawal.firstApprovedAt ?? null)}
                          >
                            1 of 2 signed · {firstSigner}
                          </span>
                        )}
                        {withdrawal.note && withdrawal.status === 'rejected' && (
                          <span className="block mt-1 text-[10px] text-[var(--text-muted)] max-w-[180px]">
                            {withdrawal.note}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        {withdrawal.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setPayingId(paying ? null : withdrawal.id);
                                setRejectingId(null);
                                setPayRef('');
                              }}
                              disabled={signedByMe}
                              aria-expanded={paying}
                              title={
                                signedByMe
                                  ? 'You signed this payout — a second admin has to confirm it'
                                  : dual
                                    ? 'Two signatures: this records the first'
                                    : undefined
                              }
                              className={`px-3 py-1 text-[10px] font-bold uppercase text-[var(--term-canvas)] flex items-center gap-1.5 ${
                                signedByMe
                                  ? 'bg-[var(--surface-muted)] text-[var(--text-muted)] cursor-not-allowed'
                                  : 'bg-[var(--up)] cursor-pointer'
                              }`}
                            >
                              <Check size={11} />
                              {signedByMe
                                ? 'Signed'
                                : dual
                                  ? withdrawal.firstApprovedBy
                                    ? 'Second signature'
                                    : 'Approve 1 of 2'
                                  : 'Mark paid'}
                            </button>
                            <button
                              onClick={() => {
                                setRejectingId(rejecting ? null : withdrawal.id);
                                setPayingId(null);
                                setRejectNote('');
                              }}
                              aria-expanded={rejecting}
                              className="px-3 py-1 text-[10px] font-bold uppercase border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--down)] hover:border-[var(--down)]/40 transition-colors cursor-pointer flex items-center gap-1.5"
                            >
                              <X size={11} /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)] font-mono">
                            {when(withdrawal.reviewedAt)}
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* The form opens under the row it belongs to, so the
                        reviewer never loses the request they clicked. */}
                    {paying && (
                      <tr className="bg-[var(--surface-muted)]/60">
                        <td colSpan={8} className="border-t border-[var(--border)] p-0">
                          <div className="space-y-3 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <h3 className="text-sm font-bold text-[var(--text)]">
                                  Payout confirmation
                                </h3>
                                <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                                  Send the stablecoin from the arena wallet first, then paste the
                                  transaction hash here. It is the only record that the transfer
                                  happened — the player sees it in their history and a dispute
                                  starts from it.
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {dual ? (
                                  <Pill tone={firstSigner ? 'ok' : 'pending'}>
                                    <UserCheck size={11} />
                                    {firstSigner
                                      ? `1 of 2 signed · ${firstSigner}`
                                      : '2 signatures required'}
                                  </Pill>
                                ) : (
                                  <Pill tone="neutral">Single signature</Pill>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setPayingId(null)}
                                  aria-label="Close payout form"
                                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>

                            {firstSigner && (
                              <p className="border border-[var(--border)] bg-[var(--surface)] p-3 text-[11px] text-[var(--text-secondary)]">
                                <span className="font-bold text-[var(--text)]">{firstSigner}</span>{' '}
                                already signed this payout
                                {withdrawal.firstApprovedAt
                                  ? ` on ${when(withdrawal.firstApprovedAt)}`
                                  : ''}
                                . Your signature is the second one, and it closes the row.
                              </p>
                            )}

                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                value={payRef}
                                spellCheck={false}
                                autoFocus
                                onChange={(e) => setPayRef(e.target.value.trim())}
                                placeholder="payout TxID"
                                className="min-w-[240px] flex-1 border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--text)] focus:border-[var(--purple)] focus:outline-none"
                              />
                              <button
                                onClick={() => void handleApprove(withdrawal)}
                                disabled={payRef.trim().length < 12 || busyId === withdrawal.id}
                                className="flex items-center gap-2 bg-[var(--up)] px-4 py-2 text-xs font-bold text-[var(--term-canvas)] disabled:opacity-50 cursor-pointer"
                              >
                                {busyId === withdrawal.id && (
                                  <Loader2 size={12} className="animate-spin" />
                                )}
                                {dual && firstSigner
                                  ? 'Second signature'
                                  : dual
                                    ? 'Sign (1 of 2)'
                                    : 'Confirm paid'}
                              </button>
                              <button
                                onClick={() => setPayingId(null)}
                                className="border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {rejecting && (
                      <tr className="bg-[var(--surface-muted)]/60">
                        <td colSpan={8} className="border-t border-[var(--border)] p-0">
                          <div className="space-y-3 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-sm font-bold text-[var(--text)]">
                                  Reason for refusing the payout
                                </h3>
                                <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                                  Pick the reason the player will see. The escrowed coins go back to
                                  their balance in the same call, so this is the only thing they can
                                  act on.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setRejectingId(null)}
                                aria-label="Close rejection form"
                                className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                              >
                                <X size={14} />
                              </button>
                            </div>

                            <label className="block space-y-1">
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                Reason
                              </span>
                              <select
                                value={rejectNote}
                                onChange={(e) => setRejectNote(e.target.value)}
                                autoFocus
                                className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text)] focus:border-[var(--purple)] focus:outline-none cursor-pointer"
                              >
                                <option value="">Choose a reason…</option>
                                {REFUSE_REASONS.map((reason) => (
                                  <option key={reason} value={reason}>
                                    {reason}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => void handleReject(withdrawal)}
                                disabled={!rejectNote.trim() || busyId === withdrawal.id}
                                className="flex items-center gap-2 bg-[var(--down)] px-4 py-2 text-xs font-bold text-[var(--term-canvas)] disabled:opacity-50 cursor-pointer"
                              >
                                {busyId === withdrawal.id && (
                                  <Loader2 size={12} className="animate-spin" />
                                )}
                                Reject and refund
                              </button>
                              <button
                                onClick={() => setRejectingId(null)}
                                className="border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
