/**
 * challenge-board.ts
 * A realtime board of open coin duels, one notch above the fixed Live queue.
 *
 * The queue pairs two waiting players at a set entry; a challenge lets someone
 * name a bigger stake and wait for a rival to take it on. It rides the same
 * Supabase Realtime machinery the matchmaker uses — Presence to publish what is
 * open, Broadcast to shake on an acceptance — so there is no table and no
 * server round-trip: the poster is the authority on their own challenge.
 *
 * FLOW:
 * - Posting a challenge tracks it as our presence payload. Every client on the
 *   channel reads the whole presence state to build the board, so a late joiner
 *   still sees what is already open, and a poster leaving drops their card.
 * - Accepting broadcasts `challenge_accept` (addressed to the poster). Only the
 *   poster acts: they pull their card off the board, mint the room, and reply
 *   with `challenge_start` addressed back to the acceptor. Both sides then get
 *   an onMatchFound and settle a duel at the challenged stake.
 * - `broadcast: { self: false }` keeps each sender from hearing its own event,
 *   so the poster fires onMatchFound directly and the acceptor fires on the
 *   reply — never twice.
 * - READY CHECK: exactly like the queue, both tabs broadcast `match_ready` for
 *   the room they just sealed. The lobby holds its loading bar until the other
 *   side answers, so nobody walks into an arena their rival never reached.
 */
import { getSupabase } from '@/lib/supabase/client';
import { generateRoomCode } from '@/lib/matchmaking/matchmaker';
import type { MatchDurationId } from '@/lib/engine/constants';

/** How many open challenges the board ever renders, newest first. */
export const CHALLENGE_BOARD_LIMIT = 10;

/** A single client's identity on the board — one tab, one sessionId. */
export interface ChallengeIdentity {
  sessionId: string;
  userId: string | null;
  username: string;
  rating: number;
}

/**
 * A posted duel. `stake` is what EACH entrant pays (the pot maths in stakes.ts
 * doubles it and takes the house burn), so the poster's wallet only has to
 * cover `stake`, not the whole pot.
 */
export interface DuelChallenge {
  id: string;
  posterId: string;
  username: string;
  rating: number;
  stake: number;
  duration: MatchDurationId;
  createdAt: number;
}

/** Two clients agreed on a room; the page spends the stake and navigates. */
export interface ChallengeMatchPayload {
  roomCode: string;
  seed: number;
  startAt: number;
  stake: number;
  duration: MatchDurationId;
  rival: { username: string; rating: number };
}

export interface ChallengeBoardOptions {
  me: ChallengeIdentity;
  onBoard: (challenges: DuelChallenge[]) => void;
  onMatchFound: (match: ChallengeMatchPayload) => void;
  /** The rival tab answered the ready check for this room. Fires once per match. */
  onRivalReady?: (roomCode: string) => void;
  onError?: (error: unknown) => void;
}

/** Imperative controls the lobby drives from its buttons. */
export interface ChallengeBoardHandle {
  /** Publish (or replace) this client's open challenge. */
  post: (challenge: DuelChallenge) => void;
  /** Take this client's challenge off the board. */
  retract: () => void;
  /** Accept someone else's challenge and wait for their reply. */
  accept: (challenge: DuelChallenge) => void;
  /** Leave the channel entirely (call on unmount). */
  close: () => void;
}

/**
 * Sample challenges so the board shows what the flow looks like before any real
 * trader is online. They are clearly fake opponents (ids namespaced `demo_`),
 * and the lobby simulates an accept locally — the real board merges on top of
 * these as live presence arrives. Times are relative to module load so the
 * stack reads newest-first with a believable spread.
 */
const demoBase = Date.now();
const demoAgo = (minutes: number) => demoBase - minutes * 60_000;

export const DEMO_CHALLENGES: DuelChallenge[] = [
  { id: 'demo_luna', posterId: 'demo_luna', username: 'LunaScalps', rating: 1512, stake: 250, duration: '5m', createdAt: demoAgo(1) },
  { id: 'demo_rex', posterId: 'demo_rex', username: 'RexLong', rating: 1455, stake: 750, duration: '5m', createdAt: demoAgo(2) },
  { id: 'demo_dex', posterId: 'demo_dex', username: 'DexDrifter', rating: 1362, stake: 500, duration: '5m', createdAt: demoAgo(4) },
  { id: 'demo_mira', posterId: 'demo_mira', username: 'MiraScalper', rating: 1205, stake: 350, duration: '5m', createdAt: demoAgo(7) },
  { id: 'demo_aria', posterId: 'demo_aria', username: 'AriaBull', rating: 1288, stake: 1_000, duration: '5m', createdAt: demoAgo(9) },
  { id: 'demo_zed', posterId: 'demo_zed', username: 'ZedQuant', rating: 1330, stake: 1_500, duration: '5m', createdAt: demoAgo(12) },
  { id: 'demo_kai', posterId: 'demo_kai', username: 'KaiShort', rating: 1140, stake: 150, duration: '5m', createdAt: demoAgo(16) },
  { id: 'demo_ivy', posterId: 'demo_ivy', username: 'IvyVol', rating: 1090, stake: 200, duration: '5m', createdAt: demoAgo(20) },
  { id: 'demo_nova', posterId: 'demo_nova', username: 'NovaWhale', rating: 1643, stake: 2_500, duration: '5m', createdAt: demoAgo(28) },
  { id: 'demo_octo', posterId: 'demo_octo', username: 'OctoBear', rating: 1580, stake: 5_000, duration: '5m', createdAt: demoAgo(35) },
];

/** True when a card is one of the seeded demo opponents, not a real player. */
export function isDemoChallenge(id: string): boolean {
  return id.startsWith('demo_');
}

/**
 * Merge the shared board with the demo seed, newest first. Live presence always
 * wins on id so a real card never collides with its demo twin; the demo entries
 * stay put until enough real ones push them past the board limit.
 */
export function withDemoChallenges(live: DuelChallenge[]): DuelChallenge[] {
  const liveIds = new Set(live.map((c) => c.id));
  return [...live, ...DEMO_CHALLENGES.filter((c) => !liveIds.has(c.id))].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}

/** Short, collision-resistant id for a posting. */
export function makeChallengeId(): string {
  return `chal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function joinChallengeBoard(options: ChallengeBoardOptions): ChallengeBoardHandle {
  const supabase = getSupabase();
  if (!supabase) {
    options.onError?.(new Error('Supabase client unavailable'));
    return { post: () => {}, retract: () => {}, accept: () => {}, close: () => {} };
  }

  const { me, onBoard, onMatchFound, onRivalReady, onError } = options;
  const channelName = 'pipduel_challenges_v1';

  // This client's own open challenge, plus two one-shot guards: a hosted card
  // may only turn into a single match, and an accept is only pending until the
  // poster replies (or the page times it out).
  let myChallenge: DuelChallenge | null = null;
  let hostedMatchStarted = false;
  let acceptPending = false;

  // --- Ready check ---
  // Set once a duel is sealed on this channel: the room we hold and the tab we
  // expect an answer from. Guards keep the handshake room-scoped.
  let pairedRoom: string | null = null;
  let pairedRivalId: string | null = null;
  let rivalArmed = false;
  let boardClosed = false;

  const announceReady = (roomCode: string) => {
    channel.send({
      type: 'broadcast',
      event: 'match_ready',
      payload: { roomCode, playerId: me.sessionId },
    });
  };

  /** Claim the duel, tell the other tab we are holding, and retry once. */
  const sealPair = (roomCode: string, rivalId: string) => {
    pairedRoom = roomCode;
    pairedRivalId = rivalId;
    announceReady(roomCode);
    setTimeout(() => {
      if (pairedRoom === roomCode && !rivalArmed && !boardClosed) announceReady(roomCode);
    }, 1500);
  };

  const channel = supabase.channel(channelName, {
    config: {
      broadcast: { self: false },
      presence: { key: me.sessionId },
    },
  });

  // Read every presence into the board; presence carries the challenge itself,
  // so an empty-payload client (no open challenge) simply never appears.
  const readBoard = (): DuelChallenge[] => {
    const seen = new Set<string>();
    const list: DuelChallenge[] = [];
    for (const presences of Object.values(channel.presenceState())) {
      for (const p of presences as unknown[] as DuelChallenge[]) {
        if (p?.id && p?.posterId && !seen.has(p.id)) {
          seen.add(p.id);
          list.push(p);
        }
      }
    }
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  };

  const publish = () => onBoard(readBoard());

  // POSTER: someone accepted my open challenge — I own the room, so I mint it.
  channel.on('broadcast', { event: 'challenge_accept' }, ({ payload }) => {
    const { challengeId, posterId, acceptor } = payload as {
      challengeId: string;
      posterId: string;
      acceptor: ChallengeIdentity;
    };
    if (posterId !== me.sessionId) return;                 // addressed to another poster
    if (!myChallenge || myChallenge.id !== challengeId) return; // already taken / retracted
    if (hostedMatchStarted) return;                        // only ever host one duel
    hostedMatchStarted = true;

    // Drop the card so no second rival accepts the same challenge.
    channel.untrack().catch(() => {});
    publish();

    const { stake, duration } = myChallenge;
    const roomCode = generateRoomCode();
    const seed = Math.floor(100000 + Math.random() * 900000);
    /*
     * Same contract as the queue: up to 6s for the acceptor's tab to answer the
     * ready check, then the 5s both-terminals beat, plus navigation margin.
     */
    const startAt = Date.now() + 13000;

    channel.send({
      type: 'broadcast',
      event: 'challenge_start',
      payload: {
        toId: acceptor.sessionId,
        roomCode,
        seed,
        startAt,
        stake,
        duration,
        host: { sessionId: me.sessionId, username: me.username, rating: me.rating },
      },
    });

    sealPair(roomCode, acceptor.sessionId);

    onMatchFound({
      roomCode,
      seed,
      startAt,
      stake,
      duration,
      rival: { username: acceptor.username, rating: acceptor.rating },
    });
  });

  // ACCEPTOR: the poster answered my accept with the room to join.
  channel.on('broadcast', { event: 'challenge_start' }, ({ payload }) => {
    const { toId, roomCode, seed, startAt, stake, duration, host } = payload as {
      toId: string;
      roomCode: string;
      seed: number;
      startAt: number;
      stake: number;
      duration: MatchDurationId;
      host: ChallengeIdentity;
    };
    if (toId !== me.sessionId) return;   // a reply meant for a different acceptor
    if (!acceptPending) return;          // we already moved on (timed out / navigating)
    acceptPending = false;

    sealPair(roomCode, host.sessionId);

    onMatchFound({
      roomCode,
      seed,
      startAt,
      stake,
      duration,
      rival: { username: host.username, rating: host.rating },
    });
  });

  channel
    .on('broadcast', { event: 'match_ready' }, ({ payload }) => {
      // The rival tab confirming it holds this room and is arming.
      const { roomCode, playerId } = payload as { roomCode: string; playerId: string };
      if (!pairedRoom || roomCode !== pairedRoom) return;
      if (playerId !== pairedRivalId) return;
      if (rivalArmed) return;
      rivalArmed = true;
      onRivalReady?.(roomCode);
    })
    .on('presence', { event: 'sync' }, publish)
    .on('presence', { event: 'join' }, publish)
    .on('presence', { event: 'leave' }, publish);

  channel.subscribe((status, err) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onError?.(err);
  });

  return {
    post(challenge) {
      myChallenge = challenge;
      hostedMatchStarted = false;
      void channel.track(challenge as unknown as Record<string, unknown>).catch(() => {});
      // Reflect instantly; the presence sync will reconcile across clients.
      onBoard(
        [challenge, ...readBoard().filter((c) => c.id !== challenge.id)]
          .sort((a, b) => b.createdAt - a.createdAt),
      );
    },
    retract() {
      myChallenge = null;
      hostedMatchStarted = false;
      channel.untrack().catch(() => {});
      publish();
    },
    accept(challenge) {
      acceptPending = true;
      channel.send({
        type: 'broadcast',
        event: 'challenge_accept',
        payload: { challengeId: challenge.id, posterId: challenge.posterId, acceptor: me },
      });
    },
    close() {
      myChallenge = null;
      boardClosed = true;
      pairedRoom = null;
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    },
  };
}
