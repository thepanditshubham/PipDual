'use client';

import { Flame, Gift, RefreshCw, Snowflake, Target, Timer, Zap } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { useProgressStore } from '@/lib/progress/store';
import { DAILY_BONUS_COINS, STREAK_FREEZE_COST, missionDef } from '@/lib/progress/config';
import { allDailyMissionsDone, dailyBonusClaimable } from '@/lib/progress/missions';
import { formatCountdown, msUntilDailyReset, msUntilWeeklyReset } from '@/lib/progress/time';
import { levelFromXp } from '@/lib/progress/xp';
import type { UserMission } from '@/lib/progress/types';
import { sound } from '@/components/terminal/sound';
import { Chip, CoinIcon, ProgressBar, SectionTitle, useNow } from './bits';

function MissionCard({ mission, accent }: { mission: UserMission; accent: string }) {
  const claimMission = useProgressStore((s) => s.claimMission);
  const def = missionDef(mission.missionId);
  if (!def) return null;

  const done = mission.progress >= def.target;
  const percent = Math.min(100, Math.round((mission.progress / Math.max(1, def.target)) * 100));

  return (
    <div className="p-3 rounded-lg bg-[var(--term-bg)]/80 border border-[var(--term-border)] space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-[var(--term-strong)] leading-snug">{def.title}</p>
          <p className="text-[10px] text-[var(--term-soft)] mt-0.5 leading-snug">{def.description}</p>
        </div>
        <span className="text-[11px] font-mono font-bold text-[var(--term-label)] tabular-nums shrink-0">
          {Math.min(mission.progress, def.target)}/{def.target}
        </span>
      </div>

      <ProgressBar percent={percent} color={done ? '#089981' : accent} height={4} />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {def.rewardXp > 0 && <Chip color="#2962ff">+{def.rewardXp} XP</Chip>}
          {def.rewardCoins > 0 && (
            <Chip color="#f59e0b">
              <CoinIcon /> +{def.rewardCoins}
            </Chip>
          )}
        </div>
        <button
          type="button"
          disabled={!done || mission.claimed}
          onClick={() => {
            sound.playClick();
            claimMission(mission.missionId);
          }}
          className={`px-3 py-1 rounded text-[11px] font-bold transition-all ${
            mission.claimed
              ? 'bg-[var(--term-raised)] text-[var(--term-muted)] border border-[var(--term-border)] cursor-default'
              : done
                ? 'bg-[var(--term-buy)] hover:bg-[var(--term-buy-3)] text-white cursor-pointer shadow-md'
                : 'bg-[var(--term-raised)] text-[var(--term-muted)] border border-[var(--term-border)] cursor-default'
          }`}
        >
          {mission.claimed ? '✓ Claimed' : done ? 'Claim' : 'In progress'}
        </button>
      </div>
    </div>
  );
}

function StreakCard() {
  const streak = useProgressStore((s) => s.streak);
  const claimStreakChest = useProgressStore((s) => s.claimStreakChest);
  // Named without the `use` prefix: it is a store action, not a hook.
  const restoreStreak = useProgressStore((s) => s.useStreakFreeze);
  const wallet = useAuthStore((s) => s.user?.virtualBalance ?? 0);

  const chestReady = streak.days >= 7 && !streak.cycleClaimed;
  const pending = streak.pendingRestore;

  return (
    <div className="p-3 rounded-lg bg-[var(--term-bg)]/80 border border-[var(--term-border)] space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-[var(--term-strong)] uppercase">
          <Flame size={12} className="text-[var(--term-amber)]" /> Login Streak
        </p>
        <span className="text-[11px] font-mono text-[var(--term-amber)] font-bold">{streak.days} day{streak.days === 1 ? '' : 's'}</span>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }, (_, index) => {
          const day = index + 1;
          const filled = day <= Math.min(7, streak.days);
          const isChest = day === 7;
          return (
            <div
              key={day}
              className={`h-9 rounded flex flex-col items-center justify-center border text-[10px] font-mono font-bold ${
                isChest
                  ? filled
                    ? 'bg-[var(--term-amber)]/20 border-[var(--term-amber)] text-[var(--term-amber)]'
                    : 'bg-[var(--term-raised)] border-[var(--term-amber)]/40 text-[var(--term-amber)]/70'
                  : filled
                    ? 'bg-[var(--term-buy)]/15 border-[var(--term-buy)]/60 text-[var(--term-buy)]'
                    : 'bg-[var(--term-raised)] border-[var(--term-border)] text-[var(--term-dim)]'
              }`}
            >
              {isChest ? <Gift size={13} /> : <span>{day}</span>}
              <span className="text-[8px] opacity-70">{isChest ? '+100' : `D${day}`}</span>
            </div>
          );
        })}
      </div>

      {chestReady ? (
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            claimStreakChest();
          }}
          className="w-full h-8 rounded bg-[var(--term-amber)] hover:brightness-110 text-black text-[11px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5"
        >
          <Gift size={12} /> Claim day-7 chest · +100 coins
        </button>
      ) : (
        <p className="text-[10px] font-mono text-[var(--term-muted)]">
          Day 7 pays +100 coins. Any missed day resets the cycle back to day 1.
        </p>
      )}

      {pending && (
        <div className="p-2 rounded border border-[var(--term-gem)]/40 bg-[var(--term-gem)]/10 space-y-1.5">
          <p className="text-[10px] font-mono text-[var(--term-gem)] flex items-center gap-1">
            <Snowflake size={11} /> Streak lapsed after {pending.days} days
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono text-[var(--term-label)]">
              {wallet >= STREAK_FREEZE_COST ? `${STREAK_FREEZE_COST} coins to restore` : `Need ${STREAK_FREEZE_COST} coins`}
            </span>
            <button
              type="button"
              disabled={wallet < STREAK_FREEZE_COST}
              onClick={() => {
                sound.playClick();
                restoreStreak();
              }}
              className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                wallet >= STREAK_FREEZE_COST
                  ? 'bg-[var(--term-gem)] hover:brightness-110 text-black cursor-pointer'
                  : 'bg-[var(--term-raised)] text-[var(--term-muted)] border border-[var(--term-border)] cursor-default'
              }`}
            >
              Use freeze
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MissionsTab() {
  const missions = useProgressStore((s) => s.missions);
  const xp = useProgressStore((s) => s.xp);
  const rerollsUsed = missions.rerollsUsed;
  const claimDailyBonus = useProgressStore((s) => s.claimDailyBonus);
  const rerollDaily = useProgressStore((s) => s.rerollDaily);

  const now = useNow(1000);
  const level = levelFromXp(xp).level;
  const bonusReady = dailyBonusClaimable(missions);
  const allDone = allDailyMissionsDone(missions);
  const canReroll = level >= 5 && rerollsUsed < 1;
  const dailyCompleted = missions.daily.filter((mission) => {
    const def = missionDef(mission.missionId);
    return def ? mission.progress >= def.target : false;
  }).length;

  return (
    <div className="space-y-4">
      {/* Daily */}
      <div className="space-y-2">
        <SectionTitle
          icon={<Target size={13} className="text-[var(--term-buy)]" />}
          right={
            <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--term-soft)]">
              <Timer size={10} /> {formatCountdown(msUntilDailyReset(new Date(now)))}
            </span>
          }
        >
          Daily Missions · {dailyCompleted}/{missions.daily.length}
        </SectionTitle>

        <div className="space-y-2">
          {missions.daily.map((mission) => (
            <MissionCard key={mission.missionId} mission={mission} accent="#089981" />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 p-2.5 rounded bg-[var(--term-panel-deep)] border border-[var(--term-border)]">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[var(--term-strong)] flex items-center gap-1">
              <Gift size={11} className="text-[var(--term-amber)]" /> Daily clear bonus
              <span className="text-[var(--term-amber)] font-mono">+{DAILY_BONUS_COINS}</span>
              <CoinIcon />
            </p>
            <p className="text-[10px] font-mono text-[var(--term-muted)] mt-0.5">
              {missions.bonusClaimed ? 'Collected for today' : allDone ? 'All three complete — collect now' : `${missions.daily.length - dailyCompleted} mission(s) left`}
            </p>
          </div>
          <button
            type="button"
            disabled={!bonusReady}
            onClick={() => {
              sound.playClick();
              claimDailyBonus();
            }}
            className={`px-3 py-1.5 rounded text-[11px] font-bold shrink-0 ${
              missions.bonusClaimed
                ? 'bg-[var(--term-raised)] text-[var(--term-buy)] border border-[var(--term-buy)]/30 cursor-default'
                : bonusReady
                  ? 'bg-[var(--term-buy)] hover:bg-[var(--term-buy-3)] text-white cursor-pointer'
                  : 'bg-[var(--term-raised)] text-[var(--term-muted)] border border-[var(--term-border)] cursor-default'
            }`}
          >
            {missions.bonusClaimed ? '✓ Collected' : bonusReady ? 'Collect' : 'Locked'}
          </button>
        </div>

        <button
          type="button"
          disabled={!canReroll}
          onClick={() => {
            sound.playClick();
            rerollDaily();
          }}
          className={`w-full h-8 rounded border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
            canReroll
              ? 'bg-[var(--term-raised)] hover:bg-[var(--term-raised-hi)] border-[var(--term-border-hi)] text-[var(--term-text)] cursor-pointer'
              : 'bg-[var(--term-bg)] border-[var(--term-border)] text-[var(--term-dim)] cursor-default'
          }`}
        >
          <RefreshCw size={11} />
          {rerollsUsed >= 1
            ? 'Reroll used today'
            : level < 5
              ? 'Reroll unlocks at Level 5'
              : 'Reroll daily set (1 free/day)'}
        </button>
      </div>

      <StreakCard />

      {/* Weekly */}
      <div className="space-y-2">
        <SectionTitle
          icon={<Zap size={13} className="text-[var(--term-accent)]" />}
          right={
            <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--term-soft)]">
              <Timer size={10} /> {formatCountdown(msUntilWeeklyReset(new Date(now)))}
            </span>
          }
        >
          Weekly Missions
        </SectionTitle>
        <div className="space-y-2">
          {missions.weekly.map((mission) => (
            <MissionCard key={mission.missionId} mission={mission} accent="#2962ff" />
          ))}
        </div>
        <p className="text-[10px] font-mono text-[var(--term-muted)]">
          Daily set and daily bonus reset at 00:00 IST. Weekly set resets every Monday 00:00 IST.
        </p>
      </div>
    </div>
  );
}
