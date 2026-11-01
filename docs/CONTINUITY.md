# Continuity log

_Last updated: end of session 1 (initial full build)._

## State of the project
**Feature-complete first version.** Everything below exists, compiles (`tsc` strict clean), builds, and ran end-to-end in the headless logic harness
(intro → 10 nights incl. sieges & bosses → victory → both endings → endless → save/load) with **0 runtime exceptions**.

Implemented: menu, scripted intro cinematic (~39 s, skippable), day/night loop, 10-night campaign + endless, 5 ship tiers with distinct models, 6 buildings × 3 levels,
5 weapons, 4 training stats, slam ability, zombies (4 types, instanced), boss nights, treehouse sieges, NPC taunts & endings, loot crates, choppable trees,
minimap, HUD, build/ship/workshop/settings/help panels, pause, game over, autosave/continue, procedural audio + music, 3 quality tiers + adaptive downgrade,
touch controls (joystick, pinch zoom).

## ⚠️ Honest caveats (read before assuming things are polished)
1. **The visuals were never seen in a real GPU browser during session 1** (sandbox had no GPU/Chromium libs). Code paths were verified headlessly with a stub
   renderer; shaders (water), lighting intensities, camera framings in the cinematic, and overall look are **unverified by eye**.
   First task next session: open the game, eyeball every screen, and tune (see HANDOVER → "First 30 minutes").
2. Cinematic coordinates are derived from `riverCenter/riverHalfWidth` at runtime; if the world shape changes, re-check `Cinematic` anchors (`W`, `chloeHide`, `bKeys`…).
3. Audio is purely synthesized — functional but not "produced". Mixing levels untested by ear.
4. Mobile: layout and joystick are implemented but untested on real devices.

## Key decisions & rationale
* **Imperative Three.js core + tiny external store** instead of react-three-fiber: max perf control, no React re-render cost in the loop.
* **No physics engine**: 2D circle separation + hitscan is enough and far cheaper for 240 zombies.
* **Instanced zombies**: 7 draw calls for the horde; per-part pivots handled in `ZombieSwarm.put`.
* **Fixed slot positions** (`SLOT_PAIR_X`): upgrading the ship adds pads without moving existing buildings.
* **Hull is a rectangle** for gameplay (`ship.rect`) even though the bow is pointed (slight visual mismatch at the tip is accepted).
* **Water is walkable but slow** for both player (×0.62) and zombies (×0.55) — makes the river meaningful without pathfinding.
* **Light units**: three ≥ r155 physical lights → sun 3.6 / hemi 2.0. Night is intentionally bright-blue so the game stays readable.
* **Single-file build** (`vite-plugin-singlefile`) → `dist/index.html` is self-contained; Google Fonts link is the only external request (falls back gracefully).
* Save format v1 in `localStorage['rustrevenge.save.v1']`; settings in `rustrevenge.settings.v1`. Bump `v` if the schema changes.

## Gotchas discovered
* Siege zombies must be re-targeted to the ship if the treehouse falls, otherwise the night never ends (fixed; see `Game.damageTreehouse`).
* `Object3D.rotation.order` is `'YXZ'` for hero/NPC roots so pitch (fall/flip) is local after yaw.
* Instanced meshes need `frustumCulled = false` for the horde (matrices change every frame).
* `StaticBatch` requires geometries with the same attribute set (position/normal/uv) — all shared primitives satisfy this.
* Sound ids for firearms double as weapon ids (`audio.play(w.id)`).

## Tuning knobs (fast wins)
`config.ts`: wave size, zombie stats, costs, ship tiers, day length. `lighting.ts`: palette/intensity. `game.ts`: camera (`rig.pitch/dist`), quality thresholds.
`cinematic.ts`: all timings in seconds.
