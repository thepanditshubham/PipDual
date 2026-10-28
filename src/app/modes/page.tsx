import Link from 'next/link';
import { Swords, Shield, Bot, Trophy, ArrowRight, Zap, Flame, Award, Radio, Coins, Play } from 'lucide-react';
import { COINS_PER_USD, HOUSE_CUT, LIVE_FEES } from '@/lib/economy/config';
import { potFor } from '@/lib/economy/stakes';

export const metadata = {
  title: 'Game Modes | Pip Duel',
  description: 'Explore Pip Duel battle modes: Live duels with a coin pot, free Demo duels, Standard P&L scoring, Risk-Adjusted scoring, and Versus Bot practice.',
};

/** The two ways a duel is entered: coins at stake, or nothing at all. */
const ENTRY_MODES = [
  {
    id: 'live',
    name: 'Live',
    tagline: 'Coins on the table',
    icon: <Coins size={24} className="text-[var(--pink)]" />,
    points: [
      `Entry fee in coins scales with the clock: ${Object.entries(LIVE_FEES)
        .map(([duration, fee]) => `${duration.replace('m', ' min')} · ${fee.toLocaleString()}`)
        .join(' · ')}`,
      'Coins are deducted the moment a rival is matched — searching the queue is free',
      `Both entries pool, the arena burns ${Math.round(HOUSE_CUT * 100)}%, the winner collects the rest`,
      `A 5-minute duel risks ${LIVE_FEES['5m'].toLocaleString()} to win ${potFor(LIVE_FEES['5m']).toLocaleString()}`,
      'A draw refunds each player their own entry',
      `Coins are bought with crypto at $1 = ${COINS_PER_USD} coins and credited after a deposit is reviewed`,
      'Any balance can be withdrawn back as USDT — $5 minimum, $1 network fee off the payout',
    ],
    href: '/play?mode=live',
    cta: 'Find a Live Match',
  },
  {
    id: 'demo',
    name: 'Demo',
    tagline: 'Nothing at stake',
    icon: <Play size={24} className="text-[var(--green-soft)]" />,
    points: [
      'No entry fee, no pot, no coin movement at any length',
      'XP and missions still count — the ladder and the wallet do not',
      'Paired only against other Demo players, so a free table never meets a paid one',
      'The right place to learn the order panel, hotkeys and stop-loss brackets',
    ],
    href: '/play?mode=demo',
    cta: 'Play a Demo Duel',
  },
];

export default function ModesPage() {
  const activeModes = [
    {
      id: 'standard',
      name: 'Standard Duel',
      tagline: 'Pure Profit & Loss Showdown',
      icon: <Swords size={28} className="text-[var(--pink)]" />,
      rules: [
        'Selectable 5 / 10 / 15 min battle length (1,440-tick replay)',
        'Equal $10,000 starting virtual balance',
        'Maximum 4 entry orders per duel',
        'Winner decided strictly by highest final P&L',
        'Tiebreaker: lower max drawdown, then fewer trades',
      ],
      difficulty: 'Beginner to Advanced',
      recommendedFor: 'Traders who like aggressive positioning and fast breakouts',
      badge: 'Most Popular',
      modeParam: 'standard',
      gradient: 'linear-gradient(315deg, var(--pink) 0%, var(--purple) 100%)',
    },
    {
      id: 'risk',
      name: 'Risk Duel',
      tagline: 'Discipline Over Greed',
      icon: <Shield size={28} className="text-[var(--green-soft)]" />,
      rules: [
        'Score = Total P&L minus Maximum Drawdown',
        'Maximum 4 entry orders per duel',
        'A single bad drawdown wipes out big profits',
        'Rewards tight stop losses and disciplined position sizing',
        'Teaches institutional-grade risk management',
      ],
      difficulty: 'Pro Traders',
      recommendedFor: 'Traders practicing proper risk-to-reward ratios and capital preservation',
      badge: 'Trader Favorite',
      modeParam: 'risk',
      gradient: 'linear-gradient(315deg, var(--green-start) 0%, var(--green-end) 100%)',
    },
    {
      id: 'bot',
      name: 'Versus Bot',
      tagline: 'Zero-Stakes Training Ground',
      icon: <Bot size={28} className="text-[var(--purple-light)]" />,
      rules: [
        'Trade against our deterministic momentum bot',
        'Instant match start with zero waiting time',
        'Bot only sees past prices (no future peek)',
        'Maximum 4 entry orders per duel',
        'No rating change — safe environment to test indicators and hotkeys',
      ],
      difficulty: 'All Levels',
      recommendedFor: 'Warmups, testing strategies, and mastering keyboard shortcuts',
      badge: 'Instant Match',
      modeParam: 'bot',
      gradient: 'linear-gradient(315deg, var(--purple-deep) 0%, var(--purple-light) 100%)',
    },
  ];

  const comingSoon = [
    {
      title: 'Best of 3 (Series)',
      desc: 'Three consecutive rounds across three distinct market regimes (Trend, Range, Volatile). First to win 2 rounds wins the match.',
      icon: <Flame size={24} className="text-[var(--text-secondary)]" />,
    },
    {
      title: 'Live Market Feed',
      desc: 'Real-time live tick stream directly from global FX and commodity markets, rebased and anonymized for live market battles.',
      icon: <Radio size={24} className="text-[var(--text-secondary)]" />,
    },
    {
      title: 'Tournaments & Brackets',
      desc: 'Single-elimination weekend brackets for up to 64 traders. Climb the community ladder for virtual glory and custom profile badges.',
      icon: <Trophy size={24} className="text-[var(--text-secondary)]" />,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-5 py-12 md:py-20">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-16 animate-slide-up">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest mb-4"
          style={{
            background: 'rgba(231, 70, 148, 0.08)',
            border: '1px solid rgba(231, 70, 148, 0.25)',
            color: 'var(--pink)',
          }}
        >
          <Zap size={14} /> Battle Arenas
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight text-[var(--text)]">
          Select Your <span className="gradient-text">Arena</span>
        </h1>
        <p className="text-[var(--text-secondary)] text-base md:text-lg leading-relaxed">
          Every duel runs the identical hidden market chart on a synchronized clock. First choose what you play for — Live puts a coin pot on the table, Demo keeps it free. Then choose the rule set that tests your edge.
        </p>
      </div>

      {/* Entry Modes: what a duel costs and what it pays */}
      <div className="grid md:grid-cols-2 gap-8 mb-24">
        {ENTRY_MODES.map((entry) => (
          <div key={entry.id} className="card p-8 relative overflow-hidden">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center shadow-inner">
                {entry.icon}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[var(--text)]">{entry.name}</h2>
                <p className="text-xs font-medium text-[var(--purple-light)] uppercase tracking-wider">{entry.tagline}</p>
              </div>
            </div>

            <div className="space-y-3 mb-7">
              {entry.points.map((point, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                  <span className="text-[var(--pink)] text-xs mt-1">▸</span>
                  <span className="leading-relaxed">{point}</span>
                </div>
              ))}
            </div>

            <Link
              href={entry.href}
              className="btn-angled py-3.5 px-6 text-sm font-bold flex items-center justify-center gap-2"
              style={{
                background:
                  entry.id === 'live'
                    ? 'linear-gradient(315deg, var(--pink) 0%, var(--purple) 100%)'
                    : 'linear-gradient(315deg, var(--green-start) 0%, var(--green-end) 100%)',
                color: '#fff',
              }}
            >
              {entry.cta} <ArrowRight size={16} />
            </Link>
          </div>
        ))}
      </div>

      {/* Scoring Rule Sets */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <h2 className="text-3xl font-extrabold mb-3 text-[var(--text)]">Scoring Rule Sets</h2>
        <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
          The same rules decide the winner whether you play for coins or for free.
        </p>
      </div>

      {/* Active Modes Grid */}
      <div className="grid lg:grid-cols-3 gap-8 mb-24">
        {activeModes.map((mode) => (
          <div
            key={mode.id}
            className="card p-8 flex flex-col justify-between hover:border-[var(--purple)]/50 transition-all duration-300 group relative overflow-hidden"
          >
            {/* Soft highlight bar at top */}
            <div
              className="absolute top-0 left-0 right-0 h-1 opacity-80 group-hover:opacity-100 transition-opacity"
              style={{ background: mode.gradient }}
            />

            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="w-14 h-14 rounded-2xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center shadow-inner">
                  {mode.icon}
                </div>
                <span
                  className="text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full border"
                  style={{
                    background: mode.id === 'risk' ? 'rgba(5, 122, 85, 0.15)' : 'rgba(231, 70, 148, 0.12)',
                    borderColor: mode.id === 'risk' ? 'rgba(132, 225, 188, 0.3)' : 'rgba(231, 70, 148, 0.3)',
                    color: mode.id === 'risk' ? 'var(--green-soft)' : 'var(--pink)',
                  }}
                >
                  {mode.badge}
                </span>
              </div>

              <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">{mode.name}</h2>
              <p className="text-xs font-medium text-[var(--purple-light)] mb-6 uppercase tracking-wider">{mode.tagline}</p>

              <div className="space-y-3 mb-6">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Rules & Scoring:</p>
                {mode.rules.map((rule, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                    <span className="text-[var(--pink)] text-xs mt-1">▸</span>
                    <span className="leading-relaxed">{rule}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-[var(--border)] space-y-2 mb-8">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-muted)] uppercase font-semibold">Difficulty:</span>
                  <span className="text-[var(--text)] font-medium">{mode.difficulty}</span>
                </div>
                <div className="text-xs">
                  <span className="text-[var(--text-muted)] uppercase font-semibold">Best for: </span>
                  <span className="text-[var(--text-secondary)]">{mode.recommendedFor}</span>
                </div>
              </div>
            </div>

            <Link
              href={mode.id === 'bot' ? '/play?mode=bot' : '/play'}
              className="btn-angled py-3.5 px-6 text-sm font-bold flex items-center justify-center gap-2"
              style={{ background: mode.gradient, color: '#fff' }}
            >
              Enter Arena <ArrowRight size={16} />
            </Link>
          </div>
        ))}
      </div>

      {/* Coming Soon */}
      <div className="mt-16">
        <div className="text-center max-w-xl mx-auto mb-12">
          <h2 className="text-3xl font-extrabold mb-3 text-[var(--text)]">
            In Development <span className="text-[var(--text-muted)] font-normal">(Roadmap)</span>
          </h2>
          <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
            We are constantly engineering new competitive formats for the Forexwala trading community.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {comingSoon.map((item) => (
            <div key={item.title} className="card p-6 border-[var(--border)] hover:border-[var(--border)]/80 bg-[var(--surface)]/70">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] flex items-center justify-center">
                  {item.icon}
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-muted)]">
                  Coming Soon
                </span>
              </div>
              <h3 className="text-lg font-bold mb-2 text-[var(--text)]">{item.title}</h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
