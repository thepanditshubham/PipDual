import { getSupabase } from '@/lib/supabase/client';
import { ROOM_CODE_CHARS, ROOM_CODE_SEGMENT } from '@/lib/engine/constants';

// --- Types ---

export interface QueuePlayer {
  id: string;       // Unique tab session ID (random UUID per page load)
  userId?: string;  // Supabase account user ID (used for dedup)
  username: string;
  rating: number;
  duration: string; // Ticket duration id ('5m' | '10m' | '15m') — players only pair on equal durations
  joinedAt: number;
}

/**
 * Queue scope. `live` pairs players who have paid a coin entry and settles a
 * pot; `demo` is free play. The two never meet, so nobody stakes coins against
 * an opponent who opted out of the pot.
 */
export type QueueScope = 'live' | 'demo';

export interface MatchFoundPayload {
  roomCode: string;
  seed: number;
  startAt: number;
  rival: QueuePlayer;
}

export interface MatchmakerOptions {
  scope: QueueScope; // Live and Demo queue separately — entries and pots stay consistent
  duration: string; // Ticket duration id; scopes the queue so only identical matches pair
  player: QueuePlayer;
  onStatusChange?: (status: 'searching' | 'matched', activeCount: number) => void;
  onMatchFound: (match: MatchFoundPayload) => void;
  onError?: (error: unknown) => void;
}

// --- Room Code ---

/**
 * Generates a 10-char room code displayed as XXXXX-XXXXX.
 * Uses unambiguous chars (no 0/O/1/I).
 */
export function generateRoomCode(): string {
  const seg = () => {
    let s = '';
    for (let i = 0; i < ROOM_CODE_SEGMENT; i++) {
      s += ROOM_CODE_CHARS.charAt(Math.floor(Math.random() * ROOM_CODE_CHARS.length));
    }
    return s;
  };
  return `${seg()}-${seg()}`;
}

// --- Matchmaking Queue ---

/**
 * Join the live matchmaking queue via Supabase Realtime Presence + Broadcast.
 *
 * DESIGN:
 * - Each browser tab has a unique player.id (session ID).
 * - We use Presence to track who is in the queue.
 * - The COORDINATOR (lexicographically smallest id among the two oldest
 *   waiting players who have DIFFERENT userIds) broadcasts a match_pair
 *   event with a shared roomCode + seed. Both clients receive the broadcast
 *   and navigate to the same room.
 * - The channel is scoped by staking scope AND ticket duration, so a player who
 *   queued for a 5-minute match can never be paired with one who picked 15
 *   minutes, and a Demo queue never meets a Live one.
 * - broadcast: { self: false } -- coordinator uses evaluateQueue() result
 *   directly; the non-coordinator receives the broadcast and reacts.
 * - Dedup guards (isMatched flag + userId dedup) prevent double-fires.
 *
 * Returns a cleanup function -- call it when leaving the queue.
 */
export function joinMatchmakingQueue(options: MatchmakerOptions): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    options.onError?.(new Error('Supabase client unavailable'));
    return () => {};
  }

  const { scope, duration, player, onStatusChange, onMatchFound, onError } = options;

  // Channel name is scope- and duration-scoped so queues never cross conditions
  const channelName = `pipduel_queue_v4_${scope}_${duration}`;

  // Single flag to prevent double-match firing
  let isMatched = false;

  const channel = supabase.channel(channelName, {
    config: {
      // self: false -- coordinator will NOT receive its own broadcast back,
      // so we handle coordinator match directly inside evaluateQueue().
      broadcast: { self: false },
      presence: { key: player.id },
    },
  });

  // Helper: extract unique players from presence state
  const getQueuedPlayers = (): QueuePlayer[] => {
    const presenceState = channel.presenceState();
    const seen = new Set<string>();
    const players: QueuePlayer[] = [];

    for (const presences of Object.values(presenceState)) {
      for (const p of (presences as unknown[]) as QueuePlayer[]) {
        if (p?.id && !seen.has(p.id)) {
          seen.add(p.id);
          players.push(p);
        }
      }
    }

    // Sort by join time ascending (oldest waiters matched first)
    players.sort((a, b) => a.joinedAt - b.joinedAt);
    return players;
  };

  // Core pairing logic
  const evaluateQueue = () => {
    if (isMatched) return;

    const players = getQueuedPlayers();

    // Report active count (always at least 1 = us)
    onStatusChange?.('searching', Math.max(1, players.length));

    if (players.length < 2) return;

    // Find a valid pair: two players with different userIds (prevent self-match)
    // Walk oldest-first and pair the first two with distinct accounts.
    let p1: QueuePlayer | null = null;
    let p2: QueuePlayer | null = null;

    for (let i = 0; i < players.length - 1; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];

        // Prevent same Supabase account from matching with itself
        const sameUser = a.userId && b.userId && a.userId === b.userId;
        // Belt-and-braces guard: never pair different match lengths
        const sameConditions = a.duration === b.duration;

        if (!sameUser && sameConditions) {
          p1 = a;
          p2 = b;
          break;
        }
      }
      if (p1) break;
    }

    if (!p1 || !p2) return;

    // Only the coordinator (lexicographically smaller id among p1/p2)
    // sends the broadcast to avoid duplicate room creation.
    const coordinatorId = p1.id < p2.id ? p1.id : p2.id;
    const isCoordinator = player.id === coordinatorId;

    // Current player must be one of the two matched players
    const iAmMatched = player.id === p1.id || player.id === p2.id;
    if (!iAmMatched) return;

    if (!isCoordinator) return; // Non-coordinator waits for broadcast

    // Coordinator: create match and broadcast
    isMatched = true;

    const roomCode = generateRoomCode();
    const seed = Math.floor(100000 + Math.random() * 900000);
    // Synchronized target start time: 5s lobby reveal countdown + 3s margin for navigation & asset prep
    const startAt = Date.now() + 8000;
    const rival = player.id === p1.id ? p2 : p1;

    // Broadcast to the non-coordinator (self: false so we will not receive it)
    channel.send({
      type: 'broadcast',
      event: 'match_pair',
      payload: { p1, p2, roomCode, seed, startAt },
    });

    onStatusChange?.('matched', 2);
    onMatchFound({ roomCode, seed, startAt, rival });
  };

  // Listen for match broadcast (non-coordinator path)
  channel.on('broadcast', { event: 'match_pair' }, ({ payload }) => {
    if (isMatched) return;

    const { p1, p2, roomCode, seed, startAt } = payload as {
      p1: QueuePlayer;
      p2: QueuePlayer;
      roomCode: string;
      seed: number;
      startAt: number;
    };

    // Verify this broadcast is for us
    const iAmP1 = p1.id === player.id;
    const iAmP2 = p2.id === player.id;
    if (!iAmP1 && !iAmP2) return;

    isMatched = true;
    const rival = iAmP1 ? p2 : p1;

    onStatusChange?.('matched', 2);
    onMatchFound({ roomCode, seed, startAt, rival });
  });

  // Presence event handlers
  channel
    .on('presence', { event: 'sync' }, evaluateQueue)
    .on('presence', { event: 'join' }, evaluateQueue)
    .on('presence', { event: 'leave' }, () => {
      if (isMatched) return;
      const players = getQueuedPlayers();
      onStatusChange?.('searching', Math.max(1, players.length));
    });

  // Subscribe and track our presence
  channel.subscribe(async (status, err) => {
    if (status === 'SUBSCRIBED') {
      try {
        await channel.track({
          id: player.id,
          userId: player.userId ?? null,
          username: player.username,
          rating: player.rating,
          duration: player.duration,
          joinedAt: player.joinedAt,
        });
        // Evaluate after a short delay to let Supabase propagate presence
        // across all connected clients (prevents immediate self-match on sync)
        setTimeout(evaluateQueue, 800);
      } catch (trackErr) {
        onError?.(trackErr);
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      onError?.(err ?? new Error(`Channel status: ${status}`));
    }
  });

  // Cleanup
  return () => {
    isMatched = true; // prevent any in-flight callbacks from firing
    channel.untrack().catch(() => {});
    supabase.removeChannel(channel);
  };
}

