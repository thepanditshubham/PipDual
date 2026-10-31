import { NextResponse } from 'next/server';
import { assertProfileOwner, ProfileAccessError } from '@/lib/profile/access';
import { consumeRateLimit } from '@/lib/profile/rate-limit';
import {
  normalizeList,
  normalizeSocialLinks,
  normalizeText,
  profileUpdateSchema,
  usernameSchema,
} from '@/lib/profile/validation';
import {
  authenticateRequest,
  createRequestClient,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

function parseUsername(raw: string): string | null {
  const parsed = usernameSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username: raw } = await params;
  const username = parseUsername(raw);
  if (!username) return json({ error: 'Invalid callsign.' }, 400);

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  let client;

  if (token) {
    const auth = await authenticateRequest(request);
    if (auth.ok === false) {
      return json({ error: 'Your session is no longer valid.' }, 401);
    }
    client = auth.client;
  } else {
    client = createRequestClient();
  }

  if (!client) {
    return json({ error: 'Profile service is not configured.' }, 503);
  }

  const { data, error } = await client.rpc('get_player_profile', {
    p_username: username,
  });

  if (error) {
    console.error('[profile] read failed:', error.message);
    if (error.message.includes('get_player_profile')) {
      return json({ error: 'Profile system is not installed. Run supabase/setup.sql.' }, 503);
    }
    return json({ error: 'Could not load this profile.' }, 500);
  }

  if (!data) return json({ error: 'Trader not found.' }, 404);
  return json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username: raw } = await params;
  const username = parseUsername(raw);
  if (!username) return json({ error: 'Invalid callsign.' }, 400);

  const auth = await authenticateRequest(request);
  if (auth.ok === false) {
    return json(
      { error: auth.reason === 'unconfigured' ? 'Profile service is not configured.' : 'Sign in to edit a profile.' },
      auth.reason === 'unconfigured' ? 503 : 401,
    );
  }

  const limit = consumeRateLimit(`profile:update:${auth.user.id}`, 12, 60_000);
  if (!limit.allowed) {
    return json(
      { error: 'Too many profile updates. Try again shortly.', retryAfter: limit.retryAfterSeconds },
      429,
      { 'Retry-After': String(limit.retryAfterSeconds) },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid profile data.' }, 400);
  }

  const { data: target, error: targetError } = await auth.client
    .from('profiles')
    .select('id, username')
    .eq('username', username)
    .maybeSingle();

  if (targetError) {
    console.error('[profile] owner lookup failed:', targetError.message);
    return json({ error: 'Could not update this profile.' }, 500);
  }
  if (!target) return json({ error: 'Trader not found.' }, 404);

  try {
    assertProfileOwner(auth.user.id, target.id as string);
  } catch (error) {
    if (error instanceof ProfileAccessError) {
      return json({ error: error.message }, error.status);
    }
    throw error;
  }

  const input = parsed.data;
  const now = new Date().toISOString();

  const profilePatch: Record<string, unknown> = {};
  if (input.displayName !== undefined) profilePatch.display_name = input.displayName;
  if (input.country !== undefined) {
    profilePatch.country = input.country ? input.country.toUpperCase() : null;
  }

  if (Object.keys(profilePatch).length > 0) {
    const { error } = await auth.client
      .from('profiles')
      .update(profilePatch)
      .eq('id', auth.user.id);
    if (error) {
      console.error('[profile] profile update failed:', error.message);
      return json({ error: 'Could not save your profile.' }, 500);
    }
  }

  const detailsPatch: Record<string, unknown> = {
    user_id: auth.user.id,
  };

  if (input.bio !== undefined) detailsPatch.bio = normalizeText(input.bio);
  if (input.location !== undefined) detailsPatch.location = normalizeText(input.location);
  if (input.socialLinks !== undefined) {
    detailsPatch.social_links = normalizeSocialLinks(input.socialLinks);
  }
  if (input.visibility !== undefined) detailsPatch.profile_visibility = input.visibility;
  if (input.privacy) {
    if (input.privacy.showBattleHistory !== undefined) {
      detailsPatch.show_battle_history = input.privacy.showBattleHistory;
    }
    if (input.privacy.showCountry !== undefined) {
      detailsPatch.show_country = input.privacy.showCountry;
    }
    if (input.privacy.showSocialLinks !== undefined) {
      detailsPatch.show_social_links = input.privacy.showSocialLinks;
    }
    if (input.privacy.allowFollows !== undefined) {
      detailsPatch.allow_follows = input.privacy.allowFollows;
    }
    if (input.privacy.allowMessages !== undefined) {
      detailsPatch.allow_messages = input.privacy.allowMessages;
    }
  }

  // Only write details when the request actually touched that table; the
  // presence heartbeat owns last_seen_at and must not be reset by an edit.
  if (Object.keys(detailsPatch).length > 1) {
    const { error } = await auth.client
      .from('profile_details')
      .upsert(detailsPatch, { onConflict: 'user_id' });
    if (error) {
      console.error('[profile] details update failed:', error.message);
      return json({ error: 'Could not save profile details.' }, 500);
    }
  }

  if (input.portfolio) {
    const { error } = await auth.client.from('profile_portfolio').upsert(
      {
        user_id: auth.user.id,
        experience: normalizeText(input.portfolio.experience),
        preferred_markets: normalizeList(input.portfolio.preferredMarkets),
        trading_style: normalizeText(input.portfolio.tradingStyle),
        methodology: normalizeText(input.portfolio.methodology),
        preferred_timeframes: normalizeList(input.portfolio.preferredTimeframes),
        certifications: normalizeText(input.portfolio.certifications),
        updated_at: now,
      },
      { onConflict: 'user_id' },
    );
    if (error) {
      console.error('[profile] portfolio update failed:', error.message);
      return json({ error: 'Could not save the portfolio.' }, 500);
    }
  }

  return json({ ok: true });
}
