'use client';

/**
 * withdraw-form.tsx
 * The cash-out half of the wallet panel. A player names an amount of coins,
 * picks the chain to be paid on, and gives the address the stablecoin should
 * land at. Requesting one escrows the coins immediately — they leave the
 * balance in the same database call that queues the payout, so they cannot
 * also be spent on a Live entry while a reviewer decides. If the reviewer says
 * no, the coins come back.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { useWithdrawStore } from '@/lib/economy/withdraw-store';
import { MIN_WITHDRAW_USD, WITHDRAW_FEE_USD } from '@/lib/economy/config';
import {
  MIN_WITHDRAW_COINS,
  withdrawalBreakdown,
  validatePayoutAddress,
  withdrawRails,
} from '@/lib/economy/withdraw';
import { explorerUrl, formatUsd } from '@/lib/economy/deposit';
import type { WithdrawRequest } from '@/lib/economy/types';
import { sound } from '@/components/terminal/sound';
import { HistoryRow, StepLabel, shortId } from './wallet-bits';

type Feedback = { ok: boolean; text: string } | null;

const QUICK_AMOUNTS = [500, 1_000, 2_500];

function WithdrawHistory({ withdrawals }: { withdrawals: WithdrawRequest[] }) {
  // Three rows sit on the surface; the rest is one deliberate click away.
  const [showAll, setShowAll] = useState(false);
  if (withdrawals.length === 0) return null;
  const shown = showAll ? withdrawals : withdrawals.slice(0, 3);
  const hidden = withdrawals.length - shown.length;

  return (
    <div className="space-y-1.5 pt-3 border-t border-[var(--term-border)]">
      <StepLabel>Your payouts</StepLabel>
      {shown.map((entry) => {
        // On a paid row the note is the payout TxID; on a rejected one it is a
        // reason and there is nothing to look up.
        const url = entry.status === 'paid' ? explorerUrl(entry.assetId, entry.note ?? '') : null;
        return (
          <HistoryRow
            key={entry.id}
            map="withdraw"
            status={entry.status}
            primary={`${entry.coins.toLocaleString()} coins → ${formatUsd(entry.netUsd)}`}
            secondary={`${entry.symbol} · ${shortId(entry.address)}${entry.note ? ` · ${entry.note}` : ''}`}
          >
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title="View the payout on explorer"
                className="text-[var(--term-muted)] hover:text-[var(--term-primary)] transition-colors"
              >
                <ExternalLink size={11} />
              </a>
            )}
          </HistoryRow>
        );
      })}
      {withdrawals.length > 3 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex items-center gap-1 text-[10px] font-mono text-[var(--term-muted)] hover:text-[var(--term-primary)] transition-colors cursor-pointer"
        >
          {showAll ? (
            <>Show less <ChevronUp size={11} /></>
          ) : (
            <>Show all ({withdrawals.length}) <ChevronDown size={11} /></>
          )}
        </button>
      )}
      {!showAll && hidden > 0 && (
        <p className="text-[10px] font-mono text-[var(--term-dim)]">{hidden} older hidden</p>
      )}
    </div>
  );
}

export function WithdrawForm({ coins }: { coins: number }) {
  const user = useAuthStore((s) => s.user);
  const withdrawals = useWithdrawStore((s) => s.withdrawals);
  const request = useWithdrawStore((s) => s.request);
  const sync = useWithdrawStore((s) => s.sync);

  const rails = useMemo(() => withdrawRails(), []);
  const [assetId, setAssetId] = useState<string>(rails[0]?.id ?? '');
  const [amountText, setAmountText] = useState<string>(String(MIN_WITHDRAW_COINS));
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [syncing, setSyncing] = useState(false);

  const rail = rails.find((entry) => entry.id === assetId) ?? rails[0] ?? null;
  const requested = Number.parseInt(amountText.replace(/[^0-9]/g, ''), 10);
  const payout = withdrawalBreakdown(Number.isFinite(requested) ? requested : 0);
  const addressError = address.trim() && rail ? validatePayoutAddress(rail.id, address) : null;
  const overspent = Number.isFinite(requested) && requested > coins;

  const userId = user?.id;
  const isGuestUser = user?.isGuest ?? true;

  const checkStatus = useCallback(async () => {
    if (!userId || isGuestUser) return;
    // No local state is written before the await, so an effect can call this
    // directly; the spinner belongs to the button that asks for it.
    await sync(userId);
  }, [isGuestUser, sync, userId]);

  const refresh = useCallback(async () => {
    setSyncing(true);
    await checkStatus().catch(() => {/* silent */});
    setSyncing(false);
  }, [checkStatus]);

  // A payout is approved in another session entirely, so the only way to learn
  // it was paid — or refused and refunded — is to ask.
  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const handleSubmit = async () => {
    if (!rail || submitting) return;
    setSubmitting(true);
    const result = await request({
      coins: payout.coins,
      assetId: rail.id,
      address,
    });
    setSubmitting(false);

    if (result.error || !result.withdrawal) {
      setFeedback({ ok: false, text: result.error ?? 'Withdrawal could not be queued.' });
      return;
    }

    setAddress('');
    sound.playWin();
    setFeedback({
      ok: true,
      text: result.autoSettled
        ? `${result.withdrawal.coins.toLocaleString()} coins escrowed — no backend configured, so nothing was actually sent.`
        : `${result.withdrawal.coins.toLocaleString()} coins escrowed and queued. You receive ${formatUsd(result.withdrawal.netUsd)} ${result.withdrawal.symbol} once it is signed off.`,
    });
  };

  if (!rail) {
    return (
      <p className="text-xs text-[var(--term-soft)] leading-snug">
        No payout network is configured for this build, so withdrawals are
        closed. Set <span className="font-mono text-[10px]">NEXT_PUBLIC_DEPOSIT_*</span> and restart.
      </p>
    );
  }

  return (
    <div className="space-y-3.5">
      <p className="text-[11px] font-mono text-[var(--term-soft)]">
        {coins.toLocaleString()} coins available · {formatUsd(MIN_WITHDRAW_USD)} minimum ·{' '}
        {formatUsd(WITHDRAW_FEE_USD)} network fee off the payout
      </p>

      {/* 1. How much */}
      <div className="space-y-1.5">
        <StepLabel>Coins to withdraw</StepLabel>
        <input
          inputMode="numeric"
          value={amountText}
          spellCheck={false}
          onChange={(e) => {
            setAmountText(e.target.value.replace(/[^0-9]/g, ''));
            setFeedback(null);
          }}
          placeholder={String(MIN_WITHDRAW_COINS)}
          className={`w-full h-9 rounded px-2.5 bg-[var(--term-bg)] border text-[12px] font-mono font-bold text-[var(--term-strong)] placeholder:text-[var(--term-dim)] focus:outline-none transition-colors ${
            overspent || payout.belowFloor
              ? 'border-[var(--term-sell)]'
              : 'border-[var(--term-border)] focus:border-[var(--term-primary)]/50'
          }`}
        />
        <div className="flex gap-2">
          {QUICK_AMOUNTS.map((amount) => (
            <button
              key={amount}
              onClick={() => {
                sound.playClick();
                setAmountText(String(amount));
                setFeedback(null);
              }}
              className={`flex-1 h-7 rounded text-[10px] font-bold font-mono transition-colors cursor-pointer border ${
                payout.coins === amount
                  ? 'bg-[var(--term-raised-hi)] border-[var(--term-border-hi)] text-[var(--term-strong)]'
                  : 'bg-[var(--term-bg)] border-[var(--term-border)] text-[var(--term-muted)] hover:text-[var(--term-text)]'
              }`}
            >
              {amount.toLocaleString()}
            </button>
          ))}
          <button
            onClick={() => {
              sound.playClick();
              setAmountText(String(Math.max(0, coins)));
              setFeedback(null);
            }}
            className="flex-1 h-7 rounded text-[10px] font-bold font-mono transition-colors cursor-pointer border bg-[var(--term-bg)] border-[var(--term-border)] text-[var(--term-muted)] hover:text-[var(--term-text)]"
          >
            MAX
          </button>
        </div>
      </div>

      {/* 2. What it turns into */}
      <div className="space-y-1 p-2.5 rounded bg-[var(--term-bg)] border border-[var(--term-border)] font-mono text-[11px]">
        <div className="flex items-center justify-between text-[var(--term-soft)]">
          <span>Value</span>
          <span>{formatUsd(payout.grossUsd)}</span>
        </div>
        <div className="flex items-center justify-between text-[var(--term-sell)]">
          <span>Network fee</span>
          <span>−{formatUsd(payout.feeUsd)}</span>
        </div>
        <div className="flex items-center justify-between pt-1 mt-1 border-t border-[var(--term-border)] text-[var(--term-strong)] font-bold">
          <span>You receive</span>
          <span>{formatUsd(payout.netUsd)} {rail.symbol}</span>
        </div>
      </div>

      {/* 3. Which chain */}
      <div className="space-y-1.5">
        <StepLabel>Payout network</StepLabel>
        <div className="grid grid-cols-2 gap-2">
          {rails.map((entry) => {
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

      {/* 4. Where it goes */}
      <div className="space-y-1.5">
        <label htmlFor="withdraw-address" className="text-[10px] uppercase tracking-wider font-bold text-[var(--term-muted)]">
          Your {rail.network} address
        </label>
        <input
          id="withdraw-address"
          value={address}
          spellCheck={false}
          onChange={(e) => {
            setAddress(e.target.value.trim());
            setFeedback(null);
          }}
          placeholder={rail.id === 'usdt-trc20' ? 'T…' : '0x…'}
          className={`w-full h-9 rounded px-2.5 bg-[var(--term-bg)] border text-[11px] font-mono text-[var(--term-strong)] placeholder:text-[var(--term-dim)] focus:outline-none transition-colors ${
            addressError ? 'border-[var(--term-sell)]' : 'border-[var(--term-border)] focus:border-[var(--term-primary)]/50'
          }`}
        />
        {addressError && (
          <p className="text-[10px] font-mono text-[var(--term-sell)] flex items-start gap-1.5">
            <AlertCircle size={11} className="mt-0.5 shrink-0" />
            {addressError}
          </p>
        )}
        <p className="text-[10px] font-mono text-[var(--term-sell)] leading-snug">
          Check this address character by character. A payout that lands
          somewhere else cannot be reversed.
        </p>
      </div>

      <button
        onClick={() => void handleSubmit()}
        disabled={
          submitting ||
          payout.belowFloor ||
          overspent ||
          Boolean(addressError) ||
          address.trim().length === 0
        }
        className={`w-full h-9 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
          submitting ||
          payout.belowFloor ||
          overspent ||
          addressError ||
          address.trim().length === 0
            ? 'bg-[var(--term-raised)] text-[var(--term-dim)] cursor-not-allowed'
            : 'border border-[var(--term-primary)]/55 bg-[var(--term-primary)]/10 hover:bg-[var(--term-primary)]/18 text-[var(--term-strong)] cursor-pointer'
        }`}
      >
        {submitting ? (
          <>
            <Loader2 size={13} className="animate-spin" /> Escrowing coins…
          </>
        ) : (
          <>
            <ArrowDownLeft size={13} /> Withdraw {payout.coins.toLocaleString()} coins
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
          The coins leave your balance the moment you ask, so they cannot be
          spent twice. A refused payout puts them back.
        </p>
        <button
          onClick={() => void refresh()}
          disabled={syncing}
          title="Check payout status"
          className="shrink-0 h-7 w-7 rounded border border-[var(--term-border)] bg-[var(--term-raised)] text-[var(--term-muted)] hover:text-[var(--term-primary)] transition-colors cursor-pointer flex items-center justify-center disabled:cursor-not-allowed"
        >
          <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
        </button>
      </div>

      <WithdrawHistory withdrawals={withdrawals} />
    </div>
  );
}
