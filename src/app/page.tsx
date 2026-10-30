import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Swords,
  Trophy,
} from 'lucide-react';
import { SiteFooter, SiteNav } from '@/components/site/site-chrome';
import { MATCH_DURATIONS, MAX_ORDERS_PER_MATCH } from '@/lib/engine/constants';
import { COINS_PER_USD, HOUSE_CUT, LIVE_FEES } from '@/lib/economy/config';
import { SYNTH_PAIRS } from '@/lib/engine/synthetic-market';

export const metadata = {
  title: 'Pip Duel — Same chart. Two traders. One winner.',
  description:
    '1v1 trading battles on a synthetic market that never closes. Identical candles for both traders, four entries each, five to fifteen minutes to settle it.',
};

/** Winner's return on one entry: two stakes in, the house takes its cut. */
const WINNER_MULTIPLE = (1 - HOUSE_CUT) * 2;
const CHEAPEST_ENTRY = Math.min(...Object.values(LIVE_FEES)) / COINS_PER_USD;
const CHEAPEST_COINS = Math.min(...Object.values(LIVE_FEES));
const TABLE_MINUTES = Object.values(MATCH_DURATIONS).map((seconds) => seconds / 60);

const PROMISES = [
  {
    title: 'No house price',
    text: 'The bid/ask is part of the simulation and identical for both sides. We are not the counterparty to your trade.',
  },
  {
    title: 'No stale feed',
    text: 'Candles are derived, not streamed. There is no subscription to lag, no history to rewind and nothing to intercept.',
  },
  {
    title: 'No edited score',
    text: 'Your terminal sends the actions you took. The server replays them against the same series and settles on its own number.',
  },
];

const JOURNEY = [
  {
    time: '00:00',
    title: 'Ticket taken',
    text: 'Both players hold the same start time before a single candle prints. Nobody picks the market after seeing it.',
  },
  {
    time: '00:02',
    title: 'Window opens',
    text: `The window snaps to the UTC hour. Four entries each, equal equity, one shared chart.`,
  },
  {
    time: '02:30',
    title: 'Halfway',
    text: 'Equity curves diverge. The rival panel shows their P&L and exposure — never their orders, size or stops.',
  },
  {
    time: '05:00',
    title: 'Settled',
    text: `The server re-runs the duel and the winner collects ${WINNER_MULTIPLE.toFixed(2)}× the entry. The loser loses the entry, nothing more.`,
  },
];

const TERMS = [
  {
    num: String(SYNTH_PAIRS.length),
    title: 'Markets, all synthetic',
    text: `${SYNTH_PAIRS.map((pair) => pair.symbol).join(' · ')}. Generated from a seeded rule, so a settled duel can be re-derived years later.`,
  },
  {
    num: '9',
    title: 'Timeframes',
    text: 'Fifteen seconds through four hours, all cut from the same source. A duel runs on the clock, and the engine fills on the same prints the chart draws.',
  },
  {
    num: 'USDT',
    title: 'Payouts on two rails',
    text: 'Withdraw on BEP20 or TRC20, from $5, with a flat $1 network fee taken off the payout rather than charged up front.',
  },
];

const RULE_SETS = [
  {
    name: 'Standard',
    tag: 'Pure P&L',
    text: 'Highest final profit wins. Tiebreak on lower drawdown, then fewer entries.',
  },
  {
    name: 'Risk-adjusted',
    tag: 'Discipline',
    text: 'Score reads profit against maximum drawdown, so one deep hole cannot be hidden by a big finish.',
  },
  {
    name: 'Versus bot',
    tag: 'No stakes',
    text: 'A deterministic momentum bot, instant start, no rating change. Warm up without touching the ladder.',
  },
];

const FAQ = [
  {
    q: 'Is this real trading?',
    a: 'No. Prices are synthetic and generated, not routed to any exchange. Sizing, drawdown and P&L behave like a real terminal, but the candles are not real gold or real euro.',
  },
  {
    q: 'What can I lose?',
    a: `One entry. Live tables start at ${CHEAPEST_COINS} coins ($${CHEAPEST_ENTRY.toFixed(2)}) and that is the whole stake — there is no margin call behind it.`,
  },
  {
    q: 'Why only four entries?',
    a: 'Four is enough to open, add, reverse or re-enter, and too few to average into a losing trade. The cap is the same for both players, which is what makes it a read rather than a click contest.',
  },
  {
    q: 'Do I need to deposit to start?',
    a: 'No. A free account opens the demo tables, which use the same chart, the same spread and the same entry cap.',
  },
];

export default function LandingPage() {
  return (
    <div className="lp">
      <SiteNav />

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-center">
          <span className="lp-eyebrow">
            <i className="lp-pulse" />
            Arena open · synthetic markets · 24/7
          </span>

          <h1 className="lp-hero-title">
            Same chart. Two traders.
            <br />
            <em>One winner.</em>
          </h1>

          <p className="lp-lead">
            Take on one rival in a five-minute market call. Identical synthetic candles, four entries
            each, and a result the server re-checks — so the only thing that decides it is how you
            read the chart.
          </p>

          <div className="lp-hero-ctas">
            <Link href="/register" className="lp-btn lp-btn--xl">
              Start free
              <ArrowRight size={16} />
            </Link>
            <Link href="/how-to-play" className="lp-btn lp-btn--xl lp-btn--ghost">
              How it works
            </Link>
          </div>

          <p className="lp-hero-note">
            <Check size={11} /> Free demo, no card · Live tables from {CHEAPEST_COINS} coins ·
            24/7 market
          </p>

          <div className="lp-hero-bar">
            <div className="lp-hero-bar-item">
              <b>{SYNTH_PAIRS.length}</b> instruments
            </div>
            <div className="lp-hero-bar-item">
              <b>{MAX_ORDERS_PER_MATCH}</b> entries each
            </div>
            <div className="lp-hero-bar-item">
              <b>{Math.round((1 - HOUSE_CUT) * 100)}%</b> of the pot
            </div>
            <div className="lp-hero-bar-item">
              <b>{TABLE_MINUTES.map((m) => `${m}m`).join(' / ')}</b> tables
            </div>
          </div>
        </div>
      </section>

      {/* ── Promise band ────────────────────────────────────── */}
      <section className="lp-section" style={{ paddingTop: 0, borderTop: 0 }}>
        <div className="lp-band">
          {PROMISES.map((item) => (
            <div key={item.title} className="lp-band-item">
              <div className="lp-band-title">{item.title}</div>
              <p className="lp-band-text">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Journey ─────────────────────────────────────────── */}
      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">The duel, minute by minute</span>
          <h2 className="lp-h2">What happens between the ticket and the payout</h2>
          <p className="lp-sub">
            Five minutes of market time, four decisions, one settled result. This is the whole loop.
          </p>
        </div>

        <div className="lp-journey">
          {JOURNEY.map((step) => (
            <article key={step.time} className="lp-journey-step">
              <div className="lp-journey-time">{step.time}</div>
              <h3 className="lp-journey-title">{step.title}</h3>
              <p className="lp-journey-text">{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Trade on your terms ─────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-head">
          <span className="lp-kicker">Trade on your terms</span>
          <h2 className="lp-h2">Markets, timeframes and payouts, on your schedule</h2>
        </div>

        <div className="lp-cols3">
          {TERMS.map((col) => (
            <div key={col.title} className="lp-col">
              <div className="lp-col-num">{col.num}</div>
              <div className="lp-col-title">{col.title}</div>
              <p className="lp-col-text">{col.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tables ──────────────────────────────────────────── */}
      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">Choose a table</span>
          <h2 className="lp-h2">Practise free, or put coins on it</h2>
          <p className="lp-sub">
            The chart is the same at both tables. What changes is what a win is worth.
          </p>
        </div>

        <div className="pg-cols-2">
          <article className="lp-table lp-table--featured">
            <span className="lp-table-badge">Stakes coins</span>
            <div className="lp-table-k">Live duel</div>
            <div className="lp-table-v">
              {CHEAPEST_COINS} <small>coins to enter</small>
            </div>
            <p className="lp-table-note">
              ${CHEAPEST_ENTRY.toFixed(2)} at {COINS_PER_USD} coins per dollar. Pooled pot, fixed cut.
            </p>
            <ul className="lp-list">
              <li><Check size={12} /> Winner collects {WINNER_MULTIPLE.toFixed(2)}× the entry</li>
              <li><Check size={12} /> {TABLE_MINUTES.join(', ')} minute tables</li>
              <li><Check size={12} /> Withdrawable in USDT</li>
            </ul>
            <Link href="/play" className="lp-btn">
              <Swords size={13} />
              Enter a duel
            </Link>
          </article>

          <article className="lp-table">
            <div className="lp-table-k">Demo duel</div>
            <div className="lp-table-v">
              0 <small>coins</small>
            </div>
            <p className="lp-table-note">Ranked nothing. Teaches everything.</p>
            <ul className="lp-list">
              <li><Check size={12} /> The same candles and entry cap</li>
              <li><Check size={12} /> Practise a setup before you stake it</li>
              <li><Check size={12} /> Instant match against a bot or a human</li>
            </ul>
            <Link href="/modes" className="lp-btn lp-btn--ghost">
              <Trophy size={13} />
              See the modes
            </Link>
          </article>
        </div>
      </section>

      {/* ── Rule sets ───────────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-head">
          <span className="lp-kicker">Scoring</span>
          <h2 className="lp-h2">Three rule sets, same chart</h2>
          <p className="lp-sub">
            What decides the winner changes. The window, the entry cap and the market do not.
          </p>
        </div>

        <div className="lp-band">
          {RULE_SETS.map((set) => (
            <div key={set.name} className="lp-band-item">
              <div className="lp-band-title">
                {set.name}
                <span
                  style={{
                    marginLeft: 8,
                    padding: '1px 6px',
                    fontSize: 9,
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    color: 'var(--fin-amber)',
                    border: '1px solid rgba(255,170,51,.3)',
                  }}
                >
                  {set.tag}
                </span>
              </div>
              <p className="lp-band-text">{set.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Stats band ──────────────────────────────────────── */}
      <section className="lp-section lp-section--panel">
        <div className="lp-stats">
          <div className="lp-stat">
            <div className="lp-stat-v">{String(SYNTH_PAIRS.length).padStart(2, '0')}</div>
            <div className="lp-stat-k">Synthetic instruments</div>
          </div>
          <div className="lp-stat">
            <div className="lp-stat-v">{MAX_ORDERS_PER_MATCH}</div>
            <div className="lp-stat-k">Entries per duel</div>
          </div>
          <div className="lp-stat">
            <div className="lp-stat-v">{Math.round((1 - HOUSE_CUT) * 100)}%</div>
            <div className="lp-stat-k">Of the pot to the winner</div>
          </div>
          <div className="lp-stat">
            <div className="lp-stat-v">${CHEAPEST_ENTRY.toFixed(0)}</div>
            <div className="lp-stat-k">Cheapest live entry</div>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-head">
          <span className="lp-kicker">Before you sign up</span>
          <h2 className="lp-h2">Four questions worth answering</h2>
        </div>

        <div className="pg-faq">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <div>
                <p>{item.a}</p>
              </div>
            </details>
          ))}
        </div>

        <p className="lp-sub" style={{ marginTop: 20, fontSize: 12 }}>
          <Link href="/faq" style={{ color: 'var(--fin-amber)', textDecoration: 'none' }}>
            Read the full FAQ →
          </Link>
        </p>
      </section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <section className="lp-cta">
        <h2>Bring your read. We&apos;ll bring the rival.</h2>
        <p>
          Open a free demo, or take the {CHEAPEST_COINS}-coin table. The clock starts when the ticket
          does.
        </p>
        <div className="lp-cta-actions">
          <Link href="/register" className="lp-btn lp-btn--lg">
            Create an account
            <ArrowRight size={15} />
          </Link>
          <Link href="/how-to-play" className="lp-btn lp-btn--lg lp-btn--ghost">
            How the arena works
          </Link>
        </div>
      </section>

      <SiteFooter />
      <div className="site-scanlines" aria-hidden="true" />
    </div>
  );
}
