import type { ProseSection } from '@/components/site/site-chrome';

/**
 * Blog content lives in the repository rather than a CMS: three articles is not
 * worth a database, and keeping them typed means a post cannot reference a page
 * that does not exist.
 */
export interface Post {
  slug: string;
  title: string;
  date: string;
  readingMinutes: number;
  excerpt: string;
  sections: ProseSection[];
}

export const POSTS: Post[] = [
  {
    slug: 'synthetic-market-that-can-be-fair',
    title: 'How a made-up market can still be fair',
    date: '28 October 2026',
    readingMinutes: 6,
    excerpt:
      'Prices on Pip Duel are generated, not streamed. That sounds like the opposite of fairness — until you look at what a streamed feed actually asks you to trust.',
    sections: [
      {
        heading: 'The problem with a live feed',
        body: [
          'When two players trade a real feed, three things have to be true before the contest is fair: both received the same ticks, both received them at the same time, and neither could have received them earlier. Every one of those is an infrastructure promise, not a mathematical one.',
          'A feed can be replicated late, a provider can serve two regions differently, and a reconnect can silently rewind history. None of that is dishonest — it is just latency, and latency is exactly what a short contest magnifies.',
        ],
      },
      {
        heading: 'What a deterministic series gives you instead',
        body: [
          'Here, the candles are a pure function of two numbers: an instrument and a day index. Both terminals compute them locally. There is no subscription to be first on, no packet to intercept, and no history to rewrite, because there is no history being transmitted at all.',
          'The consequence is strong: any third party, on any machine, at any future date, can recompute the exact bars a duel was settled on. That is not something a feed-based product can offer without also handing out its recording.',
        ],
      },
      {
        heading: 'Why the window is chosen before you arrive',
        body: [
          'If players could pick their window after seeing the market, a duel would reward patience rather than a read. So the window is snapped to the UTC hour of the ticket’s start time: everyone who plays in that hour gets the identical stretch of the series, and nobody can wait for a better one.',
          'It also means a duel you played a month ago can be re-derived from a single number in your match history.',
        ],
      },
      {
        heading: 'The honest trade-off',
        body: [
          'A synthetic market is not real gold, and no amount of cleverness makes it teach you how a real order book behaves. It is a competitive surface with clean rules, not a simulator of execution.',
          'We think that trade is worth making explicit rather than hiding: the fairness comes from arithmetic, and the realism is something you give up to get it.',
        ],
      },
    ],
  },
  {
    slug: 'why-four-entries',
    title: 'Why a duel gives you four entries and not forty',
    date: '26 October 2026',
    readingMinutes: 4,
    excerpt:
      'An entry cap looks like an arbitrary rule. It is actually the thing that decides whether a duel measures a read or a reaction time.',
    sections: [
      {
        heading: 'Unlimited entries reward the wrong skill',
        body: [
          'If a player can press buy as often as they like, the optimal strategy drifts toward volume: take a position, cut it, take it again, and let the one good entry pay for the twenty bad ones. That is a real skill in a real market, where costs are per trade — but it is not the skill a five-minute head-to-head is trying to measure.',
          'Worse, volume hides a bad read. A player who was wrong four times can look identical to a player who was right once if the position sizing and the entry count are unconstrained.',
        ],
      },
      {
        heading: 'Four is enough to trade a thesis',
        body: [
          'One entry to open. One to add, or to reverse when the read changes. One to re-enter after a stop. Four covers the ordinary shape of a short trade without turning the duel into a clicking contest.',
          'The cap also makes the count visible in the ticket. Knowing you have two entries left changes how you size the second one, which is exactly the kind of second-order thinking a terminal should teach.',
        ],
      },
      {
        heading: 'What it costs',
        body: [
          'The cap punishes indecision. If you spend three entries on a range that never breaks, you have one left when it finally does. That is the intended pressure, and it is the same pressure for both players — the rule is symmetric, which is the only property a rule needs to be fair.',
        ],
      },
    ],
  },
  {
    slug: 'risk-adjusted-scoring-without-formulas',
    title: 'Risk-adjusted scoring, without the formulas',
    date: '24 October 2026',
    readingMinutes: 5,
    excerpt:
      'Two players can finish a duel with the same P&L and deserve different results. Here is the intuition behind scoring that reads risk, not just profit.',
    sections: [
      {
        heading: 'P&L alone rewards the reckless',
        body: [
          'Consider two duels. One player makes $180 on a single lot with a shallow drawdown. The other makes $180 on four lots, after being down $240 halfway through. Same headline number, different trades.',
          'If the scoring only reads the last number, the second player is rewarded for surviving, and the first is not rewarded for not needing to survive.',
        ],
      },
      {
        heading: 'What “risk-adjusted” means here',
        body: [
          'It means the result is read together with how much equity had to move to produce it. A gain made while the account fell a long way is worth less than the same gain made on a stable curve, because the second one is repeatable and the first one happened to survive.',
          'This is the same instinct behind Sharpe-like measures in real portfolios, minus the statistics: over five minutes, there is not enough data for a formula to mean anything, so the intuition is applied directly.',
        ],
      },
      {
        heading: 'Why this matters for a duel',
        body: [
          'Head-to-head formats drift toward maximum aggression when only profit counts — the losing player has nothing to protect. Reading drawdown gives the trailing player a second lever: a cleaner curve can matter when the headline numbers are close.',
          'It also means the result screen has something to show beyond a number: two curves, and the argument about which one was better.',
        ],
      },
    ],
  },
];

export function findPost(slug: string): Post | undefined {
  return POSTS.find((post) => post.slug === slug);
}
