import { useState, type ReactNode } from 'react';
import { useUI } from '../game/store';
import { FINAL_NIGHT } from '../game/config';
import { G } from './gameRef';
import { HelpBody, SettingsBody } from './Panels';

function Big({ children, onClick, tone = 'amber', small }: { children: ReactNode; onClick: () => void; tone?: 'amber' | 'slate' | 'green' | 'pink'; small?: boolean }) {
  const t = {
    amber: 'from-amber-300 to-orange-500 text-black',
    slate: 'from-slate-500 to-slate-700 text-white',
    green: 'from-emerald-300 to-emerald-600 text-black',
    pink: 'from-pink-300 to-fuchsia-600 text-black',
  }[tone];
  return (
    <button
      onClick={onClick}
      className={`pointer-events-auto w-full rounded-xl bg-gradient-to-b ${t} ${small ? 'px-4 py-2 text-base' : 'px-6 py-3 text-xl'} font-title shadow-lg ring-2 ring-black/30 transition hover:scale-[1.03] hover:brightness-110 active:scale-95`}
    >
      {children}
    </button>
  );
}

function Backdrop({ children, dark = 0.55 }: { children: ReactNode; dark?: number }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center overflow-y-auto p-4" style={{ background: `radial-gradient(ellipse at center, rgba(5,10,20,${dark * 0.6}), rgba(5,10,20,${dark + 0.3}))` }}>
      {children}
    </div>
  );
}

export function MainMenu() {
  const hasSave = useUI((s) => s.hasSave);
  const best = useUI((s) => s.bestNight);
  const [view, setView] = useState<'main' | 'help' | 'settings'>('main');
  const [skip, setSkip] = useState(false);
  return (
    <Backdrop dark={0.2}>
      <div className="flex w-full max-w-md flex-col items-center gap-4 py-4 text-center">
        <div className="anim-float text-6xl drop-shadow-lg sm:text-7xl">🚢🧟</div>
        <div>
          <h1 className="font-title text-5xl leading-none text-amber-300 drop-shadow-[0_5px_0_#7a2d12] sm:text-7xl">RUST</h1>
          <h1 className="font-title text-3xl leading-none text-white drop-shadow-[0_4px_0_#222] sm:text-5xl">&amp; REVENGE</h1>
        </div>
        <p className="max-w-sm text-sm font-semibold text-white/85 sm:text-base">
          Dumped for being fat. Left to the zombies. Now he's building the greatest ship the apocalypse has ever seen.
        </p>
        {view === 'main' && (
          <div className="flex w-full flex-col gap-2.5">
            <Big
              onClick={() => {
                G().newGame(!skip);
              }}
            >
              ▶ New Game
            </Big>
            {hasSave && (
              <Big tone="green" onClick={() => G().continueGame()}>
                ⏩ Continue
              </Big>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <Big tone="slate" small onClick={() => setView('help')}>
                How to Play
              </Big>
              <Big tone="slate" small onClick={() => setView('settings')}>
                Settings
              </Big>
            </div>
            <label className="flex cursor-pointer items-center justify-center gap-2 text-sm font-bold text-white/80">
              <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Skip intro cinematic
            </label>
            {best > 0 && <div className="text-sm font-bold text-amber-200">🏆 Best: Night {best}</div>}
          </div>
        )}
        {view !== 'main' && (
          <div className="glass w-full rounded-2xl p-4 text-left">
            {view === 'help' ? <HelpBody /> : <SettingsBody />}
            <div className="mt-3">
              <Big tone="slate" small onClick={() => setView('main')}>
                ← Back
              </Big>
            </div>
          </div>
        )}
        <div className="text-[11px] text-white/40">WASD move · Click build · SPACE slam · Headphones recommended 🎧</div>
      </div>
    </Backdrop>
  );
}

export function PauseMenu() {
  const [view, setView] = useState<'main' | 'settings' | 'help'>('main');
  return (
    <Backdrop dark={0.4}>
      <div className="glass flex w-full max-w-sm flex-col gap-3 rounded-2xl p-5">
        <h2 className="text-center font-title text-3xl text-amber-200">PAUSED</h2>
        {view === 'main' ? (
          <>
            <Big onClick={() => G().togglePause()}>▶ Resume</Big>
            <Big tone="slate" small onClick={() => setView('settings')}>
              Settings
            </Big>
            <Big tone="slate" small onClick={() => setView('help')}>
              How to Play
            </Big>
            <Big tone="slate" small onClick={() => G().toMenu()}>
              Main Menu
            </Big>
          </>
        ) : (
          <>
            {view === 'settings' ? <SettingsBody /> : <HelpBody />}
            <Big tone="slate" small onClick={() => setView('main')}>
              ← Back
            </Big>
          </>
        )}
      </div>
    </Backdrop>
  );
}

export function GameOver() {
  const night = useUI((s) => s.night);
  const kills = useUI((s) => s.kills);
  const hasSave = useUI((s) => s.hasSave);
  return (
    <Backdrop dark={0.55}>
      <div className="glass flex w-full max-w-md flex-col items-center gap-3 rounded-2xl p-6 text-center">
        <div className="text-6xl">🌊</div>
        <h2 className="font-title text-4xl text-red-400">THE SHIP SANK</h2>
        <p className="text-white/80">
          Bruno made it to <b className="text-amber-200">Night {night}</b> and took down <b className="text-amber-200">{kills}</b> zombies. Somewhere, Karen is laughing.
        </p>
        {hasSave && (
          <Big tone="green" onClick={() => G().continueGame()}>
            ⏩ Retry from last dawn
          </Big>
        )}
        <Big onClick={() => G().newGame(false)}>↺ New Game</Big>
        <Big tone="slate" small onClick={() => G().toMenu()}>
          Main Menu
        </Big>
      </div>
    </Backdrop>
  );
}

export function Victory() {
  const kills = useUI((s) => s.kills);
  const respect = useUI((s) => s.respect);
  return (
    <Backdrop dark={0.35}>
      <div className="glass flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl p-6 text-center">
        <div className="anim-float text-6xl">🛥️✨</div>
        <h2 className="font-title text-3xl text-amber-300 sm:text-4xl">LUXURY ACHIEVED</h2>
        <p className="text-white/85">
          You survived {FINAL_NIGHT} nights, crushed {kills} zombies and turned a rusty wreck into a floating palace.
        </p>
        <p className="rounded-xl bg-pink-500/15 p-3 text-sm font-semibold text-pink-100">
          💅 Chloe and Karen are paddling up to your ship, soaking wet, begging to come aboard…
          <br />
          <span className="text-xs text-pink-200/70">(Respect earned from saving the treehouse: {respect})</span>
        </p>
        <Big tone="pink" onClick={() => G().chooseEnding('mercy')}>
          💖 Let them aboard
        </Big>
        <Big tone="slate" onClick={() => G().chooseEnding('revenge')}>
          😈 "Just you wait." — Revenge
        </Big>
      </div>
    </Backdrop>
  );
}

export function Ending() {
  const e = useUI((s) => s.ending);
  const mercy = e === 'mercy';
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-end justify-center p-4 pb-10">
      <div className="glass pointer-events-auto flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl p-5 text-center">
        <h2 className={`font-title text-3xl ${mercy ? 'text-pink-300' : 'text-amber-300'}`}>{mercy ? 'THE BIGGER PERSON' : 'SWEET REVENGE'}</h2>
        <p className="text-sm text-white/85 sm:text-base">
          {mercy
            ? 'Bruno hauls them aboard. Karen apologises. Chloe fetches the cocktails. The hot tub is warm, the turrets are loaded, and nobody mentions the syringe ever again.'
            : 'Bruno leans over the gold railing, sips his drink and waves. "Sorry, only room for fit people." The zombies on the shore groan in agreement. THE END… or is it?'}
        </p>
        <Big onClick={() => G().continueEndless()}>♾️ Keep playing (endless nights)</Big>
        <Big tone="slate" small onClick={() => G().toMenu()}>
          Main Menu
        </Big>
      </div>
    </div>
  );
}
