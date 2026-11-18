// Jendela modal: Pengaturan dan Profil. Dipakai dari lobby maupun saat bertanding.
import { HEROES, type BoardRow } from '../../../shared/src';
import { accountLevel, accounts, type Account } from '../account/accounts';
import { achievementView, dailyView } from '../account/progress';
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

function openModal(title: string, html: string, closed?: () => void): HTMLElement {
  const body = $('modal-body');
  $('modal-title').textContent = title;
  body.innerHTML = html;
  $('modal').classList.remove('hidden');
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

/** Jendela profil: level akun, statistik, hero favorit, dan riwayat pertandingan. */
export function openProfile(acc: Account): void {
  const p = acc.profile;
  const lv = accountLevel(p.xp);
  const winRate = p.matches ? Math.round((p.wins / p.matches) * 100) : 0;
  const kda = ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2);
  const heroes = Object.entries(p.heroes)
    .sort((a, b) => b[1].games - a[1].games)
    .map(([id, h]) => `<li><b>${esc(HEROES[id]?.name ?? id)}</b><span>${h.games} main · ${h.games ? Math.round((h.wins / h.games) * 100) : 0}% menang</span></li>`)
    .join('');
  const history = p.history
    .map(
      (m) =>
        `<li class="${m.win ? 'win' : 'lose'}"><b>${m.win ? 'Menang' : 'Kalah'}</b><span>${esc(HEROES[m.hero]?.name ?? m.hero)}</span><span>${m.k} / ${m.d} / ${m.a}</span><span>${fmtTime(m.dur)}</span><span>+${m.xp} XP</span></li>`,
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
  openModal(
    'Profil',
    `<div class="profile-head">
       <div class="lv-badge">${lv.level}</div>
       <div class="grow"><h3>${esc(acc.name)}<span class="acc-kind ${accounts.kind}">${accounts.kind === 'server' ? (accounts.online ? 'Akun online' : 'Akun online · sedang offline') : 'Akun di perangkat ini'}</span></h3>
         <div class="xpbar"><div style="width:${Math.round((lv.into / lv.need) * 100)}%"></div></div>
         <small>Level akun ${lv.level} · ${lv.into} / ${lv.need} XP</small></div>
     </div>
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
     <h4>Hero</h4>
     <ul class="plain-list">${heroes || '<li><span>Belum ada pertandingan.</span></li>'}</ul>
     <h4>Riwayat</h4>
     <ul class="plain-list history">${history || '<li><span>Belum ada pertandingan.</span></li>'}</ul>`,
  );
}

let boardTurn = 0;

/**
 * Jendela papan peringkat: akun online teratas menurut XP akun (peringkat, nama, level, menang,
 * jumlah pertandingan), dengan baris pemain sendiri disorot. Datanya dari server, jadi saat
 * offline hanya ada keterangan.
 */
export async function openLeaderboard(): Promise<void> {
  const turn = ++boardTurn;
  const body = openModal('Peringkat', '<p class="rank-note">Memuat papan peringkat…</p>');
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
  const row = (b: BoardRow, mine: boolean) =>
    `<tr class="${mine ? 'me' : ''}"><td class="rk${b.rank <= 3 ? ` top${b.rank}` : ''}">${b.rank}</td><td class="nm">${esc(b.name)}${mine ? '<small>kamu</small>' : ''}</td>` +
    `<td><span class="lv">${b.level}</span></td><td>${b.wins}</td><td>${b.matches}</td></tr>`;
  const isMe = (b: BoardRow) => !!me && b.rank === me.rank && b.name === me.name;
  const rows = board.top.map((b) => row(b, isMe(b))).join('');
  // pemain di luar daftar teratas tetap melihat barisnya sendiri di bawah
  const own = me && !board.top.some(isMe) ? `<tr class="gap"><td colspan="5">&#8943;</td></tr>${row(me, true)}` : '';
  // peringkat sendiri di atas tabel, supaya terlihat tanpa menggulir
  const note = me
    ? `Peringkatmu <b>${me.rank}</b> dari ${board.total} pemain`
    : accounts.current()
      ? 'Akun yang sedang dipakai hanya ada di perangkat ini, jadi tidak ikut papan peringkat.'
      : 'Masuk atau daftar akun online supaya namamu ikut di papan peringkat.';
  body.innerHTML = board.top.length
    ? `<p class="rank-me">${note}</p>
       <table class="rank-table"><thead><tr><th class="rk">#</th><th class="nm">Nama</th><th>Level</th><th>Menang</th><th>Main</th></tr></thead><tbody>${rows}${own}</tbody></table>
       <p class="hint">Urutan menurut XP akun. Hanya pertandingan online yang dihitung.</p>`
    : `<p class="rank-note">Belum ada pemain di papan peringkat.<br />${note}</p>`;
}
