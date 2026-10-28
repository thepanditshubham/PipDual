/**
 * mail.ts
 * The player's company inbox. Rows are written by Postgres triggers when a
 * deposit or payout changes state, so the same mail follows the player across
 * devices. A client can read its own mail and mark it read; it cannot create,
 * rewrite or delete letters.
 */
import { getSupabase } from './client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MailCategory = 'deposit' | 'withdrawal' | 'system';

export interface PlayerMail {
  id: string;
  sender: string;
  category: MailCategory;
  subject: string;
  preview: string;
  body: string;
  refId: string | null;
  coins: number | null;
  read: boolean;
  createdAt: string;
}

interface MailRow {
  id: string;
  sender: string;
  category: MailCategory;
  subject: string;
  preview: string;
  body: string;
  ref_id: string | null;
  coins: number | null;
  read_at: string | null;
  created_at: string;
}

const MAIL_COLUMNS =
  'id, sender, category, subject, preview, body, ref_id, coins, read_at, created_at';

const CACHE_PREFIX = 'pip-duel-mail:';
const CACHE_LIMIT = 50;

/** Last inbox seen on this device, painted while the network read is in flight. */
export function readCachedMails(playerId: string): PlayerMail[] {
  if (typeof window === 'undefined' || !playerId) return [];
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + playerId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlayerMail[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMailCache(playerId: string, mails: PlayerMail[]): void {
  if (typeof window === 'undefined' || !playerId) return;
  try {
    window.localStorage.setItem(
      CACHE_PREFIX + playerId,
      JSON.stringify(mails.slice(0, CACHE_LIMIT)),
    );
  } catch {
    // Storage full or blocked; the next network read still works.
  }
}

/** Gmail-style stamp: Today / Yesterday / 3d ago / Oct 21. */
export function formatMailStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);

  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * The player's own inbox, newest first. Null means the read itself was
 * unavailable (offline build or missing mailbox table), which the UI shows
 * as a setup hint rather than an empty inbox.
 */
export async function fetchMyMails(playerId: string): Promise<PlayerMail[] | null> {
  const sb = getSupabase();
  if (!sb || !UUID_RE.test(playerId)) return null;

  const { data, error } = await sb
    .from('player_mails')
    .select(MAIL_COLUMNS)
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('[mail] inbox read failed:', error.message);
    return null;
  }

  const mails = (data as MailRow[]).map((row) => ({
    id: row.id,
    sender: row.sender,
    category: row.category,
    subject: row.subject,
    preview: row.preview,
    body: row.body,
    refId: row.ref_id,
    coins: row.coins,
    read: row.read_at !== null,
    createdAt: row.created_at,
  }));

  saveMailCache(playerId, mails);
  return mails;
}

/** Mark one of the player's own letters read; RLS scopes the row. */
export async function markMailRead(mailId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const { error } = await sb
    .from('player_mails')
    .update({ read_at: new Date().toISOString() })
    .eq('id', mailId)
    .is('read_at', null);

  if (error) console.warn('[mail] mark-read failed:', error.message);
}
