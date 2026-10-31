'use client';

import Link from 'next/link';
import { ExternalLink, Pencil, ShieldCheck } from 'lucide-react';
import { SOCIAL_PLATFORMS } from '@/lib/profile/config';
import type { PlayerPortfolio, PlayerProfile, PlayerStats } from '@/lib/profile/types';
import { EmptyState, Panel, SectionHeader, formatNumber, rankLabel } from './shared';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</p>
      <div className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">{children}</div>
    </div>
  );
}

function Chips({ values }: { values: string[] }) {
  if (values.length === 0) return <span className="text-[var(--text-muted)]">Not provided</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((value) => (
        <span key={value} className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-0.5 text-[9px] font-semibold text-[var(--text-secondary)]">
          {value}
        </span>
      ))}
    </div>
  );
}

export function PortfolioTab({
  portfolio,
  profile,
  stats,
}: {
  portfolio: PlayerPortfolio | null;
  profile: PlayerProfile;
  stats: PlayerStats;
}) {
  const hasPortfolio = Boolean(
    portfolio &&
      (portfolio.experience ||
        portfolio.preferredMarkets.length ||
        portfolio.tradingStyle ||
        portfolio.methodology ||
        portfolio.preferredTimeframes.length ||
        portfolio.certifications),
  );
  const socialLinks = portfolio?.socialLinks ?? {};

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <Panel>
          <SectionHeader
            eyebrow="Self-reported — not verified by Pip Duel"
            title="Trader portfolio"
            action={
              profile.isSelf ? (
                <Link
                  href={`/player/${profile.username}/edit`}
                  className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--accent-hi)] hover:text-[var(--text)]"
                >
                  <Pencil size={10} /> Edit
                </Link>
              ) : undefined
            }
          />
          {!hasPortfolio ? (
            <EmptyState
              icon={<Pencil size={17} />}
              title="No portfolio published"
              body={
                profile.isSelf
                  ? 'Add your experience, preferred markets and methodology. These are your claims, clearly separated from platform-verified results.'
                  : 'This trader has not added self-reported portfolio information yet.'
              }
              action={
                profile.isSelf ? (
                  <Link href={`/player/${profile.username}/edit`} className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--text)] hover:border-[var(--border-hi)]">
                    Build portfolio
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <Field label="Experience">
                <p className="whitespace-pre-line">{portfolio?.experience || 'Not provided'}</p>
              </Field>
              <Field label="Trading style">
                <p>{portfolio?.tradingStyle || 'Not provided'}</p>
              </Field>
              <Field label="Preferred markets">
                <Chips values={portfolio?.preferredMarkets ?? []} />
              </Field>
              <Field label="Preferred timeframes">
                <Chips values={portfolio?.preferredTimeframes ?? []} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Trading methodology">
                  <p className="whitespace-pre-line">{portfolio?.methodology || 'Not provided'}</p>
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Certifications (self-reported)">
                  <p>{portfolio?.certifications || 'No certifications listed'}</p>
                </Field>
              </div>
            </div>
          )}
          <p className="border-t border-[var(--border)] px-4 py-2 text-[9px] leading-relaxed text-[var(--text-muted)]">
            Portfolio fields are written by the trader. They are not checked, verified or endorsed by Pip Duel.
          </p>
        </Panel>

        <Panel>
          <SectionHeader eyebrow="User-submitted links" title="Social links" />
          {Object.keys(socialLinks).length === 0 ? (
            <EmptyState
              icon={<ExternalLink size={16} />}
              title="No links shared"
              body={profile.isSelf ? 'Add social links in the profile editor.' : 'This trader has not shared any social links.'}
            />
          ) : (
            <div className="grid gap-2 p-3 sm:grid-cols-2">
              {SOCIAL_PLATFORMS.filter((platform) => socialLinks[platform.key]).map((platform) => (
                <a
                  key={platform.key}
                  href={socialLinks[platform.key]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[10px] font-semibold text-[var(--text)] hover:border-[var(--accent)]/40"
                >
                  {platform.label}
                  <ExternalLink size={11} className="text-[var(--text-muted)]" />
                </a>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="space-y-3">
        <Panel>
          <SectionHeader eyebrow="Platform-verified game stats" title="Verified snapshot" />
          <div className="space-y-2 p-3">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--up)]/25 bg-[var(--up)]/5 px-2.5 py-2 text-[9px] text-[var(--up)]">
              <ShieldCheck size={12} /> Generated from settled battle rows, not profile input.
            </div>
            {[
              ['Duels', formatNumber(stats.totalDuels)],
              ['Win rate', `${stats.winRate}%`],
              ['Rank', rankLabel(stats.rankRp)],
              ['XP', formatNumber(stats.xp)],
              ['Tournament wins', formatNumber(stats.tournamentWins)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-[var(--border)] py-1.5 text-[10px] last:border-0">
                <span className="text-[var(--text-muted)]">{label}</span>
                <span className="font-mono font-bold text-[var(--text)]">{value}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionHeader eyebrow="How to read this page" title="Claims vs record" />
          <div className="space-y-2 p-3 text-[9px] leading-relaxed text-[var(--text-muted)]">
            <p><strong className="text-[var(--text-secondary)]">Portfolio:</strong> self-reported experience, markets, style and methodology.</p>
            <p><strong className="text-[var(--text-secondary)]">Verified snapshot:</strong> aggregates derived from stored battle results.</p>
            <p><strong className="text-[var(--text-secondary)]">Skills:</strong> community endorsements, not qualifications.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
