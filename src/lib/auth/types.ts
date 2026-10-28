export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  /** Arena coins — the only currency. Bought with deposits, paid out by Live pots. */
  virtualBalance?: number;
  rating: number;
  riskRating: number;
  isGuest: boolean;
  role: 'user' | 'admin';
  createdAt: string;
}

export interface MatchHistoryItem {
  id: string;
  room: string;
  mode: 'standard' | 'risk';
  opponentName: string;
  opponentRating: number;
  opponentIsBot: boolean;
  userScore: number;
  opponentScore: number;
  userPnl: number;
  userDrawdown: number;
  won: boolean;
  isDraw: boolean;
  seed: number;
  createdAt: string;
}
