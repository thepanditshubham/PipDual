/** Shared public profile contracts. The JSON keys mirror get_player_profile(). */

export type ProfileVisibility = 'public' | 'followers' | 'private';
export type ConnectionStatus = 'none' | 'pending_out' | 'pending_in' | 'connected';
export type BattleResult = 'win' | 'loss' | 'draw';
export type SkillKey =
  | 'price_action'
  | 'market_structure'
  | 'liquidity_analysis'
  | 'risk_management'
  | 'technical_analysis'
  | 'trading_psychology';

export interface PlayerProfile {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  country: string | null;
  location: string | null;
  traderId: string;
  createdAt: string;
  online: boolean;
  verified: boolean;
  visibility: ProfileVisibility;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isSelf: boolean;
  connectionStatus: ConnectionStatus;
  allowFollows: boolean;
  allowMessages: boolean;
  canMessage: boolean;
  canEndorse: boolean;
  /** The owner's stored switches, needed by the editor. */
  showBattleHistory: boolean;
  showCountry: boolean;
  showSocialLinks: boolean;
  /** Whether this viewer may see the battle rows. */
  battleHistoryVisible: boolean;
}

export interface PlayerStats {
  totalDuels: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  currentStreak: number;
  highestStreak: number;
  tournamentWins: number;
  xp: number;
  rankRp: number;
  peakRp: number;
  seasonId: string;
  placementPlayed: number;
  placementTarget: number;
  seasonRank: number | null;
}

export interface PlayerBattle {
  matchId: string;
  opponent: string;
  result: BattleResult;
  mode: string;
  instrument: string;
  durationSeconds: number;
  pips: number | null;
  verified: boolean;
  createdAt: string;
}

export interface PlayerAchievement {
  id: string;
  name: string;
  description: string;
  category: string;
  rarity: 'bronze' | 'silver' | 'gold';
  progress: number;
  unlockedAt: string | null;
}

export interface PlayerSkill {
  key: SkillKey;
  endorsements: number;
  endorsedByMe: boolean;
}

export interface PlayerPortfolio {
  experience: string | null;
  preferredMarkets: string[];
  tradingStyle: string | null;
  methodology: string | null;
  preferredTimeframes: string[];
  certifications: string | null;
  socialLinks: Record<string, string>;
}

export interface ProfileActivity {
  type: 'follow' | 'endorse';
  at: string;
  skillKey?: SkillKey | null;
  actor: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface PlayerProfilePayload {
  restricted: boolean;
  profile: PlayerProfile;
  stats: PlayerStats | null;
  battles: PlayerBattle[];
  achievements: PlayerAchievement[];
  skills: PlayerSkill[];
  portfolio: PlayerPortfolio | null;
  activity: ProfileActivity[];
}
