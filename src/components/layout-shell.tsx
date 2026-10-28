'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { AnnouncementBar } from '@/components/announcement-bar';
import { isSitePath } from '@/components/site/site-paths';

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Check if current page is full-screen terminal, lobby, or dedicated auth page.
  // Marketing pages draw their own nav and footer through `<SitePage>`, so they are
  // dedicated too — otherwise the shell would render a second navbar above them.
  const isDedicated =
    pathname === '/' ||
    isSitePath(pathname) ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/play') ||
    pathname.startsWith('/lobby') ||
    pathname.startsWith('/terminal') ||
    pathname.startsWith('/legal') ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password';

  if (isDedicated) {
    // Each of these pages draws its own chrome, so the shell adds nothing —
    // the lobby and the landing page mount the announcement bar inside their
    // own root (adding it here would stack a second min-h-screen column), and
    // the battle terminal and the admin console never carry one.
    return (
      <main className="min-h-screen w-full flex flex-col bg-bg text-text">
        {children}
      </main>
    );
  }

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}

export function LayoutShell({ children }: { children: React.ReactNode }) {
  // The fallback must not render `children`. `useSearchParams` in the navbar makes
  // this boundary suspend during prerender, and a fallback that carries the page
  // body leaves a second copy of it in the document once the real tree streams in —
  // two <main>, two <h1>, and every image downloaded twice. An inert placeholder
  // keeps the boundary without duplicating the page.
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <ShellInner>{children}</ShellInner>
    </Suspense>
  );
}
