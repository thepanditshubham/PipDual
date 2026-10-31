import { NextResponse } from 'next/server';
import { assertProfileOwner, ProfileAccessError } from '@/lib/profile/access';
import { MAX_AVATAR_BYTES, MAX_COVER_BYTES } from '@/lib/profile/config';
import { detectImageMime } from '@/lib/profile/media';
import { consumeRateLimit } from '@/lib/profile/rate-limit';
import { mediaKindSchema, usernameSchema } from '@/lib/profile/validation';
import {
  authenticateRequest,
  publicMediaUrl,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

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
      { error: auth.reason === 'unconfigured' ? 'Profile service is not configured.' : 'Sign in to upload profile media.' },
      auth.reason === 'unconfigured' ? 503 : 401,
    );
  }

  const limit = consumeRateLimit(`profile:media:${auth.user.id}`, 6, 60_000);
  if (!limit.allowed) {
    return json(
      { error: 'Too many uploads. Try again shortly.', retryAfter: limit.retryAfterSeconds },
      429,
      { 'Retry-After': String(limit.retryAfterSeconds) },
    );
  }

  const { data: target, error: targetError } = await auth.client
    .from('profiles')
    .select('id')
    .eq('username', username.data)
    .maybeSingle();
  if (targetError) {
    console.error('[profile] media target lookup failed:', targetError.message);
    return json({ error: 'Could not upload the image.' }, 500);
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Send the image as multipart form data.' }, 400);
  }

  const kind = mediaKindSchema.safeParse(form.get('kind'));
  if (!kind.success) return json({ error: 'Choose avatar or cover.' }, 400);

  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'Choose an image to upload.' }, 400);

  const maxBytes = kind.data === 'avatar' ? MAX_AVATAR_BYTES : MAX_COVER_BYTES;
  if (file.size <= 0 || file.size > maxBytes) {
    return json(
      { error: `Image must be under ${Math.round(maxBytes / (1024 * 1024))} MB.` },
      413,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectImageMime(new Uint8Array(buffer));
  if (!detected) {
    return json({ error: 'Only JPEG, PNG or WebP images are accepted.' }, 415);
  }

  const path = `${auth.user.id}/${kind.data}.${detected.extension}`;
  const { error: uploadError } = await auth.client.storage
    .from('profile-media')
    .upload(path, buffer, {
      contentType: detected.mime,
      cacheControl: '3600',
      upsert: true,
    });

  if (uploadError) {
    console.error('[profile] media upload failed:', uploadError.message);
    return json({ error: 'Could not store the image.' }, 500);
  }

  const baseUrl = publicMediaUrl(path);
  if (!baseUrl) return json({ error: 'Profile service is not configured.' }, 503);
  const url = `${baseUrl}?v=${Date.now()}`;

  if (kind.data === 'avatar') {
    const { error } = await auth.client
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', auth.user.id);
    if (error) {
      console.error('[profile] avatar save failed:', error.message);
      return json({ error: 'Could not save the avatar.' }, 500);
    }
  } else {
    const { error } = await auth.client.from('profile_details').upsert(
      { user_id: auth.user.id, cover_url: url },
      { onConflict: 'user_id' },
    );
    if (error) {
      console.error('[profile] cover save failed:', error.message);
      return json({ error: 'Could not save the cover image.' }, 500);
    }
  }

  return json({ ok: true, url });
}
