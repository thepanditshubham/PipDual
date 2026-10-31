import type { ProfileVisibility, SkillKey } from './types';

export const USERNAME_RE = /^[a-z0-9_]{3,16}$/i;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

export const PROFILE_LIMITS = {
  displayName: 32,
  bio: 280,
  location: 64,
  socialUrl: 300,
  experience: 1000,
  tradingStyle: 80,
  methodology: 1500,
  certifications: 500,
  message: 1000,
  markets: 8,
  timeframes: 8,
} as const;

export interface SkillDefinition {
  key: SkillKey;
  label: string;
  description: string;
}

export const SKILLS: SkillDefinition[] = [
  {
    key: 'price_action',
    label: 'Price Action',
    description: 'Reads structure and reaction straight from the candles.',
  },
  {
    key: 'market_structure',
    label: 'Market Structure',
    description: 'Maps swings, ranges and the levels that keep holding.',
  },
  {
    key: 'liquidity_analysis',
    label: 'Liquidity Analysis',
    description: 'Follows where stops and resting orders are likely to sit.',
  },
  {
    key: 'risk_management',
    label: 'Risk Management',
    description: 'Keeps position size and drawdown inside a defined plan.',
  },
  {
    key: 'technical_analysis',
    label: 'Technical Analysis',
    description: 'Combines indicators, levels and confluence into a setup.',
  },
  {
    key: 'trading_psychology',
    label: 'Trading Psychology',
    description: 'Manages patience, tilt and discipline through a session.',
  },
];

export const SKILL_KEYS = SKILLS.map((skill) => skill.key) as [
  SkillKey,
  ...SkillKey[],
];

export const SOCIAL_PLATFORMS = [
  { key: 'x', label: 'X / Twitter', placeholder: 'https://x.com/handle' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@handle' },
  { key: 'discord', label: 'Discord', placeholder: 'https://discord.gg/invite' },
  { key: 'website', label: 'Website', placeholder: 'https://your-site.com' },
] as const;

export const SOCIAL_KEYS = SOCIAL_PLATFORMS.map((platform) => platform.key) as [
  string,
  ...string[],
];

export const VISIBILITY_OPTIONS: {
  value: ProfileVisibility;
  label: string;
  hint: string;
}[] = [
  {
    value: 'public',
    label: 'Public',
    hint: 'Anyone can see your record, skills and portfolio.',
  },
  {
    value: 'followers',
    label: 'Followers',
    hint: 'Only players who follow you can see the full profile.',
  },
  {
    value: 'private',
    label: 'Private',
    hint: 'Only your callsign and avatar are public.',
  },
];

export function skillLabel(key: string): string {
  return SKILLS.find((skill) => skill.key === key)?.label ?? key.replaceAll('_', ' ');
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** Stable, unique display id derived from the auth UUID (never a second key). */
export function traderIdFor(userId: string): string {
  return `PD-${userId.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

export function countryName(code: string | null): string | null {
  if (!code || !/^[a-z]{2}$/i.test(code)) return null;
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? null;
  } catch {
    return code.toUpperCase();
  }
}
