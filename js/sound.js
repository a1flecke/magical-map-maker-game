/* Magical Map Maker — Sound Effects (Web Audio API, Synthesized) */

class SoundManager {
  constructor() {
    this._ctx = null; // AudioContext created lazily on first user gesture
    this._enabled = false;
    this._initialized = false;
  }

  get enabled() { return this._enabled; }

  set enabled(val) {
    this._enabled = !!val;
    // Save preference
    try { localStorage.setItem('mmm-sound', this._enabled ? '1' : '0'); } catch (_) {}
  }

  /** Initialize AudioContext on first user gesture (iPad Safari requirement) */
  init() {
    if (this._initialized) return;
    this._initialized = true;

    // Load saved preference (default: off)
    try {
      const saved = localStorage.getItem('mmm-sound');
      this._enabled = saved === '1';
    } catch (_) {}
  }

  _ensureContext() {
    if (this._ctx) return this._ctx;
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return null;
    }
    return this._ctx;
  }

  /** Resume AudioContext if suspended (required after user gesture on iOS) */
  _resume() {
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
  }

  /** Play tile placement sound — soft "thunk" */
  playPlace() {
    if (!this._enabled) return;
    const ctx = this._ensureContext();
    if (!ctx) return;
    this._resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** Play overlay placement sound — light "chime" */
  playChime() {
    if (!this._enabled) return;
    const ctx = this._ensureContext();
    if (!ctx) return;
    this._resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.05);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /** Play erase sound — soft "whoosh" */
  playErase() {
    if (!this._enabled) return;
    const ctx = this._ensureContext();
    if (!ctx) return;
    this._resume();

    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(8000, now + 0.1);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
  }

  /** Play undo/redo sound — soft "click" */
  playClick() {
    if (!this._enabled) return;
    const ctx = this._ensureContext();
    if (!ctx) return;
    this._resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(600, now);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  /** Play fill sound — "cascade" */
  playCascade() {
    if (!this._enabled) return;
    const ctx = this._ensureContext();
    if (!ctx) return;
    this._resume();

    const now = ctx.currentTime;
    const notes = [440, 554, 659, 880];
    for (let i = 0; i < notes.length; i++) {
      const t = now + i * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i], t);

      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  }

  destroy() {
    if (this._ctx) {
      this._ctx.close().catch(() => {});
      this._ctx = null;
    }
  }
}
