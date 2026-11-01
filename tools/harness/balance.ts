import { Game } from '../../src/game/game';
const g: any = new Game(new (globalThis as any).FakeEl());
function step(n: number, dt = 0.033) { for (let i = 0; i < n; i++) { g.time += dt; g.update(dt); } }
step(10);
g.newGame(false);
step(10);
g.buildAt(1, 'gun');
console.log('scrap after gun', Math.floor(g.run.scrap), 'hull', g.run.hull);
g.skipDay();
let lastNight = 1, minHull = 9999;
for (let i = 0; i < 40000 && g.running; i++) {
  step(1);
  minHull = Math.min(minHull, g.run.hull);
  if (g.run.night !== lastNight || g.screen === 'ended') {
    console.log(`night ${lastNight} done: hull ${Math.round(g.run.hull)}/${g.run.hullMax} min ${Math.round(minHull)} scrap ${Math.floor(g.run.scrap)} wood ${Math.floor(g.run.wood)} kills ${g.run.kills} t=${(i*0.033).toFixed(0)}s`);
    lastNight = g.run.night; minHull = 9999;
    // idle player strategy: spend scrap on turrets / upgrades
    for (const s of [1,2,3]) { if (!g.run.buildings[s]) g.buildAt(s, 'gun'); }
    for (let s=0;s<12;s++) if (g.run.buildings[s] && g.run.buildings[s].level<2) g.upgradeBuilding(s);
    if (g.run.shipLevel<2) g.upgradeShip();
    g.skipDay();
  }
}
console.log('final screen', g.screen, 'night', g.run.night, 'hull', Math.round(g.run.hull));
