// Pengaturan pemain yang tersimpan di perangkat (kualitas grafik disimpan terpisah di render/quality).

export interface Settings {
  /** Volume 0..1. */
  master: number;
  sfx: number;
  music: number;
  /** Guncangan kamera saat ledakan besar. */
  shake: boolean;
  showFps: boolean;
  /** Percikan darah kartun saat unit terkena serangan. */
  blood: boolean;
}

const KEY = 'astra.settings.v1';
const DEFAULTS: Settings = { master: 0.8, sfx: 0.8, music: 0.45, shake: true, showFps: false, blood: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* penyimpanan tidak tersedia / data rusak */
  }
  return { ...DEFAULTS };
}

export const settings: Settings = load();

const listeners = new Set<() => void>();

/** Dipanggil tiap kali ada pengaturan yang berubah. */
export function onSettings(fn: () => void): void {
  listeners.add(fn);
}

export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* tidak bisa disimpan: tetap berlaku untuk sesi ini */
  }
  for (const fn of listeners) fn();
}
