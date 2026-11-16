// Protokol jaringan client <-> server.
import type { Team } from './constants';

export type EntityKind = 'hero' | 'minion' | 'tower' | 'core' | 'monster';

/** Data entity yang tidak berubah; dikirim sekali saat entity pertama kali terlihat. */
export interface EntityStatic {
  id: number;
  kind: EntityKind;
  team: Team;
  sub: string; // id hero / 'melee' | 'ranged' / 'small' | 'big'
  name: string;
  radius: number;
}

/** Data dinamis per tick: [id, x, z, rot, hp, maxHp, flags]. */
export type EntityDyn = [number, number, number, number, number, number, number];

export const F_STUN = 1;
export const F_INVIS = 2;
export const F_SHIELD = 4;
export const F_SLOW = 8;
export const F_INVULN = 16;

export interface HeroInfo {
  id: number;
  def: string;
  name: string;
  team: Team;
  bot: boolean;
  level: number;
  mana: number;
  maxMana: number;
  k: number;
  d: number;
  a: number;
  respawn: number; // detik tersisa, 0 jika hidup
}

export interface SelfState {
  id: number;
  def: string;
  team: Team;
  alive: boolean;
  level: number;
  xp: number;
  xpNext: number;
  gold: number;
  mana: number;
  maxMana: number;
  cds: number[]; // sisa cooldown tiap slot (detik)
  respawn: number;
}

export type GameEvent =
  | { k: 'atk'; a: number; b: number; r: 0 | 1 }
  | { k: 'beam'; x0: number; z0: number; x1: number; z1: number; w: number; c: number; warn?: 1 }
  | { k: 'ring'; x: number; z: number; r: number; c: number }
  | { k: 'trail'; x0: number; z0: number; x1: number; z1: number; c: number }
  | { k: 'text'; x: number; z: number; s: string; c: number; to?: number }
  | { k: 'msg'; s: string };

export interface Snapshot {
  t: number; // waktu pertandingan (detik)
  spawn: EntityStatic[];
  ents: EntityDyn[];
  heroes?: HeroInfo[]; // dikirim beberapa kali per detik saja
  you: SelfState;
  events: GameEvent[];
  score: [number, number];
  over: Team | null;
  nextWave: number;
}

export type ClientCommand =
  | { t: 'move'; x: number; z: number }
  | { t: 'attack'; id: number }
  | { t: 'cast'; slot: number; x: number; z: number }
  | { t: 'stop' };

export interface JoinRequest {
  name: string;
  heroId: string;
}

export interface JoinResult {
  ok: boolean;
  error?: string;
  team?: Team;
}
