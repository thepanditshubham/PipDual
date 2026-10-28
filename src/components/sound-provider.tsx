'use client';

import { useEffect, useRef } from 'react';
import { sound } from '@/components/terminal/sound';

/**
 * Global SoundProvider that wires tactical hover and click audio
 * across all interactive buttons, links, and clickable UI elements.
 */
export function SoundProvider({ children }: { children: React.ReactNode }) {
  const lastHoveredElementRef = useRef<Element | null>(null);

  useEffect(() => {
    // 1. Unlock Web Audio Context on first user gesture (touch, click, key)
    const handleFirstGesture = () => {
      sound.unlock();
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
    window.addEventListener('pointerdown', handleFirstGesture, { passive: true });
    window.addEventListener('keydown', handleFirstGesture, { passive: true });

    // Helper: Find closest interactive element
    const findInteractive = (el: EventTarget | null): HTMLElement | null => {
      if (!el || !(el instanceof HTMLElement)) return null;
      return el.closest<HTMLElement>(
        'button, a, [role="button"], input[type="submit"], input[type="button"], input[type="checkbox"], input[type="radio"], summary, [data-clickable="true"]'
      );
    };

    // 2. Global Hover Sound
    const handleMouseOver = (e: MouseEvent) => {
      const target = findInteractive(e.target);
      if (!target) {
        lastHoveredElementRef.current = null;
        return;
      }

      // Do not re-trigger if hovering over children of the same button
      if (lastHoveredElementRef.current === target) return;
      lastHoveredElementRef.current = target;

      // Check if disabled
      if (
        target.hasAttribute('disabled') ||
        target.getAttribute('aria-disabled') === 'true' ||
        target.classList.contains('disabled')
      ) {
        return;
      }

      sound.playHover();
    };

    window.addEventListener('mouseover', handleMouseOver, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      window.removeEventListener('mouseover', handleMouseOver);
    };
  }, []);

  return <>{children}</>;
}
