import Link from 'next/link';
import { CtaBand, PageHero, Prose, SitePage } from '@/components/site/site-chrome';
import { HOUSE_CUT, LIVE_FEES } from '@/lib/economy/config';
import { SYNTH_PAIRS } from '@/lib/engine/synthetic-market';

export const metadata = {
  title: 'About — Who runs the arena',
  description:
    'Pip Duel is a 1v1 trading arena built by the Forexwala community in Pune. Here is what it is for, how it makes money, and what it deliberately is not.',
};

const cheapest = Math.min(...Object.values(LIVE_FEES));

export default function AboutPage() {
  return (
    <SitePage>
      <PageHero
        kicker="About"
        title={
          <>
            Built by traders who were tired
            <br />
            <em>of arguing about charts.</em>
          </>
        }
        lead="Pip Duel started as a simple question inside the Forexwala community: if two people read the same chart and disagree, who is actually right? A group chat cannot settle that. A duel can."
        meta={['Pune, India', `Founded by the Forexwala community`, `${SYNTH_PAIRS.length} synthetic instruments`]}
      />

      <section className="lp-section">
        <Prose
          sections={[
            {
              heading: 'What we built',
              body: [
                'A terminal that two people can share. Both traders open the same chart, at the same instant, with the same entry cap, and settle it in five to fifteen minutes. Nothing about the market is streamed, so nothing can be seen early or rewritten mid-duel.',
                'The market itself is generated rather than pulled from a broker. That was a deliberate trade: a synthetic series can be re-derived years later on any machine, which is what makes a result provable. It also means the candles are not real gold or real euro, and we say so on every page that matters.',
              ],
              list: [
                `${SYNTH_PAIRS.length} instruments, from gold and euro to crude, bitcoin and an index`,
                'One-minute through one-hour timeframes on the public terminal',
                'Live, Demo and versus-bot tables with identical rules',
              ],
            },
            {
              heading: 'How we make money',
              body: [
                `Live duels pool two entries. The arena burns ${Math.round(HOUSE_CUT * 100)}% of that pot as its fee and pays the winner the rest. The cheapest entry is ${cheapest} coins — one dollar — and an entry is the most a single duel can cost you.`,
                'We do not charge deposits, subscriptions, data fees or inactivity fees. There is no spread markup on top of the simulated market: the bid/ask you trade against is part of the simulation and is identical for both players.',
              ],
            },
            {
              heading: 'Where we are',
              body: [
                'The arena is run by the Forexwala community, based in Pune, India. We are a small team and we do not pretend to be an institution — no office tour, no advisor page, no stock photography.',
                'The community lives on Telegram, where the original arguments happened and where product decisions still get argued about first.',
              ],
            },
            {
              heading: 'What we are not',
              body: [
                'We are not a broker, an exchange, or an investment adviser. No claim on this site promises returns, and none of the prices are real market data.',
                'A duel is a competitive format with money at stake. That is a real cost and a real risk, and if losing an entry would hurt, the Demo tables and the public market exist exactly for that.',
              ],
            },
          ]}
        />

        <div className="pg-prose" style={{ marginTop: 28 }}>
          <p>
            Questions about the product, partnerships or press:{' '}
            <Link href="/contact">contact us</Link>. Something broken or unfair:{' '}
            <Link href="/support">support</Link> first.
          </p>
        </div>
      </section>

      <CtaBand
        title="Read the rules before you meet us."
        copy="The format, the entry cap and the settlement path are all published. Judge them first."
      />
    </SitePage>
  );
}
