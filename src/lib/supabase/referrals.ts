/**
 * referrals.ts
 * The IB (introducing broker) affiliate desk. A player's referral code is
 * their callsign and an invite link is `/register?ref=<callsign>`; nothing
 * here mints a code, which is why there is no code column to keep in sync
 * with the profile.
 *
 * The money model lives in Postgres (supabase/setup.sql §13): attribution is
 * written by the signup trigger, funding is stamped by the deposit trigger,
 * and every commission is computed by award_ib_commission() from the tier
 * ladder and the duel's stake. Commissions accrue in a separate IB balance
 * and only reach the game wallet when the player moves them with
 * transfer_ib_balance() — from there the ordinary reviewed crypto-withdrawal
 * flow cashes them out like any other coin. The numbers an admin controls
 * (switch, fee split, tier rates, promotion thresholds) are read from the
 * same rows the payouts use, so this screen can never promise what the
 * database will not pay.
 */
import { getSupabase } from './client';
import { fetchPlayerNames } from './wallet';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The master row: switch, platform fee, and the floor the house keeps. */
export interface IbConfig {
  enabled: boolean;
  /** Percent of the two pooled stakes the arena takes as the platform fee. */
  houseFeePct: number;
  /** Percent of every fee that must stay with the arena after the rebate. */
  minHousePctOfFee: number;
}

/** What the program ships with, used when the config row is unreadable. */
export const FALLBACK_IB_CONFIG: IbConfig = {
  enabled: true,
  houseFeePct: 15,
  minHousePctOfFee: 60,
};

/** One rung of the rebate ladder, editable only by an admin. */
export interface IbTier {
  level: number;
  name: string;
  /** Coins paid per 100 coins an attributed trader stakes, pre-house-floor. */
  ratePer100: number;
  /** Funded downline needed to sit at this level. */
  minFunded: number;
  active: boolean;
}

/** The caller's own line on the ladder, from ib_tier_for(). */
export interface IbTierLine {
  level: number;
  name: string;
  ratePer100: number;
  funded: number;
  /** The next rung up, when there is one to climb to. */
  nextLevel: number | null;
  nextMinFunded: number | null;
  needForNext: number;
}

/** One account this player brought in. */
export interface IbInvite {
  id: string;
  inviteeId: string;
  /** Resolved after the read: profiles has no foreign key to lean on. */
  username: string;
  /** The callsign the link carried, kept for the admin trail. */
  code: string | null;
  /** True once their deposit was approved — this count is what promotes. */
  funded: boolean;
  createdAt: string;
}

/** One commission a duel paid out, snapshotted at the tier that applied. */
export interface IbEarning {
  id: string;
  matchId: string;
  traderId: string;
  /** Resolved after the read, like the invite list. */
  traderName: string;
  stake: number;
  fee: number;
  commission: number;
  tierLevel: number;
  tierRate: number;
  createdAt: string;
}

/** A line of the rebate ladder, counted by referral_leaderboard(). */
export interface IbBoardRow {
  callsign: string;
  invites: number;
  funded: number;
  coins: number;
}

/** Everything the affiliate screen paints about one player's desk. */
export interface IbDesk {
  config: IbConfig;
  tiers: IbTier[];
  /** Null when every tier is inactive — the ladder has no rung to sit on. */
  tier: IbTierLine | null;
  balance: number;
  lifetime: number;
  invites: IbInvite[];
  earnings: IbEarning[];
}

/** A funded-upline desk as the admin console lists it. */
export interface AdminIbDesk {
  playerId: string;
  callsign: string;
  balance: number;
  lifetime: number;
}

/** A pairing with both sides named — only an admin's RLS can read it. */
export interface AdminIbPairing extends IbInvite {
  inviterId: string;
  inviterName: string;
}

/** The invite link a player hands out. Empty callsign yields an empty link. */
export function buildInviteLink(code: string): string {
  if (!code || typeof window === 'undefined') return '';
  return `${window.location.origin}/register?ref=${encodeURIComponent(code)}`;
}

/** `?ref=` off an invite link, normalised the way the database matches it. */
export function normalizeReferralCode(raw: string | null | undefined): string {
  const code = (raw ?? '').trim().toLowerCase();
  return /^[a-z0-9_]{3,16}$/.test(code) ? code : '';
}

/**
 * Whether an invite code names a real account, for the register page's
 * "Invited by …" line. Profiles are public, so this works before signup.
 */
export async function lookupReferralCode(code: string): Promise<string | null> {
  const sb = getSupabase();
  const needle = normalizeReferralCode(code);
  if (!sb || !needle) return null;

  const { data, error } = await sb.from('profiles').select('username').eq('username', needle).maybeSingle();

  if (error || !data) return null;
  return (data.username as string) ?? null;
}

/**
 * Callsign → account id, for the admin desk adjustment: an operator types
 * @bull_trader, and the definer function needs the uuid behind it. Profiles
 * are readable, so this is the same lookup the register banner uses.
 */
export async function resolveCallsign(code: string): Promise<string | null> {
  const sb = getSupabase();
  const needle = normalizeReferralCode(code.replace(/^@/, ''));
  if (!sb || !needle) return null;

  const { data, error } = await sb.from('profiles').select('id').eq('username', needle).maybeSingle();

  if (error || !data) return null;
  return (data.id as string) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Player desk                                                                */
/* -------------------------------------------------------------------------- */

interface ReferralRow {
  id: string;
  inviter_id: string;
  invitee_id: string;
  invite_code: string | null;
  funded_at: string | null;
  created_at: string;
}

interface EarningRow {
  id: string;
  match_id: string;
  trader_id: string;
  stake: number;
  fee: number;
  commission: number;
  tier_level: number;
  tier_rate: number;
  created_at: string;
}

function toInvite(row: ReferralRow, names: Record<string, string>): IbInvite {
  return {
    id: row.id,
    inviteeId: row.invitee_id,
    username: names[row.invitee_id] ?? row.invitee_id,
    code: row.invite_code,
    funded: row.funded_at !== null,
    createdAt: row.created_at,
  };
}

function toEarning(row: EarningRow, names: Record<string, string>): IbEarning {
  return {
    id: row.id,
    matchId: row.match_id,
    traderId: row.trader_id,
    traderName: names[row.trader_id] ?? row.trader_id,
    stake: row.stake,
    fee: row.fee,
    commission: row.commission,
    tierLevel: row.tier_level,
    tierRate: row.tier_rate,
    createdAt: row.created_at,
  };
}

/**
 * Everything the affiliate screen shows about one desk, in one call. Null
 * means the read itself was unavailable — no Supabase, or a database that
 * has not run section 13 yet — which the screen paints as "unavailable"
 * rather than an empty program. The config, ladder, and desk rows degrade to
 * fallbacks so a half-readable database never blanks the screen.
 */
export async function fetchIbDesk(playerId: string, recentLimit = 20): Promise<IbDesk | null> {
  const sb = getSupabase();
  if (!sb || !UUID_RE.test(playerId)) return null;

  const [tierRes, invitesRes, balanceRes, earningsRes, configRes, tiersRes] = await Promise.all([
    sb.rpc('ib_tier_for', { p_player: playerId }),
    sb
      .from('referrals')
      .select('id, inviter_id, invitee_id, invite_code, funded_at, created_at')
      .eq('inviter_id', playerId)
      .order('created_at', { ascending: false })
      .limit(recentLimit),
    sb.from('ib_balances').select('balance, lifetime_earned').eq('player_id', playerId).maybeSingle(),
    sb
      .from('ib_earnings')
      .select('id, match_id, trader_id, stake, fee, commission, tier_level, tier_rate, created_at')
      .eq('ib_id', playerId)
      .order('created_at', { ascending: false })
      .limit(recentLimit),
    sb.from('ib_config').select('enabled, house_fee_pct, min_house_pct_of_fee').eq('singleton', 1).maybeSingle(),
    sb.from('ib_tiers').select('level, name, rate_per_100, min_funded, active').order('level'),
  ]);

  // The pairing read is the spine: RLS covers it with the player's own id,
  // and its failure means the migration (or the session) is not in place.
  if (invitesRes.error) {
    console.warn('[referrals] desk read failed:', invitesRes.error.message);
    return null;
  }

  const inviteRows = (invitesRes.data ?? []) as ReferralRow[];
  const earningRows = (earningsRes.data ?? []) as EarningRow[];
  // No foreign key between these tables, so the names come in one shared
  // second query — the same move the money queues make.
  const names = await fetchPlayerNames([
    ...new Set([...inviteRows.map((r) => r.invitee_id), ...earningRows.map((r) => r.trader_id)]),
  ]);

  const tierRow = (tierRes.data as Record<string, unknown>[] | null)?.[0] ?? null;
  const tier: IbTierLine | null = tierRow
    ? {
        level: Number(tierRow.level),
        name: String(tierRow.tier_name ?? ''),
        ratePer100: Number(tierRow.rate_per_100),
        funded: Number(tierRow.funded_referrals),
        nextLevel: tierRow.next_level === null || tierRow.next_level === undefined ? null : Number(tierRow.next_level),
        nextMinFunded: tierRow.next_min_funded === null || tierRow.next_min_funded === undefined ? null : Number(tierRow.next_min_funded),
        needForNext: Number(tierRow.need_for_next ?? 0),
      }
    : null;

  const config: IbConfig = configRes.data
    ? {
        enabled: (configRes.data.enabled as boolean | null) ?? FALLBACK_IB_CONFIG.enabled,
        houseFeePct: (configRes.data.house_fee_pct as number | null) ?? FALLBACK_IB_CONFIG.houseFeePct,
        minHousePctOfFee: (configRes.data.min_house_pct_of_fee as number | null) ?? FALLBACK_IB_CONFIG.minHousePctOfFee,
      }
    : FALLBACK_IB_CONFIG;

  return {
    config,
    tiers: ((tiersRes.data ?? []) as Record<string, unknown>[]).map((t) => ({
      level: Number(t.level),
      name: String(t.name ?? ''),
      ratePer100: Number(t.rate_per_100),
      minFunded: Number(t.min_funded),
      active: Boolean(t.active),
    })),
    tier,
    balance: (balanceRes.data?.balance as number | null) ?? 0,
    lifetime: (balanceRes.data?.lifetime_earned as number | null) ?? 0,
    invites: inviteRows.map((row) => toInvite(row, names)),
    earnings: earningRows.map((row) => toEarning(row, names)),
  };
}

/**
 * The league table of who brought whom in. The counts are done in Postgres
 * so a player can read the ladder without reading anybody else's pairings.
 */
export async function fetchIbLeaderboard(limit = 10): Promise<IbBoardRow[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.rpc('referral_leaderboard', { p_limit: limit });

  if (error) {
    console.warn('[referrals] leaderboard read failed:', error.message);
    return null;
  }

  return ((data ?? []) as { callsign: string; invites: number; funded: number; coins: number }[]).map((row) => ({
    callsign: row.callsign,
    invites: Number(row.invites),
    funded: Number(row.funded),
    coins: Number(row.coins),
  }));
}

/**
 * Fire one settled Live seat at the award. Every decision — upline, tier,
 * fee, house floor — is made inside the function; this only hands over the
 * duel id and the caller's own stake. Resolves to the coins the upline was
 * credited (0 for anything that does not pay), and to null when the call
 * itself was impossible, so a caller can log without retrying a duplicate.
 */
export async function awardIbCommission(matchId: string, stake: number): Promise<number | null> {
  const sb = getSupabase();
  if (!sb || !matchId || stake < 100) return null;

  const { data, error } = await sb.rpc('award_ib_commission', {
    p_match_id: matchId,
    p_stake: Math.floor(stake),
  });

  if (error) {
    console.warn('[referrals] commission award failed:', error.message);
    return null;
  }
  return Number(data ?? 0);
}

/**
 * Empty the desk into the game wallet. Returns the coins moved (0 when the
 * desk was already empty); the wallet sync that shows them is the caller's
 * job, same as any other credit.
 */
export async function transferIbBalance(): Promise<number | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.rpc('transfer_ib_balance');

  if (error) {
    console.warn('[referrals] desk transfer failed:', error.message);
    return null;
  }
  return Number(data ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Admin console                                                              */
/* -------------------------------------------------------------------------- */

/** The program master row, or null when it cannot be read. */
export async function fetchIbConfig(): Promise<IbConfig | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('ib_config')
    .select('enabled, house_fee_pct, min_house_pct_of_fee')
    .eq('singleton', 1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    enabled: Boolean(data.enabled),
    houseFeePct: (data.house_fee_pct as number | null) ?? 0,
    minHousePctOfFee: (data.min_house_pct_of_fee as number | null) ?? 0,
  };
}

/** Every rung of the ladder, inactive ones included — admins see all. */
export async function fetchIbTiers(): Promise<IbTier[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('ib_tiers')
    .select('level, name, rate_per_100, min_funded, active')
    .order('level');

  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
    level: Number(t.level),
    name: String(t.name ?? ''),
    ratePer100: Number(t.rate_per_100),
    minFunded: Number(t.min_funded),
    active: Boolean(t.active),
  }));
}

/** Write the master row. The definer function re-checks admin on the way in. */
export async function saveIbConfig(next: IbConfig): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  const { error } = await sb.rpc('admin_save_ib_config', {
    p_enabled: next.enabled,
    p_house_fee_pct: Math.round(next.houseFeePct),
    p_min_house_pct: Math.round(next.minHousePctOfFee),
  });
  return !error;
}

/** Write one rung of the ladder. */
export async function saveIbTier(tier: IbTier): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  const { error } = await sb.rpc('admin_save_ib_tier', {
    p_level: tier.level,
    p_name: tier.name,
    p_rate: Math.round(tier.ratePer100),
    p_min_funded: Math.round(tier.minFunded),
    p_active: tier.active,
  });
  return !error;
}

/** Retire a rung. Past earnings rows keep their tier snapshot either way. */
export async function deleteIbTier(level: number): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  const { error } = await sb.rpc('admin_delete_ib_tier', { p_level: level });
  return !error;
}

/** Credit (+) or claw back (−) a parked desk balance. Returns the new balance. */
export async function adjustIbBalance(
  playerId: string,
  delta: number,
  note: string,
): Promise<number | null> {
  const sb = getSupabase();
  if (!sb || !UUID_RE.test(playerId) || delta === 0) return null;

  const { data, error } = await sb.rpc('admin_adjust_ib_balance', {
    p_player_id: playerId,
    p_delta: Math.round(delta),
    p_note: note,
  });
  if (error) return null;
  return Number(data ?? 0);
}

/** Every pairing in the program, newest first. RLS narrows this to an admin. */
export async function fetchAllPairings(limit = 200): Promise<AdminIbPairing[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('referrals')
    .select('id, inviter_id, invitee_id, invite_code, funded_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[referrals] pairings read failed:', error.message);
    return null;
  }

  const rows = (data ?? []) as ReferralRow[];
  const names = await fetchPlayerNames([
    ...new Set(rows.flatMap((row) => [row.inviter_id, row.invitee_id])),
  ]);

  return rows.map((row) => ({
    ...toInvite(row, names),
    inviterId: row.inviter_id,
    inviterName: names[row.inviter_id] ?? row.inviter_id,
  }));
}

/** Desk balances, biggest earners first. */
export async function fetchIbDesks(limit = 100): Promise<AdminIbDesk[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('ib_balances')
    .select('player_id, balance, lifetime_earned')
    .order('lifetime_earned', { ascending: false })
    .limit(limit);

  if (error) return null;

  const rows = (data ?? []) as { player_id: string; balance: number; lifetime_earned: number }[];
  const names = await fetchPlayerNames(rows.map((row) => row.player_id));

  return rows.map((row) => ({
    playerId: row.player_id,
    callsign: names[row.player_id] ?? row.player_id,
    balance: row.balance,
    lifetime: row.lifetime_earned,
  }));
}

/** The most recent commissions the whole program paid, both sides named. */
export async function fetchRecentEarnings(limit = 100): Promise<IbEarning[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('ib_earnings')
    .select('id, match_id, trader_id, stake, fee, commission, tier_level, tier_rate, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return null;

  const rows = (data ?? []) as EarningRow[];
  const names = await fetchPlayerNames(rows.map((row) => row.trader_id));
  return rows.map((row) => toEarning(row, names));
}
