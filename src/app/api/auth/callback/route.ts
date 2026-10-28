import { NextResponse } from 'next/server';

/**
 * OAuth landing point.
 *
 * The PKCE code verifier is stored in the browser that started the sign-in,
 * so the exchange has to happen there, not in a server route. Forward the
 * code to a client page and let @supabase/supabase-js finish the flow on
 * mount (detectSessionInUrl is on by default); the auth provider then picks
 * the session up and the library strips the code from the address bar.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;

  const errorDescription =
    requestUrl.searchParams.get('error_description') ?? requestUrl.searchParams.get('error');
  if (errorDescription) {
    const login = new URL('/login', origin);
    login.searchParams.set('error', errorDescription);
    return NextResponse.redirect(login);
  }

  const code = requestUrl.searchParams.get('code');
  const nextParam = requestUrl.searchParams.get('next') ?? '/play';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/play';

  const target = new URL(next, origin);
  if (code) target.searchParams.set('code', code);

  return NextResponse.redirect(target);
}
