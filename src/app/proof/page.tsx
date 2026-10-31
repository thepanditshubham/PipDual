import { CtaBand, PageHero, Prose, SitePage } from '@/components/site/site-chrome';

export const metadata = {
  title: 'Proof — Every duel can be re-derived',
  description:
    'How Pip Duel makes a settled duel reproducible: a seeded synthetic series, a submitted action log and a server-side re-simulation.',
};

export default function ProofPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Proof"
        title={
          <>
            A result you can
            <br />
            <em>re-derive yourself.</em>
          </>
        }
        lead="The market is generated from a seed and the duel is a list of actions. Anyone with the same inputs can replay the window and reach the same score — no trust in a screenshot required."
        meta={['Deterministic engine', 'Server re-simulation', 'No financial ledger']}
      />

      <section className="lp-section">
        <Prose
          sections={[
            {
              heading: '1. The series is a pure function',
              body: [
                'Every one-minute candle is derived from the pair, the salt and the day index. The duel window is derived from the ticket start time, so both terminals and the server generate the same ticks without a feed.',
                'There is no vendor history to rewrite and no price feed to drop. A window that existed last year can be regenerated today on any machine.',
              ],
            },
            {
              heading: '2. The action log is the duel',
              body: [
                'A player submits entries, exits, reversals and position sizes with the tick they happened on. The server replays that log against the regenerated series with next-tick fills, stop-loss, take-profit and the forced close.',
                'The result is the server score, not a number the browser can edit. The terminal is a view of the same engine, not the authority.',
              ],
            },
            {
              heading: '3. What is published, and what is not',
              body: [
                'Match history shows the result, the score and the equity trajectory. Practice and ranked results use the same engine and the same scoring rules.',
                'There is no money ledger to publish: coins are virtual credits with no cash value, no deposits and no payouts.',
              ],
            },
            {
              heading: '4. Known limits',
              body: [
                'The submit endpoint is unauthenticated in this snapshot and rate-limits in memory. It persists nothing today, so it is a scoring service, not a settlement service.',
                'A value-bearing settlement would need server-issued tickets, persisted matches and a database transaction. That is deliberately out of scope for the free-to-play build.',
              ],
            },
          ]}
        />
      </section>

      <CtaBand
        title="Read the engine. Then play it."
        copy="The full deterministic engine ships in this repository under src/lib/engine."
      />
    </SitePage>
  );
}
