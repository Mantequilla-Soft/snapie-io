// 8-bit synth SFX via the Web Audio API. No external files.

type Ctor = typeof AudioContext;

export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC: Ctor | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private tone(opts: {
    type: OscillatorType;
    from: number;
    to: number;
    dur: number;
    gain?: number;
    delay?: number;
  }) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + opts.dur);
    g.gain.setValueAtTime(opts.gain ?? 0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  private noise(dur: number, gain = 0.09, delay = 0) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const frames = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      // crunchy, quantised noise = NES-ish
      data[i] = (Math.round(Math.random() * 3) / 3) * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2400, t0);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t0);
  }

  /** unlock audio from a user gesture */
  resume() {
    this.ensure();
  }

  laser() {
    this.tone({ type: "square", from: 900, to: 180, dur: 0.11, gain: 0.06 });
  }

  explosion() {
    this.noise(0.22, 0.1);
    this.tone({ type: "square", from: 220, to: 60, dur: 0.18, gain: 0.05 });
  }

  clank() {
    this.tone({ type: "triangle", from: 420, to: 300, dur: 0.08, gain: 0.06 });
  }

  miss() {
    this.tone({ type: "sawtooth", from: 160, to: 70, dur: 0.16, gain: 0.05 });
  }

  stageClear() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this.tone({ type: "square", from: f, to: f, dur: 0.09, gain: 0.05, delay: i * 0.08 }),
    );
  }

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) =>
      this.tone({ type: "square", from: f, to: f, dur: 0.16, gain: 0.06, delay: i * 0.14 }),
    );
  }

  win() {
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      this.tone({ type: "square", from: f, to: f, dur: 0.12, gain: 0.055, delay: i * 0.1 }),
    );
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
