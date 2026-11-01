# Testing

## 1. Static
```bash
npx tsc --noEmit      # strict, noUnused* on
npm run build         # produces dist/index.html
```

## 2. Headless logic harness (no GPU needed)
`tools/harness` bundles the real game code with esbuild, swapping `three`'s `WebGLRenderer` for a stub and providing a minimal DOM,
so the *entire* simulation runs in Node.

```bash
node tools/harness/build.mjs logic   && node tools/harness/.out/logic.mjs     # full run: intro → 10 nights → ending → endless → save/load
node tools/harness/build.mjs balance && node tools/harness/.out/balance.mjs   # idle-player balance probe (prints hull per night)
```
`logic` must end with `errors: 0`. It exercises: intro timeline, building/upgrading/selling, weapon & stat purchases, ship refits, sieges, boss nights,
victory + both endings, pause/menu round-trips and continue-from-save. It does **not** validate rendering.
Extend `logic.ts` when adding systems (call the new public `Game` methods and run `step(n)`).

## 3. Manual QA checklist (real browser)
**Menu / flow**: New Game w/ and w/o intro · Continue · Pause (Esc/P) · Main menu · Game over retry · Victory choice · Ending → endless.
**Intro**: skip works (Esc/Space/button) · subtitles readable · title card appears · Bruno ends on the deck and gameplay starts.
**Controls**: WASD, click-to-move, Q/E, wheel, right-drag, SPACE slam, 1-5 weapons, B/V/N/P/M/F keys; touch: joystick, SLAM, pinch.
**Economy**: chop tree → wood; crate → scrap/wood/med; build/upgrade/sell; ship refit (new pads appear, hull model changes); repair.
**Combat**: auto-aim each weapon · turrets (gun/flame/tesla) track & fire · eco buildings produce · hull damage/regeneration · player death/respawn.
**Night flow**: alarm, light fade, zombies spawn at edges, wave ends → dawn → autosave toast. Sieges on 4/7/10: alert, treehouse bar, outcomes.
**Perf**: toggle quality tiers; confirm adaptive downgrade toast under load; `F` shows FPS.
**Persistence**: reload → Continue restores night, resources, buildings, ship, weapons, upgrades; settings persist.

## 4. Debug cheats (browser console)
```js
__game.run.scrap = 9999; __game.run.wood = 9999;     // money
__game.skipDay();                                     // start the night now
__game.run.night = 9;                                 // jump ahead (then skipDay)
__game.cinematic.t = 20;                              // scrub the intro
__game.applyQuality('low' | 'medium' | 'high');
```
