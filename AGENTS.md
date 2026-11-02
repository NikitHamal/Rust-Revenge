# AGENTS.md — orientation for AI agents & new sessions

Project: **Rust & Revenge** — Three.js zombie-survival / base-builder (React + Vite + Tailwind v4, TypeScript strict).
Read this file first, then `docs/HANDOVER.md` → `docs/CONTINUITY.md`.

## Commands
```bash
npm run dev                 # dev server
npm run build               # MUST succeed; output = dist/index.html (vite-plugin-singlefile)
npx tsc --noEmit            # strict type-check (noUnusedLocals/Parameters are ON — keep it clean)
node tools/harness/build.mjs logic && node tools/harness/.out/logic.mjs      # headless full-run test
node tools/harness/build.mjs balance && node tools/harness/.out/balance.mjs  # idle-player balance probe
```
Never edit `package.json` / `vite.config.ts` by hand; use `npm install <pkg>`.
A debug handle exists in the browser: `window.__game` (e.g. `__game.run.scrap = 9999`, `__game.cinematic.t = 20`, `__game.applyQuality('low')`).

## Where things live
```
src/App.tsx                 React shell: mounts <Game>, switches screens
src/ui/*                    Hud, Panels (build/ship/workshop/settings/help), Screens (menu/pause/gameover/victory/ending), Joystick
src/game/config.ts          ALL balance data + world maths (river, terrainHeight, ships, buildings, weapons, zombies, dialogue)
src/game/game.ts            Orchestrator: renderer, loop, run state, phases (day/night), actions called by UI, camera rig, save/load, overlay DOM
src/game/zombies.ts         ZombieManager: spawn, waves, AI, spatial hash, hitscan helpers, damage/kill
src/game/player.ts          Bruno: movement, auto-fire, melee, slam, chopping, crate pickup
src/game/ship.ts            Ship hull per level, deck slots, building meshes + turret/eco logic
src/game/cinematic.ts       The scripted intro (timeline in seconds; edit `lines`, `bKeys`, `cKeys`, `kKeys`, `camera()`)
src/game/characters.ts      loft() anatomical meshes, jointed Humanoid rig (elbows/knees, poses), held weapons, instanced ZombieSwarm (12 parts, variants)
src/game/props.ts           Forest/rocks/grass/reeds, wrecks, treehouse, choppable trees, loot crates
src/game/terrain.ts         Terrain mesh, water shader, depth texture, minimap base
src/game/lighting.ts        Day/night/blood-moon/storm palette, sky-driven IBL (PMREM), shadow light, lightning
src/game/sky.ts             Procedural atmosphere dome shader (gradient, sun/moon, clouds, stars) — also the IBL source
src/game/shading.ts         onBeforeCompile patches: world-space grime/bump/roughness/cloud-shadow (patchSurface) + wind sway (patchWind); FX uniforms
src/game/textures.ts        ALL procedural canvas textures (rust, planks, bark, foliage cards, grass, skin, faces, fabric, decals)
src/game/post.ts            Final grade pass (vignette, CA, grain, split-tone, hurt flash, blood-moon tint)
src/game/worldfx.ts         Decals, acid Projectiles, GPU Rain, SupplyDrop, WorldEvents director (blood moon / storm / drops)
src/game/effects.ts         Particles / Tracers / Shockwaves (pooled)
src/game/audio.ts           Procedural WebAudio SFX + generative music
src/game/store.ts           Tiny external store (React <-> game) + settings persistence
src/game/input.ts           Keyboard / pointer / joystick, camera-relative movement
src/game/utils.ts           StaticBatch (merge), procedural canvas textures, shared geometries/materials
tools/harness/*             Headless Node test harness (stub renderer)
```

## Conventions (important)
* **World axes**: X = along the river (west −, east +), Z = across (north +), Y up. Ship at origin, long axis = X, bow = +X.
  `DECK_Y = 1`. Water level `y = 0`. Forward of a rotated entity = `(sin yaw, cos yaw)`.
* **Game ↔ UI**: game is imperative; React only reads via `useUI(selector)` (store) and calls `G().method()` (see `ui/gameRef.ts`).
  Game pushes state with `setUI` (throttled to 10 Hz in `syncUI`). Selectors must return stable values (primitives / same array refs).
* **Balance changes go in `config.ts`** only. Don't scatter magic numbers.
* **Hot loops must not allocate** (zombie update, particles, tracers). Reuse temp vectors.
* New meshes: share geometry/materials (`G.*`, `stdMat`) and prefer `StaticBatch` / `InstancedMesh`.
* Circular type imports (`import type { Game }`) are intentional; keep them type-only.
* Colors for emissive/bloom use values > 1 (`new Color(3, 2, 1)`) with `toneMapped:false` where needed.
* Keep zombies instanced — do not add per-zombie `Mesh` objects.

## Definition of done for any change
1. `npx tsc --noEmit` clean · 2. `npm run build` OK · 3. `node tools/harness/...logic` prints `errors: 0` · 4. update `docs/CONTINUITY.md` (+ ROADMAP checkboxes).

## Visual pipeline rules (session 2)
* Everything is procedural — **no asset files**. Textures live in `textures.ts` (cached; clone before changing `repeat`).
* Give static materials world-space detail with `patchSurface(mat, opts)`; `stdMat()` already does. Call `patchWind` *after* `patchSurface`.
* **Never** `patchSurface` characters/zombies (world-space noise would swim as they move) — they use UV textures + `bumpMap`.
* Foliage = alpha-tested cards (`alphaTest`, `DoubleSide`) with hand-set normals (radial/up) for soft volumetric light.
* Lighting is IBL (sky dome → PMREM, re-baked only when sky changes >0.06) + sun + weak hemisphere. Don't crank hemi; tune `Lighting` palettes.
* Post chain (High tier): RenderPass → UnrealBloom → OutputPass(tonemap) → Grade (sRGB). Grade works in display space.
* Headless GPU-less visual QA is possible: see `docs/VISUAL_QA.md` (Playwright + SwiftShader). Use `applyQuality('medium')` for speed.
