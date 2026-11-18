// Simulasi pertandingan (authoritative). Tidak bergantung pada Node/Socket.IO:
// server membungkusnya dengan jaringan, mode offline menjalankannya langsung di browser.
import {
  CAMPS,
  BUSH_REVEAL_RANGE,
  BUSH_REVEAL_TIME,
  CHAT_MAX,
  dayPhase,
  NIGHT_JUNGLE_GOLD,
  LANE_NAMES,
  EMOTES,
  F_BUSH,
  bushAt,
  BOT_LEVELS,
  SKINS,
  SPELLS,
  SPELL_LIST,
  PINGS,
  SHUTDOWN_GOLD,
  SHUTDOWN_STREAK,
  CORES,
  FIRST_WAVE_DELAY,
  FOUNTAINS,
  FOUNTAIN_RADIUS,
  F_BUFF,
  F_INVIS,
  F_INVULN,
  F_RECALL,
  F_SHIELD,
  F_SLOW,
  F_STUN,
  HEROES,
  HERO_LIST,
  ITEMS,
  MAX_ITEMS,
  MONSTER_RESPAWN,
  RECALL_TIME,
  SELL_REFUND,
  TEAM_NAMES,
  TEAM_SIZE,
  TOWERS,
  TOWER_RANGE,
  WAVE_INTERVAL,
  XP_SHARE_RANGE,
  laneRoute,
  xpForLevel,
  type ClientCommand,
  type EntityDyn,
  type EntityStatic,
  type GameEvent,
  type HeroDef,
  type HeroInfo,
  type JoinResult,
  type Snapshot,
  type Team,
} from '../../../shared/src';
import { Bot } from './Bot';
import { NavGrid } from './NavGrid';
import { updateMinion, updateMonster, updateTower, separateMinions } from './ai';
import { Core, Hero, Minion, Monster, Tower, Unit } from './entities';
import { castSkill, castSpell, orderAttack, orderMove, updateHero } from './heroLogic';

/** Berkah Golem: bonus damage (pecahan) dan lamanya (detik). */
const GOLEM_BUFF = 0.2;
const GOLEM_BUFF_TIME = 75;

export interface PlayerSession {
  id: string;
  name: string;
  hero: Hero;
  known: Set<number>;
  /** Waktu pesan obrolan / pesan cepat terakhir (ms), untuk pembatas laju. */
  lastChat?: number;
  lastPing?: number;
  lastEmote?: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const HERO_SPAWN_OFFSETS = [
  [0, 0],
  [2.6, 0.4],
  [-0.4, -2.6],
  [2.6, -2.6],
  [4.5, -1],
];

export class Game {
  time = 0;
  tick = 0;
  units: Unit[] = [];
  byId = new Map<number, Unit>();
  heroes: Hero[] = [];
  nav = new NavGrid();
  events: GameEvent[] = [];
  winner: Team | null = null;
  score: [number, number] = [0, 0];
  players = new Map<string, PlayerSession>();
  bots: Bot[] = [];
  /** Sudah ada hero yang tumbang di pertandingan ini. */
  private firstBlood = false;
  /** Lane yang tower terdalamnya sudah hancur (kunci: tim penyerang * 3 + lane), supaya diumumkan sekali saja. */
  private openLanes = new Set<number>();
  /** Kapan lagi tiap bangunan boleh mengirim peringatan "diserang" (kunci: id unit). */
  private alertAt = new Map<number, number>();
  /** Tingkat kesulitan bot di room ini (indeks di BOT_LEVELS); ditentukan pemain pertama yang masuk. */
  botLevel = 1;

  private nextId = 1;
  private nextWaveAt = FIRST_WAVE_DELAY;
  private waveNo = 0;
  private timers: { at: number; fn: () => void }[] = [];
  private overTimer = 0;

  constructor() {
    this.setupWorld();
  }

  // ------------------------------------------------------------------ setup

  /** Bangun ulang dunia untuk pertandingan baru (pemain manusia dipertahankan). */
  setupWorld(): void {
    const humans = [...this.players.values()].map((p) => ({ p, def: p.hero.def, team: p.hero.team }));
    this.units = [];
    this.byId.clear();
    this.heroes = [];
    this.bots = [];
    this.timers = [];
    this.events = [];
    this.time = 0;
    this.winner = null;
    this.score = [0, 0];
    this.nextWaveAt = FIRST_WAVE_DELAY;
    this.waveNo = 0;
    this.firstBlood = false;
    this.openLanes.clear();
    this.alertAt.clear();

    for (const team of [0, 1] as Team[]) {
      const core = new Core(team, CORES[team].x, CORES[team].z);
      core.radius = 3;
      core.maxHp = core.hp = 2600;
      core.name = `Core ${TEAM_NAMES[team]}`;
      this.add(core);
    }
    for (const spot of TOWERS) {
      const t = new Tower(spot.team, spot.x, spot.z);
      t.lane = spot.lane;
      t.tier = spot.tier;
      t.radius = 1.6;
      t.maxHp = t.hp = 1100 + spot.tier * 150;
      t.attackDamage = 85 + spot.tier * 10;
      t.attackRange = TOWER_RANGE;
      t.attackInterval = 1;
      t.ranged = true;
      t.name = `Tower ${TEAM_NAMES[spot.team]}`;
      this.add(t);
    }
    CAMPS.forEach((_, i) => this.spawnMonster(i));
    this.refreshStructures();

    for (const h of humans) {
      h.p.hero = this.createHero(h.def, h.team, h.p.name, h.p.id);
      h.p.known.clear();
    }
    this.fillBots();
  }

  private add<T extends Unit>(u: T): T {
    u.id = this.nextId++;
    this.units.push(u);
    this.byId.set(u.id, u);
    if (u instanceof Hero) this.heroes.push(u);
    return u;
  }

  private removeHero(h: Hero): void {
    h.alive = false;
    this.units = this.units.filter((u) => u !== h);
    this.heroes = this.heroes.filter((u) => u !== h);
    this.byId.delete(h.id);
    this.bots = this.bots.filter((b) => b.hero !== h);
  }

  private spawnPoint(team: Team, slot: number) {
    const f = FOUNTAINS[team];
    const o = HERO_SPAWN_OFFSETS[slot % HERO_SPAWN_OFFSETS.length];
    const s = team === 0 ? 1 : -1;
    return { x: f.x + o[0] * s, z: f.z + o[1] * s };
  }

  private createHero(def: HeroDef, team: Team, name: string, playerId: string | null, inherit?: Hero): Hero {
    const slot = this.heroes.filter((h) => h.team === team).length;
    const p = this.spawnPoint(team, slot);
    const h = new Hero(def, team, p.x, p.z);
    h.name = name;
    h.playerId = playerId;
    h.rot = team === 0 ? Math.PI * 0.75 : -Math.PI * 0.25;
    if (inherit) {
      h.level = inherit.level;
      h.xp = inherit.xp;
      h.gold = inherit.gold;
      h.recalc();
      h.hp = h.maxHp;
      h.mana = h.maxMana;
    }
    return this.add(h);
  }

  /** Isi slot kosong dengan bot, atau buang bot berlebih. */
  private fillBots(inherit?: Hero): void {
    for (const team of [0, 1] as Team[]) {
      let mine = this.heroes.filter((h) => h.team === team);
      while (mine.length > TEAM_SIZE) {
        const bot = mine.find((h) => h.isBot);
        if (!bot) break;
        this.removeHero(bot);
        mine = this.heroes.filter((h) => h.team === team);
      }
      while (mine.length < TEAM_SIZE) {
        const used = new Set(mine.map((h) => h.def.id));
        // bot memilih acak di antara hero yang belum dipakai timnya
        const pool = HERO_LIST.filter((d) => !used.has(d.id));
        const def = pool.length ? pool[Math.floor(Math.random() * pool.length)] : HERO_LIST[mine.length % HERO_LIST.length];
        const usedLanes = new Set(this.bots.filter((b) => b.hero.team === team).map((b) => b.lane));
        const lane = [1, 0, 2].find((l) => !usedLanes.has(l)) ?? 1;
        const hero = this.createHero(def, team, `Bot ${def.name}`, null, inherit);
        hero.spell = SPELL_LIST[Math.floor(Math.random() * SPELL_LIST.length)].id;
        this.bots.push(new Bot(hero, lane));
        mine = this.heroes.filter((h) => h.team === team);
      }
    }
  }

  // ---------------------------------------------------------------- players

  /** `wantTeam`: tim pilihan pemain; dipakai selama masih ada tempat, kalau tidak tim satunya. */
  addPlayer(id: string, rawName: string, heroId: string, wantTeam?: Team, spell?: string, skin?: number, bots?: number): JoinResult {
    const def = HEROES[heroId];
    if (!def) return { ok: false, error: 'Hero tidak dikenal.' };
    if (this.players.has(id)) this.removePlayer(id);
    const humans = [0, 0];
    for (const p of this.players.values()) humans[p.hero.team]++;
    let team: Team = wantTeam === 0 || wantTeam === 1 ? wantTeam : humans[0] <= humans[1] ? 0 : 1;
    if (humans[team] >= TEAM_SIZE) team = team === 0 ? 1 : 0;
    if (humans[team] >= TEAM_SIZE) return { ok: false, error: 'Room penuh.' };

    const name = (String(rawName ?? '').trim() || 'Pemain').slice(0, 16);
    // Ambil alih slot bot (utamakan bot dengan hero yang sama) beserta level & gold-nya.
    const teamBots = this.heroes.filter((h) => h.team === team && h.isBot);
    const replaced = teamBots.find((h) => h.def.id === heroId) ?? teamBots[0];
    if (replaced) this.removeHero(replaced);
    const hero = this.createHero(def, team, name, id, replaced);
    if (spell && SPELLS[spell]) hero.spell = spell;
    if (typeof skin === 'number' && SKINS[skin | 0]) hero.skin = skin | 0;
    // pemain pertama di room menentukan tingkat kesulitan bot untuk pertandingan itu
    if (this.players.size === 0 && typeof bots === 'number' && BOT_LEVELS[bots | 0]) {
      this.botLevel = bots | 0;
      if (this.botLevel !== 1) this.emit({ k: 'msg', s: `Tingkat bot: ${BOT_LEVELS[this.botLevel].name}` });
    }
    this.players.set(id, { id, name, hero, known: new Set() });
    this.fillBots();
    this.emit({ k: 'msg', s: `${name} bergabung ke tim ${TEAM_NAMES[team]}` });
    return { ok: true, team };
  }

  /**
   * Pemain menyambung ulang dengan socket baru: sesinya dipindah ke id baru, dan daftar unit yang
   * "sudah dikenal" dikosongkan supaya data statis semua unit dikirim ulang.
   */
  rebindPlayer(oldId: string, newId: string): boolean {
    const p = this.players.get(oldId);
    if (!p) return false;
    this.players.delete(oldId);
    p.id = newId;
    p.hero.playerId = newId;
    p.known = new Set();
    this.players.set(newId, p);
    return true;
  }

  removePlayer(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.removeHero(p.hero);
    if (this.players.size === 0) this.botLevel = 1;
    this.fillBots(p.hero);
    this.emit({ k: 'msg', s: `${p.name} keluar` });
  }

  /** Semua perintah client divalidasi di sini sebelum menyentuh simulasi. */
  handleCommand(playerId: string, cmd: ClientCommand): void {
    const p = this.players.get(playerId);
    if (!p || !cmd || typeof cmd !== 'object') return;
    // obrolan tetap jalan setelah pertandingan selesai, dan tidak membatalkan recall
    if (cmd.t === 'chat') {
      this.chat(p, cmd.s, cmd.all === true);
      return;
    }
    if (cmd.t === 'ping') {
      // pesan cepat ke tim, ditandai di posisi hero pengirim; dibatasi satu tiap 1,5 detik
      const kind = Number(cmd.kind) | 0;
      const now = Date.now();
      if (kind < 0 || kind >= PINGS.length || now - (p.lastPing ?? 0) < 1500) return;
      p.lastPing = now;
      this.emit({ k: 'ping', from: p.hero.id, name: p.hero.name, team: p.hero.team, x: r2(p.hero.x), z: r2(p.hero.z), kind });
      return;
    }
    if (cmd.t === 'emote') {
      // emote di atas kepala hero, terlihat semua pemain; dibatasi satu tiap 2 detik
      const kind = Number(cmd.kind) | 0;
      const now = Date.now();
      if (kind < 0 || kind >= EMOTES.length || now - (p.lastEmote ?? 0) < 2000) return;
      p.lastEmote = now;
      this.emit({ k: 'emote', a: p.hero.id, kind });
      return;
    }
    if (this.winner !== null) return;
    const h = p.hero;
    const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
    if (cmd.t === 'move' || cmd.t === 'attack' || cmd.t === 'cast' || cmd.t === 'spell') h.actions++;
    switch (cmd.t) {
      case 'move':
        if (fin(cmd.x) && fin(cmd.z)) orderMove(this, h, cmd.x, cmd.z);
        break;
      case 'attack':
        if (fin(cmd.id)) orderAttack(this, h, cmd.id);
        break;
      case 'cast':
        if (fin(cmd.slot) && fin(cmd.x) && fin(cmd.z)) castSkill(this, h, cmd.slot | 0, cmd.x, cmd.z);
        break;
      case 'stop':
        h.order = null;
        h.path = [];
        break;
      case 'buy':
        if (typeof cmd.item === 'string') this.buyItem(h, cmd.item);
        break;
      case 'sell':
        if (fin(cmd.slot)) this.sellItem(h, cmd.slot | 0);
        break;
      case 'recall':
        this.startRecall(h);
        break;
      case 'spell':
        if (fin(cmd.x) && fin(cmd.z)) castSpell(this, h, cmd.x, cmd.z);
        break;
    }
    // perintah apa pun selain belanja membatalkan recall yang sedang disalurkan
    if (cmd.t !== 'recall' && cmd.t !== 'buy' && cmd.t !== 'sell') h.recallAt = 0;
  }

  /** Pesan obrolan: dibersihkan, dibatasi panjang dan lajunya, lalu disiarkan lewat event. */
  private chat(p: PlayerSession, text: unknown, all: boolean): void {
    if (typeof text !== 'string') return;
    // karakter kontrol dan karakter tak terlihat (zero-width, pemisah baris Unicode) jadi spasi
    let clean = '';
    for (const ch of text.slice(0, 600)) {
      const c = ch.codePointAt(0) ?? 0;
      clean += c < 32 || c === 127 || (c >= 0x200b && c <= 0x200f) || c === 0x2028 || c === 0x2029 ? ' ' : ch;
    }
    const s = clean.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
    const now = Date.now();
    if (!s || now - (p.lastChat ?? 0) < 700) return;
    p.lastChat = now;
    this.emit({ k: 'chat', from: p.hero.id, name: p.hero.name, team: p.hero.team, s, all: all ? 1 : 0 });
  }

  // ------------------------------------------------------------ toko & recall

  /** Di base sendiri atau sedang tewas: boleh menjual item (membeli boleh di mana saja). */
  canShop(h: Hero): boolean {
    if (!h.alive) return true;
    const f = FOUNTAINS[h.team];
    return Math.hypot(h.x - f.x, h.z - f.z) < FOUNTAIN_RADIUS;
  }

  buyItem(h: Hero, id: string): boolean {
    const item = ITEMS[id];
    if (!item || h.items.length >= MAX_ITEMS || h.gold < item.cost) return false;
    h.gold -= item.cost;
    h.items.push(id);
    h.applyItems();
    return true;
  }

  sellItem(h: Hero, slot: number): boolean {
    const item = ITEMS[h.items[slot]];
    if (!item || !this.canShop(h)) return false;
    h.items.splice(slot, 1);
    h.gold += Math.floor(item.cost * SELL_REFUND);
    h.applyItems();
    return true;
  }

  startRecall(h: Hero): void {
    if (!h.alive || h.dash || h.recallAt > 0 || this.isStunned(h)) return;
    h.order = null;
    h.path = [];
    h.recallAt = this.time + RECALL_TIME;
  }

  /** Recall selesai: pindah ke titik bangkit di base. */
  finishRecall(h: Hero): void {
    h.recallAt = 0;
    this.emit({ k: 'ring', x: r2(h.x), z: r2(h.z), r: 2, c: 0x9fd8ff });
    const p = this.spawnPoint(h.team, this.heroes.filter((o) => o.team === h.team).indexOf(h));
    h.x = p.x;
    h.z = p.z;
    this.emit({ k: 'ring', x: r2(h.x), z: r2(h.z), r: 2, c: 0x9fd8ff });
  }

  // ------------------------------------------------------------------- loop

  update(dt: number): void {
    if (this.winner !== null) {
      this.overTimer -= dt;
      if (this.overTimer <= 0) this.setupWorld();
      return;
    }
    this.time += dt;
    this.tick++;

    if (this.time >= this.nextWaveAt) {
      this.nextWaveAt += WAVE_INTERVAL;
      this.spawnWave();
    }
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.time);
        for (const t of due) t.fn();
      }
    }

    for (const b of this.bots) b.update(this);
    // salin daftar: unit bisa bertambah/berkurang selama iterasi
    for (const u of this.units.slice()) {
      if (u instanceof Hero) updateHero(this, u, dt);
      else if (!u.alive) continue;
      else if (u instanceof Minion) updateMinion(this, u, dt);
      else if (u instanceof Tower) updateTower(this, u, dt);
      else if (u instanceof Monster) updateMonster(this, u, dt);
    }
    separateMinions(this);

    // buang unit non-hero yang mati
    let dead = false;
    for (const u of this.units) if (!u.alive && !(u instanceof Hero)) dead = true;
    if (dead) {
      this.units = this.units.filter((u) => {
        if (u.alive || u instanceof Hero) return true;
        this.byId.delete(u.id);
        return false;
      });
    }
  }

  clearEvents(): void {
    this.events.length = 0;
  }

  // ---------------------------------------------------------------- helpers

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  after(delay: number, fn: () => void): void {
    this.timers.push({ at: this.time + delay, fn });
  }

  speedOf(u: Unit): number {
    let s = u.moveSpeed;
    if (u.slowUntil > this.time) s *= u.slowFactor;
    if (u instanceof Hero && u.hasteUntil > this.time) s *= u.haste;
    return s;
  }

  isStunned(u: Unit): boolean {
    return u.stunUntil > this.time;
  }

  stun(u: Unit, dur: number): void {
    if (u.kind === 'tower' || u.kind === 'core') return;
    u.stunUntil = Math.max(u.stunUntil, this.time + dur);
  }

  slow(u: Unit, factor: number, dur: number): void {
    if (u.kind === 'tower' || u.kind === 'core') return;
    u.slowFactor = factor;
    u.slowUntil = Math.max(u.slowUntil, this.time + dur);
  }

  isInvisible(u: Unit): boolean {
    return u instanceof Hero && u.invisUntil > this.time;
  }

  /**
   * Hero `u` sedang tersembunyi di semak dari pandangan tim `viewer`? Tidak, bila ia baru saja
   * menyerang atau memakai skill, ada hero tim itu di semak yang sama, atau ada unit tim itu yang
   * sangat dekat. Monster netral selalu bisa melihat.
   */
  hiddenInBush(u: Unit, viewer: Team): boolean {
    if (!(u instanceof Hero) || !u.alive || viewer > 1 || u.team === viewer) return false;
    if (u.revealUntil > this.time) return false;
    const bush = bushAt(u.x, u.z);
    if (bush < 0) return false;
    for (const o of this.units) {
      if (o.team !== viewer || !o.alive || o.kind === 'tower' || o.kind === 'core') continue;
      if (Math.hypot(o.x - u.x, o.z - u.z) < BUSH_REVEAL_RANGE) return false;
      if (o instanceof Hero && bushAt(o.x, o.z) === bush) return false;
    }
    return true;
  }

  canTarget(a: Unit, t: Unit): boolean {
    if (!t.alive || t.team === a.team || t.invulnerable) return false;
    if (t.kind === 'monster' && a.kind !== 'hero') return false;
    if (this.isInvisible(t)) return false;
    if (this.hiddenInBush(t, a.team)) return false;
    return true;
  }

  /** Musuh terdekat yang bisa ditarget dalam `range` (diukur ke tepi unit). */
  nearestEnemy(a: Unit, range: number, pred?: (u: Unit) => boolean): Unit | null {
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const u of this.units) {
      if (!this.canTarget(a, u)) continue;
      if (pred && !pred(u)) continue;
      const d = Math.hypot(u.x - a.x, u.z - a.z) - u.radius;
      if (d <= range && d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  /** Unit bergerak milik lawan (hero/minion/monster) dalam radius; untuk skill area. */
  /** Hero kawan (termasuk diri sendiri) yang masih hidup dalam radius. */
  alliesNear(team: Team, x: number, z: number, r: number): Hero[] {
    return this.heroes.filter((h) => h.alive && h.team === team && Math.hypot(h.x - x, h.z - z) <= r + h.radius);
  }

  /** Pulihkan HP unit dan kabari client supaya angka penyembuhannya tampil. */
  heal(t: Unit, amount: number): void {
    if (!t.alive || amount <= 0) return;
    const before = t.hp;
    t.hp = Math.min(t.maxHp, t.hp + amount);
    const n = Math.round(t.hp - before);
    if (n > 0) this.emit({ k: 'heal', x: r2(t.x), z: r2(t.z), n });
  }

  enemiesNear(team: Team, x: number, z: number, r: number): Unit[] {
    const out: Unit[] = [];
    for (const u of this.units) {
      if (!u.alive || u.team === team || u.kind === 'tower' || u.kind === 'core') continue;
      if (Math.hypot(u.x - x, u.z - z) <= r + u.radius) out.push(u);
    }
    return out;
  }

  /** Unit lawan yang tersentuh segmen garis selebar 2*halfW; untuk beam/dash. */
  enemiesInLine(team: Team, x0: number, z0: number, x1: number, z1: number, halfW: number): Unit[] {
    const out: Unit[] = [];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len2 = dx * dx + dz * dz || 1;
    for (const u of this.units) {
      if (!u.alive || u.team === team || u.kind === 'tower' || u.kind === 'core') continue;
      const t = Math.max(0, Math.min(1, ((u.x - x0) * dx + (u.z - z0) * dz) / len2));
      if (Math.hypot(u.x - (x0 + dx * t), u.z - (z0 + dz * t)) <= halfW + u.radius) out.push(u);
    }
    return out;
  }

  underEnemyTower(x: number, z: number, team: Team): boolean {
    for (const u of this.units) {
      if (u.kind === 'tower' && u.alive && u.team !== team && Math.hypot(u.x - x, u.z - z) < TOWER_RANGE + 1) {
        return true;
      }
    }
    return false;
  }

  /** Minion terdepan sebuah tim di satu lane (dipakai bot untuk mengikuti wave). */
  leadMinion(team: Team, lane: number): Minion | null {
    let best: Minion | null = null;
    let bestScore = -Infinity;
    for (const u of this.units) {
      if (!(u instanceof Minion) || !u.alive || u.team !== team || u.lane !== lane) continue;
      const wp = u.route[u.wp];
      const score = u.wp * 1000 - Math.hypot(wp.x - u.x, wp.z - u.z);
      if (score > bestScore) {
        bestScore = score;
        best = u;
      }
    }
    return best;
  }

  // ----------------------------------------------------------------- combat

  basicAttack(a: Unit, t: Unit): void {
    let dmg = a.attackDamage;
    if (a instanceof Hero && a.buffUntil > this.time) dmg *= 1 + GOLEM_BUFF;
    if (a instanceof Hero) {
      if (a.empower > 0) {
        dmg += a.empower;
        a.empower = 0;
      }
      a.invisUntil = 0;
      a.revealUntil = this.time + BUSH_REVEAL_TIME; // menyerang membongkar persembunyian di semak
    }
    if (a.kind === 'minion' && (t.kind === 'tower' || t.kind === 'core')) dmg *= 1.5;
    a.attackCd = a.attackInterval;
    a.rot = Math.atan2(t.x - a.x, t.z - a.z);
    this.emit({ k: 'atk', a: a.id, b: t.id, r: a.ranged ? 1 : 0 });
    const before = t.hp;
    this.damage(a, t, dmg, 'attack');
    // lifesteal dari item: sebagian damage yang benar-benar masuk kembali sebagai HP
    if (a instanceof Hero && a.lifesteal > 0 && a.alive) {
      a.hp = Math.min(a.maxHp, a.hp + Math.max(0, before - Math.max(0, t.hp)) * a.lifesteal);
    }
  }

  /** `kind` 'skill' (default) ikut diperkuat bonus damage skill dari item. */
  damage(src: Unit | null, t: Unit, amount: number, kind: 'attack' | 'skill' = 'skill'): void {
    if (!t.alive || t.invulnerable || amount <= 0) return;
    // bot memukul lebih lemah / lebih keras menurut tingkat kesulitan room
    if (src instanceof Hero && src.isBot && t instanceof Hero) amount *= BOT_LEVELS[this.botLevel].damage;
    if (kind === 'skill' && src instanceof Hero) amount *= 1 + src.skillPower + (src.buffUntil > this.time ? GOLEM_BUFF : 0);
    if (t instanceof Hero) t.recallAt = 0; // terkena damage membatalkan recall
    if (t instanceof Hero && t.shield > 0) {
      const absorbed = Math.min(t.shield, amount);
      t.shield -= absorbed;
      amount -= absorbed;
    }
    if (t instanceof Monster && src) t.aggroId = src.id;
    // Bangunan diserang: kabari tim pemiliknya (tower hanya bila yang memukul hero lawan; core selalu).
    // Dibatasi per bangunan dan per tim (kunci negatif) supaya tidak membanjir; core tidak menunggu jeda tim.
    if (
      (t instanceof Core || (t instanceof Tower && src instanceof Hero)) &&
      this.time >= (this.alertAt.get(t.id) ?? 0) &&
      (t instanceof Core || this.time >= (this.alertAt.get(-1 - t.team) ?? 0))
    ) {
      this.alertAt.set(t.id, this.time + (t instanceof Core ? 10 : 14));
      this.alertAt.set(-1 - t.team, this.time + 8);
      this.emit(t instanceof Core ? { k: 'alert', team: t.team, x: r2(t.x), z: r2(t.z), core: 1 } : { k: 'alert', team: t.team, x: r2(t.x), z: r2(t.z) });
    }
    // statistik pertandingan (untuk papan skor dan MVP)
    if (t instanceof Hero) {
      const real = Math.min(amount, t.hp);
      t.dmgTaken += real;
      if (src instanceof Hero) src.dmgDealt += real;
      // catatan untuk rekap saat tumbang (hero dicatat per nama, sisanya per jenis)
      const who = src instanceof Hero ? src.name : src?.kind === 'tower' ? 'Tower' : src?.kind === 'minion' ? 'Minion' : src?.kind === 'monster' ? 'Monster' : 'Lainnya';
      t.hits.push([this.time, who, real]);
      if (t.hits.length > 60) t.hits.splice(0, t.hits.length - 60);
    }
    // angka damage untuk pemain yang menyerang (bot tidak perlu)
    if (src instanceof Hero && src.playerId && amount >= 1) {
      this.emit({ k: 'dmg', x: r2(t.x), z: r2(t.z), n: Math.round(Math.min(amount, t.hp)), to: src.id });
    }
    t.hp -= amount;
    if (t.hp <= 0) this.kill(t, src);
  }

  private addGold(h: Hero, amount: number, at: Unit): void {
    h.gold += amount;
    h.goldEarned += amount;
    this.emit({ k: 'text', x: r2(at.x), z: r2(at.z), s: `+${amount}g`, c: 0xffd23f, to: h.id });
  }

  private addXp(h: Hero, amount: number): void {
    if (h.gainXp(amount)) {
      this.emit({ k: 'ring', x: r2(h.x), z: r2(h.z), r: 3, c: 0xfff3a0 });
      this.emit({ k: 'text', x: r2(h.x), z: r2(h.z), s: `LEVEL ${h.level}`, c: 0xfff3a0, to: h.id });
    }
  }

  private kill(t: Unit, src: Unit | null): void {
    t.alive = false;
    t.hp = 0;
    this.emit({ k: 'die', a: t.id });
    const killer = src instanceof Hero ? src : null;
    const near = (range: number) =>
      this.heroes.filter((h) => h.alive && h.team !== t.team && Math.hypot(h.x - t.x, h.z - t.z) <= range);

    if (t instanceof Minion) {
      if (killer) this.addGold(killer, t.bountyGold, t);
      const share = near(XP_SHARE_RANGE);
      for (const h of share) this.addXp(h, t.bountyXp / share.length);
    } else if (t instanceof Monster) {
      if (killer) {
        // malam hari hutan lebih menguntungkan
        this.addGold(killer, Math.round(t.bountyGold * (dayPhase(this.time) === 'malam' ? NIGHT_JUNGLE_GOLD : 1)), t);
        this.addXp(killer, t.bountyXp);
      }
      // golem besar memberi Berkah Golem kepada hero yang menghabisinya
      if (killer && t.sub === 'big') {
        killer.buffUntil = this.time + GOLEM_BUFF_TIME;
        this.emit({ k: 'ring', x: r2(killer.x), z: r2(killer.z), r: 3, c: 0xffc24a });
        this.emit({ k: 'msg', s: `${killer.name} mendapat Berkah Golem (+${GOLEM_BUFF * 100}% damage)` });
      }
      const camp = t.camp;
      this.after(MONSTER_RESPAWN, () => this.spawnMonster(camp));
    } else if (t instanceof Hero) {
      t.deaths++;
      t.order = null;
      t.path = [];
      t.dash = null;
      t.shield = 0;
      t.invisUntil = 0;
      t.recallAt = 0;
      t.buffUntil = 0;
      // rekap untuk pemiliknya: empat sumber damage terbesar dalam 10 detik terakhir
      if (t.playerId) {
        const sum = new Map<string, number>();
        for (const [at, who, n] of t.hits) if (this.time - at <= 10) sum.set(who, (sum.get(who) ?? 0) + n);
        const list = [...sum].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, n]) => ({ name, n: Math.round(n) }));
        this.emit({ k: 'recap', to: t.id, list }); // selalu dikirim (meski kosong) supaya rekap lama terganti
      }
      t.hits.length = 0;
      const ended = t.streak;
      t.streak = 0;
      t.multi = 0;
      t.respawnAt = this.time + 4 + t.level * 1.5;
      if (t.team < 2) this.score[t.team === 0 ? 1 : 0]++;
      const xp = 80 + t.level * 25;
      if (killer) {
        killer.kills++;
        killer.streak++;
        killer.multi = this.time - killer.lastKillAt <= 10 ? killer.multi + 1 : 1;
        killer.lastKillAt = this.time;
        const first = !this.firstBlood;
        this.firstBlood = true;
        // Kill pertama di pertandingan memberi bonus emas; begitu juga mengakhiri amukan lawan
        // ("shut down"), makin panjang streak-nya makin besar, supaya tim yang tertinggal bisa mengejar.
        const bounty = ended >= SHUTDOWN_STREAK ? Math.min(ended, 8) * SHUTDOWN_GOLD : 0;
        this.addGold(killer, (first ? 300 : 200) + bounty, t);
        this.addXp(killer, xp);
        this.emit({ k: 'msg', s: `${killer.name} menumbangkan ${t.name}` });
        const ace = this.heroes.every((h) => h.team !== t.team || !h.alive);
        this.emit({
          k: 'kill',
          killer: killer.id,
          victim: t.id,
          multi: killer.multi,
          streak: killer.streak,
          ...(first ? { first: 1 as const } : {}),
          ...(bounty ? { end: ended, bounty } : {}),
          ...(ace ? { ace: 1 as const } : {}),
        });
      } else {
        this.emit({ k: 'msg', s: `${t.name} tumbang` });
        this.emit({ k: 'kill', killer: 0, victim: t.id, multi: 0, streak: 0 });
      }
      for (const a of near(14)) {
        if (a === killer) continue;
        a.assists++;
        this.addGold(a, 60, t);
        this.addXp(a, xp * 0.5);
      }
      this.emit({ k: 'ring', x: r2(t.x), z: r2(t.z), r: 3.5, c: 0xffffff });
    } else if (t instanceof Tower) {
      for (const h of this.heroes) {
        if (h.team === t.team) continue;
        this.addGold(h, 120, t);
        this.addXp(h, 100);
      }
      this.emit({ k: 'ring', x: t.x, z: t.z, r: 6, c: 0xffa040 });
      this.emit({ k: 'msg', s: `Tower ${TEAM_NAMES[t.team]} hancur!` });
      this.refreshStructures();
    } else if (t instanceof Core) {
      this.winner = t.team === 0 ? 1 : 0;
      this.overTimer = 12;
      this.emit({ k: 'ring', x: t.x, z: t.z, r: 12, c: 0xffffff });
      this.emit({ k: 'msg', s: `Core ${TEAM_NAMES[t.team]} hancur. Tim ${TEAM_NAMES[this.winner]} menang!` });
    }
  }

  respawnHero(h: Hero): void {
    const slot = this.heroes.filter((o) => o.team === h.team).indexOf(h);
    const p = this.spawnPoint(h.team, slot);
    h.x = p.x;
    h.z = p.z;
    h.alive = true;
    h.hp = h.maxHp;
    h.mana = h.maxMana;
    h.stunUntil = 0;
    h.slowUntil = 0;
    h.order = null;
    h.path = [];
  }

  /** Tower hanya bisa diserang jika tower di depannya sudah hancur; core setelah satu lane jebol. */
  private refreshStructures(): void {
    const towers = this.units.filter((u): u is Tower => u instanceof Tower);
    for (const team of [0, 1] as Team[]) {
      let coreOpen = false;
      for (let lane = 0; lane < 3; lane++) {
        const alive = (tier: number) => towers.some((t) => t.team === team && t.lane === lane && t.tier === tier && t.alive);
        for (const t of towers) {
          if (t.team !== team || t.lane !== lane) continue;
          t.invulnerable = t.tier > 1 && alive(t.tier - 1);
        }
        if (!alive(3)) coreOpen = true;
      }
      const core = this.units.find((u) => u instanceof Core && u.team === team);
      if (core) core.invulnerable = !coreOpen;
    }
    this.nav.setStructures(
      this.units
        .filter((u) => u.alive && (u.kind === 'tower' || u.kind === 'core'))
        .map((u) => ({ x: u.x, z: u.z, r: u.radius })),
    );
  }

  // ----------------------------------------------------------------- spawns

  private spawnMonster(camp: number): void {
    if (this.winner !== null) return;
    const c = CAMPS[camp];
    const m = new Monster(c.x, c.z);
    m.camp = camp;
    m.sub = c.big ? 'big' : 'small';
    m.name = c.big ? 'Golem Rimba' : 'Kadal Rimba';
    m.radius = c.big ? 1.3 : 0.8;
    m.maxHp = m.hp = c.big ? 1100 : 480;
    m.attackDamage = c.big ? 42 : 22;
    m.attackRange = 2;
    m.attackInterval = 1.2;
    m.moveSpeed = 6;
    m.bountyGold = c.big ? 100 : 45;
    m.bountyXp = c.big ? 140 : 60;
    this.add(m);
  }

  private spawnWave(): void {
    this.waveNo++;
    const scale = Math.min(2, 1 + 0.04 * (this.waveNo - 1));
    for (const team of [0, 1] as Team[]) {
      const core = CORES[team];
      const enemy = team === 0 ? 1 : 0;
      for (let lane = 0; lane < 3; lane++) {
        const route = laneRoute(team, lane);
        // Tower terdalam lawan di lane ini sudah hancur: tiap gelombang membawa satu minion super
        // (lebih besar, jauh lebih kuat), supaya lane yang terbuka terus menekan base lawan.
        const open = !this.units.some((u) => u instanceof Tower && u.team === enemy && u.lane === lane && u.tier === 3 && u.alive);
        if (open && !this.openLanes.has(team * 3 + lane)) {
          this.openLanes.add(team * 3 + lane);
          this.emit({ k: 'msg', s: `Lane ${LANE_NAMES[lane]} terbuka: minion super tim ${TEAM_NAMES[team]} menyerbu!` });
        }
        const dx = route[0].x - core.x;
        const dz = route[0].z - core.z;
        const d = Math.hypot(dx, dz) || 1;
        for (let i = 0; i < 4; i++) {
          const ranged = i === 3;
          const dist = 6.5 - i * 0.4;
          const side = (i - 1.5) * 1.1;
          const m = new Minion(team, core.x + (dx / d) * dist - (dz / d) * side, core.z + (dz / d) * dist + (dx / d) * side);
          m.lane = lane;
          m.sub = ranged ? 'ranged' : 'melee';
          m.name = 'Minion';
          m.radius = 0.55;
          m.ranged = ranged;
          m.maxHp = m.hp = Math.round((ranged ? 220 : 320) * scale);
          m.attackDamage = (ranged ? 22 : 13) * scale;
          m.attackRange = ranged ? 8.5 : 1.6;
          m.attackInterval = 1;
          m.attackCd = Math.random();
          m.moveSpeed = 5;
          m.bountyGold = ranged ? 26 : 20;
          m.bountyXp = ranged ? 32 : 40;
          if (open && i === 0) {
            m.sub = 'super';
            m.name = 'Minion Super';
            m.radius = 0.85;
            m.maxHp = m.hp = Math.round(m.maxHp * 2.8);
            m.attackDamage *= 2.2;
            m.bountyGold = 48;
            m.bountyXp = 75;
          }
          // offset lateral tetap supaya minion berjalan dalam formasi, bukan satu garis
          const ox = (Math.random() - 0.5) * 2.4;
          const oz = (Math.random() - 0.5) * 2.4;
          m.route = route.map((p, k) => (k === route.length - 1 ? p : { x: p.x + ox, z: p.z + oz }));
          this.add(m);
        }
      }
    }
  }

  // --------------------------------------------------------------- snapshot

  snapshotFor(p: PlayerSession): Snapshot {
    const me = p.hero;
    const now = this.time;
    const ents: EntityDyn[] = [];
    const spawn: EntityStatic[] = [];
    const seen = new Set<number>();

    for (const u of this.units) {
      if (!u.alive) continue;
      const invis = this.isInvisible(u);
      if (invis && u.team !== me.team) continue; // musuh tak terlihat tidak pernah dikirim
      if (this.hiddenInBush(u, me.team)) continue; // begitu juga musuh yang bersembunyi di semak
      let flags = 0;
      if (u instanceof Hero && bushAt(u.x, u.z) >= 0) flags |= F_BUSH;
      if (u.stunUntil > now) flags |= F_STUN;
      if (u.slowUntil > now) flags |= F_SLOW;
      if (invis) flags |= F_INVIS;
      if (u.invulnerable) flags |= F_INVULN;
      if (u instanceof Hero && u.shield > 0) flags |= F_SHIELD;
      if (u instanceof Hero && u.recallAt > 0) flags |= F_RECALL;
      if (u instanceof Hero && u.buffUntil > now) flags |= F_BUFF;
      ents.push([u.id, r2(u.x), r2(u.z), r2(u.rot), Math.ceil(u.hp), u.maxHp, flags]);
      seen.add(u.id);
      if (!p.known.has(u.id)) {
        const st: EntityStatic = { id: u.id, kind: u.kind, team: u.team, sub: u.sub, name: u.name, radius: u.radius };
        if (u instanceof Hero && u.skin > 0) st.skin = u.skin;
        spawn.push(st);
      }
    }
    const fresh = p.known.size === 0;
    p.known = seen;

    const snap: Snapshot = {
      t: r2(now),
      spawn,
      ents,
      you: {
        id: me.id,
        def: me.def.id,
        team: me.team,
        alive: me.alive,
        level: me.level,
        xp: Math.floor(me.xp),
        xpNext: xpForLevel(me.level),
        gold: Math.floor(me.gold),
        mana: Math.floor(me.mana),
        maxMana: me.maxMana,
        cds: me.cds.map((c) => Math.round(c * 10) / 10),
        respawn: me.alive ? 0 : Math.max(0, Math.ceil(me.respawnAt - now)),
        items: me.items,
        canShop: this.canShop(me),
        buyAnywhere: true,
        cdr: me.cdr,
        spell: me.spell,
        spellCd: Math.round(me.spellCd * 10) / 10,
      },
      events: this.events.filter((e) => {
        // obrolan tim hanya untuk yang setim; teks & angka damage pribadi hanya untuk pemiliknya
        if (e.k === 'chat') return e.all === 1 || e.team === me.team;
        if (e.k === 'ping' || e.k === 'alert') return e.team === me.team;
        return (e.k !== 'text' && e.k !== 'dmg' && e.k !== 'recap') || e.to === undefined || e.to === me.id;
      }),
      score: this.score,
      over: this.winner,
      nextWave: Math.max(0, Math.ceil(this.nextWaveAt - now)),
    };
    // setelah pertandingan selesai tick berhenti naik: daftar hero tetap dikirim supaya papan skor akhir memakai angka terakhir
    if (fresh || this.tick % 4 === 0 || this.winner !== null) snap.heroes = this.heroInfos();
    return snap;
  }

  private heroInfos(): HeroInfo[] {
    return this.heroes.map((h) => ({
      id: h.id,
      def: h.def.id,
      name: h.name,
      team: h.team,
      bot: h.isBot,
      level: h.level,
      mana: Math.floor(h.mana),
      maxMana: h.maxMana,
      k: h.kills,
      d: h.deaths,
      a: h.assists,
      respawn: h.alive ? 0 : Math.max(0, Math.ceil(h.respawnAt - this.time)),
      items: h.items,
      dd: Math.round(h.dmgDealt),
      dt: Math.round(h.dmgTaken),
      ge: Math.round(h.goldEarned),
    }));
  }
}
