import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { PageHero, SitePage } from '@/components/site/site-chrome';
import { LIVE_FEES } from '@/lib/economy/config';
import { MAX_ORDERS_PER_MATCH } from '@/lib/engine/constants';

export const metadata = {
  title: 'You have been invited',
  description: 'Open a Pip Duel account with an invite code and start with a Free table.',
};

const cheapest = Math.min(...Object.values(LIVE_FEES));

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const invite = code.trim().slice(0, 24).toUpperCase();

  return (
    <SitePage>
      <PageHero
        kicker={invite ? `Invite · ${invite}` : 'Invite link'}
        title={
          invite ? (
            <>
              Someone wants you
              <br />
              <em>in the arena.</em>
            </>
          ) : (
            <>
              This invite link
              <br />
              <em>does not look right.</em>
            </>
          )
        }
        lead={
          invite
            ? 'Opening an account from this link attaches the code to your profile. It costs nothing, and it does not change what an entry costs you.'
            : 'The code in the address is not in the shape an invite takes. You can still open a normal account — nothing is lost except the attribution.'
        }
        meta={invite ? [`Code ${invite}`, 'Free to join'] : ['Invalid code', 'Registration is still open']}
        actions={
          <Link
            href={invite ? `/register?ref=${encodeURIComponent(invite)}` : '/register'}
            className="lp-btn lp-btn--lg"
          >
            Create your account
            <ArrowRight size={15} />
          </Link>
        }
      />

      <section className="lp-section">
        <div className="lp-features">
          <article className="lp-feature">
            <div className="lp-feature-icon"><Check size={16} /></div>
            <h3 className="lp-feature-title">A Free table, immediately</h3>
            <p className="lp-feature-desc">
              No top-up to start. Practice duels use the same chart, the same spread and the same{' '}
              {MAX_ORDERS_PER_MATCH}-entry cap as a ranked table.
            </p>
          </article>
          <article className="lp-feature">
            <div className="lp-feature-icon"><Check size={16} /></div>
            <h3 className="lp-feature-title">Ranked tables use virtual coins</h3>
            <p className="lp-feature-desc">
              Ranked entries start at {cheapest} coins. Coins are earned by playing and in missions;
              they are never bought and have no cash value.
            </p>
          </article>
          <article className="lp-feature">
            <div className="lp-feature-icon"><Check size={16} /></div>
            <h3 className="lp-feature-title">Start without paying</h3>
            <p className="lp-feature-desc">
              Practice duels are free and use the exact chart a ranked table trades. Study the layout before
              you decide anything.
            </p>
          </article>
        </div>

        <div className="pg-prose" style={{ marginTop: 30 }}>
          <p>
            Invite codes are a way to bring a friend to the arena. They do not pay commission, and no
            part of your entry or winnings is shared with anyone.
          </p>
        </div>
      </section>
    </SitePage>
  );
}
