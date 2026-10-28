'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, KeyRound, Lock } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { AuthShell } from '@/components/auth/auth-shell';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          setErrorMsg(error.message);
          setLoading(false);
          return;
        }
      }
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch {
      setErrorMsg('Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      {success ? (
        <>
          <div className="auth-otp-header">
            <div className="auth-otp-icon">
              <CheckCircle2 size={20} className="text-[var(--fin-green)]" />
            </div>
            <div className="auth-otp-title">Password updated</div>
            <div className="auth-otp-subtitle">Redirecting you to sign in…</div>
          </div>
          <Link href="/login" className="auth-submit" style={{ display: 'block', textAlign: 'center' }}>
            Go to login
          </Link>
        </>
      ) : (
        <>
          <div className="auth-otp-header">
            <div className="auth-otp-icon">
              <KeyRound size={20} className="text-[var(--fin-orange)]" />
            </div>
            <div className="auth-otp-title">Set new password</div>
            <div className="auth-otp-subtitle">Choose a new password for your account</div>
          </div>

          {errorMsg && (
            <div className="auth-error" role="alert">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label className="auth-label" htmlFor="password">
                <Lock size={10} aria-hidden="true" />
                New Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min. 8 characters"
                className="auth-input"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="confirmPassword">
                <Lock size={10} aria-hidden="true" />
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="auth-input"
              />
            </div>

            <button
              type="submit"
              className={`auth-submit${loading ? ' auth-submit--loading' : ''}`}
              disabled={loading}
            >
              {loading ? 'Updating password' : 'Save New Password'}
            </button>
          </form>

          <div className="auth-back">
            <Link href="/login">
              <ArrowLeft size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />
              Back to login
            </Link>
          </div>
        </>
      )}

      <div className="auth-footer">
        © 2026 Pip Duel · <Link href="/legal/privacy">Privacy</Link> ·{' '}
        <Link href="/legal/terms">Terms</Link> · Support
      </div>
    </AuthShell>
  );
}
