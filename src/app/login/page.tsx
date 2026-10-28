'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Swords, LogIn, AlertCircle, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { getSupabase } from '@/lib/supabase/client';
import { ensureCoins } from '@/lib/supabase/wallet';

const LoginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof LoginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // The OAuth callback forwards provider errors here as ?error=… — read it
  // once on mount; the URL is external state React cannot derive from props.
  useEffect(() => {
    const oauthError = new URLSearchParams(window.location.search).get('error');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (oauthError) setErrorMsg(oauthError);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setErrorMsg('');
    setLoading(true);

    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });

        if (error) {
          const code = (error as { code?: string }).code ?? '';
          setErrorMsg(error.message + (code ? ` (${code})` : ''));
          setLoading(false);
          return;
        }

        if (authData.user) {
          const userMeta = authData.user.user_metadata || {};
          let profile = null;

          try {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', authData.user.id)
              .single();
            profile = profileData;
          } catch {
            // Profile fetch optional fallback
          }

          const username = profile?.username || userMeta.username || data.email.split('@')[0];
          // Coins are the only currency: read (and create) the wallet row.
          const coins = await ensureCoins(authData.user.id);
          setUser({
            id: authData.user.id,
            username,
            displayName: profile?.display_name || userMeta.display_name || username,
            email: data.email,
            rating: profile?.rating ?? 1200,
            riskRating: profile?.risk_rating ?? 1200,
            isGuest: false,
            role: profile?.role || 'user',
            virtualBalance: coins ?? 0,
            createdAt: authData.user.created_at,
          });
          router.push('/play');
          return;
        }
      } else {
        setErrorMsg('Authentication service is not configured. Please restart the dev server and try again. (Supabase env vars missing)');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg('Unexpected error: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setErrorMsg('Authentication service not configured. Please check Supabase environment variables.');
      return;
    }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
  };

  return (
    <div className="min-h-screen w-full bg-[var(--ui-deep)] text-[var(--text)] flex flex-col justify-between p-6 select-none relative overflow-hidden">
      {/* Subtle ambient background glow like landing page */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(0, 123, 255, 0.12) 0%, rgba(0, 200, 83, 0.04) 40%, transparent 70%)',
        }}
      />

      {/* Top bar: Back to Home */}
      <div className="w-full max-w-4xl mx-auto flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Home</span>
        </Link>

        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          PIP DUEL BATTLE ARENA
        </span>
      </div>

      {/* Centered Login UI (No Card Container) */}
      <main className="w-full max-w-sm mx-auto my-auto py-8 space-y-6">
        {/* Header / Brand */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[var(--accent-active)] via-[var(--accent)] to-[var(--green)] flex items-center justify-center text-white">
              <Swords size={20} />
            </div>
            <span className="font-black text-2xl tracking-wider text-[var(--text)]">
              PIP DUEL
            </span>
          </Link>

          <h1 className="text-2xl font-black text-[var(--text)] tracking-tight">
            Log In
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Enter your credentials to enter the trading battle arena
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 bg-[var(--down)]/10 border border-[var(--down)]/40 text-[var(--down)] rounded-xl text-xs flex items-center gap-2.5">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--text-secondary)]">
              Email Address
            </label>
            <input
              type="email"
              {...register('email')}
              placeholder="trader@forex.com"
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none transition-colors"
            />
            {errors.email && (
              <p className="text-[var(--down)] text-xs mt-1">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-[var(--accent)] hover:underline transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                {...register('password')}
                placeholder="••••••••"
                className="w-full bg-[var(--surface-muted)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 pr-10 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-[var(--down)] text-xs mt-1">{errors.password.message}</p>
            )}
          </div>

          {/* Primary Submit Button: Landing Page Blue */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-[var(--accent)] hover:bg-[var(--accent-hi)] active:scale-[0.98] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition duration-150 cursor-pointer disabled:opacity-50"
          >
            <LogIn size={16} />
            <span>{loading ? 'Authenticating...' : 'Log In'}</span>
          </button>
        </form>

        {/* Divider */}
        <div className="relative flex items-center justify-center py-1">
          <div className="border-t border-[var(--border)] w-full" />
          <span className="bg-[var(--ui-deep)] px-3 text-[11px] text-[var(--text-muted)] font-semibold tracking-wider uppercase absolute">
            or continue with
          </span>
        </div>

        {/* Alternative Login Actions */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full h-11 bg-[var(--surface-muted)] hover:bg-[var(--ui-raised)] border border-[var(--border)] rounded-xl text-[var(--text)] text-xs font-semibold flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Google</span>
          </button>
        </div>

        {/* Registration Link */}
        <div className="text-center text-xs text-[var(--text-muted)] pt-2">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-[var(--accent)] font-bold hover:underline ml-1">
            Sign up free →
          </Link>
        </div>
      </main>

      {/* Bottom Footer */}
      <footer className="w-full text-center text-[11px] text-[var(--text-muted)]">
        © 2026 Pip Duel. Free Virtual Trading Game.
      </footer>
    </div>
  );
}
