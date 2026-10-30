import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CtaBand, PageHero, SitePage } from '@/components/site/site-chrome';
import { HOUSE_CUT, LIVE_FEES } from '@/lib/economy/config';
import { MAX_ORDERS_PER_MATCH, TICKS_PER_BAR } from '@/lib/engine/constants';

export const metadata = {
  title: 'Fairness — How a winner is decided',
  description:
    'The duel window is fixed by the ticket, both terminals derive identical candles, and the server re-runs the result. Here is exactly how the arena decides who won.',
};

const STEPS = [
  {
    n: '01',
    title: 'The ticket fixes the window',
    body: 'Both players hold the same ticket, and the ticket carries the start time. The window opens on that instant and runs the match\'s own minutes — five, ten or fifteen — on the wall clock for both players. Nobody chooses the market after seeing it.',
  },
  {
    n: '02',
    title: 'Both charts are the same chart',
    body: `Candles are not streamed to you — they are derived on your machine from the instrument and the day, by the same rule for every player. There is no privileged feed to read early and no packet to alter in flight. Ticks inside each bar are cosmetic: they change how a candle grows, never what it closes at.`,
  },
  {
    n: '03',
    title: 'The server re-runs the result',
    body: 'When the duel ends, your browser sends the actions you took — not the score. The server replays those actions against the same series it can regenerate from the start time, and settles on that number. A doctored client score has nothing to attach to.',
  },
  {
    n: '04',
    title: 'Anyone can re-derive it',
    body: 'The series is a pure function of a fixed salt and the day index. No feed, no cache, no scheduled job. Re-running a settled duel a year later produces the same candles and the same outcome.',
  },
];

const RULED_OUT = [
  {
    concern: 'My opponent saw the candles before I did',
    answer: 'There is no stream to see first. Both sides compute the same bars from the same start time.',
  },
  {
    concern: 'We were traded on different markets',
    answer: 'Same instrument, same window, same rule — the generator is deterministic, and the test suite asserts identical output.',
  },
  {
    concern: 'History was rewritten mid-duel',
    answer: 'A bar locks the moment it closes. The live candle is read from the same tick path that seals it, so it cannot contradict the bar it becomes.',
  },
  {
    concern: 'The score was edited in the browser',
    answer: 'The client sends actions, not a result. The server ignores anything else and re-simulates.',
  },
  {
    concern: 'Duels in the same hour were rigged differently',
    answer: 'Every duel fired in the same UTC hour trades the identical window of the identical series.',
  },
];

export default function FairnessPage() {
  const cheapest = Math.min(...Object.values(LIVE_FEES));

  return (
    <SitePage>
      <PageHero
        kicker="Fairness"
        title={
          <>
            Two strangers, one chart.
            <br />
            <em>A result neither can bend.</em>
          </>
        }
        lead="Most trading games ask you to trust the house. This one only asks you to trust arithmetic: the window is set before you arrive, both charts are computed from the same inputs, and the score is replayed by the server rather than reported by you."
        meta={[
          '5–15 live bars per duel',
          `${MAX_ORDERS_PER_MATCH} entries each`,
          `${Math.round((1 - HOUSE_CUT) * 100)}% of the pot paid out`,
        ]}
        actions={
          <>
            <Link href="/how-to-play" className="lp-btn lp-btn--lg">
              Read the rules
              <ArrowRight size={15} />
            </Link>
            <Link href="/how-to-play" className="lp-btn lp-btn--lg lp-btn--ghost">
              How a single duel runs
            </Link>
          </>
        }
      />

      {/* ── The four steps ───────────────────────────────────── */}
      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">The mechanism</span>
          <h2 className="lp-h2">What happens between the ticket and the payout</h2>
          <p className="lp-sub">
            Four steps, each one removing a place where a result could be bent.
          </p>
        </div>

        <div className="lp-steps">
          {STEPS.map((step) => (
            <article key={step.n} className="lp-step">
              <div className="lp-step-n">{step.n}</div>
              <h3 className="lp-step-t">{step.title}</h3>
              <p className="lp-step-d">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Ruled out ────────────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-head">
          <span className="lp-kicker">The obvious worries</span>
          <h2 className="lp-h2">Five things this design rules out</h2>
          <p className="lp-sub">
            Every one of these is a real objection to a paid 1v1 game. Each has a structural answer,
            not a promise.
          </p>
        </div>

        <div className="pg-table-outer">
          <div className="pg-table-wrap">
            <table className="pg-table">
              <thead>
                <tr>
                  <th style={{ width: '38%' }}>The worry</th>
                  <th>Why it cannot happen here</th>
                </tr>
              </thead>
              <tbody>
                {RULED_OUT.map((row) => (
                  <tr key={row.concern}>
                    <td>{row.concern}</td>
                    <td>{row.answer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Honest limits ────────────────────────────────────── */}
      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">Where the guarantees stop</span>
          <h2 className="lp-h2">What is still a business decision, not a proof</h2>
        </div>

        <div className="pg-prose">
          <h2>The market is synthetic, on purpose</h2>
          <p>
            Prices come from a seeded generator, not from a broker feed. That is what lets a duel
            start in 200 milliseconds and replay identically for a year — but it means the candles
            are not real gold, real euro or real crude. No claim on this site says otherwise.
          </p>

          <h2>The house is paid from the pot</h2>
          <p>
            Two entries of {cheapest} coins make a 2× pot; {Math.round(HOUSE_CUT * 100)}% is burned
            as the platform fee and the winner receives the rest. That arithmetic is printed on the
            pricing page rather than buried, because it is the one number a player should check
            before staking.
          </p>

          <h2>Entry rules are fixed, not negotiable</h2>
          <p>
            {MAX_ORDERS_PER_MATCH} entries per duel, {TICKS_PER_BAR} ticks per bar, identical
            position sizes for both players. Fewer entries than a free-for-all, on purpose: the cap
            is what stops a duel being won by order volume rather than by a read.
          </p>

          <h2>Withdrawals are reviewed by a human</h2>
          <p>
            Crypto out is queued and checked before it is sent. That is slower than an instant
            payout and slower than we would like — see{' '}
            <Link href="/security">security</Link> for what a reviewer checks.
          </p>
        </div>
      </section>

      <CtaBand
        title="Judge it yourself — the rules are published."
        copy="Read the pricing, the entry cap and the settlement path, then decide whether the format holds up."
      />
    </SitePage>
  );
}
