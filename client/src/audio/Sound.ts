// Suara (WebAudio): semua efek dan musik latar disintesis dari osilator & noise. Satu-satunya
// rekaman adalah kalimat announcer (voice.ts), yang diputar lewat rantai efek di sini.
import { onSettings, settings } from '../settings';
import { RockBand } from './rock';
import { loadVoice, preloadVoices, type VoiceLine } from './voice';

export type Sfx =
  | 'click'
  | 'hit'
  | 'slash'
  | 'shot'
  | 'zap'
  | 'cast'
  | 'beam'
  | 'lance'
  | 'boom'
  | 'thunder'
  | 'whoosh'
  | 'shadow'
  | 'levelup'
  | 'coin'
  | 'die'
  | 'pop'
  | 'tower'
  | 'win'
  | 'lose'
  | 'recall'
  | 'buy'
  | 'error'
  | 'heal'
  | 'announce'
  | 'ready'
  | 'ping';

/** Jeda minimum antar suara sejenis (detik), supaya keroyokan minion tidak memekakkan. */
const MIN_GAP: Partial<Record<Sfx, number>> = { hit: 0.055, shot: 0.07, pop: 0.09, slash: 0.08, coin: 0.09, zap: 0.08, cast: 0.05 };

interface ToneOpts {
  type: OscillatorType;
  f0: number;
  f1?: number;
  dur: number;
  vol: number;
  delay?: number;
  attack?: number;
}
interface NoiseOpts {
  filter: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  dur: number;
  vol: number;
  delay?: number;
}

/** Penguatan bus musik pada volume musik penuh. */
const MUSIC_GAIN = 0.7;
/** Kecepatan putar klip announcer: di bawah 1 = lebih lambat dan bernada lebih berat. */
const VOICE_RATE = 0.9;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private voice: GainNode | null = null;
  private noiseBuf!: AudioBuffer;
  private last = new Map<string, number>();
  private musicTimer = 0;
  private band: RockBand | null = null;

  /** Harus dipanggil dari aksi pengguna (klik/ketuk) supaya browser mengizinkan suara. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      // kompresor di ujung: banyak suara bersamaan tidak sampai pecah
      const comp = ctx.createDynamicsCompressor();
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.connect(comp);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.music = ctx.createGain();
      this.music.connect(this.master);
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      onSettings(() => this.applyVolumes());
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = settings.master;
    this.sfx.gain.value = settings.sfx;
    this.music.gain.cancelScheduledValues(this.ctx.currentTime);
    this.music.gain.value = settings.music * MUSIC_GAIN;
  }

  private tone(o: ToneOpts, dest: AudioNode = this.sfx): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol, t + (o.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + o.dur + 0.03);
  }

  private noise(o: NoiseOpts): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter;
    f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.03);
  }

  private notes(freqs: number[], type: OscillatorType, gap: number, dur: number, vol: number): void {
    freqs.forEach((f, i) => this.tone({ type, f0: f, dur, vol, delay: i * gap }));
  }

  /** Mainkan satu efek. `vol` 0..1 (mis. sudah dikalikan pelemahan jarak). */
  play(name: Sfx, vol = 1): void {
    if (!this.ctx || this.ctx.state !== 'running' || vol <= 0.02 || settings.master * settings.sfx <= 0) return;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < (MIN_GAP[name] ?? 0.03)) return;
    this.last.set(name, now);
    const v = vol;
    switch (name) {
      case 'click':
        this.tone({ type: 'sine', f0: 880, f1: 620, dur: 0.07, vol: 0.22 * v });
        break;
      case 'hit':
        this.noise({ filter: 'bandpass', f0: 1500, dur: 0.07, vol: 0.3 * v });
        this.tone({ type: 'sine', f0: 160, f1: 70, dur: 0.09, vol: 0.28 * v });
        break;
      case 'slash':
        this.noise({ filter: 'highpass', f0: 2200, f1: 6000, dur: 0.13, vol: 0.24 * v });
        break;
      case 'shot':
        this.tone({ type: 'square', f0: 900, f1: 260, dur: 0.1, vol: 0.13 * v });
        this.noise({ filter: 'highpass', f0: 3200, dur: 0.04, vol: 0.09 * v });
        break;
      case 'zap':
        this.tone({ type: 'sawtooth', f0: 1500, f1: 180, dur: 0.18, vol: 0.18 * v });
        this.noise({ filter: 'bandpass', f0: 3000, dur: 0.12, vol: 0.12 * v });
        break;
      case 'cast':
        this.tone({ type: 'sine', f0: 420, f1: 880, dur: 0.17, vol: 0.16 * v });
        this.tone({ type: 'triangle', f0: 840, f1: 1320, dur: 0.15, vol: 0.07 * v, delay: 0.03 });
        break;
      case 'beam':
        this.tone({ type: 'sawtooth', f0: 190, f1: 95, dur: 0.5, vol: 0.22 * v });
        this.tone({ type: 'square', f0: 760, f1: 380, dur: 0.4, vol: 0.08 * v });
        this.noise({ filter: 'lowpass', f0: 2600, f1: 300, dur: 0.5, vol: 0.2 * v });
        break;
      case 'lance':
        this.tone({ type: 'sawtooth', f0: 140, f1: 55, dur: 1.0, vol: 0.3 * v });
        this.tone({ type: 'square', f0: 1100, f1: 300, dur: 0.8, vol: 0.1 * v });
        this.noise({ filter: 'lowpass', f0: 4000, f1: 200, dur: 1.0, vol: 0.32 * v });
        break;
      case 'boom':
        this.noise({ filter: 'lowpass', f0: 900, f1: 80, dur: 0.55, vol: 0.5 * v });
        this.tone({ type: 'sine', f0: 110, f1: 36, dur: 0.5, vol: 0.5 * v });
        break;
      case 'thunder':
        this.noise({ filter: 'highpass', f0: 4200, dur: 0.07, vol: 0.3 * v });
        this.noise({ filter: 'bandpass', f0: 520, f1: 110, q: 0.6, dur: 0.9, vol: 0.55 * v, delay: 0.02 });
        this.tone({ type: 'sine', f0: 85, f1: 30, dur: 0.75, vol: 0.45 * v, delay: 0.02 });
        break;
      case 'whoosh':
        this.noise({ filter: 'bandpass', f0: 500, f1: 2600, q: 1.2, dur: 0.22, vol: 0.28 * v });
        break;
      case 'shadow':
        this.noise({ filter: 'bandpass', f0: 1500, f1: 300, q: 1, dur: 0.32, vol: 0.26 * v });
        this.tone({ type: 'sine', f0: 240, f1: 110, dur: 0.3, vol: 0.14 * v });
        break;
      case 'levelup':
        this.notes([523.25, 659.25, 783.99, 1046.5], 'triangle', 0.1, 0.26, 0.2 * v);
        break;
      case 'coin':
        this.tone({ type: 'square', f0: 1320, dur: 0.05, vol: 0.07 * v });
        this.tone({ type: 'square', f0: 1760, dur: 0.1, vol: 0.07 * v, delay: 0.055 });
        break;
      case 'die':
        this.tone({ type: 'sawtooth', f0: 380, f1: 70, dur: 0.55, vol: 0.2 * v });
        this.noise({ filter: 'lowpass', f0: 1200, f1: 200, dur: 0.45, vol: 0.18 * v });
        break;
      case 'pop':
        this.tone({ type: 'sine', f0: 520, f1: 180, dur: 0.09, vol: 0.12 * v });
        break;
      case 'tower':
        this.noise({ filter: 'lowpass', f0: 1400, f1: 60, dur: 1.3, vol: 0.6 * v });
        this.tone({ type: 'sine', f0: 70, f1: 24, dur: 1.2, vol: 0.6 * v });
        this.noise({ filter: 'highpass', f0: 3000, dur: 0.1, vol: 0.25 * v });
        break;
      case 'win':
        this.notes([523.25, 659.25, 783.99, 1046.5, 1318.5], 'triangle', 0.14, 0.5, 0.24 * v);
        break;
      case 'lose':
        this.notes([440, 392, 349.23, 261.63], 'sawtooth', 0.2, 0.55, 0.12 * v);
        break;
      case 'recall':
        this.tone({ type: 'sine', f0: 300, f1: 1200, dur: 0.9, vol: 0.12 * v, attack: 0.2 });
        this.tone({ type: 'triangle', f0: 450, f1: 1800, dur: 0.9, vol: 0.06 * v, attack: 0.2 });
        break;
      case 'buy':
        this.notes([988, 1319, 1976], 'square', 0.05, 0.1, 0.07 * v);
        break;
      case 'error':
        this.tone({ type: 'square', f0: 170, f1: 120, dur: 0.15, vol: 0.12 * v });
        break;
      case 'heal':
        this.notes([659.25, 880, 1318.5], 'sine', 0.07, 0.4, 0.13 * v);
        break;
      case 'announce':
        // gong singkat untuk pengumuman besar (kill beruntun, tower hancur)
        this.tone({ type: 'sawtooth', f0: 196, f1: 185, dur: 0.7, vol: 0.16 * v, attack: 0.02 });
        this.tone({ type: 'triangle', f0: 392, f1: 370, dur: 0.6, vol: 0.14 * v });
        this.tone({ type: 'sine', f0: 587.33, dur: 0.5, vol: 0.1 * v, delay: 0.08 });
        this.noise({ filter: 'bandpass', f0: 1800, f1: 600, dur: 0.3, vol: 0.1 * v });
        break;
      case 'ready':
        // item rekomendasi sudah terjangkau
        this.notes([1174.7, 1568], 'triangle', 0.08, 0.2, 0.12 * v);
        break;
      case 'ping':
        // pesan cepat dari rekan setim
        this.notes([880, 1174.7, 880], 'triangle', 0.09, 0.2, 0.17 * v);
        break;
    }
  }

  // ------------------------------------------------------------------- musik

  /** Mulai musik latar (rock prosedural, lihat rock.ts). Aman dipanggil berulang. */
  startMusic(): void {
    if (!this.ctx || this.musicTimer) return;
    this.band ??= new RockBand(this.ctx, this.music);
    this.band.start(this.ctx.currentTime + 0.25);
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 150);
    this.scheduleMusic();
    preloadVoices(this.ctx);
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.band) return;
    // musik dimatikan di pengaturan: tidak perlu menyintesis apa pun
    if (settings.master * settings.music <= 0) return;
    // Jarak pandang 1,2 detik: timer di tab latar belakang hanya jalan sekali per detik.
    this.band.schedule(ctx.currentTime + 1.2);
  }

  // --------------------------------------------------------------- announcer

  /** Ucapkan satu kalimat announcer (first blood, double kill, ...). */
  say(line: VoiceLine): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || settings.master * settings.sfx <= 0) return;
    void loadVoice(ctx, line).then((clip) => {
      if (clip && ctx.state === 'running') this.speak(clip);
    });
  }

  private speak(clip: AudioBuffer): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.02;
    const src = ctx.createBufferSource();
    src.buffer = clip;
    src.playbackRate.value = VOICE_RATE;
    src.connect(this.voiceChain());
    src.start(t);
    // musik menyingkir sebentar supaya kalimatnya terdengar jelas
    const base = settings.music * MUSIC_GAIN;
    const g = this.music.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(base * 0.35, t, 0.04);
    g.setTargetAtTime(base, t + clip.duration / VOICE_RATE + 0.3, 0.3);
  }

  /** Rantai efek announcer: sedikit saturasi, penegas vokal, gema pendek, dan gaung arena. */
  private voiceChain(): GainNode {
    if (this.voice) return this.voice;
    const ctx = this.ctx!;
    const input = (this.voice = ctx.createGain());
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 110;
    const drive = ctx.createWaveShaper();
    const curve = new Float32Array(512);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 1.8);
    drive.curve = curve;
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 2600;
    presence.Q.value = 0.8;
    presence.gain.value = 5;
    const dry = ctx.createGain();
    dry.gain.value = 1.15;
    input.connect(hp);
    hp.connect(drive);
    drive.connect(presence);
    presence.connect(dry);
    dry.connect(this.sfx);

    const slap = ctx.createDelay(0.5);
    slap.delayTime.value = 0.14;
    const slapFb = ctx.createGain();
    slapFb.gain.value = 0.28;
    const slapWet = ctx.createGain();
    slapWet.gain.value = 0.3;
    presence.connect(slap);
    slap.connect(slapFb);
    slapFb.connect(slap);
    slap.connect(slapWet);
    slapWet.connect(this.sfx);

    // gaung: noise yang meluruh sebagai respons impuls
    const len = Math.round(ctx.sampleRate * 1.3);
    const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    const hall = ctx.createConvolver();
    hall.buffer = impulse;
    const hallWet = ctx.createGain();
    hallWet.gain.value = 0.22;
    presence.connect(hall);
    hall.connect(hallWet);
    hallWet.connect(this.sfx);
    return input;
  }
}

export const sound = new SoundEngine();
