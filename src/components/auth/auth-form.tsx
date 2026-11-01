'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { getSupabase } from '@/lib/supabase/client';
import { ensureCoins } from '@/lib/supabase/wallet';
import { AuthShell, AuthWelcome } from '@/components/auth/auth-shell';

/**
 * Login and sign-up on one screen.
 *
 * The tabs are local state, not routes: switching swaps the mounted form in place
 * with no fetch and no transition, which is how the reference does it. The URL is
 * kept truthful with `history.replaceState` so `/login` and `/register` both stay
 * shareable and survive a reload — the swap is instant, the link is still real.
 *
 * Only one <form> is in the DOM at a time, so field ids never collide and a
 * password manager never sees two password inputs at once.
 */

const LoginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

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
    termsAccepted: z.literal(true, { message: 'You must accept the Terms' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type LoginValues = z.infer<typeof LoginSchema>;
type RegisterValues = z.infer<typeof RegisterSchema>;

function passwordStrength(pwd: string): { score: number; label: string; tone: string } {
  if (!pwd) return { score: 0, label: '', tone: '' };
  let s = 0;
  if (pwd.length >= 8) s += 1;
  if (pwd.length >= 12) s += 1;
  if (/[A-Z]/.test(pwd)) s += 1;
  if (/[0-9]/.test(pwd)) s += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) s += 1;
  if (s <= 2) return { score: 1, label: 'Weak', tone: 'weak' };
  if (s <= 4) return { score: 2, label: 'Medium', tone: 'medium' };
  return { score: 3, label: 'Strong', tone: 'strong' };
}

export function AuthForm({ initialMode }: { initialMode: 'login' | 'signup' }) {
  const router = useRouter();
  const { setUser, user } = useAuthStore();

  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loginForm = useForm<LoginValues>({ resolver: zodResolver(LoginSchema) });
  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { username: user?.isGuest ? '' : user?.username || '' },
  });

  const pwd = registerForm.watch('password', '');
  const strength = passwordStrength(pwd);

  // The OAuth callback forwards provider errors here as ?error=… — read once.
  useEffect(() => {
    const oauthError = new URLSearchParams(window.location.search).get('error');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (oauthError) setErrorMsg(oauthError);
  }, []);

  /** Swap the form in place and keep the address bar honest. */
  const switchMode = (next: 'login' | 'signup') => {
    setErrorMsg('');
    setSuccessMsg('');
    setMode(next);
    window.history.replaceState(null, '', next === 'login' ? '/login' : '/register');
  };

  const submitLogin = async (data: LoginValues) => {
    setErrorMsg('');
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        setErrorMsg('Authentication service is not configured. Please restart the dev server and try again. (Supabase env vars missing)');
        return;
      }

      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        const code = (error as { code?: string }).code ?? '';
        setErrorMsg(error.message + (code ? ` (${code})` : ''));
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
          // Profile fetch is optional
        }

        const username = profile?.username || userMeta.username || data.email.split('@')[0];
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
      }
    } catch (err) {
      setErrorMsg('Unexpected error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const submitRegister = async (data: RegisterValues) => {
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
          }
          setSuccessMsg('Account created! A confirmation email has been sent. Check your inbox to verify and sign in.');
          return;
        }
      } else {
        // Offline local dev fallback
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
      setErrorMsg('Unexpected error: ' + (err instanceof Error ? err.message : String(err)));
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
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
  };

  return (
    <AuthShell>
      <AuthWelcome />

      <div className="auth-tabs" role="tablist" aria-label="Account">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          onClick={() => switchMode('login')}
          className={`auth-tab${mode === 'login' ? ' auth-tab--active' : ''}`}
        >
          Login
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          onClick={() => switchMode('signup')}
          className={`auth-tab${mode === 'signup' ? ' auth-tab--active' : ''}`}
        >
          Sign Up
        </button>
      </div>

      {errorMsg && (
        <div className="auth-error" role="alert">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="auth-note" role="status">
          <CheckCircle2 size={12} aria-hidden="true" />
          <span>{successMsg}</span>
        </div>
      )}

      {mode === 'login' ? (
        <form onSubmit={loginForm.handleSubmit(submitLogin)} noValidate>
          <div className="auth-form-section">
            <div className="auth-form-section-label">Account</div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="email">
                <Mail size={10} aria-hidden="true" />
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="trader@example.com"
                className={`auth-input${loginForm.formState.errors.email ? ' auth-input--error' : ''}`}
                {...loginForm.register('email')}
              />
              {loginForm.formState.errors.email && (
                <p className="auth-hint auth-hint--error" role="alert">
                  {loginForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="password">
                <Lock size={10} aria-hidden="true" />
                Password
              </label>
              <div className="auth-input-wrap">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`auth-input${loginForm.formState.errors.password ? ' auth-input--error' : ''}`}
                  {...loginForm.register('password')}
                />
                <button
                  type="button"
                  className="auth-pw-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {loginForm.formState.errors.password && (
                <p className="auth-hint auth-hint--error" role="alert">
                  {loginForm.formState.errors.password.message}
                </p>
              )}
            </div>
          </div>

          <div className="auth-options">
            <label className="auth-remember">
              <input type="checkbox" name="remember" />
              Remember me
            </label>
            <Link href="/forgot-password" className="auth-forgot">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            className={`auth-submit${loading ? ' auth-submit--loading' : ''}`}
            disabled={loading}
          >
            {loading ? 'Signing in' : 'Sign In'}
          </button>
        </form>
      ) : (
        <form onSubmit={registerForm.handleSubmit(submitRegister)} noValidate>
          <div className="auth-form-section">
            <div className="auth-form-section-label">Account</div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="username">
                <User size={10} aria-hidden="true" />
                Trader Call-Sign
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="min. 3 characters"
                className={`auth-input${registerForm.formState.errors.username ? ' auth-input--error' : ''}`}
                {...registerForm.register('username')}
              />
              {registerForm.formState.errors.username && (
                <p className="auth-hint auth-hint--error" role="alert">
                  {registerForm.formState.errors.username.message}
                </p>
              )}
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="signup-email">
                <Mail size={10} aria-hidden="true" />
                Email Address
              </label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={`auth-input${registerForm.formState.errors.email ? ' auth-input--error' : ''}`}
                {...registerForm.register('email')}
              />
              <p className="auth-hint">A confirmation link is sent to this address</p>
              {registerForm.formState.errors.email && (
                <p className="auth-hint auth-hint--error" role="alert">
                  {registerForm.formState.errors.email.message}
                </p>
              )}
            </div>
          </div>

          <div className="auth-form-section">
            <div className="auth-form-section-label">Security</div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="signup-password">
                <Lock size={10} aria-hidden="true" />
                Password
              </label>
              <div className="auth-input-wrap">
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="min. 8 characters"
                  className={`auth-input${registerForm.formState.errors.password ? ' auth-input--error' : ''}`}
                  {...registerForm.register('password')}
                />
                <button
                  type="button"
                  className="auth-pw-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {pwd && (
                <>
                  <div className="auth-strength">
                    {[1, 2, 3].map((step) => (
                      <div
                        key={step}
                        className={`auth-strength-bar${
                          strength.score >= step ? ` auth-strength-bar--${strength.tone}` : ''
                        }`}
                      />
                    ))}
                  </div>
                  <div className="auth-strength-label">{strength.label}</div>
                </>
              )}
              {registerForm.formState.errors.password && (
                <p className="auth-hint auth-hint--error" role="alert">
                  {registerForm.formState.errors.password.message}
                </p>
              )}
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="confirmPassword">
                <Lock size={10} aria-hidden="true" />
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat password"
                className={`auth-input${registerForm.formState.errors.confirmPassword ? ' auth-input--error' : ''}`}
                {...registerForm.register('confirmPassword')}
              />
              {registerForm.formState.errors.confirmPassword && (
                <p className="auth-hint auth-hint--error" role="alert">
                  {registerForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>
          </div>

          <label className="auth-terms">
            <input type="checkbox" {...registerForm.register('termsAccepted')} />
            <span>
              I agree to the <Link href="/legal/terms">Terms of Service</Link> and confirm I am 18+
            </span>
          </label>
          {registerForm.formState.errors.termsAccepted && (
            <p className="auth-hint auth-hint--error" role="alert">
              {registerForm.formState.errors.termsAccepted.message}
            </p>
          )}

          <button
            type="submit"
            className={`auth-submit${loading ? ' auth-submit--loading' : ''}`}
            disabled={loading}
          >
            {loading ? 'Creating account' : 'Create Account'}
          </button>
        </form>
      )}

      <div className="auth-divider">
        <span>or</span>
      </div>

      <button type="button" className="auth-google" onClick={handleGoogleLogin}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
        </svg>
        <span>Continue with Google</span>
      </button>

      <div className="auth-footer">
        © 2026 Pip Duel · <Link href="/legal/privacy">Privacy</Link> ·{' '}
        <Link href="/legal/terms">Terms</Link> · Support
      </div>
    </AuthShell>
  );
}
