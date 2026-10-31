'use client';

import { useEffect, useRef } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import { touchProfilePresence } from '@/lib/supabase/presence';
import { useAuthStore } from '@/lib/auth/store';

interface ProfileRow {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  rating: number | null;
  risk_rating: number | null;
  role: 'user' | 'admin' | null;
}

/**
 * Mounts once at the root level.
 * Listens for Supabase auth state changes and syncs the session into
 * the Zustand auth store.
 *
 * A session only says who is signed in; the callsign and role live in
 * public.profiles. Reading them back on hydration means a role granted in
 * Supabase shows up after a reload, not only after the next sign-in.
 */
export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const isGuest = useAuthStore((s) => s.user?.isGuest ?? false);
  // getSession() and the SIGNED_IN event both fire on a fresh login; one
  // profile read is enough for both.
  const hydratedRef = useRef<{ id: string; at: number } | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    const applySession = async (sessionUser: SupabaseUser) => {
      const now = Date.now();
      const last = hydratedRef.current;
      if (last && last.id === sessionUser.id && now - last.at < 5000) return;
      hydratedRef.current = { id: sessionUser.id, at: now };

      let profile: ProfileRow | null = null;
      try {
        const { data } = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url, rating, risk_rating, role')
          .eq('id', sessionUser.id)
          .maybeSingle();
        profile = (data as ProfileRow | null) ?? null;
      } catch {
        // The profile is optional; the session still signs the player in.
      }

      const current = useAuthStore.getState().user;
      const sameAccount = current?.id === sessionUser.id && !current.isGuest;

      setUser({
        id: sessionUser.id,
        username:
          profile?.username ??
          (sameAccount ? current?.username : undefined) ??
          sessionUser.email?.split('@')[0] ??
          sessionUser.id.substring(0, 8),
        displayName:
          profile?.display_name ??
          sessionUser.user_metadata?.full_name ??
          sessionUser.user_metadata?.name ??
          sessionUser.email?.split('@')[0] ??
          'Trader',
        email: sessionUser.email ?? undefined,
        avatarUrl:
          profile?.avatar_url ??
          sessionUser.user_metadata?.avatar_url ??
          sessionUser.user_metadata?.picture ??
          undefined,
        rating: profile?.rating ?? 1200,
        riskRating: profile?.risk_rating ?? 1200,
        isGuest: false,
        role: profile?.role ?? 'user',
        // Keep an in-flight local balance; the play page refreshes it anyway.
        virtualBalance: sameAccount ? current?.virtualBalance : undefined,
        createdAt: sessionUser.created_at,
      });
    };

    // Hydrate from the persisted session (covers reloads and OAuth redirects).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) void applySession(session.user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        return;
      }
      if (event === 'SIGNED_IN' && session?.user) {
        void applySession(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Presence heartbeat: refreshes profile_details.last_seen_at so a public
  // profile can show an honest online window. Guests never hit the table.
  useEffect(() => {
    if (!currentUserId || isGuest) return;
    void touchProfilePresence(currentUserId);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void touchProfilePresence(currentUserId);
    }, 120_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void touchProfilePresence(currentUserId);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentUserId, isGuest]);

  return <>{children}</>;
}
