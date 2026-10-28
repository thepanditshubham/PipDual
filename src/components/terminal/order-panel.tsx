'use client';

import { useState } from 'react';
import { ALLOWED_SIZES, NOTIONAL_PER_SIZE } from '@/lib/engine/constants';
import type { AllowedSize } from '@/lib/engine/constants';
import type { Position } from '@/lib/engine/types';
import { AlertTriangle, Check, Layers, ChevronDown } from 'lucide-react';

interface OrderPanelProps {
  currentPrice: number;
  position: Position | null;
  pendingAction: boolean;
  /** Entries already submitted this match */
  ordersPlaced: number;
  /** Per-match entry cap */
  maxOrders: number;
  onBuy: (size: AllowedSize, slPct?: number, tpPct?: number) => void;
  onSell: (size: AllowedSize, slPct?: number, tpPct?: number) => void;
  onClose: () => void;
  onReverse: () => void;
  /** Bracket levels, expressed as a percentage from entry (0 clears the level) */
  onSlChange: (slPct: number) => void;
  onTpChange: (tpPct: number) => void;
  disabled?: boolean;
}

export function OrderPanel({
  currentPrice,
  position,
  pendingAction,
  ordersPlaced,
  maxOrders,
  onBuy,
  onSell,
  onClose,
  onReverse,
  onSlChange,
  onTpChange,
  disabled = false,
}: OrderPanelProps) {
  const [selectedSize, setSelectedSize] = useState<AllowedSize>(1);
  const [warningMsg, setWarningMsg] = useState<string>('');

  const ordersLeft = Math.max(0, maxOrders - ordersPlaced);
  const outOfOrders = ordersLeft === 0;

  const showWarning = (msg: string) => {
    setWarningMsg(msg);
    setTimeout(() => setWarningMsg(''), 2500);
  };

  const handleBuy = () => {
    if (disabled || pendingAction) {
      showWarning('Battle not live yet');
      return;
    }
    if (outOfOrders) {
      showWarning(`Order limit reached (${maxOrders} per duel)`);
      return;
    }
    onBuy(selectedSize);
  };

  const handleSell = () => {
    if (disabled || pendingAction) {
      showWarning('Battle not live yet');
      return;
    }
    if (outOfOrders) {
      showWarning(`Order limit reached (${maxOrders} per duel)`);
      return;
    }
    onSell(selectedSize);
  };

  const handleReverse = () => {
    if (outOfOrders) {
      showWarning(`Order limit reached (${maxOrders} per duel)`);
      return;
    }
    onReverse();
  };

  const unrealisedPnl = position
    ? (position.direction === 'long' ? 1 : -1) *
    ((currentPrice - position.entryPrice) / position.entryPrice) *
    position.size *
    NOTIONAL_PER_SIZE
    : 0;

  // Bracket inputs work in price, not percentage: the trader types the level
  // they actually want and we convert it against the entry.
  const bracketLong = position?.direction === 'long';
  const slPriceStr =
    position?.slPct
      ? (bracketLong
          ? position.entryPrice * (1 - position.slPct / 100)
          : position.entryPrice * (1 + position.slPct / 100)
        ).toFixed(2)
      : '';
  const tpPriceStr =
    position?.tpPct
      ? (bracketLong
          ? position.entryPrice * (1 + position.tpPct / 100)
          : position.entryPrice * (1 - position.tpPct / 100)
        ).toFixed(2)
      : '';
  // Re-keying the inputs whenever the level changes keeps them in sync with
  // chart-line drags without fighting the user while they type.
  const bracketSig = position
    ? `${position.entryPrice}-${position.direction}-${position.slPct ?? 0}-${position.tpPct ?? 0}`
    : 'flat';

  const commitBracket = (kind: 'sl' | 'tp', raw: string) => {
    const value = raw.trim();
    if (!position) return;
    if (value === '') {
      if (kind === 'sl') onSlChange(0);
      else onTpChange(0);
      return;
    }
    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0) {
      showWarning('Enter a valid price');
      return;
    }
    if (kind === 'sl' && (bracketLong ? price >= position.entryPrice : price <= position.entryPrice)) {
      showWarning(bracketLong ? 'Stop loss must be below entry' : 'Stop loss must be above entry');
      return;
    }
    if (kind === 'tp' && (bracketLong ? price <= position.entryPrice : price >= position.entryPrice)) {
      showWarning(bracketLong ? 'Take profit must be above entry' : 'Take profit must be below entry');
      return;
    }
    const pct = Math.min(10, Math.max(0.01, Math.abs((price - position.entryPrice) / position.entryPrice) * 100));
    if (kind === 'sl') onSlChange(pct);
    else onTpChange(pct);
  };

  const spread = currentPrice * 0.00003;
  const bidPrice = (currentPrice - spread).toFixed(2);
  const askPrice = (currentPrice + spread).toFixed(2);
  const isDisabled = disabled || pendingAction;

  return (
    <div className="flex flex-col select-none text-xs bg-[#131417] text-[#d1d4dc] border-b border-[#1f2229]">
      {/* ── TopstepX Header: [⚡] Order ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1f2229] bg-[#111215]">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-extrabold bg-[#2962ff]/20 text-[#2962ff] border border-[#2962ff]/40">
            H
          </span>
          <span className="font-bold text-xs uppercase tracking-wider text-[#d1d4dc]">
            Order
          </span>
        </div>
        {pendingAction ? (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#f23645]/15 border border-[#f23645]/30 text-[#f23645] animate-pulse">
            Filling…
          </span>
        ) : (
          <span
            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
              outOfOrders
                ? 'bg-[#f23645]/15 border-[#f23645]/30 text-[#f23645]'
                : 'bg-[#181a20] border-[#22252c] text-[#787b86]'
            }`}
            title={`Entry orders used this match (max ${maxOrders})`}
          >
            Orders {ordersPlaced}/{maxOrders}
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2.5">
        {/* Warning Notification */}
        {warningMsg && (
          <div className="p-2 rounded text-[11px] flex items-center gap-1.5 bg-[#f23645]/10 border border-[#f23645]/20 text-[#f23645] animate-fade-in">
            <AlertTriangle size={13} className="shrink-0" />
            <span>{warningMsg}</span>
          </div>
        )}

        {/* ── TopstepX Row 1: Order Type ── */}
        <div>
          <div className="text-[10px] font-semibold text-[#787b86] mb-1 uppercase tracking-wide">
            Order Type
          </div>
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#181a20] border border-[#22252c] text-xs font-semibold text-[#d1d4dc]">
            <span>Market</span>
            <ChevronDown size={12} className="text-[#6c7080]" />
          </div>
        </div>

        {/* ── TopstepX Row 2: # of Contracts ── */}
        <div>
          <div className="text-[10px] font-semibold text-[#787b86] mb-1 uppercase tracking-wide">
            # of Contracts
          </div>
          <div className="flex items-center rounded border border-[#22252c] bg-[#181a20] overflow-hidden">
            <button
              onClick={() => {
                const idx = ALLOWED_SIZES.indexOf(selectedSize);
                if (idx > 0) setSelectedSize(ALLOWED_SIZES[idx - 1]);
              }}
              className="px-3 py-1.5 text-sm font-bold text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#22252c] transition-colors"
            >
              −
            </button>
            <span className="flex-1 font-mono font-extrabold text-sm text-center text-[#d1d4dc]">
              {selectedSize}
            </span>
            <button
              onClick={() => {
                const idx = ALLOWED_SIZES.indexOf(selectedSize);
                if (idx < ALLOWED_SIZES.length - 1) setSelectedSize(ALLOWED_SIZES[idx + 1]);
              }}
              className="px-3 py-1.5 text-sm font-bold text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#22252c] transition-colors"
            >
              +
            </button>
          </div>
        </div>

        {/* ── TopstepX Quick Quantity Presets ── */}
        <div className="flex items-center gap-1.5">
          {ALLOWED_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => setSelectedSize(size)}
              className={`flex-1 h-7 rounded font-mono font-bold text-xs transition-all ${selectedSize === size
                  ? 'bg-[#2962ff] text-white shadow-sm'
                  : 'bg-[#181a20] border border-[#22252c] text-[#787b86] hover:text-[#d1d4dc] hover:border-[#2a2e39]'
                }`}
            >
              {size}
            </button>
          ))}
        </div>

        {/* ── TopstepX Bid / Last / Ask Readout ── */}
        <div className="grid grid-cols-3 text-center py-1.5 px-2 rounded bg-[#181a20] border border-[#22252c] my-0.5">
          <div>
            <div className="text-[9px] text-[#787b86] uppercase">Bid</div>
            <div className="font-mono text-[11px] font-bold text-[#089981] tabular-nums">
              {bidPrice}
            </div>
          </div>
          <div className="border-x border-[#22252c]">
            <div className="text-[9px] text-[#787b86] uppercase">Last</div>
            <div className="font-mono text-xs font-extrabold text-[#d1d4dc] tabular-nums">
              {currentPrice.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-[#787b86] uppercase">Ask</div>
            <div className="font-mono text-[11px] font-bold text-[#f23645] tabular-nums">
              {askPrice}
            </div>
          </div>
        </div>

        {/* ── TopstepX Position & UP&L Bar ── */}
        <div className="p-2 rounded bg-[#181a20] border border-[#22252c] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${position
                  ? position.direction === 'long'
                    ? 'bg-[#089981] animate-pulse'
                    : 'bg-[#f23645] animate-pulse'
                  : 'bg-[#6c7080]'
                }`}
            />
            <span className="font-mono font-bold text-xs text-[#d1d4dc]">
              {position
                ? `${position.direction === 'long' ? '+' : '-'}${position.size} @ ${position.entryPrice.toFixed(2)}`
                : 'Flat'}
            </span>
          </div>
          <div className="font-mono font-extrabold text-xs tabular-nums">
            {position ? (
              <span style={{ color: unrealisedPnl >= 0 ? '#089981' : '#f23645' }}>
                UP&L {unrealisedPnl >= 0 ? '+' : ''}${unrealisedPnl.toFixed(2)}
              </span>
            ) : (
              <span className="text-[#6c7080]">UP&L $0.00</span>
            )}
          </div>
        </div>

        {/* ── Bracket by price: type the level, we convert it to a % from entry ── */}
        <div className="grid grid-cols-2 gap-1.5">
          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-[#787b86]">
              <span>Stop Loss</span>
              <span className="font-mono text-[9px] normal-case text-[#6c7080]">
                {position?.slPct ? `${position.slPct.toFixed(2)}%` : 'off'}
              </span>
            </span>
            <input
              key={`sl-${bracketSig}`}
              type="text"
              inputMode="decimal"
              defaultValue={slPriceStr}
              disabled={!position || isDisabled}
              placeholder={position ? 'price' : '—'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitBracket('sl', e.currentTarget.value);
                  e.currentTarget.blur();
                }
              }}
              onBlur={(e) => commitBracket('sl', e.currentTarget.value)}
              style={{ borderColor: 'rgba(242,54,69,0.4)', color: '#f23645' }}
              className="w-full min-w-0 rounded border bg-[#181a20] px-2 py-1 font-mono text-xs font-bold tabular-nums outline-none placeholder:font-normal placeholder:text-[#6c7080] focus:border-current disabled:opacity-40"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-[#787b86]">
              <span>Take Profit</span>
              <span className="font-mono text-[9px] normal-case text-[#6c7080]">
                {position?.tpPct ? `${position.tpPct.toFixed(2)}%` : 'off'}
              </span>
            </span>
            <input
              key={`tp-${bracketSig}`}
              type="text"
              inputMode="decimal"
              defaultValue={tpPriceStr}
              disabled={!position || isDisabled}
              placeholder={position ? 'price' : '—'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitBracket('tp', e.currentTarget.value);
                  e.currentTarget.blur();
                }
              }}
              onBlur={(e) => commitBracket('tp', e.currentTarget.value)}
              style={{ borderColor: 'rgba(8,153,129,0.4)', color: '#0ecb81' }}
              className="w-full min-w-0 rounded border bg-[#181a20] px-2 py-1 font-mono text-xs font-bold tabular-nums outline-none placeholder:font-normal placeholder:text-[#6c7080] focus:border-current disabled:opacity-40"
            />
          </label>
        </div>

        {/* ── TopstepX Big Direct Action Buttons ── */}
        <div className="space-y-1.5 pt-1">
          <button
            onClick={handleBuy}
            disabled={isDisabled}
            aria-disabled={outOfOrders}
            className={`w-full py-2.5 rounded font-extrabold text-xs uppercase tracking-wider transition-all disabled:opacity-30 cursor-pointer text-white shadow-sm flex items-center justify-center gap-1.5 bg-[#089981] hover:brightness-110 active:scale-[0.99] ${
              outOfOrders ? 'opacity-40' : ''
            }`}
          >
            BUY +{selectedSize} @ MARKET
          </button>

          <button
            onClick={handleSell}
            disabled={isDisabled}
            aria-disabled={outOfOrders}
            className={`w-full py-2.5 rounded font-extrabold text-xs uppercase tracking-wider transition-all disabled:opacity-30 cursor-pointer text-white shadow-sm flex items-center justify-center gap-1.5 bg-[#f23645] hover:brightness-110 active:scale-[0.99] ${
              outOfOrders ? 'opacity-40' : ''
            }`}
          >
            SELL −{selectedSize} @ MARKET
          </button>
        </div>

        {/* ── TopstepX Action Stack (Close, Reverse, Flatten) ── */}
        <div className="space-y-1.5 pt-1">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={onClose}
              disabled={isDisabled || !position}
              className="py-1.5 rounded text-xs font-bold uppercase bg-[#181a20] hover:bg-[#22252c] text-[#d1d4dc] border border-[#22252c] disabled:opacity-30 transition-colors cursor-pointer"
            >
              Close Position
            </button>
            <button
              onClick={handleReverse}
              disabled={isDisabled || !position}
              className={`py-1.5 rounded text-xs font-bold uppercase bg-[#181a20] hover:bg-[#22252c] text-[#d1d4dc] border border-[#22252c] disabled:opacity-30 transition-colors cursor-pointer ${
                outOfOrders ? 'opacity-40' : ''
              }`}
            >
              Reverse
            </button>
          </div>

          <button
            onClick={onClose}
            disabled={isDisabled || !position}
            className="w-full py-1.5 rounded text-[11px] font-bold uppercase tracking-wider bg-[#181a20] hover:bg-[#22252c] text-[#787b86] hover:text-[#d1d4dc] border border-[#22252c] disabled:opacity-30 transition-colors cursor-pointer"
          >
            Flatten All
          </button>
        </div>
      </div>
    </div>
  );
}
