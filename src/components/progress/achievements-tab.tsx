'use client';

import { Award, Lock, Pin, ScrollText, Trophy } from 'lucide-react';
import { useProgressStore } from '@/lib/progress/store';
import { ACHIEVEMENTS, ACHIEVEMENT_TIER_LABEL } from '@/lib/progress/config';
import { achievementProgressRatio, isFullyUnlocked, nextTier, tierUnlocked } from '@/lib/progress/achievements';
import { sound } from '@/components/terminal/sound';
import { Chip, CoinIcon, ProgressBar, SectionTitle } from './bits';

/** Bronze / silver / gold read the same here as they do on the rank ladder. */
const TIER_COLOR: Record<'bronze' | 'silver' | 'gold', string> = {
  bronze: '#b07b4f',
  silver: '#94a3b8',
  gold: '#f59e0b',
};

export function AchievementsTab() {
  const achievements = useProgressStore((s) => s.achievements);
  const pinned = useProgressStore((s) => s.pinned);
  const titles = useProgressStore((s) => s.titles);
  const activeTitle = useProgressStore((s) => s.activeTitle);
  const pinBadge = useProgressStore((s) => s.pinBadge);
  const equipTitle = useProgressStore((s) => s.equipTitle);

  const unlockedCount = ACHIEVEMENTS.filter((def) => (achievements[def.id]?.progress ?? 0) > 0).length;
  const pinnedDefs = pinned
    .map((id) => ACHIEVEMENTS.find((def) => def.id === id))
    .filter((def): def is (typeof ACHIEVEMENTS)[number] => Boolean(def));

  return (
    <div className="space-y-4">
      <SectionTitle
        icon={<Trophy size={13} className="text-[var(--term-amber)]" />}
        right={
          <span className="text-[10px] font-mono text-[var(--term-soft)]">
            {unlockedCount}/{ACHIEVEMENTS.length} unlocked · pinned {pinned.length}/3
          </span>
        }
      >
        Achievements
      </SectionTitle>

      {/* Pinned showcase */}
      <div className="p-2.5 rounded-lg bg-[var(--term-panel-deep)] border border-[var(--term-border)] space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--term-soft)]">Pinned badges (max 3)</p>
        {pinnedDefs.length === 0 ? (
          <p className="text-[10px] font-mono text-[var(--term-dim)]">
            Pin an unlocked achievement to show it on your profile card.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {pinnedDefs.map((def) => (
              <button
                key={def.id}
                type="button"
                onClick={() => {
                  sound.playClick();
                  pinBadge(def.id);
                }}
                className="group inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--term-raised)] border border-[var(--term-amber)]/40 text-[10px] font-mono font-bold text-[var(--term-amber)] hover:border-[var(--term-sell)]/60 hover:text-[var(--term-sell)] transition-colors cursor-pointer"
                title="Unpin"
              >
                <Award size={10} /> {def.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {ACHIEVEMENTS.map((def) => {
          const progress = achievements[def.id];
          const value = progress?.progress ?? 0;
          const next = nextTier(def.id, progress);
          const fullyUnlocked = isFullyUnlocked(def.id, progress);
          const hiddenLocked = Boolean(def.hidden) && value <= 0;
          const firstTarget = def.tiers[0]?.target ?? 1;
          const isPinned = pinned.includes(def.id);

          return (
            <div
              key={def.id}
              className={`p-3 rounded-lg border space-y-2.5 ${
                fullyUnlocked ? 'bg-[var(--term-raised)] border-[var(--term-amber)]/40' : 'bg-[var(--term-bg)]/80 border-[var(--term-border)]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {hiddenLocked && <Lock size={11} className="text-[var(--term-muted)] shrink-0" />}
                    <p className="text-xs font-bold text-[var(--term-strong)] truncate">
                      {hiddenLocked ? 'Hidden achievement' : def.name}
                    </p>
                  </div>
                  <p className="text-[10px] text-[var(--term-soft)] mt-0.5 leading-snug line-clamp-2">
                    {hiddenLocked ? 'Unlock it in a duel to reveal the requirement.' : def.description}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Chip color="#6c7080" dim>{def.category}</Chip>
                  {value >= firstTarget && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        pinBadge(def.id);
                      }}
                      className={`w-6 h-6 rounded border flex items-center justify-center cursor-pointer transition-colors ${
                        isPinned
                          ? 'bg-[var(--term-amber)]/15 border-[var(--term-amber)]/50 text-[var(--term-amber)]'
                          : 'bg-[var(--term-raised)] border-[var(--term-border)] text-[var(--term-muted)] hover:text-[var(--term-strong)]'
                      }`}
                      title={isPinned ? 'Unpin badge' : 'Pin badge'}
                    >
                      <Pin size={11} />
                    </button>
                  )}
                </div>
              </div>

              {/* Tier track */}
              <div className="grid grid-cols-3 gap-1.5">
                {(['bronze', 'silver', 'gold'] as const).map((tier) => {
                  const tierDef = def.tiers.find((entry) => entry.tier === tier);
                  if (!tierDef) {
                    return (
                      <div key={tier} className="h-9 rounded border border-dashed border-[var(--term-border)] opacity-40" />
                    );
                  }
                  const unlocked = tierUnlocked(progress, tierDef);
                  const color = TIER_COLOR[tier];
                  return (
                    <div
                      key={tier}
                      className="relative h-9 rounded border flex flex-col items-center justify-center"
                      style={{
                        borderColor: unlocked ? `${color}88` : 'var(--term-border)',
                        background: unlocked ? `${color}18` : 'var(--term-panel-deep)',
                      }}
                    >
                      <span className="relative text-[9px] font-mono font-bold uppercase" style={{ color: unlocked ? color : 'var(--term-dim)' }}>
                        {ACHIEVEMENT_TIER_LABEL[tier]}
                      </span>
                      <span className="relative text-[9px] font-mono tabular-nums" style={{ color: unlocked ? 'var(--term-text)' : 'var(--term-dim)' }}>
                        {hiddenLocked ? '—' : tierDef.target}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1">
                <ProgressBar percent={achievementProgressRatio(def.id, progress)} color={fullyUnlocked ? '#f59e0b' : '#2962ff'} height={4} />
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-[var(--term-soft)]">
                    {hiddenLocked ? '—' : `${value}${next ? ` / ${next.target}` : ' max'}`}
                  </span>
                  <span className="flex items-center gap-1 text-[var(--term-amber)]">
                    {next ? (
                      <>
                        <CoinIcon /> +{next.coins}
                      </>
                    ) : (
                      <>✓ Complete</>
                    )}
                  </span>
                </div>
              </div>

              {def.title && (
                <div className="pt-1 border-t border-[var(--term-border)] flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono text-[var(--term-muted)] flex items-center gap-1 truncate">
                    <ScrollText size={10} /> {def.title}
                  </span>
                  {titles.includes(def.title) ? (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        equipTitle(activeTitle === def.title ? null : (def.title ?? null));
                      }}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold cursor-pointer transition-colors ${
                        activeTitle === def.title
                          ? 'bg-[var(--term-amber)] text-black'
                          : 'bg-[var(--term-raised)] border border-[var(--term-border-hi)] text-[var(--term-text)] hover:border-[var(--term-amber)]'
                      }`}
                    >
                      {activeTitle === def.title ? 'Equipped' : 'Equip'}
                    </button>
                  ) : (
                    <span className="text-[9px] font-mono text-[var(--term-dim)] uppercase">Gold unlock</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Titles */}
      <div className="space-y-2">
        <SectionTitle icon={<ScrollText size={13} className="text-[var(--term-amber)]" />} right={<span className="text-[10px] font-mono text-[var(--term-soft)]">{titles.length} owned</span>}>
          Titles
        </SectionTitle>
        {titles.length === 0 ? (
          <p className="text-[10px] font-mono text-[var(--term-muted)]">
            Gold achievement tiers and Level 10 hand out titles. Equip one to show it beside your level.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {titles.map((title) => (
              <button
                key={title}
                type="button"
                onClick={() => {
                  sound.playClick();
                  equipTitle(activeTitle === title ? null : title);
                }}
                className={`px-2.5 py-1 rounded border text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                  activeTitle === title
                    ? 'bg-[var(--term-amber)] border-[var(--term-amber)] text-black'
                    : 'bg-[var(--term-raised)] border-[var(--term-border-hi)] text-[var(--term-text)] hover:border-[var(--term-amber)]'
                }`}
              >
                {activeTitle === title ? '✓ ' : ''}{title}
              </button>
            ))}
            {activeTitle && (
              <button
                type="button"
                onClick={() => equipTitle(null)}
                className="px-2.5 py-1 rounded border border-[var(--term-border)] text-[10px] font-mono text-[var(--term-muted)] hover:text-[var(--term-strong)] cursor-pointer transition-colors"
              >
                Clear title
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
