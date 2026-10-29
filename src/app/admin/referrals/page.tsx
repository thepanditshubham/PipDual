'use client';

/**
 * /admin/referrals
 * The whole IB affiliate program behind one door: the master switch and the
 * fee split, the rebate ladder itself, the desks with money parked on them,
 * and the paper trail — who invited whom, and what every duel paid.
 *
 * The program still decides every coin inside Postgres; this console only
 * changes the *rules* (config, tiers) and corrects a desk by hand when the
 * arena owes a trader a commission it missed. A player's own balance is
 * never touched here — only their parked desk balance, and every move of it
 * leaves an ib_adjustments row.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Coins,
  ListOrdered,
  RefreshCw,
  Search,
  Settings2,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import {
  adjustIbBalance,
  deleteIbTier,
  fetchAllPairings,
  fetchIbConfig,
  fetchIbDesks,
  fetchIbLeaderboard,
  fetchIbTiers,
  fetchRecentEarnings,
  resolveCallsign,
  saveIbConfig,
  saveIbTier,
  type AdminIbDesk,
  type AdminIbPairing,
  type IbBoardRow,
  type IbConfig,
  type IbEarning,
  type IbTier,
} from '@/lib/supabase/referrals';
import {
  Gate,
  PageHead,
  Pill,
  Stat,
  StatStrip,
  when,
} from '@/components/admin/admin-bits';

const inputClass =
  'h-9 border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-xs text-[var(--text)] focus:border-[var(--purple)] outline-none';

/** One editable row of the rebate ladder lives in its own component below. */

export default function AdminIbProgramPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [config, setConfig] = useState<IbConfig | null>(null);
  const [tiers, setTiers] = useState<IbTier[]>([]);
  const [desks, setDesks] = useState<AdminIbDesk[]>([]);
  const [pairings, setPairings] = useState<AdminIbPairing[]>([]);
  const [earnings, setEarnings] = useState<IbEarning[]>([]);
  const [board, setBoard] = useState<IbBoardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Desk adjustment form: a callsign, a signed delta, and the reason.
  const [adjustName, setAdjustName] = useState('');
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustBusy, setAdjustBusy] = useState(false);

  const load = useCallback(async () => {
    const [cfg, ladder, deskRows, pairs, recent, boardRows] = await Promise.all([
      fetchIbConfig(),
      fetchIbTiers(),
      fetchIbDesks(),
      fetchAllPairings(),
      fetchRecentEarnings(),
      fetchIbLeaderboard(20),
    ]);

    // The config read is the spine: no ib_config means section 13 never ran.
    setUnavailable(cfg === null);
    setConfig(cfg);
    setTiers(ladder ?? []);
    setDesks(deskRows ?? []);
    setPairings(pairs ?? []);
    setEarnings(recent ?? []);
    setBoard(boardRows ?? []);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    await load();
    setLoading(false);
  }, [load]);

  useEffect(() => {
    // Fetch-on-mount against Postgres; every state write lands after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const saveConfig = async () => {
    if (!config) return;
    const ok = await saveIbConfig(config);
    setFeedback(ok ? 'Program settings saved.' : 'Saving the program settings failed — is supabase/setup.sql applied?');
    if (ok) await load();
  };

  const saveTier = async (tier: IbTier) => {
    const ok = await saveIbTier(tier);
    setFeedback(ok ? `Level ${tier.level} saved.` : `Saving level ${tier.level} failed.`);
    await load();
  };

  const removeTier = async (level: number) => {
    const ok = await deleteIbTier(level);
    setFeedback(ok ? `Level ${level} retired — past earnings keep their snapshot.` : `Deleting level ${level} failed.`);
    await load();
  };

  const applyAdjustment = async () => {
    const playerId = await resolveCallsign(adjustName);
    if (!playerId) {
      setFeedback(`No account named @${adjustName.trim()} — check the callsign.`);
      return;
    }
    const delta = Math.round(Number(adjustDelta));
    if (!Number.isFinite(delta) || delta === 0) {
      setFeedback('A signed coin amount is required, e.g. -500 or 1200.');
      return;
    }
    setAdjustBusy(true);
    const balance = await adjustIbBalance(playerId, delta, adjustNote);
    setAdjustBusy(false);
    setFeedback(
      balance === null
        ? 'The adjustment failed — the delta and note must be sane and the player real.'
        : `Desk adjusted by ${delta > 0 ? '+' : ''}${delta.toLocaleString()}; balance now ${balance.toLocaleString()}.`,
    );
    if (balance !== null) {
      setAdjustName('');
      setAdjustDelta('');
      setAdjustNote('');
      await load();
    }
  };

  const needle = query.trim().toLowerCase();
  const visiblePairings = useMemo(
    () =>
      needle
        ? pairings.filter((row) =>
            `${row.inviterName} ${row.username} ${row.code ?? ''}`.toLowerCase().includes(needle),
          )
        : pairings,
    [pairings, needle],
  );
  const visibleEarnings = useMemo(
    () =>
      needle
        ? earnings.filter((row) =>
            `${row.traderName} ${row.matchId}`.toLowerCase().includes(needle),
          )
        : earnings,
    [earnings, needle],
  );

  const fundedInvites = pairings.filter((row) => row.funded).length;
  const coinsPaid = earnings.reduce((total, row) => total + row.commission, 0);
  const heldOnDesks = desks.reduce((total, row) => total + row.balance, 0);

  if (!user) {
    return (
      <Gate
        title="Sign in required"
        body="The affiliate program console is only readable from a signed-in admin account."
      />
    );
  }

  if (!isAdmin) {
    return (
      <Gate
        title="Admin access only"
        body={`Signed in as ${user.username}, which is not an admin account. Set role = 'admin' on this profile's row in Supabase to run the affiliate program.`}
      />
    );
  }

  return (
    <div className="space-y-4 animate-slide-up">
      <PageHead
        eyebrow={
          <>
            <Users size={12} className="text-[var(--purple)]" /> Players
          </>
        }
        title="Affiliate Program"
        accent="referrals"
        body="A slice of every platform fee flows to the upline of the trader who paid it, at the rate their team's traded volume has unlocked. Switch it, retune it, or correct a desk here — the payments themselves run inside Postgres."
        actions={
          <button
            onClick={() => void reload()}
            disabled={loading}
            className="flex items-center gap-2 border border-[var(--border)] bg-[var(--surface-muted)] px-3.5 py-2 text-xs font-bold text-[var(--text)] transition-colors hover:border-[var(--purple)] disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Reload
          </button>
        }
      />

      <StatStrip>
        <Stat bare icon={<UserPlus size={13} />} label="Pairings" value={pairings.length.toLocaleString()} />
        <Stat bare icon={<Wallet size={13} />} label="Funded invites" value={fundedInvites.toLocaleString()} />
        <Stat bare icon={<Coins size={13} />} label="Commissions (listed)" value={coinsPaid.toLocaleString()} />
        <Stat bare icon={<ListOrdered size={13} />} label="Held on desks" value={heldOnDesks.toLocaleString()} />
      </StatStrip>

      {unavailable && (
        <div className="card p-4 text-xs text-[var(--text-secondary)]">
          The program is unreadable right now — the <code className="text-[var(--purple-light)]">ib_config</code>{' '}
          tables are missing or the Supabase keys are unset. Re-run{' '}
          <code className="text-[var(--purple-light)]">supabase/setup.sql</code>, then reload. Until it
          is applied, signups and duels still work: they simply pay no rebates.
        </div>
      )}

      {feedback && (
        <div className="card p-3 text-xs text-[var(--text-secondary)] border border-[var(--purple)]/40">
          {feedback}
        </div>
      )}

      {/* Program master ------------------------------------------------ */}
      {config && (
        <div className="card p-0 overflow-hidden">
          <p className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)]/50 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            <Settings2 size={12} /> Program settings
          </p>
          <div className="grid gap-3 p-4 md:grid-cols-4">
            <label className="flex items-center gap-2 text-xs text-[var(--text)] cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="accent-[var(--purple)]"
              />
              Rebate desk enabled
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--text)]">
              <span className="text-[var(--text-muted)] whitespace-nowrap">Platform fee %</span>
              <input
                type="number"
                min={0}
                max={50}
                value={config.houseFeePct}
                onChange={(e) => setConfig({ ...config, houseFeePct: Number(e.target.value) })}
                className={`${inputClass} w-20`}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--text)]">
              <span className="text-[var(--text-muted)] whitespace-nowrap">House floor % of fee</span>
              <input
                type="number"
                min={0}
                max={100}
                value={config.minHousePctOfFee}
                onChange={(e) => setConfig({ ...config, minHousePctOfFee: Number(e.target.value) })}
                className={`${inputClass} w-20`}
              />
            </label>
            <div className="flex items-center">
              <button
                onClick={() => void saveConfig()}
                className="border border-[var(--purple)] bg-[var(--purple)]/10 px-3.5 py-2 text-xs font-bold text-[var(--purple-light)] transition-colors hover:bg-[var(--purple)]/20 cursor-pointer"
              >
                Save settings
              </button>
            </div>
          </div>
          <p className="border-t border-[var(--border)] px-4 py-2 text-[10px] font-mono text-[var(--text-muted)]">
            The platform fee must mirror HOUSE_CUT in src/lib/economy/config.ts (the client pot maths reads
            that file, the award reads this row) — change both or neither. The house floor trims every
            commission so a fat-fingered tier can never out-earn the arena.
          </p>
        </div>
      )}

      {/* Rebate ladder -------------------------------------------------- */}
      <div className="card p-0 overflow-hidden">
        <p className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)]/50 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          <ListOrdered size={12} /> Rebate ladder — coins per 100 staked, per funded downline
        </p>
        <div className="divide-y divide-[var(--border)]">
          {tiers.map((tier) => (
            <TierRow key={tier.level} tier={tier} onSave={saveTier} onRemove={removeTier} />
          ))}
          {tiers.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
              No rungs on the ladder — every award returns 0 until you add one below.
            </p>
          )}
          <NewTierRow usedLevels={tiers.map((t) => t.level)} onCreated={() => void load()} />
        </div>
      </div>

      {/* Desk adjustments ----------------------------------------------- */}
      <div className="card p-0 overflow-hidden">
        <p className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)]/50 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          <Wallet size={12} /> Desk balances & corrections
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] uppercase text-[var(--text-muted)] font-semibold tracking-wider">
                <th className="p-3">Affiliate</th>
                <th className="p-3">On desk</th>
                <th className="p-3">Lifetime earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {desks.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-[var(--text-muted)]">
                    Nobody has a parked commission yet — desks appear with the first rebate.
                  </td>
                </tr>
              )}
              {desks.map((desk) => (
                <tr key={desk.playerId} className="hover:bg-[var(--surface-muted)]/60">
                  <td className="p-3 font-semibold text-[var(--text)]">@{desk.callsign}</td>
                  <td className="p-3 font-mono text-[var(--up)]">{desk.balance.toLocaleString()}</td>
                  <td className="p-3 font-mono text-[var(--text-secondary)]">{desk.lifetime.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] p-3 text-xs">
          <input
            value={adjustName}
            onChange={(e) => setAdjustName(e.target.value)}
            placeholder="callsign"
            className={`${inputClass} w-36`}
            aria-label="Adjustment callsign"
          />
          <input
            value={adjustDelta}
            onChange={(e) => setAdjustDelta(e.target.value)}
            placeholder="+500 or -500"
            className={`${inputClass} w-28`}
            aria-label="Adjustment delta"
          />
          <input
            value={adjustNote}
            onChange={(e) => setAdjustNote(e.target.value)}
            placeholder="reason for the correction"
            className={`${inputClass} flex-1 min-w-[160px]`}
            aria-label="Adjustment note"
          />
          <button
            onClick={() => void applyAdjustment()}
            disabled={adjustBusy || !adjustName || !adjustDelta}
            className="border border-[var(--purple)] bg-[var(--purple)]/10 px-3.5 py-2 font-bold text-[var(--purple-light)] hover:bg-[var(--purple)]/20 disabled:opacity-50 cursor-pointer"
          >
            {adjustBusy ? 'Applying…' : 'Adjust desk'}
          </button>
        </div>
      </div>

      {/* Search over the paper trail ------------------------------------ */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--border)] p-3">
          <label className="relative block flex-1 max-w-xs">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search callsign, code or match…"
              aria-label="Search the program"
              className="h-9 w-full border border-[var(--border)] bg-[var(--surface-muted)] pl-8 pr-3 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)]"
            />
          </label>
          <span className="ml-auto font-mono text-[11px] text-[var(--text-muted)]">
            {visiblePairings.length}/{pairings.length} pairings · {visibleEarnings.length} commissions
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] uppercase text-[var(--text-muted)] font-semibold tracking-wider">
                <th className="p-3">Inviter</th>
                <th className="p-3">Invitee</th>
                <th className="p-3">Code used</th>
                <th className="p-3">State</th>
                <th className="p-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {visiblePairings.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-[var(--text-muted)]">
                    {unavailable
                      ? 'Nothing to list until the affiliate tables exist.'
                      : needle
                        ? `No pairing matches “${query.trim()}”.`
                        : 'No trader has arrived on an invite link yet.'}
                  </td>
                </tr>
              )}
              {visiblePairings.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--surface-muted)]/60">
                  <td className="p-3 font-semibold text-[var(--text)]">@{row.inviterName}</td>
                  <td className="p-3 text-[var(--text-secondary)]">@{row.username}</td>
                  <td className="p-3 font-mono text-[var(--text-muted)]">{row.code ?? '—'}</td>
                  <td className="p-3">
                    <Pill
                      tone={row.funded ? 'ok' : 'neutral'}
                      title={row.funded ? 'Deposit approved — counts toward the inviter\u2019s level' : 'Signed up, no approved deposit yet'}
                    >
                      {row.funded ? 'Funded' : 'Signed up'}
                    </Pill>
                  </td>
                  <td className="p-3 whitespace-nowrap text-[var(--text-secondary)]">{when(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto border-t border-[var(--border)]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] uppercase text-[var(--text-muted)] font-semibold tracking-wider">
                <th className="p-3">Duel</th>
                <th className="p-3">Trader</th>
                <th className="p-3">Stake</th>
                <th className="p-3">Fee</th>
                <th className="p-3">Tier</th>
                <th className="p-3">Commission</th>
                <th className="p-3">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {visibleEarnings.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-[var(--text-muted)]">
                    No commission has been paid yet — the list fills with the first settled Live duel
                    involving a referred account.
                  </td>
                </tr>
              )}
              {visibleEarnings.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--surface-muted)]/60">
                  <td className="p-3 font-mono text-[var(--text-muted)]">{row.matchId}</td>
                  <td className="p-3 text-[var(--text-secondary)]">@{row.traderName}</td>
                  <td className="p-3 font-mono">{row.stake.toLocaleString()}</td>
                  <td className="p-3 font-mono text-[var(--text-muted)]">{row.fee.toLocaleString()}</td>
                  <td className="p-3 font-mono text-[var(--text-muted)]">L{row.tierLevel} · {row.tierRate}/100</td>
                  <td className="p-3 font-mono font-bold text-[var(--up)]">+{row.commission.toLocaleString()}</td>
                  <td className="p-3 whitespace-nowrap text-[var(--text-secondary)]">{when(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {board.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <p className="border-b border-[var(--border)] bg-[var(--surface-muted)]/50 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            Affiliate ladder — counted by referral_leaderboard()
          </p>
          <div className="divide-y divide-[var(--border)]">
            {board.map((row, index) => (
              <p key={row.callsign} className="flex items-center gap-3 px-4 py-2 text-xs">
                <span className="w-5 shrink-0 text-right font-mono text-[var(--text-muted)]">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text)]">@{row.callsign}</span>
                <span className="shrink-0 font-mono text-[var(--text-secondary)]">
                  {row.volume.toLocaleString()} vol
                </span>
                <span className="w-24 shrink-0 text-right font-mono text-[var(--up)]">
                  {row.coins.toLocaleString()}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One rung of the ladder, drafted locally until saved: typing a rate never
 * rewrites the program on every keystroke, only the Save button does.
 */
function TierRow({
  tier,
  onSave,
  onRemove,
}: {
  tier: IbTier;
  onSave: (tier: IbTier) => Promise<void>;
  onRemove: (level: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<IbTier>({ ...tier });
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
      <span className="w-8 shrink-0 font-mono text-[var(--text-muted)]">L{tier.level}</span>
      <input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        className={`${inputClass} flex-1 min-w-[140px]`}
        aria-label={`Level ${tier.level} name`}
      />
      <input
        type="number"
        min={0}
        max={100}
        value={draft.ratePer100}
        onChange={(e) => setDraft({ ...draft, ratePer100: Number(e.target.value) })}
        className={`${inputClass} w-20`}
        aria-label={`Level ${tier.level} rate`}
      />
      <span className="text-[var(--text-muted)]">/ 100 staked</span>
      <input
        type="number"
        min={0}
        value={draft.minVolume}
        onChange={(e) => setDraft({ ...draft, minVolume: Number(e.target.value) })}
        className={`${inputClass} w-24`}
        aria-label={`Level ${tier.level} threshold`}
      />
      <span className="text-[var(--text-muted)]">volume</span>
      <label className="flex items-center gap-1.5 text-[var(--text-secondary)] cursor-pointer">
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          className="accent-[var(--purple)]"
        />
        active
      </label>
      <button
        onClick={async () => {
          setBusy(true);
          await onSave(draft);
          setBusy(false);
        }}
        disabled={busy}
        className="border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 font-bold text-[var(--text)] hover:border-[var(--purple)] disabled:opacity-60 cursor-pointer"
      >
        Save
      </button>
      <button
        onClick={async () => {
          setBusy(true);
          await onRemove(tier.level);
          setBusy(false);
        }}
        disabled={busy}
        className="border border-[var(--border)] px-2.5 py-1.5 font-bold text-[var(--down)] hover:border-[var(--down)] disabled:opacity-60 cursor-pointer"
      >
        Retire
      </button>
    </div>
  );
}

/**
 * A blank rung at the bottom of the ladder editor. Levels are 1..9; the
 * first unused one is the only sensible suggestion, so it is computed from
 * the rows that already exist rather than typed.
 */
function NewTierRow({ usedLevels, onCreated }: { usedLevels: number[]; onCreated: () => void }) {
  const nextLevel = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((l) => !usedLevels.includes(l)) ?? null;
  const [name, setName] = useState('');
  const [rate, setRate] = useState('5');
  const [minVolume, setMinVolume] = useState('0');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (nextLevel === null) return;
    setBusy(true);
    const ok = await saveIbTier({
      level: nextLevel,
      name: name.trim() || `Level ${nextLevel}`,
      ratePer100: Math.round(Number(rate) || 0),
      minVolume: Math.round(Number(minVolume) || 0),
      active: true,
    });
    setBusy(false);
    if (ok) {
      setName('');
      onCreated();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-[var(--surface-muted)]/30 px-4 py-2.5 text-xs">
      <span className="w-8 shrink-0 font-mono text-[var(--text-muted)]">+</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="new rung name"
        className={`${inputClass} flex-1 min-w-[140px]`}
        aria-label="New tier name"
      />
      <input
        type="number"
        min={0}
        max={100}
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        className={`${inputClass} w-20`}
        aria-label="New tier rate"
      />
      <span className="text-[var(--text-muted)]">/ 100 staked</span>
      <input
        type="number"
        min={0}
        value={minVolume}
        onChange={(e) => setMinVolume(e.target.value)}
        className={`${inputClass} w-24`}
        aria-label="New tier threshold"
      />
      <span className="text-[var(--text-muted)]">volume</span>
      <button
        onClick={() => void create()}
        disabled={busy || nextLevel === null}
        className="border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1.5 font-bold text-[var(--text)] hover:border-[var(--purple)] disabled:opacity-60 cursor-pointer"
      >
        {busy ? 'Adding…' : nextLevel === null ? 'Ladder full (9 max)' : `Add level ${nextLevel}`}
      </button>
    </div>
  );
}
