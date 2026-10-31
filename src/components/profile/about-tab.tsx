'use client';

import Link from 'next/link';
import { Calendar, Lock, MapPin, Pencil, ShieldCheck, UserRound } from 'lucide-react';
import { SOCIAL_PLATFORMS, VISIBILITY_OPTIONS, countryName } from '@/lib/profile/config';
import type { PlayerProfile, PlayerPortfolio } from '@/lib/profile/types';
import { Panel, SectionHeader, formatDate } from './shared';

export function AboutTab({
  profile,
  portfolio,
}: {
  profile: PlayerProfile;
  portfolio: PlayerPortfolio | null;
}) {
  const visibility = VISIBILITY_OPTIONS.find((option) => option.value === profile.visibility);
  const location = [profile.location, countryName(profile.country)].filter(Boolean).join(', ');

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <Panel>
          <SectionHeader
            eyebrow="Profile"
            title="About this trader"
            action={
              profile.isSelf ? (
                <Link href={`/player/${profile.username}/edit`} className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--accent-hi)] hover:text-[var(--text)]">
                  <Pencil size={10} /> Edit
                </Link>
              ) : undefined
            }
          />
          <div className="space-y-3 p-4">
            <p className="whitespace-pre-line text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {profile.bio || (profile.isSelf ? 'Add a short bio from the profile editor.' : 'No bio provided.')}
            </p>
            <div className="grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-2">
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Callsign</p>
                <p className="mt-0.5 font-mono text-[11px] text-[var(--text)]">@{profile.username}</p>
              </div>
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Trader ID</p>
                <p className="mt-0.5 font-mono text-[11px] text-[var(--text)]">{profile.traderId}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  <Calendar size={9} /> Account created
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--text)]">{formatDate(profile.createdAt)}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  <MapPin size={9} /> Location
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--text)]">{location || 'Not shared'}</p>
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionHeader eyebrow="Platform trust" title="Verification and record" />
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text)]">
                <ShieldCheck size={12} className={profile.verified ? 'text-[var(--accent-hi)]' : 'text-[var(--text-muted)]'} />
                {profile.verified ? 'Verified trader' : 'Verification not granted'}
              </p>
              <p className="mt-1 text-[9px] leading-relaxed text-[var(--text-muted)]">
                Verification is a platform-issued status. It is separate from profile claims and community endorsements.
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text)]">
                <UserRound size={12} className="text-[var(--accent-hi)]" />
                Account status
              </p>
              <p className="mt-1 text-[9px] leading-relaxed text-[var(--text-muted)]">
                {profile.online ? 'Online within the last five minutes.' : 'Currently offline.'} Profile activity is limited to what this page is allowed to project.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="space-y-3">
        <Panel>
          <SectionHeader eyebrow={profile.isSelf ? 'Only visible to you' : 'Privacy'} title="Profile privacy" />
          <div className="space-y-2 p-3">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-[var(--text-muted)]">Visibility</span>
              <span className="font-semibold text-[var(--text)]">{visibility?.label ?? 'Public'}</span>
            </div>
            <p className="text-[9px] leading-relaxed text-[var(--text-muted)]">{visibility?.hint}</p>
            {profile.isSelf && (
              <>
                <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-[10px]">
                  <span className="text-[var(--text-muted)]">Battle history</span>
                  <span className="text-[var(--text)]">{profile.showBattleHistory ? 'Visible' : 'Private'}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[var(--text-muted)]">Followers</span>
                  <span className="text-[var(--text)]">{profile.allowFollows ? 'Open' : 'Closed'}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[var(--text-muted)]">Messages</span>
                  <span className="text-[var(--text)]">{profile.allowMessages ? 'Open' : 'Closed'}</span>
                </div>
              </>
            )}
            <div className="flex items-start gap-1.5 border-t border-[var(--border)] pt-2 text-[9px] leading-relaxed text-[var(--text-muted)]">
              <Lock size={10} className="mt-0.5 shrink-0" />
              Private profile fields are never sent to anonymous visitors or to players outside the selected audience.
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionHeader eyebrow="Self-reported" title="Social links" />
          {SOCIAL_PLATFORMS.every((platform) => !portfolio?.socialLinks[platform.key]) ? (
            <p className="px-3 py-4 text-[9px] text-[var(--text-muted)]">No social links shared.</p>
          ) : (
            <div className="space-y-1.5 p-3">
              {SOCIAL_PLATFORMS.filter((platform) => portfolio?.socialLinks[platform.key]).map((platform) => (
                <a
                  key={platform.key}
                  href={portfolio?.socialLinks[platform.key]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent-hi)]"
                >
                  {platform.label}
                </a>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
