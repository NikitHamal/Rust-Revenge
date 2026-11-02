import { Game } from '../../src/game/game';
import { getUI } from '../../src/game/store';
const g: any = new Game(new (globalThis as any).FakeEl());
const errs: string[] = [];
function step(n: number, dt = 0.033) { for (let i = 0; i < n; i++) { try { g.time += dt; g.update(dt); } catch (e: any) { errs.push(e.stack.split('\n').slice(0,4).join(' | ')); if (errs.length > 5) throw new Error(errs.join('\n')); } } }
console.log('constructed; screen', g.screen);
step(30);
// ---- intro
g.newGame(true);
for (let t = 0; t < 40 * 30; t++) { step(1); if (g.screen !== 'intro') break; }
console.log('after intro screen=', g.screen, 'ui=', getUI().screen, 'player', g.player.x.toFixed(1), g.player.z.toFixed(1), g.player.y.toFixed(2));
// ---- gameplay
step(60);
g.buildAt(1, 'gun'); g.buildAt(2, 'flame'); g.buildAt(3, 'tesla'); g.buildAt(4,'press'); g.buildAt(5,'sawmill'); g.buildAt(6, 'repair');
g.run.scrap = 99999; g.run.wood = 99999;
g.buildAt(1,'gun'); g.buildAt(2,'flame'); g.buildAt(3,'tesla');g.buildAt(4,'press');g.buildAt(5,'sawmill'); 
for (let i=0;i<3;i++){ g.upgradeBuilding(1); g.upgradeBuilding(2); g.upgradeBuilding(3);} 
g.buyWeapon('smg'); g.buyWeapon('shotgun'); g.buyWeapon('minigun'); g.upgradeStat('hp'); g.upgradeStat('slam');
console.log('slots', getUI().slots.filter((s:any)=>s.type).length);
g.skipDay();
for (let n = 0; n < 6000; n++) {
  step(30);
  g.player.trySlam();
  g.run.hull = g.run.hullMax;
  if (n % 300 === 0) console.log(n, g.screen, g.running, g.run.phase, 'night', g.run.night, 'z', g.zm.list.length, 'q', g.zm.queue.length, 'alive', g.zm.alive, 'nc', g.run.nightClock.toFixed(0), 'sieging', g.run.sieging, g.zm.list.filter((z:any)=>!z.dead).slice(0,4).map((z:any)=>z.type+'@'+z.x.toFixed(0)+','+z.z.toFixed(0)+(z.mode?'h':'w')+z.tgt+'n'+(z.night?1:0)+' hp'+z.hp.toFixed(0)).join(' '));
  if (g.screen === 'ended') { console.log('ended ui=', getUI().screen, 'night', g.run.night); break; }
  if (g.run.phase === 'day') { g.run.timer = 0.1; if (g.run.shipLevel < 5) g.upgradeShip(); }
}
console.log('night', g.run.night, 'kills', g.run.kills, 'zombies', g.zm.list.length, 'shipLevel', g.run.shipLevel, 'screen', g.screen);
if (g.screen === 'ended' && getUI().screen === 'victory') { g.chooseEnding('revenge'); step(30); g.continueEndless(); step(60); }
g.upgradeShip(); g.repairHull(); g.sellBuilding(2); g.togglePause(); g.togglePause(); g.toMenu(); step(30);
g.continueGame(); step(60);
console.log('errors:', errs.length); errs.forEach(e => console.log(e));
