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
  const pnlColor = isProfit ? '#089981' : '#f23645';

  return (
    <div className="flex-1 select-none text-xs bg-[#131417] text-[#d1d4dc] border-t border-[#1f2229] p-3">
      {/* ── Section header ── */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1f2229]">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#787b86]">
          Rival Arena Duel
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${connected ? 'animate-pulse' : ''}`}
            style={{ background: connected ? '#089981' : '#f23645' }}
          />
          <span className="text-[11px] text-[#787b86]">
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* ── Rival identity row ── */}
      <div className="flex items-center gap-2 mb-2.5">
        <div
          className="w-7 h-7 rounded flex items-center justify-center font-bold text-xs shrink-0"
          style={{
            background: isBot ? 'rgba(41,98,255,0.12)' : 'rgba(242,54,69,0.12)',
            border: `1px solid ${isBot ? 'rgba(41,98,255,0.3)' : 'rgba(242,54,69,0.3)'}`,
            color: isBot ? '#2962ff' : '#f23645',
          }}
        >
          {isBot ? <Bot size={13} /> : name.slice(0, 2).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-semibold text-sm text-[#d1d4dc] truncate">{name}</span>
            {isBot && (
              <span className="text-[9px] font-bold px-1 py-px rounded bg-[#2962ff]/15 border border-[#2962ff]/30 text-[#2962ff]">
                BOT
              </span>
            )}
          </div>
          <div className="font-mono text-[10px] text-[#6c7080]">
            {rating} ELO
          </div>
        </div>

        {inTrade ? (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#089981]/15 border border-[#089981]/30 text-[#089981] animate-pulse">
            <Activity size={10} /> In Trade
          </span>
        ) : (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#181a20] border border-[#1f2229] text-[#6c7080]">
            Flat
          </span>
        )}
      </div>

      {/* ── Metrics grid ── */}
      <div className="rounded border border-[#1f2229] bg-[#181a20] mb-2.5 overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-[#1f2229]">
          <div className="px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#6c7080] mb-0.5">Rival P&L</div>
            <div className="font-mono font-extrabold text-sm tabular-nums flex items-center gap-1" style={{ color: pnlColor }}>
              {isProfit ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {isProfit ? '+' : ''}${livePnl.toFixed(2)}
            </div>
          </div>
          <div className="px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-[#6c7080] mb-0.5">Equity</div>
            <div className="font-mono font-extrabold text-sm text-[#d1d4dc] tabular-nums">
              ${equity.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Equity Sparkline ── */}
      {sparkPoints && (
        <div>
          <div className="flex items-center justify-between mb-1 text-[#6c7080]">
            <span className="text-[10px] uppercase tracking-wider">Equity Curve</span>
            <span className="font-mono text-[10px]">${equity.toFixed(0)}</span>
          </div>
          <div className="rounded border border-[#1f2229] bg-[#181a20] p-1">
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
