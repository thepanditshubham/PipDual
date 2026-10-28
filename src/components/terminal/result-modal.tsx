'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trophy, Share2, RotateCcw, Home, Check, Swords, Shield, ExternalLink, Zap, Coins } from 'lucide-react';
import type { ScoreResult, Trade } from '@/lib/engine/types';
import type { RewardPacket } from '@/lib/progress/types';
import { netFor, type DuelOutcome } from '@/lib/economy';

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
    seed: number;
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
  forfeitWinner,
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
        // Fallback to copy link
        copyToClipboard();
      }
    } else {
      copyToClipboard();
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(
      `Pip Duel Match Result: ${won ? 'I WON' : 'Match settled'} with $${userScore.pnl} P&L against ${rivalName}! Play here: ${window.location.origin}/play`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Build dual equity overlay SVG curves
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
    : `Verified By Server Engine • ${battleSeconds}s Replay Day`;

  // Live pot bookkeeping for the panel: entry is spent, collected is what landed.
  const potOutcome: DuelOutcome = won ? 'win' : isDraw ? 'draw' : 'loss';
  const showPot = Boolean(pot && pot.stake > 0);
  const potStake = pot?.stake ?? 0;
  const potPayout = pot?.payout ?? 0;
  const potNet = netFor(potOutcome, potStake);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-[#151314] border border-[#2f2c2d] rounded-2xl shadow-2xl overflow-hidden my-8 animate-slide-up">
        {/* Banner */}
        <div
          className={`p-6 text-center border-b ${
            won
              ? 'bg-gradient-to-b from-[#057a55]/20 to-transparent border-[#057a55]/40 text-emerald-400'
              : isDraw
                ? 'bg-gradient-to-b from-[#9262f9]/20 to-transparent border-[#9262f9]/40 text-purple-300'
                : 'bg-gradient-to-b from-rose-500/20 to-transparent border-rose-500/40 text-rose-400'
          }`}
        >
          <div
            className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center border mb-3 shadow-lg ${
              won
                ? 'bg-[#151314] border-emerald-500/50 text-emerald-400 shadow-emerald-500/10'
                : isDraw
                  ? 'bg-[#151314] border-purple-500/50 text-purple-400 shadow-purple-500/10'
                  : 'bg-[#151314] border-rose-500/50 text-rose-400 shadow-rose-500/10'
            }`}
          >
            <Trophy size={32} />
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold uppercase tracking-tight text-white">
            {bannerTitle}
          </h2>
          <p className="text-xs uppercase tracking-widest text-[#c3c1c1] mt-1 font-medium">
            {bannerSubtitle}
          </p>
        </div>

        <div className="p-6 md:p-8 space-y-6">
          {/* Live pot: what the entry cost and what the arena paid out */}
          {showPot && (
            <div className="bg-[#100e0f] border border-[#f59e0b]/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#c3c1c1] flex items-center gap-1.5">
                  <Coins size={12} className="text-[#f59e0b]" /> Live Pot
                </span>
                <span className="text-[10px] font-mono text-[#7a7878]">
                  {isDraw ? 'Draw — entries refunded' : won ? 'Winner takes the pot' : 'Pot collected by rival'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-[#1a1819] border border-[#2f2c2d] py-2">
                  <p className="text-[10px] uppercase tracking-wider text-[#7a7878]">Entry</p>
                  <p className="text-sm font-bold font-mono text-rose-400">−{potStake.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-[#1a1819] border border-[#2f2c2d] py-2">
                  <p className="text-[10px] uppercase tracking-wider text-[#7a7878]">Collected</p>
                  <p className="text-sm font-bold font-mono text-[#f59e0b]">+{potPayout.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-[#1a1819] border border-[#2f2c2d] py-2">
                  <p className="text-[10px] uppercase tracking-wider text-[#7a7878]">Net</p>
                  <p
                    className={`text-sm font-bold font-mono ${
                      potNet > 0 ? 'text-emerald-400' : potNet < 0 ? 'text-rose-400' : 'text-white'
                    }`}
                  >
                    {potNet > 0 ? '+' : ''}
                    {potNet.toLocaleString()}
                  </p>
                </div>
              </div>

              <p className="text-[10px] font-mono text-[#7a7878]">
                Both entries pool, the arena burns 10%, the winner collects the rest.
              </p>
            </div>
          )}

          {/* Live settlement: XP, RP, coins and ladder movement */}
          {rewards && (
            <div className="bg-[#100e0f] border border-[#2f2c2d] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#c3c1c1] flex items-center gap-1.5">
                  <Shield size={12} className="text-[#089981]" /> Live Rewards
                </span>
                <span className="text-[10px] font-mono text-[#7a7878]">
                  {rewards.rankAfter.tierLabel}
                  {rewards.rankAfter.ceiling !== null && ` · ${rewards.rankAfter.intoDivision}/${rewards.rankAfter.needed} RP`}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-[#1a1819] border border-[#2f2c2d] py-2">
                  <p className="text-[10px] uppercase tracking-wider text-[#7a7878]">XP</p>
                  <p className="text-sm font-bold font-mono text-white">+{rewards.xp.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-[#1a1819] border border-[#2f2c2d] py-2">
                  <p className="text-[10px] uppercase tracking-wider text-[#7a7878]">RP</p>
                  <p
                    className={`text-sm font-bold font-mono ${
                      rewards.rp > 0 ? 'text-emerald-400' : rewards.rp < 0 ? 'text-rose-400' : 'text-white'
                    }`}
                  >
                    {rewards.rp > 0 ? '+' : ''}{rewards.rp}
                  </p>
                </div>
                <div className="rounded-lg bg-[#1a1819] border border-[#2f2c2d] py-2">
                  <p className="text-[10px] uppercase tracking-wider text-[#7a7878]">Coins</p>
                  <p className="text-sm font-bold font-mono text-[#f59e0b]">+{rewards.coins}</p>
                </div>
              </div>

              {(rewards.promoted ||
                rewards.demoted ||
                rewards.shielded ||
                rewards.placementDone ||
                rewards.levelAfter > rewards.levelBefore) && (
                <div className="flex flex-wrap gap-1.5">
                  {rewards.promoted && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      Promoted
                    </span>
                  )}
                  {rewards.demoted && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/40 text-[10px] font-bold uppercase tracking-wider text-rose-400">
                      Demoted
                    </span>
                  )}
                  {rewards.shielded && (
                    <span className="px-2 py-0.5 rounded-full bg-[#2962ff]/15 border border-[#2962ff]/40 text-[10px] font-bold uppercase tracking-wider text-[#6f9bff]">
                      Rank shield used
                    </span>
                  )}
                  {rewards.placementDone && (
                    <span className="px-2 py-0.5 rounded-full bg-[#f59e0b]/15 border border-[#f59e0b]/40 text-[10px] font-bold uppercase tracking-wider text-[#f59e0b]">
                      Placements complete
                    </span>
                  )}
                  {rewards.levelAfter > rewards.levelBefore && (
                    <span className="px-2 py-0.5 rounded-full bg-[#a855f7]/15 border border-[#a855f7]/40 text-[10px] font-bold uppercase tracking-wider text-[#c4a2fb]">
                      Level {rewards.levelAfter}
                    </span>
                  )}
                </div>
              )}

              {(rewards.missionIds.length > 0 || rewards.achievementIds.length > 0) && (
                <p className="text-[10px] font-mono text-[#7a7878]">
                  Progress updated: {rewards.missionIds.length} mission{rewards.missionIds.length === 1 ? '' : 's'},{' '}
                  {rewards.achievementIds.length} achievement{rewards.achievementIds.length === 1 ? '' : 's'}
                </p>
              )}

              <Link href="/play" className="text-[10px] font-mono text-[#6f9bff] hover:text-white transition-colors">
                View full progress in the lobby ›
              </Link>
            </div>
          )}

          {/* Comparison Scoreboard */}
          <div className="grid grid-cols-2 gap-4">
            {/* You */}
            <div className="bg-[#100e0f] border border-[#2f2c2d] rounded-xl p-4 text-center space-y-1 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">You (Player)</span>
              <div
                className={`text-3xl font-extrabold font-mono tabular-nums ${
                  userScore.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {userScore.pnl >= 0 ? '+' : ''}${userScore.pnl.toFixed(2)}
              </div>
              <div className="text-[11px] text-[#c3c1c1] space-y-0.5 pt-2 border-t border-[#2f2c2d]">
                <div className="flex justify-between">
                  <span>Score:</span> <strong className="text-white font-mono">{userScore.score.toFixed(2)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Max DD:</span> <strong className="text-white font-mono">${userScore.maxDrawdown.toFixed(2)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Trades:</span> <strong className="text-white font-mono">{userScore.tradeCount}</strong>
                </div>
              </div>
            </div>

            {/* Rival */}
            <div className="bg-[#100e0f] border border-[#2f2c2d] rounded-xl p-4 text-center space-y-1 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#e74694] to-[#9262f9]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#ac94fa]">{rivalName}</span>
              <div
                className={`text-3xl font-extrabold font-mono tabular-nums ${
                  rivalScore.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {rivalScore.pnl >= 0 ? '+' : ''}${rivalScore.pnl.toFixed(2)}
              </div>
              <div className="text-[11px] text-[#c3c1c1] space-y-0.5 pt-2 border-t border-[#2f2c2d]">
                <div className="flex justify-between">
                  <span>Score:</span> <strong className="text-white font-mono">{rivalScore.score.toFixed(2)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Max DD:</span> <strong className="text-white font-mono">${rivalScore.maxDrawdown.toFixed(2)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Trades:</span> <strong className="text-white font-mono">{rivalScore.tradeCount}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Overlaid Equity Curve Graph */}
          <div className="bg-[#100e0f] p-4 rounded-xl border border-[#2f2c2d] space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[#c3c1c1] font-semibold uppercase tracking-wider text-[11px]">Equity Curves Overlaid:</span>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <span className="w-2.5 h-1 rounded-full bg-emerald-400" /> You
                </span>
                <span className="flex items-center gap-1.5 text-[#e74694] font-bold">
                  <span className="w-2.5 h-1 rounded-full bg-[#e74694]" /> {rivalName}
                </span>
              </div>
            </div>

            <div className="h-28 w-full relative">
              <svg viewBox="0 0 360 100" className="w-full h-full overflow-visible" aria-hidden="true">
                {/* Horizontal midpoint reference */}
                <line x1="0" y1="50" x2="360" y2="50" stroke="#2f2c2d" strokeDasharray="3 3" />

                {/* Rival curve */}
                {rivalPath && (
                  <polyline
                    fill="none"
                    stroke="#e74694"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="4 2"
                    points={rivalPath}
                  />
                )}

                {/* User curve */}
                {userPath && (
                  <polyline
                    fill="none"
                    stroke="#84e1bc"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={userPath}
                  />
                )}
              </svg>
            </div>
          </div>

          {/* Revealed Market Info */}
          <div className="p-4 bg-[#1a1819] border border-[#2f2c2d] rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="text-[#c3c1c1] uppercase font-semibold tracking-wider block text-[10px]">
                Market Revealed:
              </span>
              <span className="text-white font-bold text-sm">{revealedMarket.title}</span>
              <span className="text-[#c3c1c1] ml-2 font-mono">({revealedMarket.asset})</span>
            </div>
            <div className="flex items-center gap-2">
              {revealedMarket.tags.map((tg) => (
                <span key={tg} className="px-2.5 py-0.5 rounded-full bg-[#151314] text-[#ac94fa] border border-[#2f2c2d] text-[10px] uppercase font-semibold">
                  {tg}
                </span>
              ))}
              <span className="text-[#7a7878] font-mono text-[10px]">Seed: #{revealedMarket.seed}</span>
            </div>
          </div>

          {/* User Trade Log Details */}
          {userTrades.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#c3c1c1]">Your Executions:</h4>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 text-xs font-mono">
                {userTrades.map((t, idx) => (
                  <div key={idx} className="p-2.5 bg-[#100e0f] rounded-lg border border-[#2f2c2d] flex justify-between items-center">
                    <div>
                      <span className={t.direction === 'long' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {t.direction.toUpperCase()} x{t.size}
                      </span>{' '}
                      <span className="text-[#c3c1c1] text-[11px]">
                        t{t.entryTick} ({t.entryPrice.toFixed(2)}) → t{t.exitTick} ({t.exitPrice.toFixed(2)})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-[#1a1819] text-[#c3c1c1] border border-[#2f2c2d]">
                        {t.reason}
                      </span>
                      <span className={t.pnl >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <button
              onClick={onRematch}
              className="py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/20 hover:opacity-95 transition-all cursor-pointer"
              style={{ background: 'linear-gradient(315deg, #057a55 0%, #84e1bc 100%)', color: '#000' }}
            >
              <RotateCcw size={14} className="stroke-[2.5]" /> Rematch
            </button>

            <button
              onClick={handleShare}
              className="py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-[#1a1819] border border-[#2f2c2d] hover:border-[#9262f9] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Share2 size={14} />}
              {copied ? 'Link Copied!' : 'Share Result'}
            </button>

            <Link
              href="/play"
              className="py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider text-[#c3c1c1] hover:text-white bg-[#100e0f] border border-[#2f2c2d] flex items-center justify-center gap-1.5 text-center transition-colors"
            >
              <Home size={14} /> Arena Lobby
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
