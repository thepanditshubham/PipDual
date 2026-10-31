'use client';

/**
 * /admin/deposits
 * The crypto review queue. A player pastes a TxID and the deposit sits here as
 * `pending` with no coins attached — they send whatever they like. Approving
 * opens the row, the desk reads the transfer off the chain (hash, recipient,
 * amount), and the reviewer credits what actually landed at the house address.
 * Approving runs a single Postgres function that stamps the amount onto the row
 * and credits the wallet together, so a double click cannot pay twice and no
 * client can credit itself.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Coins,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { useDepositStore } from '@/lib/economy/deposit-store';
import { explorerUrl, formatUsd, packFor } from '@/lib/economy/deposit';
import { findTxidConflict } from '@/lib/admin/rules';
import { OnChainCheck } from '@/components/admin/onchain-check';
import type { CryptoDeposit } from '@/lib/economy/types';
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
  approveDeposit,
  fetchDepositQueue,
  fetchPlayerNames,
  rejectDeposit,
} from '@/lib/supabase/wallet';

const STATUS_PILL: Record<CryptoDeposit['status'], string> = {
  pending: 'bg-[var(--amber,#f59e0b)]/10 text-[var(--amber,#f59e0b)] border-[var(--amber,#f59e0b)]/30',
  paid: 'bg-[var(--up)]/10 text-[var(--up)] border-[var(--up)]/30',
  rejected: 'bg-[var(--down)]/10 text-[var(--down)] border-[var(--down)]/30',
};

const STATUS_LABEL: Record<CryptoDeposit['status'], string> = {
  pending: 'Pending',
  paid: 'Credited',
  rejected: 'Rejected',
};

/**
 * Why a deposit gets turned down, written for the player. A picklist beats
 * free text here: the same case is worded the same way every time, and the
 * player is told exactly what to fix before resubmitting.
 */
const REJECT_REASONS = [
  'Transaction hash not found on the network',
  'Transfer did not reach our deposit address',
  'Transaction is still unconfirmed',
  'This transaction was already credited',
  'The token or network does not match the selected rail',
  'Suspected fraudulent claim',
] as const;

export default function AdminDepositsPage() {
  const user = useAuthStore((s) => s.user);
  const syncDeposits = useDepositStore((s) => s.sync);
  const isAdmin = user?.role === 'admin';

  const [deposits, setDeposits] = useState<CryptoDeposit[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveCoins, setApproveCoins] = useState('');
  // True once the chain check has named the amount, so the field stops asking.
  const [autoAmount, setAutoAmount] = useState(false);
  const [approveRef, setApproveRef] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    // Every state write sits behind the await, so the mount effect that calls
    // this does not cascade a render before the first read resolves.
    const queue = await fetchDepositQueue();
    if (queue === null) {
      setUnavailable(true);
      setDeposits([]);
      return;
    }

    setUnavailable(false);
    setDeposits(queue);
    const ids = [...new Set(queue.map((entry) => entry.playerId).filter(Boolean))] as string[];
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

  // The console's reading pane links here with ?focus=<row id>. Open that
  // claim straight away, list every status so the row is present, then drop
  // the parameter so a refresh starts clean.
  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get('focus');
    if (!focus) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowAll(true);
    setApprovingId(focus);
    window.history.replaceState({}, '', '/admin/deposits');
  }, []);

  // Land on the row that was just opened, however it was opened.
  useEffect(() => {
    if (!approvingId) return;
    document
      .getElementById(`deposit-row-${approvingId}`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [approvingId, deposits.length]);

  const rows = useMemo(
    () => (showAll ? deposits : deposits.filter((entry) => entry.status === 'pending')),
    [deposits, showAll],
  );

  const pendingCount = deposits.filter((entry) => entry.status === 'pending').length;
  const creditedCoins = deposits
    .filter((entry) => entry.status === 'paid')
    .reduce((total, entry) => total + (entry.coins ?? 0), 0);

  const handleApprove = async (deposit: CryptoDeposit) => {
    const coins = Math.floor(Number(approveCoins));
    if (!Number.isFinite(coins) || coins <= 0) {
      setMessage({ ok: false, text: 'The chain check has not named an amount yet — retry it, or enter the coins by hand.' });
      return;
    }

    // One transfer, one credit. The database refuses this too; checking here
    // keeps the reviewer from submitting an approval that cannot succeed.
    const clash = findTxidConflict(deposits, deposit.txid, deposit.id);
    if (clash) {
      setMessage({
        ok: false,
        text: `That TxID is already on file against ${clash.id} (${STATUS_LABEL[clash.status]}) — one transfer can only fund one credit.`,
      });
      return;
    }

    setBusyId(deposit.id);
    setMessage(null);
    const result = await approveDeposit(deposit.id, coins, approveRef);
    setBusyId(null);

    if (!result.ok) {
      setMessage({ ok: false, text: result.error ?? 'Approval failed.' });
      return;
    }
    setMessage({
      ok: true,
      text: `${result.coins.toLocaleString()} coins credited to ${names[deposit.playerId ?? ''] ?? 'player'}.`,
    });
    setApprovingId(null);
    setApproveCoins('');
    setApproveRef('');
    setAutoAmount(false);
    // Approving your own deposit from this screen should reflect here too.
    if (deposit.playerId && deposit.playerId === user?.id) {
      await syncDeposits(deposit.playerId).catch(() => {/* silent */});
    }
    await load();
  };

  const handleReject = async (deposit: CryptoDeposit) => {
    setBusyId(deposit.id);
    const result = await rejectDeposit(deposit.id, rejectNote);
    setBusyId(null);
    setRejectingId(null);
    setRejectNote('');

    if (!result.ok) {
      setMessage({ ok: false, text: result.error ?? 'Rejection failed.' });
      return;
    }
    setMessage({ ok: true, text: `Deposit ${deposit.id} rejected — no coins credited.` });
    await load();
  };

  if (!user) {
    return (
      <Gate
        title="Sign in required"
        body="The deposit review queue is only visible to a signed-in admin account."
      />
    );
  }

  if (!isAdmin) {
    return (
      <Gate
        title="Admin access only"
        body={`Signed in as ${user.username}, which is not an admin account. Set role = 'admin' on this profile's row in Supabase to review deposits.`}
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
        title="Deposit"
        accent="review"
        body="Verify each transaction on its explorer, then name the coins to credit. A rejected deposit credits nothing, and a pending one never touches a balance on its own."
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
              href="/admin/withdrawals"
              className=" border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs font-bold text-[var(--text)] transition-colors hover:border-[var(--purple)]"
            >
              Payouts →
            </Link>
          </>
        }
      />

      {/* Summary */}
      <StatStrip cols={3}>
        <Stat bare icon={<Coins size={13} />} label="Awaiting review" value={String(pendingCount)} />
        <Stat
          bare
          icon={<ShieldAlert size={13} />}
          label="Coins credited so far"
          value={creditedCoins.toLocaleString()}
        />
        <Stat
          bare
          icon={<Check size={13} />}
          label="Total deposits seen"
          value={String(deposits.length)}
        />
      </StatStrip>

      {unavailable && (
        <div className="card p-4 text-xs text-[var(--text-secondary)]">
          Deposits are unreadable right now — the{' '}
          <code className="text-[var(--purple-light)]">crypto_deposits</code> table is missing or the
          Supabase keys are unset. Run{' '}
          <code className="text-[var(--purple-light)]">supabase/setup.sql</code> in the Supabase SQL
          editor, then reload.
        </div>
      )}

      {message && <Notice ok={message.ok} text={message.text} />}

      {/* Filter */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowAll(false)}
          className={`px-4 py-2 text-xs font-bold border transition-colors cursor-pointer ${
            !showAll
              ? 'bg-[var(--purple)] text-[var(--term-canvas)] border-[var(--purple)]'
              : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] border-[var(--border)]'
          }`}
        >
          Pending ({pendingCount})
        </button>
        <button
          onClick={() => setShowAll(true)}
          className={`px-4 py-2 text-xs font-bold border transition-colors cursor-pointer ${
            showAll
              ? 'bg-[var(--purple)] text-[var(--term-canvas)] border-[var(--purple)]'
              : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] border-[var(--border)]'
          }`}
        >
          All ({deposits.length})
        </button>
      </div>

      {/* Queue */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] uppercase text-[var(--text-muted)] font-semibold tracking-wider">
                <th className="p-4">Player</th>
                <th className="p-4">Coins</th>
                <th className="p-4">Rail</th>
                <th className="p-4">Expected</th>
                <th className="p-4">TxID</th>
                <th className="p-4">Submitted</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-[var(--text-muted)]">
                    {loading ? 'Loading deposits…' : 'Nothing waiting for review.'}
                  </td>
                </tr>
              )}

              {rows.map((deposit) => {
                const url = explorerUrl(deposit.assetId, deposit.txid);
                const pack = packFor(deposit.packId);
                const clash = findTxidConflict(deposits, deposit.txid, deposit.id);
                const approving = approvingId === deposit.id;
                const rejecting = rejectingId === deposit.id;
                const coins = Math.floor(Number(approveCoins));
                const valid = Number.isFinite(coins) && coins > 0;

                return (
                  <Fragment key={deposit.id}>
                    <tr
                      id={`deposit-row-${deposit.id}`}
                      className="hover:bg-[var(--surface-muted)] transition-colors align-top"
                    >
                      <td className="p-4">
                        <span className="block font-semibold text-[var(--text)]">
                          {names[deposit.playerId ?? ''] ?? (deposit.playerId?.slice(0, 8) ?? '—')}
                        </span>
                        {deposit.memo && (
                          <span className="block font-mono text-[10px] text-[var(--text-muted)]">
                            tag {deposit.memo}
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-mono font-bold text-[var(--purple-light)]">
                        {deposit.coins === null ? (
                          <span className="text-[var(--text-muted)] font-sans text-[11px]">Not credited</span>
                        ) : (
                          deposit.coins.toLocaleString()
                        )}
                        <span className="block font-normal text-[var(--text-muted)] text-[10px]">
                          {pack?.label ?? (deposit.packId === 'custom' ? 'Reviewer-named amount' : deposit.packId)}
                        </span>
                      </td>
                      <td className="p-4 text-[var(--text-secondary)]">
                        {deposit.symbol}
                        <span className="block text-[10px] text-[var(--text-muted)]">{deposit.network}</span>
                      </td>
                      <td className="p-4 font-mono text-[var(--text)]">
                        {deposit.expectedUsd === null ? '—' : formatUsd(deposit.expectedUsd)}
                        <span className="block text-[10px] text-[var(--text-muted)] font-sans">
                          to {deposit.address.slice(0, 10)}…
                        </span>
                      </td>
                      <td className="p-4 max-w-[220px]">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[var(--purple-light)] hover:underline flex items-center gap-1.5"
                          >
                            {shorten(deposit.txid)} <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="font-mono text-[var(--text-muted)]">{shorten(deposit.txid)}</span>
                        )}
                        {clash && (
                          <span className="mt-1 block">
                            <Pill
                              tone="bad"
                              title={`Already claimed by ${clash.id} (${STATUS_LABEL[clash.status]})`}
                            >
                              Duplicate TxID
                            </Pill>
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-[var(--text-muted)] whitespace-nowrap">{when(deposit.createdAt)}</td>
                      <td className="p-4">
                        <span
                          className={`px-2.5 py-0.5 border uppercase text-[10px] font-bold whitespace-nowrap ${STATUS_PILL[deposit.status]}`}
                        >
                          {STATUS_LABEL[deposit.status]}
                        </span>
                        {deposit.note && (
                          <span className="block mt-1 text-[10px] text-[var(--text-muted)] max-w-[180px]">
                            {deposit.note}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        {deposit.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setApprovingId(approving ? null : deposit.id);
                                setRejectingId(null);
                                setApproveCoins('');
                                setApproveRef('');
                                setAutoAmount(false);
                              }}
                              disabled={busyId === deposit.id}
                              aria-expanded={approving}
                              className="px-3 py-1 text-[10px] font-bold uppercase bg-[var(--up)] text-[var(--term-canvas)] disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                            >
                              {busyId === deposit.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                setRejectingId(rejecting ? null : deposit.id);
                                setApprovingId(null);
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
                            {deposit.reviewedAt ? when(deposit.reviewedAt) : '—'}
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* The form opens under the row it belongs to, not at the
                        bottom of the page, so the reviewer keeps their place. */}
                    {approving && (
                      <tr className="bg-[var(--surface-muted)]/60">
                        <td colSpan={8} className="border-t border-[var(--border)] p-0">
                          <div className="space-y-3 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-sm font-bold text-[var(--text)]">
                                  Credit coins to {names[deposit.playerId ?? ''] ?? 'player'}
                                </h3>
                                <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                                  The desk reads the transfer below and fills the coin amount itself
                                  (100 coins = $1). Check that it reached the house address, then
                                  confirm — or set a different amount by hand.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setApprovingId(null)}
                                aria-label="Close approval form"
                                className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                              >
                                <X size={14} />
                              </button>
                            </div>

                            {clash && (
                              <div className="border border-[var(--down)]/40 bg-[var(--down)]/5 p-3 text-xs text-[var(--down)]">
                                This TxID is already on file against {clash.id} (
                                {STATUS_LABEL[clash.status]}). One transfer can only fund one credit
                                — reject this claim or find the transaction that actually paid it.
                              </div>
                            )}

                            <OnChainCheck
                              assetId={deposit.assetId}
                              txid={deposit.txid}
                              onUse={(value) => {
                                setApproveCoins(String(value));
                                setAutoAmount(true);
                              }}
                            />

                            <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                              <div className="space-y-1">
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                  Coins to credit
                                </label>
                                {autoAmount && valid ? (
                                  <>
                                    <p className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm font-bold text-[var(--text)]">
                                      {coins.toLocaleString()}
                                    </p>
                                    <p className="text-[10px] text-[var(--text-muted)]">
                                      Read from the chain · ≈ {formatUsd(coins / 100)}.{' '}
                                      <button
                                        type="button"
                                        onClick={() => setAutoAmount(false)}
                                        className="font-bold text-[var(--purple)] hover:underline cursor-pointer"
                                      >
                                        Enter it by hand
                                      </button>
                                    </p>
                                  </>
                                ) : (
                                  <>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      min={1}
                                      step={1}
                                      autoFocus
                                      value={approveCoins}
                                      onChange={(e) => setApproveCoins(e.target.value)}
                                      placeholder="e.g. 1000"
                                      className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--text)] focus:border-[var(--purple)] focus:outline-none"
                                    />
                                    <p className="text-[10px] text-[var(--text-muted)]">
                                      {valid
                                        ? `≈ ${formatUsd(coins / 100)} at the flat peg.`
                                        : 'Waiting for the chain check, or enter a whole amount.'}
                                    </p>
                                  </>
                                )}
                              </div>

                              <div className="space-y-1">
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                  Payment reference (optional)
                                </label>
                                <input
                                  value={approveRef}
                                  onChange={(e) => setApproveRef(e.target.value)}
                                  placeholder="explorer note, internal id…"
                                  className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text)] focus:border-[var(--purple)] focus:outline-none"
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => void handleApprove(deposit)}
                                disabled={!valid || Boolean(clash) || busyId === deposit.id}
                                className="bg-[var(--up)] px-4 py-2 text-xs font-bold text-[var(--term-canvas)] disabled:opacity-50 cursor-pointer"
                              >
                                Confirm approval
                              </button>
                              <button
                                onClick={() => setApprovingId(null)}
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
                                  Reason for rejecting
                                </h3>
                                <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                                  Pick the reason the player will see beside the deposit, so they know
                                  what to fix before resubmitting.
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
                                {REJECT_REASONS.map((reason) => (
                                  <option key={reason} value={reason}>
                                    {reason}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => void handleReject(deposit)}
                                disabled={!rejectNote.trim() || busyId === deposit.id}
                                className="bg-[var(--down)] px-4 py-2 text-xs font-bold text-[var(--term-canvas)] disabled:opacity-50 cursor-pointer"
                              >
                                Confirm rejection
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
