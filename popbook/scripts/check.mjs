#!/usr/bin/env node
// node scripts/check.mjs book.html [--out shots/] [--page <id>]
//
// Opens the built book in headless Chrome and checks one page (the newest, or --page <id>) against the bar:
//   - the book starts and no page was skipped for errors (the engine's validator runs in the page)
//   - two things to play with besides the sky dial: one the reader taps, one they drag
//   - one living loop: something that moves on its own by day, measured from where each piece is at three instants
// and saves four shots (phone and desktop, day and night) plus card.png (phone day | night side by side).
// Look at the shots yourself, night first: glow, lamps and windows only show their mistakes at night.
// Needs Playwright: `npm i playwright` somewhere, then PLAYWRIGHT_PATH=/that/node_modules/playwright/index.mjs if Node
// cannot find it. It uses the installed Chrome, else Playwright's own Chromium (`npx playwright install chromium`).
// Exit 1 when the page is below the bar or fails to start.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
const file = args.find((a, i) => !a.startsWith('--') && !['--out', '--page'].includes(args[i - 1]));
if (!file || !fs.existsSync(file)) { console.error('usage: check.mjs book.html [--out dir] [--page id]'); process.exit(2); }
const outDir = path.resolve(opt('out', path.join(path.dirname(file), 'shots')));
fs.mkdirSync(outDir, { recursive: true });
const pageId = opt('page');

async function playwright() {
  for (const t of [process.env.PLAYWRIGHT_PATH, 'playwright', 'playwright-core'].filter(Boolean)) { try { return await import(t); } catch { /* next */ } }
  console.error('Playwright not found. In any folder: npm i playwright, then run with PLAYWRIGHT_PATH=<that folder>/node_modules/playwright/index.mjs');
  process.exit(2);
}
const { chromium } = await playwright();
const launchArgs = ['--enable-gpu', '--ignore-gpu-blocklist', '--allow-file-access-from-files'];
let browser;
try { browser = await chromium.launch({ channel: 'chrome', args: launchArgs }); } catch { browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: launchArgs }); }

const url = pathToFileURL(path.resolve(file)).href;
const problems = [];
let play = null, alive = null, meta = null;
for (const theme of ['night', 'day']) for (const phone of [true, false]) {
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 860 }, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(url, { waitUntil: 'load' });
  // the page picks its theme from the system; pin it, and turn to the page under test
  try { await p.waitForFunction(() => window.__book, null, { timeout: 30000 }); }
  catch {
    const shown = await p.evaluate(() => document.querySelector('.errors')?.textContent || '').catch(() => '');
    problems.push(shown ? 'validator: ' + shown.trim() : `${theme} ${phone ? 'phone' : 'desktop'}: the book never started (${errors[0] || 'no WebGL?'})`);
    await ctx.close(); continue;
  }
  await p.evaluate(async ({ theme, pageId }) => {
    const b = window.__book; window.__setTheme?.(theme, true); await b.setTheme(theme, { instant: true });
    if (pageId && b.meta?.id !== pageId) { const list = JSON.parse(document.getElementById('moments').textContent); const m = list.find((x) => x.id === pageId); if (m) await b.setMoment(m); }
  }, { theme, pageId });
  await p.waitForTimeout(3500);
  const skipped = await p.evaluate(() => document.querySelector('.errors')?.textContent || '');
  if (skipped && !problems.some((q) => q.startsWith('validator'))) problems.push('validator: ' + skipped.trim());
  if (!meta) meta = await p.evaluate(() => { const id = window.__book.meta?.id; return JSON.parse(document.getElementById('moments').textContent).find((m) => m.id === id) || window.__book.meta; });
  if (!play && !phone) {
    const ids = (meta?.pieces || []).map((q) => q.id);
    const kits = Object.fromEntries((meta?.pieces || []).map((q) => [q.id, q.kit]));
    play = await p.evaluate((ids) => {
      const b = window.__book, has = (id, ref) => { try { return !!b.debugScreen(id, 0, ref); } catch { return false; } };
      return { pokes: ids.filter((id) => has(id, 'poke:0')), drags: ids.filter((id) => has(id, 'drag')) };
    }, ids.filter((id) => kits[id] !== 'sky-dial'));
  }
  if (!alive && !phone && theme === 'day') {
    try { await p.waitForFunction(() => window.__book.debugState.loopClock > 7.5, null, { timeout: 20000 }); } catch { /* reduced motion */ }
    const marks = [];
    for (let i = 0; i < 3; i++) { marks.push(await p.evaluate(() => window.__book.debugLoops())); await p.waitForTimeout(800); }
    alive = (meta?.pieces || []).filter((q) => q.kit !== 'sky-dial' && marks.some((mk) => mk[q.id] !== marks[0][q.id])).map((q) => q.id);
  }
  const shot = path.join(outDir, `${phone ? 'phone' : 'desktop'}-${theme}.png`);
  await p.screenshot({ path: shot });
  console.log(path.relative(process.cwd(), shot));
  for (const e of errors) if (!/cancelable=false/.test(e)) problems.push(`${theme} ${phone ? 'phone' : 'desktop'}: ${e}`);
  await ctx.close();
}
await browser.close();

if (meta) console.log(`page: ${meta.id} (${meta.place || 'no place'}), ${meta.pieces?.length ?? '?'} pieces`);
if (play) {
  console.log(`play: tap ${play.pokes.join(', ') || 'nothing'}; drag ${play.drags.join(', ') || 'nothing'}`);
  if (!play.pokes.length || !play.drags.length) problems.push(`below the bar: one piece to tap and one to drag besides the sky dial (tap ${play.pokes.length}, drag ${play.drags.length})`);
}
if (alive) {
  console.log(`alive: ${alive.join(', ') || 'nothing moves on its own'}`);
  if (!alive.length) problems.push('below the bar: nothing moves on its own by day (cars, a rider, a boat, steam, a flag, leaves)');
}
// card.png: the phone shots, day and night, side by side
try {
  const { execFileSync } = await import('node:child_process');
  execFileSync('python3', ['-I', '-c', `import sys
from PIL import Image
a, b = Image.open(sys.argv[1]).convert('RGB'), Image.open(sys.argv[2]).convert('RGB')
w, h = a.size; box = (0, int(h * .02), w, int(h * .72))
a, b = a.crop(box), b.crop(box)
c = Image.new('RGB', (a.width * 2 + 24, a.height), '#B8B2A4'); c.paste(a, (0, 0)); c.paste(b, (a.width + 24, 0))
c.resize((1200, round(c.height * 1200 / c.width))).save(sys.argv[3], optimize=True)`, path.join(outDir, 'phone-day.png'), path.join(outDir, 'phone-night.png'), path.join(outDir, 'card.png')], { stdio: 'ignore' });
  console.log(path.relative(process.cwd(), path.join(outDir, 'card.png')));
} catch { /* Pillow missing: the four shots are enough */ }
if (problems.length) { console.log('\nproblems:'); for (const q of [...new Set(problems)]) console.log(' - ' + q); process.exit(1); }
console.log('check: ok');
