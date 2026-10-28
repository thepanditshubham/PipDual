import Link from 'next/link';
import { Swords, ArrowLeft, AlertTriangle } from 'lucide-react';

export const metadata = {
  title: 'Financial Disclaimer | Pip Duel',
  description: 'Pip Duel disclaimer: strictly virtual money educational simulation, not financial advice.',
};

export default function DisclaimerPage() {
  return (
    <div className="min-h-screen w-full bg-[var(--ui-deep)] text-[var(--text)] flex flex-col justify-between p-6 md:p-12 relative overflow-x-hidden">
      {/* Subtle ambient background glow */}
      <div
        className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(255, 119, 34, 0.09) 0%, rgba(255, 119, 34, 0.03) 40%, transparent 70%)',
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
          <div className="w-7 h-7 flex items-center justify-center bg-[var(--fin-orange)] text-black">
            <Swords size={14} />
          </div>
          <span className="font-black text-sm tracking-wider text-[var(--text)]">PIP DUEL</span>
        </Link>
      </header>

      {/* Main Document Content */}
      <main className="w-full max-w-4xl mx-auto py-10 relative z-10 space-y-10">
        {/* Document Header */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[var(--surface-muted)] border border-[var(--border)] text-xs font-mono text-[var(--warn)]">
            <AlertTriangle size={13} />
            <span>FINANCIAL RISK DISCLOSURE</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold text-[var(--text)] tracking-tight">
            Financial Disclaimer
          </h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)] font-mono">
            <span>Last Updated: October 2026</span>
            <span>•</span>
            <span>Version: 2.3</span>
            <span>•</span>
            <span>Forexwala Community (Pune, India)</span>
          </div>

          {/* Quick Legal Nav */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              href="/legal/terms"
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="/legal/privacy"
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            >
              Privacy Policy
            </Link>
            <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--accent)] text-white">
              Financial Disclaimer
            </span>
          </div>
        </div>

        {/* Essential Notice Box */}
        <div className="p-5 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl space-y-1.5">
          <div className="flex items-center gap-2 text-[var(--warn)] text-xs font-bold uppercase tracking-wider">
            <AlertTriangle size={14} />
            <span>Virtual Simulation Only • Not Financial Advice</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Pip Duel is a web-based competitive game built to demonstrate market dynamics, reaction speed and
            discipline through duel mechanics. Every chart and trade inside it is simulated — no real order
            book is touched. Coins, though, are bought with crypto you send and can be paid back out in
            crypto, so a Live duel stakes real value. Play it as you would stake money you can afford to lose.
          </p>
        </div>

        {/* Document Sections */}
        <div className="space-y-8 text-sm text-[var(--text-secondary)] leading-relaxed font-normal">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">1.</span> No Financial Services Offered
            </h2>
            <p>
              Pip Duel is NOT a broker-dealer, financial institution, registered investment advisor (RIA), crypto exchange, payment processor, or portfolio manager. We accept no investment, offer no investment opportunity, execute no live market transaction, and hold no funds in custody for you. Deposits and payouts are peer-to-peer transfers you make and receive on public blockchains; a human reviewer confirms each one against the explorer before coins are credited or a payout is signed off, and that reviewer may hold or refuse a payout on an account that cannot be verified.
            </p>
            <p>
              Coins are an entry token with one purpose: buying into a Live duel. A won pot increases your coin balance, and any coin balance can be requested back as USDT after a $1 network fee. That makes the game value-in, value-out — which is precisely why it is not offered to anyone under the age of majority, to any jurisdiction where paid-entry skill or chance games with crypto prizes are restricted, and never as a way to grow money. Nothing here is a return on capital.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">2.</span> Simulated Performance vs Real Market Risk
            </h2>
            <p>
              Hypothetical or simulated trading performance has inherent limitations. Unlike live real-world trading, simulated trades do not experience real market liquidity deficits, real capital risk, or the psychological pressures associated with actual monetary loss.
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              High scores or top ratings achieved within Pip Duel do not indicate or guarantee that you will experience success in real financial markets.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">3.</span> High Risk Warning for Live Financial Markets
            </h2>
            <p>
              Trading foreign exchange (forex), contracts for difference (CFDs), equities, cryptocurrencies, and derivatives carries a high level of risk and may not be appropriate for all investors. You may lose some or all of your invested capital. You should carefully evaluate your financial condition and risk tolerance before participating in real financial markets.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">4.</span> Third-Party Trademarks & Chart Libraries
            </h2>
            <p>
              Chart rendering components may utilize TradingView Lightweight Charts™ or open-source visualization technologies. All product names, trademarks, and logos are property of their respective owners.
            </p>
          </section>
        </div>

        {/* Action Row */}
        <div className="pt-6 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link
            href="/register"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hi)] text-white font-bold text-xs uppercase tracking-wider transition-colors"
          >
            I Understand &amp; Agree
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
