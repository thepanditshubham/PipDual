'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Trophy, Shield, Swords, TrendingUp, Award, Flame, Calendar, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';

function PublicProfileContent() {
  const params = useParams();
  const username = (params.username as string) || 'trader';
  const { user, history } = useAuthStore();

  const isSelf = user?.username === username;

  // Derive stats (or display realistic baseline if visiting external user profile)
  const rating = isSelf ? user.rating : 1540;
  const riskRating = isSelf ? user.riskRating : 1490;
  const duelsCount = isSelf ? history.length : 68;
  const winsCount = isSelf ? history.filter((m) => m.won).length : 42;
  const winRate = duelsCount > 0 ? Math.round((winsCount / duelsCount) * 100) : 62;
  const bestTrade = isSelf
    ? Math.max(0, ...history.map((m) => m.userPnl))
    : 480.5;

  const badges = [
    { title: 'Top Gun', desc: 'Maintained >60% Win Rate across 20+ duels', icon: '🏆' },
    { title: 'Iron Shield', desc: 'Under $50 Max DD in 10 consecutive matches', icon: '🛡️' },
    { title: 'Quick Draw', desc: '5 consecutive wins in Standard Arena', icon: '⚡' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-5 py-12 md:py-20 space-y-10 animate-slide-up">
      <Link href="/leaderboard" className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors font-medium">
        <ArrowLeft size={14} /> Back to Leaderboard
      </Link>

      {/* Header Profile Card */}
      <div className="card p-8 flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
        <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-extrabold text-white shadow-lg border"
            style={{
              background: 'linear-gradient(315deg, var(--pink) 0%, var(--purple) 100%)',
              borderColor: 'rgba(231, 70, 148, 0.4)',
            }}
          >
            {username.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2.5 justify-center sm:justify-start">
              <h1 className="text-3xl font-extrabold text-[var(--text)] tracking-tight">{username}</h1>
              <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-[var(--surface-muted)] text-[var(--green-soft)] border border-[var(--border)]">
                PRO TRADER
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium">Pune, India 🇮🇳 • Member of Forexwala</p>
            <div className="flex items-center gap-2 mt-3 text-xs text-[var(--text-muted)] justify-center sm:justify-start font-medium">
              <Calendar size={14} /> Active duel competitor
            </div>
          </div>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end gap-2">
          <Link
            href={`/play?challenge=${username}`}
            className="btn-primary px-6 py-2.5 text-xs font-bold flex items-center gap-1.5 shadow-md"
          >
            <Swords size={15} /> Challenge Trader
          </Link>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-5 text-center">
          <span className="text-xs uppercase font-semibold text-[var(--text-secondary)] block mb-1">Standard Elo</span>
          <span className="text-3xl font-bold font-mono tabular-nums text-[var(--green-soft)]">{rating}</span>
          <span className="text-[10px] text-[var(--text-muted)] block mt-1">Ranked Ladder</span>
        </div>

        <div className="card p-5 text-center">
          <span className="text-xs uppercase font-semibold text-[var(--text-secondary)] block mb-1">Risk Elo</span>
          <span className="text-3xl font-bold font-mono tabular-nums text-[var(--purple-light)]">{riskRating}</span>
          <span className="text-[10px] text-[var(--text-muted)] block mt-1">Discipline Rating</span>
        </div>

        <div className="card p-5 text-center">
          <span className="text-xs uppercase font-semibold text-[var(--text-secondary)] block mb-1">Win Rate</span>
          <span className="text-3xl font-bold font-mono tabular-nums text-[var(--text)]">{winRate}%</span>
          <span className="text-[10px] text-[var(--text-muted)] block mt-1">{winsCount} Wins / {duelsCount} Duels</span>
        </div>

        <div className="card p-5 text-center">
          <span className="text-xs uppercase font-semibold text-[var(--text-secondary)] block mb-1">Best Trade</span>
          <span className="text-3xl font-bold font-mono tabular-nums text-[var(--up)]">+${Math.round(bestTrade)}</span>
          <span className="text-[10px] text-[var(--text-muted)] block mt-1">Virtual Profit</span>
        </div>
      </div>

      {/* Trader Badges */}
      <div className="space-y-4">
        <h2 className="text-2xl font-extrabold text-[var(--text)] flex items-center gap-2">
          <Award size={20} className="text-[var(--pink)]" /> Community Badges
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {badges.map((b) => (
            <div key={b.title} className="card p-5 space-y-1 hover:border-[var(--purple)]/50 transition-colors">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{b.icon}</span>
                <h3 className="font-bold text-[var(--text)] text-sm">{b.title}</h3>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed pl-8">{b.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-center text-xs text-[var(--text-muted)]">
        All rankings, metrics, and trades shown on this profile are strictly simulated and virtual. Not financial advice.
      </div>
    </div>
  );
}

export default function PublicProfilePage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-[var(--text-secondary)]">Loading Trader Profile...</div>}>
      <PublicProfileContent />
    </Suspense>
  );
}
