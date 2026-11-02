import { chromium } from 'playwright';
const url = 'file:///home/user/sandbox/dist/index.html';
const steps = JSON.parse(process.argv[2] || '[]'); // [{js:"...", wait:ms, shot:"name"}]
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.on('console', m => { const t = m.text(); if (m.type()==='error'||m.type()==='warning') console.log('[console]', t.slice(0,300)); });
p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,400)));
await p.goto(url);
await p.waitForTimeout(3000);
for (const s of steps) {
  if (s.click) { try { await p.getByText(s.click, {exact:false}).first().click({timeout:3000}); } catch(e){ console.log('click fail', s.click);} }
  if (s.js) { try { const r = await p.evaluate(s.js); if (r!==undefined) console.log('js->', JSON.stringify(r)); } catch(e){ console.log('js err', e.message.slice(0,200)); } }
  if (s.wait) await p.waitForTimeout(s.wait);
  if (s.shot) await p.screenshot({ timeout: 170000, path: `/home/user/sandbox/.shots/${s.shot}.png` });
}
await b.close();
