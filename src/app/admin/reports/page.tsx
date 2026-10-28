'use client';

import Link from 'next/link';
import { AlertOctagon, TrendingUp, ShieldAlert } from 'lucide-react';

export default function AdminReportsPage() {
  const dailyCounts = [
    { date: 'Today', duels: 142, botMatches: 65, flagged: 0 },
    { date: 'Yesterday', duels: 128, botMatches: 54, flagged: 1 },
    { date: '2 days ago', duels: 115, botMatches: 48, flagged: 0 },
    { date: '3 days ago', duels: 98, botMatches: 40, flagged: 2 },
  ];

  const flaggedMatches = [
    {
      id: 'flag_01',
      matchId: 'm_88291a',
      reason: 'Inhumanly fast action pattern (3 actions within 1 tick)',
      timestamp: 'Today, 14:22',
      status: 'Excluded from ranking',
    },
    {
      id: 'flag_02',
      matchId: 'm_77192b',
      reason: 'Repeated pairing >5 times within 1 hour between accounts',
      timestamp: 'Yesterday, 19:04',
      status: 'Under review',
    },
  ];

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest mb-3"
            style={{
              background: 'rgba(231, 70, 148, 0.08)',
              border: '1px solid rgba(231, 70, 148, 0.25)',
              color: 'var(--pink)',
            }}
          >
            <ShieldAlert size={14} /> Integrity & Compliance
          </div>
          <h1 className="text-3xl font-extrabold text-[var(--text)] tracking-tight">
            Match <span className="gradient-text">Reports</span>
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            System health, daily volume metrics, anti-cheat audit log, and flagged submissions.
          </p>
        </div>

        <Link
          href="/admin/segments"
          className="px-6 py-2.5 bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text)] text-xs font-bold hover:border-[var(--purple)] transition-colors"
        >
          Manage Segments →
        </Link>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-5">
          <span className="text-xs uppercase font-semibold text-[var(--text-secondary)] block mb-1">Today&apos;s Duels</span>
          <span className="text-3xl font-extrabold text-[var(--text)] tabular-nums">142</span>
          <span className="text-[10px] text-[var(--up)] block mt-1">+12% vs last week</span>
        </div>

        <div className="card p-5">
          <span className="text-xs uppercase font-semibold text-[var(--text-secondary)] block mb-1">Active Rooms</span>
          <span className="text-3xl font-extrabold text-[var(--green-soft)] tabular-nums">8</span>
          <span className="text-[10px] text-[var(--text-muted)] block mt-1">Concurrently trading</span>
        </div>

        <div className="card p-5">
          <span className="text-xs uppercase font-semibold text-[var(--text-secondary)] block mb-1">Bot Duels</span>
          <span className="text-3xl font-extrabold text-[var(--purple-light)] tabular-nums">65</span>
          <span className="text-[10px] text-[var(--text-muted)] block mt-1">Practice drills</span>
        </div>

        <div className="card p-5">
          <span className="text-xs uppercase font-semibold text-[var(--text-secondary)] block mb-1">Flags (Anti-Cheat)</span>
          <span className="text-3xl font-extrabold text-[var(--down)] tabular-nums">2</span>
          <span className="text-[10px] text-[var(--text-muted)] block mt-1">Action anomalies detected</span>
        </div>
      </div>

      {/* Flagged Matches Audit Table */}
      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-[var(--down)]">
          <AlertOctagon size={18} /> Flagged Suspicious Matches
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] uppercase text-[var(--text-muted)] font-semibold tracking-wider">
                <th className="p-3">Match ID</th>
                <th className="p-3">Detection Reason</th>
                <th className="p-3">Logged At</th>
                <th className="p-3">Sanction Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {flaggedMatches.map((f) => (
                <tr key={f.id} className="hover:bg-[var(--surface-muted)] transition-colors">
                  <td className="p-3 font-mono text-[var(--purple-light)] font-bold">{f.matchId}</td>
                  <td className="p-3 font-medium text-[var(--text)]">{f.reason}</td>
                  <td className="p-3 text-[var(--text-secondary)] font-mono">{f.timestamp}</td>
                  <td className="p-3 text-[var(--down)] uppercase text-[11px] font-semibold">{f.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Match Aggregation */}
      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-[var(--text)]">
          <TrendingUp size={18} className="text-[var(--green-soft)]" /> Daily Duel Activity Log
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] uppercase text-[var(--text-muted)] font-semibold tracking-wider">
                <th className="p-3">Period</th>
                <th className="p-3 text-right">Human Duels</th>
                <th className="p-3 text-right">Bot Matches</th>
                <th className="p-3 text-right">Anomalies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {dailyCounts.map((d) => (
                <tr key={d.date} className="hover:bg-[var(--surface-muted)] transition-colors">
                  <td className="p-3 font-semibold text-[var(--text)]">{d.date}</td>
                  <td className="p-3 text-right font-mono text-[var(--green-soft)] font-bold">{d.duels}</td>
                  <td className="p-3 text-right font-mono text-[var(--text-secondary)]">{d.botMatches}</td>
                  <td className="p-3 text-right font-mono text-[var(--down)]">{d.flagged}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
