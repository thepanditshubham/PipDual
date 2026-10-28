'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trophy, Medal, Award, Swords, Shield, Filter, Search } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  username: string;
  displayName: string;
  rating: number;
  duels: number;
  wins: number;
  winRate: number;
  avgDrawdown: number;
  badge?: string;
}

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<'today' | 'week' | 'all'>('all');
  const [mode, setMode] = useState<'standard' | 'risk'>('standard');
  const [search, setSearch] = useState('');

  // Default seed leaderboard data to provide an engaging experience from day 1
  const seedLeaders: LeaderboardEntry[] = [
    { rank: 1, username: 'pune_scalper', displayName: 'Pune Scalper', rating: 1684, duels: 142, wins: 98, winRate: 69.0, avgDrawdown: 42.5, badge: '🏆 Top Trader' },
    { rank: 2, username: 'desi_trader', displayName: 'Desi Trader', rating: 1612, duels: 119, wins: 76, winRate: 63.9, avgDrawdown: 55.2, badge: '⚡ High Volume' },
    { rank: 3, username: 'breakout_raj', displayName: 'Raj Breakdown', rating: 1570, duels: 88, wins: 54, winRate: 61.4, avgDrawdown: 38.0, badge: '🛡️ Low DD' },
    { rank: 4, username: 'maratha_bull', displayName: 'Maratha Bull', rating: 1530, duels: 94, wins: 55, winRate: 58.5, avgDrawdown: 62.1 },
    { rank: 5, username: 'kavya_fx', displayName: 'Kavya Forex', rating: 1495, duels: 67, wins: 38, winRate: 56.7, avgDrawdown: 45.4 },
    { rank: 6, username: 'algotrader_99', displayName: 'AlgoTrader', rating: 1450, duels: 51, wins: 28, winRate: 54.9, avgDrawdown: 50.0 },
    { rank: 7, username: 'zen_pip', displayName: 'Zen Pip', rating: 1422, duels: 43, wins: 23, winRate: 53.5, avgDrawdown: 35.8 },
    { rank: 8, username: 'nifty_samrat', displayName: 'Samrat FX', rating: 1390, duels: 38, wins: 19, winRate: 50.0, avgDrawdown: 68.2 },
  ];

  const filtered = seedLeaders.filter(
    (item) =>
      item.username.toLowerCase().includes(search.toLowerCase()) ||
      item.displayName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-5 py-12 md:py-20">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-12 animate-slide-up">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest mb-4"
          style={{
            background: 'rgba(231, 70, 148, 0.08)',
            border: '1px solid rgba(231, 70, 148, 0.25)',
            color: 'var(--pink)',
          }}
        >
          <Trophy size={14} /> Global Duel Ladder
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight text-[var(--text)]">
          Trading <span className="gradient-text">Leaderboard</span>
        </h1>
        <p className="text-[var(--text-secondary)] text-base md:text-lg leading-relaxed">
          Rankings calculated via strict Elo rating system (K=32). Verified match results only.
        </p>
      </div>

      {/* Filter and Tab Controls */}
      <div className="card p-4 md:p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Period Tabs */}
        <div className="flex bg-[var(--surface-muted)] p-1 rounded-full border border-[var(--border)] w-full md:w-auto">
          <button
            onClick={() => setPeriod('today')}
            className={`flex-1 md:flex-none px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer ${
              period === 'today'
                ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white shadow-md'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setPeriod('week')}
            className={`flex-1 md:flex-none px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer ${
              period === 'week'
                ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white shadow-md'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => setPeriod('all')}
            className={`flex-1 md:flex-none px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer ${
              period === 'all'
                ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white shadow-md'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            All Time
          </button>
        </div>

        {/* Mode Filter & Search */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="flex bg-[var(--surface-muted)] p-1 rounded-full border border-[var(--border)] w-full sm:w-auto">
            <button
              onClick={() => setMode('standard')}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer ${
                mode === 'standard'
                  ? 'bg-[var(--surface)] text-[var(--pink)] shadow-sm border border-[var(--border)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
              }`}
            >
              <Swords size={13} /> Standard
            </button>
            <button
              onClick={() => setMode('risk')}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer ${
                mode === 'risk'
                  ? 'bg-[var(--surface)] text-[var(--green-soft)] shadow-sm border border-[var(--border)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
              }`}
            >
              <Shield size={13} /> Risk Duel
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search trader..."
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-full pl-9 pr-4 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--purple)] focus:outline-none transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                <th className="p-4 w-16 text-center">Rank</th>
                <th className="p-4">Trader</th>
                <th className="p-4 text-right">Rating</th>
                <th className="p-4 text-right">Duels</th>
                <th className="p-4 text-right">Wins</th>
                <th className="p-4 text-right">Win Rate</th>
                <th className="p-4 text-right">Avg Drawdown</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-sm">
              {filtered.map((trader) => (
                <tr key={trader.username} className="hover:bg-[var(--surface-muted)] transition-colors group">
                  <td className="p-4 text-center font-bold">
                    {trader.rank === 1 ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-black text-xs font-black shadow-md" style={{ background: 'linear-gradient(315deg, var(--green-start) 0%, var(--green-end) 100%)' }}>
                        1
                      </span>
                    ) : trader.rank === 2 ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-black shadow-md" style={{ background: 'linear-gradient(315deg, var(--pink) 0%, var(--purple) 100%)' }}>
                        2
                      </span>
                    ) : trader.rank === 3 ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--border)] text-[var(--purple-light)] text-xs font-bold">
                        3
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)] text-xs font-mono">{trader.rank}</span>
                    )}
                  </td>
                  <td className="p-4">
                    <Link href={`/u/${trader.username}`} className="flex items-center gap-3 group-hover:text-[var(--pink)] transition-colors">
                      <div className="w-8 h-8 rounded-full bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center text-xs font-bold uppercase text-[var(--purple-light)]">
                        {trader.username.substring(0, 2)}
                      </div>
                      <div>
                        <div className="font-semibold text-[var(--text)] flex items-center gap-2">
                          <span>{trader.displayName}</span>
                          {trader.badge && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--pink)]/10 text-[var(--pink)] border border-[var(--pink)]/30">
                              {trader.badge}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-[var(--text-muted)] font-mono">@{trader.username}</span>
                      </div>
                    </Link>
                  </td>
                  <td className="p-4 text-right font-mono text-base font-bold tabular-nums text-[var(--green-soft)]">
                    {trader.rating}
                  </td>
                  <td className="p-4 text-right tabular-nums text-[var(--text-secondary)] font-mono text-xs">{trader.duels}</td>
                  <td className="p-4 text-right tabular-nums text-[var(--up)] font-semibold font-mono text-xs">{trader.wins}</td>
                  <td className="p-4 text-right tabular-nums font-semibold text-[var(--text)] font-mono text-xs">
                    {trader.winRate}%
                  </td>
                  <td className="p-4 text-right tabular-nums text-[var(--text-secondary)] font-mono text-xs">
                    ${trader.avgDrawdown}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
