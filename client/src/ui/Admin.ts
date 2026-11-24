// Menu admin: emas maksimal, HP tak terbatas, dan sekali pukul tumbang. Hanya tampil selama
// pemain manusia di room cuma satu (sisanya bot); server yang memutuskan (snapshot you.admin) dan
// yang menerapkannya, baik online maupun offline (simulasi lokal memakai kode yang sama).
// Pertandingan yang memakai menu ini tidak dicatat ke akun.
import type { ClientCommand, Snapshot } from '../../../shared/src';
import { sound } from '../audio/Sound';

export class AdminPanel {
  private box: HTMLDivElement;
  private panel: HTMLDivElement;
  private godBtn: HTMLButtonElement;
  private hitBtn: HTMLButtonElement;
  private state = -1;

  constructor(private send: (cmd: ClientCommand) => void) {
    this.box = document.createElement('div');
    this.box.id = 'admin';
    this.box.className = 'hidden';
    this.box.innerHTML = `<button id="admin-toggle" type="button" title="Menu admin (hanya bila kamu satu-satunya pemain di room)">🔧 Admin</button><div id="admin-panel" class="hidden"></div>`;
    document.getElementById('hud')!.appendChild(this.box);
    this.panel = this.box.querySelector<HTMLDivElement>('#admin-panel')!;
    this.box.querySelector('#admin-toggle')!.addEventListener('click', () => this.panel.classList.toggle('hidden'));

    const add = (label: string, title: string, run: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', () => {
        run();
        sound.play('click');
      });
      this.panel.appendChild(b);
      return b;
    };
    add('💰 Emas maksimal', 'Emas langsung 99.999', () => this.send({ t: 'admin', a: 'gold' }));
    this.godBtn = add('🛡 HP tak terbatas: mati', 'Hero tidak bisa terluka oleh apa pun', () => this.send({ t: 'admin', a: 'god', on: !(this.state & 2) }));
    this.hitBtn = add('⚔ Sekali pukul: mati', 'Setiap serangan dan skill langsung menumbangkan sasaran', () => this.send({ t: 'admin', a: 'onehit', on: !(this.state & 4) }));
    const note = document.createElement('small');
    note.textContent = 'Pertandingan yang memakai admin tidak dicatat ke akun.';
    this.panel.appendChild(note);
  }

  /** Dipanggil tiap snapshot: tampil/sembunyi dan keadaan tombol mengikuti server. */
  update(s: Snapshot): void {
    const v = s.you.admin ?? 0;
    if (v === this.state) return;
    this.state = v;
    this.box.classList.toggle('hidden', !(v & 1));
    if (!(v & 1)) this.panel.classList.add('hidden');
    this.godBtn.textContent = `🛡 HP tak terbatas: ${v & 2 ? 'hidup' : 'mati'}`;
    this.godBtn.classList.toggle('on', !!(v & 2));
    this.hitBtn.textContent = `⚔ Sekali pukul: ${v & 4 ? 'hidup' : 'mati'}`;
    this.hitBtn.classList.toggle('on', !!(v & 4));
  }
}
