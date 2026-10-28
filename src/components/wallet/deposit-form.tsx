'use client';

/**
 * deposit-form.tsx
 * The buy-coins half of the wallet panel. Pick a coin and network, send to the
 * house address, paste the transaction hash. There is no amount to declare —
 * the player sends what they want and a reviewer reads the value off the
 * explorer, then names the coins when approving. Submitting records a deposit
 * for review; it does not credit anything.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Coins,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { useDepositStore } from '@/lib/economy/deposit-store';
import {
  acceptedAssets,
  explorerUrl,
  memoForUser,
  validateTxId,
} from '@/lib/economy/deposit';
import type { CryptoDeposit } from '@/lib/economy/types';
import { sound } from '@/components/terminal/sound';
import { AddressField, HistoryRow, StepLabel, shortId } from './wallet-bits';

type Feedback = { ok: boolean; text: string } | null;

function DepositHistory({ deposits }: { deposits: CryptoDeposit[] }) {
  if (deposits.length === 0) return null;

  return (
    <div className="space-y-1.5 pt-3 border-t border-[var(--term-border)]">
      <StepLabel>Your deposits</StepLabel>
      {deposits.slice(0, 5).map((deposit) => {
        const url = explorerUrl(deposit.assetId, deposit.txid);
        return (
          <HistoryRow
            key={deposit.id}
            map="deposit"
            status={deposit.status}
            primary={
              deposit.coins === null
                ? `${deposit.symbol} transfer — awaiting review`
                : `${deposit.coins.toLocaleString()} coins`
            }
            secondary={`${shortId(deposit.txid)}${deposit.note ? ` · ${deposit.note}` : ''}`}
          >
            <span className="text-[10px] font-mono text-[var(--term-dim)]">{deposit.symbol}</span>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title="View on explorer"
                className="text-[var(--term-muted)] hover:text-[var(--term-primary)] transition-colors"
              >
                <ExternalLink size={11} />
              </a>
            )}
          </HistoryRow>
        );
      })}
    </div>
  );
}

export function DepositForm() {
  const user = useAuthStore((s) => s.user);
  const deposits = useDepositStore((s) => s.deposits);
  const submit = useDepositStore((s) => s.submit);
  const sync = useDepositStore((s) => s.sync);

  const assets = useMemo(() => acceptedAssets(), []);
  const [assetId, setAssetId] = useState<string>(assets[0]?.id ?? '');
  const [txid, setTxid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [syncing, setSyncing] = useState(false);

  const asset = assets.find((entry) => entry.id === assetId) ?? assets[0] ?? null;
  const hashError = txid.trim() ? validateTxId(asset?.id ?? '', txid) : null;

  const userId = user?.id;
  const isGuestUser = user?.isGuest ?? true;

  // Shared-address rails identify the payer by a tag derived from the account
  // id, so the player copies it instead of inventing one.
  const memoTag = userId ? memoForUser(userId) : '';

  const checkStatus = useCallback(async () => {
    if (!userId || isGuestUser) return;
    // Nothing writes local state before the await, so this is safe to call
    // from an effect; the spinner belongs to the button that asks for it.
    await sync(userId);
  }, [isGuestUser, sync, userId]);

  const refresh = useCallback(async () => {
    setSyncing(true);
    await checkStatus().catch(() => {/* silent */});
    setSyncing(false);
  }, [checkStatus]);

  // A deposit is credited by a reviewer in another session, so the form has to
  // ask rather than be told. One pull per account is enough to catch an
  // approval that happened while the tab was closed.
  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const handleSubmit = async () => {
    if (!asset || submitting) return;
    const invalid = validateTxId(asset.id, txid);
    if (invalid) {
      setFeedback({ ok: false, text: invalid });
      return;
    }

    sound.playClick();
    setSubmitting(true);
    const result = await submit({ assetId: asset.id, txid, memo: memoTag });
    setSubmitting(false);

    if (result.error || !result.deposit) {
      setFeedback({ ok: false, text: result.error ?? 'Deposit could not be recorded.' });
      return;
    }

    setTxid('');
    sound.playWin();
    setFeedback({
      ok: true,
      text:
        'Deposit submitted for review. A reviewer confirms the transfer on the explorer, then credits your coins.',
    });
  };

  if (!asset) {
    return (
      <p className="text-xs text-[var(--term-soft)] leading-snug">
        No crypto wallet address is configured for this build, so deposits are
        closed. Set <span className="font-mono text-[10px]">NEXT_PUBLIC_DEPOSIT_*</span> and restart.
      </p>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* 1. Coin + network */}
      <div className="space-y-1.5">
        <StepLabel>Pay with</StepLabel>
        <div className="grid grid-cols-2 gap-2">
          {assets.map((entry) => {
            const active = entry.id === assetId;
            return (
              <button
                key={entry.id}
                onClick={() => {
                  sound.playClick();
                  setAssetId(entry.id);
                  setFeedback(null);
                }}
                className={`h-9 rounded text-[10px] font-bold flex flex-col items-center justify-center leading-tight transition-colors cursor-pointer border ${
                  active
                    ? 'bg-[var(--term-raised-hi)] border-[var(--term-border-hi)] text-[var(--term-strong)]'
                    : 'bg-[var(--term-bg)] border-[var(--term-border)] text-[var(--term-muted)] hover:text-[var(--term-text)]'
                }`}
              >
                <span>{entry.symbol}</span>
                <span className={`text-[9px] font-mono ${active ? 'text-[var(--term-soft)]' : 'text-[var(--term-dim)]'}`}>
                  {entry.network}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Where to send it — QR left, address and detail right */}
      <div className="space-y-2 rounded-lg bg-[var(--term-bg)] border border-[var(--term-border)] p-2.5">
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-[var(--term-muted)]">
          <Wallet size={10} /> Send {asset.symbol} to this address
        </div>

        <div className="flex gap-2.5">
          {asset.qr && (
            <div className="shrink-0 flex flex-col items-center gap-1">
              <img
                src={asset.qr}
                alt={`${asset.symbol} ${asset.network} deposit QR code`}
                className="w-[150px] h-[150px] rounded border border-[var(--term-border)] bg-white object-contain p-1.5"
              />
              <span className="text-[9px] uppercase tracking-wider text-[var(--term-dim)]">Scan to pay</span>
            </div>
          )}

          <div className={`min-w-0 space-y-1.5 ${asset.qr ? 'flex-1' : 'w-full'}`}>
            <AddressField label={`${asset.symbol} · ${asset.network} address`} value={asset.address} />
            {asset.memoRequired && (
              <AddressField label="Memo / destination tag (required)" value={memoTag} />
            )}
            <p className="text-[10px] font-mono text-[var(--term-dim)] leading-snug">
              Send any amount you want to top up. A reviewer checks the transfer
              on the explorer and credits coins at $1 = 100.
            </p>
            <p className="text-[10px] font-mono text-[var(--term-sell)] leading-snug">
              Only {asset.symbol} over {asset.network}. A wrong token or chain cannot be recovered.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Proof of payment */}
      <div className="space-y-1.5">
        <label htmlFor="deposit-txid" className="text-[10px] uppercase tracking-wider font-bold text-[var(--term-muted)]">
          {asset.memoRequired ? 'TxID — plus the memo/tag above' : 'Transaction hash (TxID)'}
        </label>
        <input
          id="deposit-txid"
          value={txid}
          spellCheck={false}
          onChange={(e) => {
            setTxid(e.target.value.trim());
            setFeedback(null);
          }}
          placeholder={asset.network === 'Solana' ? 'base58 signature' : '0x… / block hash'}
          className={`w-full h-9 rounded px-2.5 bg-[var(--term-bg)] border text-[11px] font-mono text-[var(--term-strong)] placeholder:text-[var(--term-dim)] focus:outline-none transition-colors ${
            hashError ? 'border-[var(--term-sell)]' : 'border-[var(--term-border)] focus:border-[var(--term-primary)]/50'
          }`}
        />
        {hashError && (
          <p className="text-[10px] font-mono text-[var(--term-sell)] flex items-start gap-1.5">
            <AlertCircle size={11} className="mt-0.5 shrink-0" />
            {hashError}
          </p>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || Boolean(hashError) || txid.trim().length === 0}
        className={`w-full h-9 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
          submitting || hashError || txid.trim().length === 0
            ? 'bg-[var(--term-raised)] text-[var(--term-dim)] cursor-not-allowed'
            : 'bg-[var(--term-primary)] hover:bg-[var(--term-primary-hi)] text-white cursor-pointer'
        }`}
      >
        {submitting ? (
          <>
            <Loader2 size={13} className="animate-spin" /> Recording deposit…
          </>
        ) : (
          <>
            <Coins size={13} /> Submit deposit for review
          </>
        )}
      </button>

      {feedback && (
        <p
          className={`text-[11px] font-mono flex items-start gap-1.5 ${
            feedback.ok ? 'text-[var(--term-buy)]' : 'text-[var(--term-sell)]'
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
          )}
          {feedback.text}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-mono text-[var(--term-dim)] flex items-start gap-1.5">
          <ShieldCheck size={11} className="mt-0.5 shrink-0" />
          Coins arrive only after a reviewer confirms your transaction on the
          explorer. Nothing is credited on submission.
        </p>
        <button
          onClick={() => void refresh()}
          disabled={syncing}
          title="Check review status"
          className="shrink-0 h-7 w-7 rounded border border-[var(--term-border)] bg-[var(--term-raised)] text-[var(--term-muted)] hover:text-[var(--term-primary)] transition-colors cursor-pointer flex items-center justify-center disabled:cursor-not-allowed"
        >
          <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
        </button>
      </div>

      <DepositHistory deposits={deposits} />
    </div>
  );
}
