import {
  ACESFilmicToneMapping,
  Color,
  HalfFloatType,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  BUILDINGS,
  DAY_LENGTH,
  DECK_Y,
  FINAL_NIGHT,
  FIRST_DAY_LENGTH,
  MAX_BUILDING_LEVEL,
  NIGHT_CRIES,
  SHIP_LEVELS,
  SIEGE_NIGHTS,
  STAT_DEFS,
  TAUNTS,
  TREEHOUSE_HP,
  WEAPONS,
  WORLD,
  buildingCost,
  clamp,
  statCost,
  type BuildingType,
  type StatId,
} from './config';
import { audio } from './audio';
import { Cinematic } from './cinematic';
import { animate, makeHumanoid, type Humanoid } from './characters';
import { Particles, Shockwaves, Tracers } from './effects';
import { Input } from './input';
import { Lighting } from './lighting';
import { Player } from './player';
import { Props, type Crate } from './props';
import { Ship } from './ship';
import { getUI, saveSettings, setUI, type Panel, type Quality, type SlotInfo } from './store';
import { createTerrain, drawMinimapBase } from './terrain';
import { ZombieManager, type Zombie } from './zombies';

export interface Run {
  scrap: number;
  wood: number;
  hull: number;
  hullMax: number;
  shipLevel: number;
  night: number;
  phase: 'day' | 'night';
  timer: number;
  kills: number;
  weapons: string[];
  weapon: string;
  up: Record<StatId, number>;
  buildings: ({ type: BuildingType; level: number } | null)[];
  respect: number;
  treeHp: number;
  sieging: boolean;
  won: boolean;
  nightClock: number;
}

const SAVE_KEY = 'rustrevenge.save.v1';

function newRun(): Run {
  return {
    scrap: 150,
    wood: 40,
    hull: SHIP_LEVELS[0].hull,
    hullMax: SHIP_LEVELS[0].hull,
    shipLevel: 1,
    night: 1,
    phase: 'day',
    timer: FIRST_DAY_LENGTH,
    kills: 0,
    weapons: ['bat'],
    weapon: 'bat',
    up: { hp: 0, speed: 0, damage: 0, slam: 0 },
    buildings: new Array(12).fill(null),
    respect: 0,
    treeHp: -1,
    sieging: false,
    won: false,
    nightClock: 0,
  };
}

interface FloatEl {
  el: HTMLDivElement;
  t: number;
  x: number;
  y: number;
  z: number;
  active: boolean;
}

export class Game {
  container: HTMLElement;
  renderer: WebGLRenderer;
  scene = new Scene();
  camera = new PerspectiveCamera(40, 1, 0.5, 400);
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  light: Lighting;
  props: Props;
  ship: Ship;
  zm: ZombieManager;
  player: Player;
  fx: { particles: Particles; tracers: Tracers; shock: Shockwaves };
  input: Input;
  audio = audio;
  chloe: Humanoid;
  karen: Humanoid;
  cinematic: Cinematic;
  run: Run = newRun();
  tmpV = new Vector3();
  shakeOffset = new Vector3();
  running = false;
  screen: 'menu' | 'intro' | 'playing' | 'paused' | 'ended' = 'menu';

  rig = { target: new Vector3(0, 1, 0), yaw: Math.PI / 4, yawT: Math.PI / 4, dist: 30, distT: 30, pitch: 0.95 };

  private time = 0;
  private shakeAmt = 0;
  private waterMat;
  private disposed = false;
  private quality: Quality = 'high';
  private ray = new Raycaster();
  private plane = new Plane(new Vector3(0, 1, 0), -0.3);
  private slotsInfo: SlotInfo[] = [];
  private slotsDirty = true;
  private ownedArr: string[] = ['bat'];
  private syncT = 0;
  private miniT = 0;
  private miniBase: HTMLCanvasElement;
  private mini: HTMLCanvasElement | null = null;
  private overlay: HTMLDivElement;
  private floats: FloatEl[] = [];
  private bubbles: { el: HTMLDivElement; who: 'chloe' | 'karen'; t: number }[] = [];
  private tauntT = 12;
  private pendScrap = 0;
  private pendWood = 0;
  private pendT = 0;
  private toastId = 0;
  private tips: { t: number; text: string }[] = [];
  private dayClock = 0;
  private npcHidden = false;
  private npcPhase = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private lowFpsCount = 0;
  private alertT = 0;
  private resizeObs: ResizeObserver;
  private endingMode: 'mercy' | 'revenge' | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    const ui = getUI();
    this.quality = ui.quality;
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    container.appendChild(this.renderer.domElement);

    const t = createTerrain(this.quality === 'low' ? 0.6 : 1);
    this.waterMat = t.waterMat;
    this.scene.add(t.terrain, t.water);
    this.light = new Lighting(this.scene, this.renderer, t.waterMat);
    this.props = new Props(this.scene, this.quality);
    this.ship = new Ship(this.scene);
    this.fx = { particles: new Particles(this.scene, 1000), tracers: new Tracers(this.scene, 180), shock: new Shockwaves(this.scene) };
    this.zm = new ZombieManager(this, this.scene);
    this.player = new Player(this, this.scene);
    this.chloe = makeHumanoid('chloe');
    this.karen = makeHumanoid('karen');
    [this.chloe, this.karen].forEach((h) => {
      h.root.rotation.order = 'YXZ';
      h.root.traverse((o) => (o.castShadow = true));
      this.scene.add(h.root);
    });
    this.placeNpcs();
    this.input = new Input(this, this.renderer.domElement);
    this.cinematic = new Cinematic(this);

    // overlay layer for floating text & speech bubbles
    this.overlay = document.createElement('div');
    this.overlay.className = 'fx-layer';
    container.appendChild(this.overlay);
    for (let i = 0; i < 24; i++) {
      const el = document.createElement('div');
      el.className = 'float-text';
      el.style.display = 'none';
      this.overlay.appendChild(el);
      this.floats.push({ el, t: 0, x: 0, y: 0, z: 0, active: false });
    }

    this.miniBase = document.createElement('canvas');
    this.miniBase.width = 160;
    this.miniBase.height = 128;
    drawMinimapBase(this.miniBase);

    this.applyQuality(this.quality);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();

    // menu scene
    this.resetWorld(false);
    this.light.apply(0.55, new Vector3(0, 0, 0));
    this.renderer.setAnimationLoop(() => this.frame());
    setUI({ hasSave: !!localStorage.getItem(SAVE_KEY), screen: 'menu' });
  }

  /* ================================================================ */
  /* setup helpers                                                    */
  /* ================================================================ */
  private placeNpcs() {
    const th = this.props.treehouse;
    this.chloe.root.position.copy(th.girl);
    this.karen.root.position.copy(th.mom);
    const yaw = Math.atan2(-th.x, -th.z);
    this.chloe.root.rotation.set(0, yaw, 0);
    this.karen.root.rotation.set(0, yaw, 0);
    this.chloe.root.visible = !this.npcHidden;
    this.karen.root.visible = !this.npcHidden;
  }

  applyQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const pr = q === 'low' ? 1 : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    this.renderer.setPixelRatio(pr);
    this.light.setShadows(q !== 'low', q === 'high' ? 2048 : 1024);
    this.zm.swarm.setShadows(q !== 'low');
    this.renderer.shadowMap.enabled = q !== 'low';
    if (q === 'high') {
      if (!this.composer) {
        const rt = new WebGLRenderTarget(4, 4, { type: HalfFloatType, samples: 4 });
        this.composer = new EffectComposer(this.renderer, rt);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.55, 0.6, 0.9);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());
      }
    } else if (this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.bloom = null;
    }
    this.resize();
    setUI({ quality: q });
    saveSettings();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  setMinimap(c: HTMLCanvasElement | null) {
    this.mini = c;
  }

  unlockAudio() {
    audio.init();
    audio.setVolume(getUI().volume, getUI().muted);
  }

  /* ================================================================ */
  /* flow                                                             */
  /* ================================================================ */
  private resetWorld(full: boolean) {
    this.run = newRun();
    this.zm.clear();
    this.zm.hpMul = 1;
    this.ship.setLevel(1);
    for (let i = 0; i < 12; i++) this.ship.remove(i);
    this.ship.build(0, 'gun', 1);
    this.run.buildings[0] = { type: 'gun', level: 1 };
    this.player.reset();
    this.player.x = -2;
    this.player.z = 0;
    this.ownedArr = ['bat'];
    this.slotsDirty = true;
    this.npcHidden = false;
    this.placeNpcs();
    this.props.regrowTrees();
    this.endingMode = null;
    if (full) this.props.crates.forEach((c) => (c.active = false));
    this.syncUI(true);
  }

  newGame(withIntro: boolean) {
    this.unlockAudio();
    this.resetWorld(true);
    setUI({ panel: null, selectedSlot: -1, ending: null, alert: null, kills: 0 });
    if (withIntro) {
      this.screen = 'intro';
      this.running = false;
      this.ship.showPads(false);
      this.ship.remove(0);
      this.placeNpcs();
      setUI({ screen: 'intro' });
      this.light.apply(1, new Vector3(-20, 0, 5));
      this.light.L = 1;
      this.cinematic.start();
    } else {
      this.beginPlaying(true, true);
    }
  }

  continueGame() {
    this.unlockAudio();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return this.newGame(true);
      const s = JSON.parse(raw);
      this.resetWorld(true);
      const r = this.run;
      r.scrap = s.scrap;
      r.wood = s.wood;
      r.night = s.night;
      r.shipLevel = s.shipLevel;
      r.weapons = s.weapons;
      r.weapon = s.weapon;
      r.up = s.up;
      r.respect = s.respect ?? 0;
      r.kills = s.kills ?? 0;
      r.won = !!s.won;
      this.ship.setLevel(r.shipLevel);
      r.hullMax = SHIP_LEVELS[r.shipLevel - 1].hull;
      r.hull = r.hullMax;
      for (let i = 0; i < 12; i++) this.ship.remove(i);
      r.buildings = s.buildings;
      s.buildings.forEach((b: { type: BuildingType; level: number } | null, i: number) => {
        if (b) this.ship.build(i, b.type, b.level);
      });
      this.ownedArr = [...r.weapons];
      this.slotsDirty = true;
      setUI({ panel: null, selectedSlot: -1, ending: null, kills: r.kills });
      this.beginPlaying(true, false);
    } catch {
      this.newGame(true);
    }
  }

  onIntroDone(skipped: boolean) {
    const h = this.player.h.root.position;
    this.ship.remove(0);
    this.ship.build(0, 'gun', 1);
    this.run.buildings[0] = { type: 'gun', level: 1 };
    this.player.reset();
    if (!skipped) {
      this.player.x = h.x;
      this.player.z = h.z;
      this.player.y = h.y;
    }
    this.ship.showPads(true);
    this.rig.target.set(this.player.x, 0.8, this.player.z);
    this.beginPlaying(false, true);
  }

  private beginPlaying(fresh: boolean, first: boolean) {
    this.screen = 'playing';
    this.running = true;
    this.ship.showPads(true);
    this.player.h.root.visible = true;
    if (fresh) {
      this.player.reset();
      this.rig.target.set(this.player.x, 0.8, this.player.z);
    }
    this.run.hull = Math.max(this.run.hull, 1);
    setUI({ screen: 'playing' });
    this.syncUI(true);
    this.startDay(first);
    audio.init();
  }

  private startDay(first: boolean) {
    const r = this.run;
    r.phase = 'day';
    r.timer = first ? FIRST_DAY_LENGTH : DAY_LENGTH;
    r.nightClock = 0;
    r.sieging = false;
    r.treeHp = -1;
    this.npcHidden = false;
    this.placeNpcs();
    this.props.respawnCrates();
    this.props.regrowTrees();
    this.zm.spawnRoamers(3 + Math.min(8, r.night), r.night);
    audio.setNight(false);
    this.tauntT = 6 + Math.random() * 6;
    if (!first) {
      this.player.heal(this.player.hpMax);
      this.healHull(r.hullMax * 0.2);
      this.save();
      audio.play('dawn', 0.8);
      this.toast(`☀️ Day ${r.night} — scavenge, build, upgrade!`);
    } else {
      this.tips = [
        { t: 1.5, text: '🏴‍☠️ Welcome aboard, Bruno. Click the glowing pads to build turrets.' },
        { t: 9, text: '🪓 Stand next to orange trees to chop wood. Run over glowing crates for loot.' },
        { t: 18, text: '💥 Press SPACE for the Belly Flop slam. Q / E rotates the camera.' },
        { t: 30, text: '🌙 Night brings the horde. Upgrade your ship before dark!' },
      ];
      this.dayClock = 0;
    }
    this.syncUI(true);
  }

  startNight() {
    const r = this.run;
    r.phase = 'night';
    r.nightClock = 0;
    this.zm.beginNight(r.night);
    audio.play('alarm', 0.8);
    audio.setNight(true);
    this.toast(`🌙 Night ${r.night} — hold the line!`);
    this.props.crates.forEach((c) => (c.active = c.active && Math.hypot(c.x, c.z) < 40));
    if (SIEGE_NIGHTS.includes(r.night) && !this.npcHidden) {
      r.sieging = true;
      r.treeHp = TREEHOUSE_HP;
      const th = this.props.treehouse;
      this.zm.spawnSiege(r.night, th.x);
      this.setAlert('🏚️ The treehouse is under attack! Karen & Chloe are screaming for help…', 7);
      this.speak('chloe', 'BRUNOOOO!!! HELP US!!!');
    }
    this.syncUI(true);
  }

  private endNight() {
    const r = this.run;
    const bonusS = 40 + r.night * 25;
    const bonusW = 15 + r.night * 8;
    this.addResource('scrap', bonusS);
    this.addResource('wood', bonusW);
    this.popText(`Night ${r.night} survived! +${bonusS}⚙️ +${bonusW}🪵`, this.player.x, 3, this.player.z, '#9ef0a0');
    if (r.sieging) {
      if (r.treeHp > 0) {
        r.respect++;
        this.addResource('scrap', 120 + r.night * 20);
        this.toast('💖 You saved the treehouse! Chloe & Karen respect you a little more…');
        this.speak('chloe', 'Wow... thank you, Bruno. 🥺');
        this.speak('karen', 'You were always my favorite!');
      }
      r.sieging = false;
      r.treeHp = -1;
    }
    if (r.night > getUI().bestNight) {
      setUI({ bestNight: r.night });
      saveSettings();
    }
    if (r.night >= FINAL_NIGHT && !r.won) {
      r.won = true;
      this.victory();
      return;
    }
    r.night++;
    this.startDay(false);
  }

  skipDay() {
    if (this.run.phase === 'day' && this.running) {
      this.run.timer = 0;
    }
  }

  private victory() {
    this.running = false;
    this.screen = 'ended';
    audio.play('win', 1);
    audio.setNight(false);
    setUI({ screen: 'victory', panel: null });
    this.light.L = 1;
    this.save();
  }

  chooseEnding(kind: 'mercy' | 'revenge') {
    this.endingMode = kind;
    audio.play(kind === 'mercy' ? 'dawn' : 'kick', 1);
    setUI({ ending: kind, screen: 'ending' });
    const sp = this.ship.rect;
    if (kind === 'revenge') this.speak('chloe', 'BRUNO NOOO! I was JOKING!!');
    if (kind === 'mercy') {
      // they swim up and climb aboard
      this.chloe.root.position.set(sp.minX + 4.2, DECK_Y, 1.2);
      this.karen.root.position.set(sp.minX + 4.2, DECK_Y, -1.2);
      this.chloe.root.rotation.y = 0;
      this.karen.root.rotation.y = Math.PI;
    }
  }

  continueEndless() {
    this.endingMode = null;
    this.run.won = true;
    this.run.night++;
    this.screen = 'playing';
    this.running = true;
    setUI({ screen: 'playing', ending: null });
    this.placeNpcs();
    this.startDay(false);
  }

  private gameOver() {
    if (!this.running) return;
    this.running = false;
    this.screen = 'ended';
    audio.play('lose', 1);
    audio.setNight(false);
    if (this.run.night > getUI().bestNight) setUI({ bestNight: this.run.night });
    saveSettings();
    setUI({ screen: 'gameover', panel: null, hasSave: !!localStorage.getItem(SAVE_KEY) });
  }

  toMenu() {
    this.screen = 'menu';
    this.running = false;
    this.resetWorld(false);
    this.screen = 'menu';
    audio.setNight(false);
    setUI({ screen: 'menu', panel: null, hasSave: !!localStorage.getItem(SAVE_KEY), ending: null });
  }

  togglePause() {
    if (this.screen === 'playing') {
      this.screen = 'paused';
      this.running = false;
      setUI({ screen: 'paused' });
    } else if (this.screen === 'paused') {
      this.screen = 'playing';
      this.running = true;
      setUI({ screen: 'playing' });
    }
  }

  skipIntro() {
    if (this.screen === 'intro') this.cinematic.skip();
  }

  private save() {
    const r = this.run;
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          v: 1,
          night: r.night,
          scrap: Math.floor(r.scrap),
          wood: Math.floor(r.wood),
          shipLevel: r.shipLevel,
          weapons: r.weapons,
          weapon: r.weapon,
          up: r.up,
          buildings: r.buildings,
          respect: r.respect,
          kills: r.kills,
          won: r.won,
        }),
      );
      setUI({ hasSave: true });
    } catch {
      /* storage unavailable */
    }
  }

  /* ================================================================ */
  /* input callbacks                                                  */
  /* ================================================================ */
  onKey(k: string) {
    if (this.screen === 'intro') {
      if (k === 'escape' || k === ' ' || k === 'enter') this.skipIntro();
      return;
    }
    if (k === 'm') this.setVolume(getUI().volume, !getUI().muted);
    if (k === 'f') {
      setUI({ showFps: !getUI().showFps });
      saveSettings();
    }
    if (this.screen === 'paused') {
      if (k === 'escape' || k === 'p') this.togglePause();
      return;
    }
    if (this.screen !== 'playing') return;
    if (k === 'escape') {
      if (getUI().panel) this.closePanel();
      else this.togglePause();
    } else if (k === 'p') this.togglePause();
    else if (k === ' ') this.player.trySlam();
    else if (k === 'b') this.openPanel(getUI().panel === 'ship' ? null : 'ship');
    else if (k === 'v') this.openPanel(getUI().panel === 'workshop' ? null : 'workshop');
    else if (k === 'n') this.skipDay();
    else if (k >= '1' && k <= '5') {
      const w = WEAPONS[Number(k) - 1];
      if (w && this.run.weapons.includes(w.id)) this.equipWeapon(w.id);
    }
  }

  zoom(d: number) {
    this.rig.distT = clamp(this.rig.distT + d, 16, 52);
  }
  rotate(a: number) {
    this.rig.yawT += a;
  }

  openPanel(p: Panel) {
    audio.play('click', 0.6);
    if (p !== 'build') {
      this.ship.setSelected(-1);
      setUI({ panel: p, selectedSlot: -1 });
    } else setUI({ panel: p });
  }
  closePanel() {
    this.ship.setSelected(-1);
    setUI({ panel: null, selectedSlot: -1 });
  }

  handleTap(cx: number, cy: number) {
    if (this.screen !== 'playing') return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((cx - rect.left) / rect.width) * 2 - 1;
    const ny = -((cy - rect.top) / rect.height) * 2 + 1;
    this.ray.setFromCamera(new Vector2(nx, ny), this.camera);
    const hits = this.ray.intersectObjects(this.ship.hitboxes, false);
    if (hits.length) {
      const slot = hits[0].object.userData.slot as number;
      if (slot < SHIP_LEVELS[this.run.shipLevel - 1].slots) {
        audio.play('click', 0.7);
        this.ship.setSelected(slot);
        setUI({ panel: 'build', selectedSlot: slot });
        return;
      }
    }
    if (getUI().panel) this.closePanel();
    const p = new Vector3();
    if (this.ray.ray.intersectPlane(this.plane, p)) {
      p.x = clamp(p.x, -WORLD.playX, WORLD.playX);
      p.z = clamp(p.z, -WORLD.playZ, WORLD.playZ);
      this.input.target = { x: p.x, z: p.z };
      this.fx.shock.spawn(p.x, 0.2, p.z, 0.9, new Color(1.2, 1.8, 2.2), 0.4);
    }
  }

  /* ================================================================ */
  /* gameplay API (used by UI + other systems)                        */
  /* ================================================================ */
  difficultySpeed() {
    return 1 + Math.min(0.25, 0.02 * (this.run.night - 1));
  }
  difficultyDamage() {
    return 1 + Math.min(0.6, 0.05 * (this.run.night - 1));
  }

  shake(a: number) {
    this.shakeAmt = Math.min(1.2, Math.max(this.shakeAmt, a));
  }

  addResource(kind: 'scrap' | 'wood', n: number) {
    if (kind === 'scrap') {
      this.run.scrap += n;
      this.pendScrap += n;
    } else {
      this.run.wood += n;
      this.pendWood += n;
    }
  }

  private afford(s: number, w: number) {
    return this.run.scrap >= s && this.run.wood >= w;
  }
  private pay(s: number, w: number) {
    this.run.scrap -= s;
    this.run.wood -= w;
  }
  private fail(msg: string) {
    audio.play('error', 1);
    this.toast(msg);
    return false;
  }

  toast(text: string) {
    setUI({ toast: { id: ++this.toastId, text } });
  }
  setAlert(text: string | null, secs = 5) {
    setUI({ alert: text });
    this.alertT = text ? secs : 0;
  }

  popText(text: string, x: number, y: number, z: number, color = '#fff') {
    const f = this.floats.find((q) => !q.active) ?? this.floats[0];
    f.active = true;
    f.t = 0;
    f.x = x;
    f.y = y;
    f.z = z;
    f.el.textContent = text;
    f.el.style.color = color;
    f.el.style.display = 'block';
  }

  damageHull(n: number) {
    if (!this.running) return;
    this.run.hull -= n;
    this.shake(0.04);
    if (Math.random() < 0.15) audio.play('hit', 0.5);
    if (this.run.hull <= 0) {
      this.run.hull = 0;
      this.gameOver();
    }
  }
  healHull(n: number) {
    this.run.hull = Math.min(this.run.hullMax, this.run.hull + n);
  }

  damageTreehouse(n: number) {
    const r = this.run;
    if (!r.sieging || r.treeHp <= 0) return;
    r.treeHp -= n;
    this.props.shakeTreehouse(0.6);
    if (r.treeHp <= 0) {
      r.treeHp = 0;
      r.sieging = false;
      this.zm.each((z) => {
        if (z.tgt === 1) z.tgt = 0; // siege zombies turn on the ship
      });
      this.npcHidden = true;
      this.placeNpcs();
      audio.play('scream', 1);
      this.setAlert('💀 The treehouse fell. Karen & Chloe fled into the woods…', 6);
      this.fx.particles.burst(this.props.treehouse.x, 5, this.props.treehouse.z, 40, 6, 0x8a5a30, 0.25, 1, 4);
    }
  }

  onZombieKilled(z: Zombie) {
    const r = this.run;
    r.kills++;
    const s = Math.round(z.def.scrap * (1 + r.night * 0.06));
    this.addResource('scrap', s);
    if (z.def.wood) this.addResource('wood', z.def.wood);
    if (z.type === 'boss') {
      this.popText(`BOSS DOWN! +${s}⚙️`, z.x, 4, z.z, '#ffd45a');
      this.shake(0.8);
      this.fx.shock.spawn(z.x, z.y, z.z, 7, new Color(2, 1.2, 0.4), 0.7);
      audio.play('boom', 1);
    }
  }

  onPlayerDown() {
    const lost = Math.floor(this.run.scrap * 0.2);
    this.run.scrap -= lost;
    this.toast(`💀 Bruno is down! Lost ${lost} scrap. Respawning…`);
    this.player.h.root.rotation.x = 0;
  }
  onPlayerRespawn() {
    this.toast('🔄 Bruno is back on deck!');
  }

  collectCrate(c: Crate) {
    c.active = false;
    audio.play('pickup', 1);
    const r = this.run;
    if (c.kind === 'scrap') {
      const n = Math.round(22 + Math.random() * 26 + r.night * 5);
      this.addResource('scrap', n);
    } else if (c.kind === 'wood') {
      const n = Math.round(12 + Math.random() * 12 + r.night * 2);
      this.addResource('wood', n);
    } else {
      this.player.heal(this.player.hpMax * 0.5);
      this.popText('+HP ❤️', this.player.x, 3, this.player.z, '#ff8a8a');
    }
    this.fx.particles.burst(c.x, 0.8, c.z, 14, 3, 0xffe27a, 0.12, 0.6, 3);
  }

  setHeroWeaponVisible(v: boolean) {
    this.player.h.weapon.visible = v;
  }

  setVolume(v: number, muted: boolean) {
    setUI({ volume: v, muted });
    audio.setVolume(v, muted);
    saveSettings();
  }

  /* ---- ship / building actions ---- */
  buildAt(slot: number, type: BuildingType) {
    const r = this.run;
    if (slot < 0 || slot >= SHIP_LEVELS[r.shipLevel - 1].slots || r.buildings[slot]) return false;
    const c = buildingCost(type, 1);
    if (!this.afford(c.scrap, c.wood)) return this.fail('Not enough resources!');
    this.pay(c.scrap, c.wood);
    this.ship.build(slot, type, 1);
    r.buildings[slot] = { type, level: 1 };
    this.slotsDirty = true;
    audio.play('build', 1);
    this.fx.particles.burst(this.ship.buildings[slot]!.group.position.x, DECK_Y + 0.5, this.ship.buildings[slot]!.group.position.z, 14, 3, 0xcfc3a0, 0.12, 0.6, 3);
    this.toast(`${BUILDINGS[type].icon} ${BUILDINGS[type].name} built`);
    return true;
  }
  upgradeBuilding(slot: number) {
    const r = this.run;
    const b = r.buildings[slot];
    if (!b) return false;
    if (b.level >= MAX_BUILDING_LEVEL) return this.fail('Already max level');
    const c = buildingCost(b.type, b.level + 1);
    if (!this.afford(c.scrap, c.wood)) return this.fail('Not enough resources!');
    this.pay(c.scrap, c.wood);
    b.level++;
    this.ship.upgrade(slot);
    this.slotsDirty = true;
    audio.play('upgrade', 0.8);
    this.toast(`⬆️ ${BUILDINGS[b.type].name} → level ${b.level}`);
    return true;
  }
  sellBuilding(slot: number) {
    const b = this.ship.buildings[slot];
    if (!b) return false;
    const v = this.ship.sellValue(b);
    this.addResource('scrap', v.scrap);
    this.addResource('wood', v.wood);
    this.ship.remove(slot);
    this.run.buildings[slot] = null;
    this.slotsDirty = true;
    audio.play('click', 1);
    this.toast(`Sold for ${v.scrap}⚙️ ${v.wood}🪵`);
    return true;
  }
  upgradeShip() {
    const r = this.run;
    if (r.shipLevel >= 5) return false;
    const d = SHIP_LEVELS[r.shipLevel - 1];
    if (!this.afford(d.scrap, d.wood)) return this.fail('Not enough resources for the refit!');
    this.pay(d.scrap, d.wood);
    r.shipLevel++;
    const nd = SHIP_LEVELS[r.shipLevel - 1];
    const gain = nd.hull - r.hullMax;
    r.hullMax = nd.hull;
    r.hull = Math.min(r.hullMax, r.hull + gain + r.hullMax * 0.1);
    this.ship.setLevel(r.shipLevel);
    this.slotsDirty = true;
    audio.play('upgrade', 1);
    audio.play('build', 1);
    this.shake(0.5);
    this.fx.shock.spawn(0, DECK_Y, 0, 14, new Color(1.5, 2, 2.5), 0.9);
    this.fx.particles.burst(0, DECK_Y + 1, 0, 60, 8, 0xffe27a, 0.2, 1.1, 5);
    this.toast(`🚢 Ship upgraded: ${nd.name}!`);
    this.speakForLevel();
    return true;
  }
  repairHull() {
    const r = this.run;
    const missing = r.hullMax - r.hull;
    if (missing < 1) return this.fail('Hull is already intact');
    let amt = Math.min(missing, r.hullMax * 0.25);
    const wood = Math.ceil(amt / 4);
    if (r.wood < wood) {
      amt = r.wood * 4;
      if (amt < 4) return this.fail('Need wood to repair!');
    }
    const cost = Math.ceil(amt / 4);
    r.wood -= cost;
    this.healHull(amt);
    audio.play('build', 0.8);
    this.toast(`🔧 Hull repaired +${Math.round(amt)}`);
    return true;
  }
  buyWeapon(id: string) {
    const w = WEAPONS.find((q) => q.id === id);
    const r = this.run;
    if (!w || r.weapons.includes(id)) return false;
    if (!this.afford(w.scrap, w.wood)) return this.fail('Not enough resources!');
    this.pay(w.scrap, w.wood);
    r.weapons = [...r.weapons, id];
    this.ownedArr = r.weapons;
    this.equipWeapon(id);
    audio.play('upgrade', 1);
    this.toast(`${w.icon} ${w.name} acquired!`);
    return true;
  }
  equipWeapon(id: string) {
    if (!this.run.weapons.includes(id)) return;
    this.run.weapon = id;
    audio.play('click', 0.8);
  }
  upgradeStat(id: StatId) {
    const r = this.run;
    const def = STAT_DEFS.find((s) => s.id === id)!;
    if (r.up[id] >= def.max) return this.fail('Maxed out');
    const c = statCost(id, r.up[id]);
    if (!this.afford(c.scrap, c.wood)) return this.fail('Not enough resources!');
    this.pay(c.scrap, c.wood);
    r.up = { ...r.up, [id]: r.up[id] + 1 };
    this.player.refreshStats();
    audio.play('upgrade', 0.8);
    this.toast(`${def.icon} ${def.name} level ${r.up[id]}`);
    return true;
  }

  /* ---- NPC chatter ---- */
  private speak(who: 'chloe' | 'karen', text: string) {
    if (this.npcHidden && who) return;
    const el = document.createElement('div');
    el.className = 'bubble ' + who;
    el.textContent = (who === 'chloe' ? '💅 Chloe: ' : '👩 Karen: ') + text;
    this.overlay.appendChild(el);
    this.bubbles.push({ el, who, t: 0 });
    if (this.bubbles.length > 3) {
      const old = this.bubbles.shift()!;
      old.el.remove();
    }
  }
  private speakForLevel() {
    const lines = TAUNTS[Math.min(5, this.run.shipLevel)];
    if (!lines) return;
    const l = lines[Math.floor(Math.random() * lines.length)];
    this.speak(l.who, l.text);
  }

  /* ================================================================ */
  /* camera                                                           */
  /* ================================================================ */
  rigPose(target: Vector3) {
    const r = this.rig;
    const cp = Math.cos(r.pitch);
    const pos = new Vector3(Math.sin(r.yaw) * cp, Math.sin(r.pitch), Math.cos(r.yaw) * cp).multiplyScalar(r.dist).add(target);
    return { pos, look: target.clone() };
  }

  private updateCamera(dt: number) {
    const r = this.rig;
    const keys = this.input.keys;
    if (this.screen === 'playing') {
      if (keys.has('q')) r.yawT += dt * 1.8;
      if (keys.has('e')) r.yawT -= dt * 1.8;
      if (keys.has('=') || keys.has('+')) r.distT = clamp(r.distT - dt * 14, 16, 52);
      if (keys.has('-')) r.distT = clamp(r.distT + dt * 14, 16, 52);
    }
    r.yaw += (r.yawT - r.yaw) * Math.min(1, dt * 8);
    r.dist += (r.distT - r.dist) * Math.min(1, dt * 6);
    let tx = 0;
    let ty = 0.8;
    let tz = 0;
    if (this.screen === 'menu') {
      r.yawT += dt * 0.07;
      r.distT = 36;
      tx = 0;
      ty = 1;
      tz = 0;
    } else {
      tx = this.player.x;
      tz = this.player.z;
      ty = this.player.y * 0.6;
      if (this.screen === 'ended' || getUI().screen === 'ending') {
        tx = 0;
        tz = 0;
        r.yawT += dt * 0.1;
      }
    }
    const k = 1 - Math.exp(-6 * dt);
    r.target.x += (tx - r.target.x) * k;
    r.target.y += (ty - r.target.y) * k;
    r.target.z += (tz - r.target.z) * k;
    this.shakeAmt *= Math.exp(-7 * dt);
    if (this.shakeAmt < 0.003) this.shakeAmt = 0;
    this.shakeOffset.set((Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt);
    const p = this.rigPose(r.target);
    this.camera.position.copy(p.pos).add(this.shakeOffset);
    this.camera.lookAt(p.look);
  }

  /* ================================================================ */
  /* main loop                                                        */
  /* ================================================================ */
  private frame() {
    if (this.disposed) return;
    const dt = Math.min(0.05, this.clockDt());
    this.time += dt;
    this.update(dt);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);

    // fps + adaptive quality
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 1) {
      const fps = Math.round(this.fpsFrames / this.fpsAcc);
      if (getUI().showFps) setUI({ fps });
      if (this.screen === 'playing' || this.screen === 'menu') {
        if (fps < 36) this.lowFpsCount++;
        else this.lowFpsCount = 0;
        if (this.lowFpsCount >= 4 && this.quality !== 'low') {
          const nq: Quality = this.quality === 'high' ? 'medium' : 'low';
          this.lowFpsCount = 0;
          this.applyQuality(nq);
          this.toast(`⚙️ Performance mode: switched graphics to ${nq.toUpperCase()}`);
        }
      }
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
  }

  private lastT = performance.now();
  private clockDt() {
    const n = performance.now();
    const d = (n - this.lastT) / 1000;
    this.lastT = n;
    return d;
  }

  private update(dt: number) {
    const t = this.time;
    this.waterMat.uniforms.uTime.value = t;
    // light target
    let target = 1;
    const r = this.run;
    if (this.screen === 'menu') target = 0.55;
    else if (this.screen === 'intro') target = 1;
    else if (r.phase === 'night') target = 0;
    else if (r.timer <= 12) target = 0.5;
    this.light.update(dt, target, this.rig.target);
    this.props.update(dt, t, this.light.lamp);
    this.ship.update(dt, t, this);
    this.fx.particles.update(dt);
    this.fx.tracers.update(dt);
    this.fx.shock.update(dt);

    if (this.screen === 'intro') {
      this.cinematic.update(dt);
      this.tickOverlay(dt);
      return;
    }

    if (this.running) {
      this.simulate(dt);
    } else if (this.screen === 'menu' || this.screen === 'ended') {
      // idle hero & ambient zombies keep animating
      this.idleHero(dt);
    }
    this.updateNpcs(dt);
    this.updateCamera(dt);
    this.tickOverlay(dt);
    this.updateMinimap(dt);
    this.syncT -= dt;
    if (this.syncT <= 0) {
      this.syncT = 0.1;
      this.syncUI(false);
    }
  }

  private idleHero(dt: number) {
    this.npcPhase += dt;
    const h = this.player.h;
    h.root.position.set(this.player.x, DECK_Y + this.ship.bobY, this.player.z);
    h.root.rotation.set(0, this.screen === 'menu' ? 0.9 : this.player.yaw, 0);
    animate(h, this.screen === 'ended' && getUI().screen === 'victory' ? 'cheer' : 'idle', this.npcPhase * 5, 0.2);
  }

  private simulate(dt: number) {
    const r = this.run;
    // tips
    if (this.tips.length) {
      this.dayClock += dt;
      if (this.dayClock >= this.tips[0].t) this.toast(this.tips.shift()!.text);
    }
    // phase clock
    if (r.phase === 'day') {
      r.timer -= dt;
      if (r.timer <= 0) this.startNight();
    } else {
      r.nightClock += dt;
      const cleared = this.zm.queue.length === 0 && (this.zm.alive === 0 || (this.zm.alive <= 2 && r.nightClock > 150));
      if (cleared && r.nightClock > 6) {
        this.zm.each((z) => this.zm.damage(z, 1e9, 0, 0, 0, true)); // stragglers collapse at dawn
        this.endNight();
      }
    }
    if (!this.running) return;
    this.player.update(dt);
    this.zm.update(dt);
    if (this.alertT > 0) {
      this.alertT -= dt;
      if (this.alertT <= 0) setUI({ alert: null });
    }
    // flush pickup popups
    this.pendT -= dt;
    if (this.pendT <= 0) {
      this.pendT = 0.7;
      const parts: string[] = [];
      if (this.pendScrap >= 1) parts.push(`+${Math.floor(this.pendScrap)}⚙️`);
      if (this.pendWood >= 1 && !parts.length) parts.push(`+${Math.floor(this.pendWood)}🪵`);
      if (parts.length && this.player.alive) this.popText(parts.join(' '), this.player.x, 2.8, this.player.z, '#ffe27a');
      this.pendScrap = 0;
      this.pendWood = 0;
    }
  }

  private updateNpcs(dt: number) {
    this.npcPhase += dt;
    const r = this.run;
    const th = this.props.treehouse;
    const visible = !this.npcHidden;
    if (this.screen === 'intro') return;
    if (this.endingMode === 'mercy') {
      this.chloe.root.visible = this.karen.root.visible = true;
      animate(this.chloe, 'cheer', this.npcPhase * 5, 1);
      animate(this.karen, 'laugh', this.npcPhase * 5, 1);
      return;
    }
    this.chloe.root.visible = this.karen.root.visible = visible;
    if (!visible) return;
    const sieged = r.sieging;
    const night = r.phase === 'night';
    const taunting = this.bubbles.length > 0;
    const lvl = r.shipLevel;
    const beg = this.endingMode === 'revenge';
    const pc = sieged || beg ? 'panic' : night ? 'idle' : taunting ? (lvl <= 2 ? 'laugh' : 'point') : 'idle';
    const pk = sieged || beg ? 'panic' : taunting ? (lvl <= 2 ? 'point' : 'idle') : 'idle';
    animate(this.chloe, pc, this.npcPhase * (sieged ? 12 : 5), 0);
    animate(this.karen, pk, this.npcPhase * (sieged ? 12 : 5), 0);
    // taunts
    if (this.running) {
      this.tauntT -= dt;
      if (this.tauntT <= 0) {
        this.tauntT = 22 + Math.random() * 18;
        if (sieged) {
          const c = NIGHT_CRIES[Math.floor(Math.random() * NIGHT_CRIES.length)];
          this.speak(c.who, c.text);
        } else if (!night) this.speakForLevel();
      }
    }
    void th;
  }

  private tickOverlay(dt: number) {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const v = this.tmpV;
    const proj = (x: number, y: number, z: number) => {
      v.set(x, y, z).project(this.camera);
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, vis: v.z < 1 };
    };
    for (const f of this.floats) {
      if (!f.active) continue;
      f.t += dt;
      if (f.t > 1.4) {
        f.active = false;
        f.el.style.display = 'none';
        continue;
      }
      const p = proj(f.x, f.y + f.t * 1.4, f.z);
      f.el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%) scale(${1 + Math.max(0, 0.3 - f.t) })`;
      f.el.style.opacity = String(Math.min(1, (1.4 - f.t) * 2));
    }
    const th = this.props.treehouse;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t += dt;
      if (b.t > 5 || this.npcHidden) {
        b.el.remove();
        this.bubbles.splice(i, 1);
        continue;
      }
      const src = b.who === 'chloe' ? th.girl : th.mom;
      const p = proj(src.x, src.y + 2.6, src.z);
      b.el.style.transform = `translate(${p.x}px,${p.y - i * 0}px) translate(-50%,-100%)`;
      b.el.style.opacity = p.vis ? String(Math.min(1, (5 - b.t) * 2)) : '0';
    }
  }

  private updateMinimap(dt: number) {
    this.miniT -= dt;
    if (this.miniT > 0 || !this.mini) return;
    this.miniT = 0.12;
    const c = this.mini;
    const g = c.getContext('2d');
    if (!g) return;
    const W = c.width;
    const H = c.height;
    const sx = W / (WORLD.maxX - WORLD.minX);
    const sz = H / (WORLD.maxZ - WORLD.minZ);
    const mx = (x: number) => (x - WORLD.minX) * sx;
    const mz = (z: number) => (z - WORLD.minZ) * sz;
    g.drawImage(this.miniBase, 0, 0, W, H);
    if (this.run.phase === 'night') {
      g.fillStyle = 'rgba(5,10,40,0.45)';
      g.fillRect(0, 0, W, H);
    }
    // crates & trees
    g.fillStyle = '#ffd24a';
    for (const cr of this.props.crates) if (cr.active) g.fillRect(mx(cr.x) - 1.5, mz(cr.z) - 1.5, 3, 3);
    g.fillStyle = '#ff9a3c';
    for (const t of this.props.trees) if (!t.felled) g.fillRect(mx(t.x) - 1, mz(t.z) - 1, 2, 2);
    // ship
    const rc = this.ship.rect;
    g.fillStyle = '#d9a066';
    g.fillRect(mx(rc.minX), mz(rc.minZ), (rc.maxX - rc.minX) * sx, (rc.maxZ - rc.minZ) * sz);
    // treehouse
    const th = this.props.treehouse;
    if (!this.npcHidden) {
      const blink = this.run.sieging && Math.floor(this.time * 4) % 2 === 0;
      g.fillStyle = blink ? '#ffffff' : '#ff5fa8';
      g.beginPath();
      g.arc(mx(th.x), mz(th.z), blink ? 5 : 3.5, 0, 7);
      g.fill();
    }
    // zombies
    for (const z of this.zm.list) {
      if (z.dead) continue;
      g.fillStyle = z.type === 'boss' ? '#ff00ff' : z.type === 'brute' ? '#ff7a00' : '#ff3030';
      const s = z.type === 'boss' ? 5 : z.type === 'brute' ? 3 : 2;
      g.fillRect(mx(z.x) - s / 2, mz(z.z) - s / 2, s, s);
    }
    // player
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(mx(this.player.x), mz(this.player.z), 3.5, 0, 7);
    g.fill();
    g.stroke();
  }

  /* ================================================================ */
  /* UI sync                                                          */
  /* ================================================================ */
  private syncUI(force: boolean) {
    const r = this.run;
    if (this.slotsDirty || force) {
      const unlocked = SHIP_LEVELS[r.shipLevel - 1].slots;
      this.slotsInfo = r.buildings.map((b, i) => ({ type: b ? b.type : null, level: b ? b.level : 0, unlocked: i < unlocked }));
      this.slotsDirty = false;
    }
    const inc = this.ship.incomes();
    const maxCd = Math.max(3.5, 8 - 0.5 * r.up.slam);
    setUI({
      scrap: Math.floor(r.scrap),
      wood: Math.floor(r.wood),
      hull: Math.round(r.hull),
      hullMax: r.hullMax,
      hp: Math.round(this.player.hp),
      hpMax: this.player.hpMax,
      phase: r.phase,
      night: r.night,
      timeLeft: r.phase === 'day' ? Math.max(0, Math.ceil(r.timer)) : 0,
      zombies: this.zm.alive,
      spawnLeft: this.zm.queue.length,
      shipLevel: r.shipLevel,
      weapon: r.weapon,
      owned: this.ownedArr,
      upg: r.up,
      slots: this.slotsInfo,
      slamCd: this.player.slamCd > 0 ? this.player.slamCd / maxCd : 0,
      kills: r.kills,
      treeHp: r.sieging ? Math.max(0, r.treeHp) / TREEHOUSE_HP : -1,
      incomeScrap: inc.scrap,
      incomeWood: inc.wood,
      incomeRepair: inc.repair,
      respawn: this.player.alive ? 0 : Math.ceil(this.player.respawnT),
      respect: r.respect,
    });
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObs.disconnect();
    this.input.dispose();
    audio.setNight(false);
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }
}
