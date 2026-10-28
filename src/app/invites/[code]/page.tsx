import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { PageHero, SitePage } from '@/components/site/site-chrome';
import { normalizeReferralCode } from '@/lib/supabase/referrals';
import { COINS_PER_USD, LIVE_FEES } from '@/lib/economy/config';
import { MAX_ORDERS_PER_MATCH } from '@/lib/engine/constants';

export const metadata = {
  title: 'You have been invited',
  description: 'Open a Pip Duel account with an invite code and start with a free demo table.',
};

const cheapest = Math.min(...Object.values(LIVE_FEES));

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const invite = normalizeReferralCode(code);

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
            <h3 className="lp-feature-title">A free demo table, immediately</h3>
            <p className="lp-feature-desc">
              No deposit to start. Demo duels use the same chart, the same spread and the same{' '}
              {MAX_ORDERS_PER_MATCH}-entry cap as a Live table.
            </p>
          </article>
          <article className="lp-feature">
            <div className="lp-feature-icon"><Check size={16} /></div>
            <h3 className="lp-feature-title">One dollar if you want stakes</h3>
            <p className="lp-feature-desc">
              Live entries start at {cheapest} coins — $
              {(cheapest / COINS_PER_USD).toFixed(2)} at {COINS_PER_USD} coins to the dollar. That is
              the most a single duel can cost you.
            </p>
          </article>
          <article className="lp-feature">
            <div className="lp-feature-icon"><Check size={16} /></div>
            <h3 className="lp-feature-title">Start without paying</h3>
            <p className="lp-feature-desc">
              Demo duels are free and use the exact chart a Live table trades. Study the layout before
              you decide anything.
            </p>
          </article>
        </div>

        <div className="pg-prose" style={{ marginTop: 30 }}>
          <p>
            What happens to the code: your inviter earns a share of the platform fee from duels you
            play. It never comes out of your entries or your winnings — see the{' '}
            <Link href="/affiliate">affiliate page</Link> for the full mechanics.
          </p>
        </div>
      </section>
    </SitePage>
  );
}
