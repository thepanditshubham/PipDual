/**
 * Marketing pages that draw their own chrome.
 *
 * Everything under these paths renders `<SitePage>` — its own nav, its own footer —
 * so `LayoutShell` must not add the app's navbar and footer on top. Keeping the list
 * in one module means a new page is added to exactly one place instead of also
 * needing a pathname check edited in the shell.
 */
export const SITE_PATHS = [
  '/product',
  '/modes',
  '/pricing',
  '/fairness',
  '/faq',
  '/compare',
  '/about',
  '/security',
  '/proof',
  '/status',
  '/glossary',
  '/support',
  '/contact',
  '/careers',
  '/press',
  '/changelog',
  '/blog',
  '/invites',
  '/legal/risk',
  '/legal/responsible-trading',
] as const;

export function isSitePath(pathname: string): boolean {
  return SITE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
