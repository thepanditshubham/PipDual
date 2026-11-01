import Link from 'next/link';
import { PageHero, SitePage } from '@/components/site/site-chrome';

export const metadata = {
  title: 'Changelog — What shipped',
  description: 'A dated list of what changed in Pip Duel, newest first.',
};

const ENTRIES: { date: string; title: string; items: string[] }[] = [
  {
    date: '31 Oct 2026',
    title: 'Free-to-play hardening',
    items: [
      'Crypto deposits, withdrawals, on-chain verification, the deposit QR and the money review desks were removed.',
      'The affiliate/IB desk and referral commissions were removed; invite codes now only bring a friend.',
      'Coins are virtual credits earned by playing and in missions: no purchase, no transfer, no cash-out.',
      'The public admin console was removed from the open-source build; operator tooling stays private.',
      'The indigo and amber theme replaced the charcoal and burnt-orange palette.',
    ],
  },
  {
    date: '29 Oct 2026',
    title: 'New design system and the public site',
    items: [
      'One typeface across the product: IBM Plex Mono, with an indigo and amber palette.',
      'Landing page rebuilt around a centred hero and a live terminal mock.',
      'Marketing pages added: pricing, fairness, compare, FAQ, proof, security, status, glossary, blog, about and the policy set.',
      'Modes and pricing rebuilt on the shared marketing system.',
      'The standalone 24/7 market terminal was retired. Duels still run on the same generator; only the public spectator page was removed.',
      'Every page is now a server component — no client bundle on the marketing site.',
    ],
  },
  {
    date: '28 Oct 2026',
    title: 'Live Market Terminal',
    items: [
      'A public terminal that never closes: one candle per minute, a new price every five seconds.',
      'Each visit deals a fresh seed, so the chart on screen has never existed before and will not exist again.',
      'Five instruments and four timeframes, free to watch with no account.',
      'Fixed a hydration mismatch caused by printing the session seed into the server HTML.',
      'Fixed the chart collapsing to a single candle when switching to an instrument with different decimals.',
    ],
  },
  {
    date: '27 Oct 2026',
    title: 'One shared market for every duel',
    items: [
      'Duels no longer derive a market from a session seed. The window is picked by the ticket start time and snapped to the UTC hour.',
      'Every duel fired in the same hour now trades the identical window.',
      'The submit route rejects a payload with no anchor, or an anchor doctored to a far-off hour.',
    ],
  },
  {
    date: '26 Oct 2026',
    title: 'Coins-only economy',
    items: [
      'Virtual dollars retired from the wallet. Coins became the only currency; they were later made virtual-only.',
      'Ranked entry fees published per table length; the sink is a fixed 15% of the pooled pot.',
      'The paid wallet described in this entry was removed in the free-to-play build — no deposits or payouts remain.',
    ],
  },
  {
    date: '25 Oct 2026',
    title: 'Ladder and progression',
    items: [
      'Divisions and rating points, with placement matches and a slow decay for idle accounts.',
      'Missions, achievements and a profile showcase.',
      'Public player cards at /u/[username].',
    ],
  },
  {
    date: '24 Oct 2026',
    title: 'Friends and challenges',
    items: [
      'Add rivals, send a challenge, and take it from the lobby board.',
      'Invite codes attached at signup. Referral commissions were removed in the free-to-play build.',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Changelog"
        title={
          <>
            What changed,
            <br />
            <em>newest first.</em>
          </>
        }
        lead="No marketing rounding. Each entry lists what actually moved, including the bugs that were fixed and the trade-offs accepted."
        meta={[`${ENTRIES.length} releases`, 'Updated when something ships']}
      />

      <section className="lp-section">
        <div className="pg-prose">
          {ENTRIES.map((entry) => (
            <section key={entry.date}>
              <h2>{entry.title}</h2>
              <p style={{ color: 'var(--fin-orange)', fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase' }}>
                {entry.date}
              </p>
              <ul>
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}

          <p>
            Older changes live in the repository history. Bug reports go to{' '}
            <Link href="/support">support</Link>.
          </p>
        </div>
      </section>
    </SitePage>
  );
}
