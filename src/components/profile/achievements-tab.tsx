'use client';

import { Award } from 'lucide-react';
import type { PlayerAchievement } from '@/lib/profile/types';
import {
  AchievementIcon, EmptyState, Panel, RarityBadge, SectionHeader, formatDate,
} from './shared';

function rarityStyle(rarity: PlayerAchievement['rarity']) {
  if (rarity === 'gold') return { border: 'rgba(255,194,92,0.4)', background: 'rgba(255,194,92,0.07)' };
  if (rarity === 'silver') return { border: 'rgba(185,198,218,0.35)', background: 'rgba(185,198,218,0.06)' };
  return { border: 'rgba(217,160,111,0.35)', background: 'rgba(217,160,111,0.06)' };
}

export function AchievementsTab({ achievements }: { achievements: PlayerAchievement[] }) {
  return (
    <Panel>
      <SectionHeader
        eyebrow="Earned on the platform"
        title="Achievements"
        action={
          <span className="font-mono text-[9px] text-[var(--text-muted)]">
            {achievements.length} badge{achievements.length === 1 ? '' : 's'}
          </span>
        }
      />
      {achievements.length === 0 ? (
        <EmptyState
          icon={<Award size={17} />}
          title="No badges earned yet"
          body="Badges unlock from verified duel outcomes, discipline milestones and streaks."
        />
      ) : (
        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {achievements.map((achievement) => (
            <article
              key={achievement.id}
              className="rounded-lg border p-3"
              style={rarityStyle(achievement.rarity)}
            >
              <div className="flex items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--accent-hi)]">
                  <AchievementIcon id={achievement.id} size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="truncate text-[12px] font-bold text-[var(--text)]">{achievement.name}</h3>
                    <RarityBadge rarity={achievement.rarity} />
                  </div>
                  <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {achievement.category}
                  </p>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 min-h-[28px] text-[10px] leading-relaxed text-[var(--text-secondary)]">
                {achievement.description}
              </p>
              <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-1.5 text-[9px] text-[var(--text-muted)]">
                <span>Progress {achievement.progress.toLocaleString()}</span>
                <span className="font-mono">
                  {achievement.unlockedAt ? formatDate(achievement.unlockedAt) : 'Earned'}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="border-t border-[var(--border)] px-4 py-2 text-[9px] text-[var(--text-muted)]">
        Rarity reflects the highest tier reached in the platform&apos;s verified achievement record.
      </p>
    </Panel>
  );
}
