# Roadmap / backlog

Legend: ✅ done · ⬜ todo · 🔍 needs eyes-on verification

## Shipped in session 1
- ✅ Scripted intro cinematic (hide in river → syringe → chase → treehouse betrayal → swim to wreck → title)
- ✅ Day/night loop, 10-night campaign, endless mode, boss nights 5 & 10, treehouse sieges (4/7/10)
- ✅ 5 ship tiers (rust → luxury), 12 build pads, 6 buildings × 3 levels
- ✅ 5 weapons, training, Belly Flop slam, chopping, crates
- ✅ Instanced zombies, pooled FX, merged static meshes, water shader, bloom, adaptive quality
- ✅ HUD, minimap, panels, pause, game over, victory + 2 endings, autosave
- ✅ Procedural audio & music, touch controls
- ✅ Headless logic harness + docs

## Shipped in session 2
- ✅ Realism overhaul: sky + IBL, PBR procedural textures, world-space surface detail, wind, cloud shadows, wet surfaces
- ✅ New terrain/water/vegetation/rocks, anatomical characters & faces, richer instanced horde, bloom + cinematic grade
- ✅ Spitter & Bloater zombies, Blood Moon, thunderstorms/rain, supply drops, dash, decals, minimap drop marker
- ✅ Visual QA workflow (`docs/VISUAL_QA.md`)

## P0 — verify & polish (🔍 everything visual)
- ⬜ 🔍 Real-GPU pass: tune bloom/IBL/exposure at dusk & night, shadow cost of foliage cards, mobile perf tiers
- ⬜ 🔍 Zombie close-up polish (spitter/bloater silhouettes, acid glow), cinematic character framing with the new models
- ⬜ Mobile dash button; audio polish for thunder/spit/splat
- ⬜ 🔍 Eyeball all screens; tune light/fog/water/camera; fix any z-fighting, floating objects, clipping
- ⬜ 🔍 Cinematic QA: framing per beat, character poses (kick, fall, panic), zombie chase readability, subtitle timing
- ⬜ 🔍 Mobile QA (joystick placement, panel sizes, pinch zoom, performance tier)
- ⬜ Audio mix pass (levels, night/day music crossfade, UI click sounds on panels)

## P1 — gameplay depth
- ✅ Zombie types: Spitter, Bloater · ⬜ Swimmer (ignores water slow), Crawler, Screamer (calls horde)
- ⬜ Buildings: Mortar (AoE, long range), Spotlight (slows/aggro), Walls/net to block gangplanks, Hot-tub heal pad (luxury only)
- ✅ Supply drop, blood moon · ⬜ survivor to rescue, fog night, fireflies/ash weather
- ⬜ Hero visuals reflect upgrades (armor, hat, shades at luxury tier); Bruno gets slimmer? (opt-in joke)
- ⬜ Treehouse sub-quest: escort Chloe/Karen aboard instead of binary ending; use `respect` to unlock a third ending
- ⬜ Achievements + stats screen; difficulty selector

## P2 — presentation
- ⬜ Real shadow-friendly LODs for far trees; terrain normal/detail texture
- ⬜ Ship damage states (smoke, fire, flooding visuals at low hull) · ⬜ wake/foam trail behind hull · ⬜ SSAO/GTAO on High (needs sky/water exclusion)
- ✅ Rain + lightning · ⬜ fog banks / volumetric god-rays
- ⬜ Cinematic voice via `speechSynthesis`, screen shake/slow-mo on stab & kick, richer camera work
- ⬜ Outro cinematic for each ending (3D, not just text)
- ⬜ Settings: key rebinding, camera sensitivity, colour-blind palette

## P3 — technical
- ⬜ Move zombie simulation to a Web Worker / SoA typed arrays for 1000+ zombies
- ⬜ Frame-time based dynamic resolution scaling (instead of tier drop)
- ⬜ Unit tests for config maths and wave generation (vitest)
- ⬜ Code-split three.js postprocessing (only load when High)
