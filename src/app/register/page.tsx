'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Swords, UserPlus, Check, X, AlertCircle, ArrowLeft, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { getSupabase } from '@/lib/supabase/client';

const RegisterSchema = z
  .object({
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(16, 'Username must be at most 16 characters')
      .regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers, and underscores allowed'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
    termsAccepted: z.literal(true, {
      message: 'You must accept the Terms',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type RegisterFormValues = z.infer<typeof RegisterSchema>;

function computePasswordStrength(pwd: string): { score: number; label: string; color: string } {
  if (!pwd) return { score: 0, label: '', color: '' };
  let s = 0;
  if (pwd.length >= 8) s += 1;
  if (pwd.length >= 12) s += 1;
  if (/[A-Z]/.test(pwd)) s += 1;
  if (/[0-9]/.test(pwd)) s += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) s += 1;

  if (s <= 2) return { score: 1, label: 'Weak', color: 'bg-rose-500' };
  if (s <= 4) return { score: 2, label: 'Medium', color: 'bg-amber-400' };
  return { score: 3, label: 'Strong', color: 'bg-[var(--green)]' };
}

export default function RegisterPage() {
  const router = useRouter();
  const { setUser, user } = useAuthStore();
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      username: user?.isGuest ? '' : user?.username || '',
    },
  });

  const pwd = watch('password', '');
  const strength = computePasswordStrength(pwd);

  const onSubmit = async (data: RegisterFormValues) => {
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data: authData, error } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: {
            data: {
              username: data.username,
              display_name: data.username,
            },
          },
        });

        if (error) {
          setErrorMsg(error.message);
          setLoading(false);
          return;
        }

        if (authData.user) {
          if (authData.session) {
            setUser({
              id: authData.user.id,
              username: data.username,
              displayName: data.username,
              email: data.email,
              rating: 1200,
              riskRating: 1200,
              isGuest: false,
              role: 'user',
              createdAt: authData.user.created_at,
            });
            router.push('/play');
            return;
          } else {
            setSuccessMsg(
              'Account created! A confirmation email has been sent. Check your inbox to verify and sign in.'
            );
            setLoading(false);
            return;
          }
        }
      } else {
        // Fallback for offline local dev mode
        setUser({
          id: 'user_' + Math.random().toString(36).substring(2, 9),
          username: data.username,
          displayName: data.username,
          email: data.email,
          rating: 1200,
          riskRating: 1200,
          isGuest: false,
          role: 'user',
          createdAt: new Date().toISOString(),
        });
        router.push('/play');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg('Unexpected error: ' + msg);
    } finally {
      setLoading(false);
    }
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
      <div className="w-full max-w-4xl mx-auto flex items-center justify-between relative z-10">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Home</span>
        </Link>

        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          PIP DUEL REGISTRATION
        </span>
      </div>

      {/* Centered Registration UI (No Card Container) */}
      <main className="w-full max-w-sm mx-auto my-auto py-8 space-y-6 relative z-10">
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
            Create Account
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Sign up to access rated 1v1 duels and climb the community ladder
          </p>
        </div>

        {/* Error / Success Messages */}
        {errorMsg && (
          <div className="p-3 bg-[var(--down)]/10 border border-[var(--down)]/40 text-[var(--down)] rounded-xl text-xs flex items-center gap-2.5">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-[var(--green)]/15 border border-[var(--green)]/40 text-[var(--green)] rounded-xl text-xs flex items-center gap-2.5">
            <CheckCircle2 size={16} className="shrink-0 text-[var(--green)]" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Register Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
          {/* Username */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[var(--text-secondary)]">
              Trader Call-Sign
            </label>
            <input
              type="text"
              {...register('username')}
              placeholder="bullish_trader"
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none transition-colors"
            />
            {errors.username && (
              <p className="text-[var(--down)] text-xs mt-0.5">{errors.username.message}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[var(--text-secondary)]">
              Email Address
            </label>
            <input
              type="email"
              {...register('email')}
              placeholder="trader@forex.com"
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none transition-colors"
            />
            {errors.email && (
              <p className="text-[var(--down)] text-xs mt-0.5">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[var(--text-secondary)]">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                {...register('password')}
                placeholder="••••••••"
                className="w-full bg-[var(--surface-muted)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 pr-10 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {pwd && (
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 h-1 bg-[var(--ui-raised)] rounded-full overflow-hidden flex gap-0.5">
                  <div className={`h-full flex-1 ${strength.score >= 1 ? strength.color : 'bg-transparent'}`} />
                  <div className={`h-full flex-1 ${strength.score >= 2 ? strength.color : 'bg-transparent'}`} />
                  <div className={`h-full flex-1 ${strength.score >= 3 ? strength.color : 'bg-transparent'}`} />
                </div>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">{strength.label}</span>
              </div>
            )}
            {errors.password && (
              <p className="text-[var(--down)] text-xs mt-0.5">{errors.password.message}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[var(--text-secondary)]">
              Confirm Password
            </label>
            <input
              type="password"
              {...register('confirmPassword')}
              placeholder="••••••••"
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-2.5 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none transition-colors"
            />
            {errors.confirmPassword && (
              <p className="text-[var(--down)] text-xs mt-0.5">{errors.confirmPassword.message}</p>
            )}
          </div>

          {/* Terms checkbox */}
          <div className="pt-1">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[var(--text-muted)]">
              <input
                type="checkbox"
                {...register('termsAccepted')}
                className="mt-0.5 rounded border-[var(--border)] bg-[var(--surface-muted)] text-[var(--accent)] focus:ring-0 focus:ring-offset-0"
              />
              <span>
                I agree to the{' '}
                <Link href="/legal/terms" className="text-[var(--accent)] hover:underline">
                  Terms of Service
                </Link>{' '}
                and confirm I am 18+
              </span>
            </label>
            {errors.termsAccepted && (
              <p className="text-[var(--down)] text-xs mt-0.5">{errors.termsAccepted.message}</p>
            )}
          </div>

          {/* Submit Button: Landing Page Blue */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-[var(--accent)] hover:bg-[var(--accent-hi)] active:scale-[0.98] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition duration-150 cursor-pointer disabled:opacity-50 mt-2"
          >
            <UserPlus size={16} />
            <span>{loading ? 'Creating Trader Account...' : 'Complete Registration'}</span>
          </button>
        </form>

        {/* Login Link */}
        <div className="text-center text-xs text-[var(--text-muted)] pt-1">
          Already have an account?{' '}
          <Link href="/login" className="text-[var(--accent)] font-bold hover:underline ml-1">
            Sign in →
          </Link>
        </div>
      </main>

      {/* Bottom Footer */}
      <footer className="w-full text-center text-[11px] text-[var(--text-muted)] relative z-10">
        © 2026 Pip Duel. Free Virtual Trading Game.
      </footer>
    </div>
  );
}
