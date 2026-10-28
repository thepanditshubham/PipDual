import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protected paths
  const isProtected = ['/history', '/settings', '/admin'].some((route) =>
    pathname.startsWith(route)
  );

  // Note: Guest access is allowed on client-side state, but if someone navigates directly without any auth token or guest cookie, client components handle auth prompt.
  // In Next.js middleware, we can check for auth cookie or allow pass-through to let client hydrate guest state.
  return NextResponse.next();
}

export const config = {
  matcher: ['/history/:path*', '/settings/:path*', '/admin/:path*'],
};
