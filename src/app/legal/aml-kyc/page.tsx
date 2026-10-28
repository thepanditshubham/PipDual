import Link from 'next/link';
import { PageHero, Prose, SitePage } from '@/components/site/site-chrome';
import { MIN_DEPOSIT_USD, MAX_DEPOSIT_USD, MIN_WITHDRAW_USD } from '@/lib/economy/config';

export const metadata = {
  title: 'AML & KYC policy',
  description:
    'How Pip Duel reviews crypto deposits, when identity checks apply, and how withdrawal reviews and record keeping work.',
};

export default function AmlPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Legal"
        title={
          <>
            AML &amp; KYC policy
            <br />
            <em>Where the money enters and leaves.</em>
          </>
        }
        lead="Every deposit is a transfer someone can see on a public chain, and every withdrawal is a transfer we have to be willing to defend. This policy describes the checks in between."
        meta={['Last updated October 2026', 'Applies to all crypto rails']}
      />

      <section className="lp-section">
        <Prose
          sections={[
            {
              heading: '1. Why this policy exists',
              body: [
                'A platform that accepts crypto and pays crypto can be used to move value that has nothing to do with trading. The controls below exist to make that difficult, and to leave a record when someone tries.',
              ],
            },
            {
              heading: '2. What we collect',
              list: [
                'Account details you provide at signup: username, email address and (optionally) a phone number.',
                'The deposit address used, the transaction id, the amount and the confirmation count.',
                'Withdrawal requests, destination addresses and the reviewer who approved each one.',
                'Duel participation and the resulting coin movements in the ledger.',
              ],
              body: [
                'We do not collect private keys, seed phrases or exchange credentials, and we will never ask for them.',
              ],
            },
            {
              heading: '3. Deposit review',
              body: [
                `Deposits are not credited automatically. A reviewer opens the transaction on a public explorer and confirms that the recipient address matches the published rail, that the amount matches the declaration, and that the transaction has enough confirmations.`,
                `The declared range is $${MIN_DEPOSIT_USD} to $${MAX_DEPOSIT_USD.toLocaleString()} per transfer. A transfer outside that range is returned rather than credited.`,
              ],
            },
            {
              heading: '4. When identity checks apply',
              body: [
                'Identity verification is required when a withdrawal pattern warrants it, when a linked deposit comes from a flagged address, or when the total value moved through an account crosses the threshold set by the operator.',
                'If a check applies, it is requested through the support channel and blocks only the withdrawal, not the account or the ability to watch the market.',
              ],
            },
            {
              heading: '5. Source of funds',
              body: [
                'For larger or repeated deposits we may ask where the funds came from. Acceptable explanations are the ordinary ones — salary, business revenue, savings, an exchange withdrawal you can document.',
                'We do not ask for this to be difficult. A deposit that cannot be explained cannot be paid out, because the payout leaves our wallet with our name on it.',
              ],
            },
            {
              heading: '6. Withdrawal review and limits',
              body: [
                `Withdrawal requests start at $${MIN_WITHDRAW_USD} and are reviewed against the coin ledger before release. A request that does not match the ledger is rejected and the balance is corrected and explained.`,
                'Payouts are sent only to addresses you control, on the rails the arena supports. A request to a third-party wallet may be refused.',
              ],
            },
            {
              heading: '7. Prohibited activity',
              list: [
                'Moving funds on behalf of someone who cannot access their own account.',
                'Using the arena to launder value, split transfers to evade review, or route proceeds of crime.',
                'Multiple accounts to obscure who is actually playing.',
                'Any attempt to use another person’s identity or wallet without authority.',
              ],
              body: [
                'Accounts involved in the above are frozen and the matter is handled as the operator’s legal advice requires, which may include reporting to the relevant authority.',
              ],
            },
            {
              heading: '8. Record keeping',
              body: [
                'Deposit reviews, withdrawal approvals and ledger movements are retained for the period the operator is required to keep financial records in its jurisdiction. This is usually longer than the active life of an account — closing an account does not delete the money trail.',
              ],
            },
          ]}
        />

        <div className="lp-prose" style={{ marginTop: 26 }}>
          <p>
            Related: <Link href="/security">security</Link> ·{' '}
            <Link href="/legal/privacy">privacy policy</Link> ·{' '}
            <Link href="/legal/terms">terms of service</Link>.
          </p>
        </div>
      </section>
    </SitePage>
  );
}
