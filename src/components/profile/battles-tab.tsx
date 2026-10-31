'use client';

import { useState } from 'react';
import { ShieldCheck, ShieldQuestionMark, Swords } from 'lucide-react';
import type { PlayerBattle } from '@/lib/profile/types';
import {
  EmptyState, ModeBadge, Panel, ResultBadge, SectionHeader,
  formatDate, formatDuration, formatPips,
} from './shared';

function VerifiedMark({ verified }: { verified: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider ${
        verified ? 'text-[var(--up)]' : 'text-[var(--text-muted)]'
      }`}
      title={verified ? 'Settled on the platform record' : 'Not marked verified'}
    >
      {verified ? <ShieldCheck size={11} /> : <ShieldQuestionMark size={11} />}
      {verified ? 'Verified' : 'Unverified'}
    </span>
  );
}

export function BattlesTab({
  battles,
  visible,
  isSelf,
}: {
  battles: PlayerBattle[];
  visible: boolean;
  isSelf: boolean;
}) {
  const [limit, setLimit] = useState(20);
  const shown = battles.slice(0, limit);

  return (
    <Panel>
      <SectionHeader
        eyebrow="Settled platform records"
        title="Battle history"
        action={
          <span className="font-mono text-[9px] text-[var(--text-muted)]">
            {visible ? `${battles.length} shown` : 'Private'}
          </span>
        }
      />
      {!visible ? (
        <EmptyState
          icon={<ShieldCheck size={17} />}
          title="Battle history is private"
          body="This trader has hidden individual duel records. Their aggregate statistics remain visible."
        />
      ) : battles.length === 0 ? (
        <EmptyState
          icon={<Swords size={17} />}
          title="No settled duels"
          body="A duel appears here after the platform stores its final result."
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left text-[10px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[8px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  <th className="px-4 py-2 font-semibold">Opponent</th>
                  <th className="px-3 py-2 font-semibold">Result</th>
                  <th className="px-3 py-2 font-semibold">Mode</th>
                  <th className="px-3 py-2 font-semibold">Instrument</th>
                  <th className="px-3 py-2 font-semibold">Duration</th>
                  <th className="px-3 py-2 text-right font-semibold">Score</th>
                  <th className="px-3 py-2 text-right font-semibold">Date</th>
                  <th className="px-4 py-2 text-right font-semibold">Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {shown.map((battle) => (
                  <tr key={battle.matchId} className="hover:bg-[var(--surface-muted)]/60">
                    <td className="max-w-[180px] truncate px-4 py-2.5 font-semibold text-[var(--text)]">
                      {battle.opponent}
                    </td>
                    <td className="px-3 py-2.5"><ResultBadge result={battle.result} /></td>
                    <td className="px-3 py-2.5"><ModeBadge mode={battle.mode} /></td>
                    <td className="px-3 py-2.5 font-mono text-[var(--text-secondary)]">{battle.instrument}</td>
                    <td className="px-3 py-2.5 font-mono text-[var(--text-secondary)]">{formatDuration(battle.durationSeconds)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-bold ${battle.result === 'win' ? 'text-[var(--up)]' : battle.result === 'loss' ? 'text-[var(--down)]' : 'text-[var(--text-secondary)]'}`}>
                      {formatPips(battle.pips)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[var(--text-muted)]">{formatDate(battle.createdAt)}</td>
                    <td className="px-4 py-2.5 text-right"><VerifiedMark verified={battle.verified} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[var(--border)] md:hidden">
            {shown.map((battle) => (
              <div key={battle.matchId} className="space-y-2 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ResultBadge result={battle.result} />
                    <span className="truncate text-[11px] font-semibold text-[var(--text)]">{battle.opponent}</span>
                  </div>
                  <span className={`font-mono text-[11px] font-bold ${battle.result === 'win' ? 'text-[var(--up)]' : battle.result === 'loss' ? 'text-[var(--down)]' : 'text-[var(--text-secondary)]'}`}>
                    {formatPips(battle.pips)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-[var(--text-muted)]">
                  <ModeBadge mode={battle.mode} />
                  <span className="font-mono">{battle.instrument}</span>
                  <span className="font-mono">{formatDuration(battle.durationSeconds)}</span>
                  <span className="font-mono">{formatDate(battle.createdAt)}</span>
                  <span className="ml-auto"><VerifiedMark verified={battle.verified} /></span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-2.5">
            <p className="text-[9px] text-[var(--text-muted)]">
              {isSelf
                ? 'Only settled rows from your platform record appear here.'
                : 'Projected from settled platform rows; private profile data is excluded.'}
            </p>
            {limit < battles.length && (
              <button
                type="button"
                onClick={() => setLimit((value) => value + 20)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text)]"
              >
                Load more
              </button>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
