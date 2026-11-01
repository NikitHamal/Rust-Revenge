# Handover — for the next session

You (the next agent) have **no memory** of session 1. Everything you need is in the repo. Read `AGENTS.md`, then this file, then `docs/CONTINUITY.md`.

## First 30 minutes (do this before adding features)
1. `npm install && npm run build && npx tsc --noEmit` — confirm green. Run `node tools/harness/build.mjs logic && node tools/harness/.out/logic.mjs` — expect `errors: 0`.
2. `npm run dev` and **look at the game in a real browser** (session 1 could not). Check, in order:
   - [ ] Menu scene (dusk orbit around the ship) – is it pretty? Title readable?
   - [ ] **Intro cinematic** (New Game, don't skip): hiding spots visible (pipes + faint bodies)? Camera framing OK at each beat? Do the kick / fall / chase read clearly? (`window.__game.cinematic.t = N` jumps in time.)
   - [ ] Day look: terrain colors, water shader (foam at shore, fresnel, sun glitter), tree/grass density, shadows. Tune `lighting.ts` + `terrain.ts` if too dark/bright.
   - [ ] Night look: bloom on lamps/turret flames/eyes, ship point lights, fog color.
   - [ ] Camera: default `rig.dist = 30`, `pitch = 0.95` — adjust if the playfield feels too close/far.
   - [ ] Build pads clickable? (raycast against `ship.hitboxes`). Panel positions on desktop & phone-sized viewport.
   - [ ] Performance on a mid laptop / phone: watch the FPS counter (`F`). Look at `Quality` tiers.
3. Fix whatever looks wrong **before** roadmap work. Log findings in `docs/CONTINUITY.md`.

## Suggested next priorities (details in ROADMAP.md)
1. Visual polish pass after eyeballing (see checklist above).
2. Audio mix pass; add UI sounds for panels; consider speech-synth voice lines for the cinematic (`speechSynthesis`).
3. More variety: zombie types (spitter, bloater), buildings (mortar, spotlight), random events.
4. Mobile QA & control tweaks.

## Ready-to-paste prompt for the next session
```
You are continuing development of "Rust & Revenge", a Three.js zombie-survival/base-building game (React + Vite + Tailwind, TypeScript strict).
The repo contains AGENTS.md, docs/HANDOVER.md, docs/CONTINUITY.md, docs/ARCHITECTURE.md, docs/GAME_DESIGN.md, docs/ROADMAP.md, docs/TESTING.md — read them first (AGENTS.md → HANDOVER.md → CONTINUITY.md).
Session 1 built the full game but never saw it on a real GPU. Your job this session: <PUT YOUR TASK HERE, e.g. "run the First-30-minutes visual QA checklist and fix every visual/UX issue you can find, then implement the top 3 ROADMAP items">.
Rules: keep `npx tsc --noEmit` clean, `npm run build` passing, run the headless harness (tools/harness) after gameplay changes, keep zombies instanced, put balance numbers in config.ts, and update docs/CONTINUITY.md + ROADMAP.md before finishing.
```

## Project facts to remember
* Entry: `src/App.tsx` → `new Game(container)`. Debug handle `window.__game`.
* Output: `dist/index.html` (single file).
* No external assets; everything is procedural.
* Known-unknowns are listed in `CONTINUITY.md` ("Honest caveats").
