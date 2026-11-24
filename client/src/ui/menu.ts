// Layar-layar lobby: menu utama, pilih hero & mulai, latihan & tutorial. Isinya tetap elemen lobby
// yang sama (ID lama tidak berubah); di sini hanya mengatur layar mana yang tampil. Kartu hero
// dipindah ke layar yang sedang dibuka, karena dipakai di "Main" maupun "Latihan".
import { sound } from '../audio/Sound';

export type LobbyView = 'home' | 'play' | 'practice';

const $ = (id: string) => document.getElementById(id)!;

let current: LobbyView = 'home';

/** Layar lobby yang sedang tampil. */
export function lobbyView(): LobbyView {
  return current;
}

/** Tampilkan satu layar lobby. */
export function showView(view: LobbyView): void {
  current = view;
  $('lobby').classList.toggle('sub-view', view !== 'home');
  for (const v of ['home', 'play', 'practice'] as LobbyView[]) $(`view-${v}`).classList.toggle('hidden', v !== view);
  // kartu hero ikut ke layar yang membutuhkannya
  const cards = $('hero-cards');
  if (view === 'practice') $('hero-slot-practice').appendChild(cards);
  else if (view === 'play') $('hero-slot-play').appendChild(cards);
  $('lobby').scrollTo(0, 0);
  heroDetail();
}

/** Layar Main memakai kartu hero ringkas; deskripsi dan skill hero yang dipilih tampil di bawahnya. */
function heroDetail(): void {
  const card = document.querySelector<HTMLElement>('#hero-cards .hero-card.selected');
  const box = $('hero-detail');
  box.innerHTML = '';
  if (!card) return;
  const name = card.querySelector('h3')?.textContent ?? '';
  const head = document.createElement('h4');
  head.textContent = name;
  box.append(head);
  for (const sel of ['p', 'ul']) {
    const part = card.querySelector(sel);
    if (part) box.append(part.cloneNode(true));
  }
}

/** Pasang tombol-tombol menu. Tombol toko, profil, dan sebagainya meneruskan ke tombol bilah akun yang sudah ada. */
export function setupMenu(): void {
  const go = (id: string, fn: () => void) =>
    $(id).addEventListener('click', () => {
      sound.play('click');
      fn();
    });
  go('go-play', () => showView('play'));
  // ganti hero: rinciannya ikut berganti (kelas .selected dipasang main.ts setelah klik)
  $('hero-cards').addEventListener('click', () => setTimeout(heroDetail, 0));
  go('go-practice', () => showView('practice'));
  const forward = (from: string, to: string) => $(from).addEventListener('click', () => ($(to) as HTMLButtonElement).click());
  forward('go-store', 'store-btn');
  forward('go-profile', 'profile-btn');
  forward('go-rank', 'rank-btn');
  forward('go-friends', 'friends-btn');
  forward('go-settings', 'settings-btn');
  // saldo koin (tombol toko) dan jumlah permintaan teman (tombol teman) ikut tampil di petak menu
  const mirror = (from: string, tile: string, cls: string) => {
    const src = $(from);
    const out = document.createElement('span');
    out.className = cls;
    $(tile).appendChild(out);
    const sync = () => {
      out.textContent = src.classList.contains('hidden') ? '' : (src.textContent ?? '').trim();
      out.style.display = out.textContent ? '' : 'none';
    };
    new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    sync();
  };
  mirror('acc-coins', 'go-store', 'tile-coins');
  mirror('friends-badge', 'go-friends', 'tile-badge');
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-back]')) {
    b.addEventListener('click', () => {
      sound.play('click');
      showView('home');
    });
  }
  // Esc / tombol kembali Android di layar Main atau Latihan: kembali ke menu
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || current === 'home' || $('lobby').classList.contains('hidden')) return;
    if (document.querySelector('.modal:not(.hidden), #modal:not(.hidden)')) return; // jendela lain yang ditutup lebih dulu
    showView('home');
  });
  // tautan undangan (?room=...) langsung membuka layar Main dengan kode room terisi
  if (new URLSearchParams(location.search).get('room')) showView('play');
  else showView('home');
}
