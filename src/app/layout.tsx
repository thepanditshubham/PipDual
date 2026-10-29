import type { Metadata } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { LayoutShell } from '@/components/layout-shell';
import { SupabaseAuthProvider } from '@/components/supabase-auth-provider';
import { SoundProvider } from '@/components/sound-provider';
import { SpeedInsights } from '@vercel/speed-insights/next';

// The whole product speaks in one typeface: a mono, because every screen of the
// terminal design this follows is a mono. Exposed as `--font-plex` and consumed by
// the `--font-*` tokens in globals.css.
const plex = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex',
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

// Applies the saved theme before first paint. The terminal look is dark; light is
// still reachable from Settings for players who prefer it.
const themeScript = `(function(){try{var t=localStorage.getItem('pip-duel-theme')||'dark';var r=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.setAttribute('data-theme',r);}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={plex.variable}
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
        <SpeedInsights />
      </body>
    </html>
  );
}
