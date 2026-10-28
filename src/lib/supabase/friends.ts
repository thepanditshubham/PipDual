/**
 * friends.ts
 * Supabase persistence for the friends list.
 * Every call degrades quietly when Supabase is unavailable so the lobby keeps
 * working; the UI surfaces `error` strings when a lookup really failed.
 */
import { getSupabase } from './client';

export interface PlayerSummary {
  id: string;
  username: string;
  displayName: string;
  rating: number;
}

/** friend = accepted · incoming = they asked me · outgoing = I asked them */
export type FriendRelation = 'friend' | 'incoming' | 'outgoing';

export interface FriendEntry extends PlayerSummary {
  friendshipId: string;
  relation: FriendRelation;
}

interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
}

interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
  rating: number | null;
}

export const FRIENDS_SETUP_HINT =
  'Friend storage not provisioned — run supabase/setup.sql in the Supabase SQL editor, then reload.';

function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || /does not exist|schema cache/i.test(error.message ?? '');
}

function toSummary(row: ProfileRow): PlayerSummary {
  const username = row.username ?? '';
  return {
    id: row.id,
    username,
    displayName: row.display_name || username || 'Player',
    rating: row.rating ?? 1200,
  };
}

/** Find registered players by username (min 2 characters). */
export async function searchPlayers(
  term: string,
  selfId: string,
  limit = 6,
): Promise<{ players: PlayerSummary[]; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { players: [], error: FRIENDS_SETUP_HINT };

  // PostgREST treats % and _ as wildcards; strip them so the search is literal.
  const query = term.trim().replace(/[%_]/g, '');
  if (query.length < 2) return { players: [] };

  const { data, error } = await sb
    .from('profiles')
    .select('id, username, display_name, rating')
    .ilike('username', `%${query}%`)
    .neq('id', selfId)
    .limit(limit);

  if (error) {
    return { players: [], error: isMissingTable(error) ? FRIENDS_SETUP_HINT : error.message };
  }
  return { players: ((data ?? []) as ProfileRow[]).map(toSummary) };
}

/**
 * Every friendship row that involves me, joined with the other player's profile.
 * Sorted accepted → incoming → outgoing, then alphabetically.
 */
export async function fetchFriends(selfId: string): Promise<{ entries: FriendEntry[]; error?: string }> {
  const sb = getSupabase();
  if (!sb || !selfId) return { entries: [], error: sb ? undefined : FRIENDS_SETUP_HINT };

  const { data, error } = await sb
    .from('player_friends')
    .select('id, requester_id, addressee_id, status')
    .or(`requester_id.eq.${selfId},addressee_id.eq.${selfId}`);

  if (error) {
    return { entries: [], error: isMissingTable(error) ? FRIENDS_SETUP_HINT : error.message };
  }

  const rows = (data ?? []) as FriendshipRow[];
  if (rows.length === 0) return { entries: [] };

  const otherIds = Array.from(
    new Set(rows.map((row) => (row.requester_id === selfId ? row.addressee_id : row.requester_id))),
  );

  const { data: profileData } = await sb
    .from('profiles')
    .select('id, username, display_name, rating')
    .in('id', otherIds);

  const byId = new Map<string, PlayerSummary>();
  for (const row of (profileData ?? []) as ProfileRow[]) {
    byId.set(row.id, toSummary(row));
  }

  const entries: FriendEntry[] = rows.map((row) => {
    const otherId = row.requester_id === selfId ? row.addressee_id : row.requester_id;
    const profile = byId.get(otherId) ?? {
      id: otherId,
      username: otherId,
      displayName: otherId.startsWith('guest_') ? 'Guest Trader' : 'Player',
      rating: 1200,
    };
    const relation: FriendRelation =
      row.status === 'accepted' ? 'friend' : row.requester_id === selfId ? 'outgoing' : 'incoming';

    return { ...profile, id: otherId, friendshipId: row.id, relation };
  });

  const order: Record<FriendRelation, number> = { friend: 0, incoming: 1, outgoing: 2 };
  entries.sort((a, b) => order[a.relation] - order[b.relation] || a.displayName.localeCompare(b.displayName));

  return { entries };
}

/**
 * Send a friend request. If the other player already asked us, this accepts their
 * request instead of creating a mirrored second row.
 */
export async function sendFriendRequest(
  selfId: string,
  targetId: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Friends need Supabase to be configured.' };
  if (!selfId) return { ok: false, error: 'Sign in to add friends.' };
  if (selfId === targetId) return { ok: false, error: 'That is your own account.' };

  const { data: existing, error: readError } = await sb
    .from('player_friends')
    .select('id, requester_id, addressee_id, status')
    .or(
      `and(requester_id.eq.${selfId},addressee_id.eq.${targetId}),` +
        `and(requester_id.eq.${targetId},addressee_id.eq.${selfId})`,
    )
    .limit(1)
    .maybeSingle();

  if (readError) {
    return { ok: false, error: isMissingTable(readError) ? FRIENDS_SETUP_HINT : readError.message };
  }

  if (existing) {
    const row = existing as FriendshipRow;
    if (row.status === 'accepted') return { ok: false, error: 'You are already friends.' };
    if (row.requester_id === selfId) return { ok: false, error: 'Request already pending.' };
    return respondToRequest(row.id, true);
  }

  const { error } = await sb
    .from('player_friends')
    .insert({ requester_id: selfId, addressee_id: targetId });

  if (error) {
    return { ok: false, error: isMissingTable(error) ? FRIENDS_SETUP_HINT : error.message };
  }
  return { ok: true };
}

export async function respondToRequest(
  friendshipId: string,
  accept: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!accept) return removeFriendship(friendshipId);

  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase unavailable.' };

  const { error } = await sb
    .from('player_friends')
    .update({ status: 'accepted' })
    .eq('id', friendshipId);

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function removeFriendship(
  friendshipId: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase unavailable.' };

  const { error } = await sb.from('player_friends').delete().eq('id', friendshipId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
