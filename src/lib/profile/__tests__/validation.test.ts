import { describe, expect, it } from 'vitest';
import {
  normalizeList, normalizeSocialLinks, profileActionSchema, profileUpdateSchema,
} from '@/lib/profile/validation';

describe('profile update validation', () => {
  it('accepts presentation and portfolio fields', () => {
    const parsed = profileUpdateSchema.safeParse({
      displayName: 'Ace Trader',
      bio: 'Intraday gold only.',
      location: 'Mumbai',
      country: 'in',
      visibility: 'followers',
      socialLinks: { x: 'https://x.com/ace', website: null },
      privacy: { showBattleHistory: false, allowMessages: true },
      portfolio: {
        experience: 'Six years',
        preferredMarkets: ['XAU/USD'],
        tradingStyle: 'Intraday',
        methodology: 'Liquidity sweeps into session levels.',
        preferredTimeframes: ['5m', '15m'],
        certifications: 'Self-study',
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects client-provided statistics and unknown fields', () => {
    for (const body of [
      { wins: 20 },
      { stats: { wins: 20 } },
      { displayName: 'Ace', rating: 2400 },
      { username: 'new_name' },
    ]) {
      expect(profileUpdateSchema.safeParse(body).success).toBe(false);
    }
  });

  it('rejects unsafe social URLs', () => {
    const parsed = profileUpdateSchema.safeParse({
      socialLinks: { website: 'javascript:alert(1)' },
    });
    expect(parsed.success).toBe(false);
  });

  it('enforces field lengths and list limits', () => {
    expect(profileUpdateSchema.safeParse({ bio: 'x'.repeat(281) }).success).toBe(false);
    expect(
      profileUpdateSchema.safeParse({
        portfolio: { preferredMarkets: Array.from({ length: 9 }, (_, i) => `M${i}`) },
      }).success,
    ).toBe(false);
  });

  it('rejects an empty update', () => {
    expect(profileUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe('profile actions', () => {
  it('accepts only known actions with their required fields', () => {
    expect(profileActionSchema.safeParse({ action: 'follow' }).success).toBe(true);
    expect(profileActionSchema.safeParse({ action: 'endorse', skillKey: 'risk_management' }).success).toBe(true);
    expect(profileActionSchema.safeParse({ action: 'endorse', skillKey: 'made_up' }).success).toBe(false);
    expect(profileActionSchema.safeParse({ action: 'message', body: 'hello' }).success).toBe(true);
    expect(profileActionSchema.safeParse({ action: 'message', body: '' }).success).toBe(false);
    expect(profileActionSchema.safeParse({ action: 'message', body: 'x'.repeat(1001) }).success).toBe(false);
    expect(profileActionSchema.safeParse({ action: 'follow', wins: 99 }).success).toBe(false);
  });
});

describe('normalizers', () => {
  it('drops empty social links', () => {
    expect(
      normalizeSocialLinks({ x: 'https://x.com/ace', youtube: '  ', discord: null, website: undefined }),
    ).toEqual({ x: 'https://x.com/ace' });
  });

  it('trims and deduplicates list fields', () => {
    expect(normalizeList([' gold ', 'gold', 'fx', ''])).toEqual(['gold', 'fx']);
  });
});
