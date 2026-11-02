# Visual QA without a GPU (how session 2 "saw" the game)

The sandbox has no GPU and no root, but Chromium + SwiftShader (software WebGL) works:

```bash
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright && npx playwright install chromium-headless-shell
# Chromium needs a few system libs and we have no root: download the .debs from deb.debian.org and `dpkg -x` them into /tmp/libs
#   libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libdbus-1-3 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1
#   libxkbcommon0 libasound2 libatspi2.0-0 libxi6 (+ deps)  -> export LD_LIBRARY_PATH=/tmp/libs/usr/lib/x86_64-linux-gnu:/tmp/libs/lib/x86_64-linux-gnu
cp tools/shots/shot.mjs tools/shots/run.sh /tmp/pw/ && chmod +x /tmp/pw/run.sh
npm run build   # shot.mjs loads dist/index.html via file://
/tmp/pw/run.sh '[{"js":"window.__game.newGame(false)","wait":3000,"shot":"day"}]'   # saves to .shots/day.png (git-ignored)
```
Tips: software rendering is *slow* (several s/frame at High). Run in background (`nohup … &`) and poll; use
`window.__game.applyQuality('medium')` (no composer) for quick looks, High only for final grade/bloom checks.
Useful jumps: `__game.cinematic.t = 21`, `__game.light.L = 0` (night), `__game.zm.spawn('spitter', x, z, 1, 0, true)`,
`__game.rig.distT = 8` (close-up), `__game.events.drop.spawn()`, `__game.light.stormT = 1`, `__game.light.bloodT = 1`.
Emoji don't render in this sandbox (no emoji font) — they show as boxes in screenshots only.
