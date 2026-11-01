import { CtaBand, PageHero, SitePage } from '@/components/site/site-chrome';
import { MAX_ORDERS_PER_MATCH, TICKS_PER_BAR } from '@/lib/engine/constants';
import { HOUSE_CUT } from '@/lib/economy/config';

export const metadata = {
  title: 'Glossary — The words this arena uses',
  description:
    'Candle, window, entry, house cut, settlement — every term Pip Duel uses, defined the way it is used here rather than the way a broker uses it.',
};

const TERMS: { term: string; def: string }[] = [
  { term: 'Bar', def: 'One minute of market time, drawn as a candle: open, high, low, close. A duel plays the match\'s own minutes — five, ten or fifteen of them, live on the clock.' },
  { term: 'Tick', def: `A price print inside a bar. ${TICKS_PER_BAR} ticks build one candle, so a candle grows instead of appearing whole.` },
  { term: 'Window', def: 'The stretch of the series a duel trades. Fixed by the ticket start time before either player sees it.' },
  { term: 'Ticket', def: 'The row that pairs two players, carries the stake and the start time, and is what the server settles against.' },
  { term: 'Entry', def: 'One market order placed during a duel, and also the coins a Paid duel costs. Context decides which.' },
  { term: 'Entry cap', def: `${MAX_ORDERS_PER_MATCH} per duel. Hitting the cap means no more orders, including the entry side of a reverse.` },
  { term: 'Close', def: 'The last price of a bar. Results settle on closes, never on how the candle animated.' },
  { term: 'Spread', def: 'The bid/ask gap around the synthetic mid — part of the simulation and identical for both players.' },
  { term: 'Size', def: 'The multiplier on a position. Higher size moves P&L and drawdown faster in both directions.' },
  { term: 'Bracket', def: 'A stop-loss or take-profit attached to a position, entered as a price and stored as a percentage from entry.' },
  { term: 'Reverse', def: 'Close the current position and open the opposite one in a single action. Costs one entry.' },
  { term: 'Flatten', def: 'Close everything and stay flat. In a duel this also spends the entry that opened the position.' },
  { term: 'P&L', def: 'Profit and loss on closed and open positions, in simulated dollars.' },
  { term: 'Drawdown', def: 'How far the account fell from its running peak. A large win with a deep drawdown is not the same result as a clean one.' },
  { term: 'Risk-adjusted', def: 'Scoring that reads P&L together with the risk taken to get it, so size cannot buy a win on its own.' },
  { term: 'Equity curve', def: 'The running value of an account over the duel, shown to the rival as a sparkline — never the orders behind it.' },
  { term: 'Coin', def: 'The only game credit. Earned by playing and in missions; never bought, transferred or redeemed for cash.' },
  { term: 'Pot', def: 'Two virtual entries pooled. The winner receives the pot minus the sink.' },
  { term: 'House cut', def: `${Math.round(HOUSE_CUT * 100)}% of the virtual pot removed from circulation as a game sink. Published, not deducted per trade.` },
  { term: 'Ranked table', def: 'A duel that stakes virtual coins. Result affects your rating and your coin balance.' },
  { term: 'Practice table', def: 'Same chart, same cap, no stake and no rating change.' },
  { term: 'RP', def: 'Rating points. They decide your division, move after each settled duel, and decay slowly if you stop playing.' },
  { term: 'Division', def: 'A 200-RP step inside a tier — Bronze III up to Master. Divisions are how the ladder stays readable.' },
  { term: 'Season', def: 'A reset window for the ladder. Ratings compress, divisions are re-earned, settlement logic does not change.' },
  { term: 'Settlement', def: 'The server replaying your submitted actions against the regenerated series to produce the official result.' },
  { term: 'Void', def: 'A duel that could not settle cleanly. Both entries are returned and the match is recorded as void rather than scored.' },
  { term: 'Synthetic', def: 'Prices generated from a seeded rule rather than a broker feed. Re-derivable, and not real market data.' },
];

export default function GlossaryPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Glossary"
        title={
          <>
            Every word the arena uses,
            <br />
            <em>defined the way we use it.</em>
          </>
        }
        lead="Half the confusion in trading games is vocabulary drift — an “entry” means one thing to a broker and another to a ticket. This is the version this product means."
        meta={[`${TERMS.length} terms`, 'Always current with the build']}
      />

      <section className="lp-section">
        <dl className="pg-terms">
          {TERMS.map((item) => (
            <div key={item.term} className="pg-term">
              <dt>{item.term}</dt>
              <dd>{item.def}</dd>
            </div>
          ))}
        </dl>
      </section>

      <CtaBand
        title="Read a term, then watch it decide a duel."
        copy="Open a free account and play the Free tables — every term here is a mechanic there."
      />
    </SitePage>
  );
}
