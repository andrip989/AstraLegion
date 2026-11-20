// HUD: HP/mana/XP, tombol skill + cooldown, item & toko, gold, KDA, skor, jam, kill feed,
// papan skor, penyaluran recall, respawn, dan layar akhir pertandingan.
import { dayPhase, PHASE_LABEL, type DayPhase } from '../render/daylight';
import {
  BUILDS,
  DEFAULT_BUILD,
  F_RECALL,
  HEROES,
  ITEMS,
  ITEM_LIST,
  EMOTES,
  MAX_ITEMS,
  PINGS,
  SPELLS,
  SPELL_KEY,
  RECALL_TIME,
  SELL_REFUND,
  SKILL_KEYS,
  GAME_MODES,
  TEAM_NAMES,
  TITAN_PITS,
  TITAN_WARN,
  ULT_UNLOCK_LEVEL,
  nextRecommended,
  type GameEvent,
  type HeroDef,
  type HeroInfo,
  type ItemDef,
  type Snapshot,
} from '../../../shared/src';
import { sound } from '../audio/Sound';
import type { VoiceLine } from '../audio/voice';
import type { View } from '../render/EntityViews';
import { PORTRAITS } from '../render/portraits';
import { IS_TOUCH } from '../render/quality';
import { itemIcon, skillIcon } from './icons';
import { spellIcon } from './spellIcons';

const TIPS_KEY = 'astra.tips.v1';
/** Petunjuk singkat untuk pertandingan pertama. */
const TIPS = [
  IS_TOUCH ? 'Geser joystick di kiri untuk bergerak. Tombol pedang di kanan menyerang musuh terdekat.' : 'Klik kanan di tanah untuk bergerak, klik kanan musuh untuk menyerang.',
  IS_TOUCH ? 'Ketuk tombol skill untuk membidik otomatis, atau tahan dan seret untuk membidik sendiri. R terbuka di level 4.' : 'Tekan Q W E R untuk melepas skill ke arah kursor. R terbuka di level 4.',
  IS_TOUCH
    ? 'Emas didapat dari menghabisi minion. Saat cukup, tombol Rekomendasi menyala: ketuk untuk langsung membeli item.'
    : 'Emas didapat dari menghabisi minion. Saat cukup, tombol Rekomendasi menyala: klik (atau tekan G) untuk langsung membeli item.',
  IS_TOUCH ? 'HP menipis? Ketuk tombol rumah untuk pulang ke base dan pulih.' : 'HP menipis? Tekan B untuk pulang ke base dan pulih.',
  'Dua golem besar di hutan memberi berkah berbeda: Golem Rimba (sarang atas) +20% damage, Golem Arus (sarang bawah) mana pulih cepat dan cooldown lebih pendek.',
  'Titan Astra bangkit di menit ke-4 (lihat penghitung di samping jam). Tim yang menumbangkannya dapat Berkah Titan dan Raksasa Astra pendorong lane. Menghindarlah dari lingkaran merahnya!',
  IS_TOUCH
    ? 'Tombol 💬 untuk mengobrol (pilih Tim atau Semua). Tombol 📣 berisi pesan cepat untuk tim dan emote.'
    : 'Enter untuk mengobrol dengan tim, Shift+Enter dengan semua pemain. V berisi pesan cepat untuk tim dan emote.',
  IS_TOUCH
    ? 'Peta di luar jarak pandang timmu tertutup kabut: lawan di sana tidak terlihat. Tombol mata menanam suar yang menyingkap sekitarnya selama 75 detik.'
    : 'Peta di luar jarak pandang timmu tertutup kabut: lawan di sana tidak terlihat. Tekan T untuk menanam suar yang menyingkap sekitarnya selama 75 detik.',
  'Bersembunyilah di semak lebat: lawan di luar semak tidak melihatmu sampai kamu menyerang atau mereka ikut masuk.',
  'Hancurkan tower satu per satu, lalu Core musuh, untuk menang.',
];

/**
 * Pengumuman kill: judul spanduk dan kalimat announcer-nya. Setiap kill hero diumumkan ke semua
 * pemain. MULTI = kill beruntun cepat (indeks = jumlahnya), STREAK = kill tanpa mati.
 */
type KillLine = [title: string, voice: VoiceLine];
const FIRST_BLOOD: KillLine = ['FIRST BLOOD', 'first_blood'];
const EXECUTED: KillLine = ['EXECUTED', 'executed'];
const MULTI_LINES: KillLine[] = [
  ['DOUBLE KILL', 'double_kill'],
  ['TRIPLE KILL', 'triple_kill'],
  ['QUADRA KILL', 'quadra_kill'],
  ['PENTA KILL', 'penta_kill'],
];
const STREAK_LINES: KillLine[] = [
  ['FIRST KILL', 'first_kill'],
  ['SECOND KILL', 'second_kill'],
  ['KILLING SPREE', 'killing_spree'],
  ['RAMPAGE', 'rampage'],
  ['UNSTOPPABLE', 'unstoppable'],
  ['DOMINATING', 'dominating'],
  ['GODLIKE', 'godlike'],
  ['LEGENDARY', 'legendary'],
];

/** Lama pesan obrolan tampil sebelum memudar (ms), dan jumlah pesan yang disimpan. */
const CHAT_SHOW = 12000;
const CHAT_KEEP = 40;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

interface SkillEl {
  root: HTMLElement;
  cd: HTMLElement;
  cdt: HTMLElement;
}

/** Ikon tombol Suar: mata dengan sinar. */
const WARD_ICON =
  '<svg class="ico" viewBox="0 0 32 32" aria-hidden="true"><path d="M3 17c4-6.500 8.500-9.500 13-9.500S25 10.500 29 17c-4 6.500-8.500 9.500-13 9.500S7 23.500 3 17z" fill="none" stroke="currentColor" stroke-width="2.400"/><circle cx="16" cy="17" r="4.200" fill="currentColor"/><path d="M16 1.500v3M8 3.500l1.500 2.600M24 3.500l-1.500 2.600" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

export interface HudActions {
  cast(slot: number): void;
  buy(item: string): void;
  sell(slot: number): void;
  recall(): void;
  openSettings(): void;
  /** Kirim pesan obrolan: ke semua pemain (`all`) atau hanya tim sendiri. */
  chat(text: string, all: boolean): void;
  /** Kirim pesan cepat ke tim (indeks di PINGS). */
  ping(kind: number): void;
  /** Tampilkan emote di atas kepala hero sendiri (indeks di EMOTES). */
  emote(kind: number): void;
  /** Tanam suar penglihatan (tombol layar). */
  ward(): void;
  /** Pakai kemampuan aktif item di slot ini. */
  useItem(slot: number): void;
  /** Ajukan menyerah untuk tim sendiri, atau beri suara pada pemungutan yang berjalan (false = menolak). */
  surrender(vote: boolean): void;
  /** Lempar mantra tempur (tombol layar). */
  spell(): void;
  /** Tinggalkan pertandingan dan kembali ke lobby (untuk ganti hero, skin, atau room). */
  toLobby(): void;
  /** Tombol skill sedang diseret: arah seret di layar (0..1), atau null bila dibatalkan. */
  aim(slot: number, v: { x: number; y: number } | null, cancel?: boolean): void;
  /** Tombol skill yang diseret dilepas: lempar ke arah itu. */
  castAimed(slot: number, v: { x: number; y: number }): void;
}

/** Seret tombol skill sejauh ini (px) untuk mulai membidik, dan sejauh ini untuk jangkauan penuh. */
const AIM_START = 14;
const AIM_PIXELS = 72;

const SHOP_ICON = `<svg class="ico" viewBox="0 0 32 32"><path d="M4 6h4l3 14h14l3-10H10" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/><circle cx="13" cy="26" r="2.400" fill="currentColor"/><circle cx="23" cy="26" r="2.400" fill="currentColor"/></svg>`;
const RECALL_ICON = `<svg class="ico" viewBox="0 0 32 32"><path d="M5 15 16 5l11 10v12h-7v-8h-8v8H5z" fill="currentColor"/></svg>`;

export class Hud {
  private def: HeroDef | null = null;
  private skillEls: SkillEl[] = [];
  private me: HeroInfo | undefined;
  private heroes: HeroInfo[] = [];
  private lastOver: number | null = null;
  private itemsKey = '';
  private shopOpen = false;
  private boardOpen = false;
  private boardPinned = false;
  private canShop = false;
  private gold = 0;
  private items: string[] = [];
  private recallStart = 0;
  /** false bila server (versi lama) tidak mengirim data item: toko dinonaktifkan. */
  private shopSupported = true;
  /** Server mengizinkan membeli di mana saja (server lama: hanya di base). */
  private buyAnywhere = false;
  /** Item rekomendasi berikutnya dan apakah sedang bisa langsung dibeli. */
  private rec: ItemDef | null = null;
  private recReady = false;
  private recId = '';
  private lastLevel = 1;
  private lastHp = 0;
  private selfId = 0;
  private selfTeam = 0;
  private announcing = false;
  private announceQueue: [string, string, string, VoiceLine?][] = [];
  private voteTimer = 0;
  /** Sisa waktu pertandingan (mode berbatas waktu), -1 = tidak dibatasi; dan mode yang sudah ditulis di lencana. */
  private timeLeft = -1;
  private mode = '';
  private wardCd: number | undefined = -1;
  private itemCdKey = '';
  /** Isi chip buff terakhir yang digambar (supaya DOM hanya diubah saat angkanya berganti). */
  private buffKey = '';
  /** Fase hari terakhir yang ditampilkan ('' = belum ada). */
  private phase: DayPhase | '' = '';
  /** Id semua tower (dari data statis), untuk mengenali serangan tower ke hero sendiri. */
  private towerIds = new Set<number>();
  private towerWarnTimer = 0;
  private lastTowerWarn = 0;
  /** Hero kawan yang sedang ditonton selagi tumbang (0 = tidak ada). */
  spectating = 0;
  /** Tombol mantra tempur dan id mantra yang sedang ditampilkannya. */
  private spellEl: SkillEl | null = null;
  private spellId = '';
  /** Tujuan obrolan yang sedang dipilih: semua pemain atau tim sendiri. */
  private chatAll = false;
  private tipIndex = -1;
  private tipTimer = 0;

  constructor(
    mode: 'online' | 'offline',
    private actions: HudActions,
  ) {
    $('hud').classList.remove('hidden');
    const badge = $('mode-badge');
    badge.textContent = mode === 'online' ? 'ONLINE' : 'OFFLINE · LATIHAN VS BOT';
    badge.className = mode;

    const shopBtn = $('shop-btn');
    shopBtn.innerHTML = `${SHOP_ICON}<span>P</span>`;
    shopBtn.addEventListener('click', () => this.toggleShop());
    // tombol Suar (kabut perang): dibuat di sini, muncul hanya bila server mendukungnya
    const wardBtn = document.createElement('button');
    wardBtn.id = 'ward-btn';
    wardBtn.className = 'hidden';
    wardBtn.title = 'Suar (T): tanam titik penglihatan untuk menyingkap kabut';
    wardBtn.innerHTML = `${WARD_ICON}<span>T</span><b class="cd"></b>`;
    wardBtn.addEventListener('click', () => this.actions.ward());
    $('side-btns').appendChild(wardBtn);
    const recallBtn = $('recall-btn');
    recallBtn.innerHTML = `${RECALL_ICON}<span>B</span>`;
    recallBtn.addEventListener('click', () => this.actions.recall());
    $('shop-close').addEventListener('click', () => this.toggleShop(false));
    $('menu-btn').addEventListener('click', () => this.actions.openSettings());
    $('score-btn').addEventListener('click', () => {
      this.boardPinned = !this.boardPinned;
      this.showScoreboard(this.boardPinned);
    });
    // tombol Bisukan di papan skor (papan digambar ulang terus, jadi kliknya ditangkap di wadahnya)
    for (const id of ['scoreboard', 'gameover-board']) {
      $(id).addEventListener('click', (e) => {
        const name = (e.target as HTMLElement).closest<HTMLElement>('[data-mute]')?.dataset.mute;
        if (!name) return;
        if (!this.muted.delete(name)) this.muted.add(name);
        sound.play('click');
        this.feed(this.muted.has(name) ? `${name} dibisukan: obrolan, pesan cepat, dan emotenya disembunyikan.` : `${name} tidak lagi dibisukan.`);
        if (this.boardOpen) this.renderScoreboard();
        (e.target as HTMLElement).closest<HTMLElement>('[data-mute]')!.textContent = this.muted.has(name) ? 'Dibisukan' : 'Bisukan';
      });
    }
    $('quickbuy').addEventListener('click', () => this.quickBuy());
    $('tip-close').addEventListener('click', () => this.endTips());
    // pesan cepat ke tim: menu enam pesan siap pakai (tombol, tombol V, lalu angka 1-6)
    const pingMenu = $('ping-menu');
    PINGS.forEach((p, i) => {
      const b = document.createElement('button');
      b.innerHTML = `<i style="background:#${p.color.toString(16).padStart(6, '0')}"></i>${esc(p.text)}<small>${i + 1}</small>`;
      b.addEventListener('click', () => this.sendPing(i));
      pingMenu.appendChild(b);
    });
    // baris emote di menu yang sama: muncul di atas kepala hero, terlihat semua pemain
    const emotes = document.createElement('div');
    emotes.className = 'emotes';
    EMOTES.forEach((emoji, i) => {
      const b = document.createElement('button');
      b.textContent = emoji;
      b.addEventListener('click', () => {
        this.actions.emote(i);
        this.togglePing(false);
      });
      emotes.appendChild(b);
    });
    pingMenu.appendChild(emotes);
    // menyerah: ketuk dua kali (yang pertama hanya meminta kepastian), lalu tim memungut suara
    const giveUp = document.createElement('button');
    giveUp.className = 'surrender';
    giveUp.textContent = '⚑ Menyerah';
    let armed = 0;
    giveUp.addEventListener('click', () => {
      if (performance.now() - armed > 4000) {
        armed = performance.now();
        giveUp.textContent = 'Yakin menyerah? Ketuk lagi';
        setTimeout(() => (giveUp.textContent = '⚑ Menyerah'), 4000);
        return;
      }
      armed = 0;
      giveUp.textContent = '⚑ Menyerah';
      this.actions.surrender(true);
      this.togglePing(false);
    });
    pingMenu.appendChild(giveUp);
    // panel pemungutan suara menyerah dan pemberitahuan bot pengganti
    const vote = document.createElement('div');
    vote.id = 'vote';
    vote.className = 'hidden';
    vote.innerHTML = '<span id="vote-text"></span><button id="vote-yes" type="button">Setuju</button><button id="vote-no" type="button">Tolak</button>';
    $('hud').appendChild(vote);
    vote.querySelector('#vote-yes')!.addEventListener('click', () => this.actions.surrender(true));
    vote.querySelector('#vote-no')!.addEventListener('click', () => this.actions.surrender(false));
    const idle = document.createElement('div');
    idle.id = 'afk-note';
    idle.className = 'hidden';
    idle.textContent = IS_TOUCH ? 'Bot menggantikanmu karena kamu diam. Gerakkan joystick untuk bermain lagi.' : 'Bot menggantikanmu karena kamu diam. Klik atau tekan tombol skill untuk bermain lagi.';
    $('hud').appendChild(idle);
    $('ping-btn').addEventListener('click', () => this.togglePing());
    $('gameover-lobby').addEventListener('click', () => this.actions.toLobby());
    $('spectate-btn').addEventListener('click', () => this.nextSpectate());
    // elemen tambahan dibuat di sini (bukan di index.html): rekap damage dan peringatan tower
    const recap = document.createElement('div');
    recap.id = 'respawn-recap';
    $('respawn').insertBefore(recap, $('spectate-btn'));
    // penghitung Titan Astra di bar atas, dan chip buff di atas panel hero
    const chip = document.createElement('span');
    chip.id = 'titan-chip';
    chip.title = 'Titan Astra: boss di sarang golem. Tim penakluknya mendapat Berkah Titan dan Raksasa Astra.';
    $('topbar').appendChild(chip);
    const buffs = document.createElement('div');
    buffs.id = 'buffs';
    $('hud').appendChild(buffs);
    const warn = document.createElement('div');
    warn.id = 'tower-warn';
    warn.className = 'hidden';
    warn.textContent = '⚠ Tower membidikmu!';
    $('hud').appendChild(warn);
    addEventListener('keydown', (e) => {
      if (pingMenu.classList.contains('hidden') || e.target instanceof HTMLInputElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= PINGS.length) this.sendPing(n - 1);
      else if (e.key === 'Escape') this.togglePing(false);
    });
    $('chat-btn').addEventListener('click', () => (this.isChatOpen ? this.closeChat() : this.openChat()));
    $('chat-scope').addEventListener('click', () => {
      this.setChatScope(!this.chatAll);
      $('chat-input').focus();
    });
    $('chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $<HTMLInputElement>('chat-input');
      const text = input.value.trim();
      if (text) this.actions.chat(text, this.chatAll);
      input.value = '';
      this.closeChat();
    });
    $('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeChat();
      else if (e.key === 'Tab') {
        e.preventDefault();
        this.setChatScope(!this.chatAll);
      }
    });
    this.buildShop();
    this.renderItems([]);
    try {
      if (!localStorage.getItem(TIPS_KEY)) this.tipTimer = window.setTimeout(() => this.nextTip(), 2500);
    } catch {
      /* tanpa penyimpanan: petunjuk dilewati */
    }
  }

  // ------------------------------------------------------ petunjuk pemain baru

  private nextTip(): void {
    this.tipIndex++;
    if (this.tipIndex >= TIPS.length) {
      this.endTips();
      return;
    }
    $('tip-text').textContent = TIPS[this.tipIndex];
    $('tip-count').textContent = `${this.tipIndex + 1}/${TIPS.length}`;
    const box = $('tip');
    box.classList.remove('hidden');
    // ulangi animasi masuk untuk tiap petunjuk
    box.classList.remove('show');
    void box.offsetWidth;
    box.classList.add('show');
    this.tipTimer = window.setTimeout(() => this.nextTip(), 8000);
  }

  private endTips(): void {
    clearTimeout(this.tipTimer);
    $('tip').classList.add('hidden');
    try {
      localStorage.setItem(TIPS_KEY, '1');
    } catch {
      /* abaikan */
    }
  }

  // ------------------------------------------------------------- pengumuman

  /**
   * Spanduk besar di tengah-atas layar (kill, tower hancur), satu per satu. `kind`: good | bad |
   * info. `voice` = kalimat announcer yang diucapkan bersamaan.
   */
  announce(title: string, sub: string, kind: string, voice?: VoiceLine): void {
    if (this.announcing) {
      if (this.announceQueue.length < 5) this.announceQueue.push([title, sub, kind, voice]);
      return;
    }
    this.announcing = true;
    const box = $('announce');
    box.className = kind;
    $('announce-title').textContent = title;
    $('announce-sub').textContent = sub;
    void box.offsetWidth; // mulai ulang animasi
    box.classList.add('show');
    sound.play('announce', voice ? 0.55 : 1);
    if (voice) sound.say(voice);
    const next = () => {
      box.className = 'hidden';
      this.announcing = false;
      const queued = this.announceQueue.shift();
      if (queued) this.announce(...queued);
    };
    // saat kill beruntun, spanduk dipersingkat supaya pengumuman tidak tertinggal dari kejadiannya
    const wait = () => (this.announceQueue.length ? next() : setTimeout(next, 900));
    setTimeout(wait, 1700);
  }

  /** Setiap hero yang tumbang diumumkan (spanduk + suara) ke semua pemain. */
  private onKill(e: Extract<GameEvent, { k: 'kill' }>): void {
    const killer = this.heroes.find((h) => h.id === e.killer);
    const victim = this.heroes.find((h) => h.id === e.victim);
    if (!victim) return;
    const meDown = e.victim === this.selfId;
    const good = killer ? killer.team === this.selfTeam : victim.team !== this.selfTeam;
    let line: KillLine;
    if (!killer) line = EXECUTED;
    else if (e.first) line = FIRST_BLOOD;
    else if (e.multi >= 2) line = MULTI_LINES[Math.min(e.multi, 5) - 2];
    else line = STREAK_LINES[Math.min(Math.max(e.streak, 1), STREAK_LINES.length) - 1];
    const sub = !killer
      ? `${meDown ? 'Kamu' : victim.name} tumbang`
      : `${e.killer === this.selfId ? 'Kamu' : killer.name} menumbangkan ${meDown ? 'kamu' : victim.name}`;
    this.announce(line[0], sub, good ? 'good' : 'bad', line[1]);
    // layar tumbang: siapa yang menumbangkan, lalu kamera menonton kawan yang masih hidup
    if (meDown) {
      $('respawn-by').textContent = killer ? `Ditumbangkan oleh ${killer.name} (${HEROES[killer.def]?.name ?? killer.def})` : 'Tumbang oleh tower atau minion';
      this.spectating = 0;
      this.nextSpectate();
    }
    // amukan korban diakhiri: pembunuhnya dapat emas tambahan
    if (killer && e.end) {
      const who = e.killer === this.selfId ? 'Kamu' : killer.name;
      this.announce('SHUT DOWN', `${who} mengakhiri amukan ${meDown ? 'kamu' : victim.name}${e.bounty ? ` · +${e.bounty} emas` : ''}`, good ? 'good' : 'bad', 'shut_down');
    }
    // seluruh tim korban sedang tumbang
    if (e.ace) this.announce('WIPED OUT', `Tim ${TEAM_NAMES[victim.team]} tersapu habis`, good ? 'good' : 'bad', 'wiped_out');
  }

  // ---------------------------------------------------------------- obrolan

  get isChatOpen(): boolean {
    return !$('chat-form').classList.contains('hidden');
  }

  /** Buka kotak tulis. `all` memilih tujuan; tanpa itu dipakai tujuan terakhir. */
  openChat(all?: boolean): void {
    if (all !== undefined) this.setChatScope(all);
    else this.setChatScope(this.chatAll);
    $('chat').classList.add('open');
    $('chat-form').classList.remove('hidden');
    const log = $('chat-log');
    log.scrollTop = log.scrollHeight;
    $('chat-input').focus();
  }

  closeChat(): void {
    $('chat').classList.remove('open');
    $('chat-form').classList.add('hidden');
    const input = $<HTMLInputElement>('chat-input');
    input.value = '';
    input.blur();
  }

  private setChatScope(all: boolean): void {
    this.chatAll = all;
    const btn = $('chat-scope');
    btn.textContent = all ? 'Semua' : 'Tim';
    btn.classList.toggle('all', all);
    $<HTMLInputElement>('chat-input').placeholder = all ? 'Pesan ke semua pemain…' : 'Pesan ke tim…';
  }

  private addChat(e: Extract<GameEvent, { k: 'chat' }>): void {
    this.chatRow(e.all ? '[Semua]' : '[Tim]', e.all ? 'all' : 'team', e.name, e.team, e.s);
    if (e.from !== this.selfId) sound.play('click', 0.7);
  }

  /** Satu baris di log obrolan. `mark` = warna titik penanda di depan teks (pesan cepat). */
  private chatRow(tag: string, tagClass: string, name: string, team: number, message: string, mark?: number): void {
    const log = $('chat-log');
    const row = document.createElement('div');
    const scope = document.createElement('i');
    scope.textContent = tag;
    scope.className = tagClass;
    const who = document.createElement('b');
    who.textContent = `${name}:`;
    who.className = team === 0 ? 'blue' : 'red';
    const text = document.createElement('span');
    text.textContent = message;
    row.append(scope, ' ', who, ' ');
    if (mark !== undefined) {
      const dot = document.createElement('u');
      dot.style.background = '#' + mark.toString(16).padStart(6, '0');
      row.append(dot, ' ');
    }
    row.append(text);
    log.appendChild(row);
    while (log.children.length > CHAT_KEEP) log.firstChild!.remove();
    log.scrollTop = log.scrollHeight;
    // pesan lama memudar; saat kotak tulis dibuka semuanya terlihat lagi
    setTimeout(() => row.classList.add('old'), CHAT_SHOW);
  }

  /** Tower musuh baru saja menembak hero sendiri: tanda bahaya singkat (suara paling sering tiap 3 detik). */
  private towerWarning(): void {
    const el = $('tower-warn');
    el.classList.remove('hidden');
    clearTimeout(this.towerWarnTimer);
    this.towerWarnTimer = window.setTimeout(() => el.classList.add('hidden'), 1300);
    const now = performance.now();
    if (now - this.lastTowerWarn > 3000) {
      this.lastTowerWarn = now;
      sound.play('error', 0.8);
    }
  }

  // ------------------------------------------------------------ menonton kawan

  /** Pindah ke kawan berikutnya yang masih hidup (dipakai saat hero sendiri tumbang). */
  private nextSpectate(): void {
    const allies = this.heroes.filter((h) => h.team === this.selfTeam && h.id !== this.selfId && h.respawn === 0);
    const at = allies.findIndex((h) => h.id === this.spectating);
    const next = allies.length ? allies[(at + 1) % allies.length] : undefined;
    this.spectating = next?.id ?? 0;
    const btn = $('spectate-btn');
    btn.classList.toggle('hidden', !next);
    if (next) btn.textContent = `Menonton ${next.name}${allies.length > 1 ? ' · ketuk untuk ganti' : ''}`;
  }

  // ------------------------------------------------------------ pesan cepat

  /** Buka/tutup menu pesan cepat. */
  togglePing(on = $('ping-menu').classList.contains('hidden')): void {
    $('ping-menu').classList.toggle('hidden', !on);
    $('ping-btn').classList.toggle('on', on);
  }

  private sendPing(kind: number): void {
    this.actions.ping(kind);
    this.togglePing(false);
  }

  // ------------------------------------------------------------ beli-cepat

  /** Beli item rekomendasi berikutnya (klik tombol Rekomendasi atau tombol G). */
  quickBuy(): void {
    if (!this.rec) return;
    if (!this.recReady) {
      sound.play('error');
      return;
    }
    this.actions.buy(this.rec.id);
    sound.play('buy');
  }

  private refreshQuickBuy(level: number): void {
    const box = $('quickbuy');
    const rec = this.shopSupported && this.def ? nextRecommended(this.def.id, this.items) : null;
    this.rec = rec;
    box.classList.toggle('hidden', !rec);
    if (!rec) {
      this.recReady = false;
      this.lastLevel = level;
      return;
    }
    if (rec.id !== this.recId) {
      this.recId = rec.id;
      $('qb-icon').innerHTML = itemIcon(rec.id);
      $('qb-name').textContent = rec.name;
      $('qb-desc').textContent = rec.desc;
      $('qb-cost').textContent = String(rec.cost);
    }
    const afford = this.gold >= rec.cost;
    const canBuy = this.buyAnywhere || this.canShop;
    const ready = afford && canBuy;
    box.classList.toggle('ready', ready);
    box.classList.toggle('far', afford && !canBuy);
    if (!ready) box.classList.remove('pop');
    $('qb-fill').style.width = `${Math.min(100, (this.gold / rec.cost) * 100)}%`;
    $('qb-state').textContent = ready ? (IS_TOUCH ? 'Ketuk untuk beli' : 'Klik / G untuk beli') : afford ? 'Pulang ke base untuk beli' : `Kurang ${rec.cost - this.gold} emas`;
    // sorot saat baru terjangkau, dan lagi tiap naik level selama emasnya cukup
    if (ready && (!this.recReady || level > this.lastLevel)) {
      box.classList.remove('pop');
      void box.offsetWidth;
      box.classList.add('pop');
      sound.play('ready');
    }
    this.recReady = ready;
    this.lastLevel = level;
  }

  private buildSkills(def: HeroDef): void {
    this.def = def;
    const box = $('skills');
    box.innerHTML = '';
    this.skillEls = [];
    const accent = '#' + def.accent.toString(16).padStart(6, '0');
    $('hero-name').textContent = def.name;
    $('status').style.setProperty('--sc', accent);
    const portrait = PORTRAITS[def.id];
    $('hero-portrait').style.backgroundImage = portrait ? `url(${portrait})` : '';
    def.skills.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = i === 3 ? 'skill ult' : 'skill';
      el.style.setProperty('--sc', accent);
      el.innerHTML = `${skillIcon(s.id)}<span class="key">${SKILL_KEYS[i]}</span><span class="mana">${s.mana}</span><div class="cd"></div><span class="cdt"></span>`;
      // Tekan-lepas = bidik otomatis ke musuh terdekat. Seret = bidik sendiri: penanda muncul di
      // tanah; lepas untuk melempar, atau lepas di atas tombol Batal untuk mengurungkan.
      let press: { id: number; x: number; y: number; aiming: boolean } | null = null;
      const cancelBox = $('aim-cancel');
      const pull = (p: { x: number; y: number }, e: PointerEvent) => {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        const k = Math.min(1, AIM_PIXELS / (Math.hypot(dx, dy) || 1));
        return { x: (dx * k) / AIM_PIXELS, y: (dy * k) / AIM_PIXELS };
      };
      const overCancel = (e: PointerEvent) => {
        const r = cancelBox.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        press = { id: e.pointerId, x: e.clientX, y: e.clientY, aiming: false };
      });
      el.addEventListener('pointermove', (e) => {
        if (!press || e.pointerId !== press.id) return;
        if (!press.aiming) {
          if (s.target === 'self' || Math.hypot(e.clientX - press.x, e.clientY - press.y) < AIM_START) return;
          press.aiming = true;
          el.classList.add('aiming');
          cancelBox.classList.remove('hidden');
        }
        const cancel = overCancel(e);
        cancelBox.classList.toggle('on', cancel);
        this.actions.aim(i, pull(press, e), cancel);
      });
      const release = (e: PointerEvent, aborted: boolean) => {
        if (!press || e.pointerId !== press.id) return;
        const p = press;
        press = null;
        // diperiksa sebelum tombol Batal disembunyikan (setelah itu ukurannya nol)
        const cancelled = aborted || (p.aiming && overCancel(e));
        el.classList.remove('aiming');
        cancelBox.classList.add('hidden');
        cancelBox.classList.remove('on');
        if (!p.aiming) {
          if (!aborted) this.actions.cast(i);
        } else if (cancelled) {
          this.actions.aim(i, null);
        } else {
          this.actions.castAimed(i, pull(p, e));
        }
      };
      el.addEventListener('pointerup', (e) => release(e, false));
      el.addEventListener('pointercancel', (e) => release(e, true));
      el.addEventListener('pointerenter', () =>
        this.tip(
          `<b>${SKILL_KEYS[i]} · ${s.name}</b><br>${s.desc}<br><small>Cooldown ${s.cooldown} dtk · Mana ${s.mana}${s.range ? ` · Jarak ${s.range}` : ''}${i === 3 ? ` · Terbuka di level ${ULT_UNLOCK_LEVEL}` : ''}</small>`,
        ),
      );
      el.addEventListener('pointerleave', () => this.tip(null));
      box.appendChild(el);
      this.skillEls.push({ root: el, cd: el.querySelector('.cd')!, cdt: el.querySelector('.cdt')! });
    });
    // tombol kelima: mantra tempur (isinya diisi saat server memberi tahu mantra mana yang dibawa)
    const sp = document.createElement('div');
    sp.className = 'skill spell hidden';
    sp.innerHTML = `<i class="spell-ico"></i><span class="key">${SPELL_KEY}</span><div class="cd"></div><span class="cdt"></span>`;
    sp.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.actions.spell();
    });
    sp.addEventListener('pointerenter', () => {
      const d = SPELLS[this.spellId];
      if (d) this.tip(`<b>${SPELL_KEY} · ${d.name}</b><br>${d.desc}<br><small>Mantra tempur · Cooldown ${d.cooldown} dtk · Tanpa mana</small>`);
    });
    sp.addEventListener('pointerleave', () => this.tip(null));
    box.appendChild(sp);
    this.spellEl = { root: sp, cd: sp.querySelector('.cd')!, cdt: sp.querySelector('.cdt')! };
    this.spellId = '';
  }

  private tip(html: string | null): void {
    const tip = $('tooltip');
    if (html) tip.innerHTML = html;
    tip.classList.toggle('hidden', !html);
  }

  // -------------------------------------------------------------- item & toko

  private buildShop(): void {
    const list = $('shop-list');
    list.innerHTML = '';
    for (const it of ITEM_LIST) {
      const el = document.createElement('button');
      el.className = 'shop-item';
      el.dataset.id = it.id;
      el.innerHTML = `${itemIcon(it.id)}<span class="nm">${it.name}</span><span class="ds">${it.desc}</span><span class="cost">${it.cost}</span><span class="rec hidden"></span>`;
      el.addEventListener('click', () => {
        if (el.classList.contains('off')) {
          sound.play('error');
          return;
        }
        this.actions.buy(it.id);
        sound.play('buy');
      });
      list.appendChild(el);
    }
  }

  private renderItems(items: string[]): void {
    const box = $('items');
    box.innerHTML = '';
    for (let i = 0; i < MAX_ITEMS; i++) {
      const id = items[i];
      const def = id ? ITEMS[id] : undefined;
      const el = document.createElement('div');
      el.className = def ? 'item' : 'item empty';
      if (def) {
        // item aktif: nomor tombolnya di pojok, dan lapisan jeda yang diisi tiap pembaruan (lihat update)
        el.innerHTML = itemIcon(def.id) + (def.active ? `<small class="key">${i + 1}</small><b class="cd"></b>` : '');
        if (def.active) el.classList.add('usable');
        const refund = Math.floor(def.cost * SELL_REFUND);
        const how = def.active ? (IS_TOUCH ? 'Ketuk untuk memakai. ' : `Klik atau tekan ${i + 1} untuk memakai. `) : '';
        el.addEventListener('pointerenter', () => this.tip(`<b>${def.name}</b><br>${def.desc}<br><small>${how}Klik saat toko terbuka untuk menjual (+${refund} emas)</small>`));
        el.addEventListener('pointerleave', () => this.tip(null));
        el.addEventListener('click', () => {
          if (this.shopOpen && this.canShop) {
            this.actions.sell(i);
            sound.play('coin');
          } else if (def.active && !this.shopOpen) {
            this.actions.useItem(i);
          }
        });
      }
      box.appendChild(el);
    }
  }

  private refreshShop(): void {
    $('shop-gold').textContent = `${this.gold} emas`;
    const full = this.items.length >= MAX_ITEMS;
    const canBuy = this.buyAnywhere || this.canShop;
    $('shop-note').textContent = !this.shopSupported
      ? 'Server ini memakai versi lama yang belum mendukung toko.'
      : !canBuy
        ? 'Belanja hanya bisa di base (tekan B untuk pulang) atau saat menunggu bangkit.'
        : full
          ? 'Tas penuh. Jual item (klik item di tasmu) saat berada di base.'
          : 'Klik item untuk membeli. Angka emas = urutan yang disarankan untuk heromu. Menjual hanya bisa di base.';
    const build = this.def ? (BUILDS[this.def.id] ?? DEFAULT_BUILD) : [];
    for (const el of $('shop-list').children) {
      const def = ITEMS[(el as HTMLElement).dataset.id!];
      el.classList.toggle('off', !this.shopSupported || !canBuy || full || this.gold < def.cost);
      el.classList.toggle('poor', this.gold < def.cost);
      // lencana urutan rekomendasi; item berikutnya disorot
      const order = build.indexOf(def.id);
      const badge = el.querySelector('.rec') as HTMLElement;
      badge.textContent = order >= 0 ? String(order + 1) : '';
      badge.classList.toggle('hidden', order < 0);
      el.classList.toggle('next', this.rec?.id === def.id);
    }
  }

  toggleShop(force?: boolean): void {
    this.shopOpen = force ?? !this.shopOpen;
    $('shop').classList.toggle('hidden', !this.shopOpen);
    $('shop-btn').classList.toggle('on', this.shopOpen);
    if (this.shopOpen) this.refreshShop();
    sound.play('click');
  }

  get isShopOpen(): boolean {
    return this.shopOpen;
  }

  // -------------------------------------------------------------- papan skor

  showScoreboard(on: boolean): void {
    on = on || this.boardPinned;
    if (on === this.boardOpen) return;
    this.boardOpen = on;
    $('scoreboard').classList.toggle('hidden', !on);
    if (on) this.renderScoreboard();
  }

  private renderScoreboard(): void {
    $('scoreboard').innerHTML = this.boardHtml(null);
  }

  /**
   * Tabel kedua tim: level, KDA, damage ke hero lawan, emas, item. `winner` (tim pemenang, di
   * layar akhir pertandingan) menandai MVP: pemain tim itu dengan kontribusi tertinggi.
   */
  /** Nama pemain yang dibisukan di perangkat ini (sampai halaman dimuat ulang). */
  private muted = new Set<string>();

  get hasMuted(): boolean {
    return this.muted.size > 0;
  }

  /** Peristiwa ini berasal dari pemain yang dibisukan? (obrolan, pesan cepat, emote) */
  isMuted(e: GameEvent): boolean {
    if (e.k === 'chat' || e.k === 'ping') return this.muted.has(e.name);
    if (e.k === 'emote') {
      const who = this.heroes.find((h) => h.id === e.a);
      return !!who && this.muted.has(who.name);
    }
    return false;
  }

  private boardHtml(winner: number | null): string {
    // kill dan assist dihargai, mati mengurangi, damage ke hero lawan menambah
    const score = (h: HeroInfo) => h.k * 3 + h.a * 1.5 - h.d * 1.2 + (h.dd ?? 0) / 400;
    const mvp = winner === null ? undefined : this.heroes.filter((h) => h.team === winner).sort((a, b) => score(b) - score(a))[0];
    const final = winner !== null;
    const stats = this.heroes.some((h) => h.dd !== undefined); // server lama tidak mengirim statistik
    const num = (n: number | undefined) => (n === undefined ? '' : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
    const row = (h: HeroInfo) => {
      const def = HEROES[h.def];
      const items = (h.items ?? []).map((id) => `<i>${itemIcon(id)}</i>`).join('');
      // pemain manusia lain bisa dibisukan (obrolan, pesan cepat, dan emotenya disembunyikan di perangkat ini)
      const muted = this.muted.has(h.name);
      const mute = h.bot || h.id === this.me?.id ? '' : ` <button type="button" class="mute${muted ? ' on' : ''}" data-mute="${esc(h.name)}" title="${muted ? 'Tampilkan lagi obrolan pemain ini' : 'Sembunyikan obrolan, pesan cepat, dan emote pemain ini'}">${muted ? 'Dibisukan' : 'Bisukan'}</button>`;
      return `<tr class="${h.id === this.me?.id ? 'me' : ''}${!final && h.respawn > 0 ? ' dead' : ''}">
        <td class="lv">${h.level}</td><td class="nm">${esc(h.name)}${h.bot ? ' <small>bot</small>' : ''}${h === mvp ? ' <b class="mvp">MVP</b>' : ''}${mute}</td><td class="hr">${def?.name ?? h.def}</td>
        <td class="kda">${h.k} / ${h.d} / ${h.a}</td>${stats ? `<td class="num">${num(h.dd)}</td><td class="num gold">${num(h.ge)}</td>` : ''}
        <td class="its">${items}</td>${final ? '' : `<td>${h.respawn > 0 ? `${h.respawn}s` : ''}</td>`}</tr>`;
    };
    const head = `<thead><tr><th class="lv"></th><th>Pemain</th><th class="hr">Hero</th><th class="kd">K / D / A</th>${stats ? '<th class="nu">Damage</th><th class="nu">Emas</th>' : ''}<th class="it">Item</th>${final ? '' : '<th class="rs"></th>'}</tr></thead>`;
    const team = (t: number) =>
      `<table class="t${t}"><caption>Tim ${TEAM_NAMES[t]}${t === winner ? ' · menang' : ''}</caption>${head}<tbody>${this.heroes
        .filter((h) => h.team === t)
        .map(row)
        .join('')}</tbody></table>`;
    return team(0) + team(1);
  }

  // ------------------------------------------------------------------ umum

  feed(text: string): void {
    const box = $('feed');
    const el = document.createElement('div');
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 5) box.firstChild!.remove();
    setTimeout(() => el.remove(), 6500);
  }

  /** Info jaringan di pojok: kode room pribadi dan latensi ke server (ms). */
  setNet(room: string, latency: number | null): void {
    const el = $('net');
    const text = [room ? `Room ${room}` : '', latency !== null ? `${latency} ms` : ''].filter(Boolean).join(' · ');
    if (el.textContent !== text) el.textContent = text;
    el.className = !text ? 'hidden' : latency === null ? '' : latency < 120 ? 'good' : latency < 250 ? 'mid' : 'bad';
  }

  setFps(fps: number, show: boolean): void {
    const el = $('fps');
    el.classList.toggle('hidden', !show);
    if (show) el.textContent = `${fps} FPS`;
  }

  /** Isi ringkasan di layar akhir pertandingan (KDA, XP akun, dsb.). */
  setMatchSummary(html: string): void {
    $('gameover-stats').innerHTML = html;
  }

  /** Data hero sendiri dari server (level, KDA). */
  get self(): HeroInfo | undefined {
    return this.me;
  }

  update(s: Snapshot, self: View | undefined): void {
    const y = s.you;
    if (!this.def || this.def.id !== y.def) {
      const def = HEROES[y.def];
      if (def) this.buildSkills(def);
    }
    if (s.heroes) {
      this.heroes = s.heroes;
      this.me = s.heroes.find((h) => h.id === y.id);
      if (this.boardOpen) this.renderScoreboard();
      if (this.lastOver !== null) $('gameover-board').innerHTML = this.boardHtml(this.lastOver);
    }
    this.selfId = y.id;
    this.selfTeam = y.team;
    for (const st of s.spawn) if (st.kind === 'tower') this.towerIds.add(st.id);
    for (const e of s.events) {
      if (e.k === 'atk' && e.b === y.id && y.alive && this.towerIds.has(e.a)) this.towerWarning();
      else if (e.k === 'recap') {
        $('respawn-recap').innerHTML = e.list.map((r) => `<span>${esc(r.name)} <b>${r.n}</b></span>`).join('');
      }
      if (e.k === 'msg') {
        this.feed(e.s);
        if (e.s.startsWith('Tower ')) this.announce('TOWER HANCUR', e.s, e.s.includes(TEAM_NAMES[y.team]) ? 'bad' : 'good', 'tower');
      } else if (e.k === 'kill') {
        this.onKill(e);
      } else if (e.k === 'chat') {
        this.addChat(e);
      } else if (e.k === 'vote') {
        const box = $('vote');
        if (e.done) {
          box.classList.add('hidden');
          if (e.done === 'fail') this.feed('Pemungutan suara menyerah tidak lolos.');
        } else {
          $('vote-text').textContent = `${e.by} mengajukan menyerah · ${e.yes}/${e.need} setuju · ${e.left} dtk`;
          if (box.classList.contains('hidden')) {
            box.classList.remove('hidden');
            sound.play('ping');
          }
          clearTimeout(this.voteTimer);
          this.voteTimer = window.setTimeout(() => box.classList.add('hidden'), (e.left + 1) * 1000);
        }
      } else if (e.k === 'titan') {
        const pit = TITAN_PITS[e.pit]?.name ?? 'sarangnya';
        if (e.s === 'soon') {
          this.feed(`Titan Astra bangkit ${TITAN_WARN} detik lagi di ${pit}.`);
          sound.play('ping');
        } else if (e.s === 'spawn') {
          this.announce('TITAN BANGKIT', `Titan Astra muncul di ${pit}`, 'info', 'titan');
        } else {
          const mine = e.team === y.team;
          this.announce('TITAN TUMBANG', mine ? 'Timmu mendapat Berkah Titan dan Raksasa Astra' : 'Tim lawan mendapat Berkah Titan dan Raksasa Astra', mine ? 'good' : 'bad', 'titan_slain');
        }
      } else if (e.k === 'alert') {
        this.feed(e.core ? '⚠ Core kita diserang!' : '⚠ Tower kita diserang!');
        sound.play('ping');
      } else if (e.k === 'ping') {
        const p = PINGS[e.kind];
        if (p) this.chatRow('[Tim]', 'team', e.name, e.team, p.text, p.color);
      }
    }

    // bar
    const hp = y.alive && self ? self.hp : 0;
    const maxHp = self ? self.maxHp : 1;
    // tepi layar memerah saat HP menipis, dan berkedip saat terkena pukulan besar
    const frac = hp / maxHp;
    const hurt = $('hurt');
    hurt.style.opacity = y.alive && frac < 0.4 ? String(Math.min(0.9, ((0.4 - frac) / 0.4) * 0.9)) : '0';
    hurt.classList.toggle('pulse', y.alive && frac < 0.2);
    if (y.alive && this.lastHp - hp > maxHp * 0.06) {
      hurt.classList.remove('flash');
      void hurt.offsetWidth;
      hurt.classList.add('flash');
    }
    this.lastHp = hp;
    document.body.classList.toggle('dead', !y.alive && s.over === null);
    $('hp-fill').style.transform = `scaleX(${Math.max(0, Math.min(1, hp / maxHp))})`;
    $('hp-text').textContent = self ? `${hp} / ${maxHp}` : '';
    $('mp-fill').style.transform = `scaleX(${y.maxMana ? y.mana / y.maxMana : 0})`;
    $('mp-text').textContent = `${y.mana} / ${y.maxMana}`;
    $('xp-fill').style.transform = `scaleX(${y.xpNext ? Math.min(1, y.xp / y.xpNext) : 1})`;
    $('hero-level').textContent = `Lv ${y.level}`;
    $('gold').textContent = String(y.gold);
    if (this.me) $('kda').textContent = `${this.me.k} / ${this.me.d} / ${this.me.a}`;
    $('wave').textContent = `Wave ${s.nextWave}s`;

    // skill
    if (this.def) {
      const cdScale = 1 - (y.cdr ?? 0);
      this.def.skills.forEach((sk, i) => {
        const el = this.skillEls[i];
        const cd = y.cds[i] ?? 0;
        el.cd.style.setProperty('--cd', String(Math.min(100, (cd / (sk.cooldown * cdScale)) * 100)));
        el.cdt.textContent = cd > 0 ? (cd >= 10 ? String(Math.ceil(cd)) : cd.toFixed(1)) : '';
        el.root.classList.toggle('oncd', cd > 0);
        el.root.classList.toggle('nomana', y.mana < sk.mana);
        el.root.classList.toggle('locked', i === 3 && y.level < ULT_UNLOCK_LEVEL);
      });
      // mantra tempur (server lama tidak mengirimnya: tombolnya tetap tersembunyi)
      const sp = this.spellEl;
      const spell = y.spell ? SPELLS[y.spell] : undefined;
      if (sp && spell) {
        if (this.spellId !== spell.id) {
          this.spellId = spell.id;
          sp.root.querySelector('.spell-ico')!.innerHTML = spellIcon(spell.id);
          sp.root.style.setProperty('--sc', '#' + spell.color.toString(16).padStart(6, '0'));
          sp.root.classList.remove('hidden');
        }
        const cd = y.spellCd ?? 0;
        sp.cd.style.setProperty('--cd', String(Math.min(100, (cd / spell.cooldown) * 100)));
        sp.cdt.textContent = cd > 0 ? String(Math.ceil(cd)) : '';
        sp.root.classList.toggle('oncd', cd > 0);
      }
    }

    // item & toko
    this.shopSupported = y.items !== undefined;
    this.items = y.items ?? [];
    this.gold = y.gold;
    this.canShop = y.canShop ?? false;
    this.buyAnywhere = y.buyAnywhere ?? false;
    this.refreshQuickBuy(y.level);
    const key = this.items.join(',');
    if (key !== this.itemsKey) {
      this.itemsKey = key;
      this.renderItems(this.items);
      this.itemCdKey = '?'; // slot digambar ulang: jeda item aktif ditulis lagi
    }
    // jeda item aktif: angka detik di atas slotnya
    const cds = y.itemCds;
    const cdKey = cds ? cds.join(',') : '';
    if (cdKey !== this.itemCdKey) {
      this.itemCdKey = cdKey;
      const slots = $('items').children;
      for (let i = 0; i < slots.length; i++) {
        const cd = slots[i].querySelector('.cd');
        if (!cd) continue;
        const left = cds?.[i] ?? 0;
        cd.textContent = left > 0 ? String(left) : '';
        slots[i].classList.toggle('waiting', left > 0);
      }
    }
    $('shop-btn').classList.toggle('ready', (this.buyAnywhere || this.canShop) && this.items.length < MAX_ITEMS && ITEM_LIST.some((it) => it.cost <= y.gold));
    if (this.shopOpen) this.refreshShop();

    // penyaluran recall
    const recalling = !!self && (self.flags & F_RECALL) !== 0;
    if (recalling && !this.recallStart) {
      this.recallStart = performance.now();
      sound.play('recall');
    }
    if (!recalling) this.recallStart = 0;
    $('channel').classList.toggle('hidden', !recalling);
    if (recalling) $('channel-fill').style.width = `${Math.min(100, ((performance.now() - this.recallStart) / (RECALL_TIME * 1000)) * 100)}%`;

    // Titan Astra: hitung mundur sampai bangkit, atau tanda sedang hidup
    if (s.titan) {
      const [wait, pit] = s.titan;
      const text = wait > 0 ? `◆ ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}` : IS_TOUCH ? '◆ Titan' : `◆ Titan · ${TITAN_PITS[pit]?.name ?? ''}`;
      const chip = $('titan-chip');
      if (chip.textContent !== text) chip.textContent = text;
      chip.classList.toggle('alive', wait === 0);
      chip.classList.toggle('soon', wait > 0 && wait <= TITAN_WARN);
    }
    $('afk-note').classList.toggle('hidden', !y.afk || s.over !== null);
    // suar: tombolnya hanya ada bila server memakai kabut perang; angkanya sisa jeda
    if (y.ward !== this.wardCd) {
      this.wardCd = y.ward;
      const btn = $('ward-btn');
      btn.classList.toggle('hidden', y.ward === undefined);
      btn.classList.toggle('waiting', !!y.ward);
      btn.querySelector('.cd')!.textContent = y.ward ? String(y.ward) : '';
    }
    // buff yang sedang dibawa hero sendiri
    const buffKey = `${y.golem ?? 0}|${y.flow ?? 0}|${y.titan ?? 0}`;
    if (buffKey !== this.buffKey) {
      this.buffKey = buffKey;
      $('buffs').innerHTML =
        (y.titan ? `<span class="titan" title="Berkah Titan: +15% damage, +15% lagi ke tower dan core">◆ Berkah Titan <b>${y.titan}</b></span>` : '') +
        (y.golem ? `<span class="golem" title="Berkah Golem: +20% damage">◆ Berkah Golem <b>${y.golem}</b></span>` : '') +
        (y.flow ? `<span class="flow" title="Berkah Arus: mana pulih cepat, cooldown skill 20% lebih pendek">◆ Berkah Arus <b>${y.flow}</b></span>` : '');
    }

    // topbar
    $('score-blue').textContent = String(s.score[0]);
    $('score-red').textContent = String(s.score[1]);
    const t = Math.floor(s.t);
    const phase = dayPhase(s.t);
    // mode berbatas waktu (Kilat): jam menghitung mundur sisa waktunya, memerah di 30 detik terakhir
    if (s.left !== undefined) this.timeLeft = s.left;
    if (s.mode !== undefined && s.mode !== this.mode) {
      this.mode = s.mode;
      $('mode-badge').textContent += ` · ${GAME_MODES[s.mode].name.toUpperCase()}`;
    }
    const shown = this.timeLeft >= 0 ? this.timeLeft : t;
    $('clock').textContent = `${this.timeLeft >= 0 ? '⏱' : PHASE_LABEL[phase].icon} ${String(Math.floor(shown / 60)).padStart(2, '0')}:${String(shown % 60).padStart(2, '0')}`;
    $('clock').classList.toggle('ending', this.timeLeft >= 0 && this.timeLeft <= 30);
    if (phase !== this.phase) {
      // pergantian fase diumumkan sekali; saat baru masuk match tidak perlu
      if (this.phase) this.feed(PHASE_LABEL[phase].text);
      this.phase = phase;
    }

    // overlay
    $('respawn').classList.toggle('hidden', y.alive || s.over !== null);
    if (!y.alive) $('tower-warn').classList.add('hidden'); // sudah tumbang: peringatan tidak perlu lagi
    if (y.alive || s.over !== null) this.spectating = 0;
    else if (this.spectating && this.heroes.find((h) => h.id === this.spectating)?.respawn !== 0) this.nextSpectate(); // yang ditonton ikut tumbang
    $('respawn-time').textContent = String(y.respawn);
    if (s.over !== this.lastOver) {
      this.lastOver = s.over;
      const go = $('gameover');
      go.classList.toggle('hidden', s.over === null);
      if (s.over !== null) {
        const win = s.over === y.team;
        go.className = win ? 'win' : 'lose';
        $('gameover-title').textContent = win ? 'MENANG' : 'KALAH';
        this.feed(`Tim ${TEAM_NAMES[s.over]} memenangkan pertandingan`);
        this.toggleShop(false);
        this.togglePing(false);
        $('gameover-board').innerHTML = this.boardHtml(s.over);
      } else {
        this.setMatchSummary('');
        $('gameover-board').innerHTML = '';
      }
    }
  }

  /** Sambungan ke server sedang terputus dan dicoba lagi (true), atau sudah kembali (false). */
  setReconnecting(on: boolean): void {
    $('reconnect').classList.toggle('hidden', !on);
    if (!on) this.feed('Tersambung kembali ke server.');
  }

  showDisconnect(): void {
    $('reconnect').classList.add('hidden');
    $('disconnect').classList.remove('hidden');
  }
}
