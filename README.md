# 🚢🧟 RUST & REVENGE

> *Dumped for being fat. Left to the zombies. Now he's building the greatest ship the apocalypse has ever seen.*

A 3D, top-down / isometric zombie-apocalypse survival & base-building game built with **React + Vite + Tailwind + Three.js**.
Inspired by the infamous AI "rage-bait" reel: three survivors hide underwater breathing through pipes, a mother stabs her
daughter's fat boyfriend to lure the horde away, they abandon him at their treehouse… and he turns a rusty wreck in the middle
of the river into a luxury fortress. **This game is that revenge arc.**

## Play

| Input | Action |
|---|---|
| `WASD` / arrows | Move Bruno (camera-relative) |
| Click / tap ground | Walk there |
| Click a glowing **pad** on the deck | Build / upgrade / sell turrets & machines |
| *(automatic)* | Bruno auto-aims at the nearest zombie |
| `SPACE` | **Belly Flop** slam (AoE damage + knockback + slow) |
| Stand next to orange trees | Chop wood |
| Run through glowing crates | Scrap / wood / medkits |
| `Q` `E` / wheel / right-drag / pinch | Rotate & zoom the camera |
| `1`-`5` | Switch weapon · `B` ship · `V` workshop · `N` skip day · `P` pause · `M` mute · `F` FPS |

Touch devices get a virtual joystick and a big SLAM button automatically.

**Loop:** Day = scavenge, chop, build, refit the ship. Night = the horde swarms the hull. Survive **10 nights** while turning the
*Rusty Wreck* into a *Luxury Yacht* (5 ship tiers), then decide the fate of Karen & Chloe (mercy or revenge), and keep going in endless mode.
On nights 4 / 7 / 10 the **treehouse is besieged** — rescue your exes (or don't) for bonus loot & respect.

## Run

```bash
npm install
npm run dev      # development
npm run build    # production build -> dist/index.html (single self-contained file)
npx tsc --noEmit # type-check
node tools/harness/build.mjs logic && node tools/harness/.out/logic.mjs   # headless full-game logic test (no GPU)
```

## Tech & performance highlights

* **Three.js** with ACES tone-mapping, PCF-soft shadows following the player, optional **HDR bloom + MSAA** (High).
* **Instanced everything**: the zombie horde (240 max) is 7 draw calls; forest, rocks, grass, reeds, crates are `InstancedMesh`;
  ship decorations / treehouse / wrecks are merged per-material (`StaticBatch`); particles, tracers and shockwaves are pooled.
* Custom **water shader** (analytic waves, fresnel, sun glitter, shoreline foam driven by a baked depth texture, manual fog).
* **Spatial-hash** zombie separation (O(n)), zero per-frame allocation in hot loops, hitscan combat (no physics engine).
* **3 quality tiers** + **adaptive quality**: the game drops a tier automatically if FPS stays low.
* 100% **procedural**: no external art or audio assets — models, textures, music and SFX are generated in code.
* Auto-saves at every dawn (`localStorage`), settings persist.

## Documentation

* [`AGENTS.md`](AGENTS.md) — rules & orientation for AI agents / new sessions (**start here**)
* [`docs/HANDOVER.md`](docs/HANDOVER.md) — what to do first in the next session + ready-to-paste prompt
* [`docs/CONTINUITY.md`](docs/CONTINUITY.md) — current state, decisions, conventions, known issues
* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — modules, data flow, render pipeline
* [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) — story, systems, balance tables
* [`docs/ROADMAP.md`](docs/ROADMAP.md) — prioritised backlog
* [`docs/TESTING.md`](docs/TESTING.md) — headless harness + manual QA checklist
