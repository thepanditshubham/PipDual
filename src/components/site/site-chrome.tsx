import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Menu, Swords } from 'lucide-react';
import { PromoStrip } from './promo-strip';

/**
 * Shared chrome for every marketing page.
 *
 * One nav, one footer, one page-hero, so twenty sub-pages cannot drift apart.
 * Everything here is a server component: no state, no effects, no client bundle.
 * The only interactive element on a marketing page is `<details>` in `FaqList`,
 * which needs no JavaScript at all.
 */

const NAV = [
  { href: '/product', label: 'Product' },
  { href: '/modes', label: 'Modes' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/fairness', label: 'Fairness' },
  { href: '/affiliate', label: 'Affiliate' },
];

/** Dropdown groups, opened by hover or keyboard focus — no JavaScript. */
const NAV_GROUPS = [
  {
    label: 'Resources',
    links: [
      { href: '/how-to-play', label: 'How to play' },
      { href: '/faq', label: 'FAQ' },
      { href: '/glossary', label: 'Glossary' },
      { href: '/blog', label: 'Blog' },
    ],
  },
  {
    label: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
      { href: '/press', label: 'Press' },
      { href: '/careers', label: 'Careers' },
      { href: '/changelog', label: 'Changelog' },
    ],
  },
];

const FOOTER = [
  {
    title: 'Product',
    links: [
      { href: '/product', label: 'The terminal' },
      { href: '/modes', label: 'Game modes' },
      { href: '/how-to-play', label: 'How to play' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Trust',
    links: [
      { href: '/fairness', label: 'How it is decided' },
      { href: '/proof', label: 'Payouts' },
      { href: '/security', label: 'Security' },
      { href: '/status', label: 'Status' },
      { href: '/faq', label: 'FAQ' },
      { href: '/glossary', label: 'Glossary' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/affiliate', label: 'Affiliate' },
      { href: '/blog', label: 'Blog' },
      { href: '/contact', label: 'Contact' },
      { href: '/support', label: 'Support' },
      { href: '/changelog', label: 'Changelog' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/legal/terms', label: 'Terms' },
      { href: '/legal/privacy', label: 'Privacy' },
      { href: '/legal/disclaimer', label: 'Disclaimer' },
      { href: '/legal/risk', label: 'Risk' },
      { href: '/legal/aml-kyc', label: 'AML / KYC' },
      { href: '/legal/responsible-trading', label: 'Responsible play' },
    ],
  },
];

export function SiteNav() {
  return (
    <div className="site-top">
      <PromoStrip />
      <header className="lp-nav">
        <Link href="/" className="lp-logo">
          <b>/</b>&nbsp;PIP DUEL
        </Link>

        <nav className="lp-nav-links" aria-label="Primary">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="lp-nav-link">
              {item.label}
            </Link>
          ))}

          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="lp-nav-group">
              <button type="button" className="lp-nav-link" aria-haspopup="true">
                {group.label}
              </button>
              <div className="lp-nav-menu">
                {group.links.map((link) => (
                  <Link key={link.href} href={link.href}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="lp-nav-right">
          <Link href="/login" className="lp-btn lp-btn--ghost">
            Log In
          </Link>
          <Link href="/register" className="lp-btn">
            Enter the Arena
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* Below 900px the links and CTAs are hidden and this takes over. */}
        <details className="lp-burger">
          <summary aria-label="Menu">
            <Menu size={16} />
          </summary>
          <div className="lp-burger-panel">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
            {NAV_GROUPS.flatMap((group) => group.links).map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
            <Link href="/register" className="lp-btn">
              Enter the Arena
              <ArrowRight size={13} />
            </Link>
          </div>
        </details>
      </header>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div className="site-footer-brand">
          <Link href="/" className="lp-logo">
            <b>/</b>&nbsp;PIP DUEL
          </Link>
          <p>
            One-to-one trading battles on a synthetic market that never closes. Coins carry real
            value; entries can be lost.
          </p>
        </div>

        {FOOTER.map((group) => (
          <div key={group.title} className="site-footer-col">
            <h4>{group.title}</h4>
            {group.links.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>

      <div className="site-footer-bottom">
        <span>© 2026 Pip Duel · Synthetic markets, real competition.</span>
        <nav aria-label="Legal">
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/disclaimer">Disclaimer</Link>
          <Link href="/legal/risk">Risk</Link>
        </nav>
      </div>
    </footer>
  );
}

/** Wraps a sub-page in the shared nav and footer. */
export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="pg-root">
      <SiteNav />
      {children}
      <SiteFooter />
      <div className="site-scanlines" aria-hidden="true" />
    </div>
  );
}

export function PageHero({
  kicker,
  title,
  lead,
  meta,
  actions,
}: {
  kicker?: string;
  title: ReactNode;
  lead?: ReactNode;
  meta?: string[];
  actions?: ReactNode;
}) {
  return (
    <section className="pg-hero">
      <div className="lp-hero-grid-bg" aria-hidden="true" />
      <div className="pg-hero-inner">
        {kicker && (
          <span className="pg-kicker">
            <Swords size={11} aria-hidden="true" />
            {kicker}
          </span>
        )}
        <h1 className="pg-title">{title}</h1>
        {lead && <p className="pg-lead">{lead}</p>}
        {meta && meta.length > 0 && (
          <div className="pg-meta">
            {meta.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        )}
        {actions && <div className="pg-actions">{actions}</div>}
      </div>
    </section>
  );
}

/** A closing call to action, used at the foot of most sub-pages. */
export function CtaBand({
  title = 'Bring your read. We’ll bring the rival.',
  copy = 'Open a free demo, or take the 100-coin table. The clock starts when the ticket does.',
}: {
  title?: string;
  copy?: string;
}) {
  return (
    <section className="lp-cta">
      <h2>{title}</h2>
      <p>{copy}</p>
      <div className="lp-cta-actions">
        <Link href="/register" className="lp-btn lp-btn--lg">
          Create an account
          <ArrowRight size={15} />
        </Link>
        <Link href="/how-to-play" className="lp-btn lp-btn--lg lp-btn--ghost">
          How a duel works
        </Link>
      </div>
    </section>
  );
}

/** Native `<details>` accordion — no client component, works with JS off. */
export function FaqList({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="pg-faq">
      {items.map((item) => (
        <details key={item.q}>
          <summary>{item.q}</summary>
          <div>
            <p>{item.a}</p>
          </div>
        </details>
      ))}
    </div>
  );
}

export interface ProseSection {
  heading: string;
  body?: ReactNode[];
  list?: ReactNode[];
}

/** Numbered document body for policy pages. */
export function Prose({ sections }: { sections: ProseSection[] }) {
  return (
    <div className="pg-prose">
      {sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.body?.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
          {section.list && (
            <ul>
              {section.list.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
