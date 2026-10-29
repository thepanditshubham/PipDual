'use client';

/**
 * mobile-order-dock.tsx
 * The arena's whole ticket on a phone, kept to one compact block at the bottom
 * of the screen: a strip naming the rival and the seat holding it, a row of
 * lot-size chips, then two flat BUY / SELL buttons. Tapping a side sends a
 * market order at the chip that is lit. Desktop keeps the full OrderPanel.
 */
import { useState } from 'react';
import { ALLOWED_SIZES } from '@/lib/engine/constants';
import type { AllowedSize } from '@/lib/engine/constants';
import type { Position } from '@/lib/engine/types';

interface MobileOrderDockProps {
  digits: number;
  currentPrice: number;
  position: Position | null;
  pendingAction: boolean;
  /** Entries already submitted this match */
  ordersPlaced: number;
  /** Per-match entry cap */
  maxOrders: number;
  rivalName: string;
  /** The rival's rating, printed beside their name on the strip. */
  rivalRating: number;
  /** The rival's live P&L, as the old sidebar used to show it. */
  rivalPnl: number;
  onBuy: (size: AllowedSize) => void;
  onSell: (size: AllowedSize) => void;
  onClose: () => void;
  onReverse: () => void;
  disabled?: boolean;
}

/** ±$12.30, or $0.00 when flat. */
function money(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function MobileOrderDock({
  digits,
  currentPrice,
  position,
  pendingAction,
  ordersPlaced,
  maxOrders,
  rivalName,
  rivalRating,
  rivalPnl,
  onBuy,
  onSell,
  onClose,
  onReverse,
  disabled = false,
}: MobileOrderDockProps) {
  const [selectedSize, setSelectedSize] = useState<AllowedSize>(1);

  const ordersLeft = Math.max(0, maxOrders - ordersPlaced);
  const outOfOrders = ordersLeft === 0;
  const isDisabled = disabled || pendingAction || outOfOrders;

  // Same spread the desktop ticket quotes.
  const spread = currentPrice * 0.00003;
  const bid = (currentPrice - spread).toFixed(digits);
  const ask = (currentPrice + spread).toFixed(digits);
  const rivalInitials = (rivalName.trim().slice(0, 2) || 'RT').toUpperCase();

  return (
    <div className="md:hidden shrink-0 border-t border-[var(--term-border)] bg-[var(--term-surface)] pb-[env(safe-area-inset-bottom)]">
      {/* Strip — the rival's identity and result, then the seat holding it */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--term-border)] px-3 py-1 text-[10px] font-mono">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className="shrink-0 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--term-muted)]"
            title="Opponent"
          >
            vs
          </span>
          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-[2px] bg-[var(--term-raised)] text-[8px] font-bold text-[var(--term-label)] ring-1 ring-[var(--term-border-hi)]">
            {rivalInitials}
          </span>
          <span className="truncate font-bold text-[var(--term-text)]" title={rivalName}>
            {rivalName}
          </span>
          <span className="shrink-0 text-[var(--term-dim)]">{rivalRating}</span>
          <span
            className={`shrink-0 font-bold tabular-nums ${
              rivalPnl > 0
                ? 'text-[var(--term-buy)]'
                : rivalPnl < 0
                  ? 'text-[var(--term-sell)]'
                  : 'text-[var(--term-text)]'
            }`}
            title="Rival P&L"
          >
            {money(rivalPnl)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={`tabular-nums ${
              outOfOrders ? 'text-[var(--term-sell)]' : 'text-[var(--term-dim)]'
            }`}
            title={`Entry orders used this match (max ${maxOrders})`}
          >
            {pendingAction ? 'filling…' : `${ordersLeft}/${maxOrders}`}
          </span>
        </span>
      </div>

      {/* Lot size — four chips instead of a stepper */}
      <div className="flex items-center gap-1.5 px-2 pt-1.5">
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--term-muted)]">
          Lots
        </span>
        {ALLOWED_SIZES.map((size) => {
          const active = selectedSize === size;
          return (
            <button
              key={size}
              type="button"
              onClick={() => setSelectedSize(size)}
              disabled={disabled}
              aria-label={`Set lot size ${size}`}
              className={`h-6 flex-1 rounded border font-mono text-[11px] font-bold tabular-nums transition-colors disabled:opacity-40 ${
                active
                  ? 'border-[var(--term-primary)] bg-[var(--term-primary)]/12 text-[var(--term-strong)]'
                  : 'border-[var(--term-border)] bg-[var(--term-raised)] text-[var(--term-label)]'
              }`}
            >
              {size}
            </button>
          );
        })}
        {position && (
          <span
            className={`shrink-0 pl-1 text-[9px] font-bold uppercase tracking-wider ${
              position.direction === 'long' ? 'text-[var(--term-buy)]' : 'text-[var(--term-sell)]'
            }`}
          >
            {position.direction === 'long' ? 'Long' : 'Short'} {position.size}
          </span>
        )}
      </div>

      {/* Two flat tickets: label on top, price and size under it */}
      <div className="flex items-stretch gap-1.5 px-2 pt-1.5 pb-2">
        <button
          type="button"
          onClick={() => onSell(selectedSize)}
          disabled={isDisabled}
          aria-label={`Sell ${selectedSize} lots at market`}
          className="flex h-12 flex-1 flex-col items-center justify-center rounded-md bg-[var(--term-sell)] text-[var(--term-canvas)] transition-transform active:scale-[0.99] disabled:opacity-40"
        >
          <span className="text-[9px] font-black uppercase leading-none tracking-[0.16em] opacity-80">
            Sell
          </span>
          <span className="mt-0.5 font-mono text-[11px] font-black leading-none tabular-nums">
            {bid} · {selectedSize}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onBuy(selectedSize)}
          disabled={isDisabled}
          aria-label={`Buy ${selectedSize} lots at market`}
          className="flex h-12 flex-1 flex-col items-center justify-center rounded-md bg-[var(--term-buy)] text-[var(--term-canvas)] transition-transform active:scale-[0.99] disabled:opacity-40"
        >
          <span className="text-[9px] font-black uppercase leading-none tracking-[0.16em] opacity-80">
            Buy
          </span>
          <span className="mt-0.5 font-mono text-[11px] font-black leading-none tabular-nums">
            {ask} · {selectedSize}
          </span>
        </button>

        {position && (
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={disabled}
              title="Close the open position"
              className="h-12 w-14 shrink-0 rounded-md border border-[var(--term-border)] bg-[var(--term-raised)] text-[9px] font-bold uppercase leading-tight tracking-wider text-[var(--term-text)] active:bg-[var(--term-border)] disabled:opacity-40"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onReverse}
              disabled={isDisabled}
              title="Flip the position to the other side"
              className="h-12 w-14 shrink-0 rounded-md border border-[var(--term-border)] bg-[var(--term-raised)] text-[9px] font-bold uppercase leading-tight tracking-wider text-[var(--term-label)] active:bg-[var(--term-border)] disabled:opacity-40"
            >
              Rev
            </button>
          </>
        )}
      </div>
    </div>
  );
}
