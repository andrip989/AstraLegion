// Definisi data hero & skill. Untuk menambah hero baru:
//   1. tambahkan HeroDef di sini,
//   2. tulis handler skill-nya di server/src/game/skills/,
//   3. tulis model 3D-nya di client/src/render/heroModels.ts.

export type SkillTarget = 'self' | 'point' | 'dir';
/** Petunjuk untuk AI bot tentang cara memakai skill. */
export type SkillAi = 'damage' | 'buff' | 'escape' | 'gap';

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  cooldown: number; // detik
  mana: number;
  range: number; // jarak lempar maksimum (0 untuk skill 'self')
  target: SkillTarget;
  radius?: number; // radius area efek
  width?: number; // lebar beam
  ai: SkillAi;
  keepsStealth?: boolean;
}

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  role: string;
  desc: string;
  color: number;
  accent: number;
  hp: number;
  hpGrowth: number;
  mana: number;
  manaGrowth: number;
  hpRegen: number;
  manaRegen: number;
  damage: number;
  damageGrowth: number;
  attackRange: number;
  attackInterval: number;
  moveSpeed: number;
  ranged: boolean;
  radius: number;
  skills: [SkillDef, SkillDef, SkillDef, SkillDef];
}

export const SKILL_KEYS = ['Q', 'W', 'E', 'R'] as const;

export const HEROES: Record<string, HeroDef> = {
  volt_titan: {
    id: 'volt_titan',
    name: 'Volt Titan',
    title: 'Benteng Petir',
    role: 'Tank',
    desc: 'Raksasa berzirah petir. Tebal, lambat, dan ahli mengunci musuh dengan stun area.',
    color: 0x3d4a66,
    accent: 0xffd23f,
    hp: 760,
    hpGrowth: 84,
    mana: 280,
    manaGrowth: 30,
    hpRegen: 4,
    manaRegen: 2.5,
    damage: 52,
    damageGrowth: 4,
    attackRange: 2.4,
    attackInterval: 1.1,
    moveSpeed: 6.8,
    ranged: false,
    radius: 0.9,
    skills: [
      {
        id: 'vt_slam',
        name: 'Thunder Slam',
        desc: 'Menghantam tanah di titik target: damage area dan STUN 1,2 detik.',
        cooldown: 8,
        mana: 60,
        range: 7,
        target: 'point',
        radius: 4,
        ai: 'damage',
      },
      {
        id: 'vt_shield',
        name: 'Static Shield',
        desc: 'Menyelimuti diri dengan perisai listrik yang menyerap damage selama 4 detik.',
        cooldown: 12,
        mana: 50,
        range: 0,
        target: 'self',
        ai: 'buff',
      },
      {
        id: 'vt_charge',
        name: 'Lightning Charge',
        desc: 'Menerjang ke arah target, memberi damage dan memperlambat musuh di titik tiba.',
        cooldown: 10,
        mana: 55,
        range: 10,
        target: 'point',
        radius: 3,
        ai: 'gap',
      },
      {
        id: 'vt_tempest',
        name: 'Tempest Core',
        desc: 'ULTIMATE. Melepas badai petir di sekeliling: damage besar dan STUN 1,8 detik.',
        cooldown: 55,
        mana: 120,
        range: 0,
        target: 'self',
        radius: 8,
        ai: 'damage',
      },
    ],
  },

  nova_striker: {
    id: 'nova_striker',
    name: 'Nova Striker',
    title: 'Penembak Bintang',
    role: 'Ranged Blaster',
    desc: 'Penembak jarak jauh bermeriam plasma. Rapuh, tapi beam-nya menembus satu barisan.',
    color: 0xe8ecf4,
    accent: 0x2ee6ff,
    hp: 500,
    hpGrowth: 62,
    mana: 380,
    manaGrowth: 40,
    hpRegen: 2,
    manaRegen: 3.5,
    damage: 45,
    damageGrowth: 4.1,
    attackRange: 9.2,
    attackInterval: 0.98,
    moveSpeed: 7,
    ranged: true,
    radius: 0.7,
    skills: [
      {
        id: 'ns_beam',
        name: 'Photon Beam',
        desc: 'Menembakkan ENERGY BEAM lurus yang menembus semua musuh di jalurnya.',
        cooldown: 6,
        mana: 55,
        range: 16,
        target: 'dir',
        width: 1.6,
        ai: 'damage',
      },
      {
        id: 'ns_grenade',
        name: 'Pulse Grenade',
        desc: 'Melempar granat pulsa: damage area dan memperlambat musuh 2 detik.',
        cooldown: 9,
        mana: 60,
        range: 11,
        target: 'point',
        radius: 3.5,
        ai: 'damage',
      },
      {
        id: 'ns_blink',
        name: 'Blink Thrusters',
        desc: 'Berpindah seketika sejauh jarak pendek ke arah target.',
        cooldown: 13,
        mana: 45,
        range: 7,
        target: 'point',
        ai: 'escape',
      },
      {
        id: 'ns_lance',
        name: 'Supernova Lance',
        desc: 'ULTIMATE. Mengisi daya sejenak lalu menembakkan beam raksasa berjangkauan sangat jauh.',
        cooldown: 60,
        mana: 130,
        range: 34,
        target: 'dir',
        width: 3.2,
        ai: 'damage',
      },
    ],
  },

  shadow_fang: {
    id: 'shadow_fang',
    name: 'Shadow Fang',
    title: 'Taring Senyap',
    role: 'Assassin',
    desc: 'Pembunuh senyap bermata ungu. Menerjang, menghilang, lalu menghabisi target yang lemah.',
    color: 0x2a1f3d,
    accent: 0xd946ef,
    hp: 625,
    hpGrowth: 73,
    mana: 300,
    manaGrowth: 30,
    hpRegen: 3,
    manaRegen: 3,
    damage: 60,
    damageGrowth: 5.5,
    attackRange: 2.4,
    attackInterval: 0.75,
    moveSpeed: 7.6,
    ranged: false,
    radius: 0.7,
    skills: [
      {
        id: 'sf_dash',
        name: 'Shadow Dash',
        desc: 'DASH cepat ke arah target, melukai semua musuh yang dilewati.',
        cooldown: 7,
        mana: 45,
        range: 8.5,
        target: 'point',
        width: 1.6,
        ai: 'gap',
      },
      {
        id: 'sf_vanish',
        name: 'Vanish',
        desc: 'Menjadi TAK TERLIHAT 3,5 detik dan bergerak lebih cepat. Serangan berikutnya dari bayangan memberi damage bonus.',
        cooldown: 14,
        mana: 60,
        range: 0,
        target: 'self',
        ai: 'escape',
        keepsStealth: true,
      },
      {
        id: 'sf_fan',
        name: 'Fan of Blades',
        desc: 'Melempar bilah ke segala arah: damage dan slow pada musuh di sekitar.',
        cooldown: 8,
        mana: 50,
        range: 0,
        target: 'self',
        radius: 4,
        ai: 'damage',
      },
      {
        id: 'sf_execute',
        name: 'Night Execution',
        desc: 'ULTIMATE. Muncul di belakang musuh dekat kursor dan menebas: makin sekarat target, makin besar damage.',
        cooldown: 50,
        mana: 110,
        range: 10,
        target: 'point',
        radius: 4,
        ai: 'damage',
      },
    ],
  },
};

HEROES.lumen_sage = {
  id: 'lumen_sage',
  name: 'Lumen Sage',
  title: 'Penjaga Cahaya',
  role: 'Support',
  desc: 'Penyihir cahaya yang menyembuhkan kawan, mengikat musuh, dan membalik keadaan dengan suaka cahayanya.',
  color: 0xf4f1e6,
  accent: 0x7dffb0,
  hp: 575,
  hpGrowth: 68,
  mana: 420,
  manaGrowth: 45,
  hpRegen: 2.5,
  manaRegen: 4,
  damage: 47,
  damageGrowth: 3.8,
  attackRange: 9,
  attackInterval: 1,
  moveSpeed: 7,
  ranged: true,
  radius: 0.7,
  skills: [
    {
      id: 'ls_orb',
      name: 'Radiant Orb',
      desc: 'Melempar bola cahaya yang meledak: damage area dan memperlambat musuh 1,5 detik.',
      cooldown: 6,
      mana: 50,
      range: 11,
      target: 'point',
      radius: 3,
      ai: 'damage',
    },
    {
      id: 'ls_heal',
      name: 'Healing Light',
      desc: 'MENYEMBUHKAN diri sendiri dan semua hero kawan di sekitar.',
      cooldown: 11,
      mana: 70,
      range: 0,
      target: 'self',
      radius: 6,
      ai: 'buff',
    },
    {
      id: 'ls_bind',
      name: 'Binding Rays',
      desc: 'Sinar pengikat lurus: damage dan STUN 1 detik pada semua musuh di jalurnya.',
      cooldown: 12,
      mana: 60,
      range: 12,
      target: 'dir',
      width: 1.4,
      ai: 'damage',
    },
    {
      id: 'ls_sanctuary',
      name: 'Sanctuary',
      desc: 'ULTIMATE. Suaka cahaya di sekeliling: kawan disembuhkan besar, musuh terkena damage dan melambat.',
      cooldown: 60,
      mana: 130,
      range: 0,
      target: 'self',
      radius: 8,
      ai: 'damage',
    },
  ],
};

HEROES.ember_lancer = {
  id: 'ember_lancer',
  name: 'Ember Lancer',
  title: 'Tombak Bara',
  role: 'Fighter',
  desc: 'Petarung bertombak bara. Melompat masuk, menahan gempuran, lalu membakar sekelilingnya.',
  color: 0x8a2a1e,
  accent: 0xff7a3c,
  hp: 715,
  hpGrowth: 80,
  mana: 300,
  manaGrowth: 32,
  hpRegen: 3.5,
  manaRegen: 2.8,
  damage: 58,
  damageGrowth: 4.8,
  attackRange: 2.8,
  attackInterval: 0.95,
  moveSpeed: 7.2,
  ranged: false,
  radius: 0.8,
  skills: [
    {
      id: 'el_thrust',
      name: 'Flame Thrust',
      desc: 'Tusukan tombak berapi lurus ke depan: damage dan memperlambat semua musuh di jalurnya 1,5 detik.',
      cooldown: 6,
      mana: 45,
      range: 7,
      target: 'dir',
      width: 1.8,
      ai: 'damage',
    },
    {
      id: 'el_guard',
      name: 'Ember Guard',
      desc: 'Perisai bara menyerap damage selama 3,5 detik, dan semburan apinya melukai musuh yang menempel.',
      cooldown: 12,
      mana: 55,
      range: 0,
      target: 'self',
      // radius semburan; bot baru memakainya saat musuh sudah sedekat ini
      radius: 3,
      ai: 'buff',
    },
    {
      id: 'el_leap',
      name: 'Blazing Leap',
      desc: 'MELOMPAT ke titik target: damage area dan memperlambat musuh di titik mendarat 1,5 detik.',
      cooldown: 11,
      mana: 55,
      range: 8,
      target: 'point',
      radius: 3,
      ai: 'gap',
    },
    {
      id: 'el_cyclone',
      name: 'Inferno Cyclone',
      desc: 'ULTIMATE. Pusaran api mengikuti hero selama 3 detik dan membakar musuh di sekeliling tiap 0,5 detik. Tetap bisa bergerak dan menyerang.',
      cooldown: 55,
      mana: 120,
      range: 0,
      target: 'self',
      radius: 5,
      ai: 'damage',
    },
  ],
};

export const HERO_LIST: HeroDef[] = Object.values(HEROES);
