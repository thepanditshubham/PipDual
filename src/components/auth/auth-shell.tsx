import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';

/**
 * Community links. Discord is env-driven: the pill is only rendered when an
 * invite exists, so the panel never ships a button that goes nowhere.
 */
const DISCORD_INVITE = process.env.NEXT_PUBLIC_DISCORD_INVITE?.trim();

const SOCIALS = [
  { label: 'Telegram', href: 'https://t.me/forexwala' },
  ...(DISCORD_INVITE ? [{ label: 'Discord', href: DISCORD_INVITE }] : []),
];

/**
 * The stage every account screen stands on.
 *
 * Two columns: a dark field holding a single line of copy in the bottom-left
 * corner, and a 500px form rail on the right. The left panel says the one thing
 * that matters before a stranger stakes money — that the market is shared, not
 * stacked — and then gets out of the way.
 */

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div data-auth className="auth-screen">
      {/* Backdrop — grid and two glows, all inert */}
      <div className="auth-bg-grid" aria-hidden="true" />
      <div className="auth-bg-glow auth-bg-glow--1" aria-hidden="true" />
      <div className="auth-bg-glow auth-bg-glow--2" aria-hidden="true" />

      {/* Brand column */}
      <div className="auth-left">
        <div className="auth-bg-grid auth-bg-grid--panel" aria-hidden="true" />
        <div className="auth-left-inner">
          <p className="auth-left-quote">
            Your opponent is watching
            <br />
            the same candles.
          </p>

          <p className="auth-left-sub">
            Both terminals read one synthetic series, so a duel is settled by how you read price —
            never by who saw it first.
          </p>

          <div className="auth-left-social">
            {SOCIALS.map((social) => (
              <a key={social.label} href={social.href} target="_blank" rel="noopener noreferrer">
                {social.label}
                <ArrowUpRight size={11} aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Form rail */}
      <div className="auth-right">
        <div className="auth-right-inner">
          <div className="auth-mobile-logo">
            <strong>PIP DUEL</strong>
            <span>Virtual Trading Battles</span>
          </div>
          {children}
        </div>
      </div>

      {/* CRT texture, same bands the lobby and marketing pages carry */}
      <div className="auth-scanlines" aria-hidden="true" />
    </div>
  );
}

/** The three-line greeting that sits above the tabs on every account screen. */
export function AuthWelcome({
  copy = 'Enter the arena, take a side, and settle it on one shared chart.',
}: {
  copy?: string;
}) {
  return (
    <div className="auth-welcome">
      <div className="auth-welcome-line auth-welcome-kicker">Welcome to</div>
      <div className="auth-welcome-line auth-welcome-title">THE ARENA</div>
      <div className="auth-welcome-line auth-welcome-copy">{copy}</div>
    </div>
  );
}
