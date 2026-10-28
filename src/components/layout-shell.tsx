'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

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
    return (
      <main className="min-h-screen w-full flex flex-col bg-bg text-text">
        {children}
      </main>
    );
  }

  return (
    <>
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
