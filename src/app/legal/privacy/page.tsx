import Link from 'next/link';
import { Swords, ArrowLeft, Shield, Lock } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy | Pip Duel',
  description: 'Pip Duel privacy policy, data collection, user rights, and account deletion procedures.',
};

export default function PrivacyPage() {
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[var(--surface-muted)] border border-[var(--border)] text-xs font-mono text-[var(--accent)]">
            <Shield size={13} />
            <span>PRIVACY COMMITMENT</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold text-[var(--text)] tracking-tight">
            Privacy Policy
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
            <Link
              href="/legal/terms"
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            >
              Terms of Service
            </Link>
            <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--accent)] text-white">
              Privacy Policy
            </span>
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
            <Lock size={14} />
            <span>Zero Monetization of Personal Data</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            We do not sell, rent, or trade your personal data. Data collected is strictly used for authentication, match history persistence, and anti-cheat validation.
          </p>
        </div>

        {/* Document Sections */}
        <div className="space-y-8 text-sm text-[var(--text-secondary)] leading-relaxed font-normal">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">1.</span> Information We Collect
            </h2>
            <p>
              Pip Duel collects only the minimum information necessary to maintain account security and synchronous match matchmaking:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-[var(--text-secondary)] text-xs">
              <li>
                <strong className="text-[var(--text)]">Account Information:</strong> Username, email address, avatar selection, and encrypted authentication tokens.
              </li>
              <li>
                <strong className="text-[var(--text)]">Gameplay & Performance Data:</strong> Match trade timestamps, order prices, direction, P&L calculations, and Elo rating adjustments.
              </li>
              <li>
                <strong className="text-[var(--text)]">Wallet &amp; Deposit Records:</strong> Coin balance and one record per coin purchase — deposit id, the coin and network chosen, the amount expected, the destination address we showed you, the memo/tag, the transaction hash you pasted, and the review status. A transaction hash only points at a transfer that is already public on its own blockchain, and nothing is credited until a reviewer verifies it.
              </li>
              <li>
                <strong className="text-[var(--text)]">Payout Records:</strong> When you request a withdrawal we store the coins escrowed, the network, the receiving address you supplied, any memo you added, and the payout transaction hash recorded against it. That address is the only piece of your own crypto identity we hold — it is needed to send money back to you and to dispute a payout. Pip Duel never asks for, and never stores, a seed phrase, a private key or a signature.
              </li>
              <li>
                <strong className="text-[var(--text)]">Guest Mode:</strong> Ephemeral session tokens stored locally in your browser storage. No email or personal identifiers are stored for guest players, and guests cannot deposit or withdraw coins.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">2.</span> How We Use Your Data
            </h2>
            <p>
              Collected data is utilized strictly to provide platform functionality:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-[var(--text-secondary)] text-xs">
              <li>Authenticating user sessions and safeguarding account access.</li>
              <li>Displaying competitive leaderboard rankings and public player match stats.</li>
              <li>Server-side determinism checks to identify unfair gameplay or unauthorized bot behavior.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">3.</span> Account Deletion & Right to Be Forgotten
            </h2>
            <p>
              You maintain complete ownership of your personal data. You may request immediate deletion of your account at any time through the in-app settings or by contacting our community team. Upon deletion, your email, password hashes, and profile identifiers are permanently erased.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">4.</span> Cookies & Local Storage
            </h2>
            <p>
              We use browser Local Storage solely for functional requirements, such as maintaining your login session and audio sound settings. We do not use third-party advertising cookies, trackers, or marketing pixels.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
              <span className="text-[var(--accent)] font-mono text-base">5.</span> Inquiries & Contact
            </h2>
            <p>
              If you have any questions or concerns regarding this Privacy Policy, please reach out via our official community channel on Telegram at{' '}
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
            Create Free Account
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
