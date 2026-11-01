import { useEffect, useRef } from 'react';
import { useUI } from '../game/store';
import { WEAPONS, SHIP_LEVELS } from '../game/config';
import { G } from './gameRef';
import { Joystick } from './Joystick';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function Bar({ value, max, from, to, className = 'h-3' }: { value: number; max: number; from: string; to: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className={`w-full overflow-hidden rounded-full bg-black/60 ring-1 ring-white/15 ${className}`}>
      <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${from}, ${to})` }} />
    </div>
  );
}

function IconBtn({ children, onClick, title, className = '' }: { children: React.ReactNode; onClick: () => void; title?: string; className?: string }) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`pointer-events-auto glass flex h-12 min-w-12 items-center justify-center gap-1 rounded-xl px-3 text-lg font-bold transition hover:brightness-125 active:scale-95 ${className}`}
    >
      {children}
    </button>
  );
}

function Resources() {
  const scrap = useUI((s) => s.scrap);
  const wood = useUI((s) => s.wood);
  const iS = useUI((s) => s.incomeScrap);
  const iW = useUI((s) => s.incomeWood);
  const kills = useUI((s) => s.kills);
  return (
    <div className="glass pointer-events-auto flex flex-col gap-1 rounded-xl px-3 py-2">
      <div className="flex items-center gap-2 text-xl font-extrabold">
        <span>⚙️</span>
        <span className="tabular-nums text-amber-200">{scrap}</span>
        {iS > 0 && <span className="text-xs font-bold text-emerald-300">+{iS.toFixed(1)}/s</span>}
      </div>
      <div className="flex items-center gap-2 text-xl font-extrabold">
        <span>🪵</span>
        <span className="tabular-nums text-orange-200">{wood}</span>
        {iW > 0 && <span className="text-xs font-bold text-emerald-300">+{iW.toFixed(1)}/s</span>}
      </div>
      <div className="text-xs font-semibold text-white/60">☠️ {kills} zombies down</div>
    </div>
  );
}

function PhasePill() {
  const phase = useUI((s) => s.phase);
  const night = useUI((s) => s.night);
  const t = useUI((s) => s.timeLeft);
  const z = useUI((s) => s.zombies);
  const q = useUI((s) => s.spawnLeft);
  const hull = useUI((s) => s.hull);
  const hullMax = useUI((s) => s.hullMax);
  const lvl = useUI((s) => s.shipLevel);
  const tree = useUI((s) => s.treeHp);
  const low = hull / hullMax < 0.3;
  return (
    <div className="flex w-[min(92vw,360px)] flex-col items-center gap-1.5">
      <div className={`glass rounded-full px-5 py-1.5 text-center font-title text-base ${phase === 'night' ? 'text-indigo-200' : 'text-amber-200'}`}>
        {phase === 'day' ? `☀️ DAY ${night} · ${fmt(t)}` : `🌙 NIGHT ${night} · ☠️ ${z + q}`}
      </div>
      <div className={`glass w-full rounded-xl px-3 py-1.5 ${low ? 'anim-danger' : ''}`}>
        <div className="mb-0.5 flex justify-between text-[11px] font-bold uppercase tracking-wide text-white/80">
          <span>🚢 {SHIP_LEVELS[lvl - 1].name}</span>
          <span className="tabular-nums">
            {hull}/{hullMax}
          </span>
        </div>
        <Bar value={hull} max={hullMax} from="#d9532f" to="#ffcf4a" />
      </div>
      {tree >= 0 && (
        <div className="glass w-full rounded-xl px-3 py-1.5">
          <div className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-pink-200">🏚️ Treehouse — Karen &amp; Chloe</div>
          <Bar value={tree * 100} max={100} from="#ff5fa8" to="#ffd1e8" />
        </div>
      )}
    </div>
  );
}

function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    G().setMinimap(ref.current);
    return () => G()?.setMinimap(null);
  }, []);
  return (
    <div className="glass pointer-events-none rounded-xl p-1">
      <canvas ref={ref} width={160} height={128} className="block h-[102px] w-[128px] rounded-lg sm:h-[128px] sm:w-[160px]" />
    </div>
  );
}

function WeaponBar() {
  const owned = useUI((s) => s.owned);
  const cur = useUI((s) => s.weapon);
  return (
    <div className="flex gap-1.5">
      {WEAPONS.map((w, i) =>
        owned.includes(w.id) ? (
          <button
            key={w.id}
            title={`${w.name} [${i + 1}]`}
            onClick={() => G().equipWeapon(w.id)}
            className={`pointer-events-auto relative flex h-11 w-11 items-center justify-center rounded-lg text-xl transition active:scale-95 ${
              cur === w.id ? 'bg-amber-400/90 text-black ring-2 ring-white' : 'glass hover:brightness-125'
            }`}
          >
            {w.icon}
            <span className="absolute -top-1 -left-1 rounded bg-black/70 px-1 text-[9px] font-bold">{i + 1}</span>
          </button>
        ) : null,
      )}
    </div>
  );
}

function SlamButton() {
  const cd = useUI((s) => s.slamCd);
  return (
    <button
      onPointerDown={(e) => {
        e.stopPropagation();
        G().player.trySlam();
      }}
      className="pointer-events-auto relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-amber-300 bg-gradient-to-b from-orange-500 to-red-700 text-3xl shadow-xl transition active:scale-90 sm:h-24 sm:w-24 sm:text-4xl"
      title="Belly Flop [SPACE]"
    >
      🍔
      {cd > 0 && <div className="absolute inset-x-0 bottom-0 bg-black/70" style={{ height: `${cd * 100}%` }} />}
      <span className="absolute bottom-1 text-[10px] font-extrabold tracking-wider text-white/90">SLAM</span>
    </button>
  );
}

function Toast() {
  const toast = useUI((s) => s.toast);
  if (!toast) return null;
  return (
    <div key={toast.id} className="anim-toast glass pointer-events-none max-w-[92vw] rounded-xl px-4 py-2 text-center text-sm font-bold sm:text-base">
      {toast.text}
    </div>
  );
}

function Subtitles() {
  const sub = useUI((s) => s.subtitle);
  if (!sub) return null;
  const color = sub.who === 'Bruno' ? 'text-red-300' : sub.who === 'Chloe' ? 'text-pink-300' : sub.who === 'Karen' ? 'text-violet-300' : 'text-amber-200';
  return (
    <div key={sub.text} className="anim-pop pointer-events-none absolute inset-x-0 bottom-[14%] z-30 flex justify-center px-4">
      <div className="max-w-[90vw] rounded-lg bg-black/70 px-5 py-3 text-center text-lg font-bold shadow-2xl sm:text-2xl">
        {sub.who && <span className={`mr-2 font-title ${color}`}>{sub.who}:</span>}
        <span>{sub.text}</span>
      </div>
    </div>
  );
}

export function IntroOverlay() {
  const card = useUI((s) => s.titleCard);
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="absolute inset-x-0 top-0 h-[9%] bg-black" />
      <div className="absolute inset-x-0 bottom-0 h-[9%] bg-black" />
      <Subtitles />
      {card && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
          <h1 className="anim-title font-title text-center text-5xl text-amber-300 drop-shadow-[0_4px_0_#7a2d12] sm:text-8xl">RUST &amp; REVENGE</h1>
          <p className="mt-3 text-lg font-bold text-white/90 sm:text-2xl">Build the greatest ship the apocalypse has ever seen.</p>
        </div>
      )}
      <button
        onClick={() => G().skipIntro()}
        className="pointer-events-auto absolute bottom-[11%] right-4 rounded-lg bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/25 sm:bottom-[11%]"
      >
        Skip ⏭
      </button>
    </div>
  );
}

function Alert() {
  const a = useUI((s) => s.alert);
  if (!a) return null;
  return <div className="anim-pop glass pointer-events-none max-w-[92vw] rounded-xl border-pink-400/60 px-4 py-2 text-center text-sm font-extrabold text-pink-200 sm:text-base">{a}</div>;
}

export function Hud() {
  const touch = useUI((s) => s.touch);
  const hp = useUI((s) => s.hp);
  const hpMax = useUI((s) => s.hpMax);
  const phase = useUI((s) => s.phase);
  const respawn = useUI((s) => s.respawn);
  const fps = useUI((s) => s.fps);
  const showFps = useUI((s) => s.showFps);
  const panel = useUI((s) => s.panel);
  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* top row */}
      <div className="absolute left-2 top-2 sm:left-3 sm:top-3">
        <Resources />
      </div>
      <div className="absolute left-1/2 top-[112px] -translate-x-1/2 sm:top-3">
        <PhasePill />
      </div>
      <div className="absolute right-2 top-2 flex flex-col items-end gap-2 sm:right-3 sm:top-3">
        <Minimap />
        <div className="flex gap-2">
          <IconBtn title="Help" onClick={() => G().openPanel(panel === 'help' ? null : 'help')}>
            ❓
          </IconBtn>
          <IconBtn title="Pause [P]" onClick={() => G().togglePause()}>
            ⏸
          </IconBtn>
        </div>
      </div>

      {/* toasts */}
      <div className="absolute inset-x-0 top-[215px] flex flex-col items-center gap-2 px-2 sm:top-[120px]">
        <Alert />
        <Toast />
      </div>

      {/* bottom-left: hero */}
      <div className="absolute bottom-2 left-2 flex w-[min(60vw,260px)] flex-col gap-2 sm:bottom-3 sm:left-3">
        <WeaponBar />
        <div className="glass rounded-xl px-3 py-1.5">
          <div className="mb-0.5 flex justify-between text-[11px] font-bold uppercase text-white/80">
            <span>❤️ Bruno</span>
            <span className="tabular-nums">
              {hp}/{hpMax}
            </span>
          </div>
          <Bar value={hp} max={hpMax} from="#e23a4b" to="#ff9a8a" />
        </div>
        {touch && <Joystick />}
      </div>

      {/* bottom-center: menu buttons */}
      <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-2 sm:bottom-3">
        <IconBtn title="Ship & repairs [B]" onClick={() => G().openPanel(panel === 'ship' ? null : 'ship')}>
          🚢<span className="hidden text-sm sm:inline">Ship</span>
        </IconBtn>
        <IconBtn title="Workshop [V]" onClick={() => G().openPanel(panel === 'workshop' ? null : 'workshop')}>
          🔧<span className="hidden text-sm sm:inline">Workshop</span>
        </IconBtn>
        {phase === 'day' && (
          <IconBtn title="Start the night early [N]" onClick={() => G().skipDay()}>
            🌙<span className="hidden text-sm sm:inline">Skip day</span>
          </IconBtn>
        )}
        <IconBtn title="Settings" onClick={() => G().openPanel(panel === 'settings' ? null : 'settings')}>
          ⚙
        </IconBtn>
      </div>

      {/* bottom-right: slam */}
      <div className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3">
        <SlamButton />
      </div>

      {respawn > 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/50">
          <div className="font-title text-4xl text-red-300">BRUNO IS DOWN</div>
          <div className="mt-2 text-xl font-bold">Respawning in {respawn}…</div>
        </div>
      )}
      {showFps && <div className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 text-xs font-mono">{fps} FPS</div>}
    </div>
  );
}
