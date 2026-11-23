// Jendela modal: Pengaturan, Profil, Peringkat, Teman, Toko, dan ringkasan "Musim baru". Dipakai dari lobby maupun saat bertanding.
import {
  COINS_LOSS,
  COINS_MISSION,
  COINS_WIN,
  EMOTES,
  FREE_EMOTES,
  FRIENDS_MAX,
  FRIEND_STATUS_TEXT,
  HEROES,
  RANK_HUMAN_BONUS,
  RANK_LOSS,
  RANK_TIERS,
  RANK_WIN,
  SEASON_REWARDS,
  SHOP_ITEMS,
  SKINS,
  heroMastery,
  loginView,
  rankTier,
  seasonCarry,
  seasonName,
  titleView,
  type BoardRow,
  type FriendStatus,
  type ShopItem,
} from '../../../shared/src';
import { accountLevel, accounts, type Account, type EconomyResult } from '../account/accounts';
import { COIN, coinText, frameClass, frameName, masteryBadge, titleTag } from '../account/badges';
import type { FriendResult } from '../account/friends';
import { achievementView, dailyView } from '../account/progress';
import { tierBadge, tierBadgeFor } from '../account/rank';
import { sound } from '../audio/Sound';
import { GFX, QUALITIES, QUALITY_LABEL, setQuality, type Quality } from '../render/quality';
import { settings, updateSettings, type Settings } from '../settings';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let onClose: (() => void) | null = null;

export function isModalOpen(): boolean {
  return !$('modal').classList.contains('hidden');
}

export function closeModal(): void {
  $('modal').classList.add('hidden');
  onClose?.();
  onClose = null;
}

/** `wide`: jendela lebih lebar, untuk isi berkolom banyak (papan peringkat). */
function openModal(title: string, html: string, closed?: () => void, wide = false): HTMLElement {
  // jendela yang sedang terbuka digantikan: beri tahu pemiliknya dulu
  const previous = onClose;
  onClose = null;
  previous?.();
  const body = $('modal-body');
  $('modal-title').textContent = title;
  body.innerHTML = html;
  $('modal').classList.toggle('wide', wide);
  $('modal').classList.remove('hidden');
  body.scrollTop = 0; // jendela sebelumnya mungkin sudah digulir (baru berpengaruh setelah jendelanya tampil)
  onClose = closed ?? null;
  return body;
}

// pasang sekali: tombol tutup, klik di luar kotak, dan Esc
$('modal-close').addEventListener('click', closeModal);
$('modal').addEventListener('pointerdown', (e) => {
  if (e.target === $('modal')) closeModal();
});

const GFX_HINT: Record<Quality, string> = {
  low: 'Tanpa bayangan & efek pasca-proses. Paling lancar; untuk HP atau komputer lama.',
  medium: 'Bayangan, bloom, dan tanah bertekstur detail. Seimbang.',
  high: 'Detail maksimum: ambient occlusion, bayangan 4K, tekstur resolusi tinggi, rumput & tanaman sangat rapat, kolam, kupu-kupu, cahaya dinamis dari skill. Butuh kartu grafis yang kuat.',
};

/** Di HP tingkatnya lebih ringan (lihat render/quality.ts), jadi keterangannya juga berbeda. */
const GFX_HINT_MOBILE: Record<Quality, string> = {
  low: 'Paling lancar: tanpa bayangan dan efek cahaya. Disarankan untuk kebanyakan HP.',
  medium: 'Bayangan dan efek cahaya (bloom). Untuk HP kelas menengah ke atas.',
  high: 'Seperti Sedang, dengan gambar lebih tajam. Hanya untuk HP kencang. Bila tersendat, game menurunkan resolusi dan mematikan efek secara otomatis.',
};

/** Keterangan di Pengaturan: di mana data akun yang sedang dipakai disimpan. */
function accountNote(signedIn: boolean): string {
  if (accounts.online) {
    return signedIn
      ? 'Akun online: data disimpan di server game, bisa dipakai di perangkat lain, dan ikut papan peringkat.'
      : 'Server ini mendukung akun online: masuk atau daftar supaya statistikmu tersimpan dan ikut papan peringkat.';
  }
  if (accounts.kind === 'server' && signedIn) return 'Akun online, tetapi sedang tidak tersambung ke server akun: pertandingan sekarang adalah latihan dan tidak dicatat.';
  return 'Akun di perangkat ini: data hanya disimpan di perangkat ini dan tidak ikut papan peringkat.';
}

/**
 * Jendela pengaturan. `inGame`: grafik baru berlaku setelah halaman dimuat ulang, jadi ditawarkan
 * tombol muat ulang. `afterLogout` dipanggil setelah pemain keluar dari akunnya.
 */
export function openSettings(inGame: boolean, afterLogout: () => void, toLobby?: () => void): void {
  const startQuality = GFX.quality;
  const acc = accounts.current();
  const slider = (key: keyof Settings, label: string) =>
    `<label class="set-row"><span>${label}</span><input type="range" min="0" max="100" value="${Math.round((settings[key] as number) * 100)}" data-vol="${key}" /><output>${Math.round((settings[key] as number) * 100)}</output></label>`;
  const toggle = (key: keyof Settings, label: string) =>
    `<label class="set-row"><span>${label}</span><input type="checkbox" data-flag="${key}" ${settings[key] ? 'checked' : ''} /></label>`;

  const body = openModal(
    'Pengaturan',
    `<h4>Grafik</h4>
     <div class="seg" id="set-gfx">${QUALITIES.map((q) => `<button data-q="${q}">${QUALITY_LABEL[q]}</button>`).join('')}</div>
     <p class="hint" id="set-gfx-hint"></p>
     <p class="hint warn hidden" id="set-gfx-reload">Kualitas grafik baru berlaku setelah game dimuat ulang. <button id="set-reload">Muat ulang sekarang</button></p>
     <h4>Suara</h4>
     ${slider('master', 'Volume utama')}${slider('sfx', 'Efek suara')}${slider('music', 'Musik')}
     <h4>Tampilan</h4>
     ${toggle('shake', 'Guncangan kamera saat ledakan')}${toggle('showFps', 'Tampilkan FPS')}
     ${inGame && toLobby ? '<h4>Pertandingan</h4><div class="set-row"><span>Ganti hero, skin, mantra, atau room</span><button id="set-lobby">Kembali ke lobby</button></div>' : ''}
     ${
       inGame && acc && accounts.online && accounts.ranked
         ? `<p class="hint">Meninggalkan pertandingan online sebelum selesai (kembali ke lobby, keluar akun, atau sambungan putus lebih dari 1 menit) dihitung kalah: &minus;${RANK_LOSS} poin peringkat, bila kamu sudah ikut bermain minimal 2 menit.</p>`
         : ''
     }
     <h4>Akun</h4>
     <div class="set-row"><span>${acc ? `Masuk sebagai <b>${esc(acc.name)}</b>` : 'Bermain sebagai tamu (statistik tidak disimpan)'}</span>
       <button id="set-logout">${acc ? 'Keluar' : 'Masuk / Daftar'}</button></div>
     <p class="hint">${accountNote(!!acc)}</p>`,
  );

  const refreshGfx = () => {
    for (const b of body.querySelectorAll<HTMLButtonElement>('#set-gfx button')) b.classList.toggle('on', b.dataset.q === GFX.quality);
    body.querySelector('#set-gfx-hint')!.textContent = (GFX.mobile ? GFX_HINT_MOBILE : GFX_HINT)[GFX.quality];
    body.querySelector('#set-gfx-reload')!.classList.toggle('hidden', !inGame || GFX.quality === startQuality);
  };
  for (const b of body.querySelectorAll<HTMLButtonElement>('#set-gfx button')) {
    b.addEventListener('click', () => {
      setQuality(b.dataset.q as Quality);
      sound.play('click');
      refreshGfx();
    });
  }
  refreshGfx();
  body.querySelector('#set-reload')!.addEventListener('click', () => location.reload());
  body.querySelector('#set-lobby')?.addEventListener('click', () => toLobby?.());

  for (const input of body.querySelectorAll<HTMLInputElement>('input[data-vol]')) {
    input.addEventListener('input', () => {
      updateSettings({ [input.dataset.vol!]: Number(input.value) / 100 } as Partial<Settings>);
      (input.nextElementSibling as HTMLOutputElement).value = input.value;
    });
    input.addEventListener('change', () => sound.play('click'));
  }
  for (const input of body.querySelectorAll<HTMLInputElement>('input[data-flag]')) {
    input.addEventListener('change', () => {
      updateSettings({ [input.dataset.flag!]: input.checked } as Partial<Settings>);
      sound.play('click');
    });
  }
  body.querySelector('#set-logout')!.addEventListener('click', async () => {
    await accounts.logout();
    closeModal();
    afterLogout();
  });
}

const fmtTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} j ${m % 60} mnt` : `${m} mnt`;
};

/** Angka bertanda untuk perubahan poin peringkat: "+20", "−12", "±0". */
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `&minus;${-n}` : '&plusmn;0');

/**
 * Bagian tier peringkat di profil: lencana, poin, dan kemajuan ke tier berikutnya. Akun yang
 * tidak punya tier (akun di perangkat, atau server versi lama) hanya mendapat keterangan,
 * bukan tier tiruan.
 */
function rankSection(acc: Account): string {
  if (accounts.kind !== 'server') return '<p class="rank-none">Akun di perangkat ini tidak punya tier peringkat. Tier hanya untuk akun online, dari pertandingan online.</p>';
  if (!accounts.ranked) {
    // server versi lama, atau (saat offline) salinan akun yang disimpan sebelum tier ada
    return `<p class="rank-none">${accounts.online ? 'Server ini belum mendukung tier peringkat.' : 'Tier peringkat belum diketahui. Sambungkan ke server akun untuk melihatnya.'}</p>`;
  }
  const r = rankTier(acc.profile.rp);
  const bar = r.next ? Math.round((r.into / r.span) * 100) : 100;
  const next = r.next ? `${r.toNext} poin lagi menuju ${r.next.name}` : 'Tier tertinggi';
  // musim yang sedang berjalan (hanya di server yang punya musim)
  const season = accounts.economy ? seasonName(acc.profile.season ?? accounts.season()) : '';
  return (
    `<div class="rank-card t-${r.tier.id}">${tierBadge(r.tier, false)}` +
    `<div class="grow"><div class="rank-line"><b>${r.tier.name}</b><span>${acc.profile.rp} poin peringkat</span></div>` +
    `<div class="xpbar"><div style="width:${bar}%"></div></div>` +
    `<small>${season ? `<b class="season-now">${season}</b> · ` : ''}${next}${accounts.online ? '' : ' · data terakhir sebelum offline'}</small></div></div>` +
    `<p class="hint">Menang pertandingan online: +${RANK_WIN.join(' / +')} poin (bot Mudah / Normal / Sulit), +${RANK_HUMAN_BONUS} bila tim lawan berisi pemain. ` +
    `Kalah, atau keluar sebelum pertandingan selesai: &minus;${RANK_LOSS}.` +
    `${season ? ' Musim berganti tiap awal bulan (00.00 WIB): poin dibagi dua, dan tier akhirmu memberi koin serta bingkai.' : ''}</p>`
  );
}

/** Lingkaran contoh sebuah bingkai (warna tier), dipakai di pilihan bingkai dan ringkasan musim. */
const frameSwatch = (id: string) => `<i class="frame-dot${frameClass(id)}"></i>`;

/**
 * Bagian profil yang hanya ada di akun online: koin dan hadiah harian, gelar, bingkai, dan
 * riwayat musim. Akun lain mendapat satu keterangan, bukan angka tiruan.
 */
function economySection(acc: Account): string {
  if (!accounts.economy) return `<p class="rank-none"><b>Koin, toko, gelar, bingkai, musim, dan penguasaan hero.</b> ${accounts.economyNote()}</p>`;
  const p = acc.profile;
  const live = accounts.online;
  const login = loginView(p.login, accounts.today());
  const streak = login.claimed ? `Hadiah harian hari ini sudah diklaim · ${login.streak} hari berturut-turut` : 'Hadiah harian hari ini belum diklaim';
  const titles = titleView(p);
  const titleRows = titles
    .map((t) => {
      const on = p.title === t.title.id;
      const act = t.done
        ? `<button type="button" data-title="${on ? '' : t.title.id}" class="${on ? 'on' : ''}"${live ? '' : ' disabled'}>${on ? 'Dipakai · lepas' : 'Pasang'}</button>`
        : `<span class="need">${t.value} / ${t.title.goal}</span>`;
      return `<li class="${t.done ? 'done' : 'locked'}${on ? ' on' : ''}"><b>${t.title.name}</b><span>${t.title.desc}</span>${act}</li>`;
    })
    .join('');
  const frames = p.frames.length
    ? `<div class="frame-pick">${[...p.frames]
        .sort((a, b) => RANK_TIERS.findIndex((t) => t.id === a) - RANK_TIERS.findIndex((t) => t.id === b))
        .map((id) => `<button type="button" data-frame="${id}" class="${p.frame === id ? 'on' : ''}"${live ? '' : ' disabled'}>${frameSwatch(id)}${frameName(id)}</button>`)
        .join('')}<button type="button" data-frame="" class="${p.frame ? '' : 'on'}"${live ? '' : ' disabled'}><i class="frame-dot"></i>Tanpa bingkai</button></div>`
    : '<p class="fr-empty">Belum ada bingkai. Bingkai didapat dari tier akhirmu saat musim ditutup.</p>';
  const seasons = p.seasons
    .map((s) => {
      const tier = RANK_TIERS.find((t) => t.id === s.tier) ?? rankTier(s.rp).tier;
      return `<li><b>${seasonName(s.id)}</b><span>${tierBadge(tier)}</span><span>${s.rp} poin</span><span>${coinText(s.coins, true)}</span></li>`;
    })
    .join('');
  return (
    `<div id="pf-econ"><div class="wallet">${coinText(p.coins)}<small>${streak}</small></div>` +
    `<p class="fr-msg" id="pf-msg" role="status"></p>` +
    `<h4>Gelar · ${titles.filter((t) => t.done).length} / ${titles.length}</h4>` +
    `<ul class="plain-list title-list">${titleRows}</ul>` +
    `<h4>Bingkai · ${p.frames.length} / ${RANK_TIERS.length}</h4>${frames}` +
    `<h4>Riwayat musim</h4><ul class="plain-list season-list">${seasons || '<li><span>Belum ada musim yang ditutup. Musim berganti tiap awal bulan.</span></li>'}</ul>` +
    `${live ? '' : '<p class="hint">Sedang tidak tersambung ke server akun: gelar dan bingkai bisa diganti lagi setelah tersambung.</p>'}</div>`
  );
}

/**
 * Jendela profil: level akun, tier peringkat, statistik, hero favorit, dan riwayat pertandingan;
 * untuk akun online juga koin, gelar dan bingkai (bisa dipasang dari sini), riwayat musim, dan
 * penguasaan tiap hero. `scroll`: posisi gulir yang dipertahankan saat jendela digambar ulang.
 */
export function openProfile(acc: Account, scroll = 0): void {
  const p = acc.profile;
  const lv = accountLevel(p.xp);
  const winRate = p.matches ? Math.round((p.wins / p.matches) * 100) : 0;
  const kda = ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2);
  const economy = accounts.economy;
  const heroes = Object.entries(p.heroes)
    .sort((a, b) => b[1].games - a[1].games)
    .map(
      ([id, h]) =>
        `<li><b>${esc(HEROES[id]?.name ?? id)}${economy ? masteryBadge(heroMastery(h)) : ''}</b><span>${h.games} main · ${h.games ? Math.round((h.wins / h.games) * 100) : 0}% menang</span></li>`,
    )
    .join('');
  const history = p.history
    .map(
      (m) =>
        `<li class="${m.win ? 'win' : 'lose'}"><b>${m.left ? 'Keluar' : m.win ? 'Menang' : 'Kalah'}</b><span>${esc(HEROES[m.hero]?.name ?? m.hero)}</span><span>${m.k} / ${m.d} / ${m.a}</span><span>${fmtTime(m.dur)}</span><span>+${m.xp} XP</span>` +
        `${m.rp === undefined ? '' : `<span class="rp ${m.rp < 0 ? 'down' : 'up'}" title="Poin peringkat">${signed(m.rp)}</span>`}</li>`,
    )
    .join('');
  const goal = (done: boolean, title: string, note: string, value: number, max: number) =>
    `<li class="${done ? 'done' : ''}"><b>${done ? '✔ ' : ''}${esc(title)}</b><span>${note}</span><div class="xpbar"><div style="width:${Math.round((value / max) * 100)}%"></div></div></li>`;
  const fmtGoal = (v: number, max: number) => (max >= 600 ? `${Math.floor(v / 60)} / ${Math.round(max / 60)} mnt` : `${v} / ${max}`);
  const daily = dailyView(p, accounts.today())
    .map((m) => goal(m.done, m.mission.text, `${fmtGoal(m.value, m.mission.goal)} · +${m.mission.xp} XP`, m.value, m.mission.goal))
    .join('');
  const achievements = achievementView(p);
  const achieved = achievements.map((a) => goal(a.done, a.achievement.name, `${a.achievement.desc} · ${fmtGoal(a.value, a.achievement.goal)}`, a.value, a.achievement.goal)).join('');
  const body = openModal(
    'Profil',
    `<div class="profile-head">
       <div class="lv-badge${economy ? frameClass(p.frame) : ''}"${economy && p.frame ? ` title="${frameName(p.frame)}"` : ''}>${lv.level}</div>
       <div class="grow"><h3>${esc(acc.name)}<span class="acc-kind ${accounts.kind}">${accounts.kind === 'server' ? (accounts.online ? 'Akun online' : 'Akun online · sedang offline') : 'Akun di perangkat ini'}</span></h3>
         ${economy && titleTag(p.title) ? `<div class="title-line">${titleTag(p.title)}</div>` : ''}
         <div class="xpbar"><div style="width:${Math.round((lv.into / lv.need) * 100)}%"></div></div>
         <small>Level akun ${lv.level} · ${lv.into} / ${lv.need} XP</small></div>
     </div>
     ${rankSection(acc)}
     ${economySection(acc)}
     <div class="stat-grid">
       <div><b>${p.matches}</b><span>Pertandingan</span></div>
       <div><b>${winRate}%</b><span>Menang</span></div>
       <div><b>${kda}</b><span>KDA</span></div>
       <div><b>${p.kills}</b><span>Kill</span></div>
       <div><b>${p.assists}</b><span>Assist</span></div>
       <div><b>${fmtTime(p.playSeconds)}</b><span>Waktu main</span></div>
     </div>
     <h4>Misi harian</h4>
     <ul class="plain-list goals">${daily}</ul>
     <h4>Pencapaian · ${achievements.filter((a) => a.done).length} / ${achievements.length}</h4>
     <ul class="plain-list goals">${achieved}</ul>
     <h4>Hero${economy ? ' · penguasaan' : ''}</h4>
     <ul class="plain-list hero-list">${heroes || '<li><span>Belum ada pertandingan.</span></li>'}</ul>
     ${economy ? '<p class="hint">Penguasaan hero naik dari jumlah main dengan hero itu; kemenangan dihitung dua kali. Tingkatnya: Pemula, Terlatih, Mahir, Ahli, Master.</p>' : ''}
     <h4>Riwayat</h4>
     <ul class="plain-list history">${history || '<li><span>Belum ada pertandingan.</span></li>'}</ul>`,
  );
  body.scrollTop = scroll;

  // pasang / lepas gelar dan bingkai: diputuskan server, lalu jendelanya digambar ulang dengan akun terbaru
  const econ = body.querySelector<HTMLElement>('#pf-econ');
  if (!econ) return;
  let busy = false;
  const equip = async (what: { title?: string; frame?: string }) => {
    if (busy) return;
    busy = true;
    sound.play('click');
    const r = await accounts.equip(what);
    busy = false;
    if (!isModalOpen() || !econ.isConnected) return; // jendelanya sudah ditutup atau diganti
    if (r.ok) return openProfile(r.account, body.scrollTop);
    const msg = econ.querySelector<HTMLElement>('#pf-msg')!;
    msg.textContent = r.error;
    msg.classList.add('bad');
    msg.scrollIntoView({ block: 'nearest' });
    sound.play('error');
  };
  econ.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-title], button[data-frame]');
    if (!btn || btn.disabled) return;
    if (btn.dataset.title !== undefined) void equip({ title: btn.dataset.title });
    else if (!btn.classList.contains('on')) void equip({ frame: btn.dataset.frame ?? '' });
  });
}

let boardTurn = 0;

/**
 * Jendela papan peringkat: akun online teratas menurut poin peringkat lalu XP akun (peringkat,
 * nama, tier, poin, level, menang, jumlah pertandingan), dengan baris pemain sendiri disorot.
 * Datanya dari server, jadi saat offline hanya ada keterangan. Server versi lama belum punya
 * tier: papannya tampil seperti dulu (urut XP, tanpa kolom tier dan poin).
 */
export async function openLeaderboard(): Promise<void> {
  const turn = ++boardTurn;
  const body = openModal('Peringkat', '<p class="rank-note">Memuat papan peringkat…</p>', undefined, true);
  const board = await accounts.leaderboard();
  // jendelanya sudah ditutup atau diganti selagi menunggu
  if (turn !== boardTurn || !isModalOpen() || $('modal-title').textContent !== 'Peringkat') return;
  if (board === 'offline') {
    // offline, atau server multiplayer versi lama yang belum punya akun
    body.innerHTML = '<p class="rank-note">Papan peringkat hanya tersedia saat tersambung ke server akun.<br />Sekarang kamu tetap bisa bermain, tetapi hasilnya tidak masuk peringkat.</p>';
    return;
  }
  if (board === 'error') {
    body.innerHTML = '<p class="rank-note">Papan peringkat belum bisa dimuat. Periksa sambunganmu.</p><div class="rank-retry"><button id="rank-retry">Coba lagi</button></div>';
    body.querySelector('#rank-retry')!.addEventListener('click', () => void openLeaderboard());
    return;
  }
  const me = board.me;
  const ranked = board.ranked;
  // gelar tampil di bawah nama; yang datang dari server hanya id-nya (teksnya dari tabel milik client)
  const row = (b: BoardRow, mine: boolean) =>
    `<tr class="${mine ? 'me' : ''}"><td class="rk${b.rank <= 3 ? ` top${b.rank}` : ''}">${b.rank}</td><td class="nm">${esc(b.name)}${mine ? '<small>kamu</small>' : ''}${titleTag(b.title)}</td>` +
    (ranked ? `<td class="tr">${tierBadgeFor(b.rp)}</td><td class="pt">${b.rp}</td>` : '') +
    `<td class="xl"><span class="lv">${b.level}</span></td><td>${b.wins}</td><td class="xl">${b.matches}</td></tr>`;
  const isMe = (b: BoardRow) => !!me && b.rank === me.rank && b.name === me.name;
  const rows = board.top.map((b) => row(b, isMe(b))).join('');
  // pemain di luar daftar teratas tetap melihat barisnya sendiri di bawah
  const own = me && !board.top.some(isMe) ? `<tr class="gap"><td colspan="${ranked ? 7 : 5}">&#8943;</td></tr>${row(me, true)}` : '';
  // peringkat sendiri di atas tabel, supaya terlihat tanpa menggulir
  const note = me
    ? `Peringkatmu <b>${me.rank}</b> dari ${board.total} pemain${ranked ? ` · ${tierBadgeFor(me.rp)} ${me.rp} poin` : ''}`
    : accounts.current()
      ? 'Akun yang sedang dipakai hanya ada di perangkat ini, jadi tidak ikut papan peringkat dan tidak punya tier.'
      : 'Masuk atau daftar akun online supaya namamu ikut di papan peringkat.';
  const head = `<th class="rk">#</th><th class="nm">Nama</th>${ranked ? '<th class="tr">Tier</th><th>Poin</th>' : ''}<th class="xl">Level</th><th>Menang</th><th class="xl">Main</th>`;
  // nama musim yang sedang berjalan (server yang punya musim): poin di papan adalah poin musim itu
  const season = seasonName(board.season);
  const seasonLine = season ? `<p class="rank-season">${season}</p>` : '';
  body.innerHTML = board.top.length
    ? `${seasonLine}<p class="rank-me">${note}</p>
       <table class="rank-table${ranked ? ' tiered' : ''}"><thead><tr>${head}</tr></thead><tbody>${rows}${own}</tbody></table>
       <p class="hint">${ranked ? 'Urutan menurut poin peringkat, lalu XP akun.' : 'Urutan menurut XP akun.'} Hanya pertandingan online yang dihitung.${
         season ? ' Musim berganti tiap awal bulan (00.00 WIB): poin semua pemain dibagi dua, dan tier akhir memberi koin serta bingkai.' : ''
       }</p>`
    : `${seasonLine}<p class="rank-note">Belum ada pemain di papan peringkat.<br />${note}</p>`;
}

// ------------------------------------------------------------------- teman

/** Alasan daftar teman tidak tersedia untuk pemain ini sekarang. */
function friendsUnavailable(): string {
  if (!accounts.online) return 'Daftar teman hanya tersedia saat tersambung ke server akun.';
  if (!accounts.current()) return 'Daftar teman hanya untuk akun online.<br />Masuk atau daftar dulu, lalu tambahkan temanmu lewat nama akunnya.';
  return 'Server ini belum mendukung daftar teman.';
}

const STATUS_ORDER: Record<FriendStatus, number> = { lobby: 0, playing: 1, offline: 2 };

/**
 * Jendela daftar teman: tambah lewat nama akun, permintaan masuk (Terima / Tolak), teman dengan
 * tier dan statusnya (Undang / Hapus), dan permintaan terkirim (Batalkan). Isinya mengikuti
 * kabar dari server selama jendela terbuka. `room` memberi kode room pribadi untuk undangan
 * (dibuatkan lobby bila pemain belum mengisinya).
 *
 * Semua nama berasal dari server dan sudah disaring (hanya huruf, angka, spasi, garis bawah);
 * tetap saja semuanya dilewatkan `esc` sebelum masuk HTML, dan pesan ditulis lewat textContent.
 */
export function openFriends(room: () => string): void {
  const friends = accounts.friends;
  if (!friends.available) {
    openModal('Teman', `<p class="rank-note">${friendsUnavailable()}</p>`);
    return;
  }
  let stop = () => {};
  const body = openModal(
    'Teman',
    `<form class="fr-add" id="fr-add"><input id="fr-name" maxlength="16" placeholder="Nama akun pemain" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" /><button type="submit">Tambah</button></form>
     <p class="fr-msg" id="fr-msg" role="status"></p>
     <div id="fr-lists"></div>`,
    () => stop(),
  );
  const lists = body.querySelector<HTMLElement>('#fr-lists')!;
  const msg = body.querySelector<HTMLElement>('#fr-msg')!;
  const input = body.querySelector<HTMLInputElement>('#fr-name')!;
  /** Teman yang sedang ditanyakan "yakin hapus?". */
  let confirming = '';
  let busy = false;

  const say = (text: string, bad = false) => {
    msg.textContent = text;
    msg.classList.toggle('bad', bad);
  };
  const button = (act: string, name: string, label: string, cls = '', disabled = false) =>
    `<button type="button" data-act="${act}" data-name="${esc(name)}"${cls ? ` class="${cls}"` : ''}${disabled ? ' disabled' : ''}>${label}</button>`;

  const draw = () => {
    if (!friends.loaded) {
      lists.innerHTML = '<p class="fr-empty">Memuat daftar teman…</p>';
      return;
    }
    const { incoming, outgoing } = friends.list;
    const list = [...friends.list.friends].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));
    let html = '';
    if (incoming.length) {
      html += `<h4>Permintaan masuk · ${incoming.length}</h4><ul class="fr-list">`;
      for (const r of incoming) {
        html += `<li><span class="fr-who"><b>${esc(r.name)}</b>${tierBadgeFor(r.rp)}</span><span class="fr-acts">${button('accept', r.name, 'Terima', 'go')}${button('decline', r.name, 'Tolak')}</span></li>`;
      }
      html += '</ul>';
    }
    html += `<h4>Teman · ${list.length} / ${FRIENDS_MAX}</h4>`;
    if (list.length) {
      html += '<ul class="fr-list">';
      for (const f of list) {
        const acts =
          confirming === f.name
            ? `<span class="fr-ask">Hapus dari daftar teman?</span>${button('remove', f.name, 'Ya, hapus', 'bad')}${button('keep', f.name, 'Batal')}`
            : `${button('invite', f.name, 'Undang', 'go', f.status !== 'lobby')}${button('ask', f.name, 'Hapus')}`;
        html +=
          `<li class="${f.status}"><span class="fr-who"><i class="fr-dot"></i><b>${esc(f.name)}</b>${tierBadgeFor(f.rp)}${titleTag(f.title)}<small>${FRIEND_STATUS_TEXT[f.status]}</small></span>` +
          `<span class="fr-acts">${acts}</span></li>`;
      }
      html += '</ul>';
    } else {
      html += '<p class="fr-empty">Belum ada teman. Ketik nama akun temanmu di atas untuk mengirim permintaan.</p>';
    }
    if (outgoing.length) {
      html += `<h4>Permintaan terkirim · ${outgoing.length}</h4><ul class="fr-list">`;
      for (const name of outgoing) html += `<li><span class="fr-who"><b>${esc(name)}</b><small>Menunggu jawaban</small></span><span class="fr-acts">${button('cancel', name, 'Batalkan')}</span></li>`;
      html += '</ul>';
    }
    lists.innerHTML = html;
  };

  /** Jalankan satu permintaan ke server; selama menunggu, ketukan lain diabaikan. */
  const run = async (action: () => Promise<FriendResult>, done: (r: FriendResult & { ok: true }) => string) => {
    if (busy) return;
    busy = true;
    const r = await action();
    busy = false;
    if (!isModalOpen() || !lists.isConnected) return; // jendelanya sudah ditutup atau diganti
    if (r.ok) say(done(r));
    else {
      say(r.error, true);
      sound.play('error');
    }
    draw();
  };

  body.querySelector<HTMLFormElement>('#fr-add')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    void run(
      () => friends.add(name),
      (r) => {
        input.value = '';
        // jawaban yang sama entah nama itu terdaftar atau tidak
        return r.info === 'friends' ? `Kamu dan ${name} sekarang berteman.` : 'Permintaan terkirim bila nama itu ada.';
      },
    );
  });

  lists.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    const name = btn?.dataset.name;
    if (!btn || !name || btn.disabled) return;
    sound.play('click');
    switch (btn.dataset.act) {
      case 'accept':
        void run(
          () => friends.accept(name),
          () => `Kamu dan ${name} sekarang berteman.`,
        );
        break;
      case 'decline':
        void run(
          () => friends.decline(name),
          () => 'Permintaan ditolak.',
        );
        break;
      case 'cancel':
        void run(
          () => friends.cancel(name),
          () => 'Permintaan dibatalkan.',
        );
        break;
      case 'ask':
        confirming = name;
        draw();
        break;
      case 'keep':
        confirming = '';
        draw();
        break;
      case 'remove':
        confirming = '';
        void run(
          () => friends.remove(name),
          () => `${name} dihapus dari daftar teman.`,
        );
        break;
      case 'invite': {
        const code = room();
        void run(
          () => friends.invite(name, code),
          () => `Undangan terkirim ke ${name}. Room ${code}: tekan MAIN untuk masuk lebih dulu.`,
        );
        break;
      }
    }
  });

  stop = friends.subscribe(draw);
  draw();
  // satu permintaan tiap kali jendela dibuka, untuk berjaga-jaga bila ada kabar yang terlewat
  // (mis. selagi sambungan sempat putus); setelah itu perubahan datang sendiri dari server
  void friends.refresh();
}

// -------------------------------------------------------------------- toko

/** Yang dibutuhkan jendela Toko dari lobby: hero yang sedang dipilih dan skin yang dipakainya. */
export interface ShopHost {
  /** Id hero yang sedang dipilih di lobby. */
  hero(): string;
  /** Skin (indeks di SKINS) yang sedang dipakai hero itu. */
  skin(): number;
  /** Pakai skin itu untuk hero yang sedang dipilih (pilihan skin tetap per hero, seperti chip di kartu hero). */
  useSkin(skin: number): void;
  /** Gambar hero itu dengan skin tersebut (data URL); '' bila tidak bisa digambar. */
  preview(skin: number): string;
}

/**
 * Jendela Toko: saldo koin, barang yang dijual (skin premium dan paket emote), mana yang sudah
 * dimiliki, dan skin mana yang sedang dipakai hero terpilih. Membeli selalu lewat server (harga,
 * saldo, dan kepemilikan diperiksa di sana) dengan satu langkah konfirmasi, supaya ketukan yang
 * tidak sengaja tidak menghabiskan koin. Tamu, akun di perangkat, dan server versi lama hanya
 * mendapat keterangan.
 */
export function openShop(host: ShopHost): void {
  if (!accounts.economy) {
    openModal('Toko', `<p class="rank-note"><b>Toko kosmetik</b><br />${accounts.economyNote()}<br />Koin didapat dari pertandingan online, misi harian, dan hadiah harian.</p>`);
    return;
  }
  let stop = () => {};
  const body = openModal('Toko', '<div id="store"></div>', () => stop(), true);
  const root = body.querySelector<HTMLElement>('#store')!;
  const heroId = host.hero();
  const heroName = HEROES[heroId]?.name ?? 'hero ini';
  const accent = '#' + (HEROES[heroId]?.accent ?? 0xffd23f).toString(16).padStart(6, '0');
  /** Gambar contoh tiap skin premium untuk hero terpilih; digambar sekali saat jendela dibuka. */
  const art: Record<number, string> = {};
  for (const item of SHOP_ITEMS) if (item.kind === 'skin' && item.skin !== undefined) art[item.skin] = host.preview(item.skin);
  /** Barang yang sedang ditanyakan "yakin beli?". */
  let confirming = '';
  let busy = false;
  let note = { text: '', bad: false };

  const card = (item: ShopItem, coins: number, owned: boolean, live: boolean): string => {
    const skin = item.kind === 'skin' && item.skin !== undefined ? SKINS[item.skin] : undefined;
    const picture = skin
      ? `<div class="store-art" style="--hc:${accent};--hue:${Math.round(skin.hue * 360)}deg;--lum:${skin.lum}">${art[skin.id] ? `<img alt="" src="${art[skin.id]}" />` : '<i class="store-swatch"></i>'}</div>`
      : `<div class="store-art emo">${EMOTES.slice(FREE_EMOTES).map((e) => `<span>${e}</span>`).join('')}</div>`;
    let act: string;
    if (owned) {
      if (!skin) act = '<span class="own">Dimiliki</span><small>Aktif di pertandingan online</small>';
      else if (host.skin() === skin.id) act = `<span class="own">Dimiliki</span><small class="using">Dipakai ${esc(heroName)}</small>`;
      else act = `<span class="own">Dimiliki</span><button type="button" data-use="${skin.id}" title="Pakai skin ini untuk ${esc(heroName)}">Pakai</button><small>untuk ${esc(heroName)}</small>`;
    } else if (!live) {
      act = `<button type="button" disabled>${COIN}${item.price}</button><small>Sambungkan ke server untuk membeli</small>`;
    } else if (confirming === item.id) {
      act = `<span class="fr-ask">Beli seharga ${item.price} koin?</span><button type="button" class="go" data-confirm="${item.id}">Ya, beli</button><button type="button" data-cancel="1">Batal</button>`;
    } else if (coins < item.price) {
      act = `<button type="button" class="poor" data-poor="${item.id}">${COIN}${item.price}</button><small class="short">Kurang ${item.price - coins} koin</small>`;
    } else {
      act = `<button type="button" class="go" data-buy="${item.id}">${COIN}${item.price}</button>`;
    }
    // paket emote: emotenya sudah tampil di gambar, jadi keterangannya cukup jumlahnya
    const desc = skin ? `Skin warna premium untuk semua hero. Contoh: ${esc(heroName)}.` : `${EMOTES.length - FREE_EMOTES} emote tambahan di menu pesan cepat, untuk pertandingan online.`;
    return `<li class="store-card${owned ? ' owned' : ''}">${picture}<div class="store-info"><b>${item.name}</b><small>${desc}</small></div><div class="store-act">${act}</div></li>`;
  };

  const draw = () => {
    const acc = accounts.current();
    if (!acc || !accounts.economy) {
      closeModal(); // keluar akun atau sambungan berganti selagi toko terbuka
      return;
    }
    const p = acc.profile;
    const live = accounts.online;
    const list = (kind: ShopItem['kind']) =>
      SHOP_ITEMS.filter((i) => i.kind === kind)
        .map((i) => card(i, p.coins, p.owned.includes(i.id), live))
        .join('');
    root.innerHTML =
      `<div class="wallet big">${coinText(p.coins)}<small>Koin didapat dari pertandingan online (menang +${COINS_WIN}, kalah +${COINS_LOSS}), misi harian (+${COINS_MISSION}), hadiah harian, dan hadiah akhir musim.</small></div>` +
      `<p class="fr-msg${note.bad ? ' bad' : ''}" id="store-msg" role="status">${esc(note.text)}</p>` +
      `<h4>Skin premium</h4><ul class="store-list">${list('skin')}</ul>` +
      `<h4>Emote</h4><ul class="store-list">${list('emotes')}</ul>` +
      `<h4>Tidak dijual</h4><p class="hint">Gelar dibuka lewat pencapaian, dan bingkai didapat dari tier akhir musim (${RANK_TIERS.filter((t) => SEASON_REWARDS[t.id])
        .map((t) => `${t.name} +${SEASON_REWARDS[t.id]} koin`)
        .join(', ')}). Keduanya dipasang di Profil.</p>` +
      `${live ? '' : '<p class="hint warn">Sedang tidak tersambung ke server akun: toko hanya bisa dilihat.</p>'}`;
  };
  const say = (text: string, bad = false) => {
    note = { text, bad };
  };

  root.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!btn || btn.disabled || busy) return;
    const d = btn.dataset;
    if (d.use !== undefined) {
      sound.play('click');
      host.useSkin(Number(d.use));
      say(`${SKINS[Number(d.use)]?.name ?? 'Skin'} sekarang dipakai ${heroName}.`);
    } else if (d.poor) {
      const item = SHOP_ITEMS.find((i) => i.id === d.poor);
      const coins = accounts.current()?.profile.coins ?? 0;
      sound.play('error');
      if (item) say(`Koin belum cukup: ${item.name} seharga ${item.price} koin, dan kamu punya ${coins}.`, true);
    } else if (d.buy) {
      sound.play('click');
      confirming = d.buy;
      say('');
    } else if (d.cancel) {
      sound.play('click');
      confirming = '';
    } else if (d.confirm) {
      const item = SHOP_ITEMS.find((i) => i.id === d.confirm);
      if (!item) return;
      busy = true;
      confirming = '';
      const r: EconomyResult<{ already: boolean }> = await accounts.buy(item.id);
      busy = false;
      if (!isModalOpen() || !root.isConnected) return; // jendelanya sudah ditutup atau diganti
      if (r.ok) {
        say(r.already ? `${item.name} sudah kamu miliki.` : `${item.name} dibeli.${item.kind === 'skin' ? ' Tekan "Pakai" untuk memakainya.' : ' Emote barunya ada di menu pesan cepat saat bertanding.'}`);
        sound.play(r.already ? 'click' : 'levelup');
      } else {
        say(r.error, true);
        sound.play('error');
      }
    } else return;
    draw();
  });

  // saldo dan barang bisa berubah dari tempat lain (hadiah, tab lain): gambar ulang
  stop = accounts.subscribe(() => {
    if (root.isConnected && !busy) draw();
  });
  draw();
}

// ------------------------------------------------------------- musim baru

/**
 * Ringkasan satu kali saat musim berganti: tier dan poin akhir musim yang ditutup, hadiah koin,
 * bingkai yang didapat, dan poin awal musim ini. Server menandai akun yang ringkasannya belum
 * dilihat (`seasonNote`); begitu jendela ini ditutup, tandanya dihapus (acc:seen). Mengembalikan
 * false bila tidak ada yang perlu ditampilkan.
 */
export function openSeasonNews(acc: Account): boolean {
  const p = acc.profile;
  const closed = p.seasons[0];
  if (!accounts.economy || !accounts.online || !p.seasonNote || !closed || closed.id !== p.seasonNote) return false;
  const tier = RANK_TIERS.find((t) => t.id === closed.tier) ?? rankTier(closed.rp).tier;
  const start = seasonCarry(closed.rp);
  const now = seasonName(p.season ?? accounts.season());
  const body = openModal(
    'Musim baru',
    `<div id="season-news">
       <p class="season-head">${now || 'Musim baru'} dimulai</p>
       <p class="hint">${seasonName(closed.id)} sudah ditutup. Ini hasilmu di musim itu:</p>
       <div class="rank-card t-${tier.id}">${tierBadge(tier, false)}
         <div class="grow"><div class="rank-line"><b>${tier.name}</b><span>${closed.rp} poin peringkat</span></div><small>Tier akhir ${seasonName(closed.id)}</small></div></div>
       <ul class="plain-list season-gain">
         <li><b>Hadiah musim</b><span>${closed.coins ? coinText(closed.coins, true) : 'Belum ada: hadiah koin mulai dari tier Perak'}</span></li>
         <li><b>Bingkai baru</b><span>${frameSwatch(tier.id)}${frameName(tier.id)}${p.frame === tier.id ? ' · terpasang' : ''}</span></li>
         <li><b>Poin awal musim ini</b><span>${closed.rp} &rarr; ${start} · ${tierBadge(rankTier(start).tier)}</span></li>
       </ul>
       <p class="hint">Tiap awal bulan poin peringkat semua pemain dibagi dua. Bingkai bisa diganti di Profil.</p>
       <div class="season-ok"><button type="button" id="season-ok">Mengerti</button></div>
     </div>`,
    () => void accounts.seenSeason(closed.id),
  );
  body.querySelector('#season-ok')!.addEventListener('click', closeModal);
  sound.play('levelup');
  return true;
}
