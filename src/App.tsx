import { useEffect, useRef, useState } from 'react';
import { Game } from './game/game';
import { getUI, loadSettings, setUI, useUI } from './game/store';
import { gameRef } from './ui/gameRef';
import { Hud, IntroOverlay } from './ui/Hud';
import { BuildPanel, HelpPanel, SettingsPanel, ShipPanel, WorkshopPanel } from './ui/Panels';
import { Ending, GameOver, MainMenu, PauseMenu, Victory } from './ui/Screens';

export default function App() {
  const mount = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const screen = useUI((s) => s.screen);
  const panel = useUI((s) => s.panel);

  useEffect(() => {
    let game: Game | null = null;
    try {
      const saved = localStorage.getItem('rustrevenge.settings.v1');
      loadSettings();
      if (!saved) setUI({ quality: getUI().touch ? 'medium' : 'high' });
      game = new Game(mount.current!);
      gameRef.current = game;
      (window as unknown as { __game?: Game }).__game = game; // debug handle for tests / devtools
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    }
    return () => {
      game?.dispose();
      gameRef.current = null;
    };
  }, []);

  const playing = screen === 'playing' || screen === 'paused' || screen === 'victory' || screen === 'gameover';

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      <div ref={mount} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950 p-6 text-center">
          <div>
            <div className="font-title text-3xl text-red-400">WebGL unavailable</div>
            <p className="mt-2 text-white/70">Rust &amp; Revenge needs a browser with WebGL2 enabled. ({error})</p>
          </div>
        </div>
      )}
      {screen === 'menu' && <MainMenu />}
      {screen === 'intro' && <IntroOverlay />}
      {playing && screen !== 'victory' && screen !== 'gameover' && <Hud />}
      {screen === 'ending' && <Hud />}
      {(screen === 'playing' || screen === 'ending') && (
        <>
          {panel === 'build' && <BuildPanel />}
          {panel === 'ship' && <ShipPanel />}
          {panel === 'workshop' && <WorkshopPanel />}
          {panel === 'settings' && <SettingsPanel />}
          {panel === 'help' && <HelpPanel />}
        </>
      )}
      {screen === 'paused' && <PauseMenu />}
      {screen === 'gameover' && <GameOver />}
      {screen === 'victory' && <Victory />}
      {screen === 'ending' && <Ending />}
    </div>
  );
}
