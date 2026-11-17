// Titik masuk client: lobby pemilihan hero -> sambung ke server (atau offline) -> mulai game.
import { HERO_LIST, SKILL_KEYS } from '../../shared/src';
import { GameClient } from './game/GameClient';
import { connect, type Transport } from './net/transport';

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
let transport: Promise<Transport>;

// ----- kartu hero -----
const cards = $('hero-cards');
for (const h of HERO_LIST) {
  const el = document.createElement('button');
  el.className = 'hero-card';
  el.style.setProperty('--hc', '#' + h.accent.toString(16).padStart(6, '0'));
  el.innerHTML =
    `<div class="swatch"></div><div class="role">${h.role}</div><h3>${h.name}</h3><p>${h.desc}</p>` +
    `<ul>${h.skills.map((s, i) => `<li><b>${SKILL_KEYS[i]}</b>${s.name}</li>`).join('')}</ul>`;
  el.addEventListener('click', () => {
    selectedHero = h.id;
    store.set('hero', h.id);
    refreshCards();
  });
  el.dataset.id = h.id;
  cards.appendChild(el);
}
function refreshCards(): void {
  for (const el of cards.children) el.classList.toggle('selected', (el as HTMLElement).dataset.id === selectedHero);
}
refreshCards();

// ----- koneksi -----
const nameInput = $<HTMLInputElement>('name-input');
const serverInput = $<HTMLInputElement>('server-input');
const playBtn = $<HTMLButtonElement>('play-btn');
const status = $('conn-status');
nameInput.value = store.get('name');

function serverUrl(): string {
  const q = new URLSearchParams(location.search).get('server');
  return (q ?? (store.get('server') || import.meta.env.VITE_SERVER_URL || '')).trim().replace(/\/+$/, '');
}
serverInput.value = serverUrl();

function startConnect(): void {
  playBtn.disabled = true;
  status.className = '';
  status.textContent = 'Menghubungkan ke server…';
  transport = connect(serverUrl());
  transport.then((t) => {
    playBtn.disabled = false;
    if (t.mode === 'online') {
      status.className = 'ok';
      status.textContent = 'Terhubung ke server multiplayer.';
    } else {
      status.className = 'off';
      status.textContent = 'Server multiplayer tidak ditemukan. Mode offline: latihan 3v3 lawan bot.';
    }
  });
}
startConnect();

$('server-btn').addEventListener('click', () => {
  transport.then((t) => t.close());
  store.set('server', serverInput.value.trim());
  startConnect();
});

playBtn.addEventListener('click', async () => {
  playBtn.disabled = true;
  const t = await transport;
  const name = nameInput.value.trim() || 'Pemain';
  store.set('name', name);
  const result = await t.join({ name, heroId: selectedHero });
  if (!result.ok) {
    status.className = 'off';
    status.textContent = result.error ?? 'Gagal bergabung.';
    playBtn.disabled = false;
    return;
  }
  $('lobby').classList.add('hidden');
  new GameClient(t);
});

// Tautan unduh APK: hanya di versi web, dan hanya jika alamatnya diberikan saat build (VITE_APK_URL).
const isNative = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
const apkUrl = import.meta.env.VITE_APK_URL as string | undefined;
if (!isNative && apkUrl) {
  const link = $<HTMLAnchorElement>('apk-link');
  link.href = apkUrl;
  link.classList.remove('hidden');
}
