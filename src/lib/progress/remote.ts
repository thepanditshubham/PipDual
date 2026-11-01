/**
 * remote.ts
 * Best-effort Supabase mirror of the progress system.
 *
 * The Supabase project may not have the progress tables applied yet, so every
 * call is fire-and-forget: a failure never blocks the local (authoritative)
 * Zustand snapshot. Run supabase/setup.sql to enable cross-device sync and
 * the server leaderboard.
 */
import { getSupabase } from '@/lib/supabase/client';
import { ACHIEVEMENTS, MISSION_CATALOG } from './config';
import { rankPosition, tierForRp } from './rank';
import { levelFromXp } from './xp';
import type {
  BoardPeriod,
  BoardRow,
  BoardScope,
  MatchAnalysis,
  MatchRecordInput,
  ProgressData,
  RankState,
  RewardPacket,
} from './types';

export const PROGRESS_MIGRATION_HINT =
  'Progress is saved in this browser. Run supabase/setup.sql to sync across devices.';

/* ─────────────────────────────── settlement ───────────────────────────── */

export async function syncSettlement(
  userId: string,
  record: MatchRecordInput,
  analysis: MatchAnalysis,
  data: ProgressData,
  packet: RewardPacket,
): Promise<void> {
  const sb = getSupabase();
  if (!sb || !userId) return;

  const results = await Promise.allSettled([
    sb.from('match_results').upsert(
      {
        match_id: record.matchId,
        user_id: userId,
        mode: record.mode,
        pair: record.pair,
        duration: record.durationSeconds,
        pips: analysis.pips,
        result: record.outcome,
        rp_delta: packet.rp,
        xp_delta: packet.xp,
        coins_delta: packet.coins,
        discipline_score: packet.discipline,
        pip_margin: record.pipMargin,
        opponent_rp: record.opponentRp,
        created_at: record.createdAt,
      },
      { onConflict: 'match_id,user_id', ignoreDuplicates: true },
    ),
    sb.from('trade_events').insert(
      analysis.trades.map((trade) => ({
        match_id: record.matchId,
        user_id: userId,
        side: trade.side,
        lot: trade.lot,
        entry_ts: trade.entryTs,
        exit_ts: trade.exitTs,
        entry_price: trade.entryPrice,
        exit_price: trade.exitPrice,
        sl: trade.slPct ?? null,
        tp: trade.tpPct ?? null,
        sl_moved: false,
        reason: trade.reason,
      })),
    ),
    sb.from('behavior_tags').insert(
      (Object.entries(analysis.behaviorTags) as [string, number][]).map(([tag, count]) => ({
        match_id: record.matchId,
        user_id: userId,
        tag,
        count,
      })),
    ),
    syncSnapshot(userId, data),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[progress] sync skipped:', result.reason);
    }
  }
}

/** Mirror the durable parts of the local snapshot (used after rewards too). */
export async function syncSnapshot(userId: string, data: ProgressData): Promise<void> {
  const sb = getSupabase();
  if (!sb || !userId) return;

  const level = Math.max(1, levelFromXp(data.xp).level);
  const rank = data.rank;

  await Promise.allSettled([
    sb.from('player_progress').upsert(
      {
        user_id: userId,
        level,
        xp: data.xp,
        season_pass_xp: data.seasonPassXp,
        streak_days: data.streak.days,
        last_login_date: data.streak.lastLoginDay || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    ),
    sb.from('rank_state').upsert(
      {
        user_id: userId,
        season_id: rank.seasonId,
        rp: rank.rp,
        peak_rp: rank.peakRp,
        highest_tier: rank.highestTier,
        placement_played: rank.placementPlayed,
        placement_wins: rank.placementWins,
        placement_target: rank.placementTarget,
        shield_matches: rank.shieldMatches,
        weekly_rp: rank.weeklyRp,
        weekly_key: rank.weeklyKey,
        last_ranked_at: rank.lastRankedAt,
        last_decay_at: rank.lastDecayAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    ),
    sb.from('user_missions').upsert(
      [
        ...data.missions.daily.map((mission) => ({
          user_id: userId,
          mission_id: mission.missionId,
          period_key: data.missions.dailyKey,
          progress: mission.progress,
          claimed_at: mission.claimed ? new Date().toISOString() : null,
        })),
        ...data.missions.weekly.map((mission) => ({
          user_id: userId,
          mission_id: mission.missionId,
          period_key: data.missions.weeklyKey,
          progress: mission.progress,
          claimed_at: mission.claimed ? new Date().toISOString() : null,
        })),
      ],
      { onConflict: 'user_id,mission_id,period_key' },
    ),
    sb.from('user_achievements').upsert(
      Object.entries(data.achievements).map(([achievementId, progress]) => ({
        user_id: userId,
        achievement_id: achievementId,
        progress: progress.progress,
        unlocked_at: progress.progress > 0 ? new Date().toISOString() : null,
        claimed_at: progress.claimed.gold || progress.claimed.silver || progress.claimed.bronze
          ? new Date().toISOString()
          : null,
      })),
      { onConflict: 'user_id,achievement_id' },
    ),
  ]);
}

/* ──────────────────────────────── hydration ───────────────────────────── */

export interface RemoteProgress {
  xp: number;
  matches: number;
  rank: Partial<RankState> & { rp: number };
  streakDays: number;
  lastLoginDate: string | null;
}

/** Read the remote snapshot so a returning player resumes on any device. */
export async function fetchRemoteProgress(userId: string): Promise<RemoteProgress | null> {
  const sb = getSupabase();
  if (!sb || !userId) return null;

  try {
    const [progress, rank, count] = await Promise.all([
      sb.from('player_progress').select('xp, streak_days, last_login_date').eq('user_id', userId).maybeSingle(),
      sb.from('rank_state').select('*').eq('user_id', userId).maybeSingle(),
      sb.from('match_results').select('match_id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);

    if (progress.error || !progress.data || !rank.data) return null;

    return {
      xp: (progress.data.xp as number) ?? 0,
      matches: count.count ?? 0,
      streakDays: (progress.data.streak_days as number) ?? 0,
      lastLoginDate: (progress.data.last_login_date as string | null) ?? null,
      rank: {
        rp: (rank.data.rp as number) ?? 0,
        peakRp: (rank.data.peak_rp as number) ?? 0,
        seasonId: (rank.data.season_id as string) ?? '',
        highestTier: (rank.data.highest_tier as RankState['highestTier']) ?? 'Bronze',
        placementPlayed: (rank.data.placement_played as number) ?? 0,
        placementWins: (rank.data.placement_wins as number) ?? 0,
        placementTarget: (rank.data.placement_target as number) ?? 0,
        shieldMatches: (rank.data.shield_matches as number) ?? 0,
        weeklyRp: (rank.data.weekly_rp as number) ?? 0,
        weeklyKey: (rank.data.weekly_key as string) ?? '',
        lastRankedAt: (rank.data.last_ranked_at as string | null) ?? null,
        lastDecayAt: (rank.data.last_decay_at as string | null) ?? null,
      },
    };
  } catch {
    return null;
  }
}

/* ─────────────────────────────── leaderboard ──────────────────────────── */

interface RemoteBoardRow {
  user_id: string;
  username: string | null;
  display_name: string | null;
  country: string | null;
  rp: number | null;
  week_rp: number | null;
  matches: number | null;
  wins: number | null;
}

export async function fetchRemoteBoard(
  scope: BoardScope,
  period: BoardPeriod,
  localUserId: string,
): Promise<BoardRow[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  if (scope === 'friends' || scope === 'clan') return null;

  try {
    let query = sb.from('progress_leaderboard').select('*').limit(50);
    if (scope === 'india') query = query.eq('country', 'IN');
    const { data, error } = await query;
    if (error || !data) return null;

    const rows = (data as RemoteBoardRow[])
      .filter((row) => (row.matches ?? 0) >= 10)
      .sort((a, b) =>
        period === 'weekly' ? (b.week_rp ?? 0) - (a.week_rp ?? 0) : (b.rp ?? 0) - (a.rp ?? 0),
      )
      .map((row, index) => {
        const rp = row.rp ?? 0;
        const matches = row.matches ?? 0;
        return {
          rank: index + 1,
          userId: row.user_id,
          name: row.display_name || row.username || 'Trader',
          rp,
          weekRp: row.week_rp ?? 0,
          tier: tierForRp(rp),
          wins: row.wins ?? 0,
          matches,
          isYou: row.user_id === localUserId,
        };
      });

    return rows;
  } catch {
    return null;
  }
}

/** Your own row for the pinned footer when the remote board is unavailable. */
export function localBoardRow(data: ProgressData, name: string): BoardRow {
  const position = rankPosition(data.rank.rp);
  return {
    rank: 0,
    userId: data.userId ?? 'local',
    name,
    rp: data.rank.rp,
    weekRp: data.rank.weeklyRp,
    tier: position.tier,
    wins: data.stats.wins,
    matches: data.stats.rankedMatches,
    isYou: true,
  };
}

/* ──────────────────────────────── catalogs ─────────────────────────────── */

export function catalogCounts(): { missions: number; achievements: number } {
  return { missions: MISSION_CATALOG.length, achievements: ACHIEVEMENTS.length };
}
