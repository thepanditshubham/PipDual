// Web Audio API Synthesizer for Terminal & UI Sound Effects
// Enhanced with official MW3 Lobby sound asset (/mw3-lobby.mp3)

class SoundFX {
  private ctx: AudioContext | null = null;
  public enabled = true;
  private lastHoverTime = 0;
  private lastClickTime = 0;
  private mw3Buffer: AudioBuffer | null = null;
  private mw3Loading = false;
  private mw3Attempts = 0;
  private mw3Element: HTMLAudioElement | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('pipduel_sound');
        if (stored !== null) {
          this.enabled = stored === 'true';
        }
      } catch {
        // ignore localStorage access issues in sandboxed frames
      }
      // No fetch here on purpose. The track is loaded from unlock(), which
      // runs on the first real gesture: fetching during module evaluation
      // fires a request on every page load — including ones that never play
      // a sound — and any dev-server rebuild turns it into a visible error.
    }
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('pipduel_sound', val ? 'true' : 'false');
      } catch {
        // ignore
      }
    }
  }

  public getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Preload and decode /mw3-lobby.mp3 into an AudioBuffer for zero-latency playback
   */
  private async loadMW3Audio() {
    if (this.mw3Buffer || this.mw3Loading || typeof window === 'undefined') return;
    // Two attempts only: a missing asset is not going to appear on the third
    // try, and a retry loop on every pointerdown would be worse than silence.
    if (this.mw3Attempts >= 2) return;
    this.mw3Attempts += 1;
    this.mw3Loading = true;
    try {
      const response = await fetch('/mw3-lobby.mp3');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const ctx = this.getContext();
      if (ctx) {
        this.mw3Buffer = await ctx.decodeAudioData(arrayBuffer);
      }
    } catch (err) {
      // The lobby track is garnish — every effect has a synth fallback — so a
      // failed load must never escalate into an app error.
      console.info('[sound] lobby track unavailable, using synth fallback', err);
    } finally {
      this.mw3Loading = false;
    }
  }

  /**
   * Unlock AudioContext on first user interaction (browser policy)
   */
  public unlock() {
    const ctx = this.getContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    this.loadMW3Audio();
  }

  /**
   * Play the MW3 lobby audio buffer with zero latency
   */
  private playMW3Buffer(options: { volume?: number; playbackRate?: number; maxDuration?: number } = {}) {
    if (!this.enabled) return false;
    const ctx = this.getContext();
    if (!ctx) return false;

    if (this.mw3Buffer) {
      try {
        const source = ctx.createBufferSource();
        source.buffer = this.mw3Buffer;

        const gainNode = ctx.createGain();
        const volume = options.volume ?? 0.45;
        gainNode.gain.setValueAtTime(volume, ctx.currentTime);

        if (options.playbackRate) {
          source.playbackRate.setValueAtTime(options.playbackRate, ctx.currentTime);
        }

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        const startTime = ctx.currentTime;
        source.start(startTime);

        if (options.maxDuration) {
          gainNode.gain.setValueAtTime(volume, startTime + options.maxDuration * 0.7);
          gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + options.maxDuration);
          source.stop(startTime + options.maxDuration);
        }
        return true;
      } catch {
        return false;
      }
    } else {
      // Direct HTML5 Audio fallback while the buffer decodes. One shared
      // element: `new Audio()` per hover leaks a decoder on every pointer move.
      try {
        if (!this.mw3Element) {
          this.mw3Element = new Audio('/mw3-lobby.mp3');
          this.mw3Element.preload = 'auto';
        }
        const audio = this.mw3Element;
        audio.volume = options.volume ?? 0.45;
        audio.playbackRate = options.playbackRate ?? 1;
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Direct trigger for MW3 lobby sound
   */
  playMW3(volume = 0.5) {
    this.playMW3Buffer({ volume });
  }

  /**
   * Hover sound (tactical micro-burst)
   */
  playHover() {
    if (!this.enabled) return;
    const now = Date.now();
    if (now - this.lastHoverTime < 45) return; // Debounce rapid sweeps
    this.lastHoverTime = now;

    // Use a fast, crisp micro-slice of MW3 audio if available
    const played = this.playMW3Buffer({ volume: 0.18, playbackRate: 1.6, maxDuration: 0.08 });
    if (played) return;

    // Fallback: Web Audio synthesizer tick
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, t);
      osc.frequency.exponentialRampToValueAtTime(750, t + 0.035);

      gain.gain.setValueAtTime(0.03, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.035);
    } catch {}
  }

  /**
   * Click sound disabled per user request
   */
  playClick() {
    // Disabled
  }

  playFill() {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1); // A5

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  }

  playAlert() {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(330, ctx.currentTime + 0.2);

      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {}
  }

  playWin() {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.1);
        osc.stop(ctx.currentTime + i * 0.1 + 0.25);
      });
    } catch {}
  }

  playLose() {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const notes = [440, 392, 349.23]; // A4, G4, F4
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.15);
        osc.stop(ctx.currentTime + i * 0.15 + 0.3);
      });
    } catch {}
  }
}

export const sound = new SoundFX();
