'use client';

import { useState } from 'react';
import Link from 'next/link';
import { generateFixtures } from '@/lib/engine/fixtures';
import type { MarketSegment } from '@/lib/engine/types';
import { ShieldCheck, Plus } from 'lucide-react';

export default function AdminSegmentsPage() {
  const [segments, setSegments] = useState<MarketSegment[]>(() => generateFixtures().slice(0, 15));
  const [titleInput, setTitleInput] = useState('');
  const [tagInput, setTagInput] = useState('trend_up');
  const [diffInput, setDiffInput] = useState<'easy' | 'medium' | 'hard'>('medium');

  const handleToggle = (id: string) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const handleAddSegment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput) return;

    const newSeg: MarketSegment = {
      id: `synthetic-${Date.now().toString().slice(-4)}`,
      title: titleInput,
      asset: 'Custom Synthetic',
      tags: [tagInput],
      difficulty: diffInput,
      ticks: new Array(122).fill(1000).map((p, i) => p + Math.sin(i / 5) * 15),
      source: 'admin_upload',
      licenseNote: 'Forexwala Community Generated',
      enabled: true,
    };

    setSegments([newSeg, ...segments]);
    setTitleInput('');
  };

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
            <ShieldCheck size={14} /> Admin Access Only
          </div>
          <h1 className="text-3xl font-extrabold text-[var(--text)] tracking-tight">
            Market Segments <span className="gradient-text">Manager</span>
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            Upload, tag, enable/disable, and preview market chart scenarios for duel matchmaking.
          </p>
        </div>

        <Link
          href="/admin/reports"
          className="px-6 py-2.5 bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text)] text-xs font-bold hover:border-[var(--purple)] transition-colors"
        >
          View Match Reports →
        </Link>
      </div>

      {/* Add New Segment Form */}
      <div className="card p-6 md:p-8 space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-[var(--text)]">
          <Plus size={18} className="text-[var(--green-soft)]" /> Register New Market Segment
        </h2>

        <form onSubmit={handleAddSegment} className="grid sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1.5">Title</label>
            <input
              type="text"
              required
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="e.g. Morning London Breakout"
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] px-4 py-2.5 text-xs text-[var(--text)] focus:border-[var(--purple)] focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1.5">Tag</label>
            <select
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] px-4 py-2.5 text-xs text-[var(--text)] focus:border-[var(--purple)] focus:outline-none transition-colors cursor-pointer"
            >
              <option value="trend_up">Trend Up</option>
              <option value="trend_down">Trend Down</option>
              <option value="range">Range / Consolidation</option>
              <option value="spike">Volatility Spike</option>
              <option value="whipsaw">Whipsaw</option>
              <option value="gap">Price Gap</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-[var(--text-secondary)] mb-1.5">Difficulty</label>
            <select
              value={diffInput}
              onChange={(e) => setDiffInput(e.target.value as 'easy' | 'medium' | 'hard')}
              className="w-full bg-[var(--surface-muted)] border border-[var(--border)] px-4 py-2.5 text-xs text-[var(--text)] focus:border-[var(--purple)] focus:outline-none transition-colors cursor-pointer"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <button
            type="submit"
            className="btn-primary py-2.5 px-5 text-xs font-bold"
          >
            Add Segment
          </button>
        </form>
      </div>

      {/* Segments List Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] uppercase text-[var(--text-muted)] font-semibold tracking-wider">
                <th className="p-4">ID</th>
                <th className="p-4">Title</th>
                <th className="p-4">Tag</th>
                <th className="p-4">Difficulty</th>
                <th className="p-4">Source</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {segments.map((seg) => (
                <tr key={seg.id} className="hover:bg-[var(--surface-muted)] transition-colors">
                  <td className="p-4 font-mono text-[var(--purple-light)] font-bold">{seg.id}</td>
                  <td className="p-4 font-semibold text-[var(--text)]">{seg.title}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-0.5 bg-[var(--surface-muted)] text-[var(--green-soft)] border border-[var(--border)] uppercase text-[10px] font-semibold">
                      {seg.tags[0]}
                    </span>
                  </td>
                  <td className="p-4 uppercase text-[var(--text-secondary)] font-medium">{seg.difficulty}</td>
                  <td className="p-4 font-mono text-[var(--text-muted)]">{seg.source}</td>
                  <td className="p-4">
                    {seg.enabled ? (
                      <span className="px-2.5 py-0.5 bg-[var(--up)]/10 text-[var(--up)] border border-[var(--up)]/30 uppercase text-[10px] font-bold">
                        Active
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 bg-[var(--surface-muted)] text-[var(--text-muted)] border border-[var(--border)] uppercase text-[10px] font-medium">
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleToggle(seg.id)}
                      className={`px-3 py-1 text-[10px] font-bold uppercase transition-all cursor-pointer ${
                        seg.enabled
                          ? 'bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--down)] hover:border-[var(--down)]/40'
                          : 'bg-[var(--up)] text-[var(--term-canvas)] font-extrabold'
                      }`}
                    >
                      {seg.enabled ? 'Disable' : 'Enable'}
                    </button>
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
