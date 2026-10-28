import Link from 'next/link';
import { Lock, Radio, Wallet } from 'lucide-react';
import { CtaBand, PageHero, Prose, SitePage } from '@/components/site/site-chrome';
import { MIN_WITHDRAW_USD, WITHDRAW_FEE_USD } from '@/lib/economy/config';

export const metadata = {
  title: 'Security — Accounts, deposits and payouts',
  description:
    'How Pip Duel protects accounts, reviews crypto deposits on-chain, and what a reviewer checks before a withdrawal is sent.',
};

export default function SecurityPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Security"
        title={
          <>
            The chart is public.
            <br />
            <em>Your account is not.</em>
          </>
        }
        lead="Three places money can go wrong: the account, the deposit and the payout. Each has one job — make the wrong outcome require more than a mistake, and make every movement leave a record."
        meta={['Crypto in, crypto out', `Withdrawals from $${MIN_WITHDRAW_USD}`, 'Manual review on every payout']}
      />

      <section className="lp-section lp-section--panel">
        <div className="lp-features">
          <article className="lp-feature">
            <div className="lp-feature-icon"><Lock size={16} /></div>
            <h3 className="lp-feature-title">Account</h3>
            <p className="lp-feature-desc">
              Passwords are hashed by the auth provider, sessions are token-based, and the address on
              the account is the only one support will reply to. Nobody on the team will ever ask for
              your password or a seed phrase.
            </p>
          </article>
          <article className="lp-feature">
            <div className="lp-feature-icon"><Radio size={16} /></div>
            <h3 className="lp-feature-title">Deposits</h3>
            <p className="lp-feature-desc">
              A deposit is a transfer to a published address, credited only after the transaction is
              read on-chain and the amount, recipient and confirmation count match the declared
              transfer. A screenshot is never enough.
            </p>
          </article>
          <article className="lp-feature">
            <div className="lp-feature-icon"><Wallet size={16} /></div>
            <h3 className="lp-feature-title">Payouts</h3>
            <p className="lp-feature-desc">
              Withdrawals queue for review. The reviewer checks the balance, the coin ledger and the
              destination address before release, and the transfer record is kept against your account.
            </p>
          </article>
        </div>
      </section>

      <section className="lp-section">
        <Prose
          sections={[
            {
              heading: 'What we will never ask for',
              list: [
                'Your password, in any channel, for any reason.',
                'A seed phrase, private key or wallet recovery file. No support flow needs one.',
                'A deposit sent to an address you were given in a direct message. Every deposit address is on the deposit screen inside the app.',
                'Remote access to your device.',
              ],
              body: [
                'If someone claiming to be Pip Duel asks for any of the above, they are not us. Report it through support so we can warn the community.',
              ],
            },
            {
              heading: 'How a deposit is credited',
              body: [
                'You send crypto to the address shown for that rail and paste the transaction ID. A reviewer opens the transaction in a public explorer, checks the recipient address and the amount, and only then credits coins.',
                'Because the check is manual, the first deposit of a session is not instant. That delay is the control: it is what makes a mis-pasted address, an underpaid transfer or a replayed transaction ID fail loudly instead of quietly.',
              ],
            },
            {
              heading: 'How a payout is sent',
              body: [
                `Coins convert at the same peg used for deposits. The payout floor is $${MIN_WITHDRAW_USD} and the flat network fee is $${WITHDRAW_FEE_USD}, taken from the amount you receive rather than charged up front.`,
                'Payouts are stablecoin transfers on rails the arena already holds funds on, so a withdrawal does not wait for a market sale to settle. Every request is reviewed against the ledger before it leaves.',
              ],
            },
            {
              heading: 'What we cannot protect you from',
              body: [
                'If someone has your wallet, your email, or your device, the arena is not the weakest link. If your recovery address is wrong, a payout sent to it cannot be recalled.',
              ],
              list: [
                'A lost entry is a spent entry — duels are not refundable once the ticket starts.',
                'A transfer to an address you typed yourself is irreversible.',
                'Community channels are public. Nobody legitimate will ask for account credentials there.',
              ],
            },
            {
              heading: 'Reporting a vulnerability',
              body: [
                'If you believe you have found a security bug, report it through support before disclosing it publicly. Include the steps to reproduce it and what you expected to happen. Responsible reports are acknowledged and credited.',
              ],
            },
          ]}
        />

        <div className="pg-prose" style={{ marginTop: 26 }}>
          <p>
            Related: <Link href="/legal/aml-kyc">AML / KYC policy</Link> ·{' '}
            <Link href="/legal/risk">risk disclosure</Link> ·{' '}
            <Link href="/support">support</Link>.
          </p>
        </div>
      </section>

      <CtaBand
        title="Questions about a specific transfer?"
        copy="Send the transaction ID through support. A reviewer can read the same chain you can."
      />
    </SitePage>
  );
}
