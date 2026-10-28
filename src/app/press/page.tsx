import Link from 'next/link';
import { PageHero, SitePage } from '@/components/site/site-chrome';

export const metadata = {
  title: 'Press — Facts, figures and brand rules',
  description:
    'Boilerplate, product facts and the colour palette for anyone writing about Pip Duel. No stock photography, no invented metrics.',
};

const FACTS = [
  ['Product', '1v1 trading duels on a synthetic market that runs 24/7'],
  ['Format', '5, 10 or 15 minute tables · four entries each · risk-adjusted scoring'],
  ['Instruments', '5 synthetic: XAU/USD, EUR/USD, XTI/USD, BTC/USD, US30'],
  ['Currency', 'Coins only, pegged at 100 coins = $1, bought and paid out in crypto'],
  ['Entry', 'From 100 coins (about $1) · Demo is free'],
  ['Fee', '15% of the pooled pot, published on the pricing page'],
  ['Built by', 'The Forexwala community, Pune, India'],
];

const PALETTE = [
  ['#000000', 'Field'],
  ['#0D0B0A', 'Panel'],
  ['#1A1714', 'Surface'],
  ['#302A22', 'Border'],
  ['#FF7722', 'Accent'],
  ['#FFC844', 'Gold'],
  ['#EDE8C8', 'Text'],
  ['#AAA080', 'Secondary'],
  ['#00DD66', 'Up'],
  ['#FF4444', 'Down'],
];

export default function PressPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Press"
        title={
          <>
            Everything you need to write
            <br />
            <em>about this accurately.</em>
          </>
        }
        lead="No logos to request, no brand team to email. Use the boilerplate, check the facts, and describe the market as synthetic — because it is."
        meta={['Last updated October 2026', 'No stock photography']}
      />

      <section className="lp-section">
        <div className="pg-prose">
          <h2>Boilerplate</h2>
          <p>
            Pip Duel is a one-to-one trading arena built by the Forexwala community in Pune, India.
            Two players trade an identical synthetic chart over a fixed window of five, ten or fifteen
            minutes, with the same four-entry limit and a result settled by a server-side replay. Live
            tables stake coins bought with crypto; Demo tables are free.
          </p>
          <p>
            <strong>Not:</strong> a broker, an exchange, a prop firm, or a source of real market data.
          </p>
        </div>
      </section>

      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">Fast facts</span>
          <h2 className="lp-h2">Numbers to quote</h2>
        </div>

        <div className="pg-table-outer">
          <div className="pg-table-wrap">
            <table className="pg-table">
              <tbody>
                {FACTS.map(([label, value]) => (
                  <tr key={label}>
                    <td style={{ width: '22%' }}>{label}</td>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-head">
          <span className="lp-kicker">Brand</span>
          <h2 className="lp-h2">Palette and naming</h2>
          <p className="lp-sub">
            One accent, one background, no gradients on the mark. The wordmark is set in IBM Plex
            Mono, uppercase, tracked wide.
          </p>
        </div>

        <div className="pg-terms">
          {PALETTE.map(([hex, name]) => (
            <div key={hex} className="pg-term">
              <dt style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i
                  style={{
                    width: 14,
                    height: 14,
                    background: hex,
                    border: '1px solid var(--fin-border-3)',
                    display: 'inline-block',
                  }}
                />
                {hex}
              </dt>
              <dd>{name}</dd>
            </div>
          ))}
        </div>

        <div className="pg-prose" style={{ marginTop: 28 }}>
          <h2>Usage</h2>
          <ul>
            <li>Write “Pip Duel”, two words, both capitalised. Not “PipDuel”, not “PIP DUEL” in prose.</li>
            <li>The mark is a slash and the wordmark: <strong>/ PIP DUEL</strong>. Do not redraw it.</li>
            <li>Never describe the market as real or live data. It is synthetic and generated.</li>
          </ul>
        </div>
      </section>

      <section className="lp-section lp-section--panel">
        <div className="pg-prose">
          <h2>Media enquiries</h2>
          <p>
            Interviews and quotes go through the <Link href="/contact">contact page</Link>. If you need
            a comment on a specific event, say what and by when — the answer may simply be no, but it
            will be quick.
          </p>
        </div>
      </section>
    </SitePage>
  );
}
