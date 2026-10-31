import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

function supabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || url.includes('your-project')) return null;
  return { url, anonKey };
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/**
 * A request-scoped client. When a user token is supplied every query runs as
 * that user, so PostgREST and RLS remain the authority. No service-role key is
 * used anywhere in the profile module.
 */
export function createRequestClient(token?: string | null): SupabaseClient | null {
  const config = supabaseConfig();
  if (!config) return null;

  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : undefined,
  });
}

export type RequestAuth =
  | { ok: true; client: SupabaseClient; user: User; token: string }
  | { ok: false; reason: 'missing' | 'invalid' | 'unconfigured' };

export async function authenticateRequest(request: Request): Promise<RequestAuth> {
  const token = getBearerToken(request);
  if (!token) return { ok: false, reason: 'missing' };

  const client = createRequestClient(token);
  if (!client) return { ok: false, reason: 'unconfigured' };

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { ok: false, reason: 'invalid' };

  return { ok: true, client, user: data.user, token };
}

export function publicMediaUrl(path: string): string | null {
  const config = supabaseConfig();
  if (!config) return null;
  return `${config.url.replace(/\/$/, '')}/storage/v1/object/public/profile-media/${path}`;
}
