import { useRef, useState } from 'react';
import { gameRef } from './gameRef';

/** On-screen virtual stick for touch devices. Writes camera-relative input into game.input.joy */
export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);
  const R = 46;

  const set = (cx: number, cy: number) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = cx - (r.left + r.width / 2);
    let dy = cy - (r.top + r.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    setKnob({ x: dx, y: dy });
    const g = gameRef.current;
    if (g) {
      g.input.joy.x = dx / R;
      g.input.joy.y = -dy / R;
    }
  };
  const reset = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    const g = gameRef.current;
    if (g) {
      g.input.joy.x = 0;
      g.input.joy.y = 0;
    }
  };

  return (
    <div
      ref={base}
      className="pointer-events-auto relative mb-2 ml-2 h-28 w-28 rounded-full border-2 border-white/30 bg-white/10 backdrop-blur-sm"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        e.stopPropagation();
        active.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        set(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (active.current === e.pointerId) set(e.clientX, e.clientY);
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60 shadow-lg"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}
