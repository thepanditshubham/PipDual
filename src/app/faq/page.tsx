import Link from 'next/link';
import { CtaBand, FaqList, PageHero, SitePage } from '@/components/site/site-chrome';
import { COINS_PER_USD, HOUSE_CUT, LIVE_FEES, MIN_WITHDRAW_USD, WITHDRAW_FEE_USD } from '@/lib/economy/config';
import { MAX_ORDERS_PER_MATCH } from '@/lib/engine/constants';

export const metadata = {
  title: 'FAQ — Coins, duels and payouts',
  description:
    'The questions that decide whether Pip Duel is worth your time: what costs money, what a coin is worth, how a duel is settled and how withdrawals work.',
};

const cheapest = Math.min(...Object.values(LIVE_FEES));
const entryList = Object.values(LIVE_FEES).join(' / ');

export default function FaqPage() {
  return (
    <SitePage>
      <PageHero
        kicker="FAQ"
        title={
          <>
            Everything you should ask
            <br />
            <em>before you put coins in.</em>
          </>
        }
        lead="Grouped by the order you will actually ask them: what this is, what it costs, whether it is fair, and what happens to your money."
        meta={['8 min read', 'Last updated October 2026']}
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
              q: 'What am I actually competing at?',
              a: 'Two players get the identical synthetic chart, the same start time and the same four entries. For five, ten or fifteen minutes you both trade it; whoever finishes with the better risk-adjusted result wins the pot.',
            },
            {
              q: 'Do I need to deposit to play?',
              a: 'No. A free account opens Demo duels, which use the same candles, the same spread and the same entry cap — they simply pay nothing.',
            },
            {
              q: 'How long does a duel take?',
              a: `Five, ten or fifteen minutes depending on the ticket. There is a short lobby countdown before the first bar prints, and the result is final when the last bar closes.`,
            },
            {
              q: `Why only ${MAX_ORDERS_PER_MATCH} entries?`,
              a: 'Because a duel should test a read, not a tap count. Four entries is enough to take a position, add, reverse or re-enter — and too few to average into a losing trade until it comes back.',
            },
            {
              q: 'Is this real trading?',
              a: 'No. The prices are synthetic and generated, not routed to any exchange. Everything else — position sizing, drawdown, entries, P&L — behaves like a real terminal.',
            },
          ]}
        />
      </section>

      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">02 · Money</span>
          <h2 className="lp-h2">What it costs and what it pays</h2>
        </div>

        <FaqList
          items={[
            {
              q: 'What is a coin worth?',
              a: `$${(1 / COINS_PER_USD).toFixed(2)}. The peg is ${COINS_PER_USD} coins to the dollar, flat, in every pack size — buying a bigger pack does not improve the rate.`,
            },
            {
              q: 'What does an entry cost?',
              a: `Live entries are ${entryList} coins by table length (about $${(cheapest / COINS_PER_USD).toFixed(2)} to $${(Math.max(...Object.values(LIVE_FEES)) / COINS_PER_USD).toFixed(2)}). Demo entries cost nothing.`,
            },
            {
              q: 'How much does the winner take?',
              a: `Both entries form the pot, the arena burns ${Math.round(HOUSE_CUT * 100)}% and the winner receives the rest — ${((1 - HOUSE_CUT) * 2).toFixed(2)}× their entry.`,
            },
            {
              q: 'Can I lose money?',
              a: 'Yes. An entry is spent the moment the duel starts, win or lose, and coins are bought with crypto. Treat every Live entry as money you can lose — that is the whole stake, and nothing else is at risk.',
            },
            {
              q: 'How do I get coins in?',
              a: 'Send USDT (or BTC, ETH, SOL, XRP) to the arena address for that rail. A reviewer confirms the transfer on-chain before crediting, so the first deposit is not instant.',
            },
            {
              q: 'How do withdrawals work?',
              a: `Minimum $${MIN_WITHDRAW_USD}, flat $${WITHDRAW_FEE_USD} fee taken off the payout, paid in USDT on BEP20 or TRC20. Requests are queued and reviewed before they are sent.`,
            },
          ]}
        />
      </section>

      <section className="lp-section">
        <div className="lp-head">
          <span className="lp-kicker">03 · Fair play</span>
          <h2 className="lp-h2">Can I trust the result?</h2>
        </div>

        <FaqList
          items={[
            {
              q: 'Can my opponent see my orders?',
              a: 'No. Orders stay in your terminal. A Live room shows the rival’s P&L and equity curve, never their entries, size or stop levels.',
            },
            {
              q: 'Can the score be edited in the browser?',
              a: 'No. Your client submits the actions it took; the server replays them against the same series and settles on its own number. A modified score has nothing to attach to.',
            },
            {
              q: 'Is the chart the same for both of us?',
              a: 'Yes — same instrument, same window, derived from the same start time. Two duels fired in the same UTC hour trade an identical window.',
            },
            {
              q: 'What happens if I disconnect?',
              a: 'The duel runs on the ticket clock, not on your connection. Bars keep closing; open positions settle at the prices they would have anyway. Reconnecting restores the terminal to the live state.',
            },
            {
              q: 'Why is the market synthetic rather than a broker feed?',
              a: 'Because a synthetic series can be re-derived years later, on any machine, with no feed to drop or history to rewrite — which is what makes the result verifiable. The trade-off is that it is not real gold or real euro.',
            },
          ]}
        />
      </section>

      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">04 · Account</span>
          <h2 className="lp-h2">Accounts, referrals and data</h2>
        </div>

        <FaqList
          items={[
            {
              q: 'Can I run more than one account?',
              a: 'No. Multiple accounts to farm referrals or dodge a rating are removed, and self-referral is refused by the database rather than the form.',
            },
            {
              q: 'What happens if I invite someone?',
              a: 'A slice of the platform fee from players you invite is paid to you as commission. See the affiliate page for the current rates.',
            },
            {
              q: 'What data do you keep?',
              a: 'Account, wallet, settled matches and the audit trail of money movements. The privacy policy lists every category and the retention window.',
            },
            {
              q: 'How do I close my account?',
              a: 'Ask support from the address on the account. Settled history and money records are retained for the period the law requires; everything else is removed.',
            },
          ]}
        />
      </section>

      <CtaBand
        title="Still want to see it before signing up?"
        copy="A free account opens the demo tables — same chart, same rules, nothing at stake."
      />
    </SitePage>
  );
}
