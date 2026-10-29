/**
 * private-table.ts
 * A private table is a room code two players agree on out of band: the host
 * mints it and waits in the lobby, the guest types it (or follows the invite
 * link) into the same box. Neither side opens the arena until both tabs sit on
 * the channel, so a host never starts a battle against an empty seat.
 *
 * FLOW:
 * - Both tabs join `pipduel_table_<CODE>` and publish presence carrying who
 *   they are. Presence is the handshake: a guest appearing is what tells the
 *   host to seat them, and a host appearing is what tells the guest to knock.
 * - The host is the authority. It keeps its own code as the room, mints the
 *   seed and the shared startAt, broadcasts `table_start` to the guest, then
 *   both fire onMatchFound and the lobby's ordinary MATCH FOUND reveal runs.
 * - READY CHECK: both tabs broadcast `table_ready` for the room, the same beat
 *   the queue and the challenge board use, so the entry is only charged once
 *   both terminals have actually armed.
 * - `broadcast: { self: false }` keeps each sender from hearing its own event,
 *   so the host fires onMatchFound directly and the guest fires on the reply.
 */
import { getSupabase } from '@/lib/supabase/client';
import type { MatchDurationId } from '@/lib/engine/constants';

export interface PrivateTablePlayer {
  sessionId: string;
  userId: string | null;
  username: string;
  rating: number;
}

/** What both tabs need before the reveal can paint. */
export interface PrivateTableMatch {
  roomCode: string;
  seed: number;
  startAt: number;
  stake: number;
  duration: MatchDurationId;
  rival: { username: string; rating: number };
}

export interface PrivateTableOptions {
  /** The table code itself — it is also the room code both terminals open. */
  code: string;
  role: 'host' | 'guest';
  me: PrivateTablePlayer;
  /** Host's stake; the guest learns it from `table_start`. */
  stake: number;
  duration: MatchDurationId;
  /** Host only: a rival showed up and was seated. */
  onRivalJoined?: (rival: { username: string; rating: number }) => void;
  onMatchFound: (match: PrivateTableMatch) => void;
  /** The rival tab answered the ready check. Fires once per table. */
  onRivalReady?: (roomCode: string) => void;
  onError?: (error: unknown) => void;
}

export interface PrivateTableHandle {
  /** Guest only: announce the knock again (the host may have subscribed late). */
  knock: () => void;
  /** Leave the table — untrack presence and drop the channel. */
  leave: () => void;
}

type PresenceEntry = PrivateTablePlayer & { role: 'host' | 'guest' };

/** How long both terminals get to arm before the arena opens. */
const TABLE_ARM_MS = 13_000;

/**
 * Channels this module still holds, one per table topic. Supabase hands back
 * the already-joined channel for a topic it is tracking, and realtime refuses
 * presence callbacks on a joined channel — so a second open on the same code
 * has to drop the first one before it registers anything.
 */
const liveChannels = new Map<string, () => void>();

export function openPrivateTable(options: PrivateTableOptions): PrivateTableHandle {
  const supabase = getSupabase();
  if (!supabase) {
    options.onError?.(new Error('Supabase client unavailable'));
    return { knock: () => {}, leave: () => {} };
  }

  const { code, role, me, onMatchFound, onRivalJoined, onRivalReady, onError } = options;
  const { stake, duration } = options;
  const topic = `pipduel_table_${code}`;

  // Drop a channel this tab already holds for the same table (a re-submit, a
  // remount, or a host typing their own code into the join box).
  liveChannels.get(topic)?.();
  liveChannels.delete(topic);

  const channel = supabase.channel(topic, {
    config: {
      broadcast: { self: false },
      presence: { key: me.sessionId },
    },
  });

  // One table, one seal. `rivalId` is the tab we expect the ready check from.
  let sealed = false;
  let rivalId: string | null = null;
  let rivalArmed = false;

  const announceReady = () => {
    channel.send({
      type: 'broadcast',
      event: 'table_ready',
      payload: { roomCode: code, playerId: me.sessionId },
    });
  };

  const peers = (wanted: 'host' | 'guest'): PresenceEntry[] => {
    const found: PresenceEntry[] = [];
    for (const presences of Object.values(channel.presenceState())) {
      for (const entry of presences as unknown as PresenceEntry[]) {
        if (!entry?.sessionId || entry.sessionId === me.sessionId) continue;
        if (entry.role === wanted) found.push(entry);
      }
    }
    return found;
  };

  /** Host seats the first guest it sees and hands over the room details. */
  const seatGuest = (guest: PrivateTablePlayer) => {
    if (sealed) return;
    sealed = true;
    rivalId = guest.sessionId;

    const seed = Math.floor(100000 + Math.random() * 900000);
    const startAt = Date.now() + TABLE_ARM_MS;

    channel.send({
      type: 'broadcast',
      event: 'table_start',
      payload: {
        toId: guest.sessionId,
        roomCode: code,
        seed,
        startAt,
        stake,
        duration,
        host: me,
      },
    });

    announceReady();
    onRivalJoined?.({ username: guest.username, rating: guest.rating });
    onMatchFound({
      roomCode: code,
      seed,
      startAt,
      stake,
      duration,
      rival: { username: guest.username, rating: guest.rating },
    });
  };

  const knock = () => {
    if (sealed || role !== 'guest') return;
    channel.send({ type: 'broadcast', event: 'table_join', payload: me });
  };

  // HOST: a knock arrived before presence synced.
  channel.on('broadcast', { event: 'table_join' }, ({ payload }) => {
    if (role !== 'host') return;
    const guest = payload as PrivateTablePlayer;
    if (!guest?.sessionId || guest.sessionId === me.sessionId) return;
    seatGuest(guest);
  });

  // GUEST: the host opened the table and named the room.
  channel.on('broadcast', { event: 'table_start' }, ({ payload }) => {
    if (role !== 'guest' || sealed) return;
    const start = payload as {
      toId: string;
      roomCode: string;
      seed: number;
      startAt: number;
      stake: number;
      duration: MatchDurationId;
      host: PrivateTablePlayer;
    };
    if (start.toId !== me.sessionId) return;
    sealed = true;
    rivalId = start.host.sessionId;
    announceReady();
    onMatchFound({
      roomCode: start.roomCode,
      seed: start.seed,
      startAt: start.startAt,
      stake: start.stake,
      duration: start.duration,
      rival: { username: start.host.username, rating: start.host.rating },
    });
  });

  channel.on('broadcast', { event: 'table_ready' }, ({ payload }) => {
    const ready = payload as { roomCode: string; playerId: string };
    if (!sealed || ready.roomCode !== code) return;
    if (ready.playerId !== rivalId || rivalArmed) return;
    rivalArmed = true;
    onRivalReady?.(code);
  });

  // Presence is the primary handshake; the knock/seat broadcast is the fallback
  // for tabs that subscribed on either side of each other.
  channel.on('presence', { event: 'sync' }, () => {
    if (sealed) return;
    if (role === 'host') {
      const guest = peers('guest')[0];
      if (guest) seatGuest(guest);
    } else {
      if (peers('host').length > 0) knock();
    }
  });

  channel.subscribe((status, err) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      onError?.(err);
      return;
    }
    if (status !== 'SUBSCRIBED') return;
    void channel
      .track({ role, sessionId: me.sessionId, userId: me.userId, username: me.username, rating: me.rating })
      .catch(() => {});
    // Guest knocks once we are live; the host is already listening by then.
    if (role === 'guest') knock();
  });

  /** Drop the room — untrack presence, close the channel, forget the topic. */
  const leave = () => {
    sealed = true;
    channel.untrack().catch(() => {});
    supabase.removeChannel(channel);
    if (liveChannels.get(topic) === leave) liveChannels.delete(topic);
  };

  liveChannels.set(topic, leave);

  return { knock, leave };
}
