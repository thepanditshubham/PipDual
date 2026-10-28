import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile, MatchHistoryItem } from './types';
import { ensureCoins, fetchCoins, upsertCoins } from '@/lib/supabase/wallet';

interface AuthState {
  user: UserProfile | null;
  history: MatchHistoryItem[]
  setUser: (user: UserProfile | null) => void;
  loginAsGuest: () => UserProfile;
  logout: () => void;
  recordMatch: (match: MatchHistoryItem) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  /** Credit arena coins (deposits, pot payouts) and persist the balance. */
  addCoins: (amount: number) => number;
  /**
   * Debit coins for a Live entry. Refuses to overdraw, so a stake can never
   * push the wallet negative when two clients settle the same match.
   */
  spendCoins: (amount: number) => boolean;
  /** Re-hydrate the coin balance from Supabase (call on mount). */
  syncFromSupabase: (playerId: string) => Promise<void>;
}

const GUEST_KEY = 'pip_duel_guest_id';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      history: [],

      setUser: (user) => set({ user }),

      loginAsGuest: () => {
        const existing = get().user;
        if (existing && existing.isGuest) {
          return existing;
        }

        let guestId = '';
        if (typeof window !== 'undefined') {
          guestId = localStorage.getItem(GUEST_KEY) || '';
          if (!guestId) {
            guestId = 'guest_' + Math.random().toString(36).substring(2, 9);
            localStorage.setItem(GUEST_KEY, guestId);
          }
        } else {
          guestId = 'guest_' + Math.random().toString(36).substring(2, 9);
        }

        const guestUser: UserProfile = {
          id: guestId,
          username: guestId,
          displayName: 'Guest Trader',
          rating: 1200,
          riskRating: 1200,
          isGuest: true,
          role: 'user',
          virtualBalance: 0,
          createdAt: new Date().toISOString(),
        };

        set({ user: guestUser });

        // Adopt the stored guest wallet, creating the Supabase record on first run
        ensureCoins(guestId)
          .then((stored) => {
            const current = get().user;
            if (stored === null || !current || current.id !== guestId) return;
            set({ user: { ...current, virtualBalance: stored } });
          })
          .catch(() => {/* silent */});

        return guestUser;
      },

      logout: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(GUEST_KEY);
        }
        set({ user: null });
      },

      recordMatch: (match) => {
        const { user, history } = get();
        const updatedHistory = [match, ...history];

        let updatedUser = user;
        if (user && !match.opponentIsBot) {
          const isStandard = match.mode === 'standard';
          const currentRating = isStandard ? user.rating : user.riskRating;
          const delta = match.won ? 16 : match.isDraw ? 0 : -16;
          const nextRating = Math.max(100, currentRating + delta);

          updatedUser = {
            ...user,
            rating: isStandard ? nextRating : user.rating,
            riskRating: !isStandard ? nextRating : user.riskRating,
          };
        }

        set({ history: updatedHistory, user: updatedUser });
      },

      updateProfile: (updates) => {
        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, ...updates } });
        }
      },

      addCoins: (amount) => {
        const { user } = get();
        if (!user) return 0;
        // Balance lives in Supabase; never credit on top of a stale local default.
        const base = user.virtualBalance ?? 0;
        const next = Math.max(0, base + amount);
        set({ user: { ...user, virtualBalance: next } });
        upsertCoins(user.id, next).catch(() => {/* silent */});
        return next;
      },

      spendCoins: (amount) => {
        const { user } = get();
        if (!user) return false;
        const cost = Math.max(0, Math.floor(amount));
        const base = user.virtualBalance ?? 0;
        if (base < cost) return false;
        const next = base - cost;
        set({ user: { ...user, virtualBalance: next } });
        upsertCoins(user.id, next).catch(() => {/* silent */});
        return true;
      },

      /** Pull the authoritative coin balance from Supabase into local state. */
      syncFromSupabase: async (playerId: string) => {
        const remoteCoins = await fetchCoins(playerId);
        if (remoteCoins === null) {
          // First sight of this player — write the zero row so later reads stick.
          await ensureCoins(playerId).catch(() => {/* silent */});
          return;
        }

        const { user } = get();
        if (!user) return;
        set({ user: { ...user, virtualBalance: remoteCoins } });
      },
    }),
    {
      name: 'pip-duel-auth-storage',
    }
  )
);
