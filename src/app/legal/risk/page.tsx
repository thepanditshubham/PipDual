import Link from 'next/link';
import { PageHero, Prose, SitePage } from '@/components/site/site-chrome';
import { HOUSE_CUT, LIVE_FEES } from '@/lib/economy/config';

export const metadata = {
  title: 'Risk disclosure',
  description:
    'What you can lose on Pip Duel, how the synthetic market differs from a real one, and the risks that no amount of skill removes.',
};

const cheapest = Math.min(...Object.values(LIVE_FEES));

export default function RiskPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Legal"
        title={
          <>
            Risk disclosure
            <br />
            <em>Read before your first Paid entry.</em>
          </>
        }
        lead="This page exists because a duel has stakes — virtual ones. Read it before you spend coins."
        meta={['Last updated October 2026', 'Applies to all ranked tables']}
      />

      <section className="lp-section">
        <Prose
          sections={[
            {
              heading: '1. You can lose the entry, and that is the whole stake',
              body: [
                `A ranked entry costs ${cheapest} virtual coins or more depending on the table, and it is spent the moment the duel starts. Losing the duel does not refund it. The entry is the maximum a single duel can cost you.`,
                'Coins are game credits, not money: they are earned by playing and in missions, cannot be bought, and have no cash value. There is no dollar amount to lose.',
              ],
            },
            {
              heading: '2. The market is synthetic',
              body: [
                'Prices on this platform are generated from a seeded rule. They are not quotes from a broker, an exchange or any real venue, and they do not reflect the actual price of gold, crude, bitcoin, an index or any currency pair.',
                'Skills that transfer to real markets — reading liquidity, handling gaps, trading news — are not taught or tested here. A duel tests a short-window read of a simulated series.',
              ],
            },
            {
              heading: '3. Part of the virtual pot leaves circulation',
              body: [
                `Two virtual entries form the pot. ${Math.round(HOUSE_CUT * 100)}% is removed from circulation as a game sink and the remainder goes to the winner. That keeps the coin ladder from inflating; it is not a fee paid to anyone.`,
              ],
            },
            {
              heading: '4. The game can be interrupted',
              list: [
                'The duel runs on the ticket clock, not on your connection. A dropped tab does not pause the market.',
                'Open positions settle at the prices the series produced, whether or not you were watching.',
                'A browser crash or a refreshed tab can lose the session; the result is still derived from the submitted actions.',
                'Virtual coins lost in a duel are not restored. Practice tables are always free if you want to test the layout.',
              ],
            },
            {
              heading: '5. Nothing here is advice',
              body: [
                'Pip Duel is a competition, not a brokerage, fund or advisory service. No page, chart, ranking or message from another player is financial, investment, legal or tax advice.',
                'We do not manage money, we do not accept discretionary authority over any account, and we never promise a return.',
              ],
            },
            {
              heading: '6. Availability and jurisdiction',
              body: [
                'The service may be unavailable during maintenance, and a duel that cannot settle cleanly is voided and both entries returned rather than scored by guesswork.',
                'It is your responsibility to ensure that participating in a paid skill competition is lawful where you live. Access may be restricted where it is not.',
              ],
            },
          ]}
        />

        <div className="lp-prose" style={{ marginTop: 26 }}>
          <p>
            Related: <Link href="/legal/terms">terms of service</Link> ·{' '}
            <Link href="/legal/responsible-trading">responsible play</Link> ·{' '}
            <Link href="/legal/aml-kyc">AML / KYC</Link> · <Link href="/pricing">pricing</Link>.
          </p>
        </div>
      </section>
    </SitePage>
  );
}
