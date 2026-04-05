/**
 * Shared Web Audio utilities for the auction.
 *
 * Module-level singleton so mute state and AudioContext are shared across
 * every component that imports this file.
 */

let _audioCtx = null;
let _muted    = false;

const getCtx = () => {
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || window['webkitAudioContext'])();
    } catch { /* browser doesn't support Web Audio */ }
  }
  return _audioCtx;
};

/** Schedule a single tone. startOffset is in seconds from ctx.currentTime. */
const _tone = (ctx, freq, startOffset, durationSec, vol, type = 'sine') => {
  try {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type           = type;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + startOffset;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + durationSec);
    osc.start(t0);
    osc.stop(t0 + durationSec + 0.02);
  } catch { /* ignore scheduling errors */ }
};

/** Run `fn` immediately if ctx is running, or after resuming it. */
const _withCtx = (fn) => {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().then(fn).catch(() => {});
  } else {
    fn();
  }
};

// ── Public API ────────────────────────────────────────────────────────────────

export const setAudioMuted = (v) => { _muted = v; };
export const isAudioMuted  = ()  => _muted;

/**
 * Timer tick with "stretch" effect.
 *
 * As the timer approaches 0 the sound decays progressively longer, creating
 * an organic tension — like a clock winding down.  Successive stretched tails
 * intentionally overlap near 0, building pressure.
 *
 * Volume   : 0.18 (full time) → 0.38 (last second)   — clearly audible
 * Decay    : 0.05 s (crisp tick) → 0.50 s (stretched ring)
 * Stretch  : driven by how close timeLeft is to 0 relative to the last
 *            10 s of the timer, so the effect is always felt in the final
 *            stretch regardless of the total duration.
 *
 * @param {number} timeLeft  seconds remaining
 * @param {number} total     full timer duration in seconds
 */
export const playTickBeep = (timeLeft, total = 30) => {
  if (_muted) return;

  // Linear urgency over the whole timer (drives volume)
  const urgency = total > 0 ? Math.min(1, Math.max(0, 1 - timeLeft / total)) : 1;

  // Stretch urgency: ramps from 0→1 over the LAST 10 s (or the full duration
  // if shorter), so the elongation effect is concentrated near the end.
  const stretchWindow = Math.min(10, total);
  const stretch = stretchWindow > 0 ? Math.min(1, Math.max(0, 1 - timeLeft / stretchWindow)) : 1;

  const vol   = 0.18 + urgency * 0.20;          // 0.18 → 0.38
  const decay = 0.05 + stretch * 0.45;           // 0.05 s (tick) → 0.50 s (stretched ring)

  _withCtx(() => {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // Primary — triangle wave at C5, near-instant attack, stretched decay
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type            = 'triangle';
    osc.frequency.value = 523; // C5
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
    osc.start(now);
    osc.stop(now + decay + 0.02);

    // Octave harmonic (C6) fades in during last 5 s, also stretched —
    // adds richness and urgency without a jarring pitch jump
    if (timeLeft <= 5) {
      const harmVol = vol * Math.min(1, (5 - timeLeft) / 4) * 0.38;
      const osc2    = ctx.createOscillator();
      const gain2   = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type            = 'triangle';
      osc2.frequency.value = 1046; // C6
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.linearRampToValueAtTime(harmVol, now + 0.003);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + decay * 0.65);
      osc2.start(now);
      osc2.stop(now + decay * 0.65 + 0.02);
    }
  });
};

/**
 * Time-up conclusion sound — plays when the countdown hits 0.
 *
 * Layered to give a strong "finality" sensation:
 *  1. Sharp impact transient  — triangle at 700 Hz, 35 ms  → "time's up" crack
 *  2. Falling tone (A4→A3)   — sine drops from 440→220 Hz over 0.5 s
 *                               This descending glide is what the brain reads
 *                               as "something has closed / concluded"
 *  3. Deep bass resonance     — sine at 110 Hz, 0.8 s decay → weight & finality
 */
export const playTimeUpSound = () => {
  if (_muted) return;
  _withCtx(() => {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // 1 — sharp crack
    const osc1 = ctx.createOscillator();
    const g1   = ctx.createGain();
    osc1.connect(g1); g1.connect(ctx.destination);
    osc1.type            = 'triangle';
    osc1.frequency.value = 700;
    g1.gain.setValueAtTime(0.55, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc1.start(now); osc1.stop(now + 0.05);

    // 2 — falling tone: A4 (440 Hz) → A3 (220 Hz)
    const osc2 = ctx.createOscillator();
    const g2   = ctx.createGain();
    osc2.connect(g2); g2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(440, now + 0.01);
    osc2.frequency.exponentialRampToValueAtTime(220, now + 0.50);
    g2.gain.setValueAtTime(0.42, now + 0.01);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc2.start(now + 0.01); osc2.stop(now + 0.68);

    // 3 — deep resonant body
    const osc3 = ctx.createOscillator();
    const g3   = ctx.createGain();
    osc3.connect(g3); g3.connect(ctx.destination);
    osc3.type            = 'sine';
    osc3.frequency.value = 110;
    g3.gain.setValueAtTime(0.30, now);
    g3.gain.exponentialRampToValueAtTime(0.001, now + 0.80);
    osc3.start(now); osc3.stop(now + 0.82);
  });
};

/**
 * Sold sound — three ascending triangle-wave tones (C5 → E5 → G5).
 * The final note rings for ~0.5 s for a satisfying "gavel" feel.
 */
export const playSoldSound = () => {
  if (_muted) return;
  _withCtx(() => {
    const ctx = getCtx();
    _tone(ctx, 523, 0.00, 0.14, 0.30, 'triangle');   // C5
    _tone(ctx, 659, 0.15, 0.14, 0.35, 'triangle');   // E5
    _tone(ctx, 784, 0.30, 0.55, 0.45, 'triangle');   // G5 — longer ring
  });
};
