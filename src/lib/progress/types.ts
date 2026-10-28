import type { Action, Trade } from '@/lib/engine/types';

/* ─────────────────────────────── identity ─────────────────────────────── */

export type GameModeTag = 'ranked' | 'friendly' | 'practice';
export type MatchOutcome = 'win' | 'loss' | 'draw';

export type TierName =
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Diamond'
  | 'Master'
  | 'Market Wizard';

export type Division = 'III' | 'II' | 'I';
export type ProgressTab = 'rank' | 'missions' | 'achievements' | 'leaderboard' | 'stats';

/* ───────────────────────────────── ranks ──────────────────────────────── */

export interface RankBand {
  name: TierName;
  minRp: number;
  /** Exclusive upper bound; null for the open-ended Master band. */
  maxRp: number | null;
  divisions: Division[];
  color: string;
  /** Reward preview shown in the rank ladder. */
  reward: string;
}

export interface RankPosition {
  tier: TierName;
  division: Division | null;
  tierLabel: string;
  floor: number;
  ceiling: number | null;
  intoDivision: number;
  needed: number;
  percent: number;
  nextLabel: string | null;
  color: string;
}

export interface RankHistoryEntry {
  at: string;
  rp: number;
  delta: number;
  outcome: MatchOutcome;
  matchId: string;
  opponentKey?: string;
}

export interface RankState {
  seasonId: string;
  rp: number;
  peakRp: number;
  highestTier: TierName;
  /** Ranked matches played inside the active placement window. */
  placementPlayed: number;
  placementWins: number;
  placementTarget: number;
  shieldMatches: number;
  lastRankedAt: string | null;
  lastDecayAt: string | null;
  weeklyRp: number;
  weeklyKey: string;
  history: RankHistoryEntry[];
}

/* ────────────────────────────── progression ───────────────────────────── */

export interface LevelProgress {
  level: number;
  intoLevel: number;
  needed: number;
  percent: number;
  totalXp: number;
  isMax: boolean;
}

export interface LevelUnlock {
  level: number;
  label: string;
}

/* ─────────────────────────────── missions ─────────────────────────────── */

export type MissionType = 'daily' | 'weekly';

export type MissionMetric =
  | 'matches_played'
  | 'ranked_wins'
  | 'gold_wins'
  | 'sl_match'
  | 'low_trade_match'
  | 'ranked_5m_wins'
  | 'discipline_70';

export interface MissionDef {
  id: string;
  type: MissionType;
  title: string;
  description: string;
  metric: MissionMetric;
  target: number;
  rewardXp: number;
  rewardCoins: number;
}

export interface UserMission {
  missionId: string;
  progress: number;
  claimed: boolean;
}

export interface MissionState {
  dailyKey: string;
  weeklyKey: string;
  daily: UserMission[];
  weekly: UserMission[];
  bonusClaimed: boolean;
  rerollsUsed: number;
}

export interface MissionMetrics {
  matches_played: number;
  ranked_wins: number;
  gold_wins: number;
  sl_match: number;
  low_trade_match: number;
  ranked_5m_wins: number;
  discipline_70: number;
}

/* ───────────────────────────── achievements ───────────────────────────── */

export type AchievementMetric =
  | 'sniper'
  | 'comeback'
  | 'no_revenge'
  | 'sl_always'
  | 'hot_streak'
  | 'gold_master'
  | 'perfect_pip'
  | 'nemesis';

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface AchievementTierDef {
  tier: AchievementTier;
  target: number;
  coins: number;
}

export interface AchievementDef {
  id: string;
  category: 'Skill' | 'Discipline' | 'Streak' | 'Mastery' | 'Rivalry' | 'Hidden';
  name: string;
  description: string;
  metric: AchievementMetric;
  tiers: AchievementTierDef[];
  /** Title granted when the gold tier is unlocked. */
  title?: string;
  hidden?: boolean;
}

export interface AchievementProgress {
  progress: number;
  claimed: Partial<Record<AchievementTier, boolean>>;
}

/* ─────────────────────────────── analysis ─────────────────────────────── */

export type BehaviorTag =
  | 'revenge_trade'
  | 'overtrading'
  | 'early_exit'
  | 'stop_moved_wider'
  | 'held_loser';

export interface TradeEvent {
  index: number;
  side: 'long' | 'short';
  lot: number;
  entryTick: number;
  exitTick: number;
  entryTs: number;
  exitTs: number;
  entryPrice: number;
  exitPrice: number;
  pips: number;
  pnl: number;
  slPct?: number;
  tpPct?: number;
  reason: Trade['reason'];
}

export interface DisciplineBreakdown {
  stopLoss: number;
  riskConsistency: number;
  noRevenge: number;
  patience: number;
  planAdherence: number;
}

export interface DisciplineResult {
  score: number;
  breakdown: DisciplineBreakdown;
  label: 'Disciplined' | 'Developing' | 'Needs work';
}

export interface MatchAnalysis {
  pips: number;
  maxDeficitPips: number;
  trades: TradeEvent[];
  discipline: DisciplineResult;
  behaviorTags: Partial<Record<BehaviorTag, number>>;
  entryCount: number;
  slUsage: number;
  riskRatio: number;
  reentryDelay: number | null;
  avgHoldSeconds: number;
  avgR: number;
  /** Achievement counters contributed by this match. */
  achievements: Partial<Record<AchievementMetric, number>>;
}

export interface MatchSettlementInput {
  matchId: string;
  mode: GameModeTag;
  pair: string;
  durationSeconds: number;
  result: MatchOutcome;
  /** Signed pip result for the player. */
  pips: number;
  /** Absolute pip gap to the opponent (drives the RP margin bonus). */
  pipMargin: number;
  disciplineScore: number;
  analysis: MatchAnalysis;
  opponentRp: number;
  opponentKey?: string;
  /** True when a rank shield should absorb a demotion. */
  createdAt: string;
}

/* ───────────────────────────────── stats ──────────────────────────────── */

export interface PairMastery {
  matches: number;
  wins: number;
}

export interface CareerStats {
  matches: number;
  rankedMatches: number;
  wins: number;
  losses: number;
  draws: number;
  totalPips: number;
  bestPips: number;
  worstPips: number;
  totalTrades: number;
  slTrades: number;
  maxDrawdown: number;
  holdSeconds: number;
  holdSamples: number;
  reentrySamples: number;
  reentrySeconds: number;
  riskRatioSum: number;
  riskRatioSamples: number;
  rSum: number;
  rSamples: number;
  disciplineSum: number;
  disciplineSamples: number;
  disciplineHistory: number[];
  behavior: Record<BehaviorTag, number>;
  pairs: Record<string, PairMastery>;
  rankedStreak: number;
  bestRankedStreak: number;
  /** Achievement inputs that are not one-off per match. */
  sniperMatches: number;
  comebackWins: number;
  noRevengeMatches: number;
  slAlwaysMatches: number;
  goldWins: number;
  perfectPipWins: number;
  nemesisWins: Record<string, number>;
  lastMatchAt: string | null;
}

export interface TraderDNA {
  weekKey: string;
  risk: number;
  patience: number;
  timing: number;
  discipline: number;
  consistency: number;
  insight: string;
}

/* ──────────────────────────────── season ──────────────────────────────── */

export interface SeasonInfo {
  id: string;
  number: number;
  startsAt: string;
  endsAt: string;
  daysLeft: number;
  hoursLeft: number;
}

/* ────────────────────────────────── UI ────────────────────────────────── */

export type CelebrationKind = 'level' | 'rank' | 'achievement' | 'mission' | 'season';

export interface Celebration {
  id: string;
  kind: CelebrationKind;
  title: string;
  subtitle: string;
  details: string[];
  at: string;
}

export interface ProgressNotice {
  id: string;
  message: string;
  tone: 'good' | 'info' | 'bad';
  at: string;
}

export interface RewardPacket {
  matchId: string;
  xp: number;
  rp: number;
  coins: number;
  discipline: number;
  result: MatchOutcome;
  levelBefore: number;
  levelAfter: number;
  rankBefore: RankPosition;
  rankAfter: RankPosition;
  placementDone: boolean;
  promoted: boolean;
  demoted: boolean;
  shielded: boolean;
  missionIds: string[];
  achievementIds: string[];
  xpCapReached: boolean;
}

/* ─────────────────────────────── store data ───────────────────────────── */

export interface StreakState {
  days: number;
  lastLoginDay: string;
  /** Claimed the day-7 chest for the current cycle. */
  cycleClaimed: boolean;
  pendingRestore: { days: number; missedDay: string } | null;
}

export interface ProgressData {
  userId: string | null;
  xp: number;
  seasonPassXp: number;
  rank: RankState;
  stats: CareerStats;
  missions: MissionState;
  achievements: Record<string, AchievementProgress>;
  pinned: string[];
  titles: string[];
  activeTitle: string | null;
  streak: StreakState;
  practice: { dayKey: string; xpEarned: number };
  dna: TraderDNA;
  settledMatchIds: string[];
  celebrations: Celebration[];
  notices: ProgressNotice[];
  lastLoginAt: string | null;
}

/* ─────────────────────────────── leaderboard ──────────────────────────── */

export type BoardScope = 'global' | 'india' | 'friends' | 'clan';
export type BoardPeriod = 'season' | 'weekly';

export interface BoardRow {
  rank: number;
  userId: string;
  name: string;
  rp: number;
  weekRp: number;
  tier: TierName;
  wins: number;
  matches: number;
  isYou?: boolean;
}

export interface BoardSnapshot {
  rows: BoardRow[];
  yourRow: BoardRow | null;
  takenAt: string;
  source: 'remote' | 'local' | 'legacy';
}

/* ───────────────────────────────── actions ────────────────────────────── */

export interface SettlementResult {
  data: ProgressData;
  packet: RewardPacket;
  analysis: MatchAnalysis;
}

/** Raw match facts as the terminal knows them. */
export interface MatchRecordInput {
  matchId: string;
  room: string;
  mode: GameModeTag;
  pair: string;
  durationSeconds: number;
  outcome: MatchOutcome;
  pipMargin: number;
  opponentRp: number;
  opponentKey?: string;
  actions: Action[];
  trades: Trade[];
  equity: number[];
  ticksTotal: number;
  currentPrice: number;
  openPosition: {
    direction: 'long' | 'short';
    entryPrice: number;
    size: number;
    entryTick: number;
    slPct?: number;
    tpPct?: number;
  } | null;
  createdAt: string;
}
