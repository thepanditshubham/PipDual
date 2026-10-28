'use client';

import Link from 'next/link';
import { Swords, ExternalLink } from 'lucide-react';

export function Footer() {
  return (
    <footer
      className="mt-auto border-t"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      role="contentinfo"
    >
      <div className="max-w-7xl mx-auto px-5 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">

          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center gradient-brand">
                <Swords size={16} className="text-white" />
              </div>
              <span className="font-bold text-base tracking-tight text-[var(--text)]">Pip Duel</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              A free trading battle game by the Forexwala community. Learn risk management through play.
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Pune, India 🇮🇳</p>
          </div>

          {/* Game */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Game</h3>
            <div className="flex flex-col gap-2">
              <FooterLink href="/modes">Game Modes</FooterLink>
              <FooterLink href="/how-to-play">How to Play</FooterLink>
              <FooterLink href="/leaderboard">Leaderboard</FooterLink>
              <FooterLink href="/play">Play Now</FooterLink>
            </div>
          </div>

          {/* Legal */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Legal</h3>
            <div className="flex flex-col gap-2">
              <FooterLink href="/legal/terms">Terms of Service</FooterLink>
              <FooterLink href="/legal/privacy">Privacy Policy</FooterLink>
              <FooterLink href="/legal/disclaimer">Disclaimer</FooterLink>
            </div>
          </div>

          {/* Community */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Community</h3>
            <div className="flex flex-col gap-2">
              <FooterLink href="https://t.me/forexwala" external>Telegram</FooterLink>
              <FooterLink href="https://youtube.com/@forexwala" external>YouTube</FooterLink>
              <FooterLink href="https://instagram.com/forexwala" external>Instagram</FooterLink>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="mt-10 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-xs text-center sm:text-left" style={{ color: 'var(--text-muted)' }}>
            © 2025 Forexwala. All rights reserved.
          </p>
          <span
            className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{
              background: 'rgba(231, 70, 148, 0.1)',
              border: '1px solid rgba(231, 70, 148, 0.2)',
              color: 'var(--pink)',
            }}
            role="alert"
          >
            Virtual money only — not financial advice
          </span>
        </div>

        {/* TradingView attribution */}
        <div className="mt-4 text-center">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Charts powered by{' '}
            <a
              href="https://www.tradingview.com/lightweight-charts/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-[var(--text)]"
            >
              TradingView Lightweight Charts™
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  children,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const cls = 'text-sm flex items-center gap-1 transition-colors';
  const style = { color: 'var(--text-secondary)' };

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
        style={style}
        onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text)')}
        onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)')}
      >
        {children}
        <ExternalLink size={11} className="opacity-50" />
      </a>
    );
  }

  return (
    <Link
      href={href}
      className={cls}
      style={style}
      onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text)')}
      onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)')}
    >
      {children}
    </Link>
  );
}
