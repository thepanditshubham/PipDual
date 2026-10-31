import Link from 'next/link';
import { ArrowUpRight, MessageCircle } from 'lucide-react';
import { PageHero, SitePage } from '@/components/site/site-chrome';

export const metadata = {
  title: 'Contact — Reach the right desk',
  description:
    'Product, partnerships, press or abuse — where each message should go, and what happens after you send it.',
};

const ROUTES = [
  {
    who: 'Players',
    what: 'Bugs, stuck duels, account and coin-balance questions.',
    where: 'Support',
    href: '/support',
    note: 'Include the room code and a UTC time. Internal.',
  },
  {
    who: 'Partnerships',
    what: 'Communities, educators and trading groups who want their own tables.',
    where: 'Telegram',
    href: 'https://t.me/forexwala',
    note: 'Say what your community is and roughly how many active traders.',
  },
  {
    who: 'Press',
    what: 'Interviews, brand assets, facts about the product.',
    where: 'Press kit',
    href: '/press',
    note: 'Boilerplate, palette and logo rules are already published.',
  },
  {
    who: 'Abuse & impersonation',
    what: 'Someone claiming to be Pip Duel asking for payments, keys or account access.',
    where: 'Telegram',
    href: 'https://t.me/forexwala',
    note: 'Screenshots help. Report first, do not confront.',
  },
];

export default function ContactPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Contact"
        title={
          <>
            One channel, four desks.
            <br />
            <em>Pick the right one.</em>
          </>
        }
        lead="We do not run a shared support inbox, because messages about money and messages about a chart bug need different people. Route it correctly and it moves faster."
        meta={['Pune, India', 'Replies are best effort']}
        actions={
          <a
            href="https://t.me/forexwala"
            target="_blank"
            rel="noopener noreferrer"
            className="lp-btn lp-btn--lg"
          >
            <MessageCircle size={15} />
            Open the channel
            <ArrowUpRight size={14} />
          </a>
        }
      />

      <section className="lp-section">
        <div className="pg-table-outer">
          <div className="pg-table-wrap">
            <table className="pg-table">
              <thead>
                <tr>
                  <th style={{ width: '18%' }}>Desk</th>
                  <th style={{ width: '32%' }}>What goes here</th>
                  <th style={{ width: '18%' }}>Where</th>
                  <th>Include</th>
                </tr>
              </thead>
              <tbody>
                {ROUTES.map((route) => (
                  <tr key={route.who}>
                    <td>{route.who}</td>
                    <td>{route.what}</td>
                    <td>
                      {route.href.startsWith('http') ? (
                        <a
                          href={route.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--fin-amber)', textDecoration: 'none' }}
                        >
                          {route.where} ↗
                        </a>
                      ) : (
                        <Link href={route.href} style={{ color: 'var(--fin-amber)', textDecoration: 'none' }}>
                          {route.where} →
                        </Link>
                      )}
                    </td>
                    <td>{route.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="lp-section lp-section--panel">
        <div className="pg-prose">
          <h2>What we cannot do</h2>
          <p>
            Support cannot reverse a settled duel, restore a coin entry spent on a loss, or
            change a score by hand. Those answers are the same for everyone, which is what makes
            them worth stating.
          </p>

          <h2>Response time</h2>
          <p>
            There is no 24/7 rota and no formal SLA. Money-related messages are looked at first.
            If a duel is stuck, say so in the first line — that is the one case where minutes matter.
          </p>

          <h2>Press and partnerships</h2>
          <p>
            Start with the <Link href="/press">press kit</Link> for facts and assets. If you need a
            quote or an interview, say so explicitly rather than sending a brief and waiting.
          </p>
        </div>
      </section>
    </SitePage>
  );
}
