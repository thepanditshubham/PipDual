'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Home, Swords, AlertOctagon } from 'lucide-react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled app error:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-5 text-center animate-slide-up">
      <div className="w-16 h-16 rounded-2xl bg-[var(--down)]/10 border border-[var(--down)]/40 flex items-center justify-center text-[var(--down)] mb-6">
        <AlertOctagon size={32} />
      </div>
      <h1 className="text-3xl md:text-4xl font-extrabold text-[var(--text)] mb-3 tracking-tight">Something Went Wrong</h1>
      <p className="text-sm text-[var(--text-secondary)] max-w-md mb-8 leading-relaxed">
        A system glitch occurred on the trading floor. Try resetting the terminal or return home.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => reset()}
          className="btn-primary px-6 py-3 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
        >
          <RefreshCw size={16} /> Try Again
        </button>
        <Link
          href="/play"
          className="btn-secondary px-6 py-3 text-sm font-bold flex items-center justify-center gap-2"
        >
          <Swords size={16} /> Play Duel
        </Link>
        <Link
          href="/"
          className="px-6 py-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text)] text-sm font-semibold flex items-center justify-center gap-2 hover:border-[var(--purple)] transition-colors"
        >
          <Home size={16} /> Home
        </Link>
      </div>
    </div>
  );
}
