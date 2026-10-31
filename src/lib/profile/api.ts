import { getSupabase } from '@/lib/supabase/client';
import type { PlayerProfilePayload } from './types';
import type { ProfileActionInput, ProfileUpdateInput } from './validation';

export class ProfileApiError extends Error {
  status: number;
  retryAfter: number | null;

  constructor(message: string, status: number, retryAfter: number | null = null) {
    super(message);
    this.name = 'ProfileApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readError(response: Response): Promise<ProfileApiError> {
  let message = 'Something went wrong.';
  let retryAfter: number | null = null;
  try {
    const body = (await response.json()) as { error?: string; retryAfter?: number };
    if (body.error) message = body.error;
    if (typeof body.retryAfter === 'number') retryAfter = body.retryAfter;
  } catch {
    // Non-JSON response; keep the generic message.
  }
  return new ProfileApiError(message, response.status, retryAfter);
}

export async function fetchPlayerProfile(username: string): Promise<PlayerProfilePayload> {
  const response = await fetch(`/api/player/${encodeURIComponent(username)}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
  });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as PlayerProfilePayload;
}

export async function updatePlayerProfile(
  username: string,
  payload: ProfileUpdateInput,
): Promise<void> {
  const response = await fetch(`/api/player/${encodeURIComponent(username)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await readError(response);
}

export async function runProfileAction(
  username: string,
  payload: ProfileActionInput,
): Promise<void> {
  const response = await fetch(`/api/player/${encodeURIComponent(username)}/actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await readError(response);
}

export async function uploadProfileMedia(
  username: string,
  kind: 'avatar' | 'cover',
  file: File,
): Promise<string> {
  const form = new FormData();
  form.set('kind', kind);
  form.set('file', file);
  const response = await fetch(`/api/player/${encodeURIComponent(username)}/media`, {
    method: 'POST',
    headers: { ...(await authHeaders()) },
    body: form,
  });
  if (!response.ok) throw await readError(response);
  const body = (await response.json()) as { url?: string };
  if (!body.url) throw new ProfileApiError('The upload did not return an image URL.', 500);
  return body.url;
}
