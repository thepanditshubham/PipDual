'use client';

import Link from 'next/link';
import { Swords, Home, AlertTriangle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-5 text-center animate-slide-up">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border"
        style={{
          background: 'rgba(231, 70, 148, 0.1)',
          borderColor: 'rgba(231, 70, 148, 0.3)',
          color: 'var(--pink)',
        }}
      >
        <AlertTriangle size={32} />
      </div>
      <h1 className="text-6xl md:text-8xl font-black gradient-text mb-2 tracking-tight">404</h1>
      <h2 className="text-2xl md:text-3xl font-extrabold text-[var(--text)] mb-3">Out of Bounds</h2>
      <p className="text-sm text-[var(--text-secondary)] max-w-md mb-8 leading-relaxed">
        The chart you&apos;re looking for doesn&apos;t exist or has moved. Head back to base or jump straight into a duel.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/play" className="btn-primary px-7 py-3 text-sm font-bold flex items-center justify-center gap-2">
          <Swords size={17} /> Play Now
        </Link>
        <Link
          href="/"
          className="px-7 py-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text)] text-sm font-semibold flex items-center justify-center gap-2 hover:border-[var(--purple)] transition-colors"
        >
          <Home size={17} /> Back Home
        </Link>
      </div>
    </div>
  );
}
