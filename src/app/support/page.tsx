import Link from 'next/link';
import { ArrowUpRight, MessageCircle } from 'lucide-react';
import { FaqList, PageHero, SitePage } from '@/components/site/site-chrome';

export const metadata = {
  title: 'Support — Get a human',
  description:
    'How to reach Pip Duel support, what to include so it gets fixed on the first reply, and the answers that solve most tickets without one.',
};

export default function SupportPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Support"
        title={
          <>
            Tell us what broke.
            <br />
            <em>Include the room code.</em>
          </>
        }
        lead="Support runs through the community channel where the arena was built. There is no ticket queue with an SLA — there is a person who can open the database and look."
        meta={['Best effort, not 24/7', 'No email inbox to lose things in']}
        actions={
          <a
            href="https://t.me/forexwala"
            target="_blank"
            rel="noopener noreferrer"
            className="lp-btn lp-btn--lg"
          >
            <MessageCircle size={15} />
            Open Telegram
            <ArrowUpRight size={14} />
          </a>
        }
      />

      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">Before you write</span>
          <h2 className="lp-h2">Four details that get it fixed first time</h2>
        </div>

        <div className="lp-features">
          <article className="lp-feature">
            <div className="lp-feature-n" style={{ color: 'var(--fin-orange)', fontWeight: 700, marginBottom: 10 }}>01</div>
            <h3 className="lp-feature-title">The room code</h3>
            <p className="lp-feature-desc">
              Every duel has one. It identifies the two players, the window and the settlement attempt
              without exposing anything private.
            </p>
          </article>
          <article className="lp-feature">
            <div className="lp-feature-n" style={{ color: 'var(--fin-orange)', fontWeight: 700, marginBottom: 10 }}>02</div>
            <h3 className="lp-feature-title">Time, roughly, in UTC</h3>
            <p className="lp-feature-desc">
              “Around 14:30 UTC” is enough to find the row. Your local clock is not, unless you tell us
              what it is.
            </p>
          </article>
          <article className="lp-feature">
            <div className="lp-feature-n" style={{ color: 'var(--fin-orange)', fontWeight: 700, marginBottom: 10 }}>03</div>
            <h3 className="lp-feature-title">What you expected</h3>
            <p className="lp-feature-desc">
              “The order filled but the entry count did not move” is a bug. “It felt wrong” is not yet.
            </p>
          </article>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-head">
          <span className="lp-kicker">Money questions</span>
          <h2 className="lp-h2">Deposits and withdrawals</h2>
        </div>

        <FaqList
          items={[
            {
              q: 'I sent crypto but my coins never arrived',
              a: 'Send the transaction ID. A reviewer opens it on the explorer and checks the recipient address, the amount and the confirmations. If it went to a different address than the one on the deposit screen, it cannot be recovered — that is why the address is only ever shown inside the app.',
            },
            {
              q: 'My withdrawal is queued and I need it faster',
              a: 'Payouts are reviewed manually, so there is a queue. Quote the request time and destination rail; if the ledger is clean it does not need to wait for anything else.',
            },
            {
              q: 'A duel ended and the result looks wrong',
              a: 'Send the room code. Settlement is a replay of your submitted actions, so the result can be re-run and compared — a disagreement is a bug we want to see.',
            },
            {
              q: 'I lost an entry because of a disconnection',
              a: 'The duel runs on the ticket clock, not on your connection. Bars keep closing whether your tab is open or not, so a disconnect is not a settlement error. If the room itself failed to stay up, that is different — send the code.',
            },
          ]}
        />
      </section>

      <section className="lp-section lp-section--panel">
        <div className="pg-prose">
          <h2>What support will never do</h2>
          <ul>
            <li>Ask for your password, a seed phrase or a private key.</li>
            <li>Send you a deposit address in a direct message.</li>
            <li>Change a settled result by hand.</li>
          </ul>
          <p>
            Anything claiming otherwise is impersonation. Report it in the channel so it can be called
            out publicly. For policies rather than problems, see the{' '}
            <Link href="/faq">FAQ</Link> and <Link href="/security">security</Link> pages.
          </p>
        </div>
      </section>
    </SitePage>
  );
}
