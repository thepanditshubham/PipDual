'use client';

import Link from 'next/link';
import { ArrowRight, Award, Flame, ShieldCheck, Swords, Trophy, Users } from 'lucide-react';
import { skillLabel } from '@/lib/profile/config';
import { recentForm } from '@/lib/profile/stats';
import type { PlayerProfilePayload, PlayerStats } from '@/lib/profile/types';
import { rankPosition } from '@/lib/progress/rank';
import type { ProfileTab } from './tabs';
import {
  AchievementIcon, BattleMeta, EmptyState, ModeBadge, Panel, RarityBadge,
  ResultBadge, SectionHeader, formatDate, formatNumber, formatPips, formatRelative,
} from './shared';

export function OverviewTab({
  payload,
  stats,
  onNavigate,
}: {
  payload: PlayerProfilePayload;
  stats: PlayerStats;
  onNavigate: (tab: ProfileTab) => void;
}) {
  const rank = rankPosition(stats.rankRp);
  const placed = stats.placementPlayed >= stats.placementTarget;
  const form = recentForm(payload.battles, 8);
  const recentBattles = payload.battles.slice(0, 4);
  const recentAchievements = payload.achievements.slice(0, 3);
  const featured = [...payload.achievements]
    .sort((a, b) => {
      const weight = { gold: 3, silver: 2, bronze: 1 };
      return weight[b.rarity] - weight[a.rarity] || b.progress - a.progress;
    })
    .slice(0, 3);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <Panel>
          <SectionHeader
            eyebrow="Platform-verified record"
            title="Performance summary"
            action={<span className="font-mono text-[9px] text-[var(--text-muted)]">{stats.totalDuels} duels</span>}
          />
          <div className="p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Win rate</p>
                <p className="font-mono text-3xl font-extrabold tabular-nums text-[var(--text)]">{stats.winRate}%</p>
              </div>
              <div className="flex gap-3 text-right">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Wins</p>
                  <p className="font-mono text-sm font-bold text-[var(--up)]">{formatNumber(stats.wins)}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Losses</p>
                  <p className="font-mono text-sm font-bold text-[var(--down)]">{formatNumber(stats.losses)}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Draws</p>
                  <p className="font-mono text-sm font-bold text-[var(--text-secondary)]">{formatNumber(stats.draws)}</p>
                </div>
              </div>
            </div>

            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <span
                className="h-full bg-[var(--up)]"
                style={{ width: `${stats.winRate}%` }}
              />
              <span
                className="h-full bg-[var(--down)]"
                style={{ width: `${stats.totalDuels > 0 ? (stats.losses / stats.totalDuels) * 100 : 0}%` }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1.5">
                <Flame size={11} className="text-[var(--accent-hi)]" />
                Current streak <strong className="font-mono text-[var(--text)]">{stats.currentStreak}</strong>
              </span>
              <span>
                Best streak <strong className="font-mono text-[var(--text)]">{stats.highestStreak}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Trophy size={11} className="text-[var(--accent-hi)]" />
                {stats.tournamentWins} tournament wins
              </span>
              <span className="ml-auto font-mono text-[9px] text-[var(--text-muted)]">
                {form.length > 0 ? 'Recent form' : 'No recent form'}
              </span>
            </div>

            {form.length > 0 && (
              <div className="mt-2 flex items-center gap-1">
                {form.map((result, index) => (
                  <span
                    key={`${result}-${index}`}
                    title={result}
                    className={`flex h-4 w-4 items-center justify-center rounded-[3px] text-[8px] font-bold ${
                      result === 'win'
                        ? 'bg-[var(--up)]/15 text-[var(--up)]'
                        : result === 'loss'
                          ? 'bg-[var(--down)]/15 text-[var(--down)]'
                          : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'
                    }`}
                  >
                    {result === 'win' ? 'W' : result === 'loss' ? 'L' : 'D'}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <SectionHeader
            eyebrow="Latest settled duels"
            title="Recent battles"
            action={
              <button
                type="button"
                onClick={() => onNavigate('battles')}
                className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--accent-hi)] hover:text-[var(--text)]"
              >
                All battles <ArrowRight size={11} />
              </button>
            }
          />
          {!payload.profile.battleHistoryVisible ? (
            <EmptyState
              icon={<ShieldCheck size={17} />}
              title="Battle history is private"
              body="This trader keeps individual duel records out of the public profile. Aggregate statistics are still shown."
            />
          ) : recentBattles.length === 0 ? (
            <EmptyState
              icon={<Swords size={17} />}
              title="No settled duels yet"
              body="Once this trader finishes a duel, the result appears here from the platform record."
            />
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {recentBattles.map((battle) => (
                <div key={battle.matchId} className="flex items-center gap-3 px-4 py-2.5">
                  <ResultBadge result={battle.result} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-[var(--text)]">
                      vs {battle.opponent}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <BattleMeta battle={battle} />
                      <span className="text-[9px] text-[var(--text-muted)]">·</span>
                      <span className="font-mono text-[9px] text-[var(--text-muted)]">
                        {formatRelative(battle.createdAt)}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-mono text-[11px] font-bold ${battle.result === 'win' ? 'text-[var(--up)]' : battle.result === 'loss' ? 'text-[var(--down)]' : 'text-[var(--text-secondary)]'}`}>
                      {formatPips(battle.pips)}
                    </p>
                    <ModeBadge mode={battle.mode} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <SectionHeader
            eyebrow="Badge cabinet"
            title="Recent achievements"
            action={
              <button
                type="button"
                onClick={() => onNavigate('achievements')}
                className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--accent-hi)] hover:text-[var(--text)]"
              >
                All badges <ArrowRight size={11} />
              </button>
            }
          />
          {recentAchievements.length === 0 ? (
            <EmptyState
              icon={<Award size={17} />}
              title="No badges earned yet"
              body="Achievements unlock from verified duel outcomes and discipline milestones."
            />
          ) : (
            <div className="grid gap-2 p-3 sm:grid-cols-3">
              {recentAchievements.map((achievement) => (
                <div key={achievement.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--accent-hi)]">
                      <AchievementIcon id={achievement.id} size={14} />
                    </span>
                    <RarityBadge rarity={achievement.rarity} />
                  </div>
                  <p className="mt-2 truncate text-[11px] font-bold text-[var(--text)]">{achievement.name}</p>
                  <p className="truncate text-[9px] text-[var(--text-muted)]">
                    {achievement.unlockedAt ? formatDate(achievement.unlockedAt) : 'Earned'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="space-y-3">
        <Panel>
          <SectionHeader eyebrow="Season ladder" title="Current season rank" />
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-[var(--accent-hi)]"
                style={{ borderColor: `${rank.color}66`, background: `${rank.color}18` }}
              >
                <Trophy size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-bold text-[var(--text)]">
                  {placed ? rank.tierLabel : 'Placements'}
                </p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {placed ? `${formatNumber(stats.rankRp)} RP · Peak ${formatNumber(stats.peakRp)}` : `${stats.placementPlayed}/${stats.placementTarget} matches played`}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex justify-between text-[9px] text-[var(--text-muted)]">
                <span>{placed ? rank.nextLabel ?? 'Top of ladder' : 'Placement progress'}</span>
                <span className="font-mono">
                  {placed
                    ? rank.ceiling
                      ? `${rank.intoDivision}/${rank.ceiling - rank.floor}`
                      : 'Top of ladder'
                    : `${stats.placementPlayed}/${stats.placementTarget}`}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${placed ? rank.percent : stats.placementTarget > 0 ? (stats.placementPlayed / stats.placementTarget) * 100 : 0}%`,
                    background: rank.color,
                  }}
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2 text-[10px]">
              <span className="text-[var(--text-muted)]">Season position</span>
              <span className="font-mono font-bold text-[var(--text)]">
                {stats.seasonRank ? `#${formatNumber(stats.seasonRank)}` : 'Unranked'}
              </span>
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionHeader eyebrow="Featured" title="Profile badges" />
          {featured.length === 0 ? (
            <EmptyState icon={<Award size={16} />} title="No featured badges" body="The highest rarity badges are featured here automatically." />
          ) : (
            <div className="space-y-2 p-3">
              {featured.map((achievement) => (
                <div key={achievement.id} className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface)] text-[var(--accent-hi)]">
                    <AchievementIcon id={achievement.id} size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-[var(--text)]">{achievement.name}</p>
                    <p className="truncate text-[9px] text-[var(--text-muted)]">{achievement.category}</p>
                  </div>
                  <RarityBadge rarity={achievement.rarity} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <SectionHeader eyebrow="Community" title="Recent social activity" />
          {payload.activity.length === 0 ? (
            <EmptyState icon={<Users size={16} />} title="No social activity" body="Follows and skill endorsements will appear here." />
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {payload.activity.slice(0, 6).map((activity, index) => (
                <div key={`${activity.type}-${activity.at}-${index}`} className="flex items-center gap-2.5 px-3 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)]">
                    {activity.type === 'follow' ? <Users size={12} /> : <Award size={12} />}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-secondary)]">
                    <Link href={`/player/${activity.actor.username}`} className="font-semibold text-[var(--text)] hover:text-[var(--accent-hi)]">
                      {activity.actor.displayName || activity.actor.username}
                    </Link>{' '}
                    {activity.type === 'follow' ? 'started following' : `endorsed ${activity.skillKey ? skillLabel(activity.skillKey) : 'a skill'}`}
                  </p>
                  <span className="shrink-0 font-mono text-[8px] text-[var(--text-muted)]">{formatRelative(activity.at)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
