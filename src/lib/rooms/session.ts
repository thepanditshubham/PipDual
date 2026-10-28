/**
 * session.ts
 * Ticket details for a room, parked in sessionStorage under `duel_<ROOMCODE>`
 * so the URL the user sees is only /play/CODE.
 */

export interface RoomSession {
  mode?: string;
  opponent?: string;
  seed?: number;
  startAt?: number;
  duration?: string;
  rivalName?: string;
  rivalRating?: number;
  host?: boolean;
  /** Set when the room was started from a friend invite. */
  invitedBy?: string;
  /**
   * True only for matchmade Live duels. Live duels settle RP, missions, XP and
   * achievements and carry a coin pot; Demo rooms, bot practice and friend
   * invites never touch the ladder or the wallet.
   */
  ranked?: boolean;
  /**
   * Coins this player paid to enter a Live duel. The pot is two of these minus
   * the house burn, and the number has to travel with the room because both
   * clients settle the same match from their own side.
   */
  stake?: number;
}

/** Query-string keys a room link may carry; all of them get parked in the stash. */
export const ROOM_SESSION_KEYS = [
  'mode',
  'opponent',
  'duration',
  'rivalName',
  'rivalRating',
  'seed',
  'startAt',
  'host',
  'ranked',
  'stake',
] as const;

const storageKey = (roomCode: string) => `duel_${roomCode}`;

export function readRoomSession(roomCode: string): RoomSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(roomCode));
    return raw ? (JSON.parse(raw) as RoomSession) : null;
  } catch {
    return null;
  }
}

/** Merge details into the room's stash (never clobbers keys you did not pass). */
export function stashRoomSession(roomCode: string, details: Partial<RoomSession>): void {
  if (typeof window === 'undefined') return;
  try {
    const merged: RoomSession = { ...(readRoomSession(roomCode) ?? {}), ...details };
    window.sessionStorage.setItem(storageKey(roomCode), JSON.stringify(merged));
  } catch {
    /* private mode / quota — the match still runs on defaults */
  }
}

/**
 * Resolve a room's ticket: URL params (old links, replays) win over the stash and
 * are written back, so the address bar can be shortened without losing the setup.
 */
export function resolveRoomSession(
  roomCode: string,
  params: { get(key: string): string | null },
): RoomSession | null {
  const stashed = readRoomSession(roomCode) ?? {};

  const fromUrl: RoomSession = {};
  for (const key of ROOM_SESSION_KEYS) {
    const value = params.get(key);
    if (value === null) continue;
    if (key === 'seed' || key === 'startAt' || key === 'rivalRating' || key === 'stake') {
      fromUrl[key] = Number(value);
    } else if (key === 'host') {
      fromUrl.host = value === 'true';
    } else if (key === 'ranked') {
      fromUrl.ranked = value === 'true';
    } else {
      fromUrl[key] = value;
    }
  }

  if (Object.keys(fromUrl).length === 0) {
    return Object.keys(stashed).length > 0 ? stashed : null;
  }

  const merged: RoomSession = { ...stashed, ...fromUrl };
  stashRoomSession(roomCode, merged);
  return merged;
}
