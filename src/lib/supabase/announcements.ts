/**
 * announcements.ts
 *
 * The strip above the lobby header and the menu bar. Rows live in
 * public.announcements and RLS hands out only the ones switched on. The public
 * app is read-only here: publishing happens in the private operator console.
 * Reads return null when the database is unreachable, which the bar treats as
 * "nothing to show" rather than an error.
 */
import { getSupabase } from './client';

/** Mirrors the announcements.tone check constraint. */
export type AnnouncementTone = 'info' | 'promo' | 'warn' | 'critical';

export interface Announcement {
  id: string;
  title: string;
  tone: AnnouncementTone;
  linkUrl: string | null;
  linkLabel: string | null;
  live: boolean;
  createdAt: string;
  updatedAt: string;
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
 * Strips switched on for the bar, newest first. Null means the read itself was
 * unavailable — the bar treats that the same as an empty list.
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
