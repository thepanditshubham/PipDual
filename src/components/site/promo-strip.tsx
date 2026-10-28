'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';

/**
 * The one-line promo strip above the navigation.
 *
 * Same construction as the reference site's banner: a warm near-black gradient,
 * a boxed kicker, gold name, one sentence and an underlined call to action, with
 * a close button pinned to the right. It sits inside the sticky top block, so the
 * navigation parks under it and both scroll away together.
 *
 * Dismissal is stored on the device. It is read through useSyncExternalStore
 * rather than an effect, so the server can render the strip without React
 * complaining about state set during an effect — and without a hydration flash.
 */

const KEY = 'pip-duel-promo-dismissed';
const listeners = new Set<() => void>();
let cached: boolean | null = null;

function read(): boolean {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') return false;
  try {
    cached = window.localStorage.getItem(KEY) === '1';
  } catch {
    cached = false;
  }
  return cached;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function dismiss() {
  cached = true;
  try {
    window.localStorage.setItem(KEY, '1');
  } catch {
    // Storage blocked: the dismissal still holds for this page view.
  }
  listeners.forEach((listener) => listener());
}

export function PromoStrip() {
  const hidden = useSyncExternalStore(subscribe, read, () => false);
  if (hidden) return null;

  return (
    <div className="promo">
      <span className="promo-badge">New</span>

      <p className="promo-text">
        <span className="promo-long">
          <strong>Affiliate</strong> — earn a share of the platform fee from every trader you bring.
          Paid out of the house cut, never from the pot.
        </span>
        <span className="promo-short">
          <strong>Affiliate</strong> — earn from the house fee.
        </span>{' '}
        <Link href="/affiliate" className="promo-cta">
          Explore the programme →
        </Link>
      </p>

      <button type="button" className="promo-close" onClick={dismiss} aria-label="Dismiss announcement">
        ×
      </button>
    </div>
  );
}
