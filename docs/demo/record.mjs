// record.mjs: records the README's animated walk-through of Sim Study, with Orange
// explaining each department in a caption, after the captioned demo in Jeremy
// Wildfire's R/Pharma 2026 keynote.
//
//   node docs/demo/record.mjs
//
// It serves this folder's copy of the page, plays the pilot study with a real
// mouse, and takes screenshots as it goes. Nothing in the page is changed. Three
// things are drawn over it by this script: a cursor, a ring round the part a
// caption is about, and the caption itself beside an Orange sticker. ffmpeg
// lays the screenshots on a steady clock and writes docs/sim-study-demo.gif.
//
// Needs: playwright-core (PLAYWRIGHT_FROM), a Chromium (CHROME), ffmpeg, and the
// Orange stickers from the keynote's assets (ORANGE_DIR). Paths are below.

import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { createServer } from 'http';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const PLAYWRIGHT_FROM = process.env.PLAYWRIGHT_FROM || ROOT + '/';
const CHROME = process.env.CHROME || '';
const ORANGE_DIR = process.env.ORANGE_DIR || path.resolve(ROOT, '../Documents/obot2/jwildfire.github.io/keynote/assets/hex');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const OUT = path.join(ROOT, 'docs/sim-study-demo.gif');
const WINDOW = { width: 1200, height: 675 };
const GIF = { width: 900, fps: 8, colors: 144 };
const CAPTURE = path.join(os.tmpdir(), 'sim-study-demo-capture');

const require = createRequire(PLAYWRIGHT_FROM);
const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const sticker = (name) => 'data:image/png;base64,' + readFileSync(path.join(ORANGE_DIR, name)).toString('base64');
const STICKERS = { hello: sticker('orange.png'), look: sticker('orange-inspector.png'), ask: sticker('orange-question.png'), hack: sticker('orange-hacker.png'), yes: sticker('orange-thumbs-up.png') };

// ---- this folder, served ------------------------------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.gz': 'application/gzip' };
const server = createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/index.html#about=off`;

// ---- what is drawn over the page ------------------------------------------------
const OVERLAY = (stickers) => {
  const add = (tag, css, html) => { const el = document.createElement(tag); el.style.cssText = css; if (html) el.innerHTML = html; document.documentElement.appendChild(el); return el; };
  const link = document.createElement('link'); link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=IBM+Plex+Mono:wght@500&display=swap'; document.head.appendChild(link);
  const cursor = add('div', 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-200px,-200px)',
    '<svg width="24" height="31" viewBox="0 0 20 26" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))"><path d="M1 1 L1 19.5 L5.8 15.2 L9.2 23 L12.6 21.5 L9.3 13.9 L15.8 13.9 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>');
  window.addEventListener('mousemove', (e) => { cursor.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
  const style = document.createElement('style');
  style.textContent = '@keyframes demo-ring{from{transform:translate(-50%,-50%) scale(.3);opacity:.9}to{transform:translate(-50%,-50%) scale(1);opacity:0}}' +
    '.demo-ring{position:fixed;z-index:2147483646;pointer-events:none;width:46px;height:46px;border-radius:50%;border:4px solid #d0661f;background:rgba(208,102,31,.2);animation:demo-ring .55s ease-out forwards}';
  document.head.appendChild(style);
  window.addEventListener('mousedown', (e) => { const r = document.createElement('div'); r.className = 'demo-ring'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
  const mark = add('div', 'position:fixed;z-index:2147483640;pointer-events:none;border:3px solid #d0661f;border-radius:10px;box-shadow:0 0 0 3px rgba(255,255,255,.75);display:none;transition:all .25s');
  const cap = add('div', 'position:fixed;z-index:2147483645;pointer-events:none;display:none;align-items:center;gap:0');
  cap.innerHTML = '<div style="position:relative;background:#fff6ea;border:3px solid #d0661f;border-radius:14px;padding:9px 18px 11px;box-shadow:0 6px 18px rgba(0,0,0,.35);max-width:430px">' +
    '<div id="demo-kick" style="font:500 12.5px/1.3 \'IBM Plex Mono\',ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#7a4a1e"></div>' +
    '<div id="demo-line" style="font:400 31px/1.08 \'Instrument Serif\',Georgia,serif;color:#1c1a17;margin-top:2px"></div>' +
    '<i style="position:absolute;right:-11px;top:50%;width:18px;height:18px;margin-top:-9px;background:#fff6ea;border-right:3px solid #d0661f;border-top:3px solid #d0661f;transform:rotate(45deg)"></i></div>' +
    '<img id="demo-cat" style="width:104px;height:auto;margin-left:14px;filter:drop-shadow(0 5px 8px rgba(0,0,0,.4))">';
  window.__demo = {
    say(kick, line, cat) {
      if (!kick) { cap.style.display = 'none'; return; }
      const side = document.getElementById('side').getBoundingClientRect(), news = document.getElementById('news').closest('section,div,footer').getBoundingClientRect();
      document.getElementById('demo-kick').textContent = kick; document.getElementById('demo-line').innerHTML = line; document.getElementById('demo-cat').src = stickers[cat];
      cap.style.display = 'flex'; cap.style.right = window.innerWidth - side.left + 18 + 'px'; cap.style.bottom = window.innerHeight - news.top + 62 + 'px';
    },
    mark(sel, pad) {
      const el = sel && document.querySelector(sel); if (!el) { mark.style.display = 'none'; return; }
      const r = el.getBoundingClientRect(), p = pad === undefined ? 5 : pad, clip = document.getElementById('panel').getBoundingClientRect(), inPanel = document.getElementById('panel').contains(el);
      const top = Math.max(r.top - p, inPanel ? clip.top + 2 : 0), bottom = Math.min(r.bottom + p, inPanel ? clip.bottom - 2 : window.innerHeight);
      mark.style.display = 'block'; mark.style.left = r.left - p + 'px'; mark.style.top = top + 'px'; mark.style.width = r.width + 2 * p - 6 + 'px'; mark.style.height = Math.max(0, bottom - top - 6) + 'px';
    },
  };
};

// ---- the run ------------------------------------------------------------------------
rmSync(CAPTURE, { recursive: true, force: true }); mkdirSync(CAPTURE, { recursive: true });
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await (await browser.newContext({ viewport: WINDOW, deviceScaleFactor: 1 })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL_);
await page.waitForFunction(() => window.__sim && window.__sim.S && window.__sim.S.kind === 'built', null, { timeout: 30000 });
await page.evaluate(OVERLAY, STICKERS);
await page.evaluate(() => document.fonts.ready); await sleep(800);

let at = { x: 600, y: 360 };
await page.mouse.move(at.x, at.y);
const moveTo = async (sel, ms = 650) => { const b = await page.locator(sel).first().boundingBox(); const to = { x: b.x + b.width / 2, y: b.y + b.height / 2 }, from = at, n = Math.round(ms / 25);
  for (let i = 1; i <= n; i++) { const k = ease(i / n); await page.mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k); await sleep(25); } at = to; };
const press = async (sel) => { await moveTo(sel); await page.mouse.down(); await sleep(70); await page.mouse.up(); await sleep(250); };
const say = (kick, line, cat) => page.evaluate(([k, l, c]) => window.__demo.say(k, l, c), [kick, line, cat]);
const mark = (sel, pad) => page.evaluate(([s, p]) => window.__demo.mark(s, p), [sel || null, pad]);
const day = () => page.evaluate(() => window.__sim.S.day);
const untilDay = async (d) => { while ((await day()) < d) await sleep(120); };

// screenshots, one after another, each with the time it was taken
const shots = []; let going = true;
const camera = (async () => { let i = 0; while (going) { const t = Date.now(), file = path.join(CAPTURE, `f${String(i++).padStart(5, '0')}.png`); writeFileSync(file, await page.screenshot({ type: 'png' })); shots.push({ t, file }); } })();

await say('Sim Study', 'A clinical trial on a clock. I’ll show you round.', 'hello'); await sleep(3000);
await say('Press play', 'Sites open, and vans carry each day’s data to the hub.', 'hack');
await press('#play'); await untilDay(30);
await press('#tab-today'); await mark('#panel table'); await say('Data hub', 'Every day’s raw data cut, table by table.', 'hack'); await untilDay(56);
await press('#tab-over'); await page.evaluate(() => { document.getElementById('panel').scrollTop = 150; }); await sleep(300); await mark('table.metrics');
await say('HQ', 'The counts move with the clock, week by week.', 'look'); await untilDay(88);
await press('#tab-week'); await page.evaluate(() => { const t = document.querySelector('table.kri'); if (t) document.getElementById('panel').scrollTop = t.offsetTop - 60; }); await sleep(300); await mark('table.kri');
await say('Monitoring', 'gsm reviews every site, every month. Red roofs need a look.', 'look'); await untilDay(124);
await press('#tab-safety'); await mark('#panel .blind'); await say('Safety', 'Adverse events as they arrive. Blinded until lock.', 'ask'); await untilDay(152);
await press('#tab-sub'); await mark(null); await say('Regulatory', 'What a submission needs, and what isn’t built yet.', 'ask'); await untilDay(184);
await mark(null); await say('Database lock', 'Last data in. Lock, unblind, analyse.', 'hack');
await page.waitForFunction(() => window.__sim.S.done, null, { timeout: 60000 }); await sleep(600);
await mark('#panel .csr table'); await say('Statistics', 'Results by arm, from the study’s own analysis tables.', 'yes'); await sleep(3600);
await mark(null); await say('Every row is synthetic', 'Built from open blocks: gsm.datasim, study.builder, gsm, safety.viz.', 'hello'); await sleep(3600);
going = false; await camera;
await browser.close(); server.close();
if (errors.length) console.error('Page errors:', errors);

// ---- the screenshots, on a steady clock, as a gif -------------------------------------
const list = shots.map((s, i) => `file '${s.file}'\nduration ${(((shots[i + 1] || { t: s.t + 125 }).t - s.t) / 1000).toFixed(3)}`).join('\n') + `\nfile '${shots[shots.length - 1].file}'\n`;
writeFileSync(path.join(CAPTURE, 'list.txt'), list);
const filters = `fps=${GIF.fps},scale=${GIF.width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${GIF.colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(CAPTURE, 'list.txt'), '-filter_complex', filters, '-loop', '0', OUT]);
const seconds = (shots[shots.length - 1].t - shots[0].t) / 1000;
console.log(`${OUT}: ${(statSync(OUT).size / 1e6).toFixed(1)} MB, ${seconds.toFixed(1)} s, ${shots.length} screenshots (${(shots.length / seconds).toFixed(1)} a second)`);
rmSync(CAPTURE, { recursive: true, force: true });
