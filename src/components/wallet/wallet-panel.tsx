'use client';

/**
 * wallet-panel.tsx
 * The body of the center column while a player is moving money. It is not an
 * overlay and it carries no chrome of its own — the page renders it inside the
 * same card frame that holds the Match Ticket, and the tab row above it is the
 * lobby's own, so opening the wallet is the same kind of move as opening Mail.
 *
 * Two halves share the screen because they are one question pointed in
 * opposite directions — how do coins arrive, and how do they leave. The panel
 * decides nothing about money; it only hosts the forms behind the stores.
 */
import { useAuthStore } from '@/lib/auth/store';
import { DepositForm } from './deposit-form';
import { WithdrawForm } from './withdraw-form';

export type WalletTab = 'deposit' | 'withdraw';

export const WALLET_TABS: { id: WalletTab; label: string }[] = [
  { id: 'deposit', label: 'Deposit' },
  { id: 'withdraw', label: 'Withdraw' },
];

export interface WalletPanelProps {
  coins: number;
  tab: WalletTab;
}

export function WalletPanel({ coins, tab }: WalletPanelProps) {
  const user = useAuthStore((s) => s.user);

  if (!user || user.isGuest) {
    return (
      <p className="text-xs text-[var(--term-soft)] leading-snug">
        Deposits and payouts are tied to a registered account, so money survives
        a new device. Guests can still play Demo for free — sign in to move
        coins in or out.
      </p>
    );
  }

  return tab === 'deposit' ? <DepositForm /> : <WithdrawForm coins={coins} />;
}
