# Continuity log

_Last updated: end of session 2 (realism overhaul + new mechanics)._

## State of the project
Session 1 shipped the feature-complete low-poly game. **Session 2 rebuilt the entire look and added new gameplay layers.**
Everything compiles (`tsc` strict clean), builds, and the headless logic harness plays intro → 10 nights (incl. blood moons, spitters, bloaters,
sieges, bosses) → victory → both endings → endless → save/load with **0 exceptions**. Session 2 also *looked at the game* (SwiftShader screenshots, see `VISUAL_QA.md`).

### Session 2 – what changed
**Rendering / look**
* Procedural **sky dome** (gradient, sun/moon, drifting clouds, stars) + **image-based lighting** baked from it (PMREM) → real PBR reflections on metal/water/skin.
* `shading.ts`: world-space **grime / micro-bump / roughness / cloud shadows / wetness** injected into every static material; **wind sway** for grass, foliage, reeds.
* `textures.ts`: rust plates w/ rivets & streaks, weathered planks, bark, needle & leaf cards, grass blades, skin, faces, fabrics (knit/denim/torn), ground decals.
* **Terrain**: 400×320 mesh, richer palette (lush/dry grass, loam, wet sand, mud), cloud shadows, detail bump.
* **Water**: layered waves + noise ripples, sky/cloud reflection, caustics in shallows, shoreline foam, sun glitter, rain rings.
* **Vegetation**: card-based conifers (drooping layered branches), broadleaf (green/autumn), dead trees, 9k wind-animated grass patches, displaced boulders, cattails.
* **Characters**: `loft()` anatomical bodies (fat Bruno with belly/jowls, Chloe, Karen), painted faces, hair meshes, glasses/jewelry, jointed elbows & knees, hands with fingers,
  better weapon models. **Zombie horde**: 12 instanced parts per zombie (torn-cloth/skin textures, faces, bent knees/elbows), per-type body shapes.
* **Post**: bloom + final grade (vignette, chromatic aberration, split-tone, grain, hurt flash, blood-moon tint).
* Ship: rust/paint/plank PBR with bump, treehouse rebuilt with leaf-card canopy.

**Gameplay**
* New zombies: **Spitter** (hunched, glowing throat, stays ~8 m away and lobs acid at hull/player/treehouse; range shrinks late in a night) and **Bloater** (swollen, explodes on death/contact: AoE to player + hull).
* **Blood Moon** nights (3, 6, 9, 10): +35% horde, +10% speed, +60% scrap loot, red sky/tint. **Thunderstorm** nights (2, 5, 8 + random): GPU rain, lightning, thunder, wet surfaces. Random **drizzle** days.
* **Supply drops** (days ≥2, 70%): parachuting crate + beam, big loot + medkit; minimap marker.
* **Dash** (SHIFT, 2.4 s cd, i-frames). Blood/acid **decals**. Night can end with ≤6 stragglers after 260 s (prevents stalls).

## ⚠️ Honest caveats
1. Verified visually only through software WebGL at 960×540 (menu, day, night, cinematic frames, close-ups). **Not verified on a real GPU**: performance numbers, bloom strength, exact IBL brightness at dusk.
2. Zombie horde close-ups were only briefly eyeballed; spitter/bloater silhouettes & the acid-sac glow deserve a tuning pass.
3. Foliage cards cast alpha-tested shadows — if GPU time is tight on mid devices, set `castShadow=false` on `pineCardsGeo` meshes in `props.ts` (Medium/Low tiers) first.
4. Audio is still synthesized; new sounds (`thunder`, `spit`, `splat`) are rough.
5. Mobile: no on-screen dash button yet (SHIFT only).

## Key decisions & rationale
* Still **no asset files** — all textures/geometry procedural, single-file build (~1 MB).
* Realism through *lighting + materials + silhouette*, not polycount: camera is ~26 m away, so IBL, shadows, wetness, wind and proportions matter most.
* Characters use lofted rings (not skinned meshes) so the horde can stay **instanced** (12 draw calls) with hierarchical per-part matrices.
* `patchSurface` uses world-space noise → only for static meshes. Characters use UV maps.
* Env map re-bake is throttled (`envKey` delta 0.06) to avoid per-frame PMREM cost.
* Save format unchanged (v1). Events are deterministic by night number, so nothing new needs saving.

## Gotchas discovered
* `metalnessFactor` is not defined yet in the `roughnessmap_fragment` chunk — use the `metalness` uniform in patches.
* `PCFSoftShadowMap` was removed in three r18x (warning) → use `PCFShadowMap`.
* Headless harness canvas stub must return chainable objects (`createRadialGradient().addColorStop`) — fixed in `tools/harness/build.mjs`.
* Original gotchas from session 1 still apply (siege retarget, `rotation.order = 'YXZ'`, `frustumCulled=false` on instanced swarm, StaticBatch attribute sets).

## Tuning knobs (fast wins)
`config.ts` (waves, zombie stats incl. spitter/bloater), `lighting.ts` (palettes, `env` per phase), `worldfx.ts` (`BLOOD_MOON_NIGHTS`, `STORM_NIGHTS`, loot/speed/count multipliers),
`post.ts` (grade defaults), `props.ts` (`target` tree count, grass `gN`), `terrain.ts` (colour palette, water shader), `game.ts` (`rig.dist/pitch`).
