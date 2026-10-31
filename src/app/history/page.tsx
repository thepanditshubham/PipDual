'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth/store';
import { History, Swords, Shield, Filter, Search, RotateCcw, ExternalLink } from 'lucide-react';

export default function HistoryPage() {
  const { history } = useAuthStore();
  const [filterMode, setFilterMode] = useState<'all' | 'standard' | 'risk'>('all');
  const [search, setSearch] = useState('');

  const filtered = history.filter((m) => {
    if (filterMode !== 'all' && m.mode !== filterMode) return false;
    if (search && !m.opponentName.toLowerCase().includes(search.toLowerCase()) && !m.room.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-5 py-12 md:py-20 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-8 animate-slide-up">
        <div>
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest mb-3"
            style={{
              background: 'rgba(231, 70, 148, 0.08)',
              border: '1px solid rgba(231, 70, 148, 0.25)',
              color: 'var(--pink)',
            }}
          >
            <History size={14} /> Match Archives
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-[var(--text)] tracking-tight">
            Duel <span className="gradient-text">History</span>
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            Review past battles, trade execution logs, and replay chart trajectories.
          </p>
        </div>

        <Link
          href="/play"
          className="btn-primary px-6 py-3 text-xs font-bold self-start md:self-auto flex items-center gap-2 shadow-lg"
        >
          <Swords size={15} /> New Match
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4 md:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex bg-[var(--surface-muted)] rounded-full border border-[var(--border)] p-1 text-xs uppercase w-full sm:w-auto">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-4 py-1.5 rounded-full font-bold transition-all cursor-pointer ${
              filterMode === 'all'
                ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-[var(--term-canvas)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            All Modes
          </button>
          <button
            onClick={() => setFilterMode('standard')}
            className={`px-4 py-1.5 rounded-full font-bold transition-all cursor-pointer ${
              filterMode === 'standard'
                ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-[var(--term-canvas)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            Standard
          </button>
          <button
            onClick={() => setFilterMode('risk')}
            className={`px-4 py-1.5 rounded-full font-bold transition-all cursor-pointer ${
              filterMode === 'risk'
                ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-[var(--term-canvas)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            Risk Duel
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by room or rival..."
            className="w-full bg-[var(--surface-muted)] border border-[var(--border)] rounded-full pl-9 pr-4 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--purple)] focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Match History Table */}
      {filtered.length === 0 ? (
        <div className="card p-14 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center mx-auto text-[var(--text-muted)]">
            <History size={32} />
          </div>
          <h3 className="text-xl font-bold text-[var(--text)]">No Matches Recorded</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
            You haven&apos;t completed any duels under this filter. Launch a match to start building your record.
          </p>
          <div className="pt-2">
            <Link href="/play" className="btn-primary px-6 py-2.5 text-xs font-bold inline-block">
              Start a Duel
            </Link>
          </div>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="p-4">Result</th>
                  <th className="p-4">Room</th>
                  <th className="p-4">Mode</th>
                  <th className="p-4">Opponent</th>
                  <th className="p-4 text-right">Your P&L</th>
                  <th className="p-4 text-right">Opponent P&L</th>
                  <th className="p-4 text-right">Max Drawdown</th>
                  <th className="p-4 text-right">Date</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--surface-muted)] transition-colors">
                    <td className="p-4 font-bold">
                      {item.won ? (
                        <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-[var(--up)]/10 text-[var(--up)] border border-[var(--up)]/30">
                          Victory
                        </span>
                      ) : item.isDraw ? (
                        <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-[var(--surface-muted)] text-[var(--text-secondary)] border border-[var(--border)]">
                          Draw
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-[var(--down)]/10 text-[var(--down)] border border-[var(--down)]/30">
                          Defeat
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-mono text-[var(--purple-light)] text-xs font-bold">
                      #{item.room}
                    </td>
                    <td className="p-4 uppercase text-xs text-[var(--text-secondary)] font-semibold">
                      {item.mode}
                    </td>
                    <td className="p-4 font-semibold text-[var(--text)]">
                      {item.opponentName} {item.opponentIsBot && <span className="text-xs text-[var(--text-muted)] font-normal">(Bot)</span>}
                    </td>
                    <td className={`p-4 text-right font-mono font-bold ${item.userPnl >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]'}`}>
                      {item.userPnl >= 0 ? '+' : ''}${item.userPnl.toFixed(2)}
                    </td>
                    <td className="p-4 text-right font-mono text-[var(--text-secondary)]">
                      ${item.opponentScore.toFixed(2)}
                    </td>
                    <td className="p-4 text-right font-mono text-[var(--down)] text-xs">
                      ${item.userDrawdown.toFixed(2)}
                    </td>
                    <td className="p-4 text-right text-xs text-[var(--text-muted)] font-mono">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-right">
                      <Link
                        href={`/play/${item.room}?mode=${item.mode}&opponent=bot`}
                        className="text-xs font-bold text-[var(--purple-light)] hover:text-[var(--text)] transition-colors inline-flex items-center gap-1"
                      >
                        Replay <RotateCcw size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
