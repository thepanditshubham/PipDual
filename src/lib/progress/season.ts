import {
  PLACEMENT_MATCHES_AFTER_RESET,
  SEASON_LENGTH_WEEKS,
  SEASON_RESET_FACTOR,
} from './config';
import { rankPosition, tierForRp } from './rank';
import type { RankState, SeasonInfo } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** Monday 2026-10-05 00:00 IST — the opening bell of season 1. */
const SEASON_EPOCH_MS = Date.UTC(2026, 9, 4, 18, 30);
const SEASON_MS = SEASON_LENGTH_WEEKS * WEEK_MS;

export function seasonAt(now: Date = new Date()): SeasonInfo {
  const elapsed = now.getTime() - SEASON_EPOCH_MS;
  const index = elapsed < 0 ? 0 : Math.floor(elapsed / SEASON_MS);
  const startsAt = SEASON_EPOCH_MS + index * SEASON_MS;
  const endsAt = startsAt + SEASON_MS;
  const remaining = Math.max(0, endsAt - now.getTime());

  return {
    id: `S${index + 1}`,
    number: index + 1,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    daysLeft: Math.floor(remaining / DAY_MS),
    hoursLeft: Math.floor((remaining % DAY_MS) / (60 * 60 * 1000)),
  };
}

export function seasonCountdownLabel(info: SeasonInfo): string {
  if (info.daysLeft > 0) return `Ends in ${info.daysLeft}d`;
  if (info.hoursLeft > 0) return `Ends in ${info.hoursLeft}h`;
  return 'Ending now';
}

/** Soft reset: RP drops to 60%, level/achievements/stats stay. */
export function softResetRank(current: RankState, seasonId: string): RankState {
  const rp = Math.floor(Math.max(0, current.rp) * SEASON_RESET_FACTOR);
  return {
    ...current,
    seasonId,
    rp,
    peakRp: rp,
    highestTier: tierForRp(rp),
    placementPlayed: 0,
    placementWins: 0,
    placementTarget: PLACEMENT_MATCHES_AFTER_RESET,
    shieldMatches: 0,
    weeklyRp: 0,
    weeklyKey: '',
    history: [],
  };
}

export function refreshSeason(
  current: RankState,
  now: Date = new Date(),
): { rank: RankState; rolled: boolean; season: SeasonInfo } {
  const season = seasonAt(now);
  if (current.seasonId === season.id) return { rank: current, rolled: false, season };
  return { rank: softResetRank(current, season.id), rolled: true, season };
}

export function rankDivisionLabel(rp: number): string {
  return rankPosition(rp).tierLabel;
}
