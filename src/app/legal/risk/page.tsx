import Link from 'next/link';
import { PageHero, Prose, SitePage } from '@/components/site/site-chrome';
import { COINS_PER_USD, HOUSE_CUT, LIVE_FEES, MIN_WITHDRAW_USD, WITHDRAW_FEE_USD } from '@/lib/economy/config';

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
            <em>Read before your first Live entry.</em>
          </>
        }
        lead="This page exists because money changes hands. It is written to be read, not to be survived — if any line here surprises you, do not stake coins yet."
        meta={['Last updated October 2026', 'Applies to all Live tables']}
      />

      <section className="lp-section">
        <Prose
          sections={[
            {
              heading: '1. You can lose the entry, and that is the whole stake',
              body: [
                `A Live entry costs ${cheapest} coins or more depending on the table, and it is spent the moment the duel starts. Losing the duel does not refund it. There is no separate margin call and no liquidation event later — the entry is the maximum a single duel can cost you.`,
                'Coins are bought with crypto at a fixed peg of ' +
                  `${COINS_PER_USD} coins to the dollar. If you could not afford to lose the dollar value of an entry, do not take the table.`,
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
              heading: '3. The house is paid from the pot',
              body: [
                `Two entries form the pot. The arena retains ${Math.round(HOUSE_CUT * 100)}% as its fee and pays the remainder to the winner. That means a player who wins exactly half their duels still loses money over time; the format only pays if your win rate and sizing beat the fee.`,
              ],
            },
            {
              heading: '4. Crypto adds risks that have nothing to do with trading',
              list: [
                'Transfers are irreversible. A deposit sent to the wrong address cannot be recalled, by us or by anyone.',
                'Network conditions and confirmation times are outside our control.',
                `Withdrawals are manually reviewed, carry a flat $${WITHDRAW_FEE_USD} fee and start at $${MIN_WITHDRAW_USD}. A payout is not instant.`,
                'The value of crypto in your own currency can move while a deposit or withdrawal is in flight.',
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
