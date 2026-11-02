import type { ReactNode } from 'react';
import { useUI, setUI, saveSettings, type Quality } from '../game/store';
import {
  BUILDINGS,
  BUILDING_ORDER,
  MAX_BUILDING_LEVEL,
  SHIP_LEVELS,
  STAT_DEFS,
  WEAPONS,
  buildingCost,
  ecoRate,
  statCost,
  turretStats,
  type BuildingType,
} from '../game/config';
import { G } from './gameRef';

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="anim-pop glass pointer-events-auto absolute bottom-[72px] right-2 z-20 flex max-h-[62vh] w-[min(94vw,380px)] flex-col rounded-2xl sm:bottom-auto sm:right-3 sm:top-[190px] sm:max-h-[calc(100vh-270px)] [@media(max-height:560px)]:!top-2 [@media(max-height:560px)]:!bottom-auto [@media(max-height:560px)]:!right-auto [@media(max-height:560px)]:left-1/2 [@media(max-height:560px)]:-translate-x-1/2 [@media(max-height:560px)]:!max-h-[calc(100vh-80px)]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <h3 className="font-title text-lg text-amber-200">{title}</h3>
        <button onClick={onClose} className="rounded-lg bg-white/10 px-2.5 py-0.5 text-lg font-bold hover:bg-white/25">
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto p-3">{children}</div>
    </div>
  );
}

function Cost({ scrap, wood }: { scrap: number; wood: number }) {
  const s = useUI((st) => st.scrap);
  const w = useUI((st) => st.wood);
  return (
    <span className="flex gap-2 text-sm font-extrabold">
      {scrap > 0 && <span className={s >= scrap ? 'text-amber-200' : 'text-red-400'}>⚙️{scrap}</span>}
      {wood > 0 && <span className={w >= wood ? 'text-orange-200' : 'text-red-400'}>🪵{wood}</span>}
      {scrap === 0 && wood === 0 && <span className="text-emerald-300">FREE</span>}
    </span>
  );
}

function Btn({ children, onClick, disabled, tone = 'amber' }: { children: ReactNode; onClick: () => void; disabled?: boolean; tone?: 'amber' | 'green' | 'red' | 'slate' }) {
  const tones = {
    amber: 'bg-amber-400 text-black hover:bg-amber-300',
    green: 'bg-emerald-500 text-black hover:bg-emerald-400',
    red: 'bg-red-500/90 text-white hover:bg-red-400',
    slate: 'bg-white/15 text-white hover:bg-white/25',
  };
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-extrabold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function statLine(type: BuildingType, level: number) {
  if (BUILDINGS[type].turret) {
    const s = turretStats(type, level);
    if (type === 'flame') return `${Math.round(s.dmg)} dmg/s · range ${s.range.toFixed(1)}`;
    if (type === 'tesla') return `${Math.round(s.dmg)} dmg · chains ${s.chain} · range ${s.range.toFixed(0)}`;
    return `${Math.round(s.dmg)} dmg · ${s.rate.toFixed(1)}/s · range ${s.range.toFixed(0)}`;
  }
  const r = ecoRate(type, level);
  if (type === 'repair') return `+${r} hull/s`;
  return `+${r}/s`;
}

export function BuildPanel() {
  const slot = useUI((s) => s.selectedSlot);
  const slots = useUI((s) => s.slots);
  const info = slots[slot];
  if (!info) return null;
  const close = () => G().closePanel();
  if (!info.type) {
    return (
      <Shell title={`Build · Slot ${slot + 1}`} onClose={close}>
        {BUILDING_ORDER.map((t) => {
          const d = BUILDINGS[t];
          const c = buildingCost(t, 1);
          return (
            <div key={t} className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg text-2xl" style={{ background: d.color + '33', border: `1px solid ${d.color}` }}>
                {d.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold">{d.name}</div>
                <div className="text-xs text-white/60">{d.desc}</div>
                <div className="text-xs font-semibold text-sky-200">{statLine(t, 1)}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Cost scrap={c.scrap} wood={c.wood} />
                <Btn onClick={() => G().buildAt(slot, t)}>Build</Btn>
              </div>
            </div>
          );
        })}
      </Shell>
    );
  }
  const d = BUILDINGS[info.type];
  const maxed = info.level >= MAX_BUILDING_LEVEL;
  const next = buildingCost(info.type, info.level + 1);
  let sellS = 0;
  let sellW = 0;
  for (let l = 1; l <= info.level; l++) {
    const c = buildingCost(info.type, l);
    sellS += c.scrap;
    sellW += c.wood;
  }
  return (
    <Shell title={`${d.icon} ${d.name} · Lv ${info.level}`} onClose={close}>
      <div className="rounded-xl bg-white/5 p-3 text-sm">
        <div className="text-white/70">{d.desc}</div>
        <div className="mt-1 font-bold text-sky-200">Now: {statLine(info.type, info.level)}</div>
        {!maxed && <div className="font-bold text-emerald-300">Next: {statLine(info.type, info.level + 1)}</div>}
      </div>
      <div className="flex items-center justify-between rounded-xl bg-white/5 p-3">
        <div>
          <div className="font-extrabold">{maxed ? 'Max level' : `Upgrade → Lv ${info.level + 1}`}</div>
          {!maxed && <Cost scrap={next.scrap} wood={next.wood} />}
        </div>
        <Btn disabled={maxed} onClick={() => G().upgradeBuilding(slot)} tone="green">
          Upgrade
        </Btn>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-white/5 p-3">
        <div>
          <div className="font-extrabold">Sell</div>
          <span className="text-sm font-bold text-white/70">
            ⚙️{Math.floor(sellS / 2)} 🪵{Math.floor(sellW / 2)}
          </span>
        </div>
        <Btn tone="red" onClick={() => G().sellBuilding(slot)}>
          Sell
        </Btn>
      </div>
    </Shell>
  );
}

export function ShipPanel() {
  const lvl = useUI((s) => s.shipLevel);
  const hull = useUI((s) => s.hull);
  const hullMax = useUI((s) => s.hullMax);
  const rep = useUI((s) => s.incomeRepair);
  const respect = useUI((s) => s.respect);
  const def = SHIP_LEVELS[lvl - 1];
  const nextDef = SHIP_LEVELS[lvl];
  const missing = hullMax - hull;
  return (
    <Shell title="🚢 Your Ship" onClose={() => G().openPanel(null)}>
      <div className="rounded-xl bg-white/5 p-3">
        <div className="font-title text-xl text-amber-200">{def.name}</div>
        <div className="text-sm italic text-white/60">{def.tagline}</div>
        <div className="mt-2 flex gap-1.5">
          {SHIP_LEVELS.map((_, i) => (
            <div key={i} className={`h-2 flex-1 rounded-full ${i < lvl ? 'bg-amber-400' : 'bg-white/15'}`} />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 text-sm font-semibold text-white/80">
          <span>🛡️ Hull {hullMax}</span>
          <span>🔩 {def.slots} build pads</span>
          <span>🔧 Regen {rep.toFixed(1)}/s</span>
          <span>💖 Respect {respect}</span>
        </div>
      </div>
      {nextDef ? (
        <div className="rounded-xl bg-white/5 p-3">
          <div className="font-extrabold">Refit → {nextDef.name}</div>
          <div className="mb-2 text-xs text-white/60">
            +{nextDef.hull - def.hull} hull · +2 build pads · {nextDef.tagline}
          </div>
          <div className="flex items-center justify-between">
            <Cost scrap={def.scrap} wood={def.wood} />
            <Btn tone="green" onClick={() => G().upgradeShip()}>
              Upgrade Ship
            </Btn>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-amber-400/15 p-3 text-center font-bold text-amber-200">✨ Maximum luxury achieved ✨</div>
      )}
      <div className="rounded-xl bg-white/5 p-3">
        <div className="font-extrabold">Patch the hull</div>
        <div className="mb-2 text-xs text-white/60">Restores up to 25% of the hull for 1 wood per 4 HP.</div>
        <div className="flex items-center justify-between">
          <Cost scrap={0} wood={Math.ceil(Math.min(missing, hullMax * 0.25) / 4)} />
          <Btn disabled={missing < 1} onClick={() => G().repairHull()}>
            Repair
          </Btn>
        </div>
      </div>
    </Shell>
  );
}

export function WorkshopPanel() {
  const owned = useUI((s) => s.owned);
  const cur = useUI((s) => s.weapon);
  const upg = useUI((s) => s.upg);
  return (
    <Shell title="🔧 Workshop" onClose={() => G().openPanel(null)}>
      <div className="text-xs font-bold uppercase tracking-widest text-white/50">Weapons</div>
      {WEAPONS.map((w, i) => {
        const has = owned.includes(w.id);
        return (
          <div key={w.id} className={`flex items-center gap-3 rounded-xl p-2.5 ${cur === w.id ? 'bg-amber-400/20 ring-1 ring-amber-300' : 'bg-white/5'}`}>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-black/30 text-2xl">{w.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="font-extrabold">
                {w.name} <span className="text-xs text-white/40">[{i + 1}]</span>
              </div>
              <div className="text-xs text-white/60">{w.desc}</div>
              <div className="text-xs font-semibold text-sky-200">
                {w.dmg * w.pellets} dmg · {w.rate}/s · {w.melee ? 'melee' : `range ${w.range}`}
              </div>
            </div>
            {has ? (
              <Btn tone={cur === w.id ? 'slate' : 'green'} disabled={cur === w.id} onClick={() => G().equipWeapon(w.id)}>
                {cur === w.id ? 'Equipped' : 'Equip'}
              </Btn>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <Cost scrap={w.scrap} wood={w.wood} />
                <Btn onClick={() => G().buyWeapon(w.id)}>Buy</Btn>
              </div>
            )}
          </div>
        );
      })}
      <div className="mt-1 text-xs font-bold uppercase tracking-widest text-white/50">Bruno</div>
      {STAT_DEFS.map((s) => {
        const lvl = upg[s.id];
        const c = statCost(s.id, lvl);
        const max = lvl >= s.max;
        return (
          <div key={s.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-black/30 text-2xl">{s.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="font-extrabold">
                {s.name} <span className="text-xs text-amber-200">Lv {lvl}/{s.max}</span>
              </div>
              <div className="text-xs text-white/60">{s.desc}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {!max && <Cost scrap={c.scrap} wood={c.wood} />}
              <Btn tone="green" disabled={max} onClick={() => G().upgradeStat(s.id)}>
                {max ? 'MAX' : 'Train'}
              </Btn>
            </div>
          </div>
        );
      })}
    </Shell>
  );
}

export function QualityPicker() {
  const q = useUI((s) => s.quality);
  const opts: { id: Quality; label: string; hint: string }[] = [
    { id: 'low', label: 'Low', hint: 'No shadows · fastest' },
    { id: 'medium', label: 'Medium', hint: 'Shadows · balanced' },
    { id: 'high', label: 'High', hint: 'Bloom · MSAA · best looks' },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-xs font-bold uppercase tracking-widest text-white/50">Graphics</div>
      <div className="grid grid-cols-3 gap-1.5">
        {opts.map((o) => (
          <button
            key={o.id}
            onClick={() => G().applyQuality(o.id)}
            className={`rounded-lg px-2 py-2 text-sm font-extrabold transition ${q === o.id ? 'bg-amber-400 text-black' : 'bg-white/10 hover:bg-white/20'}`}
          >
            {o.label}
            <div className="text-[10px] font-semibold opacity-70">{o.hint}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsBody() {
  const vol = useUI((s) => s.volume);
  const muted = useUI((s) => s.muted);
  const showFps = useUI((s) => s.showFps);
  return (
    <div className="flex flex-col gap-3">
      <QualityPicker />
      <div className="flex flex-col gap-1.5">
        <div className="text-xs font-bold uppercase tracking-widest text-white/50">Audio</div>
        <div className="flex items-center gap-3">
          <button onClick={() => G().setVolume(vol, !muted)} className="rounded-lg bg-white/10 px-3 py-1.5 text-lg hover:bg-white/20">
            {muted ? '🔇' : '🔊'}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => G().setVolume(Number(e.target.value), muted)} className="flex-1" />
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
        <input
          type="checkbox"
          checked={showFps}
          onChange={(e) => {
            setUI({ showFps: e.target.checked });
            saveSettings();
          }}
        />
        Show FPS counter
      </label>
    </div>
  );
}

export function SettingsPanel() {
  return (
    <Shell title="⚙ Settings" onClose={() => G().openPanel(null)}>
      <SettingsBody />
    </Shell>
  );
}

export function HelpBody() {
  const rows: [string, string][] = [
    ['WASD / Arrows', 'Move Bruno (relative to the camera)'],
    ['Click / Tap ground', 'Walk there'],
    ['Click glowing pad', 'Build / upgrade turrets on your ship'],
    ['Auto-aim', 'Bruno shoots the nearest zombie by himself'],
    ['SPACE', 'Belly Flop slam — area damage + knockback'],
    ['SHIFT', 'Dash — short burst with brief invulnerability'],
    ['Spitters 🤢', 'Stay back and lob acid at your hull — hunt them down'],
    ['Bloaters 🎈', 'Explode when killed or on contact — pop them from range'],
    ['Blood Moon 🩸', 'Nights 3/6/9/10: bigger, faster hordes, +60% loot'],
    ['Storms ⛈️', 'Rain & lightning on some nights; drizzle by day'],
    ['Supply drops 📦', 'Follow the glowing beam for a big loot crate'],
    ['Stand by orange trees', 'Chop wood'],
    ['Run through crates', 'Loot scrap, wood & medkits'],
    ['Q / E · Wheel · Pinch', 'Rotate / zoom camera (right-drag rotates)'],
    ['1-5', 'Switch weapon'],
    ['B / V / N / P / M', 'Ship · Workshop · Skip day · Pause · Mute'],
  ];
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="text-white/70">
        By day: scavenge and build. By night: zombies swarm the hull. Survive <b className="text-amber-200">10 nights</b>, upgrade the wreck into a luxury yacht, and decide what to do about Karen &amp; Chloe…
      </p>
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
          <span className="w-40 shrink-0 font-extrabold text-amber-200">{k}</span>
          <span className="text-white/80">{v}</span>
        </div>
      ))}
      <p className="text-xs text-white/50">Zombies wade slowly through water. Save the treehouse on sieges for bonus loot & respect. Hull at 0 = the ship sinks.</p>
    </div>
  );
}

export function HelpPanel() {
  return (
    <Shell title="❓ How to Play" onClose={() => G().openPanel(null)}>
      <HelpBody />
    </Shell>
  );
}
