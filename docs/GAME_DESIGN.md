# Game Design — Rust & Revenge

## Premise & story
Day 1 of the apocalypse. **Bruno** (fat, lovable, underestimated), his girlfriend **Chloe** and her mother **Karen** hide in a river breathing through pipes.
Karen stabs Bruno with a syringe so he surfaces and lures the zombies away. The women walk to their treehouse ("NO FATTIES ALLOWED"); Bruno arrives, begs to be let up
("I have a LEVEL 5 shelter! I'll upgrade it for you!"), gets kicked off the ladder and dumped by Chloe. *"Just… you WAIT!"* He swims out to a rusty wreck in the middle of the river.
The game is the rest of that story: turn the wreck into a luxury yacht while Karen & Chloe watch from the treehouse (and gradually change their tune).

Endings (after surviving night 10): **Mercy** (let them aboard) or **Revenge** ("Sorry, only room for fit people"). Endless mode continues afterwards.

## Core loop
Day (70 s, first day 100 s): scavenge crates, chop orange trees, build/upgrade, refit ship, buy weapons.
Night: waves from the map edges converge on the hull. Kill zombies → scrap/wood; clear the night → bonus + full heal + hull +20 % + autosave.

## Resources
* ⚙️ **Scrap** — buildings, weapons, training, ship refits. (zombie drops, crates, Scrap Press)
* 🪵 **Wood** — refits, hull repair (1 wood / 4 HP), some buildings. (trees, crates, Sawmill, brutes/boss)

## Ship tiers (`config.SHIP_LEVELS`)
| Lv | Name | Hull | Pads | Next cost (⚙️/🪵) |
|---|---|---|---|---|
| 1 | Rusty Wreck | 320 | 4 | 150 / 70 |
| 2 | Patched Barge | 650 | 6 | 340 / 170 |
| 3 | Armored Barge | 1100 | 8 | 700 / 380 |
| 4 | Floating Fortress | 1800 | 10 | 1300 / 700 |
| 5 | Luxury Yacht | 3000 | 12 | — (hot tub, palms, gold trim) |

## Buildings (levels 1-3, upgrade cost ×2.2 / ×4.5 of base; sell = 50 %)
| Building | Base cost | Role |
|---|---|---|
| Auto Turret | 60⚙️ | single-target hitscan, long range |
| Flamethrower | 120⚙️ 30🪵 | short-range cone DPS, 60 particle/s |
| Tesla Coil | 210⚙️ 55🪵 | chain lightning (4-6 targets, 15 % falloff) |
| Scrap Press | 100⚙️ 20🪵 | +1.2 / 2.6 / 4.5 scrap per second |
| Sawmill | 90⚙️ | +0.7 / 1.5 / 2.6 wood per second |
| Repair Bay | 95⚙️ 45🪵 | +2.5 / 5 / 9 hull per second |

## Bruno
Auto-aims; weapons: Spiked Bat (free, melee arc) → Rusty Pistol → Scrap SMG → Boom Stick (7 pellets) → Big Bertha (minigun).
Training (max level): Thick Skin 8 (+30 HP), Sprint Shoes 6 (+5 % speed), Anger Issues 10 (+12 % dmg), Belly Flop 6 (radius & damage).
**Belly Flop** (SPACE): 0.45 s jump, AoE damage + knockback + slow, cooldown 8 s (min 3.5 s with training). Death: 6 s respawn, lose 20 % scrap.

## Zombies (`config.ZDEFS`)
Walker (50 HP) · Runner (30 HP, 2.3× speed, from night 2) · Brute (270 HP, ×1.6, from night 3, heavy hull damage) · **Boss** (2600 HP, ×2.7, nights 5 & 10, 220 scrap).
HP scales +14 % per night, speed up to +25 %, damage up to +60 %. Wave size = `10 + 7n + 0.6n²` (cap 240 alive).
Day roamers wander and aggro the player at 12-15 m. Water slows zombies to 55 %.

## Treehouse sieges (nights 4, 7, 10)
8 + 2n zombies attack the treehouse (HP 520). Defend it to win +120+20n scrap and **respect** +1 (flavour for dialogue/ending).
If it falls, Karen & Chloe flee until next day and the siege zombies redirect to your ship.

## NPC reactions (`TAUNTS`)
Karen & Chloe taunt from the platform; lines depend on ship tier (mockery → grudging respect → begging at tier 5) and panic during sieges.

## Pacing targets
* Night 1-3: tutorial-ish; 1-2 turrets + auto-aim is enough.
* Night 4-6: first siege + boss at 5 → requires tier 2-3 ship and mixed turrets.
* Night 7-10: 100+ zombies, brutes, double boss at night 10 → needs tier 4-5, tesla/flame, upgraded weapon.
* Idle-player probe (`tools/harness/balance.ts`): 4 low-level guns survive to ~night 8-9.

## Session 2 design additions
* **Spitter** — 55 hp, ranged acid (hull 7 / player 9). Stops ~8.5 m from target; closer as the night drags on. Priority target for turrets/player.
* **Bloater** — 170 hp, slow, 1.7× wide. Explodes (R 5.2) on death or contact: 34 hull / 30 player. Kill at range.
* **Blood Moon** (nights 3/6/9/10): ×1.35 zombies, ×1.1 speed, ×1.6 scrap from kills.
* **Thunderstorm** (nights 2/5/8 + 18% random later): rain, lightning, wet surfaces, shorter fog.
* **Supply drop** (days ≥2, 70%): collect within 2.6 m → scrap 110+28n, wood 45+7n, +40% HP.
* **Dash** (SHIFT): 15 m/s for 0.2 s, 0.3 s i-frames, 2.4 s cooldown.
