export const TICK_MS = 250;
export const TICKS = 1200;
export const START_BALANCE = 10_000;
export const NOTIONAL_PER_SIZE = 50_000;
export const ALLOWED_SIZES = [1, 2, 3, 4] as const;
export type AllowedSize = (typeof ALLOWED_SIZES)[number];
export const MAX_ACTIONS = 200;
/** Hard cap on entries (buy/sell orders, including the entry side of a reverse) per match. */
export const MAX_ORDERS_PER_MATCH = 4;

/** Match lengths offered in the ticket, keyed by ticket duration id (seconds). */
export const MATCH_DURATIONS = {
  '5m': 300,
  '10m': 600,
  '15m': 900,
} as const;
export type MatchDurationId = keyof typeof MATCH_DURATIONS;
export const DEFAULT_MATCH_DURATION: MatchDurationId = '5m';
/** Prep window between the countdown and the first tick ("+ 1 min lobby time"). */
export const LOBBY_PREP_SECONDS = 60;

/** Battle length in seconds for a ticket duration id; unknown values fall back to the default. */
export function battleSecondsFor(duration?: string | null): number {
  if (duration && duration in MATCH_DURATIONS) {
    return MATCH_DURATIONS[duration as MatchDurationId];
  }
  return MATCH_DURATIONS[DEFAULT_MATCH_DURATION];
}

export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Raw length of a single room code segment (no dash) */
export const ROOM_CODE_SEGMENT = 5;
/** Total room code length including one dash separator: XXXXX-XXXXX */
export const ROOM_CODE_LENGTH = 11;

// ── Battle playback grid ──────────────────────────────────────────────
// One place decides how a generated day becomes a match, so the room page
// and the server-side verifier can never drift apart.

/** Minutes in a generated market day (= 1,440 one-minute bars). */
export const MINUTES_PER_DAY = 1440;
/** A battle replays 1/CHART_SLOWDOWN of the day, so each bar holds the screen longer. */
export const CHART_SLOWDOWN = 3;
/** One-minute bars a battle actually plays. The engine settles on these. */
export const PLAY_BARS = Math.floor(MINUTES_PER_DAY / CHART_SLOWDOWN);
/**
 * Prices reconstructed inside every displayed bar. This is the chart's resolution:
 * the candle grows TICKS_PER_BAR times per bar instead of appearing whole, while the
 * engine keeps reading one price per bar — so nothing about a result changes.
 */
export const TICKS_PER_BAR = 12;
/** Sub-tick cursor a battle runs to. */
export const DISPLAY_TICKS = PLAY_BARS * TICKS_PER_BAR;
/** Highest tick a submitted action may carry. */
export const MAX_ACTION_TICK = PLAY_BARS;
/**
 * The instant a battle's first bar prints, given the ticket's shared `startAt`.
 * The room plays this clock and the server re-verifies from it, so both sides look
 * at the same window of the market without ever agreeing on a price over the wire.
 */
export function battleStartFor(startAtMs: number): number {
  return startAtMs + (LOBBY_PREP_SECONDS + 3) * 1000;
}

