import Link from 'next/link';
import { ArrowRight, Bot, Check, Coins, Flame, Play, Shield, Swords, Trophy } from 'lucide-react';
import { CtaBand, PageHero, SitePage } from '@/components/site/site-chrome';
import { COINS_PER_USD, HOUSE_CUT, LIVE_FEES } from '@/lib/economy/config';
import { potFor } from '@/lib/economy/stakes';
import { PLAY_BARS } from '@/lib/engine/constants';

export const metadata = {
  title: 'Game modes | Pip Duel',
  description:
    'Live duels with a coin pot, free Demo duels, and three scoring rule sets: Standard P&L, Risk-adjusted, and Versus Bot.',
};

const cheapest = Math.min(...Object.values(LIVE_FEES));

const ENTRY_MODES = [
  {
    id: 'live',
    name: 'Live',
    tagline: 'Coins on the table',
    icon: <Coins size={18} />,
    points: [
      `Entry scales with the clock: ${Object.entries(LIVE_FEES)
        .map(([duration, fee]) => `${duration.replace('m', ' min')} · ${fee.toLocaleString()}`)
        .join(' · ')} coins`,
      'Coins are deducted when a rival is matched — searching the queue is free',
      `Both entries pool, the arena burns ${Math.round(HOUSE_CUT * 100)}%, the winner collects the rest`,
      `A 5-minute duel risks ${LIVE_FEES['5m'].toLocaleString()} to win ${potFor(LIVE_FEES['5m']).toLocaleString()}`,
      'A draw refunds each player their own entry',
    ],
    href: '/play?mode=live',
    cta: 'Find a Live match',
    featured: true,
  },
  {
    id: 'demo',
    name: 'Demo',
    tagline: 'Nothing at stake',
    icon: <Play size={18} />,
    points: [
      'No entry fee, no pot and no coin movement at any length',
      'XP and missions still count — the ladder and the wallet do not',
      'Paired only against other Demo players, so a free table never meets a paid one',
      'The right place to learn the order panel and stop-loss brackets',
    ],
    href: '/play?mode=demo',
    cta: 'Play a Demo duel',
    featured: false,
  },
];

const RULE_SETS = [
  {
    id: 'standard',
    name: 'Standard Duel',
    tagline: 'Pure profit and loss',
    icon: <Swords size={18} />,
    badge: 'Most played',
    rules: [
      `Selectable 5 / 10 / 15 minute length (${PLAY_BARS}-bar replay)`,
      'Equal starting equity for both players',
      'Winner decided strictly by final P&L',
      'Tiebreak: lower max drawdown, then fewer entries',
    ],
    difficulty: 'Beginner to advanced',
    best: 'Fast positioning and breakout reads',
  },
  {
    id: 'risk',
    name: 'Risk Duel',
    tagline: 'Discipline over greed',
    icon: <Shield size={18} />,
    badge: 'Trader favourite',
    rules: [
      'Score reads total P&L against maximum drawdown',
      'One deep drawdown wipes out a large headline profit',
      'Rewards tight stops and deliberate sizing',
      'Same entry cap, same window, same market',
    ],
    difficulty: 'Intermediate to pro',
    best: 'Practising risk-to-reward and capital preservation',
  },
  {
    id: 'bot',
    name: 'Versus Bot',
    tagline: 'Zero-stakes training ground',
    icon: <Bot size={18} />,
    badge: 'Instant match',
    rules: [
      'Trade a deterministic momentum bot',
      'Instant start with no queue',
      'The bot only sees past prices — no future peek',
      'No rating change: a safe place to test a setup',
    ],
    difficulty: 'All levels',
    best: 'Warm-ups and testing shortcuts',
  },
];

const ROADMAP: { title: string; desc: string; live: boolean; href?: string }[] = [
  {
    title: 'Best of 3 series',
    desc: 'Three consecutive rounds across three distinct market regimes — trend, range, volatile. First to two wins the match.',
    live: false,
  },
  {
    title: 'Tournaments & brackets',
    desc: 'Single-elimination weekend brackets for up to 64 traders, with a community ladder and profile badges.',
    live: false,
  },
  {
    title: 'Replay library',
    desc: 'Every settled duel kept as a replay: both equity curves, every entry, scrubbable at your own pace.',
    live: false,
  },
];

export default function ModesPage() {
  return (
    <SitePage>
      <PageHero
        kicker="Game modes"
        title={
          <>
            Choose what you play for,
            <br />
            <em>then what it tests.</em>
          </>
        }
        lead="Every duel runs the identical hidden market on a synchronized clock. First decide what is at stake — Live puts a coin pot on the table, Demo keeps it free — then pick the rule set that scores it."
        meta={[
          `Live from ${cheapest} coins`,
          'Demo free',
          '5 / 10 / 15 minute tables',
        ]}
        actions={
          <>
            <Link href="/play" className="lp-btn lp-btn--lg">
              Open the lobby
              <ArrowRight size={15} />
            </Link>
            <Link href="/how-to-play" className="lp-btn lp-btn--lg lp-btn--ghost">
              How a duel works
            </Link>
          </>
        }
      />

      {/* ── Entry modes ──────────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-head">
          <span className="lp-kicker">01 · What is at stake</span>
          <h2 className="lp-h2">Live or Demo</h2>
          <p className="lp-sub">
            The chart, the spread and the entry cap are identical. The only difference is whether an
            entry costs coins.
          </p>
        </div>

        <div className="pg-cols-2">
          {ENTRY_MODES.map((mode) => (
            <article key={mode.id} className={`lp-table${mode.featured ? ' lp-table--featured' : ''}`}>
              {mode.featured && <span className="lp-table-badge">Stakes coins</span>}
              <div className="lp-table-k" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="lp-feature-icon" style={{ width: 28, height: 28, marginBottom: 0 }}>
                  {mode.icon}
                </span>
                {mode.name} · {mode.tagline}
              </div>
              <div className="lp-table-v">
                {mode.featured ? cheapest : 0} <small>{mode.featured ? 'coins to enter' : 'coins'}</small>
              </div>
              <p className="lp-table-note">
                {mode.featured
                  ? `$${(cheapest / COINS_PER_USD).toFixed(2)} at ${COINS_PER_USD} coins to the dollar.`
                  : 'Same rules, no coin movement.'}
              </p>
              <ul className="lp-list">
                {mode.points.map((point) => (
                  <li key={point}>
                    <Check size={12} />
                    {point}
                  </li>
                ))}
              </ul>
              <Link href={mode.href} className={mode.featured ? 'lp-btn' : 'lp-btn lp-btn--ghost'}>
                {mode.cta}
                <ArrowRight size={13} />
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* ── Rule sets ────────────────────────────────────────── */}
      <section className="lp-section lp-section--panel">
        <div className="lp-head">
          <span className="lp-kicker">02 · What it tests</span>
          <h2 className="lp-h2">Three scoring rule sets</h2>
          <p className="lp-sub">
            The same rules decide the winner whether you play for coins or for free.
          </p>
        </div>

        <div className="lp-tables">
          {RULE_SETS.map((mode) => (
            <article key={mode.id} className={`lp-table${mode.id === 'standard' ? ' lp-table--featured' : ''}`}>
              {mode.id === 'standard' && <span className="lp-table-badge">{mode.badge}</span>}
              <div className="lp-table-k" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="lp-feature-icon" style={{ width: 28, height: 28, marginBottom: 0 }}>
                  {mode.icon}
                </span>
                {mode.name}
              </div>
              <div className="lp-table-v" style={{ fontSize: 20, marginTop: 14 }}>
                {mode.tagline}
              </div>
              <ul className="lp-list" style={{ marginTop: 14 }}>
                {mode.rules.map((rule) => (
                  <li key={rule}>
                    <Check size={12} />
                    {rule}
                  </li>
                ))}
              </ul>
              <div
                style={{
                  borderTop: '1px solid var(--fin-border-1)',
                  paddingTop: 12,
                  marginBottom: 18,
                  fontSize: 11,
                  color: 'var(--fin-muted)',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <span>
                  <span style={{ color: 'var(--fin-ghost)' }}>Difficulty · </span>
                  {mode.difficulty}
                </span>
                <span>
                  <span style={{ color: 'var(--fin-ghost)' }}>Best for · </span>
                  {mode.best}
                </span>
              </div>
              <Link href={mode.id === 'bot' ? '/play?mode=bot' : '/play'} className="lp-btn lp-btn--ghost">
                Enter arena
                <ArrowRight size={13} />
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* ── Roadmap ──────────────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-head">
          <span className="lp-kicker">03 · In development</span>
          <h2 className="lp-h2">What is coming next</h2>
          <p className="lp-sub">
            Formats we are building for the Forexwala community. One of them is already open.
          </p>
        </div>

        <div className="lp-features">
          {ROADMAP.map((item) => {
            const body = (
              <>
                <div className="lp-feature-icon">
                  {item.live ? <Flame size={16} /> : <Trophy size={16} />}
                </div>
                <h3 className="lp-feature-title">{item.title}</h3>
                <p className="lp-feature-desc">{item.desc}</p>
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: 14,
                    padding: '3px 8px',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '1.2px',
                    textTransform: 'uppercase',
                    color: item.live ? 'var(--fin-green)' : 'var(--fin-muted)',
                    background: item.live ? 'rgba(0,221,102,.08)' : 'var(--fin-surface)',
                    border: `1px solid ${item.live ? 'rgba(0,221,102,.28)' : 'var(--fin-border-2)'}`,
                  }}
                >
                  {item.live ? 'Live now' : 'Coming soon'}
                </span>
              </>
            );

            return item.live && item.href ? (
              <Link key={item.title} href={item.href} className="lp-feature" style={{ textDecoration: 'none' }}>
                {body}
              </Link>
            ) : (
              <article key={item.title} className="lp-feature">
                {body}
              </article>
            );
          })}
        </div>
      </section>

      <CtaBand
        title={`Start free, or take the ${cheapest}-coin table.`}
        copy="The demo tables cost nothing and use the same chart. Coins only move when you choose a Live entry."
      />
    </SitePage>
  );
}
