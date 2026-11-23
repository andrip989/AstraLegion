// Tutorial pemain baru: pertandingan OFFLINE lawan bot Mudah dengan kartu petunjuk yang maju sendiri
// begitu pemain melakukan langkahnya (bergerak, menyerang, skill, beli item, suar, tower). Semua
// langkah dikenali dari snapshot yang sama dengan yang dipakai HUD; satu-satunya campur tangan ke
// simulasi adalah memberi emas saat langkah belanja, lewat alat mode latihan.
import { TEAM_NAMES, type Snapshot } from '../../../shared/src';
import type { Game } from '../../../server/src/game/Game';
import { sound } from '../audio/Sound';
import { IS_TOUCH } from '../render/quality';

const KEY = 'astra.tutorial';
const DONE_KEY = 'astra.tutorial.done';

/** Pemain meminta tutorial? Lewat alamat (?tutorial) atau tombol di lobby (lihat `askTutorial`). */
export function tutorialWanted(): boolean {
  try {
    return new URLSearchParams(location.search).has('tutorial') || sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Dipanggil lobby sebelum memulai pertandingan offline: nyalakan/matikan tutorial untuk pertandingan itu. */
export function askTutorial(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(KEY, '1');
    else sessionStorage.removeItem(KEY);
  } catch {
    /* penyimpanan sesi tidak tersedia: tutorial hanya bisa lewat alamat */
  }
}

/** Pemain ini sudah pernah menyelesaikan (atau melewati) tutorial di perangkat ini? */
export function tutorialDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return true;
  }
}

interface Step {
  title: string;
  text: string;
  /** Dipanggil sekali saat langkah ini mulai. */
  enter?: () => void;
  /** true bila langkah ini sudah dilakukan pemain. */
  done: (s: Snapshot) => boolean;
}

export class Tutorial {
  private box: HTMLDivElement;
  private steps: Step[];
  private index = -1;
  private start: { x: number; z: number } | null = null;
  private attacks = 0;
  private casts = 0;
  private enemyTowers = -1;
  private towerIds = new Map<number, number>(); // id tower -> tim
  private finished = false;

  constructor(
    /** Simulasi lokal (pertandingan offline). */
    private game: Game,
    private playerId: string,
    /** Posisi hero sendiri saat ini, atau null bila belum ada. */
    private where: () => { x: number; z: number } | null,
  ) {
    game.training = true; // tidak ada bot pengganti selagi pemain membaca petunjuk
    this.box = document.createElement('div');
    this.box.id = 'tutorial';
    this.box.innerHTML = `<div class="tut-head"><b id="tut-title"></b><span id="tut-count"></span></div><p id="tut-text"></p><div class="tut-foot"><i id="tut-dots"></i><button id="tut-skip" type="button">Lewati tutorial</button></div>`;
    document.getElementById('hud')!.appendChild(this.box);
    this.box.querySelector('#tut-skip')!.addEventListener('click', () => this.finish(true));

    const hero = () => this.game.players.get(this.playerId)?.hero;
    this.steps = [
      {
        title: 'Bergerak',
        text: IS_TOUCH ? 'Geser joystick di kiri bawah untuk menggerakkan hero. Jalanlah ke luar base.' : 'Klik kanan di tanah untuk menggerakkan hero (tahan untuk terus bergerak). Jalanlah ke luar base.',
        done: () => {
          const p = this.where();
          if (!p) return false;
          this.start ??= { x: p.x, z: p.z };
          return Math.hypot(p.x - this.start.x, p.z - this.start.z) > 9;
        },
      },
      {
        title: 'Menyerang',
        text: IS_TOUCH
          ? 'Ikuti minion timmu ke tengah lane, lalu tekan tombol pedang untuk menyerang lawan terdekat. Pukul minion lawan tiga kali.'
          : 'Ikuti minion timmu ke tengah lane, lalu klik kanan minion lawan untuk menyerangnya. Pukul tiga kali.',
        enter: () => (this.attacks = 0),
        done: () => this.attacks >= 3,
      },
      {
        title: 'Skill',
        text: IS_TOUCH
          ? 'Ketuk tombol skill Q untuk melepasnya ke lawan terdekat (atau tahan dan seret untuk membidik sendiri). Skill R baru terbuka di level 4.'
          : 'Tekan Q untuk melepas skill ke arah kursor. W dan E juga skill; R baru terbuka di level 4.',
        enter: () => (this.casts = 0),
        done: () => this.casts >= 1,
      },
      {
        title: 'Belanja',
        text: IS_TOUCH
          ? 'Emas didapat dari menghabisi minion. Ini 400 emas dari kami: ketuk kartu Rekomendasi (atau tombol keranjang) untuk membeli item pertamamu.'
          : 'Emas didapat dari menghabisi minion. Ini 400 emas dari kami: tekan G (atau klik kartu Rekomendasi) untuk membeli item pertamamu.',
        enter: () => {
          const h = hero();
          if (h && h.gold < 400) this.game.trainGold(h, 400 - Math.floor(h.gold));
        },
        done: (s) => (s.you.items?.length ?? 0) >= 1,
      },
      {
        title: 'Kabut dan suar',
        text: IS_TOUCH
          ? 'Bagian peta yang gelap tidak terlihat timmu: lawan bisa bersembunyi di sana. Ketuk tombol mata untuk menanam suar yang menyingkap sekitarnya.'
          : 'Bagian peta yang gelap tidak terlihat timmu: lawan bisa bersembunyi di sana. Tekan T untuk menanam suar yang menyingkap sekitarnya.',
        enter: () => {
          const h = hero();
          if (h) h.wardCd = 0;
        },
        done: (s) => (s.you.ward ?? 0) > 0,
      },
      {
        title: 'Hancurkan tower',
        text: 'Sekarang dorong lane bersama minionmu dan hancurkan satu tower lawan. Lingkaran merah di tanah adalah jangkauan tembaknya: masuklah bersama minion, jangan sendirian.',
        enter: () => (this.enemyTowers = -1),
        done: (s) => {
          let alive = 0;
          const seen = new Set(s.ents.map((e) => e[0]));
          for (const [id, team] of this.towerIds) if (team !== s.you.team && seen.has(id)) alive++;
          if (this.enemyTowers < 0) this.enemyTowers = alive;
          return alive < this.enemyTowers;
        },
      },
      {
        title: 'Kamu siap!',
        text: `Hancurkan semua tower di satu lane, lalu Core tim ${TEAM_NAMES[1]} atau ${TEAM_NAMES[0]} lawan, untuk menang. Titan Astra bangkit di menit ke-4: tumbangkan bersama tim untuk Berkah Titan. Selamat bertarung!`,
        done: () => false,
      },
    ];
    this.go(0);
  }

  /** Dipanggil GameClient tiap snapshot. */
  update(s: Snapshot): void {
    if (this.finished) return;
    for (const st of s.spawn) if (st.kind === 'tower') this.towerIds.set(st.id, st.team);
    for (const e of s.events) {
      if (e.k === 'atk' && e.a === s.you.id) this.attacks++;
      else if (e.k === 'cast' && e.a === s.you.id) this.casts++;
    }
    if (s.over !== null) return this.finish(false);
    const step = this.steps[this.index];
    if (step && step.done(s)) {
      sound.play('ready');
      this.go(this.index + 1);
    }
  }

  private go(index: number): void {
    this.index = index;
    const step = this.steps[index];
    if (!step) return this.finish(false);
    step.enter?.();
    const last = index === this.steps.length - 1;
    this.box.querySelector('#tut-title')!.textContent = step.title;
    this.box.querySelector('#tut-count')!.textContent = last ? '' : `Langkah ${index + 1} dari ${this.steps.length - 1}`;
    this.box.querySelector('#tut-text')!.textContent = step.text;
    this.box.querySelector('#tut-dots')!.innerHTML = this.steps
      .slice(0, -1)
      .map((_, i) => `<span class="${i < index ? 'done' : i === index ? 'now' : ''}"></span>`)
      .join('');
    this.box.querySelector('#tut-skip')!.textContent = last ? 'Tutup' : 'Lewati tutorial';
    this.box.classList.remove('pop');
    void this.box.offsetWidth; // mulai ulang animasi
    this.box.classList.add('pop');
    if (last) this.remember();
  }

  private remember(): void {
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      /* tidak bisa disimpan: tutorial akan ditawarkan lagi lain kali */
    }
  }

  private finish(skipped: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.remember();
    this.box.remove();
    if (skipped) sound.play('click');
  }
}
