// Titik masuk client: layar masuk/daftar -> lobby pemilihan hero -> sambung ke server (atau
// offline) -> mulai game.
import {
  BOT_LEVELS,
  CLIENT_CAPS,
  DEFAULT_SPELL,
  DEFAULT_TALENT,
  GAME_MODES,
  HERO_LIST,
  SKILL_KEYS,
  SKINS,
  SPELLS,
  SPELL_LIST,
  TALENTS,
  TALENT_LIST,
  emotesOwned,
  loginView,
  roomCode,
  skinUnlocked,
  type GameMode,
  type Team,
} from '../../shared/src';
import { askTraining } from './ui/Training';
import { setupMenu } from './ui/menu';
import { askTutorial, tutorialDone } from './ui/Tutorial';
import { accountLevel, accounts, validateName, validatePassword } from './account/accounts';
import { sound } from './audio/Sound';
import { GameClient } from './game/GameClient';
import { connect, type Transport } from './net/transport';
import { PORTRAITS, renderPortraits } from './render/portraits';
import { skillIcon } from './ui/icons';
import { closeModal, isModalOpen, openFriends, openLeaderboard, openProfile, openSeasonNews, openSettings, openShop } from './ui/panels';
import { APP_VERSION, UPDATE_URL, applyUpdate, checkForUpdate, confirmUpdate, isNative, shellOutdated } from './update';
import { spellIcon } from './ui/spellIcons';
import { dailyView } from './account/progress';
import { tierBadgeFor } from './account/rank';
import { COIN, coinText, frameClass, masteryFor } from './account/badges';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k) ?? '';
    } catch {
      return '';
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* penyimpanan tidak tersedia */
    }
  },
};

let selectedHero = store.get('hero') || HERO_LIST[0].id;
if (!HERO_LIST.some((h) => h.id === selectedHero)) selectedHero = HERO_LIST[0].id;
let transport: Promise<Transport & { server: string }>;

// ----- kartu hero -----
const cards = $('hero-cards');
for (const h of HERO_LIST) {
  const el = document.createElement('button');
  el.className = 'hero-card';
  el.style.setProperty('--hc', '#' + h.accent.toString(16).padStart(6, '0'));
  el.innerHTML =
    // .hero-mastery: lencana penguasaan hero (hanya akun online; diisi refreshCards)
    `<div class="portrait"><img alt="" data-hero="${h.id}" /><span class="hero-mastery"></span></div>` +
    `<div class="role">${h.role}</div><h3>${h.name}</h3><div class="title">${h.title}</div><p>${h.desc}</p>` +
    `<ul>${h.skills.map((s, i) => `<li>${skillIcon(s.id)}<b>${SKILL_KEYS[i]}</b>${s.name}</li>`).join('')}</ul>` +
    `<div class="skins" data-hero="${h.id}">${SKINS.map((k) => `<span role="button" data-skin="${k.id}"${k.price !== undefined ? ' class="premium"' : ''} style="--hue:${Math.round(k.hue * 360)}deg;--lum:${k.lum}"><i></i>${k.name}<small></small></span>`).join('')}</div>`;
  el.addEventListener('click', () => {
    selectedHero = h.id;
    store.set('hero', h.id);
    refreshCards();
  });
  el.dataset.id = h.id;
  cards.appendChild(el);
}
// ----- skin warna: skin gratis terbuka menurut level akun (tamu hanya punya skin asli); skin
// premium dibeli di toko dan hanya ada di akun online. Server memeriksanya lagi saat bergabung. -----
const skinOf = (heroId: string): number => {
  const n = Number(store.get('skin.' + heroId)) || 0;
  return skinUnlocked(n, myLevel(), myItems()) ? n : 0;
};
function myLevel(): number {
  const acc = accounts.current();
  return acc ? accountLevel(acc.profile.xp).level : 0;
}
/** Barang toko milik akun yang sedang dipakai (kosong untuk tamu, akun di perangkat, dan server versi lama). */
function myItems(): readonly string[] {
  return accounts.economy ? (accounts.current()?.profile.owned ?? []) : [];
}
/** Skin yang sedang tergambar di potret tiap hero (kosong sampai potret pertama selesai dirender). */
const paintedSkin: Record<string, number> = {};
function repaintPortrait(heroId: string): void {
  const skin = skinOf(heroId);
  const src = renderPortraits([heroId], 360, 420, { [heroId]: skin })[heroId];
  const img = cards.querySelector<HTMLImageElement>(`img[data-hero="${heroId}"]`);
  if (src && img) img.src = src;
  paintedSkin[heroId] = skin;
}
/** Akun (dan level-nya) berganti: skin yang terbuka ikut berubah, jadi chip dan potret disesuaikan. */
function refreshSkins(): void {
  refreshCards();
  for (const h of HERO_LIST) if (h.id in paintedSkin && paintedSkin[h.id] !== skinOf(h.id)) repaintPortrait(h.id);
}
cards.addEventListener('click', (e) => {
  const chip = (e.target as HTMLElement).closest<HTMLElement>('.skins [data-skin]');
  if (!chip) return;
  const heroId = chip.parentElement!.dataset.hero!;
  const skin = SKINS[Number(chip.dataset.skin)];
  if (!skinUnlocked(skin.id, myLevel(), myItems())) {
    if (skin.price !== undefined) {
      // skin premium yang belum dimiliki: akun online langsung dibawa ke toko, yang lain mendapat keterangan
      roomHint.textContent = accounts.economy ? `Skin ${skin.name} dijual di Toko seharga ${skin.price} koin.` : `Skin ${skin.name} dijual di Toko (${skin.price} koin). ${accounts.economyNote()}`;
      if (accounts.economy) {
        sound.play('click');
        selectedHero = heroId;
        store.set('hero', heroId);
        refreshCards();
        showShop();
      } else sound.play('error');
      return;
    }
    sound.play('error');
    roomHint.textContent = accounts.current() ? `Skin ${skin.name} terbuka di level akun ${skin.level}.` : `Skin ${skin.name} terbuka di level akun ${skin.level}. Masuk atau daftar akun dulu.`;
    return;
  }
  store.set('skin.' + heroId, String(skin.id));
  sound.play('click');
  repaintPortrait(heroId);
  refreshCards();
});

function refreshCards(): void {
  const level = myLevel();
  const items = myItems();
  // penguasaan hero: hanya akun online (dari statistik per hero yang dicatat server)
  const heroes = accounts.economy ? accounts.current()?.profile.heroes : undefined;
  for (const el of cards.children) {
    const id = (el as HTMLElement).dataset.id!;
    el.classList.toggle('selected', id === selectedHero);
    const active = skinOf(id);
    for (const chip of el.querySelectorAll<HTMLElement>('.skins [data-skin]')) {
      const skin = SKINS[Number(chip.dataset.skin)];
      const locked = !skinUnlocked(skin.id, level, items); // skin asli selalu tersedia, juga untuk tamu
      chip.classList.toggle('on', skin.id === active);
      chip.classList.toggle('locked', locked);
      // yang terkunci menyebut syaratnya: level akun, atau harga koin di toko
      const need = chip.querySelector('small')!;
      if (!locked) need.textContent = '';
      else if (skin.price !== undefined) need.innerHTML = `${COIN}${skin.price}`;
      else need.textContent = `Lv ${skin.level}`;
    }
    el.querySelector('.hero-mastery')!.innerHTML = heroes ? masteryFor(heroes[id]) : '';
  }
}
refreshCards();

// potret 3D tiap hero (model yang sama dengan di arena); ditunda supaya lobby tampil dulu
setTimeout(() => {
  for (const h of HERO_LIST) paintedSkin[h.id] = skinOf(h.id);
  const portraits = renderPortraits(
    HERO_LIST.map((h) => h.id),
    360,
    420,
    { ...paintedSkin },
  );
  for (const img of cards.querySelectorAll<HTMLImageElement>('img[data-hero]')) {
    const src = portraits[img.dataset.hero!];
    if (src) {
      img.src = src;
      img.classList.add('ready');
    }
  }
}, 30);

// ----- akun: layar masuk / daftar -----
const GUEST_KEY = 'astra.guest';
let authTab: 'login' | 'register' = 'login';
/** true selagi sambungan ke server belum jelas, jadi belum diketahui akun macam apa yang dipakai. */
let linking = true;
/** Selesai begitu sambungan lobby dan penyimpanan akun siap; formulir masuk menunggunya sebelum mengirim. */
let accountsReady: Promise<unknown> = Promise.resolve();

/** Layar masuk menyebutkan akun macam apa yang sedang dipakai: online (server game) atau di perangkat ini. */
function refreshAuthKind(): void {
  const kind = $('auth-kind');
  const hint = $('auth-hint');
  if (linking) {
    kind.className = 'wait';
    kind.textContent = 'Menghubungkan ke server…';
    hint.textContent = '';
  } else if (accounts.online) {
    kind.className = 'server';
    kind.textContent = 'Akun online';
    const local = accounts.localName();
    hint.textContent =
      'Akun disimpan di server game: bisa dipakai di perangkat lain dan ikut papan peringkat. Yang disimpan hanya nama, kata sandi yang sudah diacak (hash), dan statistik permainan.' +
      (local ? ` Akun di perangkat ini (${local}) tidak hilang: tetap dipakai saat bermain offline.` : '');
  } else {
    kind.className = 'local';
    kind.textContent = 'Akun di perangkat ini';
    hint.textContent = 'Server akun tidak terjangkau, jadi akun dibuat dan disimpan di perangkat ini saja dan tidak ikut papan peringkat. Tidak ada data yang dikirim ke internet.';
  }
}

function refreshAccountBar(): void {
  const acc = accounts.current();
  $('acc-name').textContent = acc ? acc.name : 'Tamu · masuk / daftar';
  $('acc-level').textContent = acc ? String(accountLevel(acc.profile.xp).level) : '–';
  // lambang tier hanya untuk akun yang memang punya tier (akun online); yang lain tanpa lambang
  $('acc-tier').innerHTML = acc && accounts.ranked ? tierBadgeFor(acc.profile.rp, false) : '';
  // koin dan bingkai (cincin warna tier di sekeliling level): hanya akun online di server yang mendukungnya
  const economy = acc && accounts.economy ? acc.profile : null;
  $('acc-level').className = 'lv' + (economy ? frameClass(economy.frame) : '');
  const coins = $('acc-coins');
  coins.classList.toggle('hidden', !economy);
  coins.innerHTML = economy ? coinText(economy.coins) : '';
  $('store-btn').title = economy ? `Toko kosmetik · ${economy.coins} koin` : 'Toko kosmetik (koin dan toko hanya untuk akun online)';
  // tanpa saldo koin tombol Toko lebih sempit, jadi teks di tombol profil boleh lebih lebar (lihat account.css)
  $('account-bar').classList.toggle('no-coins', !economy);
  // pemain yang masuk memakai nama akunnya; tamu boleh mengetik nama bebas
  const nameInput = $<HTMLInputElement>('name-input');
  nameInput.classList.toggle('hidden', !!acc);
  if (acc) nameInput.value = acc.name;
}

/**
 * Hadiah masuk harian di lobby: hari ke berapa dalam streak, hadiah hari ini, dan apakah sudah
 * diklaim. Hanya akun online; tamu, akun di perangkat, dan server versi lama mendapat keterangan,
 * bukan angka tiruan. Hari dan streak ditentukan server; di sini hanya ditampilkan.
 */
function refreshBonus(): void {
  const el = $<HTMLButtonElement>('bonus-btn');
  const acc = accounts.current();
  el.className = '';
  el.title = '';
  if (!acc || !accounts.economy) {
    el.classList.add('off');
    el.textContent =
      acc && accounts.kind === 'server'
        ? accounts.online
          ? 'Koin, hadiah harian & toko belum didukung server ini'
          : 'Koin & hadiah harian: sambungkan ke server akun'
        : 'Koin, hadiah harian & toko: hanya untuk akun online';
    el.title = accounts.economyNote();
    return;
  }
  const v = loginView(acc.profile.login, accounts.today());
  if (v.claimed) {
    el.classList.add('done');
    el.innerHTML = `<b class="tick">&#10004;</b>Hadiah harian diklaim · ${v.streak} hari berturut-turut · besok ${coinText(v.next, true)}`;
    el.title = 'Hadiah harian hari ini sudah diklaim. Kembali besok supaya streak-nya berlanjut.';
  } else if (!accounts.online) {
    el.classList.add('off');
    el.innerHTML = `Hadiah harian hari ke-${v.streak} · ${coinText(v.coins, true)} · sambungkan ke server untuk klaim`;
  } else {
    el.classList.add('ready');
    el.innerHTML = `<b class="tag">Klaim</b>Hadiah harian hari ke-${v.streak} · ${coinText(v.coins, true)}`;
    el.title = `Klaim hadiah harian hari ke-${v.streak}: +${v.coins} koin`;
  }
}

/** Ringkasan "Musim baru": sekali per musim yang ditutup, hanya di lobby dan bila tidak ada jendela lain yang terbuka. */
let seasonNewsFor = '';
function maybeSeasonNews(): void {
  const acc = accounts.current();
  const note = acc?.profile.seasonNote;
  if (!acc || !note || isModalOpen() || $('lobby').classList.contains('hidden')) return;
  const mark = `${acc.name}|${note}`;
  if (seasonNewsFor !== mark && openSeasonNews(acc)) seasonNewsFor = mark;
}

function showAuth(): void {
  $('lobby').classList.add('hidden');
  $('auth').classList.remove('hidden');
  hideInvite();
  setAuthTab(authTab);
  refreshAuthKind();
  $<HTMLInputElement>('auth-name').focus();
}

function showLobby(): void {
  $('auth').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  refreshAccountBar();
  refreshDaily();
  refreshBonus();
  refreshSkins();
  maybeSeasonNews();
}
// akun online berubah (koin, barang toko, gelar, kabar dari tab lain): tampilan lobby mengikuti
accounts.subscribe(() => {
  if ($('lobby').classList.contains('hidden')) return; // sedang bertanding, atau masih di layar masuk
  refreshAccountBar();
  refreshDaily();
  refreshBonus();
  refreshSkins();
  maybeSeasonNews();
});

/**
 * Sambungan ke server sudah jelas (atau berganti): akun yang berlaku bisa berubah, mis. dari akun
 * di perangkat ke akun online, atau sesi online yang tersimpan ternyata sudah berakhir.
 */
function accountsSettled(expired: boolean): void {
  refreshAuthKind();
  const inAuth = !$('auth').classList.contains('hidden');
  const inLobby = !$('lobby').classList.contains('hidden');
  if (!inAuth && !inLobby) return; // sedang bertanding
  const acc = accounts.current();
  if (acc || store.get(GUEST_KEY)) {
    // di layar masuk tetapi ternyata sudah punya sesi: langsung ke lobby
    if (inLobby || acc) showLobby();
    return;
  }
  // belum masuk di penyimpanan yang sekarang dipakai; yang sedang mengetik di layar masuk tidak diganggu
  if (inLobby) showAuth();
  if (expired) $('auth-error').textContent = 'Sesi akun online berakhir. Silakan masuk lagi.';
}

/** Ringkasan misi harian di lobby; diklik untuk membuka profil. Tamu tidak punya misi. */
function refreshDaily(): void {
  const acc = accounts.current();
  const el = $('daily-line');
  el.classList.toggle('hidden', !acc);
  if (!acc) return;
  const list = dailyView(acc.profile, accounts.today());
  const next = list.find((m) => !m.done);
  const count = list.filter((m) => m.done).length;
  el.textContent = next ? `Misi harian ${count}/${list.length} · ${next.mission.text} (+${next.mission.xp} XP)` : `Misi harian ${count}/${list.length} · semua selesai, kembali besok`;
}

function setAuthTab(tab: 'login' | 'register'): void {
  authTab = tab;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#auth-tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  $('auth-pass2-row').classList.toggle('hidden', tab === 'login');
  $('auth-submit').textContent = tab === 'login' ? 'MASUK' : 'DAFTAR';
  $<HTMLInputElement>('auth-pass').autocomplete = tab === 'login' ? 'current-password' : 'new-password';
  $('auth-error').textContent = '';
}

for (const b of document.querySelectorAll<HTMLButtonElement>('#auth-tabs button')) {
  b.addEventListener('click', () => setAuthTab(b.dataset.tab as 'login' | 'register'));
}

$<HTMLFormElement>('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  sound.unlock();
  const name = $<HTMLInputElement>('auth-name').value.trim();
  const pass = $<HTMLInputElement>('auth-pass').value;
  const err = $('auth-error');
  if (authTab === 'register') {
    const bad = validateName(name) ?? validatePassword(pass) ?? (pass !== $<HTMLInputElement>('auth-pass2').value ? 'Kedua kata sandi tidak sama.' : null);
    if (bad) {
      err.textContent = bad;
      sound.play('error');
      return;
    }
  }
  const submit = $<HTMLButtonElement>('auth-submit');
  submit.disabled = true;
  err.textContent = '';
  // sambungan belum jelas: tunggu dulu, supaya akunnya dibuat di tempat yang benar (server atau perangkat)
  await accountsReady;
  const result = authTab === 'login' ? await accounts.login(name, pass) : await accounts.register(name, pass);
  submit.disabled = false;
  if (!result.ok) {
    err.textContent = result.error;
    sound.play('error');
    return;
  }
  $<HTMLInputElement>('auth-pass').value = '';
  $<HTMLInputElement>('auth-pass2').value = '';
  sound.play('levelup');
  showLobby();
});

$('auth-guest').addEventListener('click', () => {
  sound.unlock();
  sound.play('click');
  store.set(GUEST_KEY, '1');
  showLobby();
});

/** Keluar dari akun (atau tamu yang ingin masuk): kembali ke layar masuk. */
function toAuth(): void {
  store.set(GUEST_KEY, '');
  // saat sedang bertanding, cara paling bersih untuk kembali adalah memuat ulang halaman
  if ($('lobby').classList.contains('hidden') && $('auth').classList.contains('hidden')) location.reload();
  else showAuth();
}

$('settings-btn').addEventListener('click', () => {
  sound.unlock();
  openSettings(false, toAuth);
});
$('profile-btn').addEventListener('click', () => {
  sound.unlock();
  const acc = accounts.current();
  if (acc) openProfile(acc);
  else toAuth();
});
$('daily-line').addEventListener('click', () => {
  sound.unlock();
  const acc = accounts.current();
  if (acc) openProfile(acc);
});
$('rank-btn').addEventListener('click', () => {
  sound.unlock();
  sound.play('click');
  void openLeaderboard();
});

// ----- toko kosmetik dan hadiah masuk harian (akun online) -----
/** Gambar hero itu dengan skin tertentu, untuk contoh di toko; potret yang dipakai lobby dan HUD tidak ikut berubah. */
function previewSkin(heroId: string, skin: number): string {
  const kept = PORTRAITS[heroId];
  const src = renderPortraits([heroId], 240, 280, { [heroId]: skin })[heroId] ?? '';
  if (kept) PORTRAITS[heroId] = kept;
  else delete PORTRAITS[heroId];
  return src;
}
function showShop(): void {
  openShop({
    hero: () => selectedHero,
    skin: () => skinOf(selectedHero),
    useSkin: (skin) => {
      store.set('skin.' + selectedHero, String(skin));
      repaintPortrait(selectedHero);
      refreshCards();
    },
    preview: (skin) => previewSkin(selectedHero, skin),
  });
}
$('store-btn').addEventListener('click', () => {
  sound.unlock();
  sound.play('click');
  showShop();
});
const bonusBtn = $<HTMLButtonElement>('bonus-btn');
bonusBtn.addEventListener('click', async () => {
  sound.unlock();
  const acc = accounts.current();
  if (!acc || !accounts.economy) {
    // bukan akun online: jendela Toko menjelaskan alasannya
    sound.play('click');
    showShop();
    return;
  }
  if (loginView(acc.profile.login, accounts.today()).claimed || !accounts.online) {
    sound.play('click');
    roomHint.textContent = 'Hadiah harian: hari ke-1 sampai ke-7 memberi 20, 30, 40, 50, 60, 80, lalu 120 koin; sesudah itu 120 koin per hari. Bila satu hari terlewat, mulai lagi dari hari ke-1. Hari berganti pukul 00.00 WIB.';
    return;
  }
  bonusBtn.disabled = true;
  const r = await accounts.claimDaily(); // server yang menentukan hari, streak, dan hadiahnya
  bonusBtn.disabled = false;
  if (!r.ok) {
    sound.play('error');
    roomHint.textContent = r.error;
    return;
  }
  sound.play(r.already ? 'click' : 'levelup');
  roomHint.textContent = r.already ? 'Hadiah harian hari ini sudah diklaim.' : `Hadiah harian hari ke-${r.streak}: +${r.coins} koin. Kembali besok supaya streak-nya berlanjut.`;
  refreshBonus();
});

// ----- teman: tombol dengan jumlah permintaan masuk, dan undangan ke room dari teman -----
$('friends-btn').addEventListener('click', () => {
  sound.unlock();
  sound.play('click');
  openFriends(ensureRoomCode);
});
/** Angka di tombol Teman: permintaan pertemanan yang belum dijawab. */
function refreshFriendsBadge(): void {
  const waiting = accounts.friends.available ? accounts.friends.list.incoming.length : 0;
  const badge = $('friends-badge');
  badge.textContent = waiting ? String(waiting) : '';
  badge.classList.toggle('hidden', !waiting);
  $('friends-btn').title = waiting ? `Daftar teman · ${waiting} permintaan menunggu` : 'Daftar teman';
}
accounts.friends.subscribe(refreshFriendsBadge);

/** Kode room dari undangan yang sedang ditampilkan ('' = tidak ada). */
let invitedRoom = '';
let inviteTimer = 0;
function hideInvite(): void {
  invitedRoom = '';
  clearTimeout(inviteTimer);
  $('invite-toast').classList.add('hidden');
}
// Undangan hanya sampai ke sini bila pengirimnya ada di daftar teman (diperiksa server, lalu
// sekali lagi oleh client; lihat account/friends.ts), dan hanya ditampilkan selagi di lobby.
accounts.friends.onInvite = (invite) => {
  if ($('lobby').classList.contains('hidden')) return;
  invitedRoom = invite.room;
  $('invite-text').textContent = `${invite.from} mengundangmu ke room ${invite.room}`;
  $('invite-toast').classList.remove('hidden');
  sound.play('levelup');
  clearTimeout(inviteTimer);
  inviteTimer = window.setTimeout(hideInvite, 30_000);
};
$('invite-decline').addEventListener('click', () => {
  sound.play('click');
  hideInvite();
});
// Gabung: kode room diisikan, lalu langsung bermain dengan hero yang sedang dipilih
$('invite-join').addEventListener('click', () => {
  const code = invitedRoom;
  hideInvite();
  if (!code) return;
  closeModal();
  roomInput.value = code;
  syncRoom();
  if (playBtn.disabled) roomHint.textContent = `Kode room ${code} sudah terisi. Tekan MAIN begitu tersambung ke server.`;
  else playBtn.click();
});

// sudah masuk, atau pernah memilih main sebagai tamu: langsung ke lobby
setupMenu();
if (accounts.current() || store.get(GUEST_KEY)) showLobby();
else showAuth();

// ----- koneksi -----
const nameInput = $<HTMLInputElement>('name-input');
const serverInput = $<HTMLInputElement>('server-input');
const playBtn = $<HTMLButtonElement>('play-btn');
const status = $('conn-status');
nameInput.value = store.get('name');

const cleanUrl = (s: string) => s.trim().replace(/\/+$/, '');
// Alamat bawaan build. Di web, kosong berarti server di alamat halaman ini sendiri. APK tidak
// punya itu, jadi bawaannya server di hosting tempat build dipublikasikan.
const DEFAULT_SERVER = cleanUrl(import.meta.env.VITE_SERVER_URL || (isNative ? UPDATE_URL : ''));

/** Alamat pilihan pemain: ?server=… atau yang disimpan dari lobby. Kosong = pakai bawaan. */
function chosenServer(): string {
  return cleanUrl(new URLSearchParams(location.search).get('server') ?? store.get('server'));
}
serverInput.value = chosenServer() || DEFAULT_SERVER;

/** Nomor urut percobaan sambungan; hasil percobaan yang sudah digantikan diabaikan. */
let linkNo = 0;
const inMenus = () => !$('lobby').classList.contains('hidden') || !$('auth').classList.contains('hidden');

/** `retry`: berapa kali lagi dicoba bila hasilnya offline (dipakai setelah sambungan lobby putus). */
function startConnect(retry = 0): void {
  const mine = ++linkNo;
  playBtn.disabled = true;
  linking = true;
  refreshAuthKind();
  status.className = '';
  status.textContent = 'Menghubungkan ke server…';
  // Pilihan pemain dicoba dulu; jika tidak terjangkau (mis. alamat Wi-Fi rumah yang tersimpan
  // padahal sedang di luar), server bawaan tetap dicoba sebelum menyerah ke mode offline.
  const chosen = chosenServer();
  // ?offline di alamat halaman: langsung latihan lawan bot tanpa mencoba server mana pun.
  const query = new URLSearchParams(location.search);
  const offline = query.has('offline') || query.has('latihan'); // ?latihan = latihan bebas, selalu offline
  const urls = offline ? [] : chosen && chosen !== DEFAULT_SERVER ? [chosen, DEFAULT_SERVER] : [DEFAULT_SERVER];
  transport = connect(urls);
  accountsReady = transport.then(async (t) => {
    if (mine !== linkNo) return;
    // Sambungan lobby putus sebelum bertanding (server ditidurkan hosting, sinyal hilang):
    // sambungkan lagi sendiri, supaya masuk akun dan tombol MAIN tetap berfungsi.
    let lost = false;
    t.onDisconnect = () => {
      if (mine !== linkNo || !inMenus()) return;
      lost = true;
      t.close();
      playBtn.disabled = true;
      status.className = '';
      status.textContent = 'Sambungan ke server terputus. Menghubungkan lagi…';
      setTimeout(() => mine === linkNo && inMenus() && startConnect(1), 2000);
    };
    // Server yang mendukung akun: akun online dipakai (sesi yang tersimpan dilanjutkan). Tanpa
    // server, atau server versi lama: akun di perangkat ini.
    const session = await accounts.bind(t.link).catch(() => 'ok' as const);
    if (mine !== linkNo || lost) return;
    linking = false;
    accountsSettled(session === 'expired');
    playBtn.disabled = false;
    if (t.mode === 'online') {
      status.className = 'ok';
      const base = t.server === urls[0] ? 'Terhubung ke server multiplayer.' : `Server ${urls[0]} tidak terjangkau. Terhubung ke server bawaan.`;
      status.textContent = base;
      // jumlah pemain yang sedang bermain, supaya terlihat apakah ada teman di dalam
      void t.playersOnline().then((n) => {
        if (n !== null && status.textContent === base) status.textContent = `${base} ${n > 0 ? `${n} pemain sedang bermain.` : 'Belum ada pemain lain.'}`;
      });
    } else {
      status.className = 'off';
      status.textContent = offline
        ? 'Mode offline: latihan 3v3 lawan bot.'
        : 'Server multiplayer tidak ditemukan. Mode offline: latihan 3v3 lawan bot.';
      // server yang baru dimulai ulang bisa butuh beberapa detik: coba sekali lagi selagi masih di lobby
      if (retry > 0 && !offline) setTimeout(() => mine === linkNo && inMenus() && startConnect(retry - 1), 6000);
    }
  });
}
startConnect();

$('server-btn').addEventListener('click', () => {
  transport.then((t) => t.close());
  store.set('server', serverInput.value.trim());
  startConnect();
});

// ----- room pribadi & pilihan tim -----
const roomInput = $<HTMLInputElement>('room-input');
const roomHint = $('room-hint');
let wantTeam: Team | undefined = store.get('team') === '0' ? 0 : store.get('team') === '1' ? 1 : undefined;

function syncRoom(): void {
  const code = roomCode(roomInput.value);
  if (roomInput.value !== code) roomInput.value = code;
  roomHint.textContent = code
    ? `Room pribadi ${code}: hanya yang memakai kode ini yang masuk ke pertandingan yang sama.`
    : 'Room umum: bergabung dengan siapa pun yang sedang bermain. Isi kode room untuk main khusus dengan teman.';
}
roomInput.value = roomCode(new URLSearchParams(location.search).get('room') ?? store.get('room'));
roomInput.addEventListener('input', syncRoom);
syncRoom();

function syncTeam(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('#team-pick button')) b.classList.toggle('on', b.dataset.team === (wantTeam === undefined ? '' : String(wantTeam)));
}
for (const b of document.querySelectorAll<HTMLButtonElement>('#team-pick button')) {
  b.addEventListener('click', () => {
    wantTeam = b.dataset.team === '0' ? 0 : b.dataset.team === '1' ? 1 : undefined;
    store.set('team', b.dataset.team ?? '');
    sound.play('click');
    syncTeam();
  });
}
syncTeam();

// ----- mantra tempur -----
let selectedSpell = SPELLS[store.get('spell')] ? store.get('spell') : DEFAULT_SPELL;
const spellPick = $('spell-pick');
function syncSpell(): void {
  for (const b of spellPick.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', b.dataset.spell === selectedSpell);
}
for (const d of SPELL_LIST) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.spell = d.id;
  b.title = `Mantra tempur ${d.name}: ${d.desc}`;
  b.innerHTML = `${spellIcon(d.id)}<span>${d.name}</span>`;
  b.style.setProperty('--sc', '#' + d.color.toString(16).padStart(6, '0'));
  b.addEventListener('click', () => {
    selectedSpell = d.id;
    store.set('spell', d.id);
    sound.play('click');
    syncSpell();
    roomHint.textContent = `Mantra tempur ${d.name}: ${d.desc} Cooldown ${d.cooldown} detik.`;
  });
  spellPick.appendChild(b);
}
syncSpell();

// ----- tingkat kesulitan bot -----
const savedBots = store.get('bots');
let botLevel = savedBots !== '' && BOT_LEVELS[Number(savedBots)] ? Number(savedBots) : 1;
const botPick = $('bot-pick');
BOT_LEVELS.forEach((lv, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = lv.name;
  b.title = 'Tingkat kesulitan bot';
  b.addEventListener('click', () => {
    botLevel = i;
    store.set('bots', String(i));
    sound.play('click');
    syncBots();
    roomHint.textContent = `Bot ${lv.name}. Berlaku bila kamu pemain pertama di room (di room pribadi, pembuat room yang menentukan).`;
  });
  botPick.appendChild(b);
});
function syncBots(): void {
  [...botPick.children].forEach((b, i) => b.classList.toggle('on', i === botLevel));
}
syncBots();

/** Kode room pribadi yang sedang diisi; bila masih kosong, dibuatkan dulu (dipakai tautan undangan dan undangan ke teman). */
function ensureRoomCode(): string {
  if (!roomCode(roomInput.value)) {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    roomInput.value = Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    syncRoom();
  }
  const code = roomCode(roomInput.value);
  store.set('room', code);
  return code;
}

// Tautan undangan: membuka game langsung dengan kode room terisi. Tanpa kode, dibuatkan dulu.
$('invite-btn').addEventListener('click', async () => {
  const code = ensureRoomCode();
  // di dalam APK alamat halamannya lokal, jadi yang dibagikan adalah alamat hosting
  const page = isNative && UPDATE_URL ? `${UPDATE_URL}/` : location.origin + location.pathname;
  const link = `${page}?room=${code}`;
  let copied = false;
  try {
    await navigator.clipboard.writeText(link);
    copied = true;
  } catch {
    /* papan klip tidak tersedia: tautannya tetap ditampilkan untuk disalin manual */
  }
  roomHint.textContent = copied ? `Tautan undangan disalin: ${link}` : `Bagikan tautan ini ke temanmu: ${link}`;
});

// ----- mode pertandingan -----
let selectedMode: GameMode = store.get('mode') === 'kilat' ? 'kilat' : 'klasik';
const modePick = $('mode-pick');
function syncMode(): void {
  for (const b of modePick.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', b.dataset.mode === selectedMode);
}
for (const id of Object.keys(GAME_MODES) as GameMode[]) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.mode = id;
  b.textContent = GAME_MODES[id].name;
  b.title = `Mode ${GAME_MODES[id].name}: ${GAME_MODES[id].desc}`;
  b.addEventListener('click', () => {
    selectedMode = id;
    store.set('mode', id);
    sound.play('click');
    syncMode();
    roomHint.textContent = `Mode ${GAME_MODES[id].name}: ${GAME_MODES[id].desc} Berlaku bila kamu pemain pertama di room.`;
  });
  modePick.appendChild(b);
}
syncMode();

// ----- ukuran tim -----
let teamSize = [1, 2, 3].includes(Number(store.get('size'))) ? Number(store.get('size')) : 3;
const sizePick = $('size-pick');
function syncSize(): void {
  for (const b of sizePick.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', Number(b.dataset.size) === teamSize);
}
for (const n of [3, 2, 1]) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.size = String(n);
  b.textContent = `${n}v${n}`;
  b.title = `${n} lawan ${n}`;
  b.addEventListener('click', () => {
    teamSize = n;
    store.set('size', String(n));
    sound.play('click');
    syncSize();
    roomHint.textContent = `Room ${n} lawan ${n}: tiap tim ${n} hero; tempat yang kosong diisi bot sampai pemain lain masuk. Berlaku bila kamu pemain pertama di room.`;
  });
  sizePick.appendChild(b);
}
syncSize();

// ----- talenta -----
let selectedTalent = TALENTS[store.get('talent')] ? store.get('talent') : DEFAULT_TALENT;
const talentPick = $('talent-pick');
function syncTalent(): void {
  for (const b of talentPick.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', b.dataset.talent === selectedTalent);
}
for (const d of TALENT_LIST) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.talent = d.id;
  b.title = `Talenta ${d.name}: ${d.desc}`;
  b.innerHTML = `<i></i><span>${d.name}</span>`;
  b.style.setProperty('--sc', '#' + d.color.toString(16).padStart(6, '0'));
  b.addEventListener('click', () => {
    selectedTalent = d.id;
    store.set('talent', d.id);
    sound.play('click');
    syncTalent();
    roomHint.textContent = `Talenta ${d.name}: ${d.desc}`;
  });
  talentPick.appendChild(b);
}
syncTalent();

// ----- latihan bebas: pertandingan offline dengan alat bantu, walau server sedang tersambung -----
askTraining(false); // tanda latihan / tutorial dari pertandingan sebelumnya tidak boleh terbawa
askTutorial(false);
const trainBtn = $<HTMLButtonElement>('train-btn');
const tutorialBtn = $<HTMLButtonElement>('tutorial-btn');
// pemain yang belum pernah menjalani tutorial di perangkat ini: tombolnya disorot
if (!tutorialDone()) tutorialBtn.classList.add('suggest');
/** Mulai pertandingan di perangkat ini sendiri: latihan bebas, atau tutorial (klasik, bot Mudah). */
async function startLocal(kind: 'latihan' | 'tutorial'): Promise<void> {
  trainBtn.disabled = tutorialBtn.disabled = playBtn.disabled = true;
  sound.unlock();
  sound.play('click');
  if (kind === 'latihan') askTraining(true);
  else askTutorial(true);
  const name = accounts.current()?.name ?? (nameInput.value.trim() || 'Pemain');
  const t = await connect([]); // tanpa alamat server: simulasi lokal
  const tutorial = kind === 'tutorial';
  const result = await t.join({
    caps: CLIENT_CAPS,
    name,
    heroId: selectedHero,
    spell: selectedSpell,
    skin: skinOf(selectedHero),
    bots: tutorial ? 0 : botLevel,
    mode: tutorial ? 'klasik' : selectedMode,
    talent: selectedTalent,
    size: tutorial ? 3 : teamSize,
    emotes: emotesOwned(myItems()), // paket emote milik akun online tetap bisa dipakai di pertandingan di perangkat ini
  });
  if (!result.ok) {
    askTraining(false);
    askTutorial(false);
    status.className = 'off';
    status.textContent = result.error ?? 'Gagal memulai pertandingan di perangkat ini.';
    trainBtn.disabled = tutorialBtn.disabled = playBtn.disabled = false;
    return;
  }
  // sambungan lobby ke server (bila ada) dilepas: pertandingan ini sepenuhnya di perangkat
  void transport.then((old) => old !== t && old.close()).catch(() => {});
  hideInvite();
  $('lobby').classList.add('hidden');
  $('loading').classList.remove('hidden');
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  new GameClient(t, toAuth, '');
  $('loading').classList.add('hidden');
}
trainBtn.addEventListener('click', () => void startLocal('latihan'));
tutorialBtn.addEventListener('click', () => void startLocal('tutorial'));

playBtn.addEventListener('click', async () => {
  playBtn.disabled = true;
  sound.unlock();
  sound.play('click');
  const t = await transport;
  const acc = accounts.current();
  const name = acc ? acc.name : nameInput.value.trim() || 'Pemain';
  if (!acc) store.set('name', name);
  const room = roomCode(roomInput.value);
  store.set('room', room);
  // `emotes` hanya dipakai pertandingan offline; server online menetapkan jumlah emote dari akun pemain
  const result = await t.join({ caps: CLIENT_CAPS, name, heroId: selectedHero, room, team: wantTeam, spell: selectedSpell, skin: skinOf(selectedHero), bots: botLevel, mode: selectedMode, talent: selectedTalent, size: teamSize, emotes: emotesOwned(myItems()) });
  if (!result.ok) {
    status.className = 'off';
    status.textContent = result.error ?? 'Gagal bergabung.';
    playBtn.disabled = false;
    return;
  }
  // membangun arena (tekstur, map, model) bisa makan waktu sedetik lebih di kualitas tinggi:
  // tampilkan layar tunggu dulu, baru mulai membangun di frame berikutnya
  hideInvite();
  $('lobby').classList.add('hidden');
  $('loading').classList.remove('hidden');
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  new GameClient(t, toAuth, result.room ?? '');
  $('loading').classList.add('hidden');
});

// ----- versi & pembaruan -----
$('app-version').textContent = `v${APP_VERSION}`;
void confirmUpdate();
const updateBtn = $<HTMLButtonElement>('update-btn');

async function lookForUpdate(): Promise<void> {
  const manifest = await checkForUpdate().catch(() => null);
  if (!manifest) return;
  const label = `Versi baru tersedia (${manifest.version}) · ketuk untuk memperbarui`;
  updateBtn.textContent = label;
  updateBtn.classList.remove('hidden');
  updateBtn.onclick = async () => {
    updateBtn.disabled = true;
    try {
      await applyUpdate(manifest, (done, total) => (updateBtn.textContent = `Mengunduh pembaruan… ${done}/${total}`));
    } catch (e) {
      updateBtn.disabled = false;
      updateBtn.textContent = `Pembaruan gagal (${e instanceof Error ? e.message : 'kesalahan jaringan'}). Ketuk untuk mencoba lagi`;
    }
  };
}
void lookForUpdate();
// selama masih di lobby, cek lagi tiap menit
setInterval(() => {
  if (!$('lobby').classList.contains('hidden') && updateBtn.classList.contains('hidden')) void lookForUpdate();
}, 60_000);

// Tautan unduh APK, hanya jika alamatnya diberikan saat build (VITE_APK_URL):
//  - di web: selalu tampil;
//  - di dalam APK: hanya bila APK yang terpasang sudah ketinggalan (ikon aplikasi, layar pembuka,
//    dan plugin native tidak ikut pembaruan dari layar utama, jadi APK-nya perlu dipasang ulang).
const apkUrl = import.meta.env.VITE_APK_URL as string | undefined;
if (apkUrl && (!isNative || shellOutdated())) {
  const link = $<HTMLAnchorElement>('apk-link');
  // di dalam APK alamat relatif berarti folder lokal, jadi dijadikan alamat hosting
  const base = isNative && !/^https?:/i.test(apkUrl) ? `${UPDATE_URL}/${apkUrl.replace(/^\.?\//, '')}` : apkUrl;
  // Nomor build ikut di alamatnya: CDN (mis. Cloudflare) menyimpan file .apk berjam-jam, dan
  // tanpa ini pengunjung masih mendapat APK lama setelah yang baru diunggah.
  link.href = `${base}${base.includes('?') ? '&' : '?'}v=${encodeURIComponent(APP_VERSION.split('+')[1] ?? APP_VERSION)}`;
  if (isNative) {
    // alamat di luar aplikasi dibuka Capacitor di browser HP, yang lalu mengunduh APK-nya
    link.textContent = 'Aplikasi versi baru tersedia (ikon dan logo baru). Ketuk untuk mengunduh APK, lalu pasang.';
    link.classList.add('shell-update');
  }
  link.classList.remove('hidden');
}

// Musik mulai pada interaksi pertama: browser baru mengizinkan suara setelah ada klik/ketuk.
addEventListener(
  'pointerdown',
  () => {
    sound.unlock();
    sound.startMusic();
  },
  { once: true },
);
