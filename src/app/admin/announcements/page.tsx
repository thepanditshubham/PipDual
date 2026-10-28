'use client';

/**
 * /admin/announcements
 * The control room for the one-line strip above the lobby header and the menu
 * bar. A strip is copy, a tone, an optional link and a live switch: drafts
 * stay in this table until they are published, and pulling one off takes it
 * out of every browser at its next load — the bar never shows a row the
 * database has not marked live.
 */
import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Megaphone, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import {
  deleteAnnouncement,
  fetchAnnouncements,
  saveAnnouncement,
  setAnnouncementLive,
  type Announcement,
  type AnnouncementTone,
} from '@/lib/supabase/announcements';
import type { AdminResult } from '@/lib/admin/types';
import { TONE_STYLE } from '@/components/announcement-bar';
import {
  Gate,
  Notice,
  PageHead,
  Pill,
  Stat,
  StatStrip,
  when,
  type PillTone,
} from '@/components/admin/admin-bits';

const TONES: AnnouncementTone[] = ['info', 'promo', 'warn', 'critical'];

const TONE_LABEL: Record<AnnouncementTone, string> = {
  info: 'Info',
  promo: 'Promo',
  warn: 'Warning',
  critical: 'Critical',
};

const TONE_PILL: Record<AnnouncementTone, PillTone> = {
  info: 'accent',
  promo: 'ok',
  warn: 'pending',
  critical: 'bad',
};

/** Matches the check constraint on announcements.title. */
const TITLE_MAX = 140;

interface Draft {
  id: string | null;
  title: string;
  tone: AnnouncementTone;
  linkUrl: string;
  linkLabel: string;
  live: boolean;
}

const BLANK: Draft = { id: null, title: '', tone: 'info', linkUrl: '', linkLabel: '', live: false };

export default function AdminAnnouncementsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [strips, setStrips] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // null closes the editor; a draft with no id composes a new strip.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  // Deletions are two-step: the row asks once, and a second click commits.
  const [armDelete, setArmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await fetchAnnouncements();
    if (rows === null) {
      setUnavailable(true);
      setStrips([]);
      return;
    }
    setUnavailable(false);
    setStrips(rows);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    await load();
    setLoading(false);
  }, [load]);

  useEffect(() => {
    // Fetch-on-mount against Postgres; every state write lands after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isAdmin) void load();
  }, [isAdmin, load]);

  /** One write, one notice, one refresh — the row list is the truth after it. */
  const commit = useCallback(
    async (run: () => Promise<AdminResult<unknown>>, done: string): Promise<boolean> => {
      setBusy(true);
      const result = await run();
      setBusy(false);
      setMessage({ ok: result.ok, text: result.ok ? done : (result.error ?? 'That did not land.') });
      if (result.ok) await load();
      return result.ok;
    },
    [load],
  );

  const toggleLive = (row: Announcement) => {
    void commit(
      () => setAnnouncementLive(row.id, !row.live),
      row.live ? `Retracted “${row.title}”.` : `Published “${row.title}” to the bar.`,
    );
  };

  const remove = (row: Announcement) => {
    setArmDelete(null);
    void commit(() => deleteAnnouncement(row.id), `Deleted “${row.title}”.`);
  };

  const submit = async () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) {
      setMessage({ ok: false, text: 'The strip needs some copy before it can be saved.' });
      return;
    }
    const payload: Draft = { ...draft, title };
    const saved = await commit(
      () =>
        saveAnnouncement({
          id: payload.id,
          title: payload.title,
          tone: payload.tone,
          linkUrl: payload.linkUrl.trim(),
          linkLabel: payload.linkLabel.trim(),
          live: payload.live,
        }),
      payload.live ? 'Saved and live on the bar.' : 'Saved as a draft.',
    );
    // The editor only closes on a write that landed, so a refused save never
    // loses the copy that was typed into it.
    if (saved) setDraft(null);
  };

  const liveCount = strips.filter((row) => row.live).length;
  const preview = draft ? (TONE_STYLE[draft.tone] ?? TONE_STYLE.info) : null;

  if (!user) {
    return (
      <Gate
        title="Sign in required"
        body="Announcements are only editable from a signed-in admin account."
      />
    );
  }

  if (!isAdmin) {
    return (
      <Gate
        title="Admin access only"
        body={`Signed in as ${user.username}, which is not an admin account. Set role = 'admin' on this profile's row in Supabase to publish to the bar.`}
      />
    );
  }

  return (
    <div className="space-y-4 animate-slide-up">
      <PageHead
        eyebrow={
          <>
            <Megaphone size={12} className="text-[var(--purple)]" /> System
          </>
        }
        title="Arena"
        accent="announcements"
        body="The strip above the lobby header, the landing page and every menu-bar page. Only live rows reach a browser, and a player can dismiss a strip on their own device."
        actions={
          <>
            <button
              onClick={() => {
                setDraft({ ...BLANK });
                setArmDelete(null);
              }}
              className="flex items-center gap-2 border border-[var(--purple)] bg-[var(--purple)]/10 px-3.5 py-2 text-xs font-bold text-[var(--text)] transition-colors hover:bg-[var(--purple)]/20 cursor-pointer"
            >
              <Plus size={13} /> New strip
            </button>
            <button
              onClick={() => void reload()}
              disabled={loading}
              className="flex items-center gap-2 border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs font-bold text-[var(--text)] transition-colors hover:border-[var(--purple)] disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Reload
            </button>
          </>
        }
      />

      <StatStrip>
        <Stat bare icon={<Eye size={13} />} label="Live on the bar" value={String(liveCount)} />
        <Stat bare icon={<EyeOff size={13} />} label="Drafts" value={String(strips.length - liveCount)} />
        <Stat bare icon={<Megaphone size={13} />} label="Strips stored" value={String(strips.length)} />
        <Stat
          bare
          icon={<RefreshCw size={13} />}
          label="Last change"
          value={strips[0] ? when(strips[0].updatedAt) : '—'}
        />
      </StatStrip>

      {unavailable && (
        <div className="card p-4 text-xs text-[var(--text-secondary)]">
          Announcements are unreadable right now — the{' '}
          <code className="text-[var(--purple-light)]">announcements</code> table is missing or the
          Supabase keys are unset. Re-run{' '}
          <code className="text-[var(--purple-light)]">supabase/setup.sql</code>, then reload. Until
          it is applied the bar stays hidden and every button here reports the database error.
        </div>
      )}

      {message && <Notice ok={message.ok} text={message.text} />}

      {draft && preview && (
        <div className="card p-4 space-y-3 animate-slide-up">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[var(--text)]">
              {draft.id ? 'Edit strip' : 'Compose a strip'}
            </h2>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="border border-[var(--border)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer"
            >
              Close
            </button>
          </div>

          {/* What the operator is about to publish, painted by the bar itself. */}
          <div
            className="flex h-9 items-center gap-2 overflow-hidden border border-[var(--border)] pl-3 pr-2 text-xs"
            style={{ background: preview.bg, color: preview.text }}
          >
            <span className="h-full w-[3px] shrink-0" style={{ background: preview.edge }} aria-hidden="true" />
            <Megaphone size={13} className="shrink-0" style={{ color: preview.edge }} />
            <span className="min-w-0 flex-1 truncate font-mono font-medium tracking-wide">
              {draft.title.trim() || 'The strip reads exactly like this…'}
            </span>
            {draft.linkUrl.trim() && (
              <span
                className="shrink-0 border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
                style={{ borderColor: preview.edge, color: preview.edge }}
              >
                {draft.linkLabel.trim() || 'Details'}
              </span>
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="announcement-copy"
              className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]"
            >
              Copy — one line
            </label>
            <input
              id="announcement-copy"
              value={draft.title}
              maxLength={TITLE_MAX}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="Weekend pot is 5,000 coins — Live entries double XP through Sunday."
              className="h-9 w-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--purple)] focus:outline-none"
            />
            <p className="text-right font-mono text-[10px] text-[var(--text-muted)]">
              {draft.title.trim().length}/{TITLE_MAX}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-[160px_1fr_160px]">
            <div className="space-y-1">
              <label
                htmlFor="announcement-tone"
                className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]"
              >
                Tone
              </label>
              <select
                id="announcement-tone"
                value={draft.tone}
                onChange={(event) => setDraft({ ...draft, tone: event.target.value as AnnouncementTone })}
                className="h-9 w-full border border-[var(--border)] bg-[var(--surface-muted)] px-2 text-xs text-[var(--text)] focus:border-[var(--purple)] focus:outline-none"
              >
                {TONES.map((tone) => (
                  <option key={tone} value={tone}>
                    {TONE_LABEL[tone]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="announcement-link"
                className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]"
              >
                Link — in-app path or full URL, optional
              </label>
              <input
                id="announcement-link"
                value={draft.linkUrl}
                onChange={(event) => setDraft({ ...draft, linkUrl: event.target.value })}
                placeholder="/how-to-play  or  https://…"
                className="h-9 w-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 font-mono text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--purple)] focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="announcement-label"
                className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]"
              >
                Link label
              </label>
              <input
                id="announcement-label"
                value={draft.linkLabel}
                maxLength={24}
                onChange={(event) => setDraft({ ...draft, linkLabel: event.target.value })}
                placeholder="Details"
                className="h-9 w-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--purple)] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={draft.live}
                onChange={(event) => setDraft({ ...draft, live: event.target.checked })}
                className="h-3.5 w-3.5 accent-[var(--purple)]"
              />
              Publish to the bar {draft.live ? 'now' : 'as a draft'}
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !draft.title.trim()}
                className="flex items-center gap-2 border border-[var(--purple)] bg-[var(--purple)]/15 px-4 py-2 text-xs font-bold text-[var(--text)] transition-colors hover:bg-[var(--purple)]/25 disabled:opacity-60 cursor-pointer"
              >
                {draft.id ? 'Save changes' : 'Create strip'}
              </button>
              {draft.id && (
                <button
                  type="button"
                  onClick={() => setDraft({ ...BLANK })}
                  disabled={busy}
                  className="border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text)] disabled:opacity-60 cursor-pointer"
                >
                  Start another
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] uppercase text-[var(--text-muted)] font-semibold tracking-wider">
                <th className="p-3">Strip</th>
                <th className="p-3">Tone</th>
                <th className="p-3">State</th>
                <th className="p-3">Updated</th>
                <th className="p-3 text-right">Act</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {strips.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-[var(--text-muted)]">
                    {unavailable
                      ? 'Nothing to list until the announcements table exists.'
                      : 'No strips yet — “New strip” composes one, and it stays a draft until it is published.'}
                  </td>
                </tr>
              )}

              {strips.map((row) => {
                const armed = armDelete === row.id;
                return (
                  <tr key={row.id} className="align-top hover:bg-[var(--surface-muted)]/60">
                    <td className="p-3">
                      <span className="flex items-start gap-2">
                        <span
                          className="mt-1 h-3 w-[3px] shrink-0"
                          style={{ background: TONE_STYLE[row.tone]?.edge ?? TONE_STYLE.info.edge }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="block text-[var(--text)]">{row.title}</span>
                          {row.linkUrl && (
                            <span className="mt-0.5 block font-mono text-[10px] text-[var(--text-muted)]">
                              {(row.linkLabel ? `${row.linkLabel} · ` : '') + row.linkUrl}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="p-3">
                      <Pill tone={TONE_PILL[row.tone]}>{TONE_LABEL[row.tone]}</Pill>
                    </td>
                    <td className="p-3">
                      <Pill tone={row.live ? 'ok' : 'neutral'} title={row.live ? 'Visible to every browser' : 'Held here only'}>
                        {row.live ? 'Live' : 'Draft'}
                      </Pill>
                    </td>
                    <td className="p-3 whitespace-nowrap text-[var(--text-secondary)]">
                      {when(row.updatedAt)}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          title="Edit this strip"
                          onClick={() => {
                            setDraft({
                              id: row.id,
                              title: row.title,
                              tone: row.tone,
                              linkUrl: row.linkUrl ?? '',
                              linkLabel: row.linkLabel ?? '',
                              live: row.live,
                            });
                            setArmDelete(null);
                          }}
                          className="border border-[var(--border)] p-1.5 text-[var(--text-secondary)] transition-colors hover:border-[var(--purple)] hover:text-[var(--text)] cursor-pointer"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          title={row.live ? 'Retract from the bar' : 'Publish to the bar'}
                          onClick={() => toggleLive(row)}
                          className="border border-[var(--border)] p-1.5 text-[var(--text-secondary)] transition-colors hover:border-[var(--purple)] hover:text-[var(--text)] disabled:opacity-60 cursor-pointer"
                        >
                          {row.live ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          title={armed ? 'Click again to delete for good' : 'Delete this strip'}
                          onClick={() => (armed ? remove(row) : setArmDelete(row.id))}
                          onBlur={() => setArmDelete(null)}
                          className={`flex items-center gap-1 border p-1.5 transition-colors disabled:opacity-60 cursor-pointer ${
                            armed
                              ? 'border-[var(--down)] bg-[var(--down)]/10 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--down)]'
                              : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--down)] hover:text-[var(--down)]'
                          }`}
                        >
                          <Trash2 size={13} />
                          {armed && 'Sure?'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
