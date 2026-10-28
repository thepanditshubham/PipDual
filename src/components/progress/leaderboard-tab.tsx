'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Crown, Globe, Lock, RefreshCw, Trophy, Users } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { useProgressStore } from '@/lib/progress/store';
import { MEMBERS_FOR_LEADERBOARD } from '@/lib/progress/config';
import { fetchRemoteBoard, localBoardRow } from '@/lib/progress/remote';
import { tierColor, tierForRp } from '@/lib/progress/rank';
import { winRate } from '@/lib/progress/stats';
import type { BoardPeriod, BoardRow, BoardScope } from '@/lib/progress/types';
import { Chip, ProgressBar, SectionTitle } from './bits';

const SCOPES: { id: BoardScope; label: string; icon: typeof Globe }[] = [
  { id: 'global', label: 'Global', icon: Globe },
  { id: 'india', label: 'India', icon: Crown },
  { id: 'friends', label: 'Friends', icon: Users },
  { id: 'clan', label: 'Clan', icon: Users },
];

const PERIODS: { id: BoardPeriod; label: string }[] = [
  { id: 'season', label: 'Season RP' },
  { id: 'weekly', label: 'Weekly RP' },
];

export function LeaderboardTab() {
  const progress = useProgressStore();
  const user = useAuthStore((s) => s.user);

  const [scope, setScope] = useState<BoardScope>('global');
  const [period, setPeriod] = useState<BoardPeriod>('season');
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [source, setSource] = useState<'remote' | 'local'>('local');
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number>(0);
  const cacheRef = useRef<Map<string, { rows: BoardRow[]; at: number }>>(new Map());

  const yourName = user?.displayName || user?.username || 'You';
  const rankedMatches = progress.stats.rankedMatches;
  const eligible = rankedMatches >= MEMBERS_FOR_LEADERBOARD;
  const playerWinRate = winRate(progress.stats);

  useEffect(() => {
    if (!eligible) return;
    const userId = progress.userId ?? '';
    const key = `${scope}:${period}`;
    const cached = cacheRef.current.get(key);
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) {
      setRows(cached.rows);
      setSource('remote');
      setFetchedAt(cached.at);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchRemoteBoard(scope, period, userId)
      .then((remote) => {
        if (cancelled) return;
        if (remote && remote.length > 0) {
          cacheRef.current.set(key, { rows: remote, at: Date.now() });
          setRows(remote);
          setSource('remote');
          setFetchedAt(Date.now());
        } else {
          setRows([]);
          setSource('local');
          setFetchedAt(Date.now());
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scope, period, eligible, progress.userId]);

  const yourRow = useMemo<BoardRow>(() => {
    const remote = rows.find((row) => row.isYou);
    if (remote) return { ...remote, name: remote.name || yourName };
    return { ...localBoardRow(progress, yourName), tier: tierForRp(progress.rank.rp) };
  }, [rows, progress, yourName]);

  const sortedRows = useMemo(() => {
    const value = (row: BoardRow) => (period === 'weekly' ? row.weekRp : row.rp);
    return [...rows].sort((a, b) => {
      const gap = value(b) - value(a);
      if (gap !== 0) return gap;
      const rateA = a.matches > 0 ? a.wins / a.matches : 0;
      const rateB = b.matches > 0 ? b.wins / b.matches : 0;
      if (rateB !== rateA) return rateB - rateA;
      return a.matches - b.matches;
    });
  }, [rows, period]);

  return (
    <div className="space-y-3">
      <SectionTitle
        icon={<Trophy size={13} className="text-[var(--term-accent)]" />}
        right={
          <span className="text-[10px] font-mono text-[var(--term-soft)]">
            {source === 'remote' ? 'Live · 5 min cache' : 'Local preview'}
          </span>
        }
      >
        Leaderboard
      </SectionTitle>

      {/* Scope + period */}
      <div className="grid grid-cols-4 gap-1.5">
        {SCOPES.map((entry) => {
          const Icon = entry.icon;
          const active = scope === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setScope(entry.id)}
              className={`h-8 rounded border text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                active
                  ? 'bg-[var(--term-raised)] border-[var(--term-accent)] text-[var(--term-strong)]'
                  : 'bg-[var(--term-bg)] border-[var(--term-border)] text-[var(--term-soft)] hover:text-[var(--term-strong)]'
              }`}
            >
              <Icon size={11} className={active ? 'text-[var(--term-accent)]' : ''} /> {entry.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {PERIODS.map((entry) => {
          const active = period === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setPeriod(entry.id)}
              className={`h-7 rounded text-[10px] font-bold font-mono transition-colors cursor-pointer border ${
                active
                  ? 'bg-[var(--term-accent)]/15 border-[var(--term-accent)]/50 text-[var(--term-accent-text)]'
                  : 'bg-[var(--term-bg)] border-[var(--term-border)] text-[var(--term-muted)] hover:text-[var(--term-strong)]'
              }`}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      {!eligible ? (
        <div className="p-4 rounded-lg border border-[var(--term-amber)]/30 bg-[var(--term-amber)]/5 space-y-2">
          <p className="text-xs font-bold text-[var(--term-amber)] flex items-center gap-1.5">
            <Lock size={12} /> Leaderboard unlocks after {MEMBERS_FOR_LEADERBOARD} ranked duels
          </p>
          <div className="flex justify-between text-[10px] font-mono text-[var(--term-label)]">
            <span>{rankedMatches} ranked played</span>
            <span>{Math.max(0, MEMBERS_FOR_LEADERBOARD - rankedMatches)} to go</span>
          </div>
          <ProgressBar percent={(rankedMatches / MEMBERS_FOR_LEADERBOARD) * 100} color="#f59e0b" />
          <p className="text-[10px] font-mono text-[var(--term-soft)]">
            Ties break by win rate, then by fewer matches played.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--term-border)] overflow-hidden">
          <div className="grid grid-cols-12 bg-[var(--term-raised)] px-3 py-2 text-[10px] font-mono font-bold text-[var(--term-soft)] uppercase border-b border-[var(--term-border)]">
            <span className="col-span-2">Rank</span>
            <span className="col-span-5">Trader</span>
            <span className="col-span-3 text-center">{period === 'weekly' ? 'Week RP' : 'RP'}</span>
            <span className="col-span-2 text-right">Win %</span>
          </div>

          <div className="divide-y divide-[var(--term-border)] max-h-[300px] overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-xs font-mono text-[var(--term-muted)]">Loading rankings…</div>
            ) : sortedRows.length === 0 ? (
              <div className="py-8 px-4 text-center text-xs font-mono text-[var(--term-muted)] space-y-1">
                <p>{scope === 'friends' || scope === 'clan' ? `${scope === 'friends' ? 'Friends' : 'Clan'} boards appear once other members place.` : 'No placed players on this board yet.'}</p>
                <p className="text-[10px] text-[var(--term-dim)]">Your position is pinned below — play ranked duels to climb.</p>
              </div>
            ) : (
              sortedRows.map((row, index) => {
                const rank = index + 1;
                const rate = row.matches > 0 ? Math.round((row.wins / row.matches) * 100) : 0;
                return (
                  <div
                    key={`${row.userId}-${rank}`}
                    className={`grid grid-cols-12 px-3 py-2 items-center text-[11px] font-mono ${
                      row.isYou ? 'bg-[var(--term-accent)]/10' : 'hover:bg-[var(--term-raised)]/60'
                    }`}
                  >
                    <div className="col-span-2 font-bold">
                      {rank === 1 ? <span className="text-[var(--term-amber)]">#1</span>
                        : rank === 2 ? <span className="text-[var(--term-label)]">#2</span>
                        : rank === 3 ? <span className="text-[var(--term-amber)]">#3</span>
                        : <span className="text-[var(--term-muted)]">#{rank}</span>}
                    </div>
                    <div className="col-span-5 truncate">
                      <span className="text-[var(--term-strong)] font-bold">{row.name}</span>
                      <span className="ml-1.5"><Chip color={tierColor(row.tier)} dim>{row.tier}</Chip></span>
                    </div>
                    <div className="col-span-3 text-center tabular-nums text-[var(--term-strong)] font-bold">
                      {(period === 'weekly' ? row.weekRp : row.rp).toLocaleString()}
                    </div>
                    <div className="col-span-2 text-right tabular-nums text-[var(--term-buy)] font-bold">{rate}%</div>
                  </div>
                );
              })
            )}
          </div>

          {/* Your pinned position */}
          <div className="grid grid-cols-12 px-3 py-2.5 items-center text-[11px] font-mono bg-[var(--term-panel-deep)] border-t border-[var(--term-accent)]/40">
            <div className="col-span-2 font-bold text-[var(--term-accent)]">
              {rows.some((row) => row.isYou) ? `#${sortedRows.findIndex((row) => row.isYou) + 1}` : '—'}
            </div>
            <div className="col-span-5 truncate">
              <span className="text-[var(--term-accent-text)] font-bold">{yourName}</span>
              <span className="ml-1.5 text-[10px] text-[var(--term-muted)]">you</span>
            </div>
            <div className="col-span-3 text-center tabular-nums text-[var(--term-strong)] font-bold">
              {(period === 'weekly' ? progress.rank.weeklyRp : progress.rank.rp).toLocaleString()}
            </div>
            <div className="col-span-2 text-right tabular-nums text-[var(--term-buy)] font-bold">{Math.round(playerWinRate)}%</div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--term-muted)]">
        <span>
          {progress.rank.placementPlayed >= progress.rank.placementTarget
            ? `Placed · ${yourRow.tier} · ${progress.rank.weeklyRp.toLocaleString()} RP this week`
            : `Placement ${progress.rank.placementPlayed}/${progress.rank.placementTarget} — finish to enter boards`}
        </span>
        {fetchedAt > 0 && (
          <span className="flex items-center gap-1">
            <RefreshCw size={9} /> {new Date(fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
}
