'use client';

import {
  Brain, ChartNoAxesCombined, Droplets, Network, Plus, ShieldCheck, Target, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SKILLS, skillLabel } from '@/lib/profile/config';
import type { PlayerSkill, SkillKey } from '@/lib/profile/types';
import { EmptyState, Panel, SectionHeader } from './shared';

const ICONS: Record<SkillKey, LucideIcon> = {
  price_action: Target,
  market_structure: Network,
  liquidity_analysis: Droplets,
  risk_management: ShieldCheck,
  technical_analysis: ChartNoAxesCombined,
  trading_psychology: Brain,
};

export function SkillsTab({
  skills,
  isSelf,
  canEndorse,
  busySkill,
  error,
  onAddSkill,
  onRemoveSkill,
  onEndorse,
}: {
  skills: PlayerSkill[];
  isSelf: boolean;
  canEndorse: boolean;
  busySkill: string | null;
  error: string | null;
  onAddSkill: (key: SkillKey) => void;
  onRemoveSkill: (key: SkillKey) => void;
  onEndorse: (key: SkillKey) => void;
}) {
  const added = new Set(skills.map((skill) => skill.key));
  const remaining = SKILLS.filter((skill) => !added.has(skill.key));

  return (
    <div className="space-y-3">
      <Panel>
        <SectionHeader
          eyebrow="Community endorsements — not professional qualifications"
          title="Trading skills"
          action={<span className="font-mono text-[9px] text-[var(--text-muted)]">{skills.length}/6</span>}
        />
        {skills.length === 0 ? (
          <EmptyState
            icon={<Target size={17} />}
            title="No skills listed"
            body={
              isSelf
                ? 'Add the skills you rely on. Other eligible players can endorse them; endorsements are community signals, not verified credentials.'
                : 'This trader has not listed any skills yet.'
            }
          />
        ) : (
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {skills.map((skill) => {
              const Icon = ICONS[skill.key] ?? Target;
              const definition = SKILLS.find((entry) => entry.key === skill.key);
              return (
                <div key={skill.key} className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--accent-hi)]">
                      <Icon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-[var(--text)]">{skillLabel(skill.key)}</p>
                      <p className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed text-[var(--text-secondary)]">
                        {definition?.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2">
                    <span className="font-mono text-[9px] text-[var(--text-muted)]">
                      {skill.endorsements} endorsement{skill.endorsements === 1 ? '' : 's'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isSelf ? (
                        <button
                          type="button"
                          onClick={() => onRemoveSkill(skill.key)}
                          disabled={busySkill !== null}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[var(--text-muted)] hover:border-[var(--down)]/40 hover:text-[var(--down)] disabled:opacity-40"
                        >
                          <X size={9} /> Remove
                        </button>
                      ) : canEndorse ? (
                        <button
                          type="button"
                          onClick={() => onEndorse(skill.key)}
                          disabled={busySkill !== null || skill.endorsedByMe}
                          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider transition-colors disabled:opacity-45 ${
                            skill.endorsedByMe
                              ? 'border-[var(--up)]/30 bg-[var(--up)]/10 text-[var(--up)]'
                              : 'border-[var(--accent)]/35 bg-[var(--accent)]/10 text-[var(--accent-hi)] hover:bg-[var(--accent)]/20'
                          }`}
                        >
                          {skill.endorsedByMe ? <ShieldCheck size={9} /> : <Plus size={9} />}
                          {skill.endorsedByMe ? 'Endorsed' : 'Endorse'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {error && <p className="border-t border-[var(--border)] px-4 py-2 text-[9px] text-[var(--down)]">{error}</p>}
      </Panel>

      {isSelf && remaining.length > 0 && (
        <Panel>
          <SectionHeader eyebrow="Add to your profile" title="Available skills" />
          <div className="flex flex-wrap gap-1.5 p-3">
            {remaining.map((skill) => (
              <button
                key={skill.key}
                type="button"
                onClick={() => onAddSkill(skill.key)}
                disabled={busySkill !== null}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-[9px] font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent-hi)] disabled:opacity-40"
              >
                <Plus size={10} /> {skill.label}
              </button>
            ))}
          </div>
        </Panel>
      )}

      <p className="px-1 text-[9px] leading-relaxed text-[var(--text-muted)]">
        Skills are self-declared. Endorsements are community signals from eligible players and are
        not verified professional qualifications or investment advice.
      </p>
    </div>
  );
}
