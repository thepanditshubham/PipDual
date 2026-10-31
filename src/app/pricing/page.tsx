import { CtaBand, PageHero, SitePage } from '@/components/site/site-chrome';
import { HOUSE_CUT, LIVE_FEES } from '@/lib/economy/config';
import { MATCH_DURATIONS } from '@/lib/engine/constants';

export const metadata = {
  title: 'Free to play — Virtual coins only',
  description:
    'Pip Duel is free to play. Coins are virtual game credits: earned by playing and in missions, never bought, never withdrawn. Ranked entry costs, the virtual pot and the sink are published here.',
};

const ROWS = (Object.keys(MATCH_DURATIONS) as (keyof typeof MATCH_DURATIONS)[]).map((id) => ({
  id,
  minutes: MATCH_DURATIONS[id] / 60,
  coins: LIVE_FEES[id],
  pot: LIVE_FEES[id] * 2,
  win: Math.round(LIVE_FEES[id] * 2 * (1 - HOUSE_CUT)),
}));

export default function PricingPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Pricing"
        title={
          <>
            Free to play.
            <br />
            <em>Coins are game credits.</em>
          </>
        }
        lead="There is nothing to buy. Coins are earned by playing and in missions, spent on ranked entries, and never converted to cash or crypto. Practice is always free."
        meta={['No deposits', 'No withdrawals', 'No cash value']}
      />

      <section className="lp-section">
        <div className="pg-table-outer">
          <div className="pg-table-wrap">
            <table className="pg-table">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Ranked entry</th>
                  <th>Virtual pot</th>
                  <th>Winner collects</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.id}>
                    <td>{row.minutes} minutes</td>
                    <td>{row.coins.toLocaleString()} coins</td>
                    <td>{row.pot.toLocaleString()} coins</td>
                    <td>{row.win.toLocaleString()} coins</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="pg-board-note">
          The {Math.round(HOUSE_CUT * 100)}% sink keeps the coin ladder from inflating; it removes
          credits from circulation and is not a fee paid to anyone. A draw returns each entry.
        </p>
      </section>

      <section className="lp-section lp-section--panel">
        <div className="pg-prose">
          <h2>What is never charged</h2>
          <p>
            No coin packs, no deposits, no withdrawals, no subscription, no spread markup and no
            inactivity fee. There is no wallet address and no payment rail in this build.
          </p>
          <h2>How coins enter and leave</h2>
          <p>
            Coins enter through play: missions, daily rewards and practice goals. They leave through
            ranked entries and the pot sink. Nothing crosses the boundary between the game and money.
          </p>
        </div>
      </section>

      <CtaBand
        title="Play free, keep it free"
        copy="Open a practice table or a ranked duel. No card, no wallet, no cash-out."
      />
    </SitePage>
  );
}
