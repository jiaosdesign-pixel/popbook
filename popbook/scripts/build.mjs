#!/usr/bin/env node
// node scripts/build.mjs <moment.json> [more.json ...] --out book.html [--title "A pop-up book"] [--author "Name"] [--theme day|night]
//
// Builds ONE self-contained HTML file: the pop-up book engine, three.js, the fonts and your moment files, all inlined.
// No server, no network, no install: double-click the file. Several moments become pages you turn (oldest first,
// by date). The page shows the open book, the caption and the place under it, a day / night switch, and arrows and
// date tabs when there is more than one page.
//
// URL options for the built page: ?theme=day|night picks the theme, ?embed=1 drops the page chrome for an iframe (the
// host can drive the theme with postMessage), ?open=1 shows the book already open on its page from the first frame (no
// closed cover, no opening animation; use it when the book sits right above other content), ?page=<n> starts on page n
// (0 = the oldest; default the newest).
//
// How it fits in one file: every ES module is inlined as a data: URL behind one import map, and every relative import
// is rewritten to a bare name the map resolves ('popbook/engine/sky.js', 'three/addons/...'). Fonts are base64 too.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // the skill folder
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
const flags = new Set(['--out', '--title', '--author', '--theme']);
const inputs = args.filter((a, i) => !a.startsWith('--') && !flags.has(args[i - 1]));
const out = opt('out');
if (!inputs.length || !out) { console.error('usage: build.mjs <moment.json> [more.json ...] --out book.html [--title "..."] [--author "..."] [--theme day|night]'); process.exit(2); }

// ---- the moments, oldest first
const moments = inputs.map((f) => {
  let m;
  try { m = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error(`${f}: not valid JSON (${e.message})`); process.exit(1); }
  if (!m.id) m.id = path.basename(f, '.json');
  return m;
}).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

// ---- modules: walk the import graph from book.js and three's addons
const mods = new Map(); // name -> source with rewritten specifiers
const b64 = (s) => Buffer.from(s).toString('base64');
function fileOf(name) {
  if (name === 'three') return path.join(ROOT, 'vendor/three/build/three.module.min.js');
  if (name.startsWith('three/addons/')) return path.join(ROOT, 'vendor/three/examples/jsm', name.slice('three/addons/'.length));
  if (name.startsWith('popbook/')) return path.join(ROOT, 'book', name.slice('popbook/'.length));
  throw new Error(`cannot place module '${name}'`);
}
function load(name) {
  if (mods.has(name)) return;
  mods.set(name, null);
  let src = fs.readFileSync(fileOf(name), 'utf8');
  const base = name.slice(0, name.lastIndexOf('/') + 1); // 'popbook/engine/' or 'three/addons/postprocessing/'
  const deps = [];
  src = src.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\2/g, (all, kw, q, sp) => {
    let target = sp;
    if (sp.startsWith('./') || sp.startsWith('../')) target = path.posix.normalize(base + sp);
    else if (sp !== 'three' && !sp.startsWith('three/addons/')) return all; // not a module specifier we own
    deps.push(target);
    return kw + q + target + q;
  });
  mods.set(name, src);
  for (const d of deps) load(d);
}
load('popbook/book.js');

// ---- fonts: the faces as data URLs, behind the selector the book looks for (link[data-popbook-fonts])
let fontsCss = fs.readFileSync(path.join(ROOT, 'fonts/fonts.css'), 'utf8')
  .replace(/url\("([^"]+\.woff2)"\)/g, (_, f) => `url("data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'fonts', f)).toString('base64')}")`);

const title = opt('title', 'A pop-up book');
const author = opt('author', '');
const theme = opt('theme', 'auto');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const importmap = { imports: Object.fromEntries([...mods].map(([n, s]) => [n, 'data:text/javascript;base64,' + b64(s)])) };
const first = moments[moments.length - 1];

const html = `<!doctype html>
<html lang="en" data-theme="day">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(title)}</title>
<meta name="description" content="${esc(first.caption || first.place || title)}">
<meta name="generator" content="popbook">
<link rel="stylesheet" data-popbook-fonts href="data:text/css;base64,${b64(fontsCss)}">
<style>
:root{--paper:#EDEBE0;--ink:#141413;--muted:#5F5D54;--line:#D5D2C4;--card:#E6E2D4;--accent:#9A7428;
  --sans:"Alegreya Sans",system-ui,sans-serif;--mono:"Martian Mono",ui-monospace,monospace;--ease:cubic-bezier(.2,.7,.2,1)}
html[data-theme=night]{--paper:#141413;--ink:#EDEBE0;--muted:#A3A094;--line:#2D2C28;--card:#1D1C19;--accent:#D6B464}
html.embed,html.embed body{background:transparent}
html.embed main{min-height:0;padding:0 0 8px}
html.embed .foot,html.embed #theme{display:none}
*{box-sizing:border-box}
html,body{margin:0;background:var(--paper);color:var(--ink);font:400 18px/1.45 var(--sans);transition:background .6s var(--ease),color .6s var(--ease)}
main{min-height:100svh;display:flex;flex-direction:column;align-items:center;padding:24px 16px 32px;gap:12px}
.book{width:min(100%,1100px);aspect-ratio:3/2;position:relative;touch-action:pan-y}
@media (max-width:640px){.book{aspect-ratio:6/5}}
.tabs{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.tabs[hidden]{display:none}
.tab,.btn{font:500 13px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);background:none;border:1px solid var(--line);
  border-radius:0;padding:10px 12px;min-height:40px;cursor:pointer;transition:color .2s,border-color .2s,background .2s}
.tab[aria-current=page]{color:var(--ink);border-color:var(--ink)}
.tab:hover,.btn:hover{color:var(--ink)}
.tab:focus-visible,.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.card{width:min(100%,640px);background:var(--card);border:1px solid var(--line);padding:18px 20px;text-align:center}
.line{margin:0;font-size:22px;line-height:1.3}
.line[hidden]{display:none}
.place{margin:8px 0 0;font:400 13px/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.row{display:flex;gap:8px;align-items:center;justify-content:center}
.foot{margin-top:auto;font:400 12px/1.4 var(--mono);letter-spacing:.06em;color:var(--muted);text-align:center}
.foot a{color:inherit}
.errors{width:min(100%,800px);white-space:pre-wrap;font:400 13px/1.5 var(--mono);color:#B3261E;border:1px solid currentColor;padding:12px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media (prefers-reduced-motion:reduce){html,body{transition:none}}
</style>
<script type="importmap">${JSON.stringify(importmap)}</script>
</head>
<body>
<main>
  <h1 class="sr">${esc(title)}</h1>
  <div id="book" class="book" role="img" aria-label="${esc(title)}: a paper pop-up book"></div>
  <nav class="tabs" id="tabs" aria-label="Pages" hidden></nav>
  <section class="card" aria-live="polite"><p class="line" id="line"></p><p class="place" id="place"></p></section>
  <div class="row">
    <button class="btn" id="prev" aria-label="Previous page" hidden>&larr;</button>
    <button class="btn" id="theme" aria-label="Switch to night">Night</button>
    <button class="btn" id="next" aria-label="Next page" hidden>&rarr;</button>
  </div>
  <p class="foot">${author ? esc(author) + ' &middot; ' : ''}Made with Popbook. Play with the paper, and turn the sun dial for night.</p>
</main>
<script type="application/json" id="moments">${JSON.stringify(moments).replace(/</g, '\\u003c')}</script>
<script type="module">
import { mountBook, validateMoment } from 'popbook/book.js';
const $ = (id) => document.getElementById(id);
const html = document.documentElement;
const list = JSON.parse($('moments').textContent);
const bad = [];
const pages = list.filter((m) => { const e = validateMoment(m); if (e.length) { bad.push(m.id + ':\\n  - ' + e.join('\\n  - ')); console.error('[popbook] ' + m.id + ' skipped: ' + e.join(' | ')); } return !e.length; });
if (bad.length) { const p = document.createElement('pre'); p.className = 'errors'; p.textContent = 'These pages have errors and were skipped:\\n' + bad.join('\\n'); $('book').after(p); }
let idx = pages.length - 1, turning = false, book;
const q = new URLSearchParams(location.search);
{ const n = parseInt(q.get('page'), 10); if (n >= 0 && n < pages.length) idx = n; } // ?page=<n>: start on that page (0 = the oldest)
if (q.has('embed')) html.classList.add('embed');
const wanted = q.get('theme') || ${JSON.stringify(theme)};
let theme = wanted === 'day' || wanted === 'night' ? wanted : (matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day');
const short = (m) => { const d = new Date(String(m.date).length === 7 ? m.date + '-01T12:00' : m.date + 'T12:00'); return isNaN(d) ? m.date : d.toLocaleDateString('en-US', String(m.date).length === 7 ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' }); };
function paint() {
  const m = pages[idx]; if (!m) return;
  $('line').textContent = (m.caption || '').trim(); $('line').hidden = !$('line').textContent;
  $('place').textContent = [m.place, short(m)].filter(Boolean).join(' \\u00b7 ');
  [...$('tabs').children].forEach((b, i) => i === idx ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  $('prev').disabled = turning || idx === 0; $('next').disabled = turning || idx === pages.length - 1;
  book?.setCorners?.({ prev: !turning && idx > 0, next: !turning && idx < pages.length - 1 });
}
function setTheme(t, fromBook) {
  theme = t; html.dataset.theme = t;
  $('theme').textContent = t === 'night' ? 'Day' : 'Night';
  $('theme').setAttribute('aria-label', t === 'night' ? 'Switch to day' : 'Switch to night');
  if (!fromBook) book?.setTheme(t);
}
function go(i) {
  if (!book || turning || i < 0 || i >= pages.length || i === idx) return;
  const direction = i > idx ? 'next' : 'prev'; idx = i; turning = true; paint();
  book.setMoment(pages[idx], { direction }).finally(() => { turning = false; paint(); });
}
if (pages.length > 1) {
  $('tabs').hidden = $('prev').hidden = $('next').hidden = false;
  pages.forEach((m, i) => { const b = document.createElement('button'); b.className = 'tab'; b.textContent = short(m); b.addEventListener('click', () => go(i)); $('tabs').append(b); });
  $('prev').addEventListener('click', () => go(idx - 1)); $('next').addEventListener('click', () => go(idx + 1));
  addEventListener('keydown', (e) => { if (e.target.closest?.('button') && e.target.closest('#book')) return; if (e.key === 'ArrowLeft' && !e.target.closest?.('#book')) go(idx - 1); if (e.key === 'ArrowRight' && !e.target.closest?.('#book')) go(idx + 1); });
}
$('theme').addEventListener('click', () => setTheme(theme === 'night' ? 'day' : 'night'));
// a host page can drive the theme: postMessage({ popbook: 'theme', theme: 'day' | 'night' }); the dial tells the host back
addEventListener('message', (e) => { if (e.source === parent && e.data?.popbook === 'theme' && /^(day|night)$/.test(e.data.theme)) setTheme(e.data.theme); });
if (parent !== window) new ResizeObserver(() => parent.postMessage({ popbook: 'size', height: Math.ceil(document.querySelector('main').getBoundingClientRect().height) }, '*')).observe(document.querySelector('main'));
const tellHost = (t) => { if (parent !== window) parent.postMessage({ popbook: 'theme', theme: t }, location.origin === 'null' ? '*' : location.origin); };
setTheme(theme, true);
paint();
if (pages.length) {
  try {
    book = await mountBook($('book'), {
      moment: pages[idx], theme, mode: 'detail', caption: false, label: ${JSON.stringify(title)}, startOpen: q.get('open') === '1',
      coverTitle: ${JSON.stringify(title)}, coverAuthor: ${JSON.stringify(author)},
      onTurn: (dir) => go(idx + (dir === 'next' ? 1 : -1)),
      onThemeChange: (t) => { setTheme(t, true); tellHost(t); }, // the sky dial in the book is a theme switch too
    });
    window.__book = book; window.__setTheme = setTheme; // for scripts/check.mjs
    paint();
  } catch (e) {
    console.error('[popbook] the book could not start:', e);
    const p = document.createElement('pre'); p.className = 'errors'; const msg = String(e && e.message || e); p.textContent = 'The book could not start: ' + msg + (/webgl|context/i.test(msg) ? ' (it needs WebGL and a recent browser)' : ''); $('book').replaceWith(p);
  }
}
</script>
</body>
</html>
`;
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${out}: ${moments.length} page${moments.length === 1 ? '' : 's'}, ${mods.size} modules, ${(html.length / 1024 / 1024).toFixed(2)} MB`);
