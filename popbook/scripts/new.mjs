#!/usr/bin/env node
// node scripts/new.mjs <id> --place "Place, City" --date YYYY-MM-DD [--dir my-book] [--like cafe] [--caption "..."]
//
// Starts a page: writes <dir>/<id>.json (default dir: ./my-book) with the house book block (book/house.json: cover,
// page core, edge stripes, lamp, book shape, light, camera; leave these alone, they make every page sit and light the
// same way) and the ground, palette and cover of the example you name with --like (default: cafe, a side-bound café
// scene; see examples/). The pieces list starts empty: fill it from references/kit.md, then build and check.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
const id = args[0];
if (!id || !/^[a-z0-9-]+$/.test(id)) { console.error('usage: new.mjs <kebab-id> --place "Place, City" --date YYYY-MM-DD [--dir my-book] [--like <example>] [--caption "..."]'); process.exit(2); }
const place = opt('place', ''), date = opt('date'), dir = path.resolve(opt('dir', 'my-book')), like = opt('like', 'cafe'), caption = opt('caption', '');
if (!/^\d{4}-\d{2}(-\d{2})?$/.test(date || '')) { console.error('--date YYYY-MM-DD (or YYYY-MM) is required'); process.exit(2); }
const exFile = path.join(ROOT, 'examples', like + '.json');
if (!fs.existsSync(exFile)) { console.error(`no example '${like}'; pick one of: ${fs.readdirSync(path.join(ROOT, 'examples')).map((f) => f.replace('.json', '')).join(', ')}`); process.exit(2); }
const base = JSON.parse(fs.readFileSync(exFile, 'utf8'));
const house = JSON.parse(fs.readFileSync(path.join(ROOT, 'book', 'house.json'), 'utf8'));
const file = path.join(dir, id + '.json');
if (fs.existsSync(file)) { console.error(`${file} exists; pick another id or delete it first`); process.exit(1); }
const m = {
  id, place, date,
  view: 'one sentence: what the spread shows, back to front (a note for people; no code reads it)',
  caption,
  stamp: `${place} · ${new Date(date + (date.length === 7 ? '-01' : '') + 'T12:00:00').toLocaleDateString('en-US', date.length === 7 ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }).replace(',', '')}`,
  palette: { ...(base.palette || {}), ...house.palette },
  book: house.book, ground: base.ground, camera: house.camera, light: house.light,
  pieces: [],
  idle: [],
};
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(file, JSON.stringify(m, null, 1) + '\n');
console.log(`wrote ${path.relative(process.cwd(), file)} (ground and palette from examples/${like}.json)`);
const show = (f) => { const r = path.relative(process.cwd(), f); return r.startsWith('..') ? f : r; };
console.log(`next: fill "pieces" (references/kit.md), then
  node ${show(path.join(ROOT, 'scripts/build.mjs'))} ${show(dir)}/*.json --out ${show(path.join(dir, 'book.html'))} --title "..."
  node ${show(path.join(ROOT, 'scripts/check.mjs'))} ${show(path.join(dir, 'book.html'))} --page ${id}`);
