import {
  DECAY_FLOOR_RP,
  DECAY_IDLE_DAYS,
  DECAY_PER_WEEK,
  DIVISION_RP,
  RANK_BANDS,
  rankBand,
} from './config';
import type { Division, RankPosition, RankState, TierName } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function bandForRp(rp: number): (typeof RANK_BANDS)[number] {
  const value = Math.max(0, rp);
  for (let i = RANK_BANDS.length - 1; i >= 0; i -= 1) {
    const band = RANK_BANDS[i];
    // Market Wizard is the top-100 seasonal designation, not an RP tier, so it
    // never resolves from RP — Master is the top of the ladder proper.
    if (band.name === 'Market Wizard') continue;
    if (value >= band.minRp) return band;
  }
  return RANK_BANDS[0];
}

export function tierForRp(rp: number): TierName {
  return bandForRp(rp).name;
}

/**
 * Resolve RP into a tier + division. Divisions are 200 RP wide, III → II → I.
 * Master and Market Wizard have no divisions.
 */
export function rankPosition(rp: number): RankPosition {
  const band = bandForRp(rp);
  const value = Math.max(0, rp);

  if (band.divisions.length === 0) {
    return {
      tier: band.name,
      division: null,
      tierLabel: band.name,
      floor: band.minRp,
      ceiling: band.maxRp,
      intoDivision: value - band.minRp,
      needed: 0,
      percent: 100,
      nextLabel: null,
      color: band.color,
    };
  }

  const index = Math.min(
    band.divisions.length - 1,
    Math.floor((value - band.minRp) / DIVISION_RP),
  );
  const division = band.divisions[index] as Division;
  const floor = band.minRp + index * DIVISION_RP;
  const ceiling = band.maxRp === null ? floor + DIVISION_RP : Math.min(band.maxRp, floor + DIVISION_RP);
  const intoDivision = value - floor;
  const needed = Math.max(0, ceiling - value);

  let nextLabel: string | null;
  if (index < band.divisions.length - 1) {
    nextLabel = `${band.name} ${band.divisions[index + 1]}`;
  } else {
    const nextBand = RANK_BANDS[RANK_BANDS.findIndex((entry) => entry.name === band.name) + 1];
    nextLabel = nextBand ? (nextBand.divisions.length ? `${nextBand.name} III` : nextBand.name) : null;
  }

  return {
    tier: band.name,
    division,
    tierLabel: `${band.name} ${division}`,
    floor,
    ceiling,
    intoDivision,
    needed,
    percent: ceiling > floor ? Math.min(100, Math.round((intoDivision / (ceiling - floor)) * 100)) : 100,
    nextLabel,
    color: band.color,
  };
}

export function divisionFloorFor(rp: number): number {
  return rankPosition(rp).floor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Opponent-strength adjuster shared by wins and losses. */
export function opponentAdjustment(myRp: number, opponentRp: number): number {
  return clamp((opponentRp - myRp) / 50, -5, 5);
}

/** RP swing for one ranked duel (spec section 4). */
export function rpDelta(
  result: 'win' | 'loss' | 'draw',
  pipMargin: number,
  myRp: number,
  opponentRp: number,
): number {
  if (result === 'draw') return 0;

  const margin = Math.max(0, pipMargin);
  const marginBonus = Math.min(10, margin / 5);
  const adjust = opponentAdjustment(myRp, opponentRp);

  if (result === 'win') {
    return Math.round(15 + marginBonus + adjust);
  }

  const raw = -(10 + marginBonus) + adjust;
  return Math.round(clamp(raw, -20, -5));
}

/**
 * Repeated matches against the same opponent pay 100%, 50%, 25%, then 0%
 * inside a 24h window (anti-boosting).
 */
export function payoutMultiplier(priorMatchesWithin24h: number): number {
  if (priorMatchesWithin24h <= 0) return 1;
  if (priorMatchesWithin24h === 1) return 0.5;
  if (priorMatchesWithin24h === 2) return 0.25;
  return 0;
}

/** Starting RP after the placement window, Bronze III → Silver II. */
export function placementRp(wins: number, played: number): number {
  if (played <= 0) return 0;
  const ratio = wins / played;
  if (ratio >= 1) return 800; // Silver II
  if (ratio >= 0.75) return 600; // Silver III
  if (ratio >= 0.5) return 400; // Bronze I
  if (ratio >= 0.25) return 200; // Bronze II
  return 0; // Bronze III
}

export function higherTier(a: TierName, b: TierName): TierName {
  const ai = RANK_BANDS.findIndex((band) => band.name === a);
  const bi = RANK_BANDS.findIndex((band) => band.name === b);
  return bi > ai ? b : a;
}

/**
 * Apply a promotion/demotion with the 3-match promotion shield.
 * Bronze never demotes below Bronze III.
 */
export function moveRp(
  current: RankState,
  nextRp: number,
  now: Date,
): { state: RankState; promoted: boolean; demoted: boolean; shielded: boolean } {
  const before = rankPosition(current.rp);
  const after = rankPosition(nextRp);

  let rp = Math.max(0, Math.round(nextRp));
  let shieldMatches = current.shieldMatches;
  let shielded = false;

  const promotion = rp > current.rp && after.floor > before.floor;
  const demotion = rp < current.rp;

  if (demotion && shieldMatches > 0 && before.tier !== 'Bronze') {
    const floor = before.floor;
    if (rp < floor) {
      rp = floor;
      shielded = true;
    }
  }

  if (shieldMatches > 0) shieldMatches -= 1;
  if (promotion) shieldMatches = 3;

  const state: RankState = {
    ...current,
    rp,
    peakRp: Math.max(current.peakRp, rp),
    highestTier: higherTier(current.highestTier, rankPosition(rp).tier),
    shieldMatches,
    lastRankedAt: now.toISOString(),
  };

  return {
    state,
    promoted: promotion,
    demoted: !shielded && rp < current.rp && after.floor < before.floor,
    shielded,
  };
}

/**
 * Inactivity decay: Gold+ loses 20 RP per week after 14 days without a ranked
 * match, never below Gold I (1,200 RP).
 */
export function applyDecay(
  current: RankState,
  now: Date,
): { state: RankState; decayed: number } {
  if (!current.lastRankedAt || current.rp < DECAY_FLOOR_RP) return { state: current, decayed: 0 };

  const idleMs = now.getTime() - new Date(current.lastRankedAt).getTime();
  const idleDays = Math.floor(idleMs / DAY_MS);
  if (idleDays < DECAY_IDLE_DAYS) return { state: current, decayed: 0 };

  const weeks = Math.floor((idleDays - DECAY_IDLE_DAYS) / 7) + 1;
  const lastDecay = current.lastDecayAt ? new Date(current.lastDecayAt).getTime() : 0;
  const weeksSinceDecay = lastDecay ? Math.floor((now.getTime() - lastDecay) / (7 * DAY_MS)) : weeks;
  if (weeksSinceDecay <= 0) return { state: current, decayed: 0 };

  const loss = Math.min(current.rp - DECAY_FLOOR_RP, weeksSinceDecay * DECAY_PER_WEEK);
  if (loss <= 0) return { state: current, decayed: 0 };

  return {
    state: {
      ...current,
      rp: current.rp - loss,
      lastDecayAt: now.toISOString(),
    },
    decayed: loss,
  };
}

export function rpProgressLabel(rank: RankState): string {
  if (rank.placementPlayed < rank.placementTarget) {
    return `Placement ${rank.placementPlayed}/${rank.placementTarget}`;
  }
  const position = rankPosition(rank.rp);
  if (!position.ceiling) return `${rank.rp.toLocaleString()} RP · ${position.tierLabel}`;
  return `${position.intoDivision}/${DIVISION_RP} to ${position.nextLabel ?? position.tierLabel}`;
}

export function tierColor(name: TierName): string {
  return rankBand(name).color;
}

export function createRankState(seasonId: string, placementTarget: number): RankState {
  return {
    seasonId,
    rp: 0,
    peakRp: 0,
    highestTier: 'Bronze',
    placementPlayed: 0,
    placementWins: 0,
    placementTarget,
    shieldMatches: 0,
    lastRankedAt: null,
    lastDecayAt: null,
    weeklyRp: 0,
    weeklyKey: '',
    history: [],
  };
}
