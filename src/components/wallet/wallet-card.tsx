'use client';

/**
 * wallet-card.tsx
 * The wallet's face in the right column: what the balance is, what it is worth,
 * and the two things it can be used for. Nothing else lives here — addresses,
 * QR codes, TxID fields and review history are a click away, in the center
 * column, because the lobby is an arena and not a cashier's counter.
 */
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { useDepositStore } from '@/lib/economy/deposit-store';
import { useWithdrawStore } from '@/lib/economy/withdraw-store';
import { COINS_PER_USD } from '@/lib/economy/config';
import { formatUsd } from '@/lib/economy/deposit';
import { sound } from '@/components/terminal/sound';
import type { WalletTab } from './wallet-panel';

export interface WalletCardProps {
  coins: number;
  /** Opens the money flow in the center column, on the half that was asked for. */
  onOpen: (tab: WalletTab) => void;
}

export function WalletCard({ coins, onOpen }: WalletCardProps) {
  const user = useAuthStore((s) => s.user);
  const pendingDeposits = useDepositStore(
    (s) => s.deposits.filter((entry) => entry.status === 'pending').length
  );
  const pendingPayouts = useWithdrawStore(
    (s) => s.withdrawals.filter((entry) => entry.status === 'pending').length
  );

  const openAt = (tab: WalletTab) => {
    sound.playClick();
    onOpen(tab);
  };

  const inReview = pendingDeposits + pendingPayouts;

  return (
    <div className="bg-[var(--term-surface)]/70 backdrop-blur-md border border-[var(--term-border)] rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--term-strong)]">
          <img src="/coin.png" alt="Coin" className="w-4 h-4 object-contain shrink-0" />
          Wallet
        </span>
        <span className="text-right leading-none">
          <span className="block text-lg font-mono font-bold text-[var(--term-strong)]">
            {coins.toLocaleString()}
          </span>
          <span className="block text-[10px] font-mono text-[var(--term-dim)] mt-1">
            ≈ {formatUsd(coins / COINS_PER_USD)}
          </span>
        </span>
      </div>

      {!user || user.isGuest ? (
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/register"
            className="h-9 rounded border border-[var(--term-primary)]/55 bg-[var(--term-primary)]/10 hover:bg-[var(--term-primary)]/18 text-[var(--term-strong)] text-xs font-bold flex items-center justify-center transition-colors"
          >
            Register
          </Link>
          <Link
            href="/login"
            className="h-9 rounded bg-[var(--term-raised)] hover:bg-[var(--term-raised-hi)] border border-[var(--term-border)] text-[var(--term-text)] text-xs font-bold flex items-center justify-center transition-colors"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => openAt('deposit')}
            className="h-9 rounded border border-[var(--term-primary)]/55 bg-[var(--term-primary)]/10 hover:bg-[var(--term-primary)]/18 text-[var(--term-strong)] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowUpRight size={13} /> Deposit
          </button>
          <button
            onClick={() => openAt('withdraw')}
            className="h-9 rounded bg-[var(--term-raised)] hover:bg-[var(--term-raised-hi)] border border-[var(--term-border)] text-[var(--term-text)] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowDownLeft size={13} /> Withdraw
          </button>
        </div>
      )}

      <p
        className={`text-[10px] font-mono leading-snug ${
          inReview > 0 ? 'text-[var(--term-amber)]' : 'text-[var(--term-dim)]'
        }`}
      >
        {inReview > 0
          ? `${inReview} transfer${inReview > 1 ? 's' : ''} awaiting review.`
          : !user || user.isGuest
            ? 'Money follows a registered account — guests play Demo free.'
            : `$1 = ${COINS_PER_USD} coins · payouts send USDT.`}
      </p>
    </div>
  );
}
