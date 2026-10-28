import type {
  AchievementDef,
  BehaviorTag,
  LevelUnlock,
  MissionDef,
  RankBand,
} from './types';

/* ───────────────────────────── core constants ─────────────────────────── */

export const LEVEL_CAP = 100;
export const DIVISION_RP = 200;
export const PLACEMENT_MATCHES = 5;
export const PLACEMENT_MATCHES_AFTER_RESET = 2;
export const SHIELD_MATCHES = 3;
export const DECAY_IDLE_DAYS = 14;
export const DECAY_PER_WEEK = 20;
export const DECAY_FLOOR_RP = 1200;
export const DAILY_BONUS_COINS = 50;
export const MAX_PINNED_BADGES = 3;
export const STREAK_FREEZE_COST = 50;
export const DISCIPLINE_XP_BONUS = 10;
export const DISCIPLINE_BONUS_THRESHOLD = 80;
export const PRACTICE_XP_PER_DAY = 5;
export const PRACTICE_XP = 10;
export const MEMBERS_FOR_LEADERBOARD = 10;
export const LEADERBOARD_CACHE_MS = 5 * 60 * 1000;
export const MAX_SETTLED_IDS = 250;
export const SEASON_LENGTH_WEEKS = 8;
export const SEASON_RESET_FACTOR = 0.6;

/** Gold spot: one pip = 0.1 USD of price movement. */
export const XAU_PIP_SIZE = 0.1;

/* ─────────────────────────────── rank bands ───────────────────────────── */

export const RANK_BANDS: RankBand[] = [
  {
    name: 'Bronze',
    minRp: 0,
    maxRp: 600,
    divisions: ['III', 'II', 'I'],
    color: '#b07b4f',
    reward: 'Arena beginner badge',
  },
  {
    name: 'Silver',
    minRp: 600,
    maxRp: 1200,
    divisions: ['III', 'II', 'I'],
    color: '#94a3b8',
    reward: '+100 coin ladder bonus',
  },
  {
    name: 'Gold',
    minRp: 1200,
    maxRp: 1800,
    divisions: ['III', 'II', 'I'],
    color: '#f59e0b',
    reward: '+200 coins on promotion',
  },
  {
    name: 'Platinum',
    minRp: 1800,
    maxRp: 2400,
    divisions: ['III', 'II', 'I'],
    color: '#2dd4bf',
    reward: 'Platinum title',
  },
  {
    name: 'Diamond',
    minRp: 2400,
    maxRp: 3000,
    divisions: ['III', 'II', 'I'],
    color: '#38bdf8',
    reward: 'Diamond finisher animation',
  },
  {
    name: 'Master',
    minRp: 3000,
    maxRp: null,
    divisions: [],
    color: '#a855f7',
    reward: 'Exclusive season title',
  },
  {
    name: 'Market Wizard',
    minRp: 3000,
    maxRp: null,
    divisions: [],
    color: '#facc15',
    reward: 'Top-100 global halo',
  },
];

export function rankBand(name: string): RankBand {
  return RANK_BANDS.find((band) => band.name === name) ?? RANK_BANDS[0];
}

/* ───────────────────────────── level unlocks ──────────────────────────── */

export const LEVEL_UNLOCKS: LevelUnlock[] = [
  { level: 2, label: 'Friends list and invite codes' },
  { level: 5, label: 'Daily mission reroll' },
  { level: 10, label: 'Clan create and join · first title' },
  { level: 15, label: 'Custom lobbies' },
  { level: 20, label: 'Replay library and match analytics' },
  { level: 30, label: 'Custom tournament hosting' },
  { level: 50, label: '"Veteran" title · season badge showcase' },
];

export function unlocksAt(level: number): string[] {
  return LEVEL_UNLOCKS.filter((unlock) => unlock.level === level).map((unlock) => unlock.label);
}

export function unlocksUpTo(level: number): LevelUnlock[] {
  return LEVEL_UNLOCKS.filter((unlock) => unlock.level <= level);
}

/* ─────────────────────────────── missions ─────────────────────────────── */

export const MISSION_CATALOG: MissionDef[] = [
  {
    id: 'daily_play_3',
    type: 'daily',
    title: 'Play 3 matches',
    description: 'Any mode counts — practice included.',
    metric: 'matches_played',
    target: 3,
    rewardXp: 60,
    rewardCoins: 0,
  },
  {
    id: 'daily_sl_always',
    type: 'daily',
    title: 'Use a stop loss in every trade of a match',
    description: 'Risk control is the fastest route to consistency.',
    metric: 'sl_match',
    target: 1,
    rewardXp: 80,
    rewardCoins: 0,
  },
  {
    id: 'daily_gold_win',
    type: 'daily',
    title: 'Win a Gold (XAU/USD) duel',
    description: 'Take a ranked victory on spot gold.',
    metric: 'gold_wins',
    target: 1,
    rewardXp: 0,
    rewardCoins: 30,
  },
  {
    id: 'daily_patience',
    type: 'daily',
    title: 'Finish a match with 2 or fewer trades',
    description: 'Reward patience, not screen time.',
    metric: 'low_trade_match',
    target: 1,
    rewardXp: 50,
    rewardCoins: 0,
  },
  {
    id: 'daily_ranked_5m',
    type: 'daily',
    title: 'Win a 5m ranked duel',
    description: 'The shortest format still demands a plan.',
    metric: 'ranked_5m_wins',
    target: 1,
    rewardXp: 60,
    rewardCoins: 0,
  },
  {
    id: 'daily_discipline',
    type: 'daily',
    title: 'Score 70+ Discipline in a match',
    description: 'Process over outcome.',
    metric: 'discipline_70',
    target: 1,
    rewardXp: 0,
    rewardCoins: 40,
  },
  {
    id: 'weekly_ranked_wins',
    type: 'weekly',
    title: 'Win 10 ranked duels',
    description: 'The weekly ladder grind.',
    metric: 'ranked_wins',
    target: 10,
    rewardXp: 300,
    rewardCoins: 100,
  },
  {
    id: 'weekly_discipline',
    type: 'weekly',
    title: 'Discipline score 70+ in 5 matches',
    description: 'Consistency across the week.',
    metric: 'discipline_70',
    target: 5,
    rewardXp: 250,
    rewardCoins: 0,
  },
  {
    id: 'weekly_volume',
    type: 'weekly',
    title: 'Play 20 matches',
    description: 'Volume builds the habit.',
    metric: 'matches_played',
    target: 20,
    rewardXp: 150,
    rewardCoins: 100,
  },
];

export const DAILY_MISSION_COUNT = 3;
export const WEEKLY_MISSION_COUNT = 3;

export const DAILY_POOL = MISSION_CATALOG.filter((mission) => mission.type === 'daily');
export const WEEKLY_POOL = MISSION_CATALOG.filter((mission) => mission.type === 'weekly');

export function missionDef(id: string): MissionDef | undefined {
  return MISSION_CATALOG.find((mission) => mission.id === id);
}

/* ───────────────────────────── achievements ───────────────────────────── */

function tiers(bronze: number, silver: number, gold: number) {
  return [
    { tier: 'bronze' as const, target: bronze, coins: 20 },
    { tier: 'silver' as const, target: silver, coins: 50 },
    { tier: 'gold' as const, target: gold, coins: 100 },
  ];
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'sniper',
    category: 'Skill',
    name: 'Sniper',
    description: 'Win a duel with 3 trades, all above +20 pips.',
    metric: 'sniper',
    tiers: tiers(1, 5, 25),
    title: 'The Scalper',
  },
  {
    id: 'comeback_king',
    category: 'Skill',
    name: 'Comeback King',
    description: 'Win after being 100 pips behind.',
    metric: 'comeback',
    tiers: tiers(1, 3, 10),
    title: 'Comeback King',
  },
  {
    id: 'no_revenge',
    category: 'Discipline',
    name: 'No Revenge',
    description: 'Wait 30s after a loss before the next trade.',
    metric: 'no_revenge',
    tiers: tiers(10, 50, 200),
  },
  {
    id: 'sl_always',
    category: 'Discipline',
    name: 'SL Always',
    description: 'Stop loss on every trade in a match.',
    metric: 'sl_always',
    tiers: tiers(5, 25, 100),
    title: 'Risk Manager',
  },
  {
    id: 'hot_streak',
    category: 'Streak',
    name: 'Hot Streak',
    description: 'Consecutive ranked wins.',
    metric: 'hot_streak',
    tiers: tiers(3, 5, 10),
    title: 'Streak Hunter',
  },
  {
    id: 'gold_master',
    category: 'Mastery',
    name: 'Gold Master',
    description: 'Wins on XAU/USD.',
    metric: 'gold_master',
    tiers: tiers(10, 50, 200),
    title: 'Gold Standard',
  },
  {
    id: 'perfect_pip',
    category: 'Hidden',
    name: 'Photo Finish',
    description: 'Win a duel by exactly 1.0 pip.',
    metric: 'perfect_pip',
    tiers: [{ tier: 'gold', target: 1, coins: 100 }],
    title: 'Photo Finish',
    hidden: true,
  },
  {
    id: 'nemesis',
    category: 'Rivalry',
    name: 'Nemesis',
    description: 'Beat the same player 5 times.',
    metric: 'nemesis',
    tiers: tiers(1, 3, 10),
    title: 'Nemesis',
  },
];

export const ACHIEVEMENT_TIER_LABEL: Record<'bronze' | 'silver' | 'gold', string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
};

export function achievementDef(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id);
}

/* ──────────────────────────── behaviour tags ──────────────────────────── */

export const BEHAVIOR_LABELS: Record<BehaviorTag, { label: string; hint: string }> = {
  revenge_trade: {
    label: 'Revenge trade',
    hint: 'Re-entered within 15s of a loss with a bigger lot.',
  },
  overtrading: {
    label: 'Overtrading',
    hint: 'More than 8 trades in a 3m match (scaled by duration).',
  },
  early_exit: {
    label: 'Early exit',
    hint: 'Closed in profit before 30% of the take-profit distance, 3+ times.',
  },
  stop_moved_wider: {
    label: 'Stop moved wider',
    hint: 'Stop loss moved further from price after entry.',
  },
  held_loser: {
    label: 'Held the loser',
    hint: 'Losing trade held to the bell without a stop loss.',
  },
};

/* ───────────────────────────── behaviour rules ────────────────────────── */

export const REVENGE_WINDOW_SECONDS = 15;
export const PATIENCE_TRADE_GAP_SECONDS = 20;
export const MIN_REENTRY_DELAY_SECONDS = 30;
export const OVERTRADE_BASE = 8;
export const OVERTRADE_BASE_SECONDS = 180;
export const EARLY_EXIT_TP_FRACTION = 0.3;
export const EARLY_EXIT_COUNT = 3;
export const COMEBACK_PIPS = 100;
export const SNIPER_TRADE_COUNT = 3;
export const SNIPER_MIN_PIPS = 20;
export const PERFECT_PIP_MARGIN = 1;
