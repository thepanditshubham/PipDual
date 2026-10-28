import Link from 'next/link';
import { ArrowRight, Check, Coins, Info } from 'lucide-react';
import { CtaBand, PageHero, SitePage } from '@/components/site/site-chrome';
import {
  COIN_PACKS,
  COINS_PER_USD,
  HOUSE_CUT,
  LIVE_FEES,
  MIN_DEPOSIT_USD,
  MAX_DEPOSIT_USD,
  MIN_WITHDRAW_USD,
  WITHDRAW_FEE_USD,
} from '@/lib/economy/config';
import { MATCH_DURATIONS } from '@/lib/engine/constants';

export const metadata = {
  title: 'Pricing — Entries, coins and fees',
  description:
    'Every number the arena runs on: the $1 = 100 coins peg, Live entry fees by table length, the house cut, deposit packs and withdrawal fees.',
};

const ENTRY_ROWS = (Object.keys(MATCH_DURATIONS) as (keyof typeof MATCH_DURATIONS)[]).map((id) => ({
  id,
  minutes: MATCH_DURATIONS[id] / 60,
  coins: LIVE_FEES[id],
  usd: LIVE_FEES[id] / COINS_PER_USD,
  pot: LIVE_FEES[id] * 2,
  win: Math.round(LIVE_FEES[id] * 2 * (1 - HOUSE_CUT)),
}));

export default function PricingPage() {
  const cheapest = Math.min(...Object.values(LIVE_FEES));
  const multiple = (1 - HOUSE_CUT) * 2;

  return (
    <SitePage>
      <PageHero
        kicker="Pricing"
        title={
          <>
            One peg. No subscription.
            <br />
            <em>No fee on top of the fee.</em>
          </>
        }
        lead={`A dollar buys ${COINS_PER_USD} coins, every time, in every pack size. A Live entry is priced in coins and paid out in coins, and the house takes the same fixed cut whether the pot is 200 or 1,000.`}
        meta={[
          `$1 = ${COINS_PER_USD} coins`,
          `Entries from ${cheapest} coins`,
          `${Math.round((1 - HOUSE_CUT) * 100)}% of the pot to the winner`,
        ]}
        actions={
          <>
            <Link href="/register" className="lp-btn lp-btn--lg">
              Open a free account
              <ArrowRight size={15} />
            </Link>
            <Link href="/how-to-play" className="lp-btn lp-btn--lg lp-btn--ghost">
              See what a duel costs you
            </Link>
          </>
        }
      />

      {/* ── Two tables ───────────────────────────────────────── */}
      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">What you are buying</span>
          <h2 className="lp-h2">Two ways in, one chart</h2>
          <p className="lp-sub">
            The candles, the spread and the four-entry cap are identical at both tables. The only
            thing that changes is what a win is worth.
          </p>
        </div>

        <div className="pg-cols-2">
          <article className="lp-table lp-table--featured">
            <span className="lp-table-badge">Stakes coins</span>
            <div className="lp-table-k">Live duel</div>
            <div className="lp-table-v">
              {cheapest} <small>coins to enter</small>
            </div>
            <p className="lp-table-note">
              ${(cheapest / COINS_PER_USD).toFixed(2)} on the shortest table. Winner takes{' '}
              {multiple.toFixed(2)}× their entry.
            </p>
            <ul className="lp-list">
              <li><Check size={12} /> Same rules for both traders</li>
              <li><Check size={12} /> Result re-run by the server</li>
              <li><Check size={12} /> Winnings withdrawable in USDT</li>
            </ul>
            <Link href="/play" className="lp-btn">
              Enter a duel
            </Link>
          </article>

          <article className="lp-table">
            <div className="lp-table-k">Demo</div>
            <div className="lp-table-v">
              0 <small>coins</small>
            </div>
            <p className="lp-table-note">Practice with the real rules, ranked nothing.</p>
            <ul className="lp-list">
              <li><Check size={12} /> Same entry cap and spread</li>
              <li><Check size={12} /> Instant match or versus bot</li>
              <li><Check size={12} /> No deposit, no withdrawal</li>
            </ul>
            <Link href="/modes" className="lp-btn lp-btn--ghost">
              See the modes
            </Link>
          </article>
        </div>
      </section>

      {/* ── Entry fee table ──────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-head">
          <span className="lp-kicker">Live entries</span>
          <h2 className="lp-h2">What each table costs and pays</h2>
          <p className="lp-sub">
            Both players pay the same entry. The two entries form the pot; the arena burns{' '}
            {Math.round(HOUSE_CUT * 100)}% of it and pays the rest to the winner.
          </p>
        </div>

        <div className="pg-table-outer">
          <div className="pg-table-wrap">
            <table className="pg-table">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Entry</th>
                  <th>In dollars</th>
                  <th>Pot</th>
                  <th>Winner receives</th>
                  <th>House cut</th>
                </tr>
              </thead>
              <tbody>
                {ENTRY_ROWS.map((row) => (
                  <tr key={row.id}>
                    <td>{row.minutes} minutes</td>
                    <td>{row.coins.toLocaleString()} coins</td>
                    <td>${row.usd.toFixed(2)}</td>
                    <td>{row.pot.toLocaleString()} coins</td>
                    <td className="ok">{row.win.toLocaleString()} coins</td>
                    <td>{Math.round(HOUSE_CUT * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="lp-sub" style={{ marginTop: 18, fontSize: 12 }}>
          An entry is spent when the duel starts, win or lose. Losing the read loses the entry —
          that is the whole wager.
        </p>
      </section>

      {/* ── Buying coins ─────────────────────────────────────── */}
      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">Buying coins</span>
          <h2 className="lp-h2">Fixed packs, flat rate</h2>
          <p className="lp-sub">
            Deposits are crypto, credited after a reviewer confirms the transfer on-chain. No pack
            is a better deal than another — the peg never moves, so an entry does not get cheaper
            for buying more.
          </p>
        </div>

        <div className="pg-table-wrap" style={{ maxWidth: 'var(--w-main)', margin: '0 auto' }}>
          <table className="pg-table">
            <thead>
              <tr>
                <th>Pack</th>
                <th>Coins</th>
                <th>Price</th>
                <th>Buys you</th>
              </tr>
            </thead>
            <tbody>
              {COIN_PACKS.map((pack) => (
                <tr key={pack.id}>
                  <td>{pack.label}</td>
                  <td>{pack.coins.toLocaleString()}</td>
                  <td>${pack.usd.toFixed(2)}</td>
                  <td>
                    {Math.floor(pack.coins / cheapest)} entries on the {Math.min(...Object.values(MATCH_DURATIONS)) / 60}-minute table
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="lp-sub" style={{ marginTop: 18, fontSize: 12 }}>
          Minimum deposit ${MIN_DEPOSIT_USD} · maximum ${MAX_DEPOSIT_USD.toLocaleString()} per transfer.
        </p>
      </section>

      {/* ── Withdrawals + what is not charged ────────────────── */}
      <section className="lp-section">
        <div className="lp-head">
          <span className="lp-kicker">Getting paid</span>
          <h2 className="lp-h2">Withdrawal terms</h2>
        </div>

        <div className="lp-features">
          <article className="lp-feature">
            <div className="lp-feature-icon"><Coins size={16} /></div>
            <h3 className="lp-feature-title">${MIN_WITHDRAW_USD} minimum, ${WITHDRAW_FEE_USD} flat fee</h3>
            <p className="lp-feature-desc">
              The fee comes off the payout, not out of your balance before the transfer, so you never
              need gas on a chain you are being paid on.
            </p>
          </article>
          <article className="lp-feature">
            <div className="lp-feature-icon"><Coins size={16} /></div>
            <h3 className="lp-feature-title">USDT on BEP20 or TRC20</h3>
            <p className="lp-feature-desc">
              Two rails the arena already holds funds on, so a payout is not waiting on a market sale
              to settle.
            </p>
          </article>
          <article className="lp-feature">
            <div className="lp-feature-icon"><Info size={16} /></div>
            <h3 className="lp-feature-title">The spread is not a fee</h3>
            <p className="lp-feature-desc">
              Every duel trades at a bid/ask around the synthetic mid, identical for both players.
              It is part of the simulation, not a charge on top of it.
            </p>
          </article>
        </div>
      </section>

      <CtaBand
        title={`Start at ${cheapest} coins, or play the demo first.`}
        copy="A free account opens the demo tables. Add coins only when you want a Live entry."
      />
    </SitePage>
  );
}
