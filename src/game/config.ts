/**
 * RUST & REVENGE — static game data, world maths and balance tables.
 * Everything tweakable about balance lives here (see docs/GAME_DESIGN.md).
 */

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ */
/* World geometry: a winding river running along the X axis.           */
/* The rusty ship sits in the middle of it at (0, 0).                  */
/* ------------------------------------------------------------------ */
export const WORLD = {
  minX: -80,
  maxX: 80,
  minZ: -64,
  maxZ: 64,
  playX: 70, // playable half extents
  playZ: 56,
};

export const DECK_Y = 1.0;

export const riverCenter = (x: number) => Math.sin(x * 0.05) * 8 + Math.sin(x * 0.13) * 2;
export const riverHalfWidth = (x: number) => 12 + 2 * Math.sin(x * 0.09 + 0.5);
export const riverDist = (x: number, z: number) => Math.abs(z - riverCenter(x)) - riverHalfWidth(x);

export function terrainHeight(x: number, z: number): number {
  const d = riverDist(x, z);
  const n =
    Math.sin(x * 0.21) * Math.cos(z * 0.19) * 0.25 +
    Math.sin(x * 0.07 + z * 0.09) * 0.4 +
    Math.sin(x * 0.45 + 1.3) * Math.sin(z * 0.4) * 0.08;
  const hills =
    Math.pow(Math.max(0, Math.abs(x) - 56) / 24, 1.6) * 5 + Math.pow(Math.max(0, Math.abs(z) - 46) / 18, 1.6) * 6;
  const land = 0.55 + n * 0.55 + hills + Math.max(0, d - 22) * 0.035;
  const t = smoothstep(-2.5, 4.5, d);
  return lerp(-1.5, land, t);
}

export const isWater = (x: number, z: number) => terrainHeight(x, z) < -0.06;

/* ------------------------------------------------------------------ */
/* Ship                                                                */
/* ------------------------------------------------------------------ */
export interface ShipLevelDef {
  name: string;
  tagline: string;
  L: number; // half length
  W: number; // half width
  hull: number;
  slots: number;
  scrap: number; // cost to reach NEXT level
  wood: number;
}

export const SHIP_LEVELS: ShipLevelDef[] = [
  { name: 'Rusty Wreck', tagline: 'Barely floats. Smells like regret.', L: 8, W: 3.0, hull: 320, slots: 4, scrap: 150, wood: 70 },
  { name: 'Patched Barge', tagline: 'Duct tape and determination.', L: 9, W: 3.3, hull: 650, slots: 6, scrap: 340, wood: 170 },
  { name: 'Armored Barge', tagline: 'Now we are talking.', L: 10, W: 3.6, hull: 1100, slots: 8, scrap: 700, wood: 380 },
  { name: 'Floating Fortress', tagline: 'Zombies fear the fat man.', L: 11, W: 4.0, hull: 1800, slots: 10, scrap: 1300, wood: 700 },
  { name: 'Luxury Yacht', tagline: 'Hot tub. Palm trees. Revenge.', L: 12, W: 4.4, hull: 3000, slots: 12, scrap: 0, wood: 0 },
];

/** Fixed slot layout (pair index -> x). Slot i = pair floor(i/2), side i%2. Slots never move when the ship grows. */
export const SLOT_PAIR_X = [2.0, -1.5, 5.0, -4.5, 7.5, -7.5];
export const SLOT_Z = 2.15;
export const slotLocal = (i: number) => {
  const p = Math.floor(i / 2);
  const side = i % 2 === 0 ? 1 : -1;
  return { x: SLOT_PAIR_X[p], z: side * SLOT_Z };
};

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */
export type BuildingType = 'gun' | 'flame' | 'tesla' | 'press' | 'sawmill' | 'repair';

export interface BuildingDef {
  id: BuildingType;
  name: string;
  icon: string;
  desc: string;
  scrap: number;
  wood: number;
  turret: boolean;
  color: string;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  gun: { id: 'gun', name: 'Auto Turret', icon: '🔫', desc: 'Reliable long-range gunfire.', scrap: 60, wood: 0, turret: true, color: '#9fb4c7' },
  flame: { id: 'flame', name: 'Flamethrower', icon: '🔥', desc: 'Burns everything close to the hull.', scrap: 120, wood: 30, turret: true, color: '#ff7a2f' },
  tesla: { id: 'tesla', name: 'Tesla Coil', icon: '⚡', desc: 'Chain lightning through the horde.', scrap: 210, wood: 55, turret: true, color: '#6fd6ff' },
  press: { id: 'press', name: 'Scrap Press', icon: '⚙️', desc: 'Passively crushes junk into scrap.', scrap: 100, wood: 20, turret: false, color: '#c0a060' },
  sawmill: { id: 'sawmill', name: 'Sawmill', icon: '🪵', desc: 'Passively produces wood.', scrap: 90, wood: 0, turret: false, color: '#b5793f' },
  repair: { id: 'repair', name: 'Repair Bay', icon: '🔧', desc: 'Slowly heals the hull.', scrap: 95, wood: 45, turret: false, color: '#5be38b' },
};
export const BUILDING_ORDER: BuildingType[] = ['gun', 'flame', 'tesla', 'press', 'sawmill', 'repair'];
export const MAX_BUILDING_LEVEL = 3;
const COST_MULT = [1, 2.2, 4.5];

export const buildingCost = (type: BuildingType, level: number) => {
  const d = BUILDINGS[type];
  const m = COST_MULT[level - 1] ?? 5;
  return { scrap: Math.round(d.scrap * m), wood: Math.round(d.wood * m) };
};

export const turretStats = (type: BuildingType, level: number) => {
  const l = level - 1;
  switch (type) {
    case 'gun':
      return { range: 15 + l * 1.5, dmg: 16 * [1, 1.8, 3][l], rate: 3.2 * [1, 1.15, 1.4][l], chain: 0 };
    case 'flame':
      return { range: 6.8 + l * 0.6, dmg: 46 * [1, 1.8, 3][l], rate: 20, chain: 0 };
    case 'tesla':
      return { range: 10 + l, dmg: 42 * [1, 1.7, 2.8][l], rate: 0.9 + l * 0.15, chain: 3 + level };
    default:
      return { range: 0, dmg: 0, rate: 0, chain: 0 };
  }
};

export const ecoRate = (type: BuildingType, level: number) => {
  const l = level - 1;
  if (type === 'press') return [1.2, 2.6, 4.5][l];
  if (type === 'sawmill') return [0.7, 1.5, 2.6][l];
  if (type === 'repair') return [2.5, 5, 9][l];
  return 0;
};

/* ------------------------------------------------------------------ */
/* Player weapons & upgrades                                           */
/* ------------------------------------------------------------------ */
export interface WeaponDef {
  id: string;
  name: string;
  icon: string;
  melee: boolean;
  dmg: number;
  rate: number;
  range: number;
  pellets: number;
  spread: number;
  scrap: number;
  wood: number;
  desc: string;
}
export const WEAPONS: WeaponDef[] = [
  { id: 'bat', name: 'Spiked Bat', icon: '🏏', melee: true, dmg: 30, rate: 2.2, range: 2.7, pellets: 1, spread: 0, scrap: 0, wood: 0, desc: 'Swings in a wide arc. Free.' },
  { id: 'pistol', name: 'Rusty Pistol', icon: '🔫', melee: false, dmg: 19, rate: 4, range: 13, pellets: 1, spread: 0.03, scrap: 80, wood: 0, desc: 'Cheap and cheerful.' },
  { id: 'smg', name: 'Scrap SMG', icon: '💥', melee: false, dmg: 12, rate: 11, range: 12, pellets: 1, spread: 0.11, scrap: 260, wood: 40, desc: 'Sprays lead everywhere.' },
  { id: 'shotgun', name: 'Boom Stick', icon: '🧨', melee: false, dmg: 12, rate: 1.3, range: 9.5, pellets: 7, spread: 0.36, scrap: 420, wood: 80, desc: 'Close range devastation.' },
  { id: 'minigun', name: 'Big Bertha', icon: '☄️', melee: false, dmg: 15, rate: 19, range: 14, pellets: 1, spread: 0.13, scrap: 1000, wood: 200, desc: 'For when you really mean it.' },
];

export type StatId = 'hp' | 'speed' | 'damage' | 'slam';
export const STAT_DEFS: { id: StatId; name: string; icon: string; desc: string; max: number }[] = [
  { id: 'hp', name: 'Thick Skin', icon: '❤️', desc: '+30 max health', max: 8 },
  { id: 'speed', name: 'Sprint Shoes', icon: '👟', desc: '+5% move speed', max: 6 },
  { id: 'damage', name: 'Anger Issues', icon: '😡', desc: '+12% weapon damage', max: 10 },
  { id: 'slam', name: 'Belly Flop', icon: '🍔', desc: '+ slam radius & damage', max: 6 },
];
export const statCost = (id: StatId, lvl: number) => {
  const base = { hp: 55, speed: 70, damage: 80, slam: 90 }[id];
  return { scrap: Math.round(base * Math.pow(1.55, lvl)), wood: Math.round(base * 0.3 * lvl) };
};

/* ------------------------------------------------------------------ */
/* Zombies                                                             */
/* ------------------------------------------------------------------ */
export type ZType = 'walker' | 'runner' | 'brute' | 'boss' | 'spitter' | 'bloater';
export interface ZDef {
  hp: number;
  speed: number;
  hullDmg: number;
  playerDmg: number;
  scale: number;
  scrap: number;
  wood: number;
  atkRate: number;
}
export const ZDEFS: Record<ZType, ZDef> = {
  walker: { hp: 50, speed: 1.6, hullDmg: 4, playerDmg: 9, scale: 1, scrap: 3, wood: 0, atkRate: 1.15 },
  runner: { hp: 30, speed: 3.7, hullDmg: 3, playerDmg: 7, scale: 0.9, scrap: 4, wood: 0, atkRate: 0.8 },
  brute: { hp: 270, speed: 1.15, hullDmg: 14, playerDmg: 28, scale: 1.6, scrap: 20, wood: 4, atkRate: 1.5 },
  spitter: { hp: 55, speed: 1.55, hullDmg: 7, playerDmg: 9, scale: 1.0, scrap: 9, wood: 0, atkRate: 2.5 },
  bloater: { hp: 170, speed: 1.0, hullDmg: 34, playerDmg: 30, scale: 1.2, scrap: 14, wood: 2, atkRate: 1.0 },
  boss: { hp: 2600, speed: 1.3, hullDmg: 38, playerDmg: 45, scale: 2.7, scrap: 220, wood: 70, atkRate: 1.6 },
};

export const MAX_ZOMBIES = 240;
export const DAY_LENGTH = 70;
export const FIRST_DAY_LENGTH = 100;
export const FINAL_NIGHT = 10;
export const SIEGE_NIGHTS = [4, 7, 10];
export const TREEHOUSE_HP = 520;

export const nightZombieCount = (n: number) => Math.round(10 + n * 7 + n * n * 0.6);

/* ------------------------------------------------------------------ */
/* Story dialogue                                                      */
/* ------------------------------------------------------------------ */
export const TAUNTS: Record<number, { who: 'chloe' | 'karen'; text: string }[]> = {
  1: [
    { who: 'chloe', text: 'Is that a ship or a rusty bathtub? 😂' },
    { who: 'karen', text: 'Still fat, Bruno! Hahaha!' },
    { who: 'chloe', text: 'Mom, look, he is playing house!' },
    { who: 'karen', text: 'Smells like failure from here.' },
  ],
  2: [
    { who: 'chloe', text: 'Okay... that is slightly less embarrassing.' },
    { who: 'karen', text: 'Did he just weld something? Hmm.' },
  ],
  3: [
    { who: 'chloe', text: 'Bruno?! Is that a TURRET?!' },
    { who: 'karen', text: 'Honey... maybe we were hasty.' },
  ],
  4: [
    { who: 'chloe', text: 'Mom, he built a FORTRESS.' },
    { who: 'karen', text: 'Bruno! Sweetheart! We miss you!' },
  ],
  5: [
    { who: 'chloe', text: 'Bruno baby, we were JOKING! Take us back!' },
    { who: 'karen', text: 'I always said he was a keeper!' },
  ],
};
export const NIGHT_CRIES = [
  { who: 'chloe' as const, text: 'ZOMBIES! BRUNO HELP!!' },
  { who: 'karen' as const, text: 'Do something, you useless—I mean, darling!' },
  { who: 'chloe' as const, text: 'Eeeek! They are climbing the tree!' },
];

export const WEATHER_TIPS = [
  'Stand still next to orange trees to chop wood.',
  'Glowing crates hold scrap. Run through them!',
  'Press SPACE for the Belly Flop slam.',
  'Click a glowing pad on the deck to build.',
  'Zombies wade slowly through water — use that.',
  'Q / E rotates the camera. Mouse wheel zooms.',
];
