import Link from 'next/link';
import { Swords, ArrowLeft, FileText, Shield, AlertTriangle } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service | Pip Duel',
  description: 'Pip Duel terms of service, virtual currency policy, and fair usage guidelines.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen w-full bg-[var(--ui-deep)] text-[var(--text)] flex flex-col justify-between p-6 md:p-12 relative overflow-x-hidden">
      {/* Subtle ambient background glow matching login style */}
      <div
        className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(0, 123, 255, 0.12) 0%, rgba(0, 200, 83, 0.04) 40%, transparent 70%)',
        }}
      />

      {/* Top Header Bar */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between pb-6 border-b border-[var(--border)] relative z-10">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Home</span>
        </Link>

        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[var(--accent-active)] via-[var(--accent)] to-[var(--green)] flex items-center justify-center text-white">
            <Swords size={14} />
          </div>
          <span className="font-black text-sm tracking-wider text-[var(--text)]">PIP DUEL</span>
        </Link>
      </header>

      {/* Main Document Content */}
      <main className="w-full max-w-4xl mx-auto py-10 relative z-10 space-y-10">
        {/* Document Header */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[var(--surface-muted)] border border-[var(--border)] text-xs font-mono text-[var(--accent)]">
            <FileText size={13} />
            <span>LEGAL DOCUMENTATION</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold text-[var(--text)] tracking-tight">
            Terms of Service
          </h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)] font-mono">
            <span>Last Updated: October 2026</span>
            <span>•</span>
            <span>Version: 2.4</span>
            <span>•</span>
            <span>Forexwala Community (Pune, India)</span>
          </div>

          {/* Quick Legal Nav */}
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--accent)] text-white">
              Terms of Service
            </span>
            <Link
              href="/legal/privacy"
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/legal/disclaimer"
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            >
              Financial Disclaimer
            </Link>
          </div>
        </div>

        {/* Essential Notice Box */}
        <div className="p-5 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl space-y-1.5">
          <div className="flex items-center gap-2 text-[var(--accent)] text-xs font-bold uppercase tracking-wider">
            <Shield size={14} />
            <span>Simulation Notice</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Pip Duel is a competitive simulation game: every chart, price and order you see is synthetic. Its currency is not. Coins are bought with real crypto and can be paid back out as crypto, so a Live duel stakes value that is real money to you. Point balances, rankings and win-streaks remain in-game only and carry no value at all.
          </p>
        </div>

        {/* Document Sections */}
        <div className="space-y-8 text-sm text-[var(--text-secondary)] leading-relaxed font-normal">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">1.</span> Agreement to Terms
            </h2>
            <p>
              By accessing, browsing, registering for, or competing on Pip Duel (the &quot;Platform&quot;), you acknowledge that you have read, understood, and agreed to be legally bound by these Terms of Service. If you do not accept these terms in their entirety, you must discontinue using the Platform immediately.
            </p>
            <p>
              You represent and warrant that you are at least 18 years of age (or the age of majority in your jurisdiction) and have full legal capacity to enter into this agreement.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">2.</span> Strictly Virtual Currency & Simulation Policy
            </h2>
            <p>
              Pip Duel simulates markets for competition and entertainment. Market data, order fills and
              portfolio swings are synthetic; coins are not. Read this section before depositing:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-[var(--text-secondary)] text-xs">
              <li>
                <strong className="text-[var(--text)]">Simulation, Not Advice:</strong> Virtual dollars, points, win-streaks, ranking scores and generated candles have no monetary value, cannot be redeemed for fiat or crypto, and cannot be transferred outside the game.
              </li>
              <li>
                <strong className="text-[var(--text)]">Coins Carry Real Value:</strong> Coins are bought by sending crypto to the arena's deposit address ($1 = 100 coins) and are credited only after a reviewer confirms the transfer on-chain. A Live entry burns coins to stake a duel; the winner collects the pooled pot, and those winnings can be withdrawn as crypto. Treat every Live entry as money you can lose.
              </li>
              <li>
                <strong className="text-[var(--text)]">Deposits Are Final:</strong> A coin purchase is settled by a crypto transfer you send yourself. On-chain transfers cannot be reversed by Pip Duel, so a mistyped address, a wrong network, a memo/tag left out, or an amount below the pack price can end with nothing credited. Reviewers approve, reject, or ask for a corrected claim; a rejected deposit is not refundable, and sending the same transaction hash twice credits once.
              </li>
              <li>
                <strong className="text-[var(--text)]">Withdrawals:</strong> Any coin balance can be requested back as USDT, with a $5 minimum and a $1 network fee taken off the payout. Requesting one escrows the coins immediately — they leave your balance while a reviewer checks the account and sends the transfer by hand. A refused payout returns the coins; a sent payout cannot be reversed. Payouts go to the address on the request and nowhere else, and the arena may hold or refuse a payout on an account it cannot verify.
              </li>
              <li>
                <strong className="text-[var(--text)]">No Custody, No Investment:</strong> Coins are an entry token for a game, not a deposit, an investment, or a stored-value product. Pip Duel holds no balance on your behalf once a payout is sent, and offers no interest, returns or custody.
              </li>
              <li>
                <strong className="text-[var(--text)]">Synthetic Market Engine:</strong> Market candles and tick variations are mathematically generated or historical simulations created for synchronous head-to-head competition. No duel touches a real order book.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">3.</span> User Accounts & Security
            </h2>
            <p>
              You may access the platform as a Guest or by creating an authenticated account. You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account.
            </p>
            <p>
              You agree to immediately notify the Pip Duel support team of any unauthorized use or security compromise of your account. We reserve the right to reclaim usernames that infringe on trademarks or mislead players.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">4.</span> Fair Play, Anti-Cheat & Deterministic Audit
            </h2>
            <p>
              To maintain competitive integrity across the leaderboard, all matches are governed by deterministic execution verification:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-[var(--text-secondary)] text-xs">
              <li>
                <strong className="text-[var(--text)]">Disallowed Practices:</strong> Exploiting network latency, packet manipulation, automated scraping bots without authorization, multi-accounting for Elo boosting, or reverse-engineering anti-cheat validations.
              </li>
              <li>
                <strong className="text-[var(--text)]">Sanctions:</strong> Violation of fair play rules will result in immediate disqualification, rating forfeiture, and permanent hardware or account suspension without prior notice.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">5.</span> Educational Disclaimer (No Financial Advice)
            </h2>
            <p>
              All materials, indicators, duels, and leaderboards provided by Pip Duel and the Forexwala community are strictly educational. Nothing on this website constitutes financial, investment, legal, tax, or trading advice.
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Past performance in simulated duels is neither indicative nor a guarantee of future performance in live financial markets. Trading foreign exchange, commodities, and equities involves significant capital risk.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">6.</span> Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by applicable law, Pip Duel, its developers, contributors, and the Forexwala community will not be liable for any indirect, consequential, punitive, or incidental damages arising out of your access or inability to access the platform.
            </p>
            <p>
              Money you send on-chain is yours to route correctly. Pip Duel is not liable for a deposit sent to the wrong address, the wrong network, or without the memo a rail requires, nor for a payout signed off and broadcast to the address a player supplied. Value staked in a Live duel is lost when the duel is lost.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">7.</span> Amendments to Terms
            </h2>
            <p>
              We may revise these Terms of Service periodically to reflect platform enhancements or regulatory guidelines. Revisions will be posted on this page with an updated &quot;Last Updated&quot; date. Continued participation following amendments constitutes acceptance of the new terms.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">8.</span> Contact & Community Support
            </h2>
            <p>
              For legal inquiries, dispute resolutions, or questions regarding these terms, contact our community administrators via our official community channel at{' '}
              <a
                href="https://t.me/forexwala"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline font-semibold"
              >
                t.me/forexwala
              </a>.
            </p>
          </section>
        </div>

        {/* Action Row */}
        <div className="pt-6 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link
            href="/register"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hi)] text-white font-bold text-xs uppercase tracking-wider transition-colors"
          >
            Accept &amp; Register Account
          </Link>

          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--surface-muted)] hover:bg-[var(--ui-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] font-semibold text-xs transition-colors"
          >
            Back to Arena
          </Link>
        </div>
      </main>

      {/* Footer bar */}
      <footer className="w-full max-w-4xl mx-auto pt-8 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between text-xs text-[var(--text-muted)] gap-3 relative z-10">
        <span>&copy; 2025 Pip Duel • Educational Simulation</span>
        <div className="flex items-center gap-4">
          <Link href="/legal/terms" className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
            Terms
          </Link>
          <Link href="/legal/privacy" className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
            Privacy
          </Link>
          <Link href="/legal/disclaimer" className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
            Disclaimer
          </Link>
        </div>
      </footer>
    </div>
  );
}
