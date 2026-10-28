/**
 * withdraw-store.ts
 * Payout state for the signed-in player. Unlike a deposit, a withdrawal takes
 * coins the moment it is requested — they leave the wallet inside the Postgres
 * function that queues the payout, so the same coins cannot be spent on a Live
 * entry while an admin decides. Rejection is the only way they come back.
 *
 * With no Supabase configured there is no one to pay and no one to approve, so
 * an offline build escrows locally and marks the row as auto-settled. That
 * branch is dev convenience, not a second production path.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from '@/lib/auth/store';
import {
  isDepositBackendAvailable,
  fetchMyWithdrawals,
  requestCryptoWithdraw,
} from '@/lib/supabase/wallet';
import { newWithdrawRequest, validateWithdraw } from './withdraw';
import type { NewWithdrawInput } from './withdraw';
import type { WithdrawRequest } from './types';

/** Payouts kept per device; older ones are dropped. */
const HISTORY_LIMIT = 20;

export interface WithdrawResult {
  withdrawal: WithdrawRequest | null;
  error: string | null;
  /** True only on an offline build, where nothing can actually be sent. */
  autoSettled: boolean;
}

interface WithdrawState {
  withdrawals: WithdrawRequest[];
  request: (input: NewWithdrawInput) => Promise<WithdrawResult>;
  /** Replace the local list with what the server has for this player. */
  sync: (playerId: string) => Promise<void>;
  clear: () => void;
}

export const useWithdrawStore = create<WithdrawState>()(
  persist(
    (set, get) => ({
      withdrawals: [],

      request: async (input) => {
        const auth = useAuthStore.getState();
        const user = auth.user;
        if (!user) return { withdrawal: null, error: 'Sign in to withdraw.', autoSettled: false };
        if (user.isGuest) {
          return {
            withdrawal: null,
            error: 'Withdrawal needs a full account — register to move money out.',
            autoSettled: false,
          };
        }

        const invalid = validateWithdraw(
          input.coins,
          input.assetId,
          input.address,
          user.virtualBalance ?? 0,
          input.memo ?? ''
        );
        if (invalid) return { withdrawal: null, error: invalid, autoSettled: false };

        let draft: WithdrawRequest;
        try {
          draft = newWithdrawRequest(input);
        } catch (error) {
          return {
            withdrawal: null,
            error: error instanceof Error ? error.message : 'Withdrawal could not be started.',
            autoSettled: false,
          };
        }

        if (!isDepositBackendAvailable()) {
          // No queue and no payer: escrow locally and be honest about it.
          const local: WithdrawRequest = {
            ...draft,
            status: 'paid',
            note: 'Auto-settled — no backend configured, nothing was sent',
            reviewedAt: new Date().toISOString(),
          };
          if (!useAuthStore.getState().spendCoins(local.coins)) {
            return { withdrawal: null, error: 'Balance changed — try again.', autoSettled: false };
          }
          set({ withdrawals: [local, ...get().withdrawals].slice(0, HISTORY_LIMIT) });
          return { withdrawal: local, error: null, autoSettled: true };
        }

        const { id, error } = await requestCryptoWithdraw(user.id, {
          coins: draft.coins,
          assetId: draft.assetId,
          address: draft.address,
          memo: draft.memo,
        });
        if (error) return { withdrawal: null, error, autoSettled: false };

        const escrowed: WithdrawRequest = { ...draft, id: id ?? draft.id, playerId: user.id };
        set({ withdrawals: [escrowed, ...get().withdrawals].slice(0, HISTORY_LIMIT) });

        // The RPC already moved the coins. Drop them locally too so the wallet
        // cannot be spent twice in the moment before the authoritative pull.
        useAuthStore.getState().spendCoins(escrowed.coins);
        await useAuthStore.getState().syncFromSupabase(user.id).catch(() => {/* silent */});

        return { withdrawal: escrowed, error: null, autoSettled: false };
      },

      sync: async (playerId) => {
        const server = await fetchMyWithdrawals(playerId);
        if (server === null) return;

        const before = get().withdrawals;
        set({ withdrawals: server.slice(0, HISTORY_LIMIT) });

        // A rejection refunds the escrow server-side, so a row that just turned
        // rejected means the local balance is stale and too low. Pull it back.
        const wasReturned = new Set(
          before.filter((entry) => entry.status === 'rejected').map((entry) => entry.id),
        );
        const freshlyReturned = server.some(
          (entry) => entry.status === 'rejected' && !wasReturned.has(entry.id),
        );
        if (freshlyReturned) {
          await useAuthStore.getState().syncFromSupabase(playerId).catch(() => {/* silent */});
        }
      },

      clear: () => set({ withdrawals: [] }),
    }),
    {
      name: 'pip-duel-withdraw-storage',
      partialize: (state) => ({ withdrawals: state.withdrawals }),
    },
  ),
);
