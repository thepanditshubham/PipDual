'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Mail, Send } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { AuthShell } from '@/components/auth/auth-shell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setErrorMsg('');
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) {
          setErrorMsg(error.message);
          setLoading(false);
          return;
        }
      }
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      {submitted ? (
        <>
          <div className="auth-otp-header">
            <div className="auth-otp-icon">
              <CheckCircle2 size={20} className="text-[var(--fin-green)]" />
            </div>
            <div className="auth-otp-title">Check your inbox</div>
            <div className="auth-otp-subtitle">A recovery link was dispatched to</div>
            <div className="auth-otp-email">{email}</div>
          </div>

          <p className="auth-info" style={{ marginBottom: 16 }}>
            If an account exists for this address, the link will sign you in to choose a new
            password. It expires in one hour.
          </p>

          <Link href="/login" className="auth-submit" style={{ display: 'block', textAlign: 'center' }}>
            Return to log in
          </Link>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 12, textAlign: 'center' }}>
            <div style={{ color: 'var(--fin-orange)', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              RESET PASSWORD
            </div>
            <div style={{ color: 'var(--fin-dim)', fontSize: 10 }}>
              Enter your email address to receive a reset link
            </div>
          </div>

          {errorMsg && (
            <div className="auth-error" role="alert">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label className="auth-label" htmlFor="email">
                <Mail size={10} aria-hidden="true" />
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@example.com"
                className="auth-input"
              />
            </div>

            <button
              type="submit"
              className={`auth-submit${loading ? ' auth-submit--loading' : ''}`}
              disabled={loading}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Send size={13} aria-hidden="true" />
                {loading ? 'Sending link' : 'Send Reset Link'}
              </span>
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
