/**
 * wallet.ts
 *
 * Persistence for the free-to-play coin balance. Coins are game credits:
 * they are earned by playing, never bought, transferred or cashed out.
 *
 * Only registered players have a row in `player_balances`; guests keep their
 * balance in the local store. RLS scopes every read and write to the signed-in
 * player, so the anon key cannot touch anyone else's row.
 */
import { getSupabase } from './client';
import { STARTING_COINS } from '@/lib/economy/config';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only persisted accounts have a wallet row; guest ids are local. */
export function isPersistedPlayer(playerId: string): boolean {
  return UUID_RE.test(playerId);
}

/** Stored coin balance, or null when nothing could be read. */
export async function fetchCoins(playerId: string): Promise<number | null> {
  if (!isPersistedPlayer(playerId)) return null;
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('player_balances')
    .select('virtual_balance')
    .eq('player_id', playerId)
    .maybeSingle();

  if (error || !data) return null;
  return (data.virtual_balance as number | null) ?? null;
}

/** Materialise a zero balance for a registered player with no wallet row. */
export async function ensureCoins(playerId: string): Promise<number | null> {
  if (!isPersistedPlayer(playerId)) return null;
  const sb = getSupabase();
  if (!sb) return null;

  const stored = await fetchCoins(playerId);
  if (stored !== null) return stored;

  const { data, error } = await sb
    .from('player_balances')
    .upsert(
      {
        player_id: playerId,
        virtual_balance: STARTING_COINS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'player_id', ignoreDuplicates: true },
    )
    .select('virtual_balance')
    .maybeSingle();

  if (!error && data) return (data.virtual_balance as number) ?? STARTING_COINS;
  return (await fetchCoins(playerId)) ?? STARTING_COINS;
}

/** Write the registered player's balance. Guests are handled locally. */
export async function upsertCoins(playerId: string, coins: number): Promise<void> {
  if (!isPersistedPlayer(playerId)) return;
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('player_balances').upsert(
    { player_id: playerId, virtual_balance: coins, updated_at: new Date().toISOString() },
    { onConflict: 'player_id' },
  );
  if (error) console.warn('[wallet] balance upsert failed:', error.message);
}
