'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { AnnouncementBar } from '@/components/announcement-bar';

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Check if current page is full-screen terminal, lobby, or dedicated auth page
  const isDedicated =
    pathname === '/' ||
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
  return (
    <Suspense fallback={<main className="flex-1">{children}</main>}>
      <ShellInner>{children}</ShellInner>
    </Suspense>
  );
}
