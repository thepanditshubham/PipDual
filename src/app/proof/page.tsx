import Link from 'next/link';
import { FileCheck, Receipt, ScanEye } from 'lucide-react';
import { CtaBand, PageHero, SitePage } from '@/components/site/site-chrome';
import { HOUSE_CUT, MIN_WITHDRAW_USD, WITHDRAW_FEE_USD } from '@/lib/economy/config';

export const metadata = {
  title: 'Payout proof — Settled duels and withdrawals',
  description:
    'Where Pip Duel publishes settled duels and completed withdrawals, and how to verify any duel yourself before that ledger exists.',
};

export default function ProofPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Proof"
        title={
          <>
            A payout is a row in a ledger
            <br />
            <em>— not a screenshot.</em>
          </>
        }
        lead="This page is where settled duels and completed withdrawals will be listed, one row per movement, with the transaction id. It is deliberately empty right now: we would rather show nothing than seed it with invented numbers."
        meta={['Empty until the ledger has rows', 'No seeded or sample payouts']}
      />

      {/* ── Honest empty state ───────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-head">
          <span className="lp-kicker">Status</span>
          <h2 className="lp-h2">Nothing published yet</h2>
          <p className="lp-sub">
            The arena is new. When the first Live duels settle and the first withdrawals clear, the
            rows below will be generated from the ledger itself — coin amount, dollar value, rail and
            transaction id — not typed in by hand.
          </p>
        </div>

        <div className="pg-table-outer">
          <div className="pg-table-wrap">
            <table className="pg-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Rail</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '28px 14px', color: 'var(--fin-muted)' }}>
                    No settled payouts to publish yet.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p className="lp-sub" style={{ marginTop: 16, fontSize: 12 }}>
          When it opens, a row will show the coin amount at the {MIN_WITHDRAW_USD}-dollar floor, the{' '}
          {WITHDRAW_FEE_USD}-dollar network fee already deducted, and a link to the transfer on a
          public explorer.
        </p>
      </section>

      {/* ── What will be published ───────────────────────────── */}
      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">What belongs here</span>
          <h2 className="lp-h2">Three kinds of record</h2>
        </div>

        <div className="lp-features">
          <article className="lp-feature">
            <div className="lp-feature-icon"><FileCheck size={16} /></div>
            <h3 className="lp-feature-title">Settled duels</h3>
            <p className="lp-feature-desc">
              Ticket, table length, start window, both players’ results and the winning side. Enough
              for a third party to re-derive the window from the published start time.
            </p>
          </article>
          <article className="lp-feature">
            <div className="lp-feature-icon"><Receipt size={16} /></div>
            <h3 className="lp-feature-title">Completed withdrawals</h3>
            <p className="lp-feature-desc">
              Coins burned, dollars paid, rail used and the on-chain transaction id. The house cut of{' '}
              {Math.round(HOUSE_CUT * 100)}% is already accounted for in each published duel.
            </p>
          </article>
          <article className="lp-feature">
            <div className="lp-feature-icon"><ScanEye size={16} /></div>
            <h3 className="lp-feature-title">Corrections</h3>
            <p className="lp-feature-desc">
              If a result was wrong, the correction is published next to the original record rather
              than quietly replacing it.
            </p>
          </article>
        </div>
      </section>

      {/* ── Verify it yourself ───────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-head">
          <span className="lp-kicker">Until the ledger opens</span>
          <h2 className="lp-h2">You can verify a duel without us</h2>
          <p className="lp-sub">
            Every duel carries the instant its window opened. That single number is enough to rebuild
            the market both players traded.
          </p>
        </div>

        <div className="lp-steps">
          <article className="lp-step">
            <div className="lp-step-n">01</div>
            <h3 className="lp-step-t">Take the start time</h3>
            <p className="lp-step-d">
              From your match history, note the ticket’s start time and the table length. Both players
              were handed the same value before the first bar printed.
            </p>
          </article>
          <article className="lp-step">
            <div className="lp-step-n">02</div>
            <h3 className="lp-step-t">Rebuild the window</h3>
            <p className="lp-step-d">
              The window is a pure function of that instant and the instrument. Nothing else — not
              your account, not the opponent, not the day the duel was played.
            </p>
          </article>
          <article className="lp-step">
            <div className="lp-step-n">03</div>
            <h3 className="lp-step-t">Compare the closes</h3>
            <p className="lp-step-d">
              The result settles on bar closes, not on how the candles animated. If a re-derivation
              disagrees with a published result, that is a bug worth reporting.
            </p>
          </article>
        </div>

        <div className="pg-prose" style={{ marginTop: 28 }}>
          <p>
            The mechanism is written out in full on the <Link href="/fairness">fairness page</Link>,
            and the rules of a single duel are on <Link href="/how-to-play">how to play</Link>.
          </p>
        </div>
      </section>

      <CtaBand
        title="Watch a market you can check against."
        copy="The public terminal is the same series a duel trades. Open it, then open a duel window and compare."
      />
    </SitePage>
  );
}
