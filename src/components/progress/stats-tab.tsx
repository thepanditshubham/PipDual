'use client';

import { Activity, BarChart3, Brain, ShieldCheck } from 'lucide-react';
import { useProgressStore } from '@/lib/progress/store';
import { BEHAVIOR_LABELS } from '@/lib/progress/config';
import {
  averageHoldSeconds,
  averageR,
  averageReentrySeconds,
  disciplineLabel,
  rollingDiscipline,
  slUsagePercent,
  tradesPerMatch,
  winRate,
} from '@/lib/progress/stats';
import type { BehaviorTag } from '@/lib/progress/types';
import { Chip, ProgressBar, SectionTitle, StatTile } from './bits';
import { DnaRadar } from './dna-radar';

function disciplineColor(score: number): string {
  if (score >= 80) return 'var(--term-buy)';
  if (score >= 60) return 'var(--term-amber)';
  return 'var(--term-sell)';
}

export function StatsTab() {
  const stats = useProgressStore((s) => s.stats);
  const dna = useProgressStore((s) => s.dna);

  const played = stats.wins + stats.losses + stats.draws;
  const rate = winRate(stats);
  const slPct = slUsagePercent(stats);
  const discipline = rollingDiscipline(stats);
  const history = stats.disciplineHistory.slice(-14);
  const behaviorEntries = (Object.keys(stats.behavior) as BehaviorTag[])
    .map((tag) => ({ tag, count: stats.behavior[tag] }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
  const pairEntries = Object.entries(stats.pairs).sort((a, b) => b[1].matches - a[1].matches);
  const holdMinutes = Math.round(averageHoldSeconds(stats) / 6) / 10;

  return (
    <div className="space-y-4">
      {/* Career stats */}
      <div className="space-y-2">
        <SectionTitle
          icon={<BarChart3 size={13} className="text-[var(--term-accent)]" />}
          right={<span className="text-[10px] font-mono text-[var(--term-soft)]">{stats.matches} matches · {stats.rankedMatches} ranked</span>}
        >
          Career Stats
        </SectionTitle>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatTile label="Win rate" value={`${Math.round(rate)}%`} hint={`${stats.wins}W · ${stats.losses}L · ${stats.draws}D`} accent={rate >= 50 ? 'var(--term-buy)' : 'var(--term-text)'} />
          <StatTile label="Net pips" value={`${stats.totalPips >= 0 ? '+' : ''}${stats.totalPips.toFixed(1)}`} hint={`best +${stats.bestPips.toFixed(1)}`} accent={stats.totalPips >= 0 ? 'var(--term-buy)' : 'var(--term-sell)'} />
          <StatTile label="Trades / match" value={tradesPerMatch(stats).toFixed(1)} hint={`${stats.totalTrades} total trades`} />
          <StatTile label="Avg R" value={averageR(stats).toFixed(2)} hint={`${stats.rSamples} samples`} accent={averageR(stats) >= 1 ? 'var(--term-buy)' : 'var(--term-text)'} />
          <StatTile label="Stop-loss usage" value={`${Math.round(slPct)}%`} hint={`${stats.slTrades}/${stats.totalTrades} entries`} accent={slPct >= 80 ? 'var(--term-buy)' : slPct >= 50 ? 'var(--term-amber)' : 'var(--term-sell)'} />
          <StatTile label="Avg hold" value={`${holdMinutes.toFixed(1)}m`} hint={`${stats.holdSamples} trades`} />
          <StatTile label="Re-entry delay" value={`${Math.round(averageReentrySeconds(stats))}s`} hint="after a loss" accent={averageReentrySeconds(stats) >= 30 ? 'var(--term-buy)' : 'var(--term-amber)'} />
          <StatTile label="Ranked streak" value={`${stats.rankedStreak}`} hint={`best ${stats.bestRankedStreak}`} accent="var(--term-amber)" />
        </div>
        {played === 0 && (
          <p className="text-[10px] font-mono text-[var(--term-muted)]">
            Finish a duel to start filling the career sheet. Practice counts toward XP, not RP.
          </p>
        )}
      </div>

      {/* Discipline */}
      <div className="space-y-2">
        <SectionTitle
          icon={<ShieldCheck size={13} className="text-[var(--term-buy)]" />}
          right={<Chip color={disciplineColor(discipline)}>{disciplineLabel(discipline)}</Chip>}
        >
          Discipline Score
        </SectionTitle>

        <div className="p-3 rounded-lg bg-[var(--term-bg)]/80 border border-[var(--term-border)] space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-black font-mono tabular-nums leading-none" style={{ color: disciplineColor(discipline) }}>
                {discipline || '—'}
              </p>
              <p className="text-[10px] font-mono text-[var(--term-soft)] mt-1">rolling average · last {Math.max(1, history.length)} matches</p>
            </div>
            <div className="text-right text-[10px] font-mono text-[var(--term-muted)] space-y-0.5">
              <p>SL 30% · Risk 20% · No revenge 20%</p>
              <p>Patience 15% · Plan 15%</p>
            </div>
          </div>

          <div className="flex items-end gap-1 h-12">
            {history.length === 0 ? (
              <p className="text-[10px] font-mono text-[var(--term-dim)]">No graded matches yet.</p>
            ) : (
              history.map((score, index) => (
                <div
                  key={`${index}-${score}`}
                  className="flex-1 rounded-t transition-all"
                  style={{
                    height: `${Math.max(6, score)}%`,
                    background: `${disciplineColor(score)}aa`,
                  }}
                  title={`${score}`}
                />
              ))
            )}
          </div>
          <p className="text-[10px] font-mono text-[var(--term-muted)]">
            A match at 80+ discipline also pays +10 bonus XP. Losses never reduce XP.
          </p>
        </div>
      </div>

      {/* Trader DNA */}
      <div className="space-y-2">
        <SectionTitle icon={<Brain size={13} className="text-[var(--term-purple)]" />} right={<span className="text-[10px] font-mono text-[var(--term-soft)]">updates weekly</span>}>
          Trader DNA
        </SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-[var(--term-bg)]/80 border border-[var(--term-border)] items-center">
          <div className="max-w-[220px] mx-auto w-full">
            <DnaRadar dna={dna} />
          </div>
          <div className="space-y-2 min-w-0">
            <p className="text-xs text-[var(--term-text)] leading-relaxed">{dna.insight}</p>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                { label: 'Risk control', value: dna.risk },
                { label: 'Patience', value: dna.patience },
                { label: 'Timing', value: dna.timing },
                { label: 'Discipline', value: dna.discipline },
                { label: 'Consistency', value: dna.consistency },
              ].map((axis) => (
                <div key={axis.label} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[var(--term-soft)] w-24 shrink-0">{axis.label}</span>
                  <div className="flex-1">
                    <ProgressBar percent={axis.value} color="var(--term-accent)" height={3} />
                  </div>
                  <span className="text-[10px] font-mono text-[var(--term-text)] tabular-nums w-6 text-right">{axis.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Behaviour tags */}
      <div className="space-y-2">
        <SectionTitle icon={<Activity size={13} className="text-[var(--term-sell)]" />} right={<span className="text-[10px] font-mono text-[var(--term-soft)]">{behaviorEntries.length} observed</span>}>
          Behaviour Tags
        </SectionTitle>
        {behaviorEntries.length === 0 ? (
          <p className="text-[10px] font-mono text-[var(--term-muted)]">
            No leaks detected yet. Tags appear when revenge entries, overtrading or held losers show up.
          </p>
        ) : (
          <div className="space-y-1.5">
            {behaviorEntries.map(({ tag, count }) => (
              <div key={tag} className="p-2 rounded bg-[var(--term-bg)]/80 border border-[var(--term-border)] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-[var(--term-sell)]">{BEHAVIOR_LABELS[tag].label}</p>
                  <p className="text-[10px] font-mono text-[var(--term-muted)] truncate">{BEHAVIOR_LABELS[tag].hint}</p>
                </div>
                <span className="text-[11px] font-mono font-bold text-[var(--term-strong)] tabular-nums shrink-0">×{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pair mastery */}
      <div className="space-y-2">
        <SectionTitle icon={<BarChart3 size={13} className="text-[var(--term-buy)]" />}>Pair Mastery</SectionTitle>
        {pairEntries.length === 0 ? (
          <p className="text-[10px] font-mono text-[var(--term-muted)]">Pairs you trade will be ranked here by volume and win rate.</p>
        ) : (
          <div className="space-y-1.5">
            {pairEntries.map(([pair, mastery]) => {
              const pairRate = mastery.matches > 0 ? (mastery.wins / mastery.matches) * 100 : 0;
              return (
                <div key={pair} className="p-2 rounded bg-[var(--term-bg)]/80 border border-[var(--term-border)] space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-[var(--term-strong)] font-bold">{pair}</span>
                    <span className="text-[var(--term-soft)]">
                      {mastery.wins}/{mastery.matches} · <span className="text-[var(--term-buy)] font-bold">{Math.round(pairRate)}%</span>
                    </span>
                  </div>
                  <ProgressBar percent={pairRate} color="var(--term-buy)" height={3} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
