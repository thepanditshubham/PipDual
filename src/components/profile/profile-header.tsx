'use client';

import Link from 'next/link';
import {
  Check, Clock, MapPin, MessageSquare, Pencil, Swords, UserCheck, UserPlus, Users,
} from 'lucide-react';
import type { PlayerProfilePayload } from '@/lib/profile/types';
import { countryName } from '@/lib/profile/config';
import {
  CoverImage,
  OnlinePill,
  Panel,
  ProfileAvatar,
  VerifiedPill,
  formatDate,
} from './shared';

const BTN =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-45';
const BTN_PRIMARY =
  'border-[var(--accent)] bg-[var(--accent)] text-[#241c10] hover:bg-[var(--accent-hi)]';
const BTN_GHOST =
  'border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text)] hover:border-[var(--border-hi)] hover:bg-[var(--surface)]';

interface ProfileHeaderProps {
  payload: PlayerProfilePayload;
  signedIn: boolean;
  busyAction: string | null;
  actionError: string | null;
  onFollow: () => void;
  onConnect: () => void;
  onMessage: () => void;
}

export function ProfileHeader({
  payload,
  signedIn,
  busyAction,
  actionError,
  onFollow,
  onConnect,
  onMessage,
}: ProfileHeaderProps) {
  const { profile } = payload;
  const location = [profile.location, countryName(profile.country)].filter(Boolean).join(', ');
  const loginHref = `/login?next=${encodeURIComponent(`/player/${profile.username}`)}`;
  const busy = busyAction !== null;

  const followControl = profile.isSelf ? null : !signedIn ? (
    <Link href={loginHref} className={`${BTN} ${BTN_GHOST}`}>
      <UserPlus size={13} /> Follow
    </Link>
  ) : (
    <button
      type="button"
      onClick={onFollow}
      disabled={busy || (!profile.isFollowing && !profile.allowFollows)}
      className={`${BTN} ${profile.isFollowing ? BTN_GHOST : BTN_PRIMARY}`}
      title={profile.isFollowing || profile.allowFollows ? undefined : 'This trader is not accepting followers.'}
    >
      {profile.isFollowing ? <Check size={13} /> : <UserPlus size={13} />}
      {busyAction === 'follow' ? 'Saving' : profile.isFollowing ? 'Following' : 'Follow'}
    </button>
  );

  const connectControl = profile.isSelf ? null : !signedIn ? (
    <Link href={loginHref} className={`${BTN} ${BTN_GHOST}`}>
      <UserPlus size={13} /> Connect
    </Link>
  ) : (
    <button
      type="button"
      onClick={onConnect}
      disabled={busy || payload.restricted || profile.connectionStatus === 'pending_out' || profile.connectionStatus === 'connected'}
      className={`${BTN} ${BTN_GHOST}`}
      title={payload.restricted ? 'Follow this trader before connecting.' : undefined}
    >
      {profile.connectionStatus === 'connected' ? (
        <UserCheck size={13} />
      ) : profile.connectionStatus === 'pending_out' ? (
        <Clock size={13} />
      ) : (
        <UserPlus size={13} />
      )}
      {busyAction === 'connect'
        ? 'Saving'
        : profile.connectionStatus === 'connected'
          ? 'Connected'
          : profile.connectionStatus === 'pending_out'
            ? 'Pending'
            : profile.connectionStatus === 'pending_in'
              ? 'Accept'
              : 'Connect'}
    </button>
  );

  const messageControl = profile.isSelf ? null : !signedIn ? (
    <Link href={loginHref} className={`${BTN} ${BTN_GHOST}`}>
      <MessageSquare size={13} /> Message
    </Link>
  ) : (
    <button
      type="button"
      onClick={onMessage}
      disabled={busy || !profile.canMessage}
      className={`${BTN} ${BTN_GHOST}`}
      title={profile.canMessage ? undefined : 'This trader is not accepting messages.'}
    >
      <MessageSquare size={13} /> Message
    </button>
  );

  const challengeControl = profile.isSelf ? null : (
    <Link href={`/play?challenge=${encodeURIComponent(profile.username)}`} className={`${BTN} ${BTN_GHOST}`}>
      <Swords size={13} /> Challenge
    </Link>
  );

  return (
    <Panel className="overflow-hidden">
      <div
        className="relative h-32 sm:h-44"
        style={{
          background:
            'radial-gradient(ellipse at 78% 10%, rgba(255,194,92,0.18), transparent 55%), linear-gradient(135deg, #2b2b46 0%, #3a3048 55%, #4a3418 100%)',
        }}
      >
        <CoverImage src={profile.coverUrl} />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)] via-transparent to-transparent" />
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          {profile.visibility !== 'public' && (
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)]/85 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)] backdrop-blur">
              {profile.visibility === 'private' ? 'Private' : 'Followers only'}
            </span>
          )}
          <VerifiedPill verified={profile.verified} />
          <OnlinePill online={profile.online} />
        </div>
      </div>

      <div className="px-4 pb-4 sm:px-5">
        <div className="grid grid-cols-[auto_1fr] items-end gap-3 sm:grid-cols-[auto_1fr_auto]">
          <div className="-mt-10 sm:-mt-12">
            <ProfileAvatar
              src={profile.avatarUrl}
              name={profile.displayName || profile.username}
              className="h-20 w-20 border-2 border-[var(--surface)] text-xl sm:h-24 sm:w-24 sm:text-2xl"
            />
          </div>

          <div className="min-w-0 sm:pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-extrabold tracking-tight text-[var(--text)] sm:text-2xl">
                {profile.displayName}
              </h1>
              {profile.isSelf && (
                <span className="rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[var(--accent-hi)]">
                  You
                </span>
              )}
            </div>
            <p className="font-mono text-[11px] text-[var(--text-secondary)]">@{profile.username}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]">
              <span className="font-mono">{profile.traderId}</span>
              <span>Member since {formatDate(profile.createdAt)}</span>
              {location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={10} /> {location}
                </span>
              )}
            </div>
          </div>

          <div
            className={`col-span-2 items-center gap-1.5 sm:col-span-1 sm:flex sm:flex-wrap sm:justify-end sm:pb-1 ${
              profile.isSelf ? 'flex flex-wrap' : 'grid grid-cols-2'
            }`}
          >
            {profile.isSelf && (
              <Link href={`/player/${profile.username}/edit`} className={`${BTN} ${BTN_PRIMARY}`}>
                <Pencil size={13} /> Customize
              </Link>
            )}
            {followControl}
            {connectControl}
            {messageControl}
            {challengeControl}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1">
            <Users size={11} /> <strong className="text-[var(--text)]">{profile.followerCount}</strong> followers
          </span>
          <span>
            <strong className="text-[var(--text)]">{profile.followingCount}</strong> following
          </span>
        </div>

        {profile.bio && (
          <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {profile.bio}
          </p>
        )}

        {actionError && (
          <p className="mt-2 rounded-lg border border-[var(--down)]/30 bg-[var(--down)]/10 px-2.5 py-1.5 text-[10px] text-[var(--down)]">
            {actionError}
          </p>
        )}
      </div>
    </Panel>
  );
}
