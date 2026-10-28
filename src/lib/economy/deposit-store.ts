/**
 * deposit-store.ts
 * Deposit state for the signed-in player: submit a TxID, watch it sit in
 * review, and pick up the credit when a reviewer approves it. Submitting never
 * touches the balance — the only path to coins is the admin RPC, which writes
 * the row and the wallet together.
 *
 * With no Supabase configured there is no reviewer to name an amount, so an
 * offline build just queues the claim locally and credits nothing — the money
 * flow only really works once a backend and a reviewer exist.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from '@/lib/auth/store';
import {
  fetchMyDeposits,
  isDepositBackendAvailable,
  saveCryptoDeposit,
} from '@/lib/supabase/wallet';
import {
  newDeposit,
  validateAsset,
  validateMemo,
  validateTxId,
} from './deposit';
import type { DepositSubmission } from './deposit';
import type { CryptoDeposit } from './types';

/** Receipts kept per device; older ones are dropped. */
const HISTORY_LIMIT = 20;

export interface SubmitResult {
  deposit: CryptoDeposit | null;
  error: string | null;
}

interface DepositState {
  deposits: CryptoDeposit[];
  /** File a claim. Rejects a hash the database already holds as pending or paid. */
  submit: (input: DepositSubmission) => Promise<SubmitResult>;
  /** Replace the local list with what the server has for this player. */
  sync: (playerId: string) => Promise<void>;
  clear: () => void;
}

export const useDepositStore = create<DepositState>()(
  persist(
    (set, get) => ({
      deposits: [],

      submit: async (input) => {
        const invalid =
          validateAsset(input.assetId) ??
          validateTxId(input.assetId, input.txid) ??
          validateMemo(input.assetId, input.memo ?? '');
        if (invalid) return { deposit: null, error: invalid };

        const user = useAuthStore.getState().user;
        if (!user) return { deposit: null, error: 'Sign in to deposit.' };
        if (user.isGuest) {
          return {
            deposit: null,
            error: 'Deposit needs a full account — register to keep your coins.',
          };
        }

        let deposit: CryptoDeposit;
        try {
          deposit = newDeposit(input);
        } catch (error) {
          return {
            deposit: null,
            error: error instanceof Error ? error.message : 'Deposit could not be started.',
          };
        }

        // Online the row has to exist before the player is told the claim was
        // filed: the database refuses a second claim of the same hash while a
        // pending or paid row holds it, and its answer is the only one that
        // counts. Nothing is added locally on a refusal, so a duplicate never
        // shows up as a pending deposit that the reviewer cannot see.
        if (isDepositBackendAvailable()) {
          const saved = await saveCryptoDeposit(user.id, deposit);
          if (!saved.ok) {
            return { deposit: null, error: saved.error ?? 'The claim could not be saved.' };
          }

          set({ deposits: [deposit, ...get().deposits].slice(0, HISTORY_LIMIT) });
          return { deposit, error: null };
        }

        // The reviewer is the only thing that can credit coins, and there is no
        // reviewer without a backend. Offline the claim is still queued — so the
        // UI reflects it — but it stays pending and moves no balance.
        const queued: CryptoDeposit = {
          ...deposit,
          note: 'Queued offline — will need review once a backend is configured.',
        };
        set({ deposits: [queued, ...get().deposits].slice(0, HISTORY_LIMIT) });
        return { deposit: queued, error: null };
      },

      sync: async (playerId) => {
        const server = await fetchMyDeposits(playerId);
        if (server === null) return;

        const before = get().deposits;
        set({ deposits: server.slice(0, HISTORY_LIMIT) });

        // Approval credits the wallet server-side, so a row that just turned
        // paid means the balance here is stale. Pull the authoritative figure
        // rather than pushing the local one over a credit we have not seen.
        const wasPaid = new Set(
          before.filter((entry) => entry.status === 'paid').map((entry) => entry.id),
        );
        const freshlyPaid = server.some(
          (entry) => entry.status === 'paid' && !wasPaid.has(entry.id),
        );
        if (freshlyPaid) {
          await useAuthStore.getState().syncFromSupabase(playerId).catch(() => {/* silent */});
        }
      },

      clear: () => set({ deposits: [] }),
    }),
    {
      name: 'pip-duel-deposit-storage',
      partialize: (state) => ({ deposits: state.deposits }),
    },
  ),
);
