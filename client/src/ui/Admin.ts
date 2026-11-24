// Menu admin untuk pertandingan OFFLINE lawan bot (simulasinya berjalan di browser ini sendiri):
// emas maksimal, HP tak terbatas, dan sekali pukul tumbang. Tombolnya langsung mengubah hero di
// simulasi lokal; tidak ada perintah jaringan untuk ini, jadi menu ini tidak ada dan tidak bisa
// dipakai di pertandingan online. Hasil pertandingan offline memang tidak pernah dicatat ke akun.
import type { Game } from '../../../server/src/game/Game';
import { sound } from '../audio/Sound';

const MAX_GOLD = 99999;

export class AdminPanel {
  private god = false;
  private oneHit = false;

  constructor(
    private game: Game,
    private playerId: string,
    /** Tulis satu baris di umpan pesan HUD. */
    private say: (text: string) => void,
  ) {
    const box = document.createElement('div');
    box.id = 'admin';
    box.innerHTML = `<button id="admin-toggle" type="button" title="Menu admin (hanya lawan bot, offline)">🔧 Admin</button><div id="admin-panel" class="hidden"></div>`;
    document.getElementById('hud')!.appendChild(box);
    const panel = box.querySelector<HTMLDivElement>('#admin-panel')!;
    box.querySelector('#admin-toggle')!.addEventListener('click', () => panel.classList.toggle('hidden'));

    const add = (label: string, title: string, run: (b: HTMLButtonElement) => void) => {
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
    add('💰 Emas maksimal', `Emas langsung ${MAX_GOLD.toLocaleString('id-ID')}`, () => {
      const h = this.hero();
      if (!h) return;
      h.gold = MAX_GOLD;
      this.say(`Admin: emas jadi ${MAX_GOLD.toLocaleString('id-ID')}.`);
    });
    add('🛡 HP tak terbatas: mati', 'Hero tidak bisa terluka oleh apa pun', (b) => {
      this.god = !this.god;
      b.textContent = `🛡 HP tak terbatas: ${this.god ? 'hidup' : 'mati'}`;
      b.classList.toggle('on', this.god);
      this.apply();
      const h = this.hero();
      if (h && this.god) h.hp = h.maxHp;
      this.say(this.god ? 'Admin: HP tak terbatas aktif.' : 'Admin: HP tak terbatas dimatikan.');
    });
    add('⚔ Sekali pukul: mati', 'Setiap serangan dan skill langsung menumbangkan sasaran', (b) => {
      this.oneHit = !this.oneHit;
      b.textContent = `⚔ Sekali pukul: ${this.oneHit ? 'hidup' : 'mati'}`;
      b.classList.toggle('on', this.oneHit);
      this.apply();
      this.say(this.oneHit ? 'Admin: sekali pukul langsung tumbang.' : 'Admin: sekali pukul dimatikan.');
    });
    // hero dibuat ulang tiap pertandingan baru: pilihan admin dipasang lagi
    window.setInterval(() => this.apply(), 500);
  }

  private hero() {
    return this.game.players.get(this.playerId)?.hero;
  }

  private apply(): void {
    const h = this.hero();
    if (!h) return;
    h.godMode = this.god;
    h.oneHit = this.oneHit;
  }
}
