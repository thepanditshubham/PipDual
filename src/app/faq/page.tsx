import Link from 'next/link';
import { CtaBand, FaqList, PageHero, SitePage } from '@/components/site/site-chrome';
import { LIVE_FEES } from '@/lib/economy/config';
import { MAX_ORDERS_PER_MATCH } from '@/lib/engine/constants';

export const metadata = {
  title: 'FAQ — A free trading duel',
  description:
    'How Pip Duel works: the synthetic market, ranked and practice tables, virtual coins, scoring and replay.',
};

const cheapest = Math.min(...Object.values(LIVE_FEES));

export default function FaqPage() {
  return (
    <SitePage>
      <PageHero
        kicker="FAQ"
        title={
          <>
            Everything you should ask
            <br />
            <em>before your first duel.</em>
          </>
        }
        lead="What this is, what it costs, how a duel is settled and what happens to your coins."
        meta={['Free to play', 'Virtual coins only']}
        actions={
          <Link href="/support" className="lp-btn lp-btn--ghost">
            Still stuck? Contact us
          </Link>
        }
      />

      <section className="lp-section">
        <div className="lp-head">
          <span className="lp-kicker">01 · The basics</span>
          <h2 className="lp-h2">What is Pip Duel, exactly?</h2>
        </div>

        <FaqList
          items={[
            {
              q: 'What am I competing at?',
              a: 'Two players get the identical synthetic chart, the same start time and the same four entries. For five, ten or fifteen minutes you both trade it; whoever finishes with the better risk-adjusted result wins the virtual pot.',
            },
            {
              q: 'Do I need to pay to play?',
              a: 'No. There is nothing to buy. Practice tables are always free, and ranked tables use coins you earn by playing and in missions.',
            },
            {
              q: 'How long does a duel take?',
              a: 'Five, ten or fifteen minutes depending on the ticket. A short lobby countdown runs before the first bar prints, and the result is final when the last bar closes.',
            },
            {
              q: `Why only ${MAX_ORDERS_PER_MATCH} entries?`,
              a: 'Because a duel should test a read, not a tap count. Four entries is enough to take a position, add, reverse or re-enter — and too few to average into a losing trade until it comes back.',
            },
            {
              q: 'Is this real trading?',
              a: 'No. Prices are synthetic and generated locally, not routed to any exchange. Everything else — sizing, drawdown, entries, P&L — behaves like a real terminal.',
            },
          ]}
        />
      </section>

      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">02 · Coins and scoring</span>
          <h2 className="lp-h2">What a coin is, and what it is not</h2>
        </div>

        <FaqList
          items={[
            {
              q: 'What are coins worth?',
              a: 'Nothing outside the game. Coins are credits: earned by playing, spent on ranked entries, never bought, transferred or redeemed for cash, crypto or goods.',
            },
            {
              q: 'How much does a ranked entry cost?',
              a: `${cheapest} coins on the shortest table, more on longer ones. The exact fees are published on the pricing page; practice never costs anything.`,
            },
            {
              q: 'What happens if I run out of coins?',
              a: 'Practice is still free, and missions and daily goals earn more coins. There is no top-up, so the game never asks you to pay to continue.',
            },
            {
              q: 'How is the winner decided?',
              a: 'The server re-simulates both submitted action logs against the same generated window and scores them. In standard mode that is net P&L; in risk-adjusted mode, P&L penalised by maximum drawdown.',
            },
            {
              q: 'Can I replay a duel?',
              a: 'History keeps the result and the chart trajectory, and a replay is on the roadmap. The current Replay action starts a fresh practice room rather than the recorded window.',
            },
          ]}
        />
      </section>

      <CtaBand
        title="Open a table. It costs nothing."
        copy="Practice first, then take a ranked seat with coins you earned."
      />
    </SitePage>
  );
}
