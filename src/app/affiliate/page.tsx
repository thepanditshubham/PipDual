import Link from 'next/link';
import { ArrowRight, Check, Link2, Users, Wallet } from 'lucide-react';
import { CtaBand, PageHero, Prose, SitePage } from '@/components/site/site-chrome';
import { HOUSE_CUT, LIVE_FEES } from '@/lib/economy/config';

export const metadata = {
  title: 'Affiliate — Invite traders, earn from the fee',
  description:
    'Share your invite code, and earn a share of the platform fee from the players you bring. How the Pip Duel referral programme works.',
};

const cheapest = Math.min(...Object.values(LIVE_FEES));

const STEPS = [
  {
    n: '01',
    icon: <Link2 size={16} />,
    title: 'Share your code',
    body: 'Every account has an invite code. A link like /register?ref=yourname carries it, and the code is attached to the new account at signup.',
  },
  {
    n: '02',
    icon: <Users size={16} />,
    title: 'They play',
    body: 'The pairing is written by the database when they register, not by the link. Anything you earn starts when the players you invited start entering duels.',
  },
  {
    n: '03',
    icon: <Wallet size={16} />,
    title: 'You are paid from the fee',
    body: `Commission is a share of the ${Math.round(HOUSE_CUT * 100)}% house cut your invitees generate. It never comes out of another player's winnings.`,
  },
];

export default function AffiliatePage() {
  return (
    <SitePage>
      <PageHero
        kicker="Affiliate"
        title={
          <>
            Bring a rival.
            <br />
            <em>Earn from the fee, not the pot.</em>
          </>
        }
        lead="If you already argue about charts in a group chat, this pays for the argument. Share your code, and take a share of the platform fee from the players you bring — never a slice of what they win."
        meta={['Invite code on every account', 'Paid from the house cut', 'Self-referral refused']}
        actions={
          <>
            <Link href="/register" className="lp-btn lp-btn--lg">
              Create an account
              <ArrowRight size={15} />
            </Link>
            <Link href="/pricing" className="lp-btn lp-btn--lg lp-btn--ghost">
              See what an entry costs
            </Link>
          </>
        }
      />

      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">How it works</span>
          <h2 className="lp-h2">Three steps, no dashboard to babysit</h2>
        </div>

        <div className="lp-steps">
          {STEPS.map((step) => (
            <article key={step.n} className="lp-step">
              <div className="lp-step-n">{step.n}</div>
              <h3 className="lp-step-t">{step.title}</h3>
              <p className="lp-step-d">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <Prose
          sections={[
            {
              heading: 'Where the money comes from',
              body: [
                `A Live duel pools two entries. The arena burns ${Math.round(HOUSE_CUT * 100)}% as its fee and pays the winner the rest. Affiliate commission is paid out of that fee.`,
                'That ordering matters. A referral never reduces what a winner collects, and it never makes a duel more expensive for the person you invited. The entry price is the same whether an account arrived through a code or not.',
              ],
            },
            {
              heading: 'What counts',
              list: [
                'Players who register with your code and then enter Live duels.',
                'Commission on the fee those duels generate, for as long as they play.',
                'Demo duels earn nothing, for anyone — there is no fee to share.',
              ],
            },
            {
              heading: 'What does not count',
              list: [
                'Your own second account. Self-referral is refused by the database, not just the form.',
                'Accounts created with the same person behind them to farm the programme.',
                'Deposits. Commission is on duel fees, not on money moved in or out.',
              ],
            },
            {
              heading: 'Your rate',
              body: [
                'Rates are set per affiliate and shown in your account. We do not publish a single headline percentage because the terms depend on volume and are agreed individually — ask support if you want to know yours before you start sharing.',
                'Commission is credited in coins at the same peg as everything else and withdraws on the same rails.',
              ],
            },
          ]}
        />

        <div className="lp-prose" style={{ marginTop: 24 }}>
          <div className="pg-note">
            <Check size={14} />
            <span>
              The cheapest Live entry is {cheapest} coins, so a single invitee who plays a few duels a
              week is worth more than a burst of signups that never stake anything.
            </span>
          </div>
        </div>
      </section>

      <CtaBand
        title="Your code is waiting inside the account."
        copy="Register, copy the invite link from your profile, and share it wherever the chart arguments happen."
      />
    </SitePage>
  );
}
