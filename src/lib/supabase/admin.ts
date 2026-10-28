/**
 * admin.ts
 * Supabase reads and RPCs behind the admin console. Nothing here writes a
 * balance or a status directly: the money functions in supabase/setup.sql are
 * SECURITY DEFINER and check public.is_admin() themselves, so the browser can
 * only ask. Reads fall back to null when the tables are missing, which is how
 * the console tells "not provisioned yet" apart from "nothing to show".
 */
import { getSupabase } from './client';
import { fetchMyDeposits, fetchMyWithdrawals, fetchPlayerNames } from './wallet';
import { FAILED } from '@/lib/admin/types';
import type {
  AdminPlayer,
  AdminResult,
  LedgerEntry,
  LedgerKind,
  PlayerDuel,
  PlayerStatus,
} from '@/lib/admin/types';
import type { CryptoDeposit, WithdrawRequest } from '@/lib/economy/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* -------------------------------------------------------------------------- */
/* Players                                                                    */
/* -------------------------------------------------------------------------- */

interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
  rating: number | null;
  role: 'user' | 'admin';
  status: PlayerStatus | null;
  status_note: string | null;
  status_changed_at: string | null;
  created_at: string;
}

const PROFILE_COLUMNS =
  'id, username, display_name, rating, role, status, status_note, status_changed_at, created_at';

/** Columns a database that has not run the admin-operations SQL still has. */
const PROFILE_COLUMNS_LEGACY =
  'id, username, display_name, rating, role, created_at';

/** Postgres' "undefined column" — the shape of a half-migrated database. */
const UNDEFINED_COLUMN = '42703';

interface ProfileRead {
  data: unknown;
  error: { code?: string; message: string } | null;
}

/**
 * Read profiles, tolerating a database without the status columns. The
 * directory stays usable while the setup script is being re-run; every account
 * simply reads as active, and the ban buttons surface the RPC's own error.
 */
async function readProfiles(
  build: (columns: string) => PromiseLike<ProfileRead>,
): Promise<ProfileRow[] | null> {
  let result = await build(PROFILE_COLUMNS);

  if (result.error?.code === UNDEFINED_COLUMN) {
    console.warn('[admin] profile status columns missing — reading the legacy shape.');
    result = await build(PROFILE_COLUMNS_LEGACY);
  }

  if (result.error) {
    console.warn('[admin] player read failed:', result.error.message);
    return null;
  }

  return ((result.data ?? []) as ProfileRow[]).map((row) => ({
    ...row,
    status: row.status ?? 'active',
    status_note: row.status_note ?? null,
    status_changed_at: row.status_changed_at ?? null,
  }));
}

function rowToPlayer(row: ProfileRow, coins: number): AdminPlayer {
  return {
    id: row.id,
    username: row.username ?? row.id,
    displayName: row.display_name,
    rating: row.rating ?? 1200,
    role: row.role,
    status: row.status ?? 'active',
    statusNote: row.status_note,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
    coins,
  };
}

/** Balances for the ids given, as a player_id → coins map. */
async function balancesFor(playerIds: string[]): Promise<Record<string, number>> {
  const sb = getSupabase();
  if (!sb || playerIds.length === 0) return {};

  const { data, error } = await sb
    .from('player_balances')
    .select('player_id, virtual_balance')
    .in('player_id', playerIds);

  if (error) {
    console.warn('[admin] balance read failed:', error.message);
    return {};
  }

  return (data as { player_id: string; virtual_balance: number | null }[]).reduce<
    Record<string, number>
  >((balances, row) => {
    balances[row.player_id] = row.virtual_balance ?? 0;
    return balances;
  }, {});
}

/**
 * The player directory. Newest first, capped so a busy arena still paints
 * quickly; the search box filters this page rather than the whole table.
 */
export async function fetchPlayers(limit = 200): Promise<AdminPlayer[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const rows = await readProfiles((columns) =>
    sb.from('profiles').select(columns).order('created_at', { ascending: false }).limit(limit),
  );

  if (rows === null) return null;

  const balances = await balancesFor(rows.map((row) => row.id));
  return rows.map((row) => rowToPlayer(row, balances[row.id] ?? 0));
}

/** One profile plus its wallet. Null means the row (or the read) is missing. */
export async function fetchPlayer(playerId: string): Promise<AdminPlayer | null> {
  const sb = getSupabase();
  if (!sb || !UUID_RE.test(playerId)) return null;

  const rows = await readProfiles((columns) =>
    sb.from('profiles').select(columns).eq('id', playerId).limit(1),
  );

  const row = rows?.[0];
  if (!row) return null;

  const balances = await balancesFor([playerId]);
  return rowToPlayer(row, balances[playerId] ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Ledger                                                                     */
/* -------------------------------------------------------------------------- */

interface LedgerRow {
  id: number;
  player_id: string;
  kind: LedgerKind;
  coins: number;
  balance_after: number | null;
  reason: string | null;
  ref_type: string | null;
  ref_id: string | null;
  actor_id: string | null;
  created_at: string;
}

const LEDGER_COLUMNS =
  'id, player_id, kind, coins, balance_after, reason, ref_type, ref_id, actor_id, created_at';

function rowToLedger(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    playerId: row.player_id,
    kind: row.kind,
    coins: row.coins,
    balanceAfter: row.balance_after,
    reason: row.reason,
    refType: row.ref_type,
    refId: row.ref_id,
    actorId: row.actor_id,
    createdAt: row.created_at,
  };
}

/**
 * The wallet ledger, newest first. Scoped to one player when an id is given,
 * which is what the player page's tail and the balance card both use.
 */
export async function fetchLedger(options?: {
  playerId?: string;
  limit?: number;
}): Promise<LedgerEntry[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  let query = sb
    .from('wallet_ledger')
    .select(LEDGER_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(options?.limit ?? 200);

  if (options?.playerId) {
    if (!UUID_RE.test(options.playerId)) return [];
    query = query.eq('player_id', options.playerId);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[admin] ledger read failed:', error.message);
    return null;
  }
  return (data as LedgerRow[]).map(rowToLedger);
}

/**
 * Credit or debit a wallet by hand. The RPC requires a reason, refuses to
 * overdraw, and writes the matching wallet_ledger row in the same
 * transaction; the returned number is the balance after the move.
 */
export async function adjustCoins(
  playerId: string,
  coins: number,
  reason: string,
): Promise<AdminResult<number>> {
  const sb = getSupabase();
  if (!sb) return FAILED;

  const { data, error } = await sb.rpc('admin_adjust_coins', {
    p_player_id: playerId,
    p_coins: Math.trunc(coins),
    p_reason: reason.trim(),
  });

  if (error) return { ok: false, value: null, error: error.message };
  return { ok: true, value: typeof data === 'number' ? data : null, error: null };
}

/**
 * Lock or unlock an account. Suspension keeps the row and the history; a ban
 * is the same lock with a harder label. Both are reversible from here.
 */
export async function setPlayerStatus(
  playerId: string,
  status: PlayerStatus,
  note?: string,
): Promise<AdminResult<PlayerStatus>> {
  const sb = getSupabase();
  if (!sb) return FAILED;

  const { data, error } = await sb.rpc('admin_set_player_status', {
    p_player_id: playerId,
    p_status: status,
    p_note: note?.trim() || null,
  });

  if (error) return { ok: false, value: null, error: error.message };
  return { ok: true, value: (data as PlayerStatus) ?? status, error: null };
}

/* -------------------------------------------------------------------------- */
/* One player's history                                                       */
/* -------------------------------------------------------------------------- */

interface MatchRow {
  id: string;
  mode: 'standard' | 'risk';
  p1: string | null;
  p2: string | null;
  p1_score: number | null;
  p2_score: number | null;
  p2_is_bot: boolean | null;
  winner: string | null;
  status: string | null;
  created_at: string;
}

/**
 * The last few duels this player took part in, read from their side of the
 * row. Matches RLS already exposes finished games, so this needs no extra
 * policy; an unfinished game the admin is not playing in simply stays hidden.
 */
export async function fetchPlayerDuels(playerId: string, limit = 10): Promise<PlayerDuel[] | null> {
  const sb = getSupabase();
  if (!sb || !UUID_RE.test(playerId)) return null;

  const { data, error } = await sb
    .from('matches')
    .select('id, mode, p1, p2, p1_score, p2_score, p2_is_bot, winner, status, created_at')
    .or(`p1.eq.${playerId},p2.eq.${playerId}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[admin] duel read failed:', error.message);
    return null;
  }

  const rows = data as MatchRow[];
  const opponentIds = [
    ...new Set(
      rows
        .map((row) => (row.p1 === playerId ? row.p2 : row.p1))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const names = await fetchPlayerNames(opponentIds);

  return rows.map((row) => {
    const isP1 = row.p1 === playerId;
    const opponentId = isP1 ? row.p2 : row.p1;
    const opponentIsBot = !opponentId && Boolean(row.p2_is_bot);
    const score = isP1 ? row.p1_score : row.p2_score;
    const opponentScore = isP1 ? row.p2_score : row.p1_score;

    let outcome: PlayerDuel['outcome'] = 'open';
    if (row.winner === playerId) outcome = 'win';
    else if (row.winner && row.status === 'finished') outcome = 'loss';
    else if (row.status === 'finished' && !row.winner) outcome = 'draw';

    return {
      id: row.id,
      mode: row.mode,
      status: row.status ?? 'pending',
      score,
      opponentScore,
      opponentId,
      opponentName: opponentIsBot
        ? 'Practice bot'
        : names[opponentId ?? ''] ?? (opponentId ? opponentId.slice(0, 8) : 'Unknown'),
      opponentIsBot,
      outcome,
      createdAt: row.created_at,
    };
  });
}

/** Every deposit and payout this player has ever queued. */
export async function fetchPlayerMoney(playerId: string): Promise<{
  deposits: CryptoDeposit[];
  withdrawals: WithdrawRequest[];
} | null> {
  if (!UUID_RE.test(playerId)) return null;

  // Same readers the player's own wallet screen uses; RLS already lets an
  // admin see every row, so no separate query is needed.
  const [deposits, withdrawals] = await Promise.all([
    fetchMyDeposits(playerId),
    fetchMyWithdrawals(playerId),
  ]);

  if (deposits === null && withdrawals === null) return null;
  return { deposits: deposits ?? [], withdrawals: withdrawals ?? [] };
}
