// Titik masuk client: layar masuk/daftar -> lobby pemilihan hero -> sambung ke server (atau
// offline) -> mulai game.
import { BOT_LEVELS, DEFAULT_SPELL, HERO_LIST, SKILL_KEYS, SKINS, SPELLS, SPELL_LIST, roomCode, type Team } from '../../shared/src';
import { accountLevel, accounts, validateName, validatePassword } from './account/accounts';
import { sound } from './audio/Sound';
import { GameClient } from './game/GameClient';
import { connect, type Transport } from './net/transport';
import { renderPortraits } from './render/portraits';
import { skillIcon } from './ui/icons';
import { openLeaderboard, openProfile, openSettings } from './ui/panels';
import { APP_VERSION, UPDATE_URL, applyUpdate, checkForUpdate, confirmUpdate, isNative } from './update';
import { spellIcon } from './ui/spellIcons';
import { dailyView } from './account/progress';

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
    `<div class="portrait"><img alt="" data-hero="${h.id}" /></div>` +
    `<div class="role">${h.role}</div><h3>${h.name}</h3><div class="title">${h.title}</div><p>${h.desc}</p>` +
    `<ul>${h.skills.map((s, i) => `<li>${skillIcon(s.id)}<b>${SKILL_KEYS[i]}</b>${s.name}</li>`).join('')}</ul>` +
    `<div class="skins" data-hero="${h.id}">${SKINS.map((k) => `<span role="button" data-skin="${k.id}" style="--hue:${Math.round(k.hue * 360)}deg;--lum:${k.lum}"><i></i>${k.name}<small></small></span>`).join('')}</div>`;
  el.addEventListener('click', () => {
    selectedHero = h.id;
    store.set('hero', h.id);
    refreshCards();
  });
  el.dataset.id = h.id;
  cards.appendChild(el);
}
// ----- skin warna: terbuka menurut level akun (tamu hanya punya skin asli) -----
const skinOf = (heroId: string): number => {
  const n = Number(store.get('skin.' + heroId)) || 0;
  return SKINS[n] && SKINS[n].level <= myLevel() ? n : 0;
};
function myLevel(): number {
  const acc = accounts.current();
  return acc ? accountLevel(acc.profile.xp).level : 0;
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
  if (skin.id > 0 && skin.level > myLevel()) {
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
  for (const el of cards.children) {
    const id = (el as HTMLElement).dataset.id!;
    el.classList.toggle('selected', id === selectedHero);
    const active = skinOf(id);
    for (const chip of el.querySelectorAll<HTMLElement>('.skins [data-skin]')) {
      const skin = SKINS[Number(chip.dataset.skin)];
      const locked = skin.id > 0 && skin.level > level; // skin asli selalu tersedia, juga untuk tamu
      chip.classList.toggle('on', skin.id === active);
      chip.classList.toggle('locked', locked);
      chip.querySelector('small')!.textContent = locked ? `Lv ${skin.level}` : '';
    }
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
  // pemain yang masuk memakai nama akunnya; tamu boleh mengetik nama bebas
  const nameInput = $<HTMLInputElement>('name-input');
  nameInput.classList.toggle('hidden', !!acc);
  if (acc) nameInput.value = acc.name;
}

function showAuth(): void {
  $('lobby').classList.add('hidden');
  $('auth').classList.remove('hidden');
  setAuthTab(authTab);
  refreshAuthKind();
  $<HTMLInputElement>('auth-name').focus();
}

function showLobby(): void {
  $('auth').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  refreshAccountBar();
  refreshDaily();
  refreshSkins();
}

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

// sudah masuk, atau pernah memilih main sebagai tamu: langsung ke lobby
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
  const offline = new URLSearchParams(location.search).has('offline');
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

// Tautan undangan: membuka game langsung dengan kode room terisi. Tanpa kode, dibuatkan dulu.
$('invite-btn').addEventListener('click', async () => {
  if (!roomCode(roomInput.value)) {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    roomInput.value = Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    syncRoom();
  }
  const code = roomCode(roomInput.value);
  store.set('room', code);
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
  const result = await t.join({ name, heroId: selectedHero, room, team: wantTeam, spell: selectedSpell, skin: skinOf(selectedHero), bots: botLevel });
  if (!result.ok) {
    status.className = 'off';
    status.textContent = result.error ?? 'Gagal bergabung.';
    playBtn.disabled = false;
    return;
  }
  // membangun arena (tekstur, map, model) bisa makan waktu sedetik lebih di kualitas tinggi:
  // tampilkan layar tunggu dulu, baru mulai membangun di frame berikutnya
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

// Tautan unduh APK: hanya di versi web, dan hanya jika alamatnya diberikan saat build (VITE_APK_URL).
const apkUrl = import.meta.env.VITE_APK_URL as string | undefined;
if (!isNative && apkUrl) {
  const link = $<HTMLAnchorElement>('apk-link');
  // Nomor build ikut di alamatnya: CDN (mis. Cloudflare) menyimpan file .apk berjam-jam, dan
  // tanpa ini pengunjung masih mendapat APK lama setelah yang baru diunggah.
  link.href = `${apkUrl}${apkUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(APP_VERSION.split('+')[1] ?? APP_VERSION)}`;
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
