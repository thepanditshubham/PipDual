/**
 * realtime.ts
 * Friends presence (who is online) and duel invites.
 *
 * Two transports run side by side: Supabase Realtime when the project is
 * configured, plus a BroadcastChannel bus between tabs of the same browser so
 * the lobby still feels alive without a provisioned database.
 */
import { getSupabase } from '@/lib/supabase/client';
import {
  localAliases,
  localAliasesMatch,
  postLocalMessage,
  subscribeLocalBus,
  type LocalBusMessage,
  type LocalIdentity,
} from './local';

export interface DuelInvite {
  toId: string;
  fromId: string;
  fromName: string;
  room: string;
  duration: string;
  at: number;
}

const PRESENCE_CHANNEL = 'pipduel_friends_presence';
const INVITE_CHANNEL = 'pipduel_friends_invites';
const INVITE_EVENT = 'duel_invite';

/** How long a tab stays "online" without a heartbeat. */
const PEER_TTL_MS = 12_000;
const HEARTBEAT_MS = 4_000;

interface Peer {
  identity: LocalIdentity;
  seen: number;
}

/**
 * Track this player on the shared presence channel and report the full set of
 * online identities (account ids plus `local:` aliases) whenever it changes.
 */
export function subscribePresence(
  playerId: string,
  me: { username: string; rating: number },
  onOnline: (ids: Set<string>) => void,
): () => void {
  if (!playerId) return () => {};

  const identity: LocalIdentity = {
    id: playerId,
    username: me.username,
    displayName: me.username,
    rating: me.rating,
  };

  const peers = new Map<string, Peer>();
  let remoteIds = new Set<string>();

  const emit = () => {
    const ids = new Set(remoteIds);
    for (const peer of peers.values()) {
      ids.add(peer.identity.id);
      for (const alias of localAliases(peer.identity)) ids.add(alias);
    }
    onOnline(ids);
  };

  // ── Same-browser transport ──
  const stopBus = subscribeLocalBus((message: LocalBusMessage) => {
    if (message.type !== 'presence' && message.type !== 'hello') return;
    if (message.from.id === playerId) return;
    peers.set(message.from.id, { identity: message.from, seen: Date.now() });
    emit();
    // Answer a newcomer so they learn about this tab immediately.
    if (message.type === 'hello') postLocalMessage({ type: 'presence', from: identity });
  });

  postLocalMessage({ type: 'hello', from: identity });

  const heartbeat = setInterval(() => {
    const cutoff = Date.now() - PEER_TTL_MS;
    let pruned = false;
    for (const [id, peer] of peers) {
      if (peer.seen < cutoff) {
        peers.delete(id);
        pruned = true;
      }
    }
    if (pruned) emit();
    postLocalMessage({ type: 'presence', from: identity });
  }, HEARTBEAT_MS);

  // ── Supabase transport ──
  const sb = getSupabase();
  let stopRemote = () => {};

  if (sb) {
    const channel = sb.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: playerId } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      remoteIds = new Set(Object.keys(channel.presenceState()));
      emit();
    });

    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      channel
        .track({ username: me.username, rating: me.rating, at: Date.now() })
        .catch(() => {
          /* presence is decorative — never block the lobby */
        });
    });

    stopRemote = () => {
      channel.untrack().catch(() => {});
      sb.removeChannel(channel);
    };
  }

  return () => {
    clearInterval(heartbeat);
    stopBus();
    stopRemote();
  };
}

export interface InviteChannel {
  /** Timestamp is added here so callers never touch the clock during render. */
  sendInvite: (targetId: string, invite: Omit<DuelInvite, 'toId' | 'at'>) => void;
  cleanup: () => void;
}

/**
 * Listen for invites addressed to `playerId` and send new ones over both
 * transports. Invites are filtered client-side, so one channel serves everyone.
 */
export function openInviteChannel(
  playerId: string,
  me: { username: string; rating: number },
  onInvite: (invite: DuelInvite) => void,
): InviteChannel {
  if (!playerId) return { sendInvite: () => {}, cleanup: () => {} };

  const identity: LocalIdentity = {
    id: playerId,
    username: me.username,
    displayName: me.username,
    rating: me.rating,
  };
  const mine = localAliases(identity);

  // Supabase broadcast and the local bus may both deliver the same invite.
  const seen = new Set<string>();
  const deliver = (invite: DuelInvite) => {
    const key = `${invite.fromId}:${invite.room}`;
    if (seen.has(key)) return;
    seen.add(key);
    onInvite(invite);
  };

  // ── Same-browser transport ──
  const stopBus = subscribeLocalBus((message: LocalBusMessage) => {
    if (message.type !== 'invite') return;
    if (message.invite.toId === playerId || localAliasesMatch(message.toIds, mine)) {
      deliver(message.invite);
    }
  });

  // ── Supabase transport ──
  const sb = getSupabase();
  let ready = false;
  const queue: DuelInvite[] = [];
  let inviteChannel: ReturnType<NonNullable<typeof sb>['channel']> | null = null;

  const flush = () => {
    if (!ready || !inviteChannel) return;
    while (queue.length > 0) {
      const payload = queue.shift();
      if (payload) inviteChannel.send({ type: 'broadcast', event: INVITE_EVENT, payload });
    }
  };

  if (sb) {
    inviteChannel = sb.channel(INVITE_CHANNEL);
    inviteChannel.on('broadcast', { event: INVITE_EVENT }, ({ payload }) => {
      const invite = payload as DuelInvite | undefined;
      if (invite?.toId === playerId || (invite && localAliasesMatch([invite.toId], mine))) {
        deliver(invite);
      }
    });

    inviteChannel.subscribe((status) => {
      ready = status === 'SUBSCRIBED';
      if (ready) flush();
    });
  }

  return {
    sendInvite: (targetId, invite) => {
      const payload: DuelInvite = { ...invite, toId: targetId, at: Date.now() };
      postLocalMessage({
        type: 'invite',
        from: identity,
        toIds: [targetId],
        invite: payload,
      });
      if (inviteChannel) {
        queue.push(payload);
        flush();
      }
    },
    cleanup: () => {
      stopBus();
      ready = false;
      queue.length = 0;
      if (sb && inviteChannel) sb.removeChannel(inviteChannel);
    },
  };
}
