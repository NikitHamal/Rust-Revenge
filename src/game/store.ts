import { useSyncExternalStore } from 'react';
import type { BuildingType, StatId } from './config';

/** Tiny external store bridging the imperative Three.js game and the React HUD. */
export type Screen = 'menu' | 'intro' | 'playing' | 'paused' | 'gameover' | 'victory' | 'ending';
export type Panel = null | 'build' | 'ship' | 'workshop' | 'settings' | 'help';
export type Quality = 'low' | 'medium' | 'high';

export interface SlotInfo {
  type: BuildingType | null;
  level: number;
  unlocked: boolean;
}

export interface UIState {
  screen: Screen;
  panel: Panel;
  scrap: number;
  wood: number;
  hull: number;
  hullMax: number;
  hp: number;
  hpMax: number;
  phase: 'day' | 'night';
  night: number;
  timeLeft: number;
  zombies: number;
  spawnLeft: number;
  shipLevel: number;
  weapon: string;
  owned: string[];
  upg: Record<StatId, number>;
  slots: SlotInfo[];
  selectedSlot: number;
  slamCd: number;
  subtitle: { who: string; text: string } | null;
  toast: { id: number; text: string } | null;
  alert: string | null;
  kills: number;
  bestNight: number;
  quality: Quality;
  volume: number;
  muted: boolean;
  hasSave: boolean;
  touch: boolean;
  incomeScrap: number;
  incomeWood: number;
  incomeRepair: number;
  treeHp: number;
  ending: 'mercy' | 'revenge' | null;
  titleCard: boolean;
  respawn: number;
  fps: number;
  showFps: boolean;
  respect: number;
}

const initial: UIState = {
  screen: 'menu',
  panel: null,
  scrap: 0,
  wood: 0,
  hull: 1,
  hullMax: 1,
  hp: 1,
  hpMax: 1,
  phase: 'day',
  night: 1,
  timeLeft: 0,
  zombies: 0,
  spawnLeft: 0,
  shipLevel: 1,
  weapon: 'bat',
  owned: ['bat'],
  upg: { hp: 0, speed: 0, damage: 0, slam: 0 },
  slots: [],
  selectedSlot: -1,
  slamCd: 0,
  subtitle: null,
  toast: null,
  alert: null,
  kills: 0,
  bestNight: 0,
  quality: 'medium',
  volume: 0.7,
  muted: false,
  hasSave: false,
  touch: typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0),
  incomeScrap: 0,
  incomeWood: 0,
  incomeRepair: 0,
  treeHp: -1,
  ending: null,
  titleCard: false,
  respawn: 0,
  fps: 0,
  showFps: false,
  respect: 0,
};

let state: UIState = initial;
const listeners = new Set<() => void>();

export const getUI = () => state;

export function setUI(patch: Partial<UIState>) {
  let changed = false;
  for (const k in patch) {
    const key = k as keyof UIState;
    if (!Object.is(state[key], patch[key])) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function useUI<T>(selector: (s: UIState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

/* Persistent settings / meta progress ------------------------------- */
const SETTINGS_KEY = 'rustrevenge.settings.v1';
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      setUI({
        quality: s.quality ?? state.quality,
        volume: s.volume ?? state.volume,
        muted: !!s.muted,
        bestNight: s.bestNight ?? 0,
        showFps: !!s.showFps,
      });
    }
  } catch {
    /* ignore */
  }
}
export function saveSettings() {
  try {
    const { quality, volume, muted, bestNight, showFps } = state;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ quality, volume, muted, bestNight, showFps }));
  } catch {
    /* ignore */
  }
}
