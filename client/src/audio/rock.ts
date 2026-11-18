// Musik latar rock prosedural (WebAudio): drum, bass, gitar ritme berdistorsi, dan gitar melodi.
// Semuanya disintesis dari osilator & noise, jadi tidak ada file audio. Lagunya orisinal:
// E minor, 152 BPM, susunan intro → (verse → chorus → verse → chorus → bridge) berulang.
//
// Kelas ini hanya menjadwalkan not ke AudioContext yang diberikan, sehingga bisa juga dirender
// ke OfflineAudioContext untuk diperiksa tanpa didengarkan.

const BPM = 152;
/** Lama satu not 1/16 (detik). */
export const STEP = 60 / BPM / 4;
const BAR = 16;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// Akor power (root + kuint + oktaf). Huruf kecil = palm mute (pendek, redam), huruf besar = terbuka.
const ROOTS: Record<string, number> = { e: 40, g: 43, a: 45, b: 47, c: 48, d: 50 };

interface Bar {
  /** 8 slot not 1/8: nama akor, '-' = tahan akor sebelumnya, '.' = diam. */
  gtr: string;
  kick: string;
  snare: string;
  /** x = hi-hat tertutup, o = terbuka. */
  hat: string;
  tom?: string;
  crash?: boolean;
  /** Melodi gitar: [langkah 1/16, lama dalam langkah, not MIDI]. */
  lead?: [number, number, number][];
  /** Bass ikut gitar (bawaan) atau diam. */
  noBass?: boolean;
}

const HAT8 = 'x.x.x.x.x.x.x.x.';
const OPEN8 = 'o.x.o.x.o.x.o.x.';
const K_VERSE = 'x.....x.x.....x.';
const K_CHORUS = 'x.x...x.x.x...x.';
const SNARE = '....x.......x...';
const FILL_S = '....x.....x.xxxx';
const FILL_T = '........1.1.2233';

const verse = (gtr: string, last = false): Bar => ({ gtr, kick: K_VERSE, snare: last ? FILL_S : SNARE, hat: HAT8, tom: last ? FILL_T : undefined });
const chorus = (gtr: string, lead: [number, number, number][], extra: Partial<Bar> = {}): Bar => ({
  gtr,
  kick: K_CHORUS,
  snare: SNARE,
  hat: OPEN8,
  lead,
  ...extra,
});

const INTRO: Bar[] = [
  { gtr: 'eeGeeAee', kick: '................', snare: '................', hat: 'x...x...x...x...', noBass: true },
  { gtr: 'eeGeeBAG', kick: '................', snare: '................', hat: 'x...x...x...x...', noBass: true },
  { gtr: 'eeGeeAee', kick: 'x.......x.......', snare: '................', hat: HAT8 },
  { gtr: 'eeGeD-C-', kick: 'x.......x...x...', snare: '....x...x.x.xxxx', hat: HAT8, tom: '..............33' },
];

const VERSE: Bar[] = [
  { ...verse('eeGeeAee'), crash: true },
  verse('eeGeeBAG'),
  verse('eeGeeAee'),
  verse('eeGeD-C-'),
  verse('eeGeeAee'),
  verse('eeGeeBAG'),
  verse('ccCcddDd'),
  verse('E-..B-D-', true),
];

// melodi chorus, E minor (pentatonik + F# sebagai not lewat)
const E4 = 64;
const G4 = 67;
const A4 = 69;
const B4 = 71;
const D5 = 74;
const E5 = 76;
const FS5 = 78;
const G5 = 79;
const CHORUS: Bar[] = [
  chorus('CCCCCCCC', [[0, 6, E5], [6, 2, D5], [8, 4, B4], [12, 4, G4]], { crash: true }),
  chorus('DDDDDDDD', [[0, 6, A4], [6, 2, B4], [8, 8, D5]]),
  chorus('EEEEEEGG', [[0, 4, E5], [4, 4, G5], [8, 4, E5], [12, 4, D5]]),
  chorus('EEEEEEEE', [[0, 12, B4]]),
  chorus('CCCCCCCC', [[0, 6, E5], [6, 2, D5], [8, 4, B4], [12, 4, G4]], { crash: true }),
  chorus('DDDDDDDD', [[0, 6, A4], [6, 2, B4], [8, 4, D5], [12, 4, FS5]]),
  chorus('GGGGGGGG', [[0, 8, G5], [8, 4, FS5], [12, 4, D5]]),
  chorus('BBBBBBBB', [[0, 8, FS5], [8, 2, B4], [10, 2, D5], [12, 2, E5], [14, 2, FS5]], { snare: FILL_S, tom: FILL_T }),
];

// bridge: setengah tempo, akor ditahan, lalu membangun kembali ke verse
const BRIDGE: Bar[] = [
  { gtr: 'E-------', kick: 'x.......x.x.....', snare: '........x.......', hat: 'x...x...x...x...', crash: true, lead: [[0, 8, E4], [8, 8, G4]] },
  { gtr: 'C-------', kick: 'x.......x.x.....', snare: '........x.......', hat: 'x...x...x...x...', lead: [[0, 8, A4], [8, 8, G4]] },
  { gtr: 'D-------', kick: 'x.......x.x.....', snare: '........x.......', hat: 'x...x...x...x...', lead: [[0, 8, A4], [8, 8, B4]] },
  { gtr: 'B---bbbb', kick: 'x.......x.x.x.x.', snare: '........x.x.xxxx', hat: HAT8, tom: '............1123', lead: [[0, 16, FS5]] },
];

const LOOP: Bar[] = [...VERSE, ...CHORUS, ...VERSE, ...CHORUS, ...BRIDGE];

function distortion(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount);
  }
  return curve;
}

export class RockBand {
  private noise: AudioBuffer;
  private drums: GainNode;
  private bass: GainNode;
  /** Masukan gitar ritme: terbuka dan palm mute (yang terakhir diredam dulu sebelum distorsi). */
  private gtrOpen: GainNode;
  private gtrMute: BiquadFilterNode;
  private lead: GainNode;
  private nextTime = 0;
  private bar = 0;
  private step = 0;
  private intro = true;
  /** Akor yang sedang ditahan pada slot '-' . */
  private held = '';

  constructor(
    private ctx: BaseAudioContext,
    out: AudioNode,
  ) {
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.drums = ctx.createGain();
    this.drums.gain.value = 0.9;
    this.drums.connect(out);

    this.bass = ctx.createGain();
    this.bass.gain.value = 0.38;
    this.bass.connect(out);

    // gitar ritme: semua not dijumlahkan dulu baru didistorsi (itulah bunyi akor power),
    // lalu filter "kabinet" membuang desis di atas dan dengung di bawah
    const shaper = ctx.createWaveShaper();
    shaper.curve = distortion(5);
    shaper.oversample = '2x';
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 130;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 950;
    mid.Q.value = 0.9;
    mid.gain.value = 3;
    // "gigitan" gitar: tanpa ini gitar tenggelam di speaker HP yang miskin nada rendah
    const bite = ctx.createBiquadFilter();
    bite.type = 'peaking';
    bite.frequency.value = 2500;
    bite.Q.value = 0.8;
    bite.gain.value = 6;
    const cab = ctx.createBiquadFilter();
    cab.type = 'lowpass';
    cab.frequency.value = 4300;
    cab.Q.value = 0.8;
    const cab2 = ctx.createBiquadFilter();
    cab2.type = 'lowpass';
    cab2.frequency.value = 6500;
    const gtrOut = ctx.createGain();
    gtrOut.gain.value = 0.34;
    shaper.connect(hp);
    hp.connect(mid);
    mid.connect(bite);
    bite.connect(cab);
    cab.connect(cab2);
    cab2.connect(gtrOut);
    gtrOut.connect(out);
    this.gtrOpen = ctx.createGain();
    this.gtrOpen.connect(shaper);
    this.gtrMute = ctx.createBiquadFilter();
    this.gtrMute.type = 'lowpass';
    this.gtrMute.frequency.value = 2100;
    this.gtrMute.connect(shaper);

    // gitar melodi: distorsi lebih halus + gema 3/16
    const leadShaper = ctx.createWaveShaper();
    leadShaper.curve = distortion(3);
    leadShaper.oversample = '2x';
    const leadTone = ctx.createBiquadFilter();
    leadTone.type = 'lowpass';
    leadTone.frequency.value = 3000;
    leadTone.Q.value = 1.2;
    const leadOut = ctx.createGain();
    leadOut.gain.value = 0.25;
    const echo = ctx.createDelay(1);
    echo.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.lead = ctx.createGain();
    this.lead.connect(leadShaper);
    leadShaper.connect(leadTone);
    leadTone.connect(leadOut);
    leadOut.connect(out);
    leadOut.connect(echo);
    echo.connect(fb);
    fb.connect(echo);
    echo.connect(wet);
    wet.connect(out);
  }

  /** Mulai lagu dari intro pada waktu `at` (detik, waktu AudioContext). */
  start(at: number): void {
    this.nextTime = at;
    this.bar = 0;
    this.step = 0;
    this.intro = true;
    this.held = '';
  }

  /** Jadwalkan semua not sampai waktu `until`. Panggil berkala dengan jarak pandang ke depan. */
  schedule(until: number): void {
    const now = this.ctx.currentTime;
    // tab sempat tertidur: jangan mengejar ketinggalan, lanjut dari awal bar berikutnya
    if (this.nextTime < now - 0.3) {
      this.nextTime = now + 0.05;
      this.step = 0;
      this.advanceBar();
    }
    while (this.nextTime < until) {
      const section = this.intro ? INTRO : LOOP;
      this.playStep(section[this.bar], this.step, this.nextTime);
      this.nextTime += STEP;
      if (++this.step === BAR) {
        this.step = 0;
        this.advanceBar();
      }
    }
  }

  private advanceBar(): void {
    const section = this.intro ? INTRO : LOOP;
    if (++this.bar >= section.length) {
      this.bar = 0;
      this.intro = false;
    }
  }

  private playStep(bar: Bar, step: number, t: number): void {
    if (step === 0 && bar.crash) this.crash(t);
    const k = bar.kick[step];
    if (k === 'x') this.kick(t);
    if (bar.snare[step] === 'x') this.snare(t, step % 4 === 0 ? 1 : 0.6);
    const h = bar.hat[step];
    if (h === 'x') this.hat(t, false, step % 4 === 0 ? 1 : 0.65);
    else if (h === 'o') this.hat(t, true, 0.8);
    const tom = bar.tom?.[step];
    if (tom && tom !== '.') this.tom(t, [0, 196, 147, 110][Number(tom)] ?? 147);

    if (step % 2 === 0) {
      const slot = step / 2;
      const c = bar.gtr[slot];
      if (c === '.') this.held = '';
      else if (c !== '-') {
        // lama not: sampai slot berikutnya yang bukan '-'
        let len = 1;
        while (slot + len < 8 && bar.gtr[slot + len] === '-') len++;
        const root = ROOTS[c.toLowerCase()];
        const muted = c === c.toLowerCase();
        if (root !== undefined) {
          this.chord(t, root, len * 2 * STEP, muted);
          this.held = c;
          if (!bar.noBass) this.bassNote(t, root - 12, muted ? STEP * 1.9 : len * 2 * STEP);
        }
      } else if (this.held && !bar.noBass) {
        // akor ditahan: bass tetap menggerakkan lagu dengan not 1/8
        this.bassNote(t, ROOTS[this.held.toLowerCase()] - 12, STEP * 1.6);
      }
    }
    if (bar.lead) for (const [at, len, note] of bar.lead) if (at === step) this.leadNote(t, note, len * STEP);
  }

  // ------------------------------------------------------------------ drum

  private burst(t: number, type: BiquadFilterType, freq: number, q: number, vol: number, dur: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true; // simbal lebih panjang dari buffer noise
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.drums);
    src.start(t, Math.random() * 0.4, dur + 0.05);
  }

  private thump(t: number, f0: number, f1: number, vol: number, dur: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.drums);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private kick(t: number): void {
    this.thump(t, 165, 46, 0.9, 0.24);
    this.burst(t, 'highpass', 1800, 0.7, 0.22, 0.02); // "klik" pemukul
  }

  private snare(t: number, vel: number): void {
    this.burst(t, 'bandpass', 2100, 0.6, 0.75 * vel, 0.19);
    this.burst(t, 'highpass', 5500, 0.7, 0.42 * vel, 0.11);
    this.thump(t, 230, 170, 0.45 * vel, 0.11, 'triangle');
  }

  private hat(t: number, open: boolean, vel: number): void {
    this.burst(t, 'highpass', 7800, 0.9, 0.36 * vel, open ? 0.22 : 0.05);
  }

  private crash(t: number): void {
    this.burst(t, 'highpass', 4200, 0.5, 0.5, 1.5);
    this.burst(t, 'bandpass', 9000, 0.4, 0.3, 0.9);
  }

  private tom(t: number, f: number): void {
    this.thump(t, f * 1.5, f * 0.85, 0.7, 0.22);
  }

  // ----------------------------------------------------------- bass & gitar

  private bassNote(t: number, midi: number, dur: number): void {
    const ctx = this.ctx;
    const f = hz(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + Math.min(dur, 0.25));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.006);
    g.gain.setValueAtTime(0.75, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g);
    g.connect(this.bass);
    for (const [type, mult, vol] of [
      ['sawtooth', 1, 0.6],
      ['sine', 2, 0.5], // oktaf atas: tetap terdengar di speaker HP yang tidak sampai nada rendah
    ] as [OscillatorType, number, number][]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f * mult;
      const v = ctx.createGain();
      v.gain.value = vol;
      osc.connect(v);
      v.connect(lp);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  }

  private chord(t: number, root: number, dur: number, muted: boolean): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const len = muted ? Math.min(dur, STEP * 1.85) : dur;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(muted ? 0.5 : 0.42, t + 0.004);
    if (muted) g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    else {
      g.gain.exponentialRampToValueAtTime(0.3, t + len * 0.8);
      g.gain.linearRampToValueAtTime(0.0001, t + len - 0.005);
    }
    g.connect(muted ? this.gtrMute : this.gtrOpen);
    for (const semis of [0, 7, 12]) {
      for (const detune of [-7, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = hz(root + semis);
        osc.detune.value = detune;
        osc.connect(g);
        osc.start(t);
        osc.stop(t + len + 0.01);
      }
    }
  }

  private leadNote(t: number, midi: number, dur: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.55, t + 0.012);
    g.gain.setValueAtTime(0.5, t + dur * 0.75);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(this.lead);
    // vibrato masuk setelah not ditahan sebentar
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.6;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(14, t + Math.min(dur, 0.35));
    lfo.connect(depth);
    lfo.start(t);
    lfo.stop(t + dur + 0.02);
    for (const [type, vol] of [
      ['sawtooth', 0.6],
      ['square', 0.35],
    ] as [OscillatorType, number][]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = hz(midi);
      depth.connect(osc.detune);
      const v = ctx.createGain();
      v.gain.value = vol;
      osc.connect(v);
      v.connect(g);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  }
}
