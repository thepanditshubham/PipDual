import Link from 'next/link';
import {
  Keyboard, ShieldCheck, Target, Zap, Clock, Trophy,
  Sliders, CheckCircle2, ArrowRight
} from 'lucide-react';
import { PLAY_BARS } from '@/lib/engine/constants';

export const metadata = {
  title: 'How to Play | Pip Duel',
  description: 'Master the Pip Duel trading terminal: 180-second rounds, scoring mechanics, keyboard controls, and fair-play architecture.',
};

export default function HowToPlayPage() {
  const steps = [
    {
      num: '01',
      title: 'Enter Room & Ready Up',
      desc: 'Join via quick matchmaking, challenge a friend with a 5-letter room code, or launch an instant Bot duel. A 15-second analysis period lets you study context.',
    },
    {
      num: '02',
      title: 'Analyze the Blind Market',
      desc: 'Both traders see the exact same window of one global market series — every duel fired in the same hour trades identical candles. The asset name and its dates are masked to eliminate hindsight bias.',
    },
    {
      num: '03',
      title: 'Execute & Manage Risk',
      desc: 'Use market orders (Buy/Sell/Close/Reverse). Only one position open at a time. Orders fill on the next tick (t+1). Set Stop Loss and Take Profit levels.',
    },
    {
      num: '04',
      title: 'Forced Close & Settlement',
      desc: `At the end of the replay (${PLAY_BARS} one-minute bars), an open position is settled at the final price. Because the window is picked by the match's start time, any result can be re-run and verified independently.`,
    },
  ];

  const controls = [
    { key: 'B', action: 'Execute Market BUY', detail: 'Opens Long position at t+1 price' },
    { key: 'S', action: 'Execute Market SELL', detail: 'Opens Short position at t+1 price' },
    { key: 'C', action: 'CLOSE Active Position', detail: 'Liquidates open position on next tick' },
    { key: 'R', action: 'REVERSE Position', detail: 'Closes active side and flips opposite on same tick' },
    { key: '1, 2, 3, 5', action: 'Lot Size Presets', detail: 'Quickly set order size ($50k notional per lot)' },
    { key: 'I', action: 'Toggle Indicators', detail: 'Shows/Hides EMA 9/21, SMA 50, and RSI (14)' },
    { key: 'M', action: 'Mute / Unmute', detail: 'Toggle synthesized audio click & fill sounds' },
  ];

  const fairPlayRules = [
    {
      title: 'Next-Tick Fill Guarantee',
      desc: 'Every order placed at tick t executes at price t+1. Neither player can front-run price prints or exploit network latency.',
    },
    {
      title: 'Server-Side Re-Simulation',
      desc: 'Client-reported scores are never trusted blindly. The server independently runs the Mulberry32 PRNG and verifies every action timestamp.',
    },
    {
      title: 'Clock Synchronization',
      desc: 'Clients perform an authoritative epoch time anchor check, ensuring millisecond-level tick synchronization between rivals.',
    },
    {
      title: 'Live and Demo Tables',
      desc: 'Every duel runs on the fixed $10,000 virtual balance. Demo is free and pays nothing. Live charges a coin entry (coins are bought by sending crypto — $1 = 100 coins, credited once a deposit is reviewed) and the winner collects the pooled pot after a 15% arena burn. Coins are real value in both directions: you can also ask for any balance back as USDT from the wallet, minus a $1 network fee, so stake only what you can afford to lose.',
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
          <Target size={14} /> Rulebook & Controls
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight text-[var(--text)]">
          How to <span className="gradient-text">Play</span>
        </h1>
        <p className="text-[var(--text-secondary)] text-base md:text-lg leading-relaxed">
          Everything you need to know about navigating the 1v1 trading battlefield, scoring formulas, and mastering terminal hotkeys.
        </p>
      </div>

      {/* Numbered Steps */}
      <div className="mb-20">
        <h2 className="text-2xl md:text-3xl font-extrabold mb-8 flex items-center gap-3 text-[var(--text)]">
          <Clock className="text-[var(--pink)]" /> The 4-Step Match Flow
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step) => (
            <div key={step.num} className="card p-6 relative group hover:border-[var(--purple)]/50 transition-all">
              <span
                className="text-4xl font-extrabold mb-3 block opacity-40 group-hover:opacity-80 transition-opacity font-mono"
                style={{ color: 'var(--pink)' }}
              >
                {step.num}
              </span>
              <h3 className="text-lg font-bold mb-2 text-[var(--text)]">{step.title}</h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scoring Section */}
      <div className="mb-20 card p-8 md:p-10 border-[var(--border)]">
        <h2 className="text-2xl md:text-3xl font-extrabold mb-8 flex items-center gap-3 text-[var(--text)]">
          <Trophy className="text-[var(--green-soft)]" /> Scoring & Settlement Formula
        </h2>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="p-6 bg-[var(--bg)] rounded-2xl border border-[var(--border)]">
            <h3 className="text-xl font-bold text-[var(--text)] mb-2 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--pink)]" />
              Standard Duel Scoring
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">Focuses on aggressive net return generation.</p>
            <div className="p-4 bg-[var(--surface)] font-mono text-sm border border-[var(--border)] rounded-xl mb-4 text-[var(--green-soft)]">
              Score = Final Realized P&L
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Calculated as: <span className="font-mono text-[var(--text)]">Direction × ((Exit - Entry) / Entry) × Size × $50,000</span>.
              The player with the highest positive return wins.
            </p>
          </div>

          <div className="p-6 bg-[var(--bg)] rounded-2xl border border-[var(--border)]">
            <h3 className="text-xl font-bold text-[var(--text)] mb-2 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--green-start)]" />
              Risk Duel Scoring
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">Rewards capital preservation and disciplined stop losses.</p>
            <div className="p-4 bg-[var(--surface)] font-mono text-sm border border-[var(--border)] rounded-xl mb-4 text-[var(--purple-light)]">
              Score = Final P&L − Maximum Peak-to-Trough Drawdown
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              If you made $400 P&L but suffered a $300 drawdown during the match, your final score is only $100.
              Discipline is rewarded over reckless leverage.
            </p>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
          <strong className="text-[var(--text)] uppercase tracking-wider">Tie-Breaker Hierarchy:</strong> In the event of an equal score, the player with the lower Maximum Drawdown wins. If drawdowns are identical, the trader with fewer total trades wins.
        </div>
      </div>

      {/* Keyboard Controls Table */}
      <div className="mb-20">
        <h2 className="text-2xl md:text-3xl font-extrabold mb-8 flex items-center gap-3 text-[var(--text)]">
          <Keyboard className="text-[var(--purple)]" /> Terminal Keyboard Shortcuts
        </h2>
        <div className="overflow-x-auto card p-0 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                <th className="p-4">Key</th>
                <th className="p-4">Command</th>
                <th className="p-4">Execution Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-sm">
              {controls.map((ctrl) => (
                <tr key={ctrl.key} className="hover:bg-[var(--surface-muted)] transition-colors">
                  <td className="p-4 font-mono font-bold text-[var(--pink)]">
                    <kbd className="px-2.5 py-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg shadow-sm text-xs">
                      {ctrl.key}
                    </kbd>
                  </td>
                  <td className="p-4 font-medium text-[var(--text)]">{ctrl.action}</td>
                  <td className="p-4 text-xs text-[var(--text-secondary)]">{ctrl.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fair Play & Anti-Cheat */}
      <div className="mb-20">
        <h2 className="text-2xl md:text-3xl font-extrabold mb-8 flex items-center gap-3 text-[var(--text)]">
          <ShieldCheck className="text-[var(--green-soft)]" /> Fair Play Architecture
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          {fairPlayRules.map((rule) => (
            <div key={rule.title} className="card p-6 space-y-2 hover:border-[var(--border)]/80 transition-colors">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={18} className="text-[var(--green-soft)]" />
                <h3 className="text-base font-bold text-[var(--text)]">{rule.title}</h3>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed pl-7">{rule.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Band */}
      <div className="card p-10 md:p-14 text-center space-y-6 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            background: 'radial-gradient(circle at 50% 50%, rgba(231,70,148,0.12) 0%, transparent 70%)',
          }}
        />
        <h2 className="text-3xl md:text-4xl font-extrabold text-[var(--text)] tracking-tight relative z-10">
          Ready to Test Your Edge?
        </h2>
        <p className="text-[var(--text-secondary)] max-w-lg mx-auto text-sm leading-relaxed relative z-10">
          Jump straight into a live 1v1 duel against a community trader or warmup against the momentum bot.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-4 relative z-10 pt-2">
          <Link href="/play" className="btn-primary px-8 py-3.5 text-sm font-bold flex items-center justify-center gap-2">
            Enter Matchmaking <ArrowRight size={16} />
          </Link>
          <Link
            href="/modes"
            className="px-8 py-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text)] text-sm font-semibold hover:border-[var(--purple)] transition-colors flex items-center justify-center"
          >
            Explore Game Modes
          </Link>
        </div>
      </div>
    </div>
  );
}
