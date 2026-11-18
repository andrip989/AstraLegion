// Ikon mantra tempur (SVG 32x32, warna mengikuti currentColor). Kunci = id di shared/src/spells.ts.

const svg = (body: string) => `<svg class="ico" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ICONS: Record<string, string> = {
  // kilat: petir dengan garis gerak
  flash: svg('<path d="M18 3 8 18h7l-2 11 11-16h-7z" fill="currentColor" stroke="none"/><path d="M3 9h5M2 15h4M4 21h4"/>'),
  // pulih: tanda tambah di dalam tetes
  heal: svg('<path d="M16 3c5 7 9 11 9 16a9 9 0 0 1-18 0c0-5 4-9 9-16z"/><path d="M16 14v9M11.500 18.500h9"/>'),
  // pacu: sepatu bersayap disederhanakan jadi tiga panah maju
  sprint: svg('<path d="M5 8l7 8-7 8M13 8l7 8-7 8M21 8l7 8-7 8"/>'),
};

export function spellIcon(id: string): string {
  return ICONS[id] ?? svg('<circle cx="16" cy="16" r="9"/>');
}
