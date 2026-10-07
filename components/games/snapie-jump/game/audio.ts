// Tiny synthesized SFX — no audio files, everything generated with WebAudio.
export type Sfx = "bounce" | "honey" | "big" | "power" | "milestone" | "over" | "break" | "stomp" | "shield";

export function createAudio() {
  let ctx: AudioContext | null = null;
  let muted = false;

  const ensure = () => {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  };

  const tone = (f0: number, f1: number, dur: number, type: OscillatorType, vol = 0.15, delay = 0) => {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  };

  return {
    unlock: () => void ensure(),
    setMuted: (m: boolean) => {
      muted = m;
      if (m && ctx) void ctx.suspend();
      if (!m) ensure();
    },
    isMuted: () => muted,
    play(s: Sfx) {
      switch (s) {
        case "bounce": tone(260, 520, 0.12, "triangle", 0.12); break;
        case "honey": tone(880, 1320, 0.08, "square", 0.06); tone(1320, 1760, 0.08, "square", 0.05, 0.06); break;
        case "big": [660, 880, 1100, 1320].forEach((f, i) => tone(f, f * 1.5, 0.1, "square", 0.06, i * 0.06)); break;
        case "power": tone(300, 1200, 0.35, "sawtooth", 0.07); tone(450, 1800, 0.35, "triangle", 0.06, 0.05); break;
        case "milestone": [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.14, "triangle", 0.1, i * 0.09)); break;
        case "over": tone(600, 80, 0.9, "sawtooth", 0.08); tone(300, 60, 0.9, "triangle", 0.1, 0.1); break;
        case "break": tone(200, 60, 0.15, "square", 0.06); break;
        case "stomp": tone(180, 700, 0.15, "square", 0.08); break;
        case "shield": tone(400, 1600, 0.4, "sine", 0.15); break;
      }
    },
    destroy() {
      if (ctx) void ctx.close();
      ctx = null;
    },
  };
}
