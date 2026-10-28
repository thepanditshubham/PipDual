'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { sound } from '@/components/terminal/sound';

export type TerminalMode = 'dark' | 'light';

const KEY = 'pip-duel-theme-mode';
const listeners = new Set<() => void>();
let cached: TerminalMode | null = null;

/** Light is the out-of-the-box mode; dark is only used once the player picks it. */
const defaultMode: TerminalMode = 'light';

function read(): TerminalMode {
  if (cached) return cached;
  if (typeof window === 'undefined') return defaultMode;
  cached = window.localStorage.getItem(KEY) === 'dark' ? 'dark' : defaultMode;
  return cached;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function write(mode: TerminalMode) {
  cached = mode;
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // Private mode: keep the in-memory value only.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Shared light/dark mode for the terminal screens. Any page that mounts
 * `.term-theme` with `data-theme={useTerminalMode()}` repaints together, so the
 * lobby and the battle terminal never disagree about the time of day.
 */
export function useTerminalMode(): TerminalMode {
  return useSyncExternalStore(subscribe, read, () => defaultMode);
}

/** Sun/moon switch. Pass the container skin via `className` to match the header it sits in. */
export function TerminalModeToggle({ className = '' }: { className?: string }) {
  const mode = useTerminalMode();
  const next: TerminalMode = mode === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={() => {
        sound.playClick();
        write(next);
      }}
      aria-label={`Switch to ${next} mode`}
      aria-pressed={mode === 'light'}
      title={`Switch to ${next} mode`}
      className={`flex items-center justify-center cursor-pointer transition-colors ${className}`}
    >
      {mode === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
