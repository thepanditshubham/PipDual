import { z } from 'zod';
import { PROFILE_LIMITS, USERNAME_RE } from './config';

const optionalText = (max: number) =>
  z.union([z.string().trim().max(max), z.null()]).optional();

const country = z
  .union([z.string().trim().regex(/^[a-z]{2}$/i, 'Use a two-letter country code.'), z.null()])
  .optional();

const httpUrl = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    }, 'Use a valid http(s) URL.');

const optionalUrl = z.union([httpUrl(PROFILE_LIMITS.socialUrl), z.literal(''), z.null()]).optional();

export const socialLinksSchema = z
  .object({
    x: optionalUrl,
    youtube: optionalUrl,
    discord: optionalUrl,
    website: optionalUrl,
  })
  .strict();

const stringList = (maxItems: number, maxLength: number) =>
  z
    .array(z.string().trim().min(1).max(maxLength))
    .max(maxItems)
    .optional();

export const portfolioSchema = z
  .object({
    experience: optionalText(PROFILE_LIMITS.experience),
    preferredMarkets: stringList(PROFILE_LIMITS.markets, 40),
    tradingStyle: optionalText(PROFILE_LIMITS.tradingStyle),
    methodology: optionalText(PROFILE_LIMITS.methodology),
    preferredTimeframes: stringList(PROFILE_LIMITS.timeframes, 20),
    certifications: optionalText(PROFILE_LIMITS.certifications),
  })
  .strict();

export const privacySchema = z
  .object({
    showBattleHistory: z.boolean().optional(),
    showCountry: z.boolean().optional(),
    showSocialLinks: z.boolean().optional(),
    allowFollows: z.boolean().optional(),
    allowMessages: z.boolean().optional(),
  })
  .strict();

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(PROFILE_LIMITS.displayName).optional(),
    bio: optionalText(PROFILE_LIMITS.bio),
    location: optionalText(PROFILE_LIMITS.location),
    country,
    visibility: z.enum(['public', 'followers', 'private']).optional(),
    socialLinks: socialLinksSchema.optional(),
    privacy: privacySchema.optional(),
    portfolio: portfolioSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one profile field.');

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PortfolioInput = z.infer<typeof portfolioSchema>;

export const SKILL_KEY_SCHEMA = z.enum([
  'price_action',
  'market_structure',
  'liquidity_analysis',
  'risk_management',
  'technical_analysis',
  'trading_psychology',
]);

export const profileActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('follow') }).strict(),
  z.object({ action: z.literal('unfollow') }).strict(),
  z.object({ action: z.literal('connect') }).strict(),
  z.object({ action: z.literal('endorse'), skillKey: SKILL_KEY_SCHEMA }).strict(),
  z.object({ action: z.literal('add-skill'), skillKey: SKILL_KEY_SCHEMA }).strict(),
  z.object({ action: z.literal('remove-skill'), skillKey: SKILL_KEY_SCHEMA }).strict(),
  z
    .object({
      action: z.literal('message'),
      body: z.string().trim().min(1).max(PROFILE_LIMITS.message),
    })
    .strict(),
]);

export type ProfileActionInput = z.infer<typeof profileActionSchema>;

export const usernameSchema = z
  .string()
  .trim()
  .regex(USERNAME_RE, 'Invalid callsign.')
  .transform((value) => value.toLowerCase());

export const mediaKindSchema = z.enum(['avatar', 'cover']);

/** Drop empty social fields instead of storing empty strings. */
export function normalizeSocialLinks(input: Record<string, string | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ['x', 'youtube', 'discord', 'website']) {
    const value = input[key]?.trim();
    if (value) out[key] = value;
  }
  return out;
}

export function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeList(values: string[] | undefined): string[] {
  if (!values) return [];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
