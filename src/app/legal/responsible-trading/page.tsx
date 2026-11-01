import Link from 'next/link';
import { PageHero, Prose, SitePage } from '@/components/site/site-chrome';
import { LIVE_FEES } from '@/lib/economy/config';
import { MAX_ORDERS_PER_MATCH } from '@/lib/engine/constants';

export const metadata = {
  title: 'Responsible play',
  description:
    'The limits built into Pip Duel, how to set your own, and what to do if a duel stops being a game.',
};

const cheapest = Math.min(...Object.values(LIVE_FEES));

export default function ResponsiblePlayPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Legal"
        title={
          <>
            Responsible play
            <br />
            <em>A small stake is still a stake.</em>
          </>
        }
        lead="The format is short and the entry is small, which is exactly what makes it easy to stop noticing how often you press the button. This page lists the limits that are built in, and the ones you have to set yourself."
        meta={['18+ only', 'Applies to all Paid tables']}
      />

      <section className="lp-section">
        <Prose
          sections={[
            {
              heading: '1. The limits that are built in',
              list: [
                `An entry caps the loss on a duel at ${cheapest} coins or whatever that table costs — there is no way to lose more than the entry.`,
                `Each duel allows ${MAX_ORDERS_PER_MATCH} entries, so a session is a series of discrete results rather than an endless stream.`,
                'Every duel has a clock. It ends whether you are winning or losing, which removes the “one more trade” loop.',
                'Free tables cost nothing and use the same rules, so you can play the format without staking anything.',
              ],
            },
            {
              heading: '2. The limits you set yourself',
              list: [
                'Decide a number before you open the lobby — coins per day or per week — and stop when you reach it, win or lose.',
                'Never add coins to chase a loss. A duel is a single contest, not a way to recover a previous one.',
                'Do not play to pay for something. If the reason for the next entry is a bill, the entry is a bad one.',
                'Take a break after two losses in a row. The format rewards a read, and a tired read is not a read.',
              ],
            },
            {
              heading: '3. Warning signs',
              list: [
                'Hiding how much you play from people close to you.',
                'Playing to recover rank rather than to compete.',
                'Skipping sleep, work or study to keep queuing.',
                'Irritability when you cannot play, or playing far longer than you intended.',
                'Feeling relief only when a duel starts, not when it ends well.',
              ],
              body: [
                'Any one of these is a reason to stop and use the practice tables for a while. Several together is a reason to stop entirely.',
              ],
            },
            {
              heading: '4. Freeze your own account',
              body: [
                'You can ask support to freeze your account for a period you choose — 24 hours, a week, a month, or permanently. The freeze blocks ranked duels; your coin balance stays where it is.',
                'A freeze ends by your request, not by a timer quietly expiring. Coins have no cash value and cannot be withdrawn, so nothing can be trapped outside the game.',
              ],
            },
            {
              heading: '5. Under 18',
              body: [
                'Accounts are for adults. If an account belongs to someone under 18, contact support and it will be closed and any remaining balance handled with the account holder’s guardian.',
              ],
            },
            {
              heading: '6. If it is no longer a game',
              body: [
                'This product cannot assess whether your play has become a problem, and it will not pretend to. If gambling is affecting your money, your work or the people around you, contact a support service in your country — most operate a free helpline and will not ask for details about this site.',
                'You can also ask us to freeze the account in the same message. That request is honoured without a debate.',
              ],
            },
          ]}
        />

        <div className="lp-prose" style={{ marginTop: 26 }}>
          <p>
            Related: <Link href="/legal/risk">risk disclosure</Link> ·{' '}
            <Link href="/legal/terms">terms of service</Link> ·{' '}
            <Link href="/support">support</Link>.
          </p>
        </div>
      </section>
    </SitePage>
  );
}
