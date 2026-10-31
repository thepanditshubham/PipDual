'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Lock, RotateCcw, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { ProfileApiError, fetchPlayerProfile, runProfileAction } from '@/lib/profile/api';
import type { PlayerProfilePayload, SkillKey } from '@/lib/profile/types';
import { ProfileHeader } from './profile-header';
import { ProfileStatStrip } from './profile-stat-strip';
import { MessageModal } from './message-modal';
import { OverviewTab } from './overview-tab';
import { BattlesTab } from './battles-tab';
import { AchievementsTab } from './achievements-tab';
import { SkillsTab } from './skills-tab';
import { PortfolioTab } from './portfolio-tab';
import { AboutTab } from './about-tab';
import { PROFILE_TABS, type ProfileTab } from './tabs';
import { Panel } from './shared';

export function ProfileClient({ username }: { username: string }) {
  const user = useAuthStore((state) => state.user);
  const signedIn = Boolean(user && !user.isGuest);
  const [payload, setPayload] = useState<PlayerProfilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [busySkill, setBusySkill] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchPlayerProfile(username)
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ProfileApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof Error ? err.message : 'Could not load this profile.');
        }
      })
    return () => {
      cancelled = true;
    };
  }, [username, user?.id, retryTick]);

  const refresh = useCallback(async () => {
    const data = await fetchPlayerProfile(username);
    setPayload(data);
    return data;
  }, [username]);

  const act = useCallback(
    async (action: 'follow' | 'unfollow' | 'connect') => {
      setBusyAction(action);
      setActionError(null);
      try {
        await runProfileAction(username, { action });
        await refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Could not complete that action.');
      } finally {
        setBusyAction(null);
      }
    },
    [username, refresh],
  );

  const skillAction = useCallback(
    async (action: 'add-skill' | 'remove-skill' | 'endorse', skillKey: SkillKey) => {
      setBusySkill(skillKey);
      setActionError(null);
      try {
        await runProfileAction(username, { action, skillKey });
        await refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Could not update this skill.');
      } finally {
        setBusySkill(null);
      }
    },
    [username, refresh],
  );

  if (!payload && !notFound && !error) return <ProfileSkeleton />;

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Panel>
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)]">
              <AlertTriangle size={19} />
            </div>
            <h1 className="text-lg font-bold text-[var(--text)]">Trader not found</h1>
            <p className="max-w-md text-[11px] leading-relaxed text-[var(--text-secondary)]">
              There is no public profile for @{username}. The callsign may have changed, or the
              account may not have been created yet.
            </p>
            <Link
              href="/play"
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#241c10]"
            >
              Back to the arena
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Panel>
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--down)]/30 bg-[var(--down)]/10 text-[var(--down)]">
              <AlertTriangle size={19} />
            </div>
            <h1 className="text-lg font-bold text-[var(--text)]">Profile unavailable</h1>
            <p className="max-w-md text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {error ?? 'The profile could not be loaded.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setPayload(null);
                setError(null);
                setNotFound(false);
                setRetryTick((value) => value + 1);
              }}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text)] hover:border-[var(--border-hi)]"
            >
              <RotateCcw size={11} /> Retry
            </button>
          </div>
        </Panel>
      </div>
    );
  }

  const { profile, stats } = payload;
  const counts: Partial<Record<ProfileTab, number>> = {
    battles: profile.battleHistoryVisible ? payload.battles.length : 0,
    achievements: payload.achievements.length,
    skills: payload.skills.length,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:py-7">
      <div className="space-y-3">
        <ProfileHeader
          payload={payload}
          signedIn={signedIn}
          busyAction={busyAction}
          actionError={actionError}
          onFollow={() => void act(profile.isFollowing ? 'unfollow' : 'follow')}
          onConnect={() => void act('connect')}
          onMessage={() => setMessageOpen(true)}
        />

        {payload.restricted || !stats ? (
          <Panel>
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)]">
                <Lock size={17} />
              </div>
              <h2 className="text-sm font-bold text-[var(--text)]">This profile is private</h2>
              <p className="max-w-md text-[10px] leading-relaxed text-[var(--text-secondary)]">
                {profile.visibility === 'followers'
                  ? 'The trader shares their record with followers only. Follow requests are handled by the trader.'
                  : 'The trader has chosen to keep their record private. Only the callsign and avatar are public.'}
              </p>
              <p className="flex items-center gap-1.5 text-[9px] text-[var(--text-muted)]">
                <ShieldCheck size={11} /> Private fields are filtered by the database, not hidden in the browser.
              </p>
            </div>
          </Panel>
        ) : (
          <>
            <ProfileStatStrip stats={stats} />

            <div className="overflow-x-auto border-b border-[var(--border)]">
              <div className="flex min-w-max items-center gap-0.5" role="tablist" aria-label="Profile sections">
                {PROFILE_TABS.map((tab) => {
                  const active = activeTab === tab.id;
                  const count = counts[tab.id];
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative inline-flex items-center gap-1.5 px-2.5 py-2.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                        active
                          ? 'text-[var(--accent-hi)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      {tab.label}
                      {count !== undefined && count > 0 && (
                        <span className={`rounded-full px-1 py-0.5 font-mono text-[8px] ${active ? 'bg-[var(--accent)]/15 text-[var(--accent-hi)]' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'}`}>
                          {count}
                        </span>
                      )}
                      {active && <span className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div role="tabpanel">
              {activeTab === 'overview' && (
                <OverviewTab payload={payload} stats={stats} onNavigate={setActiveTab} />
              )}
              {activeTab === 'battles' && (
                <BattlesTab
                  battles={payload.battles}
                  visible={profile.battleHistoryVisible}
                  isSelf={profile.isSelf}
                />
              )}
              {activeTab === 'achievements' && (
                <AchievementsTab achievements={payload.achievements} />
              )}
              {activeTab === 'skills' && (
                <SkillsTab
                  skills={payload.skills}
                  isSelf={profile.isSelf}
                  canEndorse={profile.canEndorse}
                  busySkill={busySkill}
                  error={actionError}
                  onAddSkill={(key) => void skillAction('add-skill', key)}
                  onRemoveSkill={(key) => void skillAction('remove-skill', key)}
                  onEndorse={(key) => void skillAction('endorse', key)}
                />
              )}
              {activeTab === 'portfolio' && (
                <PortfolioTab portfolio={payload.portfolio} profile={profile} stats={stats} />
              )}
              {activeTab === 'about' && (
                <AboutTab profile={profile} portfolio={payload.portfolio} />
              )}
            </div>
          </>
        )}

        <p className="px-1 pb-1 text-[9px] leading-relaxed text-[var(--text-muted)]">
          Platform-verified statistics are derived from stored battle records. Portfolio and skills
          are user-submitted or community-endorsed claims, not verified professional qualifications.
        </p>
      </div>

      {messageOpen && (
        <MessageModal
          open
          targetName={profile.displayName}
          onClose={() => setMessageOpen(false)}
          onSend={async (body) => {
            await runProfileAction(username, { action: 'message', body });
          }}
        />
      )}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-3 px-4 py-5 sm:py-7">
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="h-32 bg-[var(--surface-muted)] sm:h-44" />
        <div className="space-y-3 p-4">
          <div className="-mt-14 h-20 w-20 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]" />
          <div className="h-5 w-48 rounded bg-[var(--surface-muted)]" />
          <div className="h-3 w-32 rounded bg-[var(--surface-muted)]" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-9">
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={index} className="h-14 rounded-lg border border-[var(--border)] bg-[var(--surface)]" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-[var(--border)] bg-[var(--surface)]" />
    </div>
  );
}
