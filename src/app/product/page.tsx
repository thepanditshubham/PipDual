import Link from 'next/link';
import { ArrowRight, BarChart3, Crosshair, Gauge, Layers } from 'lucide-react';
import { CtaBand, PageHero, SitePage } from '@/components/site/site-chrome';
import { ALLOWED_SIZES, MAX_ORDERS_PER_MATCH, START_BALANCE } from '@/lib/engine/constants';
import { SYNTH_PAIRS } from '@/lib/engine/synthetic-market';

export const metadata = {
  title: 'Product — The terminal explained',
  description:
    'What the Pip Duel terminal actually is: the chart, the order ticket, the rival panel and the result screen, and what each one is doing during a duel.',
};

const PANELS = [
  {
    n: '01',
    icon: <BarChart3 size={16} />,
    title: 'The chart',
    body: 'One-minute candles with a live head. The forming candle grows tick by tick and seals into the bar it becomes — it never repaints history. Four timeframes, five instruments, and a price axis scaled to the instrument’s own decimals.',
  },
  {
    n: '02',
    icon: <Crosshair size={16} />,
    title: 'The order ticket',
    body: `Market entries in ${ALLOWED_SIZES.length} sizes, a stop-loss and take-profit you can type as a price, and a running count of how many entries are left. ${MAX_ORDERS_PER_MATCH} per duel, and the counter is the one thing that decides whether a button is live.`,
  },
  {
    n: '03',
    icon: <Gauge size={16} />,
    title: 'The rival panel',
    body: 'Their P&L, their equity curve and whether they are in a trade — never their entries, size or stops. Enough to know if you are chasing, not enough to copy.',
  },
  {
    n: '04',
    icon: <Layers size={16} />,
    title: 'The result screen',
    body: 'Both accounts, both equity curves, the winning side and the pot. The number it shows is the server’s replay, not a figure the browser produced.',
  },
];

export default function ProductPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Product"
        title={
          <>
            A terminal built for two people
            <br />
            <em>to share at the same time.</em>
          </>
        }
        lead="Most trading UIs are built for one person watching one account. A duel needs two, on the same clock, with the same market and no ability to see into each other’s book. Four panels do that work."
        meta={[
          `${SYNTH_PAIRS.length} instruments`,
          `${MAX_ORDERS_PER_MATCH} entries each`,
          `$${START_BALANCE.toLocaleString()} starting equity`,
        ]}
        actions={
          <>
            <Link href="/play" className="lp-btn lp-btn--lg">
              Open the lobby
              <ArrowRight size={15} />
            </Link>
            <Link href="/how-to-play" className="lp-btn lp-btn--lg lp-btn--ghost">
              Read the rules
            </Link>
          </>
        }
      />

      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">The four panels</span>
          <h2 className="lp-h2">What is on the screen during a duel</h2>
        </div>

        <div className="lp-steps">
          {PANELS.map((panel) => (
            <article key={panel.n} className="lp-step">
              <div className="lp-step-n">{panel.n}</div>
              <h3 className="lp-step-t">{panel.title}</h3>
              <p className="lp-step-d">{panel.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-head">
          <span className="lp-kicker">Specification</span>
          <h2 className="lp-h2">The numbers behind the screen</h2>
        </div>

        <div className="pg-table-outer">
          <div className="pg-table-wrap">
            <table className="pg-table">
              <tbody>
                <tr>
                  <td style={{ width: '28%' }}>Instruments</td>
                  <td>{SYNTH_PAIRS.map((p) => p.symbol).join(' · ')}</td>
                </tr>
                <tr>
                  <td>Timeframes</td>
                  <td>15s · 30s · 1m · 3m · 5m · 10m · 30m · 1h · 4h, aggregated from the same one-minute source</td>
                </tr>
                <tr>
                  <td>Table lengths</td>
                  <td>5, 10 or 15 minutes</td>
                </tr>
                <tr>
                  <td>Entries per duel</td>
                  <td>{MAX_ORDERS_PER_MATCH} per player, including the entry side of a reverse</td>
                </tr>
                <tr>
                  <td>Position sizes</td>
                  <td>{ALLOWED_SIZES.join(' · ')} — same ladder for both players</td>
                </tr>
                <tr>
                  <td>Brackets</td>
                  <td>Stop-loss and take-profit, entered as a price and stored as a percentage from entry</td>
                </tr>
                <tr>
                  <td>Settlement</td>
                  <td>Server-side replay of submitted actions against the regenerated series</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="lp-section lp-section--panel">
        <div className="pg-prose">
          <h2>What the terminal deliberately does not have</h2>
          <p>
            No indicators, no drawing tools, no news feed, no economic calendar. Each of those would
            give one player more to look at than the other can process in five minutes, and none of
            them changes what a duel is testing: a read of price over a short window.
          </p>
          <p>
            The Free tables at <Link href="/modes">/modes</Link> run the same chart with the order
            ticket attached, so you can learn the layout before staking anything.
          </p>

          <h2>Why the chart is shared rather than streamed</h2>
          <p>
            Both terminals derive the candles from the same rule and the same start time. There is no
            feed to subscribe to, which means no subscription can be faster than another player’s and
            no history can be altered between the two screens.
          </p>
        </div>
      </section>

      <CtaBand
        title="Look at it before you sign up."
        copy="A free account opens the Free tables — same chart, same rules, no coins at stake."
      />
    </SitePage>
  );
}
