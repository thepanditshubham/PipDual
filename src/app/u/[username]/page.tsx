'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Swords, Calendar, ArrowLeft, History as HistoryIcon } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { getSupabase } from '@/lib/supabase/client';

interface RemoteProfile {
  rating: number;
  riskRating: number;
  matches: number;
  wins: number;
}

function PublicProfileContent() {
  const params = useParams();
  const username = (params.username as string) || 'trader';
  const { user, history } = useAuthStore();
  const [remote, setRemote] = useState<RemoteProfile | null>(null);
  const [notFound, setNotFound] = useState(false);

  const isSelf = user?.username === username;

  // Real public data: the profiles row is public and the leaderboard view
  // exposes only the aggregate match/win counts.
  useEffect(() => {
    if (isSelf) return;
    const sb = getSupabase();
    if (!sb) return;

    let cancelled = false;

    void (async () => {
      const { data: profile } = await sb
        .from('profiles')
        .select('id, rating, risk_rating')
        .eq('username', username.toLowerCase())
        .maybeSingle();

      if (cancelled) return;
      if (!profile) {
        setNotFound(true);
        return;
      }

      const { data: board } = await sb
        .from('progress_leaderboard')
        .select('matches, wins')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (cancelled) return;
      setRemote({
        rating: (profile.rating as number) ?? 1200,
        riskRating: (profile.risk_rating as number) ?? 1200,
        matches: (board?.matches as number) ?? 0,
        wins: (board?.wins as number) ?? 0,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [username, isSelf]);

  const duelCount = isSelf ? history.length : remote?.matches ?? 0;
  const winsCount = isSelf ? history.filter((m) => m.won).length : remote?.wins ?? 0;
  const winRate = duelCount > 0 ? Math.round((winsCount / duelCount) * 100) : null;
  const rating = isSelf ? user.rating : remote?.rating ?? null;
  const riskRating = isSelf ? user.riskRating : remote?.riskRating ?? null;

  const recent = isSelf ? history.slice(0, 10) : [];
  const loading = !isSelf && !remote && !notFound;

  const stat = (value: number | string | null, suffix = '') =>
    value === null ? '—' : `${value}${suffix}`;

  return (
    <div className="max-w-5xl mx-auto px-5 py-12 md:py-20 space-y-10 animate-slide-up">
      <Link href="/leaderboard" className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors font-medium">
        <ArrowLeft size={14} /> Back to Leaderboard
      </Link>

      {/* Header Profile Card */}
      <div className="card p-8 flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
        <div className="text-center sm:text-left">
          <div>
            <div className="flex items-center gap-2.5 justify-center sm:justify-start">
              <h1 className="text-3xl font-extrabold text-[var(--text)] tracking-tight">{username}</h1>
              <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-[var(--surface-muted)] text-[var(--green-soft)] border border-[var(--border)]">
                TRADER
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium">Member of Forexwala</p>
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
          <span className="text-3xl font-bold font-mono tabular-nums text-[var(--green-soft)]">{stat(rating)}</span>
          <span className="text-[10px] text-[var(--text-muted)] block mt-1">Ranked Ladder</span>
        </div>

        <div className="card p-5 text-center">
          <span className="text-xs uppercase font-semibold text-[var(--text-secondary)] block mb-1">Risk Elo</span>
          <span className="text-3xl font-bold font-mono tabular-nums text-[var(--purple-light)]">{stat(riskRating)}</span>
          <span className="text-[10px] text-[var(--text-muted)] block mt-1">Discipline Rating</span>
        </div>

        <div className="card p-5 text-center">
          <span className="text-xs uppercase font-semibold text-[var(--text-secondary)] block mb-1">Win Rate</span>
          <span className="text-3xl font-bold font-mono tabular-nums text-[var(--text)]">{stat(winRate, '%')}</span>
          <span className="text-[10px] text-[var(--text-muted)] block mt-1">{winsCount} Wins / {duelCount} Duels</span>
        </div>

        <div className="card p-5 text-center">
          <span className="text-xs uppercase font-semibold text-[var(--text-secondary)] block mb-1">Duels</span>
          <span className="text-3xl font-bold font-mono tabular-nums text-[var(--text)]">{stat(duelCount)}</span>
          <span className="text-[10px] text-[var(--text-muted)] block mt-1">Settled matches</span>
        </div>
      </div>

      {/* Match History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold text-[var(--text)] flex items-center gap-2">
            <HistoryIcon size={20} className="text-[var(--pink)]" /> Match History
          </h2>
          {isSelf && recent.length > 0 && (
            <Link href="/history" className="text-xs font-bold text-[var(--purple-light)] hover:text-[var(--text)] transition-colors">
              View all
            </Link>
          )}
        </div>

        {isSelf ? (
          recent.length === 0 ? (
            <div className="card p-10 text-center space-y-3">
              <p className="text-sm font-semibold text-[var(--text)]">No matches recorded yet</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Finish a duel and it will appear here.
              </p>
              <Link href="/play" className="btn-primary px-6 py-2.5 text-xs font-bold inline-block">
                Start a Duel
              </Link>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      <th className="p-4">Result</th>
                      <th className="p-4">Mode</th>
                      <th className="p-4">Opponent</th>
                      <th className="p-4 text-right">Your P&amp;L</th>
                      <th className="p-4 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {recent.map((item) => (
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
                        <td className="p-4 uppercase text-xs text-[var(--text-secondary)] font-semibold">
                          {item.mode}
                        </td>
                        <td className="p-4 font-semibold text-[var(--text)]">
                          {item.opponentName}
                          {item.opponentIsBot && (
                            <span className="text-xs text-[var(--text-muted)] font-normal"> (Bot)</span>
                          )}
                        </td>
                        <td className={`p-4 text-right font-mono font-bold ${item.userPnl >= 0 ? 'text-[var(--up)]' : 'text-[var(--down)]'}`}>
                          {item.userPnl >= 0 ? '+' : ''}${item.userPnl.toFixed(2)}
                        </td>
                        <td className="p-4 text-right text-xs text-[var(--text-muted)] font-mono">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          <div className="card p-10 text-center space-y-2">
            <p className="text-sm font-semibold text-[var(--text)]">
              {loading ? 'Loading match history…' : 'Match history is private'}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              {loading
                ? 'Reading this trader’s public record.'
                : 'Only aggregate ratings and win counts are public. Individual duels stay with the player.'}
            </p>
          </div>
        )}
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