'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X, Swords, Zap } from 'lucide-react';

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 glass border-b" style={{ borderColor: 'var(--border)' }} role="navigation" aria-label="Main navigation">
      <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group" aria-label="Pip Duel home">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center gradient-brand">
            <Swords size={16} className="text-white" />
          </div>
          <span className="font-bold text-base tracking-tight text-[var(--text)] group-hover:opacity-90 transition-opacity">
            Pip Duel
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          <NavLink href="/modes">Modes</NavLink>
          <NavLink href="/how-to-play">How to Play</NavLink>
          <NavLink href="/affiliate">Affiliate</NavLink>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-medium rounded-full transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            Login
          </Link>
          <Link
            href="/play"
            className="btn-primary text-sm px-5 py-2"
          >
            <Zap size={14} />
            Play Now
          </Link>
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden items-center gap-2">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-xl transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className="md:hidden border-t animate-slide-up"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="px-5 py-4 flex flex-col gap-1">
            
            <MobileNavLink href="/modes" onClick={() => setMobileOpen(false)}>Modes</MobileNavLink>
            <MobileNavLink href="/how-to-play" onClick={() => setMobileOpen(false)}>How to Play</MobileNavLink>
            <MobileNavLink href="/affiliate" onClick={() => setMobileOpen(false)}>Affiliate</MobileNavLink>
            <hr className="my-2 divider" />
            <MobileNavLink href="/login" onClick={() => setMobileOpen(false)}>Login</MobileNavLink>
            <Link
              href="/play"
              onClick={() => setMobileOpen(false)}
              className="btn-primary mt-1 text-sm py-3"
            >
              <Zap size={14} />
              Play Now
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-4 py-2 rounded-full text-sm font-medium transition-all"
      style={{ color: 'var(--text-secondary)' }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text)';
        (e.currentTarget as HTMLAnchorElement).style.background = 'var(--surface-muted)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
        (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
      }}
    >
      {children}
    </Link>
  );
}

function MobileNavLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="px-4 py-3 rounded-xl text-sm font-medium transition-colors"
      style={{ color: 'var(--text-secondary)' }}
    >
      {children}
    </Link>
  );
}
