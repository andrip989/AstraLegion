// Ikon skill (SVG 32x32, digambar dengan warna teks saat ini). Key = id skill.
// Skill tanpa ikon khusus memakai ikon bintang umum.

const bolt = (dx = 0, dy = 0, s = 1) =>
  `<path transform="translate(${dx} ${dy}) scale(${s})" d="M18 2 7 18h7l-3 12 14-17h-8z" fill="currentColor"/>`;

const ICONS: Record<string, string> = {
  // Volt Titan
  vt_slam:
    bolt(1, -3, 0.82) +
    `<path d="M4 25c4-4 20-4 24 0M8 29c3-2 13-2 16 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  vt_shield:
    `<path d="M16 2.5 27 6.5v8.6c0 6.8-4.6 11.6-11 14.4C9.6 26.7 5 21.9 5 15.1V6.500z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>` +
    bolt(5.2, 5.6, 0.66),
  vt_charge:
    `<path d="M3 9h9M2 16h8M3 23h9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="m14 6 9 10-9 10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="m21 6 9 10-9 10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`,
  vt_tempest:
    `<circle cx="16" cy="16" r="5" fill="currentColor"/>` +
    `<path d="M16 1.5v6M16 24.5v6M1.500 16h6M24.500 16h6M5.700 5.700l4.300 4.300M22 22l4.300 4.300M26.300 5.700 22 10M10 22l-4.300 4.300" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>` +
    `<circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 3.4" opacity=".7"/>`,

  // Nova Striker
  ns_beam:
    `<circle cx="6" cy="16" r="4.2" fill="currentColor"/>` +
    `<path d="M9 12.500 30 10v12L9 19.500z" fill="currentColor" opacity=".85"/>` +
    `<path d="M12 6.500 28 3M12 25.500 28 29" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity=".6"/>`,
  ns_grenade:
    `<circle cx="15" cy="18" r="8.500" fill="none" stroke="currentColor" stroke-width="2.6"/>` +
    `<circle cx="15" cy="18" r="3.600" fill="currentColor"/>` +
    `<path d="m21 11 4-4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M27 1.500v4M29.500 6.500h-4M24 3l1.500 1.500" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  ns_blink:
    `<path d="M3 16h5M10 16h3" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" opacity=".6"/>` +
    `<path d="m15 7 9 9-9 9" fill="none" stroke="currentColor" stroke-width="3.200" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M27 3.500 28.300 7l3.500 1.300-3.500 1.300L27 13.100l-1.300-3.500L22.200 8.300 25.700 7z" fill="currentColor"/>`,
  ns_lance:
    `<path d="M3 29 23 9" stroke="currentColor" stroke-width="4.500" stroke-linecap="round"/>` +
    `<path d="M24 1.500 26.400 7.600 32.500 10l-6.100 2.400L24 18.500l-2.400-6.100L15.500 10l6.100-2.400z" transform="translate(-1.500 -1)" fill="currentColor"/>` +
    `<path d="M3 21 10 14M11 29l7-7" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" opacity=".6"/>`,

  // Shadow Fang
  sf_dash:
    `<path d="M2 10h10M2 16h7M2 22h10" stroke="currentColor" stroke-width="2.400" stroke-linecap="round" opacity=".65"/>` +
    `<path d="M13 22 30 5l-4 13z" fill="currentColor"/>` +
    `<path d="m11 24 4-4 3 3-4 4z" fill="currentColor" opacity=".8"/>`,
  sf_vanish:
    `<path d="M2 16c4-6.500 9-9.500 14-9.500S26 9.500 30 16c-4 6.500-9 9.500-14 9.500S6 22.500 2 16z" fill="none" stroke="currentColor" stroke-width="2.400" stroke-linejoin="round" stroke-dasharray="4.500 3"/>` +
    `<circle cx="16" cy="16" r="4" fill="currentColor"/>` +
    `<path d="M5 27 27 5" stroke="currentColor" stroke-width="2.600" stroke-linecap="round"/>`,
  sf_fan: [-56, -28, 0, 28, 56]
    .map((a) => `<path transform="rotate(${a} 16 27)" d="M16 3.500 18.500 20h-5z" fill="currentColor"/>`)
    .join('')
    .concat(`<circle cx="16" cy="27" r="3" fill="currentColor"/>`),
  sf_execute:
    `<path d="M5 4 19 18l-2 2L3 6z" fill="currentColor"/><path d="M27 4 13 18l2 2L29 6z" fill="currentColor"/>` +
    `<path d="m9 21 3 3-5 5-3-3zM23 21l-3 3 5 5 3-3z" fill="currentColor" opacity=".8"/>` +
    `<circle cx="16" cy="8" r="2.400" fill="currentColor"/>`,
};

// Lumen Sage
Object.assign(ICONS, {
  ls_orb:
    `<circle cx="16" cy="16" r="6" fill="currentColor"/>` +
    `<path d="M16 2v5M16 25v5M2 16h5M25 16h5M6 6l3.500 3.500M22.500 22.500 26 26M26 6l-3.500 3.500M9.500 22.500 6 26" stroke="currentColor" stroke-width="2.400" stroke-linecap="round" opacity=".8"/>`,
  ls_heal:
    `<path d="M12 4h8v8h8v8h-8v8h-8v-8H4v-8h8z" fill="currentColor"/>` +
    `<path d="M26 3v4M24 5h4M5 24v4M3 26h4" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" opacity=".75"/>`,
  ls_bind:
    `<path d="M2 16h28" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>` +
    `<ellipse cx="9" cy="16" rx="3" ry="7" fill="none" stroke="currentColor" stroke-width="2.200"/>` +
    `<ellipse cx="16" cy="16" rx="3" ry="7" fill="none" stroke="currentColor" stroke-width="2.200"/>` +
    `<ellipse cx="23" cy="16" rx="3" ry="7" fill="none" stroke="currentColor" stroke-width="2.200"/>`,
  ls_sanctuary:
    `<path d="M3 27a13 13 0 0 1 26 0" fill="none" stroke="currentColor" stroke-width="2.800" stroke-linecap="round"/>` +
    `<path d="M14 15h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill="currentColor"/>` +
    `<path d="M16 2v5M6 6l3 3.500M26 6l-3 3.500" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" opacity=".75"/>`,
});

// Ember Lancer
const flame = (dx = 0, dy = 0, s = 1) =>
  `<path transform="translate(${dx} ${dy}) scale(${s})" d="M16.500 7c.800 3.600 5 5.600 5 10.400a5.500 5.500 0 0 1-11 0c0-2.200 1-3.700 2.200-5 .200 1.700.900 2.800 1.800 3.300-.300-3.200.800-6.300 2-8.700z" fill="currentColor"/>`;

Object.assign(ICONS, {
  el_thrust:
    `<path d="M3 29 19 13" stroke="currentColor" stroke-width="2.800" stroke-linecap="round"/>` +
    `<path d="m14.500 10.500 7 7" stroke="currentColor" stroke-width="2.400" stroke-linecap="round"/>` +
    `<path d="M30 2 25 14l-7-7z" fill="currentColor"/>` +
    `<path d="M4 17l5-5M15 28l5-5" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" opacity=".6"/>`,
  el_guard:
    `<circle cx="16" cy="16" r="12.500" fill="none" stroke="currentColor" stroke-width="2.400"/>` +
    `<circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" stroke-width="1.200" stroke-dasharray="1.500 3.210" opacity=".7"/>` +
    flame(0, 0.6),
  el_leap:
    `<path d="M4 26C5 11 16 4 23.500 14.500" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" stroke-dasharray="4.500 3.400" opacity=".7"/>` +
    `<path d="M26.500 22 27 13.500 19.500 17.500z" fill="currentColor"/>` +
    `<path d="M14 28.500c3.500-3 15-3 17.500 0" fill="none" stroke="currentColor" stroke-width="2.400" stroke-linecap="round"/>`,
  el_cyclone: [0, 120, 240]
    .map((a) => `<path transform="rotate(${a} 16 16)" d="M16 3.500c6.500 0 11 4.500 11.500 10-2.500-3.500-6.500-5-11.500-4.500z" fill="currentColor"/>`)
    .join('')
    .concat(`<circle cx="16" cy="16" r="3.400" fill="currentColor"/>`),
});

// Gale Archer
/** Anak panah mendatar: bulu ekor di `x`, mata panah di `x + len`. */
const arrow = (x: number, y: number, len: number, s = 1) =>
  `<path d="M${x} ${y}h${len - 6 * s}" stroke="currentColor" stroke-width="${2.4 * s}" stroke-linecap="round"/>` +
  `<path d="M${x + len} ${y}l${-8 * s} ${-4.4 * s}v${8.8 * s}z" fill="currentColor"/>`;

Object.assign(ICONS, {
  ga_piercer:
    arrow(6, 16, 24) +
    `<path d="M3 12.500l3.500 3.500-3.500 3.500M7 12.500l3.500 3.500-3.500 3.500" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M9 9h10.500a2.600 2.600 0 1 0-2.600-2.600M12 23h9.500a2.600 2.600 0 1 1-2.600 2.600" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" opacity=".65"/>`,
  ga_slip:
    `<path d="M11 24.500a8.500 8.500 0 1 1 8.500-8.500c0 3-2.400 5.400-5.400 5.400S9 19.300 9 16.600c0-2 1.600-3.600 3.600-3.600" fill="none" stroke="currentColor" stroke-width="2.400" stroke-linecap="round" opacity=".7"/>` +
    `<path d="m22 8 8 8-8 8" fill="none" stroke="currentColor" stroke-width="3.200" stroke-linecap="round" stroke-linejoin="round"/>`,
  ga_stance:
    `<path d="M8 2.500c13 4.500 13 22.500 0 27" fill="none" stroke="currentColor" stroke-width="2.800" stroke-linecap="round"/>` +
    `<path d="M8 2.500v27" stroke="currentColor" stroke-width="1.400" stroke-linecap="round"/>` +
    arrow(3, 16, 27, 0.9) +
    `<path d="m23 4 4.500 3.500L23 11M23 21l4.500 3.500L23 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>`,
  ga_volley:
    arrow(2, 7.500, 22, 0.85) +
    arrow(8, 16, 23, 0.85) +
    arrow(2, 24.500, 22, 0.85) +
    `<path d="M2 16h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".6"/>`,
});

const FALLBACK =`<path d="m16 2 3.800 9.200L29.500 12l-7.300 6.400 2.200 9.600L16 22.900 7.600 28l2.200-9.600L2.500 12l9.700-.8z" fill="currentColor"/>`;

/** Markup SVG lengkap untuk ikon sebuah skill. */
export function skillIcon(id: string): string {
  return `<svg class="ico" viewBox="0 0 32 32" aria-hidden="true">${ICONS[id] ?? FALLBACK}</svg>`;
}

// ---------------------------------------------------------------- ikon item toko

const ITEM_ICONS: Record<string, string> = {
  storm_blade: `<path d="M24 3 29 8 13 24l-5 1 1-5z" fill="currentColor"/><path d="m6 21 5 5-3 3-5-5z" fill="currentColor" opacity=".75"/>`,
  titan_plate:
    `<path d="M6 6 16 3l10 3v9c0 7-4.500 11-10 14C10.500 26 6 22 6 15z" fill="currentColor" opacity=".85"/>` +
    `<path d="M16 8v16M10 13h12" stroke="#0b1020" stroke-width="2" stroke-linecap="round"/>`,
  wind_boots:
    `<path d="M9 4h8v13l9 4v6H9z" fill="currentColor"/>` +
    `<path d="M2 12h5M1 18h6M2 24h5" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" opacity=".7"/>`,
  mana_core:
    `<circle cx="16" cy="16" r="6.500" fill="currentColor"/>` +
    `<circle cx="16" cy="16" r="11.500" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4" opacity=".8"/>`,
  flash_gauntlet:
    `<path d="M8 13V6h4v5h2V4h4v7h2V6h4v14c0 5-3.500 8-8 8s-8-3-8-8v-7z" fill="currentColor"/>` +
    `<path d="m17 14-4 6h3l-1 4 4-6h-3z" fill="#0b1020"/>`,
  cosmic_clock:
    `<circle cx="16" cy="16" r="11.500" fill="none" stroke="currentColor" stroke-width="2.600"/>` +
    `<path d="M16 8.500V16l5.500 3.500" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/>`,
  vampire_fang:
    `<path d="M7 4h7l-1.500 13c-.300 3-1 6-2 9-1.500-4-3-11-3.500-22zM18 4h7c-.500 11-2 18-3.500 22-1-3-1.700-6-2-9z" fill="currentColor"/>` +
    `<circle cx="16" cy="27" r="2.200" fill="currentColor" opacity=".7"/>`,
  astra_crystal: `<path d="M16 2 26 12 16 30 6 12z" fill="currentColor" opacity=".9"/><path d="M6 12h20M16 2l-4 10 4 18 4-18z" fill="none" stroke="#0b1020" stroke-width="1.400"/>`,
  nova_greatsword:
    `<path d="M22 2h8v8L14 26l-8-8z" fill="currentColor"/>` +
    `<path d="m4 20 8 8M5 27l-3 3M9 23l-4 4" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  dragon_heart:
    `<path d="M16 28C6 21 3 15.500 3 11a6.500 6.500 0 0 1 13-1.500A6.500 6.500 0 0 1 29 11c0 4.500-3 10-13 17z" fill="currentColor"/>` +
    `<path d="m16 12-3 5h3l-1.500 5 4.500-6h-3z" fill="#0b1020"/>`,
};

// item aktif
ITEM_ICONS.aegis_plate = `<path d="M16 3 27 7v8c0 7-4.600 11.500-11 14C9.600 26.500 5 22 5 15V7z" fill="currentColor"/><path d="M16 8v16M9 14h14" stroke="#0b1020" stroke-width="2.400" fill="none"/>`;
ITEM_ICONS.pure_charm = `<circle cx="16" cy="18" r="8" fill="currentColor"/><path d="M12 9c0-4 8-4 8 0" stroke="currentColor" stroke-width="2" fill="none"/><path d="m16 13 1.600 3.400 3.700.400-2.800 2.500.800 3.700L16 21.100 12.700 23l.800-3.700-2.800-2.500 3.700-.400z" fill="#0b1020"/>`;
ITEM_ICONS.thunder_horn = `<path d="M4 20c8 0 14-4 18-12l6 3c-3 10-11 16-22 17z" fill="currentColor"/><path d="m18 14-3 5h3l-1.500 5 4.500-6h-3z" fill="#0b1020"/><circle cx="6" cy="24" r="2.400" fill="currentColor" opacity=".7"/>`;

/** Markup SVG lengkap untuk ikon sebuah item. */
export function itemIcon(id: string): string {
  return `<svg class="ico" viewBox="0 0 32 32" aria-hidden="true">${ITEM_ICONS[id] ?? FALLBACK}</svg>`;
}
