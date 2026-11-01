'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trophy, Share2, RotateCcw, Home, Check, ChevronDown, Coins, Shield } from 'lucide-react';
import type { ScoreResult, Trade } from '@/lib/engine/types';
import type { RewardPacket } from '@/lib/progress/types';
import { netFor, type DuelOutcome } from '@/lib/economy';
import { HOUSE_CUT } from '@/lib/economy/config';

interface ResultModalProps {
  won: boolean;
  isDraw: boolean;
  userScore: ScoreResult;
  rivalScore: ScoreResult;
  userTrades: Trade[];
  rivalName: string;
  userEquity: number[];
  rivalEquity: number[];
  revealedMarket: {
    title: string;
    asset: string;
    tags: string[];
    /** Which window of the global series this duel traded. */
    session: string;
  };
  onRematch: () => void;
  isForfeit?: boolean;
  forfeitWinner?: 'user' | 'rival';
  /** Match length actually played, in seconds (drives the verified-replay banner). */
  battleSeconds?: number;
  /** Live settlement packet — absent for Demo, practice and friendly duels. */
  rewards?: RewardPacket | null;
  /**
   * Coin pot outcome for a Live duel: the entry paid on pairing and whatever the
   * settlement collected. Absent whenever no coins were at stake.
   */
  pot?: { stake: number; payout: number } | null;
}

export function ResultModal({
  won,
  isDraw,
  userScore,
  rivalScore,
  userTrades,
  rivalName,
  userEquity,
  rivalEquity,
  revealedMarket,
  onRematch,
  isForfeit = false,
  battleSeconds = 180,
  rewards = null,
  pot = null,
}: ResultModalProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const outcomeText = won ? 'VICTORY' : isDraw ? 'DRAW' : 'DEFEAT';
    const shareData = {
      title: 'Pip Duel Result',
      text: `Just finished a 1v1 trading battle on Pip Duel! Outcome: ${outcomeText} (${userScore.pnl >= 0 ? '+' : ''}$${userScore.pnl} P&L). Play me next round!`,
      url: window.location.origin,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        copyToClipboard();
      }
    } else {
      copyToClipboard();
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(
      `Pip Duel Match Result: ${won ? 'I WON' : 'Match settled'} with $${userScore.pnl} P&L against ${rivalName}! Play here: ${window.location.origin}/play`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Dual equity overlay: the same geometry as before, drawn into a shorter box.
  const maxEq = Math.max(...userEquity, ...rivalEquity, 10200);
  const minEq = Math.min(...userEquity, ...rivalEquity, 9800);
  const range = maxEq - minEq || 1;
  const width = 360;
  const height = 100;

  const toSvgPath = (eqArray: number[]) => {
    if (eqArray.length < 2) return '';
    return eqArray
      .map((val, idx) => {
        const x = (idx / (eqArray.length - 1)) * width;
        const y = height - ((val - minEq) / range) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const userPath = toSvgPath(userEquity);
  const rivalPath = toSvgPath(rivalEquity);
  const signedPnl = (pnl: number) => `${pnl < 0 ? '-' : '+'}$${Math.abs(pnl).toFixed(2)}`;

  const bannerTitle = isForfeit
    ? won
      ? 'Opponent Forfeited'
      : 'You Forfeited'
    : won
      ? 'Duel Victory'
      : isDraw
        ? 'Match Draw'
        : 'Defeat';

  const bannerSubtitle = isForfeit
    ? won
      ? `${rivalName} exited the duel. Victory awarded to you!`
      : 'You exited the duel early. Defeat conceded.'
    : `Verified By Server Engine · ${battleSeconds}s Live Window`;

  const potOutcome: DuelOutcome = won ? 'win' : isDraw ? 'draw' : 'loss';
  const showPot = Boolean(pot && pot.stake > 0);
  const potStake = pot?.stake ?? 0;
  const potPayout = pot?.payout ?? 0;
  const potNet = netFor(potOutcome, potStake);

  const tone = won
    ? { banner: 'from-[var(--term-buy-3)]/20 border-[var(--term-buy-3)]/40 text-[var(--term-buy)]', icon: 'border-[var(--term-buy)]/50 text-[var(--term-buy)]' }
    : isDraw
      ? { banner: 'from-[var(--term-border-hi)]/30 border-[var(--term-border-hi)] text-[var(--term-strong)]', icon: 'border-[var(--term-border-hi)] text-[var(--term-strong)]' }
      : { banner: 'from-[var(--term-sell)]/20 border-[var(--term-sell)]/40 text-[var(--term-sell)]', icon: 'border-[var(--term-sell)]/50 text-[var(--term-sell)]' };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-3 backdrop-blur-md sm:p-4">
      <div className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--term-border)] bg-[var(--term-panel)] shadow-2xl animate-slide-up">
        {/* Compact banner */}
        <div className={`shrink-0 border-b bg-gradient-to-b to-transparent px-4 py-4 text-center ${tone.banner}`}>
          <div className={`mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border bg-[var(--term-panel)] ${tone.icon}`}>
            <Trophy size={20} />
          </div>
          <h2 className="text-xl font-extrabold uppercase tracking-tight text-[var(--term-strong)] sm:text-2xl">
            {bannerTitle}
          </h2>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-[var(--term-soft)]">
            {bannerSubtitle}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {/* Scoreboard first: the outcome is the card */}
          <div className="grid grid-cols-2 gap-2">
            <div className="relative overflow-hidden rounded-lg border border-[var(--term-border)] bg-[var(--term-panel-deep)] p-3 text-center">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--term-buy)] to-[var(--term-buy-bright)]" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--term-buy)]">You</span>
              <div className={`font-mono text-xl font-extrabold tabular-nums ${userScore.pnl >= 0 ? 'text-[var(--term-buy)]' : 'text-[var(--term-sell)]'}`}>
                {signedPnl(userScore.pnl)}
              </div>
              <div className="mt-1.5 space-y-0.5 border-t border-[var(--term-border)] pt-1.5 text-[10px] text-[var(--term-soft)]">
                <div className="flex justify-between"><span>Score</span><strong className="font-mono text-[var(--term-strong)]">{userScore.score.toFixed(2)}</strong></div>
                <div className="flex justify-between"><span>Max DD</span><strong className="font-mono text-[var(--term-strong)]">${userScore.maxDrawdown.toFixed(2)}</strong></div>
                <div className="flex justify-between"><span>Trades</span><strong className="font-mono text-[var(--term-strong)]">{userScore.tradeCount}</strong></div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-lg border border-[var(--term-border)] bg-[var(--term-panel-deep)] p-3 text-center">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--term-gem)] to-[var(--term-border-hi)]" />
              <span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-[var(--term-gem)]">{rivalName}</span>
              <div className={`font-mono text-xl font-extrabold tabular-nums ${rivalScore.pnl >= 0 ? 'text-[var(--term-buy)]' : 'text-[var(--term-sell)]'}`}>
                {signedPnl(rivalScore.pnl)}
              </div>
              <div className="mt-1.5 space-y-0.5 border-t border-[var(--term-border)] pt-1.5 text-[10px] text-[var(--term-soft)]">
                <div className="flex justify-between"><span>Score</span><strong className="font-mono text-[var(--term-strong)]">{rivalScore.score.toFixed(2)}</strong></div>
                <div className="flex justify-between"><span>Max DD</span><strong className="font-mono text-[var(--term-strong)]">${rivalScore.maxDrawdown.toFixed(2)}</strong></div>
                <div className="flex justify-between"><span>Trades</span><strong className="font-mono text-[var(--term-strong)]">{rivalScore.tradeCount}</strong></div>
              </div>
            </div>
          </div>

          {/* Pot + rewards: compact strips side by side on wider phones */}
          {(showPot || rewards) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {showPot && (
                <div className="rounded-lg border border-[var(--term-border)] bg-[var(--term-panel-deep)] p-2.5">
                  <div className="flex items-center justify-between gap-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--term-soft)]">
                    <span className="flex items-center gap-1"><Coins size={11} /> Paid pot</span>
                    <span className="normal-case tracking-normal text-[var(--term-muted)]">
                      {isDraw ? 'refunded' : won ? 'won' : 'lost'}
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
                    <div>
                      <p className="text-[9px] uppercase text-[var(--term-muted)]">Entry</p>
                      <p className="font-mono text-[11px] font-bold text-[var(--term-sell)]">−{potStake.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-[var(--term-muted)]">Back</p>
                      <p className="font-mono text-[11px] font-bold text-[var(--term-strong)]">+{potPayout.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-[var(--term-muted)]">Net</p>
                      <p className={`font-mono text-[11px] font-bold ${potNet > 0 ? 'text-[var(--term-buy)]' : potNet < 0 ? 'text-[var(--term-sell)]' : 'text-[var(--term-strong)]'}`}>
                        {potNet > 0 ? '+' : ''}{potNet.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <p className="mt-1 text-[9px] font-mono text-[var(--term-muted)]">
                    {Math.round(HOUSE_CUT * 100)}% of the pool is removed as a sink.
                  </p>
                </div>
              )}

              {rewards && (
                <div className="rounded-lg border border-[var(--term-border)] bg-[var(--term-panel-deep)] p-2.5">
                  <div className="flex items-center justify-between gap-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--term-soft)]">
                    <span className="flex items-center gap-1"><Shield size={11} className="text-[var(--term-buy)]" /> Rewards</span>
                    <span className="normal-case tracking-normal text-[var(--term-muted)]">{rewards.rankAfter.tierLabel}</span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
                    <div>
                      <p className="text-[9px] uppercase text-[var(--term-muted)]">XP</p>
                      <p className="font-mono text-[11px] font-bold text-[var(--term-strong)]">+{rewards.xp.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-[var(--term-muted)]">RP</p>
                      <p className={`font-mono text-[11px] font-bold ${rewards.rp > 0 ? 'text-[var(--term-buy)]' : rewards.rp < 0 ? 'text-[var(--term-sell)]' : 'text-[var(--term-strong)]'}`}>
                        {rewards.rp > 0 ? '+' : ''}{rewards.rp}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase text-[var(--term-muted)]">Coins</p>
                      <p className="font-mono text-[11px] font-bold text-[var(--term-strong)]">+{rewards.coins}</p>
                    </div>
                  </div>
                  {(rewards.promoted || rewards.demoted || rewards.shielded || rewards.placementDone || rewards.levelAfter > rewards.levelBefore) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {rewards.promoted && <span className="rounded-full border border-[var(--term-buy)]/40 bg-[var(--term-buy)]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--term-buy)]">Promoted</span>}
                      {rewards.demoted && <span className="rounded-full border border-[var(--term-sell)]/40 bg-[var(--term-sell)]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--term-sell)]">Demoted</span>}
                      {rewards.shielded && <span className="rounded-full border border-[var(--term-primary)]/40 bg-[var(--term-primary)]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--term-primary-hi)]">Shield</span>}
                      {rewards.placementDone && <span className="rounded-full border border-[var(--term-border-hi)] bg-[var(--term-raised)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--term-soft)]">Placements</span>}
                      {rewards.levelAfter > rewards.levelBefore && <span className="rounded-full border border-[var(--term-border-hi)] bg-[var(--term-raised)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--term-strong)]">Level {rewards.levelAfter}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Equity sparkline */}
          <div className="rounded-lg border border-[var(--term-border)] bg-[var(--term-panel-deep)] px-3 py-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-semibold uppercase tracking-wider text-[var(--term-soft)]">Equity</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 font-bold text-[var(--term-buy)]"><span className="h-1 w-2 rounded-full bg-[var(--term-buy)]" /> You</span>
                <span className="flex items-center gap-1 font-bold text-[var(--term-gem)]"><span className="h-1 w-2 rounded-full bg-[var(--term-gem)]" /> {rivalName}</span>
              </div>
            </div>
            <div className="relative mt-1 h-16 w-full">
              <svg viewBox="0 0 360 100" className="h-full w-full overflow-visible" aria-hidden="true">
                <line x1="0" y1="50" x2="360" y2="50" stroke="var(--term-border)" strokeDasharray="3 3" />
                {rivalPath && (
                  <polyline fill="none" stroke="var(--term-gem)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 2" points={rivalPath} />
                )}
                {userPath && (
                  <polyline fill="none" stroke="var(--term-buy-bright)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={userPath} />
                )}
              </svg>
            </div>
          </div>

          {/* Market, one line */}
          <div
            className="flex items-center justify-between gap-2 rounded-lg border border-[var(--term-border)] bg-[var(--term-raised)] px-3 py-2 text-[10px]"
            title={`${revealedMarket.title} (${revealedMarket.asset}) · ${revealedMarket.session}`}
          >
            <span className="min-w-0 truncate text-[var(--term-soft)]">
              <span className="uppercase tracking-wider text-[var(--term-muted)]">Market </span>
              <strong className="text-[var(--term-strong)]">{revealedMarket.title}</strong>
            </span>
            <span className="shrink-0 font-mono text-[var(--term-muted)]">{revealedMarket.asset}</span>
          </div>

          {/* Executions, collapsed by default */}
          {userTrades.length > 0 && (
            <details className="group rounded-lg border border-[var(--term-border)] bg-[var(--term-panel-deep)]">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--term-soft)]">
                <span>Executions ({userTrades.length})</span>
                <ChevronDown size={12} className="text-[var(--term-muted)] transition-transform group-open:rotate-180" />
              </summary>
              <div className="max-h-32 space-y-1 overflow-y-auto border-t border-[var(--term-border)] p-2 font-mono text-[10px]">
                {userTrades.map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 rounded border border-[var(--term-border)] bg-[var(--term-panel)] px-2 py-1">
                    <div className="min-w-0 truncate">
                      <span className={t.direction === 'long' ? 'font-bold text-[var(--term-buy)]' : 'font-bold text-[var(--term-sell)]'}>
                        {t.direction.toUpperCase()} x{t.size}
                      </span>{' '}
                      <span className="text-[var(--term-soft)]">
                        {t.entryTick}→{t.exitTick}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full border border-[var(--term-border)] bg-[var(--term-raised)] px-1.5 py-0.5 text-[9px] uppercase text-[var(--term-soft)]">{t.reason}</span>
                      <span className={t.pnl >= 0 ? 'font-bold text-[var(--term-buy)]' : 'font-bold text-[var(--term-sell)]'}>
                        {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Actions */}
          <div className="grid grid-cols-3 gap-2 pt-0.5">
            <button
              onClick={onRematch}
              className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-opacity hover:opacity-95"
              style={{ background: 'linear-gradient(315deg, var(--term-buy-3) 0%, var(--term-buy-bright) 100%)', color: 'var(--term-canvas)' }}
            >
              <RotateCcw size={12} className="stroke-[2.5]" /> Rematch
            </button>

            <button
              onClick={handleShare}
              className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[var(--term-border)] bg-[var(--term-raised)] text-[10px] font-bold uppercase tracking-wider text-[var(--term-strong)] transition-colors hover:border-[var(--term-border-hi)]"
            >
              {copied ? <Check size={12} className="text-[var(--term-buy)]" /> : <Share2 size={12} />}
              {copied ? 'Copied' : 'Share'}
            </button>

            <Link
              href="/play"
              className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--term-border)] bg-[var(--term-panel-deep)] text-[10px] font-bold uppercase tracking-wider text-[var(--term-soft)] transition-colors hover:text-[var(--term-strong)]"
            >
              <Home size={12} /> Lobby
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
