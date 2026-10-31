'use client';

import { Crown, Info, Shield, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { useProgressStore } from '@/lib/progress/store';
import { DIVISION_RP, RANK_BANDS, SHIELD_MATCHES } from '@/lib/progress/config';
import { placementRp, rankPosition } from '@/lib/progress/rank';
import { seasonAt, seasonCountdownLabel } from '@/lib/progress/season';
import { Chip, ProgressBar, SectionTitle, useNow } from './bits';

export function RankTab() {
  const rank = useProgressStore((s) => s.rank);
  const activeTitle = useProgressStore((s) => s.activeTitle);
  const now = useNow(30_000);
  const season = seasonAt(new Date(now));
  const position = rankPosition(rank.rp);
  const inPlacement = rank.placementPlayed < rank.placementTarget;
  const projected = placementRp(rank.placementWins, rank.placementPlayed);
  const decayArmed = rank.rp >= 1200;
  const ladder = RANK_BANDS.filter((band) => band.name !== 'Market Wizard');

  return (
    <div className="space-y-4">
      {/* Current rank */}
      <div
        className="rounded-lg border p-4 space-y-3"
        style={{ borderColor: `color-mix(in srgb, ${position.color} 33%, transparent)`, background: `linear-gradient(135deg, color-mix(in srgb, ${position.color} 9%, transparent), var(--term-bg) 60%)` }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Crown size={16} style={{ color: position.color }} />
              <span className="text-base font-black font-mono tracking-wide" style={{ color: position.color }}>
                {inPlacement ? 'Placement Window' : position.tierLabel}
              </span>
              {activeTitle && <Chip color="#f59e0b">{activeTitle}</Chip>}
            </div>
            <p className="text-[11px] font-mono text-[var(--term-label)] mt-1">
              {inPlacement
                ? `${rank.placementPlayed}/${rank.placementTarget} matches · ${rank.placementWins} wins`
                : `${rank.rp.toLocaleString()} RP · peak ${rank.peakRp.toLocaleString()} RP`}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-black font-mono tabular-nums leading-none" style={{ color: position.color }}>
              {inPlacement ? `${rank.placementWins}W` : rank.rp.toLocaleString()}
            </p>
            <p className="text-[10px] font-mono text-[var(--term-muted)] uppercase mt-1">{inPlacement ? 'placement' : 'rating points'}</p>
          </div>
        </div>

        {inPlacement ? (
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-mono text-[var(--term-label)]">
              <span>Placement progress</span>
              <span>Projects to {rankPosition(projected).tierLabel}</span>
            </div>
            <ProgressBar
              percent={(rank.placementPlayed / Math.max(1, rank.placementTarget)) * 100}
              color={position.color}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-mono text-[var(--term-label)]">
              <span>
                {position.intoDivision}/{DIVISION_RP} into {position.tierLabel}
              </span>
              <span>{position.nextLabel ? `${position.needed} RP to ${position.nextLabel}` : 'Top of the ladder'}</span>
            </div>
            <ProgressBar percent={position.percent} color={position.color} />
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
          <div className="p-2 rounded bg-[var(--term-bg)]/80 border border-[var(--term-border)]">
            <p className="text-[var(--term-soft)] uppercase">This week</p>
            <p className="text-[var(--term-strong)] font-bold tabular-nums">{rank.weeklyRp.toLocaleString()} RP</p>
          </div>
          <div className="p-2 rounded bg-[var(--term-bg)]/80 border border-[var(--term-border)]">
            <p className="text-[var(--term-soft)] uppercase">Shield</p>
            <p className="text-[var(--term-strong)] font-bold flex items-center gap-1">
              <Shield size={10} /> {rank.shieldMatches}/{SHIELD_MATCHES}
            </p>
          </div>
          <div className="p-2 rounded bg-[var(--term-bg)]/80 border border-[var(--term-border)]">
            <p className="text-[var(--term-soft)] uppercase">Season</p>
            <p className="text-[var(--term-strong)] font-bold">{season.id}</p>
          </div>
        </div>
      </div>

      {/* RP rules */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] font-mono">
        <div className="p-2.5 rounded bg-[var(--term-bg)]/80 border border-[var(--term-border)]">
          <p className="flex items-center gap-1 text-[var(--term-buy)] font-bold uppercase"><TrendingUp size={10} /> Win</p>
          <p className="text-[var(--term-label)] mt-1">+15 to +35 RP · margin &amp; opponent adjust</p>
        </div>
        <div className="p-2.5 rounded bg-[var(--term-bg)]/80 border border-[var(--term-border)]">
          <p className="flex items-center gap-1 text-[var(--term-sell)] font-bold uppercase"><TrendingDown size={10} /> Loss</p>
          <p className="text-[var(--term-label)] mt-1">−5 to −20 RP · never below your floor</p>
        </div>
        <div className="p-2.5 rounded bg-[var(--term-bg)]/80 border border-[var(--term-border)]">
          <p className="flex items-center gap-1 text-[var(--term-label)] font-bold uppercase"><Info size={10} /> Draw</p>
          <p className="text-[var(--term-label)] mt-1">0 RP · XP and coins still credited</p>
        </div>
      </div>

      {/* Season + decay */}
      <div className="space-y-2">
        <SectionTitle icon={<Sparkles size={13} className="text-[var(--term-accent)]" />} right={<Chip color="#f0a53a">{seasonCountdownLabel(season)}</Chip>}>
          Season {season.number} · Soft reset 60%
        </SectionTitle>
        <div className="p-3 rounded bg-[var(--term-bg)]/80 border border-[var(--term-border)] text-[11px] text-[var(--term-label)] space-y-1">
          <p>At season close, RP keeps 60% of its value and two placement matches re-seed your division.</p>
          <p className="text-[var(--term-muted)]">
            {decayArmed
              ? `Gold+ inactivity: −20 RP per week after 14 days idle${
                  rank.lastRankedAt ? ` · last ranked ${new Date(rank.lastRankedAt).toLocaleDateString()}` : ''
                }.`
              : 'Rank decay only applies from Gold I (1,200 RP) upwards.'}
          </p>
        </div>
      </div>

      {/* Ladder */}
      <div className="space-y-2">
        <SectionTitle icon={<Crown size={13} className="text-[var(--term-amber)]" />} right={<span className="text-[10px] font-mono text-[var(--term-muted)]">200 RP per division</span>}>
          Rank Ladder
        </SectionTitle>

        <div className="rounded-lg border border-[var(--term-border)] overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-[var(--term-raised)] border-b border-[var(--term-border)]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black font-mono" style={{ color: 'var(--term-amber)' }}>MARKET WIZARD</span>
              <Chip color="var(--term-amber)">Top 100</Chip>
            </div>
            <span className="text-[10px] font-mono text-[var(--term-soft)]">Global RP top 100</span>
          </div>

          <div className="divide-y divide-[var(--term-border)] max-h-[320px] overflow-y-auto">
            {ladder.map((band) => {
              const current = !inPlacement && position.tier === band.name;
              const reached = rank.peakRp >= band.minRp;
              return (
                <div
                  key={band.name}
                  className={`px-3 py-2.5 flex items-center justify-between gap-2 ${current ? 'bg-[var(--term-raised)]' : ''}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono" style={{ color: band.color }}>{band.name}</span>
                      {current && <Chip color={band.color}>Current</Chip>}
                      {band.divisions.length > 0 && (
                        <span className="text-[10px] font-mono text-[var(--term-muted)]">{band.divisions.join(' · ')}</span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-[var(--term-muted)] mt-0.5 truncate">{band.reward}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-mono text-[var(--term-label)] tabular-nums">
                      {band.minRp.toLocaleString()}{band.maxRp ? `–${band.maxRp.toLocaleString()}` : '+'}
                    </p>
                    {current && band.divisions.length > 0 && (
                      <div className="mt-1 w-20">
                        <ProgressBar percent={position.percent} color={band.color} height={3} />
                      </div>
                    )}
                    {!current && !reached && <p className="text-[9px] font-mono text-[var(--term-dim)] mt-0.5">Locked</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RP history */}
      {rank.history.length > 0 && (
        <div className="space-y-2">
          <SectionTitle icon={<TrendingUp size={13} className="text-[var(--term-buy)]" />}>Recent RP Movement</SectionTitle>
          <div className="rounded-lg border border-[var(--term-border)] divide-y divide-[var(--term-border)] max-h-[180px] overflow-y-auto">
            {rank.history.slice(0, 10).map((entry) => (
              <div key={`${entry.matchId}-${entry.at}`} className="px-3 py-2 flex items-center justify-between gap-2 text-[11px] font-mono">
                <span className="text-[var(--term-soft)]">{new Date(entry.at).toLocaleDateString()}</span>
                <span className={`uppercase font-bold ${entry.outcome === 'win' ? 'text-[var(--term-buy)]' : entry.outcome === 'loss' ? 'text-[var(--term-sell)]' : 'text-[var(--term-label)]'}`}>
                  {entry.outcome}
                </span>
                <span className={`tabular-nums font-bold ${entry.delta >= 0 ? 'text-[var(--term-buy)]' : 'text-[var(--term-sell)]'}`}>
                  {entry.delta >= 0 ? '+' : ''}{entry.delta} RP
                </span>
                <span className="text-[var(--term-text)] tabular-nums">{entry.rp.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
