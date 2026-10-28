import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { LayoutShell } from '@/components/layout-shell';
import { SupabaseAuthProvider } from '@/components/supabase-auth-provider';
import { SoundProvider } from '@/components/sound-provider';

// Self-hosted Inter — exposed as `--font-inter` so globals.css / Tailwind can consume it.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'Pip Duel – 1v1 Virtual Trading Battles',
    template: '%s | Pip Duel',
  },
  description:
    'Same chart. Sixty seconds. One winner. Free 1v1 virtual trading battles by Forexwala. Learn risk management through play with $10,000 virtual balance.',
  keywords: ['trading game', 'forex', 'virtual trading', '1v1', 'pip duel', 'forexwala', 'trading battle'],
  authors: [{ name: 'Forexwala' }],
  openGraph: {
    title: 'Pip Duel – 1v1 Virtual Trading Battles',
    description: 'Same chart. Sixty seconds. One winner. Free 1v1 virtual trading battles.',
    type: 'website',
    locale: 'en_IN',
    siteName: 'Pip Duel',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pip Duel – 1v1 Virtual Trading Battles',
    description: 'Same chart. Sixty seconds. One winner.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Applies the saved theme before first paint so dark-mode players never see a
// light flash (and light, the default, needs no script at all).
const themeScript = `(function(){try{var t=localStorage.getItem('pip-duel-theme')||'light';var r=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.setAttribute('data-theme',r);}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme="light"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={inter.variable}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen flex flex-col bg-bg text-text">
        <ThemeProvider>
          <SupabaseAuthProvider>
            <SoundProvider>
              <LayoutShell>{children}</LayoutShell>
            </SoundProvider>
          </SupabaseAuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
