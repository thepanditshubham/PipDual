'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Camera, CheckCircle2, ImagePlus, Loader2, Lock, ShieldCheck, Upload, UserRound,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import {
  MAX_AVATAR_BYTES, MAX_COVER_BYTES, PROFILE_LIMITS, SOCIAL_PLATFORMS,
  VISIBILITY_OPTIONS,
} from '@/lib/profile/config';
import {
  fetchPlayerProfile, updatePlayerProfile, uploadProfileMedia,
} from '@/lib/profile/api';
import type { PlayerProfilePayload, ProfileVisibility } from '@/lib/profile/types';
import { Panel, ProfileAvatar, SectionHeader } from '@/components/profile/shared';

const INPUT =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[11px] text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]/60';
const LABEL = 'mb-1 block text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]';

interface FormState {
  displayName: string;
  bio: string;
  location: string;
  country: string;
  visibility: ProfileVisibility;
  socialLinks: Record<string, string>;
  privacy: {
    showBattleHistory: boolean;
    showCountry: boolean;
    showSocialLinks: boolean;
    allowFollows: boolean;
    allowMessages: boolean;
  };
  experience: string;
  preferredMarkets: string;
  tradingStyle: string;
  methodology: string;
  preferredTimeframes: string;
  certifications: string;
}

function formFromPayload(payload: PlayerProfilePayload): FormState {
  const { profile, portfolio } = payload;
  return {
    displayName: profile.displayName,
    bio: profile.bio ?? '',
    location: profile.location ?? '',
    country: profile.country ?? '',
    visibility: profile.visibility,
    socialLinks: { ...(portfolio?.socialLinks ?? {}) },
    privacy: {
      showBattleHistory: profile.showBattleHistory,
      showCountry: profile.showCountry,
      showSocialLinks: profile.showSocialLinks,
      allowFollows: profile.allowFollows,
      allowMessages: profile.allowMessages,
    },
    experience: portfolio?.experience ?? '',
    preferredMarkets: (portfolio?.preferredMarkets ?? []).join(', '),
    tradingStyle: portfolio?.tradingStyle ?? '',
    methodology: portfolio?.methodology ?? '',
    preferredTimeframes: (portfolio?.preferredTimeframes ?? []).join(', '),
    certifications: portfolio?.certifications ?? '',
  };
}

export default function EditProfilePage() {
  const params = useParams();
  const router = useRouter();
  const username = String(params.username ?? '').toLowerCase();
  const updateAuthProfile = useAuthStore((state) => state.updateProfile);

  const [payload, setPayload] = useState<PlayerProfilePayload | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'avatar' | 'cover' | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlayerProfile(username)
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
        setAvatarUrl(data.profile.avatarUrl);
        setCoverUrl(data.profile.coverUrl);
        if (!data.profile.isSelf) {
          setUnauthorized(true);
          return;
        }
        setForm(formFromPayload(data));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = (err as { status?: number }).status;
        if (status === 404) setNotFound(true);
        else setLoadError(err instanceof Error ? err.message : 'Could not load the profile.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setSaved(false);
  }, []);

  const setPrivacy = useCallback((key: keyof FormState['privacy'], value: boolean) => {
    setForm((current) =>
      current ? { ...current, privacy: { ...current.privacy, [key]: value } } : current,
    );
    setSaved(false);
  }, []);

  const setSocial = useCallback((key: string, value: string) => {
    setForm((current) =>
      current ? { ...current, socialLinks: { ...current.socialLinks, [key]: value } } : current,
    );
    setSaved(false);
  }, []);

  const upload = useCallback(
    async (kind: 'avatar' | 'cover', file: File) => {
      if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
        setError('Only JPEG, PNG or WebP images are accepted.');
        return;
      }
      const max = kind === 'avatar' ? MAX_AVATAR_BYTES : MAX_COVER_BYTES;
      if (file.size > max) {
        setError(`Image must be under ${Math.round(max / (1024 * 1024))} MB.`);
        return;
      }

      setUploading(kind);
      setError(null);
      try {
        const url = await uploadProfileMedia(username, kind, file);
        if (kind === 'avatar') {
          setAvatarUrl(url);
          updateAuthProfile({ avatarUrl: url });
        } else {
          setCoverUrl(url);
        }
        setSaved(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not upload the image.');
      } finally {
        setUploading(null);
      }
    },
    [username, updateAuthProfile],
  );

  const save = async () => {
    if (!form) return;
    if (form.displayName.trim().length < 2) {
      setError('Display name must be at least 2 characters.');
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const split = (value: string) =>
        value.split(',').map((item) => item.trim()).filter(Boolean);

      await updatePlayerProfile(username, {
        displayName: form.displayName.trim(),
        bio: form.bio.trim() || null,
        location: form.location.trim() || null,
        country: form.country.trim() ? form.country.trim().toUpperCase() : null,
        visibility: form.visibility,
        socialLinks: {
          x: form.socialLinks.x?.trim() || null,
          youtube: form.socialLinks.youtube?.trim() || null,
          discord: form.socialLinks.discord?.trim() || null,
          website: form.socialLinks.website?.trim() || null,
        },
        privacy: form.privacy,
        portfolio: {
          experience: form.experience.trim() || null,
          preferredMarkets: split(form.preferredMarkets),
          tradingStyle: form.tradingStyle.trim() || null,
          methodology: form.methodology.trim() || null,
          preferredTimeframes: split(form.preferredTimeframes),
          certifications: form.certifications.trim() || null,
        },
      });

      updateAuthProfile({ displayName: form.displayName.trim() });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-3 px-4 py-7">
        <div className="h-8 w-48 animate-pulse rounded bg-[var(--surface-muted)]" />
        <div className="h-72 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]" />
      </div>
    );
  }

  if (notFound) {
    return <EditMessage title="Trader not found" body="This callsign does not have a profile." />;
  }
  if (unauthorized) {
    return (
      <EditMessage
        title="You can only edit your own profile"
        body="Sign in with the account that owns this callsign. Profile writes are checked on the server and by row-level security."
      />
    );
  }
  if (loadError || !payload || !form) {
    return <EditMessage title="Profile unavailable" body={loadError ?? 'Could not load the profile editor.'} />;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:py-7">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link
            href={`/player/${username}`}
            className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={11} /> Back to profile
          </Link>
          <h1 className="mt-1 text-xl font-extrabold text-[var(--text)]">Customize profile</h1>
          <p className="text-[10px] text-[var(--text-secondary)]">
            Presentation and portfolio fields are editable. Battle statistics are platform-recorded and never accepted from this form.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-lg border border-[var(--up)]/25 bg-[var(--up)]/5 px-2 py-1 text-[9px] text-[var(--up)]">
            <ShieldCheck size={11} /> Server-validated writes
          </span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#241c10] hover:bg-[var(--accent-hi)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <UserRound size={11} />}
            {saving ? 'Saving' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-[var(--down)]/30 bg-[var(--down)]/10 px-3 py-2 text-[10px] text-[var(--down)]">
          {error}
        </div>
      )}
      {saved && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--up)]/30 bg-[var(--up)]/10 px-3 py-2 text-[10px] text-[var(--up)]">
          <CheckCircle2 size={13} /> Profile saved.
        </div>
      )}

      <div className="space-y-3">
        <Panel>
          <SectionHeader eyebrow="Media" title="Avatar and cover" />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
              <div className="flex items-center gap-3">
                <ProfileAvatar src={avatarUrl} name={form.displayName || username} className="h-16 w-16 text-lg" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-[var(--text)]">Avatar</p>
                  <p className="text-[9px] text-[var(--text-muted)]">JPEG, PNG or WebP · max 2 MB</p>
                  <button
                    type="button"
                    onClick={() => avatarInput.current?.click()}
                    disabled={uploading !== null}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent-hi)] disabled:opacity-40"
                  >
                    {uploading === 'avatar' ? <Loader2 size={10} className="animate-spin" /> : <Camera size={10} />}
                    {uploading === 'avatar' ? 'Uploading' : 'Upload avatar'}
                  </button>
                </div>
              </div>
              <input
                ref={avatarInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload('avatar', file);
                  event.target.value = '';
                }}
              />
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
              <div className="relative h-20 overflow-hidden rounded-md border border-[var(--border)] bg-[linear-gradient(135deg,#2b2b46_0%,#4a3418_100%)]">
                {coverUrl ? (
                  <img src={coverUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[var(--text-muted)]">
                    <ImagePlus size={18} />
                  </div>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold text-[var(--text)]">Cover image</p>
                  <p className="text-[9px] text-[var(--text-muted)]">JPEG, PNG or WebP · max 5 MB</p>
                </div>
                <button
                  type="button"
                  onClick={() => coverInput.current?.click()}
                  disabled={uploading !== null}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent-hi)] disabled:opacity-40"
                >
                  {uploading === 'cover' ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
                  {uploading === 'cover' ? 'Uploading' : 'Upload cover'}
                </button>
              </div>
              <input
                ref={coverInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload('cover', file);
                  event.target.value = '';
                }}
              />
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionHeader eyebrow="Public identity" title="Profile details" />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <div>
              <label htmlFor="profile-display-name" className={LABEL}>Display name</label>
              <input
                id="profile-display-name"
                value={form.displayName}
                onChange={(event) => setField('displayName', event.target.value.slice(0, PROFILE_LIMITS.displayName))}
                className={INPUT}
                maxLength={PROFILE_LIMITS.displayName}
              />
            </div>
            <div>
              <label htmlFor="profile-username" className={LABEL}>Callsign (immutable)</label>
              <input id="profile-username" value={profileUsername(payload)} disabled className={`${INPUT} cursor-not-allowed opacity-60`} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="profile-bio" className={LABEL}>
                Bio <span className="normal-case tracking-normal text-[var(--text-muted)]">({form.bio.length}/{PROFILE_LIMITS.bio})</span>
              </label>
              <textarea
                id="profile-bio"
                value={form.bio}
                onChange={(event) => setField('bio', event.target.value.slice(0, PROFILE_LIMITS.bio))}
                rows={3}
                maxLength={PROFILE_LIMITS.bio}
                className={`${INPUT} resize-none`}
                placeholder="What kind of trader are you? Keep it short."
              />
            </div>
            <div>
              <label htmlFor="profile-location" className={LABEL}>Location</label>
              <input
                id="profile-location"
                value={form.location}
                onChange={(event) => setField('location', event.target.value.slice(0, PROFILE_LIMITS.location))}
                maxLength={PROFILE_LIMITS.location}
                className={INPUT}
                placeholder="Mumbai, India"
              />
            </div>
            <div>
              <label htmlFor="profile-country" className={LABEL}>Country code</label>
              <input
                id="profile-country"
                value={form.country}
                onChange={(event) => setField('country', event.target.value.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase())}
                className={INPUT}
                placeholder="IN"
                maxLength={2}
              />
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionHeader eyebrow="Self-reported links" title="Social links" />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {SOCIAL_PLATFORMS.map((platform) => (
              <div key={platform.key}>
                <label htmlFor={`social-${platform.key}`} className={LABEL}>{platform.label}</label>
                <input
                  id={`social-${platform.key}`}
                  value={form.socialLinks[platform.key] ?? ''}
                  onChange={(event) => setSocial(platform.key, event.target.value.slice(0, PROFILE_LIMITS.socialUrl))}
                  className={INPUT}
                  placeholder={platform.placeholder}
                  maxLength={PROFILE_LIMITS.socialUrl}
                />
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionHeader eyebrow="Privacy" title="Who can see this profile" />
          <div className="space-y-2 p-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {VISIBILITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setField('visibility', option.value)}
                  className={`rounded-lg border p-2.5 text-left transition-colors ${
                    form.visibility === option.value
                      ? 'border-[var(--accent)]/50 bg-[var(--accent)]/[0.08]'
                      : 'border-[var(--border)] bg-[var(--surface-muted)] hover:border-[var(--border-hi)]'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--text)]">
                    {option.value === 'private' && <Lock size={10} />}
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[9px] leading-relaxed text-[var(--text-muted)]">{option.hint}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-2 pt-2 sm:grid-cols-2">
              {[
                ['showBattleHistory', 'Show battle history'],
                ['showCountry', 'Show country'],
                ['showSocialLinks', 'Show social links'],
                ['allowFollows', 'Allow followers'],
                ['allowMessages', 'Allow messages'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[10px] text-[var(--text-secondary)]">
                  {label}
                  <input
                    type="checkbox"
                    checked={form.privacy[key as keyof FormState['privacy']]}
                    onChange={(event) => setPrivacy(key as keyof FormState['privacy'], event.target.checked)}
                    className="h-3.5 w-3.5 accent-[var(--accent)]"
                  />
                </label>
              ))}
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionHeader eyebrow="Self-reported — not verified" title="Trading portfolio" />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="portfolio-experience" className={LABEL}>Trading experience</label>
              <textarea
                id="portfolio-experience"
                value={form.experience}
                onChange={(event) => setField('experience', event.target.value.slice(0, PROFILE_LIMITS.experience))}
                rows={2}
                className={`${INPUT} resize-none`}
                placeholder="How long have you traded, and in what market?"
              />
            </div>
            <div>
              <label htmlFor="portfolio-markets" className={LABEL}>Preferred markets</label>
              <input
                id="portfolio-markets"
                value={form.preferredMarkets}
                onChange={(event) => setField('preferredMarkets', event.target.value)}
                className={INPUT}
                placeholder="XAU/USD, EUR/USD"
              />
              <p className="mt-1 text-[8px] text-[var(--text-muted)]">Comma separated, up to 8.</p>
            </div>
            <div>
              <label htmlFor="portfolio-style" className={LABEL}>Trading style</label>
              <input
                id="portfolio-style"
                value={form.tradingStyle}
                onChange={(event) => setField('tradingStyle', event.target.value.slice(0, PROFILE_LIMITS.tradingStyle))}
                className={INPUT}
                placeholder="Scalper, swing, intraday"
              />
            </div>
            <div>
              <label htmlFor="portfolio-timeframes" className={LABEL}>Preferred timeframes</label>
              <input
                id="portfolio-timeframes"
                value={form.preferredTimeframes}
                onChange={(event) => setField('preferredTimeframes', event.target.value)}
                className={INPUT}
                placeholder="5m, 15m, 1h"
              />
              <p className="mt-1 text-[8px] text-[var(--text-muted)]">Comma separated, up to 8.</p>
            </div>
            <div>
              <label htmlFor="portfolio-certifications" className={LABEL}>Certifications</label>
              <input
                id="portfolio-certifications"
                value={form.certifications}
                onChange={(event) => setField('certifications', event.target.value.slice(0, PROFILE_LIMITS.certifications))}
                className={INPUT}
                placeholder="Self-reported credentials"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="portfolio-methodology" className={LABEL}>Trading methodology</label>
              <textarea
                id="portfolio-methodology"
                value={form.methodology}
                onChange={(event) => setField('methodology', event.target.value.slice(0, PROFILE_LIMITS.methodology))}
                rows={4}
                className={`${INPUT} resize-none`}
                placeholder="How you frame setups, entries, risk and exits."
              />
            </div>
          </div>
          <p className="border-t border-[var(--border)] px-4 py-2 text-[9px] leading-relaxed text-[var(--text-muted)]">
            Portfolio fields are self-reported claims. They are shown separately from platform-verified battle statistics.
          </p>
        </Panel>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
          <p className="text-[9px] text-[var(--text-muted)]">
            Changes are validated on the server. Statistics cannot be edited.
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={`/player/${username}`}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text)]"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#241c10] hover:bg-[var(--accent-hi)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <UserRound size={11} />}
              {saving ? 'Saving' : 'Save profile'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function profileUsername(payload: PlayerProfilePayload): string {
  return payload.profile.username;
}

function EditMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Panel>
        <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)]">
            <Lock size={17} />
          </div>
          <h1 className="text-base font-bold text-[var(--text)]">{title}</h1>
          <p className="max-w-md text-[10px] leading-relaxed text-[var(--text-secondary)]">{body}</p>
          <Link
            href="/play"
            className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text)]"
          >
            Back to the arena
          </Link>
        </div>
      </Panel>
    </div>
  );
}
