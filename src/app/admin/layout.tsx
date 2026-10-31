'use client';

/**
 * /admin/layout.tsx
 * The admin shell, laid out like shadcn's `sidebar-09` block, but grouped by
 * the job rather than by page: a narrow icon rail picks one of five sections
 * (Money, Players, Operations, Economy, System), the list panel beside it
 * lists that section's pages with every row divided by a hairline, and the
 * page itself is the inset column. The marketing navbar/footer are hidden on
 * /admin (see layout-shell.tsx), so this is the whole chrome.
 *
 * Economy is listed but not built yet: its rows are inert, so the panel reads
 * as a roadmap instead of eight dead links. System has grown its first live
 * page (Announcements), so its rail icon navigates now.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  ChevronRight,
  FileText,
  Layers,
  LayoutDashboard,
  Megaphone,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  Store,
  Swords,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { Gate } from '@/components/admin/admin-bits';

type SectionId = 'money' | 'players' | 'operations' | 'economy' | 'system';

/** How far along a page is. `live` renders no chip at all. */
type PageState = 'live' | 'new' | 'mock' | 'next' | 'later';

interface AdminPage {
  href: string;
  label: string;
  hint: string;
  icon: typeof LayoutDashboard;
  state: PageState;
}

interface AdminSection {
  id: SectionId;
  label: string;
  /** One line for the rail tooltip and the panel header. */
  hint: string;
  icon: typeof LayoutDashboard;
  /** Where the rail icon goes; null while a section has nothing built. */
  href: string | null;
  pages: AdminPage[];
}

const SECTIONS: AdminSection[] = [
  {
    id: 'money',
    label: 'Money',
    hint: 'Deposits in, payouts out, every coin accounted for',
    icon: LayoutDashboard,
    href: '/admin',
    pages: [
      {
        href: '/admin',
        label: 'Console',
        hint: 'One feed of every money event, with a reading pane',
        icon: LayoutDashboard,
        state: 'live',
      },
      {
        href: '/admin/deposits',
        label: 'Deposit review',
        hint: 'Verify transfers, then credit coins',
        icon: ArrowDownToLine,
        state: 'live',
      },
      {
        href: '/admin/withdrawals',
        label: 'Payout queue',
        hint: 'Sign off outgoing USDT by hand',
        icon: ArrowUpFromLine,
        state: 'live',
      },
      {
        href: '/admin/ledger',
        label: 'Ledger',
        hint: 'Every coin the wallet moved, and manual adjustments',
        icon: BookOpen,
        state: 'new',
      },
    ],
  },
  {
    id: 'players',
    label: 'Players',
    hint: 'Who is playing, what they hold, and whether they can play',
    icon: Users,
    href: '/admin/players',
    pages: [
      {
        href: '/admin/players',
        label: 'Directory',
        hint: 'Search accounts, open one, adjust or lock it',
        icon: Users,
        state: 'new',
      },
      {
        href: '/admin/referrals',
        label: 'Affiliate (IB)',
        hint: 'Rebate ladder, fee split, desks and pairings',
        icon: UserPlus,
        state: 'live',
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    hint: 'Arena health, anti-cheat, and the market itself',
    icon: ShieldCheck,
    href: '/admin/reports',
    pages: [
      {
        href: '/admin/reports',
        label: 'Match reports',
        hint: 'Volume, bot duels and the anti-cheat flag queue',
        icon: FileText,
        state: 'mock',
      },
      {
        href: '/admin/segments',
        label: 'Segments',
        hint: 'Group the arena by skill band and chart shape',
        icon: Layers,
        state: 'mock',
      },
    ],
  },
  {
    id: 'economy',
    label: 'Economy',
    hint: 'Store, orders, market and seasons — next up',
    icon: Store,
    href: null,
    pages: [
      {
        href: '/admin/store',
        label: 'Store items',
        hint: 'What the arena sells, at what price',
        icon: Store,
        state: 'next',
      },
      {
        href: '/admin/orders',
        label: 'Orders',
        hint: 'Purchases to fulfil or refund',
        icon: FileText,
        state: 'next',
      },
      {
        href: '/admin/market',
        label: 'Market listings',
        hint: 'Player-to-player listings and their settlement',
        icon: Layers,
        state: 'next',
      },
      {
        href: '/admin/seasons',
        label: 'Seasons & pass',
        hint: 'Season windows and pass rewards',
        icon: BookOpen,
        state: 'next',
      },
    ],
  },
  {
    id: 'system',
    label: 'System',
    hint: 'Announcements now; audit, roles and health later',
    icon: Settings,
    href: '/admin/announcements',
    pages: [
      {
        href: '/admin/announcements',
        label: 'Announcements',
        hint: 'Publish the strip above the lobby header and the menu bar',
        icon: Megaphone,
        state: 'live',
      },
      {
        href: '/admin/audit',
        label: 'Audit log',
        hint: 'Who changed what, and when',
        icon: FileText,
        state: 'later',
      },
      {
        href: '/admin/admins',
        label: 'Admins & roles',
        hint: 'Grant or revoke console access',
        icon: ShieldCheck,
        state: 'later',
      },
      {
        href: '/admin/mail',
        label: 'Mail composer',
        hint: 'Write the letters that reach every inbox',
        icon: BookOpen,
        state: 'later',
      },
      {
        href: '/admin/health',
        label: 'Health',
        hint: 'Queues, latency and failed jobs',
        icon: LayoutDashboard,
        state: 'later',
      },
    ],
  },
];

const STATE_CHIP: Record<Exclude<PageState, 'live'>, string> = {
  new: 'border-[var(--purple)]/30 bg-[var(--purple)]/10 text-[var(--purple)]',
  mock: 'border-[var(--amber,#f59e0b)]/30 bg-[var(--amber,#f59e0b)]/10 text-[var(--amber,#f59e0b)]',
  next: 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]',
  later: 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]',
};

const STATE_LABEL: Record<Exclude<PageState, 'live'>, string> = {
  new: 'New',
  mock: 'Mock',
  next: 'Next',
  later: 'Later',
};

/** Rail width + panel width: the main column is offset by both. */
const RAIL_W = 64;
const PANEL_W = 320;

/** The section a URL belongs to, by the longest page href that prefixes it. */
function sectionForPath(pathname: string): SectionId | null {
  let bestId: SectionId | null = null;
  let bestLength = -1;

  for (const section of SECTIONS) {
    for (const page of section.pages) {
      const hit = pathname === page.href || pathname.startsWith(`${page.href}/`);
      if (hit && page.href.length > bestLength) {
        bestId = section.id;
        bestLength = page.href.length;
      }
    }
  }

  return bestId;
}

/** Breadcrumb: the section label plus the page, with the player route named. */
function crumbFor(pathname: string): { section: string; page: string } {
  if (/^\/admin\/players\/[^/]+$/.test(pathname)) {
    return { section: 'Players', page: 'Player' };
  }

  let best: { section: string; page: string; length: number } | null = null;
  for (const section of SECTIONS) {
    for (const page of section.pages) {
      const hit = pathname === page.href || pathname.startsWith(`${page.href}/`);
      if (hit && page.href.length > (best?.length ?? -1)) {
        best = { section: section.label, page: page.label, length: page.href.length };
      }
    }
  }

  return best ? { section: best.section, page: best.page } : { section: 'Admin', page: 'Console' };
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  // A section picked from the rail that has no page of its own yet.
  const [picked, setPicked] = useState<SectionId | null>(null);
  const [mounted, setMounted] = useState(false);
  // The panel footer is the operator's clock: the account and the way back to
  // the arena already sit in the rail and the header.
  const [now, setNow] = useState(() => new Date());
  const isAdmin = user?.role === 'admin';

  // The auth store rehydrates from localStorage on the client, so the server
  // and the first client render cannot know the role yet. Paint the shell's
  // background until then instead of flashing a gate at a signed-in admin.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // One tick a second keeps the footer honest without redrawing anything else.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!mounted) {
    return <div className="min-h-screen bg-[var(--ui-deep)]" />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--ui-deep)] flex items-center justify-center">
        <Gate
          title="Sign in required"
          body="The admin console is only visible to a signed-in admin account."
        />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[var(--ui-deep)] flex items-center justify-center">
        <Gate
          title="Admin access only"
          body={`Signed in as ${user.username}, which is not an admin account. Set role = 'admin' on this profile's row in Supabase to review money.`}
        />
      </div>
    );
  }

  const crumb = crumbFor(pathname);
  const activeSection = picked ?? sectionForPath(pathname) ?? 'money';
  const needle = query.trim().toLowerCase();

  const matches = (page: AdminPage) =>
    !needle || `${page.label} ${page.hint} ${page.state}`.toLowerCase().includes(needle);

  // Searching looks across every section; otherwise the panel is the section
  // the rail is on, like the block's mail/inbox split.
  const groups = SECTIONS.map((section) => ({
    section,
    items: needle ? section.pages.filter(matches) : section.pages,
  })).filter((group) => group.items.length > 0 && (needle ? true : group.section.id === activeSection));

  const currentSection = SECTIONS.find((section) => section.id === activeSection) ?? SECTIONS[0];

  /* The icon rail: one glyph per section, tooltips carry the label. */
  const rail = (
    <>
      <div className="flex h-14 shrink-0 items-center justify-center border-b border-[var(--border)]">
        <span
          title="Pip Duel — admin console"
          className="gradient-brand flex h-9 w-9 items-center justify-center text-[#241c10]"
        >
          <Swords size={17} />
        </span>
      </div>

      <nav
        aria-label="Admin sections"
        className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto py-3"
      >
        {SECTIONS.map((section) => {
          const active = section.id === activeSection;
          const Icon = section.icon;
          const className = `flex h-10 w-10 items-center justify-center transition-colors ${
            active
              ? 'bg-[var(--surface-muted)] text-[var(--purple)] ring-1 ring-[var(--purple)]/25'
              : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]'
          }`;

          return section.href ? (
            <Link
              key={section.id}
              href={section.href}
              title={`${section.label} — ${section.hint}`}
              aria-label={section.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => setPicked(null)}
              className={className}
            >
              <Icon size={18} />
            </Link>
          ) : (
            <button
              key={section.id}
              type="button"
              title={`${section.label} — ${section.hint}`}
              aria-label={section.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => setPicked(section.id)}
              className={`${className} cursor-pointer`}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-[var(--border)] p-3">
        <Link
          href="/play"
          title="Back to arena"
          aria-label="Back to arena"
          className="flex h-9 w-9 items-center justify-center border border-[var(--border)] bg-[var(--surface-muted)] text-[11px] font-black uppercase text-[var(--text)] hover:border-[var(--purple)] transition-colors"
        >
          {user.username.charAt(0)}
        </Link>
      </div>
    </>
  );

  /* The list panel: rows are separated by hairlines, like the block's inbox. */
  const panel = (onNavigate?: () => void) => (
    <>
      <div className="shrink-0 space-y-3 border-b border-[var(--border)] p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 leading-tight">
            <span className="block text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
              Pip Duel
            </span>
            <span className="block truncate text-sm font-semibold text-[var(--text)]">
              {needle ? 'Search admin' : currentSection.label}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="hidden h-8 w-8 shrink-0 items-center justify-center border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] transition-colors cursor-pointer lg:inline-flex"
            aria-label="Collapse admin navigation"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        <label className="relative block">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search admin…"
            aria-label="Search admin pages"
            className="h-9 w-full border border-[var(--border)] bg-[var(--surface-muted)] pl-8 pr-3 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)]"
          />
        </label>
      </div>

      {/* The rail is desktop chrome, so the drawer carries a section switcher. */}
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] p-2 lg:hidden">
        {SECTIONS.map((section) => {
          const active = section.id === activeSection;
          const chipClass = `shrink-0 px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
            active
              ? 'bg-[var(--surface-muted)] text-[var(--purple)] ring-1 ring-[var(--purple)]/25'
              : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]'
          }`;

          return section.href ? (
            <Link
              key={section.id}
              href={section.href}
              onClick={() => {
                setPicked(null);
                onNavigate?.();
              }}
              className={chipClass}
            >
              {section.label}
            </Link>
          ) : (
            <button
              key={section.id}
              type="button"
              onClick={() => setPicked(section.id)}
              className={`${chipClass} cursor-pointer`}
            >
              {section.label}
            </button>
          );
        })}
      </div>

      <nav aria-label="Admin pages" className="flex-1 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.section.id}>
            <p className="border-b border-[var(--border)] bg-[var(--surface-muted)]/50 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              {group.section.label}
            </p>

            {group.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              const chip =
                item.state === 'live' ? null : (
                  <span
                    className={`shrink-0 border px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider ${STATE_CHIP[item.state]}`}
                  >
                    {STATE_LABEL[item.state]}
                  </span>
                );

              // Planned pages stay inert: a row that navigates nowhere is
              // worse than a row that says what it is.
              if (item.state === 'next' || item.state === 'later') {
                return (
                  <div
                    key={item.href}
                    aria-disabled="true"
                    className="flex flex-col gap-1 border-b border-[var(--border)] px-4 py-3 opacity-70"
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon size={16} className="text-[var(--text-muted)]" />
                      <span className="flex-1 truncate text-sm font-semibold text-[var(--text-secondary)]">
                        {item.label}
                      </span>
                      {chip}
                    </span>
                    <span className="line-clamp-2 pl-[22px] text-xs leading-snug text-[var(--text-muted)]">
                      {item.hint}
                    </span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    setPicked(null);
                    onNavigate?.();
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-col gap-1 border-b border-[var(--border)] px-4 py-3 transition-colors ${
                    active ? 'bg-[var(--surface-muted)]' : 'hover:bg-[var(--surface-muted)]/60'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Icon
                      size={16}
                      className={active ? 'text-[var(--purple)]' : 'text-[var(--text-muted)]'}
                    />
                    <span className="flex-1 truncate text-sm font-semibold text-[var(--text)]">
                      {item.label}
                    </span>
                    {chip}
                    {active && <ChevronRight size={14} className="text-[var(--purple)]" />}
                  </span>
                  <span className="line-clamp-2 pl-[22px] text-xs leading-snug text-[var(--text-secondary)]">
                    {item.hint}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}

        {groups.length === 0 && (
          <p className="px-4 py-10 text-center text-xs text-[var(--text-muted)]">
            No admin page matches “{query.trim()}”.
          </p>
        )}
      </nav>

      <div className="shrink-0 border-t border-[var(--border)] px-4 py-3">
        <p className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-[var(--text-secondary)]">
            {now.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <span className="font-mono text-[13px] font-bold text-[var(--text)] tabular-nums">
            {now.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        </p>
      </div>
    </>
  );

  return (
    <div data-admin className="min-h-screen bg-[var(--ui-deep)] text-[var(--text)]">
      {/* Icon rail */}
      <aside
        style={{ width: RAIL_W }}
        className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:flex"
      >
        {rail}
      </aside>

      {/* List panel — slides away when collapsed, so the inset keeps the rail. */}
      <aside
        style={{ left: RAIL_W, width: PANEL_W }}
        className={`fixed inset-y-0 z-30 flex-col border-r border-[var(--border)] bg-[var(--surface)] ${
          collapsed ? 'hidden' : 'hidden lg:flex'
        }`}
      >
        {panel()}
      </aside>

      {/* Mobile drawer: the panel alone, the rail is desktop chrome. */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[320px] flex-col border-r border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <button
              type="button"
              onClick={() => setDrawer(false)}
              className="absolute right-3 top-3 p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] cursor-pointer"
              aria-label="Close admin navigation"
            >
              <X size={18} />
            </button>
            {panel(() => setDrawer(false))}
          </aside>
        </div>
      )}

      <div
        className={`flex min-h-screen flex-col transition-[padding] duration-200 ${
          collapsed ? 'lg:pl-[64px]' : 'lg:pl-[384px]'
        }`}
      >
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/90 px-3 backdrop-blur md:px-5">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className=" border border-[var(--border)] p-2 text-[var(--text-secondary)] cursor-pointer lg:hidden"
            aria-label="Open admin navigation"
          >
            <Menu size={18} />
          </button>

          {collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="hidden border border-[var(--border)] p-2 text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer lg:inline-flex"
              aria-label="Open admin navigation panel"
            >
              <PanelLeftOpen size={17} />
            </button>
          )}

          <span className="hidden h-4 w-px bg-[var(--border)] sm:block" aria-hidden />

          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs">
            <Link href="/admin" className="hidden text-[var(--text-muted)] hover:text-[var(--text)] md:inline">
              Admin
            </Link>
            <ChevronRight size={12} className="hidden text-[var(--text-muted)] md:inline" />
            <span className="hidden text-[var(--text-muted)] sm:inline">{crumb.section}</span>
            <ChevronRight size={12} className="hidden text-[var(--text-muted)] sm:inline" />
            <span className="truncate font-bold text-[var(--text)]">{crumb.page}</span>
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden items-center gap-1.5 border border-[var(--border)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] sm:inline-flex">
              <ShieldCheck size={12} className="text-[var(--purple)]" /> Admin
            </span>
            <span className="hidden text-[11px] text-[var(--text-muted)] md:block">
              Signed in as <span className="font-bold text-[var(--text)]">{user.username}</span>
            </span>
            <Link
              href="/play"
              className=" border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-[11px] font-bold text-[var(--text)] hover:border-[var(--purple)] transition-colors"
            >
              Arena →
            </Link>
          </div>
        </header>

        {/* A fixed-height content column: the shell itself never scrolls, long
            pages scroll here, and the console fills whatever height is left
            even when there are no rows in it. */}
        <main className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-y-auto px-3 py-4 md:px-5 md:py-5">
          {children}
        </main>
      </div>
    </div>
  );
}
