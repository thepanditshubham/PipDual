import Link from 'next/link';
import { CtaBand, PageHero, SitePage } from '@/components/site/site-chrome';

export const metadata = {
  title: 'Status — Service health',
  description:
    'The services Pip Duel depends on and their current state. Updated by hand; no automated uptime feed yet.',
};

const SERVICES = [
  {
    name: 'Market engine',
    detail: 'The deterministic series behind every chart and duel. Runs in the browser, so there is no feed to lose.',
    state: 'ok',
    note: 'Operational',
  },
  {
    name: 'Duel settlement',
    detail: 'Server-side replay of submitted actions. A duel that cannot settle stays open rather than guessing.',
    state: 'ok',
    note: 'Operational',
  },
  {
    name: 'Accounts & sign-in',
    detail: 'Email/password and Google sign-in, plus session refresh.',
    state: 'ok',
    note: 'Operational',
  },
  {
    name: 'Deposits',
    detail: 'On-chain review queue. A deposit is credited only after a reviewer confirms the transfer.',
    state: 'ok',
    note: 'Operational · reviewed manually',
  },
  {
    name: 'Withdrawals',
    detail: 'Payout queue on USDT BEP20 / TRC20.',
    state: 'ok',
    note: 'Operational · reviewed manually',
  },
  {
    name: 'Website & terminal',
    detail: 'Marketing pages, the lobby and the battle terminal.',
    state: 'ok',
    note: 'Operational',
  },
];

export default function StatusPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Status"
        title={
          <>
            What is running right now.
            <br />
            <em>And what we cannot promise.</em>
          </>
        }
        lead="A short, honest list. This page is maintained by hand — there is no automated uptime feed behind it yet, so treat it as a snapshot rather than a live monitor."
        meta={['Updated manually', 'Last reviewed October 2026']}
      />

      <section className="lp-section">
        <div className="pg-table-outer">
          <div className="pg-table-wrap">
            <table className="pg-table">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>Service</th>
                  <th>What it does</th>
                  <th style={{ width: 190 }}>State</th>
                </tr>
              </thead>
              <tbody>
                {SERVICES.map((service) => (
                  <tr key={service.name}>
                    <td>{service.name}</td>
                    <td>{service.detail}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <i className={`pg-dot pg-dot--${service.state}`} />
                        {service.note}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="lp-section lp-section--panel">
        <div className="pg-prose">
          <h2>Incident history</h2>
          <p>
            Nothing to report. When something breaks for more than a few minutes, the entry will be
            added here with the time window and what was affected — including duels that were voided
            because they could not settle cleanly.
          </p>

          <h2>What happens if settlement fails</h2>
          <p>
            A duel whose actions cannot be replayed is not scored by guesswork. It stays unsettled
            until it can be re-run, and the entry is held rather than burned. If that is not possible,
            the entry is returned to both players and the match is recorded as void.
          </p>

          <h2>Reporting an outage</h2>
          <p>
            If a page is broken or a duel is stuck, open <Link href="/support">support</Link> with the
            room code or the approximate time. That is faster than a public post, because it reaches
            someone who can look at the database.
          </p>
        </div>
      </section>

      <CtaBand
        title="Something not looking right?"
        copy="Send the room code and roughly when it happened. We can read the same ledger you can."
      />
    </SitePage>
  );
}
