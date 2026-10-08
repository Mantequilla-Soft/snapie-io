// @ts-nocheck — WebAudio chip synth + original procedural soundtrack.
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const MINOR = [0, 2, 3, 5, 7, 8, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11];
interface Track { bpm: number; root: number; prog: number[]; seed: number; scale: number[]; lead: OscillatorType; mel?: (number | null)[] }
const TR: Record<string, Track> = {
  title: { bpm: 118, root: 45, prog: [0, -4, -2, -5], seed: 7, scale: MINOR, lead: "square" },
  w1: { bpm: 148, root: 43, prog: [0, 0, 5, 7], seed: 11, scale: MAJOR, lead: "square" },
  w2: { bpm: 156, root: 40, prog: [0, 3, -2, 5], seed: 23, scale: MINOR, lead: "sawtooth" },
  w3: { bpm: 142, root: 45, prog: [0, -4, 3, -2], seed: 37, scale: MINOR, lead: "square" },
  w4: { bpm: 160, root: 42, prog: [0, 1, 0, -2], seed: 51, scale: MINOR, lead: "sawtooth" },
  w5: { bpm: 166, root: 38, prog: [0, 3, 1, -2], seed: 67, scale: MINOR, lead: "square" },
  boss: { bpm: 172, root: 40, prog: [0, 1, 0, 6], seed: 79, scale: MINOR, lead: "sawtooth" },
  hog: { bpm: 178, root: 38, prog: [0, 1, 3, 1], seed: 93, scale: MINOR, lead: "square" },
  end: { bpm: 124, root: 48, prog: [0, 5, -3, 7], seed: 5, scale: MAJOR, lead: "square" },
};
function genMelody(t: Track) {
  let s = t.seed * 9973 + 1;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const out: (number | null)[] = []; let d = 4;
  for (let i = 0; i < 64; i++) {
    const strong = i % 4 === 0;
    if (i >= 32 && i < 48) { out.push(out[i - 32]); continue; } // repetition = hook
    if (r() < (strong ? 0.12 : 0.42)) { out.push(null); continue; }
    d += Math.floor(r() * 5) - 2; d = Math.max(0, Math.min(10, d)); out.push(d);
  }
  return out;
}

class AudioSys {
  ctx: AudioContext | null = null; master!: GainNode; sfxG!: GainNode; musG!: GainNode; noiseBuf!: AudioBuffer;
  musicOn = true; sfxOn = true; track: Track | null = null; step = 0; next = 0; timer: any = null; last: Record<string, number> = {};
  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as any).webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.6; this.master.connect(this.ctx.destination);
    this.sfxG = this.ctx.createGain(); this.sfxG.connect(this.master);
    this.musG = this.ctx.createGain(); this.musG.gain.value = 0.45; this.musG.connect(this.master);
    this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  tone(f: number, dur: number, type: OscillatorType, vol: number, when: number, slide?: number, dest?: AudioNode) {
    const c = this.ctx!; const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, when);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), when + dur);
    g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(dest || this.sfxG); o.start(when); o.stop(when + dur + 0.02);
  }
  noise(dur: number, vol: number, freq: number, when: number, dest?: AudioNode) {
    const c = this.ctx!; const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfxG); s.start(when); s.stop(when + dur + 0.02);
  }
  sfx(n: string) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    if (this.last[n] && t - this.last[n] < 0.04) return; this.last[n] = t;
    switch (n) {
      case "sting": this.tone(900, 0.05, "square", 0.06, t, 400); this.noise(0.04, 0.04, 3000, t); break;
      case "laser": this.tone(1800, 0.14, "sawtooth", 0.06, t, 260); break;
      case "spread": this.tone(620, 0.08, "square", 0.07, t, 180); this.noise(0.05, 0.05, 2500, t); break;
      case "bazooka": this.noise(0.3, 0.2, 900, t); this.tone(130, 0.25, "square", 0.12, t, 40); break;
      case "jump": this.tone(280, 0.12, "square", 0.06, t, 720); break;
      case "hit": this.tone(220, 0.05, "square", 0.05, t, 110); break;
      case "edie": this.noise(0.25, 0.14, 1600, t); this.tone(420, 0.2, "square", 0.05, t, 60); break;
      case "boom": this.noise(0.7, 0.3, 700, t); this.tone(90, 0.5, "triangle", 0.3, t, 30); break;
      case "pickup": [0, 4, 7, 12, 16].forEach((s, i) => this.tone(midi(72 + s), 0.08, "square", 0.07, t + i * 0.05)); break;
      case "bossatk": this.tone(150, 0.3, "sawtooth", 0.08, t, 600); break;
      case "bosshit": this.tone(130, 0.06, "square", 0.06, t, 80); this.noise(0.05, 0.05, 2200, t); break;
      case "hurt": this.tone(520, 0.25, "square", 0.1, t, 80); break;
      case "die": [0, -3, -6, -9, -12, -15].forEach((s, i) => this.tone(midi(72 + s), 0.12, "square", 0.09, t + i * 0.09)); break;
      case "clear": [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(midi(67 + s), 0.15, "square", 0.08, t + i * 0.11)); break;
      case "select": this.tone(990, 0.05, "square", 0.06, t); break;
      case "switch": this.tone(500, 0.04, "square", 0.06, t); this.tone(820, 0.05, "square", 0.06, t + 0.05); break;
      case "beam": this.tone(70, 0.9, "sawtooth", 0.12, t, 55); this.noise(0.9, 0.08, 4000, t); break;
      case "warn": this.tone(880, 0.1, "square", 0.06, t); this.tone(660, 0.1, "square", 0.06, t + 0.16); break;
      case "chomp": this.tone(190, 0.04, "square", 0.05, t, 90); break;
      case "check": this.tone(660, 0.08, "triangle", 0.1, t); this.tone(990, 0.12, "triangle", 0.1, t + 0.08); break;
    }
  }
  music(name: string | null) {
    if (!this.ctx) return;
    const tr = name ? TR[name] : null;
    if (tr === this.track) return;
    this.track = tr; this.step = 0; this.next = this.ctx.currentTime + 0.08;
    if (tr && !tr.mel) tr.mel = genMelody(tr);
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }
  schedule() {
    const c = this.ctx, tr = this.track; if (!c || !tr || !this.musicOn) { if (c) this.next = c.currentTime + 0.05; return; }
    const sd = 60 / tr.bpm / 4;
    while (this.next < c.currentTime + 0.12) {
      const st = this.step, s = st % 16, bar = Math.floor(st / 16) % tr.prog.length, r = tr.root + tr.prog[bar], t = this.next, M = this.musG;
      if ([0, 2, 3, 6, 8, 10, 11, 14].includes(s)) this.tone(midi(r + (s % 4 === 2 ? 12 : 0)), sd * 0.9, "triangle", 0.22, t, undefined, M);
      const n = tr.mel![st % 64];
      if (n !== null && n !== undefined) {
        const deg = tr.scale[n % 7] + 12 * Math.floor(n / 7);
        this.tone(midi(tr.root + 24 + deg), sd * 1.7, tr.lead, 0.05, t, undefined, M);
      }
      const arp = [0, tr.scale[2], 7, 12][s % 4];
      this.tone(midi(r + 12 + arp), sd * 0.5, "square", 0.018, t, undefined, M);
      if (s % 8 === 0) { this.tone(140, 0.12, "sine", 0.35, t, 40, M); }
      if (s % 8 === 4) this.noise(0.12, 0.12, 3500, t, M);
      if (s % 2 === 1) this.noise(0.03, 0.03, 9000, t, M);
      this.next += sd; this.step++;
    }
  }
}
export const audio = new AudioSys();
