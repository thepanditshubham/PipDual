/**
 * local.ts
 * Browser-only friends backend.
 *
 * The Supabase project may not have the friends tables yet (or any tables at
 * all), so the lobby card keeps working from localStorage and talks to other
 * tabs of the same browser over a BroadcastChannel. Nothing here touches the
 * network: presence, requests, accepts and duel invites all ride the bus.
 */
import type { FriendEntry, FriendRelation, PlayerSummary } from '@/lib/supabase/friends';
import type { DuelInvite } from './realtime';

const STORE_PREFIX = 'pipduel_friends_v1_';
const BUS_NAME = 'pipduel_friends_bus_v1';

export const LOCAL_FRIENDS_NOTICE =
  'Saved in this browser — run supabase/setup.sql once to sync friends across devices.';

export interface LocalIdentity {
  id: string;
  username: string;
  displayName: string;
  rating?: number;
}

export type LocalBusMessage =
  | { type: 'hello' | 'presence'; from: LocalIdentity }
  | { type: 'request'; from: LocalIdentity; toIds: string[]; player: PlayerSummary }
  | { type: 'accept'; from: LocalIdentity; toIds: string[] }
  | { type: 'invite'; from: LocalIdentity; toIds: string[]; invite: DuelInvite };

interface LocalRow {
  friendshipId: string;
  player: PlayerSummary;
  relation: FriendRelation;
  at: number;
}

/* ───────────────────────────── identity helpers ───────────────────────────── */

/**
 * Every token a friend row may use to address this player: the account id, the
 * `local:`-prefixed id, and the plain username / display name.
 */
export function localAliases(person: {
  id?: string;
  username?: string;
  displayName?: string;
}): string[] {
  const out = new Set<string>();
  const push = (value?: string) => {
    const lower = value?.trim().toLowerCase();
    if (!lower) return;
    out.add(lower);
    out.add(`local:${lower}`);
  };
  push(person.id);
  push(person.username);
  push(person.displayName);
  if (person.username) push(person.username.replace(/\s+/g, ''));
  return Array.from(out);
}

export function localAliasesMatch(toIds: string[], mine: string[]): boolean {
  return toIds.some((id) => mine.includes(id.trim().toLowerCase()));
}

/* ─────────────────────────────── broadcast bus ─────────────────────────────── */

let bus: BroadcastChannel | null = null;
const listeners = new Set<(message: LocalBusMessage) => void>();

function ensureBus(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (bus) return bus;

  bus = new BroadcastChannel(BUS_NAME);
  bus.onmessage = (event: MessageEvent<LocalBusMessage>) => {
    for (const listener of listeners) listener(event.data);
  };
  return bus;
}

/** Broadcast to the other tabs — BroadcastChannel never echoes to the sender. */
export function postLocalMessage(message: LocalBusMessage): void {
  ensureBus()?.postMessage(message);
}

export function subscribeLocalBus(listener: (message: LocalBusMessage) => void): () => void {
  ensureBus();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ──────────────────────────────── persistence ──────────────────────────────── */

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadRows(selfId: string): LocalRow[] {
  if (typeof window === 'undefined' || !selfId) return [];
  try {
    const raw = window.localStorage.getItem(STORE_PREFIX + selfId);
    const parsed = raw ? (JSON.parse(raw) as LocalRow[]) : [];
    return Array.isArray(parsed) ? parsed.filter((row) => row?.player?.id) : [];
  } catch {
    return [];
  }
}

function saveRows(selfId: string, rows: LocalRow[]): void {
  if (typeof window === 'undefined' || !selfId) return;
  try {
    window.localStorage.setItem(STORE_PREFIX + selfId, JSON.stringify(rows));
  } catch {
    /* storage full or blocked — the list simply stays in memory */
  }
}

const ORDER: Record<FriendRelation, number> = { friend: 0, incoming: 1, outgoing: 2 };

export function readLocalFriends(selfId: string): FriendEntry[] {
  return loadRows(selfId)
    .map((row) => ({ ...row.player, friendshipId: row.friendshipId, relation: row.relation }))
    .sort((a, b) => ORDER[a.relation] - ORDER[b.relation] || a.displayName.localeCompare(b.displayName));
}

/** Contacts already known locally — the only "directory" available offline. */
export function searchLocalContacts(selfId: string, term: string, limit = 6): PlayerSummary[] {
  const needle = term.trim().toLowerCase();
  if (needle.length < 2) return [];

  const seen = new Set<string>();
  return loadRows(selfId)
    .map((row) => row.player)
    .filter((player) => {
      if (seen.has(player.id)) return false;
      const haystack = `${player.username} ${player.displayName}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
      seen.add(player.id);
      return true;
    })
    .slice(0, limit);
}

/** Build a friend candidate from a typed username (no profile lookup needed). */
export function playerFromUsername(term: string): PlayerSummary {
  const name = term.trim().replace(/\s+/g, ' ');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id: `local:${slug || 'player'}`,
    username: slug || 'player',
    displayName: name || 'Player',
    rating: 1200,
  };
}

/* ───────────────────────────────── mutations ───────────────────────────────── */

export function localSendRequest(
  selfId: string,
  me: LocalIdentity,
  target: PlayerSummary,
): { ok: boolean; error?: string } {
  if (!selfId) return { ok: false, error: 'Sign in to add friends.' };
  if (target.id === selfId) return { ok: false, error: 'That is your own account.' };

  const rows = loadRows(selfId);
  const existing = rows.find((row) => row.player.id === target.id);

  if (existing?.relation === 'friend') return { ok: false, error: 'You are already friends.' };

  if (existing?.relation === 'incoming') {
    existing.relation = 'friend';
    saveRows(selfId, rows);
    postLocalMessage({ type: 'accept', from: me, toIds: localAliases(target) });
    return { ok: true };
  }

  if (existing?.relation === 'outgoing') return { ok: false, error: 'Request already pending.' };

  rows.push({ friendshipId: newId(), player: target, relation: 'outgoing', at: Date.now() });
  saveRows(selfId, rows);

  postLocalMessage({
    type: 'request',
    from: me,
    toIds: localAliases(target),
    player: {
      id: me.id,
      username: me.username,
      displayName: me.displayName,
      rating: me.rating ?? 1200,
    },
  });

  return { ok: true };
}

export function localRespond(
  selfId: string,
  me: LocalIdentity,
  friendshipId: string,
  accept: boolean,
): { ok: boolean; error?: string } {
  const rows = loadRows(selfId);
  const row = rows.find((entry) => entry.friendshipId === friendshipId);
  if (!row) return { ok: false, error: 'That request is gone.' };

  if (!accept) {
    saveRows(
      selfId,
      rows.filter((entry) => entry.friendshipId !== friendshipId),
    );
    return { ok: true };
  }

  row.relation = 'friend';
  saveRows(selfId, rows);
  postLocalMessage({ type: 'accept', from: me, toIds: localAliases(row.player) });
  return { ok: true };
}

export function localRemove(selfId: string, friendshipId: string): { ok: boolean; error?: string } {
  const rows = loadRows(selfId);
  saveRows(
    selfId,
    rows.filter((entry) => entry.friendshipId !== friendshipId),
  );
  return { ok: true };
}

/**
 * Fold an incoming bus message into the local store.
 * Returns true when the friends list changed and the UI should reload.
 */
export function applyLocalMessage(
  selfId: string,
  mine: string[],
  message: LocalBusMessage,
): boolean {
  if (!selfId) return false;
  if (message.type !== 'request' && message.type !== 'accept') return false;
  if (!localAliasesMatch(message.toIds, mine)) return false;

  const rows = loadRows(selfId);
  const sender = message.from;
  const existing = rows.find(
    (row) => row.player.id === sender.id || row.player.username === sender.username,
  );

  if (message.type === 'request') {
    const player = message.player;
    const next: LocalRow = existing ?? {
      friendshipId: newId(),
      player: { ...player, id: player.id || sender.id },
      relation: 'incoming',
      at: Date.now(),
    };
    if (existing) {
      // They re-sent after a removal — surface it as a fresh request.
      existing.relation = 'incoming';
    } else {
      rows.push(next);
    }
    saveRows(selfId, rows);
    return true;
  }

  if (existing) {
    existing.relation = 'friend';
  } else {
    rows.push({
      friendshipId: newId(),
      player: {
        id: sender.id,
        username: sender.username,
        displayName: sender.displayName,
        rating: sender.rating ?? 1200,
      },
      relation: 'friend',
      at: Date.now(),
    });
  }
  saveRows(selfId, rows);
  return true;
}
