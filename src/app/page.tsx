'use client';

import React from 'react';
import Link from 'next/link';
import { Swords, LogIn, Play, ArrowRight, UserPlus } from 'lucide-react';

export default function CleanLandingPage() {
  return (
    <div className="min-h-screen w-screen flex flex-col justify-between bg-[var(--ui-deep)] text-[var(--text)] selection:bg-[var(--accent)] selection:text-white relative overflow-hidden select-none">
      {/* Subtle ambient background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(0, 123, 255, 0.12) 0%, rgba(0, 200, 83, 0.04) 40%, transparent 70%)',
        }}
      />

      {/* Top minimal bar */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[var(--accent-active)] via-[var(--accent)] to-[var(--green)] flex items-center justify-center text-white">
            <Swords size={20} />
          </div>
          <span className="text-xl font-black tracking-wider text-[var(--text)]">
            PIP DUEL
          </span>
        </div>

        <Link
          href="/login"
          className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text)] bg-[var(--ui-panel)] hover:bg-[var(--ui-raised)] border border-[var(--ui-border-alt)] px-5 py-2.5 rounded-xl transition duration-150 flex items-center gap-2"
        >
          <LogIn size={14} className="text-[var(--accent)]" />
          <span>Log In</span>
        </Link>
      </header>

      {/* Centered Main Hero & Buttons */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center relative z-10 -mt-10">
        <div className="max-w-xl space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--accent)]">
            <Swords size={13} />
            <span>1v1 Virtual Trading Battles</span>
          </div>

          {/* Heading */}
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-tight text-[var(--text)]">
            Trade. Duel. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] via-[var(--accent-soft)] to-[var(--green)]">
              Win.
            </span>
          </h1>

          {/* Minimal Subtitle */}
          <p className="text-sm md:text-base text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
            Same chart. Sixty seconds. One winner. $10,000 virtual balance.
          </p>

          {/* Centered Main Buttons: Start Game & Log In */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/play"
              className="w-full sm:w-auto bg-[var(--accent)] hover:bg-[var(--accent-hi)] active:scale-[0.98] text-white font-extrabold text-base px-9 py-4 rounded-xl transition duration-150 flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <Play size={18} className="fill-white" />
              <span>Start Game</span>
            </Link>

            <Link
              href="/login"
              className="w-full sm:w-auto bg-[var(--ui-panel)] hover:bg-[var(--ui-raised)] border border-[var(--ui-border-alt)] text-[var(--text)] font-bold text-base px-8 py-4 rounded-xl transition duration-150 flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <LogIn size={18} className="text-[var(--accent)]" />
              <span>Log In</span>
            </Link>
          </div>

          {/* Minimal register link */}
          <div className="pt-2">
            <Link
              href="/register"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors inline-flex items-center gap-1"
            >
              <span>Don&apos;t have an account?</span>
              <span className="text-[var(--accent)] font-semibold hover:underline">Sign up free</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="w-full py-6 text-center text-xs text-[var(--text-muted)] relative z-10">
        <p>© 2026 Pip Duel. Virtual trading game — Demo is free to play. Live duels are staked with coins bought by crypto deposit and paid back out in USDT, so stake only what you can afford to lose.</p>
      </footer>
    </div>
  );
}
