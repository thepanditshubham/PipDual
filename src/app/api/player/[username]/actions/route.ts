import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertNonSelf, ProfileAccessError } from '@/lib/profile/access';
import { consumeRateLimit } from '@/lib/profile/rate-limit';
import { profileActionSchema, usernameSchema } from '@/lib/profile/validation';
import type { PlayerProfilePayload } from '@/lib/profile/types';
import { authenticateRequest } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

async function loadProfile(client: SupabaseClient, username: string) {
  const { data, error } = await client.rpc('get_player_profile', { p_username: username });
  if (error) return { error } as const;
  return { data: data as PlayerProfilePayload | null } as const;
}

async function resolveTarget(client: SupabaseClient, username: string) {
  const { data, error } = await client
    .from('profiles')
    .select('id, username')
    .eq('username', username)
    .maybeSingle();
  if (error) return { error } as const;
  return { data: data as { id: string; username: string } | null } as const;
}

const LIMITS = {
  follow: { count: 20, window: 60_000 },
  unfollow: { count: 20, window: 60_000 },
  connect: { count: 10, window: 60_000 },
  endorse: { count: 30, window: 60_000 },
  skill: { count: 20, window: 60_000 },
  message: { count: 8, window: 60_000 },
} as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username: raw } = await params;
  const username = usernameSchema.safeParse(raw);
  if (!username.success) return json({ error: 'Invalid callsign.' }, 400);

  const auth = await authenticateRequest(request);
  if (auth.ok === false) {
    return json(
      { error: auth.reason === 'unconfigured' ? 'Profile service is not configured.' : 'Sign in to continue.' },
      auth.reason === 'unconfigured' ? 503 : 401,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const parsed = profileActionSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid action.' }, 400);
  }

  const action = parsed.data;
  const limitKey =
    action.action === 'add-skill' || action.action === 'remove-skill'
      ? 'skill'
      : action.action;
  const limit = LIMITS[limitKey as keyof typeof LIMITS];
  const bucket = consumeRateLimit(
    `profile:${limitKey}:${auth.user.id}`,
    limit.count,
    limit.window,
  );
  if (!bucket.allowed) {
    return json(
      { error: 'Too many requests. Try again shortly.', retryAfter: bucket.retryAfterSeconds },
      429,
      { 'Retry-After': String(bucket.retryAfterSeconds) },
    );
  }

  const targetResult = await resolveTarget(auth.client, username.data);
  if (targetResult.error) {
    console.error('[profile] action target lookup failed:', targetResult.error.message);
    return json({ error: 'Could not complete that action.' }, 500);
  }
  const target = targetResult.data;
  if (!target) return json({ error: 'Trader not found.' }, 404);

  try {
    if (action.action === 'follow' || action.action === 'connect' || action.action === 'endorse') {
      assertNonSelf(auth.user.id, target.id, action.action);
    }

    if (action.action === 'add-skill' || action.action === 'remove-skill') {
      if (target.id !== auth.user.id) {
        throw new ProfileAccessError('You can only edit your own skills.', 403);
      }

      if (action.action === 'add-skill') {
        const { error } = await auth.client
          .from('profile_skills')
          .insert({ user_id: auth.user.id, skill_key: action.skillKey });
        if (error && error.code !== '23505') {
          console.error('[profile] skill add failed:', error.message);
          return json({ error: 'Could not add that skill.' }, 500);
        }
      } else {
        const { error } = await auth.client
          .from('profile_skills')
          .delete()
          .eq('user_id', auth.user.id)
          .eq('skill_key', action.skillKey);
        if (error) {
          console.error('[profile] skill remove failed:', error.message);
          return json({ error: 'Could not remove that skill.' }, 500);
        }
      }
      return json({ ok: true });
    }

    if (action.action === 'unfollow') {
      const { error } = await auth.client
        .from('profile_follows')
        .delete()
        .eq('follower_id', auth.user.id)
        .eq('following_id', target.id);
      if (error) {
        console.error('[profile] unfollow failed:', error.message);
        return json({ error: 'Could not unfollow this trader.' }, 500);
      }
      return json({ ok: true, following: false });
    }

    const publicProfile = await loadProfile(auth.client, target.username);
    if (publicProfile.error) {
      console.error('[profile] action profile read failed:', publicProfile.error.message);
      return json({ error: 'Could not complete that action.' }, 500);
    }
    const payload = publicProfile.data;
    if (!payload) return json({ error: 'Trader not found.' }, 404);

    if (action.action === 'follow') {
      // Followers-only profiles accept follow requests; the restricted payload
      // still carries the owner's allow_follows switch. Private profiles do not.
      const canFollow = payload.profile.allowFollows
        && (payload.profile.visibility === 'followers' || !payload.restricted);
      if (!canFollow) {
        return json({ error: 'This trader is not accepting followers.' }, 403);
      }
      const { error } = await auth.client
        .from('profile_follows')
        .insert({ follower_id: auth.user.id, following_id: target.id });
      if (error && error.code !== '23505') {
        console.error('[profile] follow failed:', error.message);
        return json({ error: 'Could not follow this trader.' }, 500);
      }
      return json({ ok: true, following: true });
    }

    if (payload.restricted) {
      return json({ error: 'This profile is private.' }, 403);
    }

    if (action.action === 'connect') {
      const { data: existing, error: existingError } = await auth.client
        .from('player_friends')
        .select('id, requester_id, addressee_id, status')
        .or(
          `and(requester_id.eq.${auth.user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${auth.user.id})`,
        )
        .maybeSingle();

      if (existingError) {
        console.error('[profile] connection lookup failed:', existingError.message);
        return json({ error: 'Could not check the connection.' }, 500);
      }

      if (existing?.status === 'accepted') {
        return json({ ok: true, status: 'connected' });
      }
      if (existing?.status === 'pending' && existing.addressee_id === auth.user.id) {
        const { error } = await auth.client
          .from('player_friends')
          .update({ status: 'accepted' })
          .eq('id', existing.id);
        if (error) {
          console.error('[profile] connection accept failed:', error.message);
          return json({ error: 'Could not accept the connection.' }, 500);
        }
        return json({ ok: true, status: 'connected' });
      }
      if (existing?.status === 'pending') {
        return json({ ok: true, status: 'pending_out' });
      }

      const { error } = await auth.client.from('player_friends').insert({
        requester_id: auth.user.id,
        addressee_id: target.id,
        status: 'pending',
      });
      if (error && error.code !== '23505') {
        console.error('[profile] connection insert failed:', error.message);
        return json({ error: 'Could not send the connection request.' }, 500);
      }
      return json({ ok: true, status: 'pending_out' });
    }

    if (action.action === 'endorse') {
      if (!payload.profile.canEndorse) {
        return json({ error: 'You are not eligible to endorse this profile.' }, 403);
      }
      const { error } = await auth.client.from('profile_skill_endorsements').insert({
        profile_user_id: target.id,
        skill_key: action.skillKey,
        endorser_id: auth.user.id,
      });
      if (error && error.code !== '23505') {
        console.error('[profile] endorsement failed:', error.message);
        return json({ error: 'Could not add the endorsement.' }, 500);
      }
      return json({ ok: true });
    }

    if (action.action === 'message') {
      if (!payload.profile.canMessage) {
        return json({ error: 'This trader is not accepting messages.' }, 403);
      }

      const { data: me, error: meError } = await auth.client
        .from('profiles')
        .select('username')
        .eq('id', auth.user.id)
        .single();
      if (meError || !me) {
        return json({ error: 'Could not resolve your callsign.' }, 500);
      }

      const bodyText = action.body.trim();
      const { error } = await auth.client.from('player_mails').insert({
        player_id: target.id,
        event_key: `profile:${auth.user.id}:${crypto.randomUUID()}`,
        sender: me.username,
        sender_id: auth.user.id,
        category: 'player',
        subject: `Message from @${me.username}`,
        preview: bodyText.slice(0, 140),
        body: bodyText,
        ref_id: `/player/${target.username}`,
      });
      if (error) {
        console.error('[profile] message failed:', error.message);
        return json({ error: 'Could not deliver the message.' }, 500);
      }
      return json({ ok: true });
    }

    return json({ error: 'Unsupported action.' }, 400);
  } catch (error) {
    if (error instanceof ProfileAccessError) {
      return json({ error: error.message }, error.status);
    }
    console.error('[profile] action crashed:', error);
    return json({ error: 'Could not complete that action.' }, 500);
  }
}
