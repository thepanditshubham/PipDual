'use client';

/**
 * announcement-bar.tsx
 * The one-line strip above the lobby header and the menu bar — what the
 * console at /admin/announcements publishes. It is the first thing on the
 * page, so it paints from this device's cache before Supabase answers, and
 * quietly disappears if there is nothing live or the player has dismissed
 * every strip. Colours are fixed per tone instead of theme tokens, so the
 * same announcement reads identically on the marketing pages and the arena.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Megaphone, X } from 'lucide-react';
import {
  fetchLiveAnnouncements,
  readCachedAnnouncements,
  type Announcement,
  type AnnouncementTone,
} from '@/lib/supabase/announcements';

const DISMISS_KEY = 'pip-duel-ann-dismissed';
/** Rows kept for devices that dismissed a while ago; oldest fall off first. */
const DISMISS_LIMIT = 50;
/** Long enough to read a line twice, short enough that a queue keeps moving. */
const ROTATE_MS = 9000;

/**
 * bg is the strip, edge is the accent bar and icon, text is the copy. Dark
 * grounds on every tone so the bar reads as chrome, not as a button. Exported
 * so the console's preview paints the strip it is about to publish.
 */
export const TONE_STYLE: Record<AnnouncementTone, { bg: string; edge: string; text: string }> = {
  info: { bg: '#171429', edge: '#b39cff', text: '#e9e2ff' },
  promo: { bg: '#1e1826', edge: '#f0a53a', text: '#ffe7c7' },
  warn: { bg: '#1d1a12', edge: '#ffd47a', text: '#fff3c9' },
  critical: { bg: '#1e1319', edge: '#ff5f75', text: '#ffd9e0' },
};

function readDismissed(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify(ids.slice(-DISMISS_LIMIT)));
  } catch {
    // Storage full or blocked; the dismissal still holds for this page view.
  }
}

export function AnnouncementBar() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  // Hovering stops the rotation: a strip that moved under the cursor is a
  // strip nobody finished reading.
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const cached = readCachedAnnouncements();
    if (cached.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems(cached);
    }
    setDismissed(readDismissed());
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const fresh = await fetchLiveAnnouncements();
      // Null means the read was unavailable — keep showing the cached copy
      // rather than blanking a bar that was already on screen.
      if (!alive || fresh === null) return;
      setItems(fresh);
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    writeDismissed(dismissed);
  }, [dismissed]);

  const visible = useMemo(
    () => items.filter((item) => !dismissed.includes(item.id)),
    [items, dismissed],
  );

  // Clamped, because dismissing or a refresh can shrink the list under the
  // step the rotation was on.
  const index = visible.length === 0 ? 0 : Math.min(step, visible.length - 1);
  const current = visible[index] ?? null;

  useEffect(() => {
    if (visible.length < 2 || paused) return;
    const timer = setInterval(() => setStep((value) => (value + 1) % visible.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [visible.length, paused]);

  const hide = useCallback((id: string) => {
    setDismissed((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setStep(0);
  }, []);

  if (!current) return null;

  const tone = TONE_STYLE[current.tone] ?? TONE_STYLE.info;
  const href = current.linkUrl ?? '';
  const label = current.linkLabel || 'Details';
  const external = href.startsWith('http://') || href.startsWith('https://');

  return (
    <div
      role="region"
      aria-label="Arena announcements"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative flex h-9 w-full shrink-0 items-center gap-2 overflow-hidden border-b border-black/40 pl-3 pr-2 text-xs sm:pl-4 sm:pr-3"
      style={{ background: tone.bg, color: tone.text }}
    >
      {/* Tone edge — the colour a strip was published with, read at a glance */}
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tone.edge }} aria-hidden="true" />

      <Megaphone size={13} className="shrink-0" style={{ color: tone.edge }} />

      <p key={current.id} className="min-w-0 flex-1 truncate font-mono font-medium tracking-wide">
        {current.title}
      </p>

      {visible.length > 1 && (
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          {visible.map((item, position) => (
            <button
              key={item.id}
              type="button"
              title={`Announcement ${position + 1} of ${visible.length}`}
              aria-label={`Show announcement ${position + 1} of ${visible.length}`}
              aria-current={position === index ? 'true' : undefined}
              onClick={() => setStep(position)}
              className="h-1.5 w-1.5 cursor-pointer"
              style={{
                background: position === index ? tone.edge : 'rgba(255,255,255,0.25)',
              }}
            />
          ))}
        </div>
      )}

      {href &&
        (external ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-opacity hover:opacity-80"
            style={{ borderColor: tone.edge, color: tone.edge }}
          >
            {label}
          </a>
        ) : (
          <Link
            href={href}
            className="shrink-0 border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-opacity hover:opacity-80"
            style={{ borderColor: tone.edge, color: tone.edge }}
          >
            {label}
          </Link>
        ))}

      <button
        type="button"
        onClick={() => hide(current.id)}
        title="Dismiss this announcement"
        aria-label="Dismiss this announcement"
        className="shrink-0 p-1 text-white/45 transition-colors hover:text-white cursor-pointer"
      >
        <X size={13} />
      </button>
    </div>
  );
}
