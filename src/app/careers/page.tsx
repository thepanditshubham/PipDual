import Link from 'next/link';
import { PageHero, Prose, SitePage } from '@/components/site/site-chrome';

export const metadata = {
  title: 'Careers — Who we are looking for',
  description:
    'Pip Duel is a small team in Pune. There are no open roles right now, but here is what we hire for and how to be considered anyway.',
};

export default function CareersPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Careers"
        title={
          <>
            No open roles.
            <br />
            <em>But the bar is published.</em>
          </>
        }
        lead="We are a small team and we would rather say there is nothing open than keep a fake vacancy page warm. If you are the right shape, we still want to read the message."
        meta={['Pune, India', 'Small team · no layers']}
      />

      <section className="lp-section">
        <Prose
          sections={[
            {
              heading: 'What we hire for',
              list: [
                'Front-end engineers who care about a 5px misalignment and a 60fps chart equally.',
                'Trading product designers who can work inside a rigid system instead of inventing a new one per screen.',
                'Systems engineers comfortable with deterministic simulation, replay and settlement.',
                'Community operators who can hold a Telegram together without turning it into a pump room.',
              ],
              body: [
                'Everyone here ships. There is no layer that reviews without building.',
              ],
            },
            {
              heading: 'What we do not do',
              body: [
                'No unpaid “tests” that are actually a feature. No take-home longer than two hours. No equity promises standing in for salary.',
              ],
            },
            {
              heading: 'If you want to be considered anyway',
              body: [
                'Send one message through the contact channel: what you built, a link, and the single thing you would change about this product. Specific beats a CV.',
                'The honest answer may be “nothing open for six months”. We will say that rather than leave you waiting.',
              ],
            },
          ]}
        />

        <div className="pg-prose" style={{ marginTop: 24 }}>
          <p>
            Not looking for a job but found a bug? Use <Link href="/support">support</Link> — it reaches
            someone faster.
          </p>
        </div>
      </section>
    </SitePage>
  );
}
