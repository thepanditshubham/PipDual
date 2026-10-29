'use client';

import { Bot, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { START_BALANCE } from '@/lib/engine/constants';

interface RivalPanelProps {
  name: string;
  rating: number;
  isBot?: boolean;
  livePnl: number;
  equity: number;
  inTrade: boolean;
  equityHistory: number[];
  connected: boolean;
}

export function RivalPanel({
  name,
  rating,
  isBot = false,
  livePnl,
  equity,
  inTrade,
  equityHistory,
  connected,
}: RivalPanelProps) {
  // Build sparkline SVG points
  const sparkPoints = (() => {
    if (equityHistory.length < 2) return '';
    const min = Math.min(...equityHistory, START_BALANCE - 200);
    const max = Math.max(...equityHistory, START_BALANCE + 200);
    const range = max - min || 1;
    const w = 240, h = 32;
    return equityHistory
      .map((val, i) => {
        const x = (i / (equityHistory.length - 1)) * w;
        const y = h - ((val - min) / range) * h;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  })();

  const isProfit = livePnl >= 0;
  const pnlColor = isProfit ? 'var(--term-buy)' : 'var(--term-sell)';

  return (
    <div className="flex-1 select-none text-xs bg-[var(--term-surface)] text-[var(--term-text)] border-t border-[var(--term-border)] p-3">
      {/* ── Section header ── */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--term-border)]">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--term-label)]">
          Rival Arena Duel
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${connected ? 'animate-pulse' : ''}`}
            style={{ background: connected ? 'var(--term-buy)' : 'var(--term-sell)' }}
          />
          <span className="text-[11px] text-[var(--term-label)]">
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* ── Rival identity row ── */}
      <div className="flex items-center gap-2 mb-2.5">
        <div
          className="w-7 h-7 rounded flex items-center justify-center font-bold text-xs shrink-0"
          style={{
            background: isBot
              ? 'color-mix(in srgb, var(--term-accent) 12%, transparent)'
              : 'color-mix(in srgb, var(--term-sell) 12%, transparent)',
            border: `1px solid ${
              isBot
                ? 'color-mix(in srgb, var(--term-accent) 30%, transparent)'
                : 'color-mix(in srgb, var(--term-sell) 30%, transparent)'
            }`,
            color: isBot ? 'var(--term-accent)' : 'var(--term-sell)',
          }}
        >
          {isBot ? <Bot size={13} /> : name.slice(0, 2).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-semibold text-sm text-[var(--term-strong)] truncate">{name}</span>
            {isBot && (
              <span className="text-[9px] font-bold px-1 py-px rounded bg-[var(--term-accent)]/15 border border-[var(--term-accent)]/30 text-[var(--term-accent)]">
                BOT
              </span>
            )}
          </div>
          <div className="font-mono text-[10px] text-[var(--term-muted)]">
            {rating} ELO
          </div>
        </div>

        {inTrade ? (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--term-buy)]/15 border border-[var(--term-buy)]/30 text-[var(--term-buy)] animate-pulse">
            <Activity size={10} /> In Trade
          </span>
        ) : (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--term-raised)] border border-[var(--term-border)] text-[var(--term-muted)]">
            Flat
          </span>
        )}
      </div>

      {/* ── Metrics grid ── */}
      <div className="rounded border border-[var(--term-border)] bg-[var(--term-raised)] mb-2.5 overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-[var(--term-border)]">
          <div className="px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--term-muted)] mb-0.5">Rival P&L</div>
            <div className="font-mono font-extrabold text-sm tabular-nums flex items-center gap-1" style={{ color: pnlColor }}>
              {isProfit ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {isProfit ? '+' : ''}${livePnl.toFixed(2)}
            </div>
          </div>
          <div className="px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--term-muted)] mb-0.5">Equity</div>
            <div className="font-mono font-extrabold text-sm text-[var(--term-strong)] tabular-nums">
              ${equity.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Equity Sparkline ── */}
      {sparkPoints && (
        <div>
          <div className="flex items-center justify-between mb-1 text-[var(--term-muted)]">
            <span className="text-[10px] uppercase tracking-wider">Equity Curve</span>
            <span className="font-mono text-[10px]">${equity.toFixed(0)}</span>
          </div>
          <div className="rounded border border-[var(--term-border)] bg-[var(--term-raised)] p-1">
            <svg viewBox="0 0 240 32" className="w-full h-7" aria-hidden="true">
              <polyline
                fill="none"
                stroke={pnlColor}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={sparkPoints}
              />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
