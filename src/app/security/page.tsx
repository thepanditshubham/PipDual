import { CtaBand, PageHero, Prose, SitePage } from '@/components/site/site-chrome';

export const metadata = {
  title: 'Security — Accounts, fair play and reporting',
  description:
    'How Pip Duel protects accounts, scopes database access with row-level security, and what to do if you find a vulnerability.',
};

export default function SecurityPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Security"
        title={
          <>
            A game account
            <br />
            <em>is still an account.</em>
          </>
        }
        lead="No money moves through Pip Duel, so the security job is narrower: protect the account, protect other players' rows, and keep the game honest. Every write is scoped in Postgres, not in the browser."
        meta={['RLS-scoped data', 'Least privilege', 'Private disclosure']}
      />

      <section className="lp-section">
        <Prose
          sections={[
            {
              heading: '1. Accounts',
              body: [
                'Sign-in is handled by Supabase Auth (email and Google). Passwords never reach this application, and the anon key that ships to the browser is designed to be public.',
                'Guest sessions live in local storage and have no database profile, so a guest cannot read or write another player’s row.',
              ],
            },
            {
              heading: '2. The database is the authorization boundary',
              list: [
                'Row-level security scopes wallet reads and writes to the signed-in player.',
                'Profile authority columns (role, status, rating) are not writable by clients; column grants and a trigger hold that line.',
                'Admin tooling is not part of the public build. There is no public admin route to attack.',
                'The application never uses a service-role key in the browser.',
              ],
            },
            {
              heading: '3. Fair play',
              body: [
                'The market is deterministic and both terminals derive the same window from the ticket start time. The server re-simulates the submitted action log and scores it independently; a browser-edited score has nothing to attach to.',
                'The current submit endpoint is unauthenticated and persists nothing. Treat it as a scoring service, not a settlement service.',
              ],
            },
            {
              heading: '4. Reporting a vulnerability',
              body: [
                'Do not open a public issue. Use the private advisory link or the security email in SECURITY.md. Include a reproduction, the affected area and the impact; never include real credentials or another player’s data.',
                'We acknowledge within 48 hours and aim to triage within five business days. Good-faith research is covered by the safe-harbour statement in SECURITY.md.',
              ],
            },
          ]}
        />
      </section>

      <CtaBand
        title="Found something? Tell us privately."
        copy="Security advisories reach the maintainers without tipping off players or scanners."
      />
    </SitePage>
  );
}
