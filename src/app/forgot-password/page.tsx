'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle2, Swords, AlertCircle } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';

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
    <div className="min-h-screen w-full bg-[var(--ui-deep)] text-[var(--text)] flex flex-col justify-between p-6 select-none relative overflow-hidden">
      {/* Subtle ambient background glow like landing page */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(0, 123, 255, 0.12) 0%, rgba(0, 200, 83, 0.04) 40%, transparent 70%)',
        }}
      />

      {/* Top bar: Back to Login */}
      <div className="w-full max-w-4xl mx-auto flex items-center justify-between relative z-10">
        <Link
          href="/login"
          className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Log In</span>
        </Link>

        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          PIP DUEL ACCOUNT RECOVERY
        </span>
      </div>

      {/* Centered Recovery UI (No Card Container) */}
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
            Reset Password
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Enter your account email to receive recovery instructions
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 bg-[var(--down)]/10 border border-[var(--down)]/40 text-[var(--down)] rounded-xl text-xs flex items-center gap-2.5">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {submitted ? (
          <div className="space-y-5 text-center pt-2">
            <div className="p-4 bg-[var(--green)]/10 border border-[var(--green)]/30 rounded-xl text-xs text-[var(--green)] flex flex-col items-center gap-2 text-center">
              <CheckCircle2 size={24} />
              <span className="leading-relaxed">
                If an account exists for <strong className="text-[var(--text)]">{email}</strong>, a password reset link has been dispatched to your inbox.
              </span>
            </div>
            <Link
              href="/login"
              className="w-full h-12 bg-[var(--accent)] hover:bg-[var(--accent-hi)] active:scale-[0.98] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition duration-150 cursor-pointer"
            >
              Return To Log In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                Account Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@forex.com"
                className="w-full bg-[var(--surface-muted)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-4 py-3 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[var(--accent)] hover:bg-[var(--accent-hi)] active:scale-[0.98] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition duration-150 cursor-pointer disabled:opacity-50"
            >
              <Mail size={16} />
              <span>{loading ? 'Sending Instructions...' : 'Send Recovery Link'}</span>
            </button>
          </form>
        )}

        {/* Back Link */}
        <div className="text-center text-xs text-[var(--text-muted)] pt-2">
          Remembered your password?{' '}
          <Link href="/login" className="text-[var(--accent)] font-bold hover:underline ml-1">
            Back to log in →
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
