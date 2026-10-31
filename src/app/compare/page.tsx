import { Check, Minus } from 'lucide-react';
import { CtaBand, PageHero, SitePage } from '@/components/site/site-chrome';
import { HOUSE_CUT, LIVE_FEES } from '@/lib/economy/config';
import { MAX_ORDERS_PER_MATCH } from '@/lib/engine/constants';

export const metadata = {
  title: 'Compare — Duel, prop firm, demo or betting',
  description:
    'How a Pip Duel compares with a prop-firm challenge, a demo account and a sportsbook — what decides the result, what it costs and what you can lose.',
};

const cheapest = Math.min(...Object.values(LIVE_FEES));

const ROWS: { label: string; cells: (string | boolean)[] }[] = [
  {
    label: 'What decides the result',
    cells: [
      'Head-to-head risk-adjusted P&L over one fixed window',
      'Hitting a profit target without breaching the firm’s rules',
      'Nothing — the account pays no money',
      'The price the book set against the crowd',
    ],
  },
  {
    label: 'Time to a result',
    cells: ['5, 10 or 15 minutes', '2–8 weeks', 'Instant, and worth nothing', '90 minutes'],
  },
  {
    label: 'Cost to start',
    cells: [`${cheapest} virtual coins · practice free`, '$50–$500 evaluation fee', 'Free', 'Whatever you stake'],
  },
  {
    label: 'Market data',
    cells: ['Synthetic, re-derivable by anyone', 'Real feed, firm’s platform', 'Real feed (delayed on free tiers)', 'No market at all'],
  },
  {
    label: 'Who is on the other side',
    cells: ['Another player, on the identical chart', 'The firm’s rulebook, not a person', 'Nobody', 'The house'],
  },
  {
    label: 'Ranked ladder',
    cells: ['Yes — divisions from Bronze to Master', false, false, false],
  },
  {
    label: 'Most you can lose in one attempt',
    cells: ['Nothing — coins have no cash value', 'The evaluation fee', 'Nothing', 'Your whole stake'],
  },
  {
    label: 'Can you prove the result afterwards',
    cells: ['Yes — the series is deterministic', 'Yes, within the firm’s platform', 'Not applicable', 'No'],
  },
];

const COLUMNS = ['Pip Duel', 'Prop-firm challenge', 'Demo broker', 'Sportsbook'];

export default function ComparePage() {
  return (
    <SitePage>
      <PageHero
        kicker="Compare"
        title={
          <>
            A duel is not a prop challenge,
            <br />
            <em>and it is certainly not a bet.</em>
          </>
        }
        lead="Four formats that all look like “trade for money” from the outside. They differ in what decides the outcome, how long it takes, and what a single attempt can cost you."
        meta={[`${MAX_ORDERS_PER_MATCH} entries per duel`, `${Math.round(HOUSE_CUT * 100)}% virtual pot sink`]}
      />

      {/* ── The table ────────────────────────────────────────── */}
      <section className="lp-section">
        <div className="pg-table-outer">
          <div className="pg-table-wrap">
            <table className="pg-table">
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>&nbsp;</th>
                  {COLUMNS.map((col, i) => (
                    <th key={col} style={i === 0 ? { color: 'var(--fin-orange)' } : undefined}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    {row.cells.map((cell, i) => (
                      <td key={i} style={i === 0 ? { color: 'var(--fin-white)' } : undefined}>
                        {cell === true ? (
                          <span className="ok" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Check size={12} /> Yes
                          </span>
                        ) : cell === false ? (
                          <span className="no" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Minus size={12} /> No
                          </span>
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Where the formats differ ─────────────────────────── */}
      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">The difference that matters</span>
          <h2 className="lp-h2">Three things a duel does that the others cannot</h2>
        </div>

        <div className="lp-features">
          <article className="lp-feature">
            <div className="lp-feature-icon"><Check size={16} /></div>
            <h3 className="lp-feature-title">You are playing a person, not a rulebook</h3>
            <p className="lp-feature-desc">
              A prop challenge is solo: hit 8% before you draw down 5%. A duel is adversarial — your
              result is compared to someone else’s on the same window, so the target moves with the
              room instead of being fixed by the firm.
            </p>
          </article>
          <article className="lp-feature">
            <div className="lp-feature-icon"><Check size={16} /></div>
            <h3 className="lp-feature-title">The downside is capped and known</h3>
            <p className="lp-feature-desc">
              An entry costs {cheapest} coins and that is the whole stake. There is no margin call,
              no slippage to a stop, no account blown at 3am — the position closes with the duel.
            </p>
          </article>
          <article className="lp-feature">
            <div className="lp-feature-icon"><Check size={16} /></div>
            <h3 className="lp-feature-title">The outcome is reproducible</h3>
            <p className="lp-feature-desc">
              The market is generated from a fixed rule, so a settled duel can be re-run by anyone
              and produce the same candles. A book’s odds and a firm’s platform cannot offer that.
            </p>
          </article>
        </div>
      </section>

      {/* ── Honest positioning ───────────────────────────────── */}
      <section className="lp-section">
        <div className="pg-prose">
          <h2>What a duel is not good for</h2>
          <p>
            If you want to learn how a real order book behaves — gaps, news spikes, liquidity that
            disappears — a duel will not teach you that. The market is synthetic and calm by design,
            because a duel has to be startable in seconds and fair to both sides.
          </p>
          <p>
            If you want to trade real instruments with real size, use a broker. A duel is a
            competitive format built on top of a simulation, not a replacement for execution.
          </p>

          <h2>Is it gambling?</h2>
          <p>
            A wager whose outcome you cannot influence is a bet. A duel is decided by entries,
            sizing and exits over {MAX_ORDERS_PER_MATCH} decisions — the same skills a terminal
            rewards. That is why the arena publishes the result logic, the {Math.round(HOUSE_CUT * 100)}%
            cut and the entry price instead of hiding them behind odds.
          </p>
          <p>
            It is still money at risk. If losing {cheapest} coins would hurt, watch the market and
            play the Demo table instead.
          </p>
        </div>
      </section>

      <CtaBand
        title="The cheapest way to judge it is to play the demo."
        copy="No account cost, no stake, and the same chart a Live table uses."
      />
    </SitePage>
  );
}
