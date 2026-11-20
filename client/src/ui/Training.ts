// Mode latihan bebas: panel alat bantu di atas pertandingan OFFLINE (simulasi berjalan di browser
// ini sendiri), untuk mencoba hero, skill, dan item tanpa tekanan. Semua tombolnya memanggil
// metode "train*" milik Game secara langsung; tidak ada perintah jaringan untuk ini, jadi tidak
// bisa dipakai di pertandingan online.
import { MAX_LEVEL } from '../../../shared/src';
import type { Game } from '../../../server/src/game/Game';
import { sound } from '../audio/Sound';

const KEY = 'astra.latihan';

/** Pemain meminta mode latihan? Lewat alamat (?latihan) atau tombol di lobby (lihat `askTraining`). */
export function trainingWanted(): boolean {
  try {
    return new URLSearchParams(location.search).has('latihan') || sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Dipanggil lobby sebelum memulai pertandingan offline: nyalakan/matikan mode latihan untuk pertandingan itu. */
export function askTraining(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(KEY, '1');
    else sessionStorage.removeItem(KEY);
  } catch {
    /* penyimpanan sesi tidak tersedia: mode latihan hanya bisa lewat alamat */
  }
}

export class Training {
  private bots = true;
  private waves = true;

  constructor(
    private game: Game,
    private playerId: string,
    /** Tulis satu baris di umpan pesan HUD. */
    private say: (text: string) => void,
  ) {
    game.training = true;
    const box = document.createElement('div');
    box.id = 'training';
    box.innerHTML = `<button id="train-toggle" type="button" title="Alat latihan">🛠 Latihan</button><div id="train-panel" class="hidden"></div>`;
    document.getElementById('hud')!.appendChild(box);
    const panel = box.querySelector<HTMLDivElement>('#train-panel')!;
    box.querySelector('#train-toggle')!.addEventListener('click', () => panel.classList.toggle('hidden'));

    const add = (label: string, title: string, run: (btn: HTMLButtonElement) => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', () => {
        run(b);
        sound.play('click');
      });
      panel.appendChild(b);
      return b;
    };
    const hero = () => this.game.players.get(this.playerId)?.hero;

    add('Level +1', 'Naikkan level hero satu tingkat', () => {
      const h = hero();
      if (h) this.game.trainLevel(h, h.level + 1);
    });
    add(`Level ${MAX_LEVEL}`, 'Langsung ke level tertinggi', () => {
      const h = hero();
      if (h) this.game.trainLevel(h, MAX_LEVEL);
    });
    add('Level 1', 'Kembali ke level 1', () => {
      const h = hero();
      if (h) this.game.trainLevel(h, 1);
    });
    add('+1000 emas', 'Tambah emas untuk mencoba item', () => {
      const h = hero();
      if (h) this.game.trainGold(h, 1000);
    });
    add('Pulih + reset jeda', 'HP dan mana penuh, semua cooldown (skill, mantra, item, suar) siap lagi; bangkit bila sedang tumbang', () => {
      const h = hero();
      if (h) this.game.trainRefresh(h);
    });
    add('Boneka sasaran', 'Munculkan boneka lawan di depan hero: tidak bergerak, tidak membalas, HP-nya pulih sendiri', () => {
      const h = hero();
      if (h) this.game.trainDummy(h);
    });
    add('Bot: hidup', 'Hentikan atau jalankan lagi semua bot (kawan dan lawan)', (b) => {
      this.bots = !this.bots;
      this.game.trainBots(this.bots);
      b.textContent = `Bot: ${this.bots ? 'hidup' : 'diam'}`;
      this.say(this.bots ? 'Bot bergerak lagi.' : 'Semua bot diam di tempat.');
    });
    add('Minion: hidup', 'Hentikan atau jalankan lagi gelombang minion', (b) => {
      this.waves = !this.waves;
      this.game.trainWaves(this.waves);
      b.textContent = `Minion: ${this.waves ? 'hidup' : 'berhenti'}`;
      this.say(this.waves ? 'Gelombang minion berjalan lagi.' : 'Gelombang minion dihentikan.');
    });
    add('Bangkitkan Titan', 'Titan Astra langsung bangkit di sarang gilirannya', () => {
      this.say(this.game.trainTitan() ? 'Titan Astra dipanggil.' : 'Titan Astra sudah ada di arena.');
    });
    this.say('Mode latihan: tombol "Latihan" membuka alat bantu. Hasil pertandingan ini tidak dicatat.');
  }
}
