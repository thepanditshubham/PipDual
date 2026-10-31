'use client';

/**
 * /admin/players
 * The player directory: everyone with a profile, their wallet, their rating
 * and whether the account is allowed to play. Search is client-side over the
 * page that was fetched — the list is capped, so the box narrows what is on
 * screen rather than promising to search the whole table.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Coins, RefreshCw, Search, ShieldCheck, UserX, Users, X } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { fetchPlayers } from '@/lib/supabase/admin';
import { textMatches } from '@/lib/admin/rules';
import type { AdminPlayer, PlayerStatus } from '@/lib/admin/types';
import {
  Gate,
  PageHead,
  Pill,
  Stat,
  StatStrip,
  shorten,
  when,
  type PillTone,
} from '@/components/admin/admin-bits';

const STATUS_TONE: Record<PlayerStatus, PillTone> = {
  active: 'ok',
  suspended: 'pending',
  banned: 'bad',
};

const STATUS_LABEL: Record<PlayerStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  banned: 'Banned',
};

type StatusFilter = 'all' | PlayerStatus;

export default function AdminPlayersPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    const rows = await fetchPlayers(200);
    if (rows === null) {
      setUnavailable(true);
      setPlayers([]);
      return;
    }
    setUnavailable(false);
    setPlayers(rows);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    await load();
    setLoading(false);
  }, [load]);

  useEffect(() => {
    // Fetch-on-mount against Postgres; every state write lands after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const visible = useMemo(
    () =>
      players.filter((player) => {
        if (statusFilter !== 'all' && player.status !== statusFilter) return false;
        return textMatches(query, player.username, player.id, player.displayName);
      }),
    [players, query, statusFilter],
  );

  const coinsHeld = players.reduce((total, player) => total + player.coins, 0);
  const locked = players.filter((player) => player.status !== 'active').length;
  const narrowed = Boolean(query.trim()) || statusFilter !== 'all';

  if (!user) {
    return (
      <Gate
        title="Sign in required"
        body="The player directory is only visible to a signed-in admin account."
      />
    );
  }

  if (!isAdmin) {
    return (
      <Gate
        title="Admin access only"
        body={`Signed in as ${user.username}, which is not an admin account. Set role = 'admin' on this profile's row in Supabase to open the directory.`}
      />
    );
  }

  return (
    <div className="space-y-4 animate-slide-up">
      <PageHead
        eyebrow={
          <>
            <Users size={12} className="text-[var(--purple)]" /> Players
          </>
        }
        title="Player"
        accent="directory"
        body="Search an account, read its wallet, and open it to adjust coins or lock it. Newest accounts first — the list is the most recent 200."
        actions={
          <button
            onClick={() => void reload()}
            disabled={loading}
            className="flex items-center gap-2 border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs font-bold text-[var(--text)] transition-colors hover:border-[var(--purple)] disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Reload
          </button>
        }
      />

      <StatStrip>
        <Stat bare icon={<Users size={13} />} label="Accounts in view" value={String(players.length)} />
        <Stat
          bare
          icon={<ShieldCheck size={13} />}
          label="Active"
          value={String(players.filter((player) => player.status === 'active').length)}
        />
        <Stat bare icon={<UserX size={13} />} label="Locked" value={String(locked)} />
        <Stat bare icon={<Coins size={13} />} label="Coins held" value={coinsHeld.toLocaleString()} />
      </StatStrip>

      {unavailable && (
        <div className="card p-4 text-xs text-[var(--text-secondary)]">
          Players are unreadable right now — the{' '}
          <code className="text-[var(--purple-light)]">profiles</code> /{' '}
          <code className="text-[var(--purple-light)]">player_balances</code> tables are missing or
          the Supabase keys are unset. Re-run{' '}
          <code className="text-[var(--purple-light)]">supabase/setup.sql</code>, then reload. Adjusting
          coins and locking an account also need the admin functions from that script.
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] p-2">
          {(['all', 'active', 'suspended', 'banned'] as StatusFilter[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={` px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                statusFilter === status
                  ? 'bg-[var(--purple)] text-[var(--term-canvas)]'
                  : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text)]'
              }`}
            >
              {status === 'all' ? 'All' : STATUS_LABEL[status]}
              <span className="ml-1 opacity-70">
                {status === 'all'
                  ? players.length
                  : players.filter((player) => player.status === status).length}
              </span>
            </button>
          ))}

          <label className="relative ms-auto min-w-[180px] flex-1 sm:max-w-[280px]">
            <Search
              size={12}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search username or id"
              aria-label="Search players"
              className="h-7 w-full border border-[var(--border)] bg-[var(--surface-muted)] pl-6 pr-2 text-[11px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--purple)] focus:outline-none"
            />
          </label>

          {narrowed && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setStatusFilter('all');
              }}
              className="inline-flex h-7 items-center gap-1 border border-[var(--border)] px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer"
            >
              <X size={11} /> Clear
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] uppercase text-[var(--text-muted)] font-semibold tracking-wider">
                <th className="p-3">Player</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3 text-right">Rating</th>
                <th className="p-3">Status</th>
                <th className="p-3">Joined</th>
                <th className="p-3 text-right">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[var(--text-muted)]">
                    {loading
                      ? 'Loading players…'
                      : narrowed
                        ? 'No account matches that search.'
                        : 'No players have signed up yet.'}
                  </td>
                </tr>
              )}

              {visible.map((player) => (
                <tr key={player.id} className="h-12 hover:bg-[var(--surface-muted)] transition-colors">
                  <td className="p-3">
                    <Link
                      href={`/admin/players/${player.id}`}
                      className="flex min-w-0 items-center gap-2"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--border)] bg-[var(--surface-muted)] text-[11px] font-black uppercase text-[var(--text)]">
                        {player.username.charAt(0)}
                      </span>
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate font-semibold text-[var(--text)]">
                          {player.username}
                        </span>
                        <span className="block font-mono text-[10px] text-[var(--text-muted)]">
                          {shorten(player.id, 8, 4)}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-[var(--purple-light)]">
                    {player.coins.toLocaleString()}
                  </td>
                  <td className="p-3 text-right font-mono text-[var(--text-secondary)]">
                    {player.rating}
                  </td>
                  <td className="p-3">
                    <Pill tone={STATUS_TONE[player.status]}>{STATUS_LABEL[player.status]}</Pill>
                  </td>
                  <td className="whitespace-nowrap p-3 text-[var(--text-muted)]">
                    {when(player.createdAt)}
                  </td>
                  <td className="p-3 text-right">
                    <Link
                      href={`/admin/players/${player.id}`}
                      className="inline-flex items-center gap-1 border border-[var(--border)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] transition-colors hover:border-[var(--purple)] hover:text-[var(--text)]"
                    >
                      Open <ChevronRight size={11} />
                    </Link>
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
