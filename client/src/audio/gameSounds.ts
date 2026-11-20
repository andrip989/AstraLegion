// Menerjemahkan event pertandingan menjadi efek suara, dilemahkan menurut jarak dari kamera.
import type { GameEvent } from '../../../shared/src';
import type { EntityViews, View } from '../render/EntityViews';
import { sound, type Sfx } from './Sound';

/** Jarak (unit dunia) saat suara sudah tidak terdengar. */
const EARSHOT = 46;

// warna khas skill (lihat server/src/game/skills)
const VOLT = 0xffd23f;
const SHADOW = 0xd946ef;
const SHADOW_DARK = 0x6b21a8;
const LEVEL_UP = 0xfff3a0;
const MINT = 0x7dffb0;

export class GameSounds {
  /** Titik dengar = titik yang dilihat kamera. */
  private ear = { x: 0, z: 0 };

  constructor(private views: EntityViews) {}

  listenAt(x: number, z: number): void {
    this.ear.x = x;
    this.ear.z = z;
  }

  private at(name: Sfx, x: number, z: number, vol = 1): void {
    const d = Math.hypot(x - this.ear.x, z - this.ear.z);
    const k = 1 - d / EARSHOT;
    if (k > 0) sound.play(name, vol * k * k);
  }

  handle(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.k) {
        case 'atk': {
          const a = this.views.get(e.a);
          if (!a) break;
          const p = a.root.position;
          const big = a.st.kind === 'hero' || a.st.kind === 'monster';
          if (a.st.kind === 'tower') this.at('zap', p.x, p.z, 0.9);
          else if (e.r) this.at('shot', p.x, p.z, big ? 0.9 : 0.4);
          else if (big) this.at('slash', p.x, p.z, 0.9);
          else this.at('hit', p.x, p.z, 0.4);
          break;
        }
        case 'cast': {
          const c = this.views.get(e.a);
          if (c) this.at('cast', c.root.position.x, c.root.position.z, 0.8);
          break;
        }
        case 'beam':
          if (!e.warn) this.at(e.w > 2.5 ? 'lance' : 'beam', (e.x0 + e.x1) / 2, (e.z0 + e.z1) / 2);
          break;
        case 'ring':
          if (e.c === VOLT) this.at('thunder', e.x, e.z, e.r >= 6 ? 1 : 0.75);
          else if (e.c === SHADOW || e.c === SHADOW_DARK) this.at('shadow', e.x, e.z);
          else if (e.c === LEVEL_UP) this.at('levelup', e.x, e.z);
          else if (e.c === MINT) this.at('cast', e.x, e.z);
          else if (e.r >= 3) this.at('boom', e.x, e.z, Math.min(1, e.r / 6));
          break;
        case 'trail':
          this.at('whoosh', e.x0, e.z0);
          break;
        case 'zone':
          this.at('whoosh', e.x, e.z, 1.2); // Titan mengangkat tinjunya
          break;
        case 'text':
          if (e.s.startsWith('+')) sound.play('coin', 0.8);
          break;
        case 'heal':
          this.at('heal', e.x, e.z, 0.8);
          break;
        case 'ping':
          sound.play('ping'); // pesan tim terdengar di mana pun kamera berada
          break;
        case 'emote': {
          const v = this.views.get(e.a);
          if (v) this.at('pop', v.root.position.x, v.root.position.z, 1.4);
          break;
        }
      }
    }
  }

  /** Unit tewas / bangunan hancur. */
  death(v: View): void {
    const p = v.root.position;
    if (v.st.kind === 'tower' || v.st.kind === 'core') this.at('tower', p.x, p.z, 1.2);
    else if (v.st.kind === 'hero') this.at('die', p.x, p.z);
    else this.at('pop', p.x, p.z, v.st.kind === 'monster' ? 1 : 0.6);
  }
}
