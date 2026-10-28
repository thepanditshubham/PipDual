'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MailCheck, RefreshCw, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';

export default function VerifyEmailPage() {
  const { user } = useAuthStore();
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);
  const [sentMessage, setSentMessage] = useState(false);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || !user?.email) return;
    setResending(true);
    try {
      const { getSupabase } = await import('@/lib/supabase/client');
      const supabase = getSupabase();
      if (supabase) {
        await supabase.auth.resend({
          type: 'signup',
          email: user.email,
          options: {
            emailRedirectTo: `${window.location.origin}/api/auth/callback`,
          },
        });
      }
      setSentMessage(true);
      setCooldown(60);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-5 py-16 animate-slide-up">
      <div className="w-full max-w-md card p-8 md:p-10 space-y-6 text-center">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-2 mx-auto border"
          style={{
            background: 'rgba(231, 70, 148, 0.1)',
            borderColor: 'rgba(231, 70, 148, 0.3)',
            color: 'var(--pink)',
          }}
        >
          <MailCheck size={32} />
        </div>

        <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--text)] tracking-tight">
          Verify Your Email
        </h1>

        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          We&apos;ve sent an activation link to{' '}
          <span className="text-[var(--text)] font-semibold">{user?.email || 'your email'}</span>. Please click the link to confirm your account and safeguard your Elo rating.
        </p>

        {sentMessage && (
          <div className="p-3.5 bg-[var(--green)]/10 border border-[var(--green)]/30 rounded-xl text-[var(--green)] text-xs">
            A fresh verification email has been sent to your inbox.
          </div>
        )}

        <div className="space-y-3 pt-2">
          <button
            onClick={handleResend}
            disabled={cooldown > 0 || resending}
            className="w-full py-3 px-4 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text)] text-xs font-semibold flex items-center justify-center gap-2 hover:border-[var(--purple)] transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={resending ? 'animate-spin' : ''} />
            {cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend Verification Email'}
          </button>

          <Link
            href="/play"
            className="w-full btn-primary py-3 px-4 text-xs font-bold flex items-center justify-center gap-2"
          >
            Go to Play Lobby <ArrowRight size={16} />
          </Link>
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          Did not receive the email? Check your spam/junk folder.
        </p>
      </div>
    </div>
  );
}
