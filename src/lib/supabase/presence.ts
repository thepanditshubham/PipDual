import { getSupabase } from '@/lib/supabase/client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Online status is a 5-minute window over profile_details.last_seen_at. The
 * heartbeat writes only the signed-in player's own row; guests stay local.
 */
export async function touchProfilePresence(userId: string): Promise<void> {
  if (!UUID_RE.test(userId)) return;
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase.from('profile_details').upsert(
    { user_id: userId, last_seen_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) {
    // A missing migration should not break the game shell.
    console.warn('[profile] presence heartbeat skipped:', error.message);
  }
}
