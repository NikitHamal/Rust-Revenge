# Architecture

## Layers
```
React (App.tsx, ui/*)  ──useUI()──►  store.ts  ◄──setUI()──  Game (game.ts)
        │  G().action()                                         │
        └──────────────────────────────────────────────────────►│  owns: renderer, scene, camera, composer
                                                                 │  Lighting, Props, Ship, ZombieManager, Player,
                                                                 │  Cinematic, Input, fx{Particles,Tracers,Shockwaves}
```
`Game` is created once in `App`'s effect (`new Game(div)`), exposes itself as `gameRef.current` and `window.__game`.

## Frame loop (`Game.frame` → `update`)
1. `dt = min(0.05, real dt)`; water time, **lighting** (smooth day/night level `L`), props (crates bob, tree shake), **ship** (bob, lamps, buildings/turrets), fx.
2. `screen === 'intro'` → `Cinematic.update` only.
3. `running` (playing) → `simulate`: tips, phase clock (day/night), `Player.update`, `ZombieManager.update`, popups.
4. NPCs (Chloe/Karen) pose + taunt timer, camera rig, DOM overlay (floating text, speech bubbles), minimap (8 Hz), UI sync (10 Hz).
5. Render: `EffectComposer` (High: RenderPass → UnrealBloom → OutputPass, MSAA 4× HalfFloat RT) or direct render.
6. FPS monitor → adaptive quality downgrade after 4 consecutive seconds < 36 FPS.

Screens (`Game.screen` / store `screen`): `menu → intro → playing ⇄ paused → ended(gameover|victory→ending)`.

## Run state (`Game.run`)
Plain object (`Run` in game.ts): resources, hull, ship level, night, phase/timer, weapons, upgrades, buildings (12 slots), respect, siege state. Serialized by `save()` at every dawn.

## Day / night
`startDay` (respawn crates, regrow trees, spawn roamers, heal, save) → timer → `startNight` (`ZombieManager.beginNight` builds the spawn queue, optional treehouse siege) → spawn ticks (packs of 1-3 at map edges) → night ends when queue empty & all dead (fallback after 150 s with ≤2 left) → `endNight` (rewards, siege result, victory check on night 10) → next day.

## Zombies (`zombies.ts`)
* Plain data objects in `list`; rendered by `ZombieSwarm` (7 `InstancedMesh`: torso, head, 2 arms, 2 legs, eyes) — matrices/colors rewritten each frame.
* AI: wander (day roamers) / hunt. Target priority: player if within aggro → treehouse (siege zombies) → nearest point on the ship's hull rectangle. Attack when within reach: hull / player / treehouse damage.
* Water slows (×0.55). Separation via a spatial hash (`CELL = 1.6`, linked-list in typed arrays). Hull rectangle pushes zombies out.
* Combat helpers: `nearest`, `nearestExcluding`, `each`, `raycast` (hitscan), `damage`, `kill` → `Game.onZombieKilled`.

## Ship (`ship.ts`)
`Ship.rebuildHull()` regenerates hull (Extrude of a bow-shaped `Shape`) + decorations (merged `StaticBatch`) per level 1-5 (rust → luxury). Slot positions are **fixed** (`SLOT_PAIR_X`, `SLOT_Z`) so buildings never move on upgrade; slots unlock 2 per level. Buildings are meshes built by `makeBuildingMesh(type, level)`; `Ship.update` runs turret (gun / flame / tesla chain) and eco (press, sawmill, repair) logic.

## Rendering notes
* Terrain: 240×192 plane with analytic height (`config.terrainHeight`) + baked vertex colors. River = `riverCenter/riverHalfWidth`.
* Water: `ShaderMaterial` (transparent, no depth write). Samples a 320×256 depth texture baked from `terrainHeight` (foam at the shore, deeper = more opaque). Fog is applied manually (`uFogNear/Far`). Uniforms are driven by `Lighting.apply`.
* Lighting: one shadow-casting directional (sun/moon) that follows the camera target, hemisphere fill, 2 ship point lights at night. Physically-based units (sun ≈ 3.6, hemi ≈ 2).
* Quality tiers: Low (no shadows, DPR 1, coarser terrain), Medium (1024 shadows, DPR ≤ 1.5), High (2048 shadows, DPR ≤ 2, bloom, MSAA).

## Audio
`audio.ts` synthesises everything with WebAudio (oscillators + noise). `audio.init()` is called from a user gesture (`Game.unlockAudio`). Per-sound minimum gaps prevent spam. Music = drone pad + generative pentatonic plucks (day) / heartbeat + stabs (night).

## Adding content — quick recipes
* **New building**: add to `BuildingType`/`BUILDINGS` + stats in `config.ts`; mesh in `makeBuildingMesh`; behaviour in `Ship.update/turret/eco`; it appears in the UI automatically via `BUILDING_ORDER`.
* **New zombie type**: add to `ZType`/`ZDEFS`; choose it in `ZombieManager.beginNight`; scale/color handled by `spawn`. Special behaviours go in `ZombieManager.update`.
* **New weapon**: append to `WEAPONS`; give it a model in `characters.setWeaponModel` and a sound key in `audio.ts` (id must match a `SoundName`, or change the `play` call in `Player.fire`).
* **Story beats**: `config.TAUNTS`, `NIGHT_CRIES`, `cinematic.lines`.

## Session 2 additions
```
Lighting ──> Sky dome (sky.ts) ──PMREM──> scene.environment (IBL)
shading.ts FX uniforms {time, cloud, wind, wet} ──> patchSurface / patchWind (onBeforeCompile)
WorldEvents (worldfx.ts) ──> light.bloodT / light.stormT, Rain, SupplyDrop, thunder, lootMul/speedMul/countMul
ZombieManager ──> Projectiles.spit() (acid) , Decals.add(), explode() (bloater)
Composer (High): Render → Bloom → Output → Grade(post.ts)
```
