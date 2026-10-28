/**
 * announcements.ts
 * The strip above the lobby header and the menu bar. Rows live in
 * public.announcements: RLS hands out only the ones switched on, and every
 * write goes through a SECURITY DEFINER function that re-checks
 * public.is_admin() — so this module never touches the table directly.
 * Reads return null when the database is unreachable or the table has not
 * been provisioned yet, which the bar paints as nothing at all rather than as
 * an error, because an empty strip is the correct fallback for a visitor.
 */
import { getSupabase } from './client';
import { FAILED } from '@/lib/admin/types';
import type { AdminResult } from '@/lib/admin/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mirrors the announcements.tone check constraint. */
export type AnnouncementTone = 'info' | 'promo' | 'warn' | 'critical';

export interface Announcement {
  id: string;
  title: string;
  tone: AnnouncementTone;
  linkUrl: string | null;
  linkLabel: string | null;
  /** False is a draft: composed, held in the console, invisible to players. */
  live: boolean;
  createdAt: string;
  updatedAt: string;
}

/** What the editor sends; `id` null composes a new strip. */
export interface AnnouncementDraft {
  id: string | null;
  title: string;
  tone: AnnouncementTone;
  linkUrl: string;
  linkLabel: string;
  live: boolean;
}

interface AnnouncementRow {
  id: string;
  title: string;
  tone: AnnouncementTone;
  link_url: string | null;
  link_label: string | null;
  live: boolean;
  created_at: string;
  updated_at: string;
}

const ANNOUNCEMENT_COLUMNS =
  'id, title, tone, link_url, link_label, live, created_at, updated_at';

function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    title: row.title,
    tone: row.tone,
    linkUrl: row.link_url,
    linkLabel: row.link_label,
    live: row.live,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CACHE_KEY = 'pip-duel-announcements';

/** The last strips seen on this device, painted while the read is in flight. */
export function readCachedAnnouncements(): Announcement[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Announcement[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === 'string') : [];
  } catch {
    return [];
  }
}

export function saveAnnouncementCache(announcements: Announcement[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(announcements.slice(0, 10)));
  } catch {
    // Storage full or blocked; the next network read still works.
  }
}

/**
 * Strips switched on for the bar, newest first. Null means the read itself
 * was unavailable — the bar treats that the same as an empty list.
 */
export async function fetchLiveAnnouncements(limit = 5): Promise<Announcement[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('announcements')
    .select(ANNOUNCEMENT_COLUMNS)
    .eq('live', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[announcements] live read failed:', error.message);
    return null;
  }

  const rows = ((data ?? []) as AnnouncementRow[]).map(toAnnouncement);
  saveAnnouncementCache(rows);
  return rows;
}

/** Every strip, drafts included — the console's own list. */
export async function fetchAnnouncements(limit = 50): Promise<Announcement[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('announcements')
    .select(ANNOUNCEMENT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[announcements] console read failed:', error.message);
    return null;
  }
  return ((data ?? []) as AnnouncementRow[]).map(toAnnouncement);
}

/** Create or edit a strip. Returns the row's id. */
export async function saveAnnouncement(draft: AnnouncementDraft): Promise<AdminResult<string>> {
  const sb = getSupabase();
  if (!sb) return FAILED;
  if (draft.id !== null && !UUID_RE.test(draft.id)) {
    return { ok: false, value: null, error: 'That strip has an unreadable id.' };
  }

  const { data, error } = await sb.rpc('admin_save_announcement', {
    p_id: draft.id,
    p_title: draft.title,
    p_tone: draft.tone,
    p_link_url: draft.linkUrl,
    p_link_label: draft.linkLabel,
    p_live: draft.live,
  });

  if (error) return { ok: false, value: null, error: error.message };
  return { ok: true, value: (data as string) ?? draft.id, error: null };
}

/** Publish or retract without going through the editor. */
export async function setAnnouncementLive(
  id: string,
  live: boolean,
): Promise<AdminResult<boolean>> {
  const sb = getSupabase();
  if (!sb) return FAILED;
  if (!UUID_RE.test(id)) return { ok: false, value: null, error: 'That strip has an unreadable id.' };

  const { data, error } = await sb.rpc('admin_set_announcement_live', {
    p_id: id,
    p_live: live,
  });

  if (error) return { ok: false, value: null, error: error.message };
  return { ok: true, value: (data as boolean) ?? live, error: null };
}

/** Retire a strip for good. */
export async function deleteAnnouncement(id: string): Promise<AdminResult<boolean>> {
  const sb = getSupabase();
  if (!sb) return FAILED;
  if (!UUID_RE.test(id)) return { ok: false, value: null, error: 'That strip has an unreadable id.' };

  const { data, error } = await sb.rpc('admin_delete_announcement', { p_id: id });

  if (error) return { ok: false, value: null, error: error.message };
  return { ok: true, value: (data as boolean) ?? true, error: null };
}
