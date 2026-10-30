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
// and the server-side verifier can never drift apart. A duel runs on the wall
// clock: one minute of market is one minute of the match.

/** Minutes in a generated market day (= 1,440 one-minute bars). */
export const MINUTES_PER_DAY = 1440;
/**
 * Prices reconstructed inside every bar. At one tick per second the chart moves
 * smoothly, and these ticks are also what the engine settles on — a fill is the next
 * print of the market, never a bar that has not closed yet.
 */
export const TICKS_PER_BAR = 60;
/** Wall-clock seconds one tick occupies. */
export const TICK_SECONDS = 60 / TICKS_PER_BAR;

/**
 * One-minute bars a duel trades: the ticket's own length. A 5-minute match trades five
 * real minutes of the series, a 15-minute match fifteen — the chart clock is the match
 * clock, so a 15s candle stays open for fifteen real seconds.
 */
export function battleBarsFor(durationSeconds: number): number {
  return Math.max(1, Math.round(durationSeconds / 60));
}

/** Engine ticks a duel plays — one price per TICK_SECONDS of the match. */
export function battleTicksFor(durationSeconds: number): number {
  return battleBarsFor(durationSeconds) * TICKS_PER_BAR;
}

/** Highest tick a submitted action may carry. */
export function maxActionTickFor(durationSeconds: number): number {
  return battleTicksFor(durationSeconds) - 1;
}

/**
 * The instant a battle's first bar prints, given the ticket's shared `startAt`.
 * The room plays this clock and the server re-verifies from it, so both sides look
 * at the same window of the market without ever agreeing on a price over the wire.
 */
export function battleStartFor(startAtMs: number): number {
  return startAtMs + (LOBBY_PREP_SECONDS + 3) * 1000;
}

