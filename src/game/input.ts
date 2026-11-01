import type { Game } from './game';

/** Keyboard + pointer + virtual joystick input, camera-relative. */
export class Input {
  keys = new Set<string>();
  joy = { x: 0, y: 0 };
  target: { x: number; z: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private down: { x: number; y: number; t: number; id: number; moved: boolean; button: number } | null = null;
  private pinchDist = 0;
  private cleanup: (() => void)[] = [];

  constructor(private game: Game, dom: HTMLElement) {
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, type: string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => el.removeEventListener(type, fn as EventListener));
      return null as unknown as K;
    };
    on(window, 'keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (e.repeat) {
        this.keys.add(k);
        return;
      }
      this.keys.add(k);
      game.onKey(k);
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase()));
    on(window, 'blur', () => this.keys.clear());
    on(dom, 'contextmenu', (e: Event) => e.preventDefault());
    on(
      dom,
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        game.zoom(e.deltaY * 0.02);
      },
      { passive: false },
    );
    on(dom, 'pointerdown', (e: PointerEvent) => {
      game.unlockAudio();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        this.down = null;
      } else {
        this.down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, moved: false, button: e.button };
      }
    });
    on(window, 'pointermove', (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        game.zoom((this.pinchDist - d) * 0.05);
        this.pinchDist = d;
        return;
      }
      if (this.down && this.down.id === e.pointerId) {
        if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 8) this.down.moved = true;
        if (this.down.moved && (this.down.button === 2 || this.down.button === 1)) game.rotate(-dx * 0.008);
      }
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      const d = this.down;
      if (d && d.id === e.pointerId) {
        if (!d.moved && performance.now() - d.t < 400 && d.button === 0) game.handleTap(e.clientX, e.clientY);
        this.down = null;
      }
    };
    on(window, 'pointerup', up);
    on(window, 'pointercancel', up);
  }

  dispose() {
    this.cleanup.forEach((c) => c());
    this.cleanup = [];
  }

  /** world-space movement vector for current input */
  move(px: number, pz: number) {
    const k = this.keys;
    let dx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    let dy = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    dx += this.joy.x;
    dy += this.joy.y;
    const yaw = this.game.rig.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    let mx = fx * dy + rx * dx;
    let mz = fz * dy + rz * dx;
    const l = Math.hypot(mx, mz);
    if (l > 0.05) {
      this.target = null;
      if (l > 1) {
        mx /= l;
        mz /= l;
      }
      return { x: mx, z: mz };
    }
    if (this.target) {
      const tx = this.target.x - px;
      const tz = this.target.z - pz;
      const d = Math.hypot(tx, tz);
      if (d < 0.5) this.target = null;
      else return { x: tx / d, z: tz / d };
    }
    return { x: 0, z: 0 };
  }
}
