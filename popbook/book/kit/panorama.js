// Kit: side-bound V-fold panorama (book.binding 'side'). The gutter runs away from the reader; every
// layer is a V-fold glued across it, its crease on the gutter, both halves facing the reader as a shallow V.
// All layers share one hinge angle (theta, measured from the gutter toward the open edge) and corner angle
// (gamma), so they fold flat together like dominoes. Pieces are authored in "front view" coordinates:
// x along the layer (left half x <= 0 on the far page, right half x >= 0 on the near page), y up, z toward
// the reader. Everything here is a pure function of the page angle, a tab, or a dial.
//
//   vfold-layer   a V-fold layer of printed bands (waves, hills, flat strips, a city) and small cards
//   v-box         two parallel V-folds joined by platforms (the Golden Gate: front and back elevations,
//                 deck, tower struts), thread cables, static low-relief cars, lamps
//   deck-figure   the figure facing the reader, glued behind the front railing of a v-box (a spacer card)
//   fog-lever     a pull-tab at the reader's edge: strip between the page plies, lever on a rivet, a vellum
//                 fog card that swings up over a layer's ridge (the pin shows in an arc slot)
//   sky-dial      a volvelle riveted behind a layer: sun on one half, moon on the other. Turning it drives
//                 Day/Night (through the engine's sky hooks)
//   ground:gg-side  the bay printed on both pages
import * as THREE from 'three';
import { card, polyShape, printTexture, paperMaterial, glowSprite, aoStrip, roundRect } from '../engine/paper.js';
import { Thread } from '../engine/mech.js';
import { paperBox } from './bridge.js';
import { makeFrontFigure, mergeStatic, makePumpkin, makeJack, rng } from './filoli.js';
import { slotLimit, hop, sstep } from '../engine/motion.js';

const deg = Math.PI / 180;
export function vAngles(s, book = {}) {
  return { theta: (s.theta ?? book.vTheta ?? 105) * deg, gamma: (s.gamma ?? book.vGamma ?? 90) * deg };
}
// both halves' frames for one layer, computed once per pose
function layerFrames(x0, theta, gamma) {
  const f = { right: new THREE.Matrix4(), left: new THREE.Matrix4() };
  let sp0 = null, phi0 = null;
  return (sp) => {
    if (sp !== sp0 || sp.phi !== phi0) { sp.vlayer(x0, theta, gamma, f); sp0 = sp; phi0 = sp.phi; }
    return f;
  };
}
const halfPart = (obj, frames, side, extra = {}) => ({ obj, frame: (sp, m) => m.copy(frames(sp)[side]), ...extra });

// ---------------------------------------------------------------- profiles (height fields over front-view x)
function hash(n, seed) { const v = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return v - Math.floor(v); }
function profile(b) {
  const amp = b.amp ?? 0, len = b.len ?? 0.3, ph = b.phase ?? 0, h = b.h ?? 0.05;
  if (b.kind === 'waves') {
    // rounded crests with a sharper trough, like the cut strips in the old book
    return (x) => h + amp * (Math.sin((x / len) * Math.PI * 2 + ph) * 0.75 + 0.25 * Math.sin((x / len) * Math.PI * 4 + ph * 1.7));
  }
  if (b.kind === 'grass') {
    // a bank of dry grass: a soft rolling top with blades poking out (die-cut, so the edge reads as grass)
    const amp2 = b.amp ?? 0.02, seed = b.seed ?? 1;
    return (x) => {
      const roll = h * (0.78 + 0.14 * Math.sin(x * 9 + seed) + 0.08 * Math.sin(x * 23 + seed * 2));
      const k = Math.floor(x / 0.007), f = x / 0.007 - k, r = hash(k, seed);
      const blade = r > 0.45 ? amp2 * (0.4 + 0.6 * hash(k, seed + 3)) * (1 - Math.abs(f - 0.5) * 2) : 0;
      return roll + blade;
    };
  }
  if (b.kind === 'hills') {
    const peaks = b.peaks || [];
    return (x) => {
      let y = h;
      for (const [px, ph2, w] of peaks) { const d = (x - px) / w; if (Math.abs(d) < 1) y = Math.max(y, h + (ph2 - h) * Math.cos((d * Math.PI) / 2) ** 2); }
      return y + 0.004 * Math.sin(x * 61 + (b.seed ?? 1)) + 0.003 * Math.sin(x * 23 + 2 * (b.seed ?? 1));
    };
  }
  return () => h;
}
// polygon of one half of a band: x in [a, b], from y = 0 up to the profile (or a stepped city skyline)
function bandPolygon(b, a, z) {
  if (b.kind === 'city') {
    const pts = [[a, 0]];
    const blocks = b.blocks.filter(([x, w]) => x + w / 2 > a && x - w / 2 < z).sort((p, q) => p[0] - q[0]);
    let cur = a, baseH = b.h ?? 0.03;
    for (const [x, w, hh, kind] of blocks) {
      const x0 = Math.max(a, x - w / 2), x1 = Math.min(z, x + w / 2);
      if (x0 > cur) { pts.push([cur, baseH], [x0, baseH]); }
      if (kind === 'spike') { pts.push([x0, hh * 0.55], [(x0 + x1) / 2, hh], [x1, hh * 0.55]); }
      else if (kind === 'stepped') { pts.push([x0, hh * 0.7], [x0 + w * 0.2, hh * 0.7], [x0 + w * 0.2, hh], [x1 - w * 0.2, hh], [x1 - w * 0.2, hh * 0.7], [x1, hh * 0.7]); }
      else pts.push([x0, hh], [x1, hh]);
      cur = x1;
    }
    if (cur < z) pts.push([cur, baseH], [z, baseH]);
    pts.push([z, 0]);
    return pts;
  }
  const top = profile(b), pts = [[a, 0]], n = Math.max(4, Math.ceil((z - a) / 0.006));
  for (let i = 0; i <= n; i++) { const x = a + ((z - a) * i) / n; pts.push([x, Math.max(0.006, top(x))]); }
  pts.push([z, 0]);
  return pts;
}
function bandHeight(b) {
  if (b.kind === 'city') return Math.max(...b.blocks.map((q) => q[2]));
  if (b.kind === 'hills') return Math.max(b.h ?? 0, ...(b.peaks || []).map((p) => p[1])) + 0.008;
  if (b.kind === 'grass') return (b.h ?? 0.05) + (b.amp ?? 0.02) + 0.002;
  return (b.h ?? 0.05) + (b.amp ?? 0) * 1.0;
}
// the reach (along the hinge) a band needs on each side
const bandReach = (b) => [Math.max(0, -b.from), Math.max(0, b.to)];

// a printed band: flat colour, optional printed details, optional night glow map (lit windows)
function bandMaterial(b, pal, box) {
  const color = b.color || pal.bay;
  const tex = printTexture(box, (g) => {
    g.fillStyle = color; g.fillRect(box[0], 0, box[2] - box[0], box[3]);
    if (b.kind === 'waves') {
      // a pale printed line under the crest
      const top = profile(b);
      g.strokeStyle = pal.foam; g.globalAlpha = 0.75; g.lineWidth = 0.0035; g.beginPath();
      for (let x = box[0]; x <= box[2]; x += 0.006) g.lineTo(x, Math.max(0.004, top(x) - 0.012));
      g.stroke(); g.globalAlpha = 1;
    }
    if (b.kind === 'grass') {
      const top = profile(b), gr = g.createLinearGradient(0, 0, 0, (b.h ?? 0.05) + (b.amp ?? 0.02));
      gr.addColorStop(0, b.colorB || pal.grassDark || '#B09350'); gr.addColorStop(0.55, color); gr.addColorStop(1, b.colorC || pal.grassLight || '#E8D7A2');
      g.fillStyle = gr; g.fillRect(box[0], 0, box[2] - box[0], box[3]);
      const r = rng(b.seed ?? 1); g.lineCap = 'round';
      for (let i = 0; i < (box[2] - box[0]) * 1600; i++) {
        const x = box[0] + r() * (box[2] - box[0]), y0 = r() * top(x) * 0.9, l = 0.008 + r() * 0.016, a = Math.PI / 2 + (r() - 0.5) * 0.7;
        g.strokeStyle = r() < 0.5 ? (pal.grassDark || '#B09350') : (pal.grassLight || '#E8D7A2'); g.globalAlpha = 0.5; g.lineWidth = 0.0018;
        g.beginPath(); g.moveTo(x, y0); g.lineTo(x + Math.cos(a) * l, y0 + Math.sin(a) * l); g.stroke();
      }
      g.globalAlpha = 1;
    }
    if (b.kind === 'hills') {
      // a second tone toward the base (dry grass over green, or the reverse), and soft printed ridges
      if (b.colorB) { g.fillStyle = b.colorB; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(box[0], 0); for (let x = box[0]; x <= box[2]; x += 0.01) g.lineTo(x, (b.h ?? 0.04) * 0.7 + 0.02 * Math.sin(x * 9 + 1)); g.lineTo(box[2], 0); g.closePath(); g.fill(); g.globalAlpha = 1; }
      g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 0.003;
      for (const [px, ph2, w] of b.peaks || []) { g.beginPath(); g.moveTo(px - w * 0.15, ph2 * 0.92); g.quadraticCurveTo(px + w * 0.1, ph2 * 0.6, px + w * 0.35, 0.03); g.stroke(); }
    }
    if (b.kind === 'city') {
      // building faces in alternating tints, window rows printed dark
      for (const [x, w, hh] of b.blocks) {
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x - w / 2, 0, w * 0.35, hh);
        g.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0.02; y < hh - 0.015; y += 0.016) for (let xx = x - w / 2 + 0.008; xx < x + w / 2 - 0.006; xx += 0.012) g.fillRect(xx, y, 0.005, 0.007);
      }
    }
  }, 1100, 2048);
  const opts = { map: tex };
  if (b.kind === 'city') {
    const glow = printTexture(box, (g) => {
      g.fillStyle = '#000'; g.fillRect(box[0], 0, box[2] - box[0], box[3]);
      let n = 0;
      for (const [x, w, hh] of b.blocks) for (let y = 0.02; y < hh - 0.015; y += 0.016) for (let xx = x - w / 2 + 0.008; xx < x + w / 2 - 0.006; xx += 0.012) { if (hash(n++, 3) > 0.55) { g.fillStyle = '#ffd9a0'; g.fillRect(xx, y, 0.005, 0.007); } }
    }, 700, 1024);
    Object.assign(opts, { emissiveMap: glow, emissive: '#ffcf8a' });
  }
  const mat = paperMaterial('#fff', opts);
  if (b.glow && b.kind !== 'city') { mat.emissive = new THREE.Color('#ffffff'); mat.emissiveMap = mat.map; mat.emissiveIntensity = b.glow; } // haze: far paper keeps its pale value against the light
  return mat;
}

// ---------------------------------------------------------------- vfold-layer
function layerDeclare(s, book) {
  const { theta, gamma } = vAngles(s, book);
  const reach = s.reach || [0, 0], height = [0, 0];
  for (const b of s.bands || []) {
    const [l, r] = bandReach(b), h = bandHeight(b);
    if (l > 0) height[0] = Math.max(height[0], h);
    if (r > 0) height[1] = Math.max(height[1], h);
  }
  for (const c of s.cards || []) { const i = c.x < 0 ? 0 : 1; const top = (c.y ?? 0) + (c.h ?? (c.r ? c.r * 1.8 : 0.08)); height[i] = Math.max(height[i], top); }
  return { vlayers: [{ name: 'layer', x0: s.x0, theta, gamma, reach, height }] };
}
export function vfoldLayer(ctx, s) {
  const pal = ctx.palette, { theta, gamma } = vAngles(s, ctx.book);
  const frames = layerFrames(s.x0, theta, gamma);
  const halves = { left: new THREE.Group(), right: new THREE.Group() };
  const glows = [], jacks = [];
  (s.bands || []).forEach((b, i) => {
    const box = [b.from, 0, b.to, bandHeight(b) + 0.01];
    const mat = bandMaterial(b, pal, box);
    if (b.kind === 'city') glows.push(mat);
    const z = b.z ?? -i * 0.0042; // bands laminated one behind the other in the same layer
    for (const [side, a, zz] of [['left', b.from, Math.min(b.to, 0)], ['right', Math.max(b.from, 0), b.to]]) {
      if (zz - a < 0.004) continue;
      const m = card(polyShape(bandPolygon(b, a, zz)), { material: mat, edgeColor: b.color, depth: 0.004, uvBox: box, curveSegments: 1 });
      m.position.z = z;
      halves[side].add(m);
    }
  });
  // small die-cut cards glued on the layer's face (a sailboat): { x, y, h, kind }
  for (const c of s.cards || []) {
    const side = c.x < 0 ? 'left' : 'right';
    if (c.kind === 'sailboat') halves[side].add(sailboatCard(pal, c));
    else if (c.kind === 'bale') halves[side].add(baleCard(pal, c));
    else if (c.kind === 'pumpkin' || c.kind === 'lantern') {
      const pk = c.kind === 'lantern' ? makeJack(pal, c.r ?? 0.024) : null;
      if (pk) { pk.group.position.set(c.x, c.y ?? 0, 0.006); pk.group.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.userData.noAO = true; } }); halves[side].add(pk.group); jacks.push(pk); }
      else { const p = makePumpkin(pal, c.r ?? 0.04, pal[c.color] || c.color || pal.pumpkin); p.position.set(c.x, (c.y ?? 0) + (c.r ?? 0.04) * 0.82, 0.008); p.rotation.z = c.rot ?? 0; halves[side].add(p); }
    }
  }
  ctx.lamp((k) => { for (const j of jacks) { j.innerMat.emissiveIntensity = 1.4 * k; j.glow.material.opacity = 0.7 * k; } });
  ctx.lamp((k) => { for (const m of glows) m.emissiveIntensity = 1.1 * k; });
  for (const g of Object.values(halves)) mergeStatic(g, (o) => o.isSprite || jacks.some((j) => j.group === o));
  const parts = [halfPart(halves.left, frames, 'left'), halfPart(halves.right, frames, 'right')];
  // a soft contact shade where each half's foot meets its page (fades as the layer folds)
  const reach = s.reach || [0.9, 0.9];
  for (const [side, a, b] of [['left', -reach[0], 0], ['right', 0, reach[1]]]) {
    const g = new THREE.Group(); const st = aoStrip(a, b, s.footShade ?? 0.05, s.footStrength ?? 0.22); st.position.z = -0.006; g.add(st);
    parts.push(halfPart(g, frames, side, { ao: true }));
  }
  return {
    parts,
    targets: [...halves.left.children, ...halves.right.children],
    mount: { frames, x0: s.x0, theta, gamma },
  };
}
// a hay bale's front face: a straw-printed card with two twine bands
const baleMats = new Map();
function baleCard(pal, c) {
  const w = c.w ?? 0.16, h = c.h ?? 0.07, box = [-w / 2, 0, w / 2, h], r = rng(c.seed ?? 3);
  // one printed straw material per bale size, shared, so a stack merges into one draw call
  const key = `${w}|${h}|${pal.hay}`;
  if (!baleMats.has(key)) baleMats.set(key, paperMaterial('#fff', { map: printTexture(box, (g) => {
    g.fillStyle = pal.hay || '#D2B266'; g.fillRect(-w / 2, 0, w, h);
    g.lineCap = 'round';
    for (let i = 0; i < 260; i++) { const x = -w / 2 + r() * w, y = r() * h, l = 0.006 + r() * 0.012; g.strokeStyle = r() < 0.5 ? pal.strawLight || '#EBD9A4' : pal.hayDark || '#A88A45'; g.globalAlpha = 0.6; g.lineWidth = 0.0016; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (r() - 0.5) * 0.006); g.stroke(); }
    g.globalAlpha = 1; g.fillStyle = pal.twine || '#8A6A48'; for (const f of [0.28, 0.72]) g.fillRect(-w / 2 + f * w - 0.003, 0, 0.006, h);
  }, 1400, 512) }));
  const m = card(polyShape([[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]]), { material: baleMats.get(key), edgeColor: pal.hayDark, depth: 0.006, uvBox: box, curveSegments: 1 });
  m.position.set(c.x, c.y ?? 0, 0.006); m.rotation.z = c.rot ?? 0;
  return m;
}
function sailboatCard(pal, c) {
  const g = new THREE.Group(), k = c.h ?? 0.12;
  const hull = card(polyShape([[-0.5, 0.08], [0.55, 0.08], [0.38, -0.06], [-0.36, -0.06]].map(([x, y]) => [x * k * 0.7, y * k])), { color: pal.hull || '#FAF9F5', depth: 0.003, curveSegments: 1 });
  const sail = card(polyShape([[0.02, 0.12], [0.02, 1.0], [0.42, 0.14]].map(([x, y]) => [x * k * 0.7, y * k])), { color: pal.sail || '#FAF9F5', depth: 0.003, curveSegments: 1 });
  const jib = card(polyShape([[-0.02, 0.14], [-0.02, 0.86], [-0.34, 0.16]].map(([x, y]) => [x * k * 0.7, y * k])), { color: pal.sail2 || '#EDEBE0', depth: 0.003, curveSegments: 1 });
  const mast = card(polyShape([[-0.012, 0.08], [0.012, 0.08], [0.012, 1.02], [-0.012, 1.02]].map(([x, y]) => [x * k * 0.7, y * k])), { color: pal.mast || '#5A4E44', depth: 0.003, curveSegments: 1 });
  hull.position.z = 0.004; sail.position.z = 0.003; jib.position.z = 0.0035; mast.position.z = 0.0045;
  g.add(hull, sail, jib, mast);
  g.position.set(c.x, c.y, 0.004);
  return g;
}

// ---------------------------------------------------------------- v-box: the Golden Gate
function boxDeclare(s, book) {
  // towers: false is a plain viaduct (deck, railing lamps, piers, cars): only the railing and its lamps stand above the deck
  const { theta, gamma } = vAngles(s, book), H = (s.towers === false ? (s.deckH ?? 0.22) + 0.011 + 0.03 : (s.towerH ?? 0.78)) + 0.02, reach = s.reach || [0.86, 0.86];
  return { vlayers: [
    { name: 'front elevation', x0: s.x0, theta, gamma, reach, height: [H, H] },
    { name: 'back elevation', x0: s.x0 + (s.depth ?? 0.12), theta, gamma, reach, height: [H, H] },
  ] };
}
export function vBox(ctx, s) {
  const pal = ctx.palette, { theta, gamma } = vAngles(s, ctx.book);
  const T = s.towerX ?? 0.44, H = s.towerH ?? 0.78, h = s.deckH ?? 0.22, Dx = s.depth ?? 0.12;
  const towers = s.towers !== false, carScale = s.carScale ?? 1; // towers: false skips towers, cables, beacons, anchorages and the floodlight
  const [EL, ER] = s.reach || [0.86, 0.86];
  const td = 0.03, rail = 0.011, ph = 0.03, pw = 0.048, pil = 0.03;
  const widths = [0.046, 0.04, 0.035, 0.031];
  const top = h + rail;
  const lv = [top, top + (H - top) * 0.3, top + (H - top) * 0.55, top + (H - top) * 0.78, H];
  const coral = pal.bridge, coralDark = pal.bridgeDark;
  const fFront = layerFrames(s.x0, theta, gamma), fBack = layerFrames(s.x0 + Dx, theta, gamma);

  // one half of the elevation card, from the crease (x = 0) out to the end E, mirrored by dir
  function halfOutline(dir, E) {
    const pts = [], P = (x, y) => pts.push([dir * x, y]);
    P(0, h - td);
    const wb = widths[0] / 2;
    P(T - wb, h - td); P(T - wb, ph); P(T - pw, ph); P(T - pw, 0); P(T + pw, 0); P(T + pw, ph); P(T + wb, ph); P(T + wb, h - td);
    P(E - pil, h - td); P(E - pil, 0); P(E, 0); P(E, top);
    if (!towers) { P(0, top); return pts; } // a plain pier under the deck, no tower above it
    P(T + widths[0] / 2, top);
    for (let k = 0; k < 4; k++) { P(T + widths[k] / 2, lv[k + 1]); if (k < 3) P(T + widths[k + 1] / 2, lv[k + 1]); }
    P(T + widths[3] / 2 - 0.004, H); P(T + widths[3] / 2 - 0.004, H + 0.008); P(T - widths[3] / 2 + 0.004, H + 0.008); P(T - widths[3] / 2 + 0.004, H);
    for (let k = 3; k >= 0; k--) { P(T - widths[k] / 2, lv[k + 1]); P(T - widths[k] / 2, lv[k]); }
    P(0, top);
    return pts;
  }
  const box = [-EL, 0, ER, H + 0.01];
  const face = printTexture(box, (g) => {
    g.fillStyle = coral; g.fillRect(box[0], 0, box[2] - box[0], H + 0.01);
    g.strokeStyle = coralDark; g.lineWidth = 0.0024;
    g.beginPath(); g.moveTo(box[0], h - td + 0.004); g.lineTo(box[2], h - td + 0.004); g.moveTo(box[0], h - 0.002); g.lineTo(box[2], h - 0.002); g.stroke();
    g.lineWidth = 0.0016; g.beginPath();
    for (let x = box[0]; x < box[2]; x += 0.022) { g.moveTo(x, h - td + 0.004); g.lineTo(x + 0.011, h - 0.002); g.lineTo(x + 0.022, h - td + 0.004); }
    g.stroke();
    g.lineWidth = 0.001; g.beginPath();
    for (let x = box[0]; x < box[2]; x += 0.006) { g.moveTo(x, h + 0.001); g.lineTo(x, top - 0.002); }
    g.stroke();
    for (const c of [-T, T]) {
      for (let k = 0; k < 4; k++) { const w = widths[k] / 2 - 0.007; g.fillStyle = coralDark; g.globalAlpha = 0.35; g.fillRect(c - w, lv[k] + 0.012, w * 2, lv[k + 1] - lv[k] - 0.02); g.globalAlpha = 1; }
      g.fillStyle = pal.pier; g.fillRect(c - pw, 0, pw * 2, ph);
    }
    g.fillStyle = pal.pier; g.fillRect(box[0], 0, pil, h - td); g.fillRect(box[2] - pil, 0, pil, h - td);
  }, 1400, 2048);
  const glow = printTexture(box, (g) => {
    g.fillStyle = '#000'; g.fillRect(box[0], 0, box[2] - box[0], H + 0.01);
    for (const c of [-T, T]) {
      const gr = g.createLinearGradient(0, ph, 0, H);
      gr.addColorStop(0, 'rgba(255,190,140,1)'); gr.addColorStop(1, 'rgba(255,150,100,0.35)');
      g.fillStyle = gr; g.fillRect(c - 0.03, ph, 0.06, H - ph + 0.01);
    }
    g.fillStyle = 'rgba(255,170,120,0.35)'; g.fillRect(box[0], h - td, box[2] - box[0], td + rail);
  }, 300, 512);
  const wallMat = paperMaterial('#fff', { map: face, emissiveMap: glow, emissive: '#e8a27a' });
  ctx.lamp((k) => { wallMat.emissiveIntensity = towers ? 0.3 * k : 0; });
  const threadMat = new THREE.MeshStandardMaterial({ color: pal.cable, roughness: 0.65 });
  const lineMat = new THREE.LineBasicMaterial({ color: pal.cable, transparent: true, opacity: 0.85 });
  const cableY = (x) => { const yMid = top + 0.018, yT = H - 0.004; return yMid + (yT - yMid) * (x / T) ** 2; };
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: '#5b544c', emissive: new THREE.Color(pal.lamp), emissiveIntensity: 0, roughness: 0.6 });
  const redMat = new THREE.MeshStandardMaterial({ color: '#7a3a30', emissive: new THREE.Color('#ff3b2a'), emissiveIntensity: 0, roughness: 0.6 });
  ctx.lamp((k) => { lampHeadMat.emissiveIntensity = 2.2 * k; redMat.emissiveIntensity = 3 * k; });
  const glowsprites = [];

  const targets = [], parts = [], deckGroups = {};
  function elevationHalf(dir, E, isFront) {
    const g = new THREE.Group();
    const m = card(polyShape(halfOutline(dir, E)), { material: wallMat, edgeColor: coral, depth: 0.005, uvBox: box, curveSegments: 2 });
    g.add(m); targets.push(m);
    // main span cable and suspenders, in the card's plane (front face side)
    const zc = isFront ? 0.0035 : -0.0035;
    if (towers) {
      const cpts = []; for (let i = 0; i <= 20; i++) { const x = (dir * T * i) / 20; cpts.push(new THREE.Vector3(x, cableY(x), zc)); }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cpts), 30, 0.0028, 5, false), threadMat);
      tube.castShadow = true; g.add(tube);
      const sp = [];
      for (let x = 0.016; x < T - 0.02; x += 0.028) sp.push(dir * x, cableY(x), zc, dir * x, top, zc);
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      g.add(new THREE.LineSegments(sg, lineMat));
    }
    if (isFront) {
      for (let x = 0.08; x < E - 0.03; x += 0.16) {
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), lampHeadMat);
        head.position.set(dir * x, top + 0.021, -0.001); g.add(head);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.02, 4), threadMat);
        post.position.set(dir * x, top + 0.01, -0.001); g.add(post);
        const gs = glowSprite(pal.lamp, 0.045); gs.position.copy(head.position); g.add(gs); glowsprites.push([gs, 0.85]);
      }
      if (towers) {
        const r = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), redMat);
        r.position.set(dir * T, H + 0.013, 0); g.add(r);
        const gs = glowSprite('#ff4a3a', 0.03); gs.position.copy(r.position); g.add(gs); glowsprites.push([gs, 0.6]);
      }
    }
    return g;
  }
  for (const [frames, isFront] of [[fFront, true], [fBack, false]]) {
    parts.push(halfPart(elevationHalf(-1, EL, isFront), frames, 'left'));
    parts.push(halfPart(elevationHalf(1, ER, isFront), frames, 'right'));
  }
  ctx.lamp((k) => { for (const [gs, o] of glowsprites) gs.material.opacity = o * k; });

  // platforms between the two elevations: they stay parallel to their page, origin on the front crease.
  // In page-local open coords a point s along the hinge is (s cos theta, +-s sin theta); the back card is +Dx.
  const along = (page, sv) => [sv * Math.cos(theta), (page === 'near' ? 1 : -1) * sv * Math.sin(theta)]; // (x, z)
  function platform(page, s0, s1, mat, depth = 0.006) {
    const q = [along(page, s0), along(page, s1)];
    const pts = [[q[0][0], -q[0][1]], [q[1][0], -q[1][1]], [q[1][0] + Dx, -q[1][1]], [q[0][0] + Dx, -q[0][1]]];
    const m = card(polyShape(pts), { material: mat, edgeColor: coral, depth, curveSegments: 1 });
    m.geometry.rotateX(-Math.PI / 2);
    m.geometry.translate(0, -depth / 2, 0);
    return m;
  }
  // deck: a printed road with lanes running along the bridge, two static low-relief cars per side
  for (const page of ['near', 'far']) {
    const E = page === 'near' ? ER : EL;
    const bx = (() => { const a = along(page, 0), b = along(page, E); const xs = [a[0], b[0], a[0] + Dx, b[0] + Dx], ys = [-a[1], -b[1]]; return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; })();
    const deckTex = printTexture(bx, (g) => {
      g.fillStyle = pal.road; g.fillRect(bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1]);
      const d = along(page, E);
      const line = (f, w, col, dash) => { g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); g.moveTo(f * Dx, 0); g.lineTo(f * Dx + d[0], -d[1]); g.stroke(); };
      line(0.08, 0.016, pal.walk); line(0.92, 0.016, pal.walk);
      line(0.35, 0.002, pal.roadLine, [0.02, 0.018]); line(0.65, 0.002, pal.roadLine, [0.02, 0.018]);
      g.setLineDash([]);
    }, 900, 2048);
    const deck = platform(page, 0, E, paperMaterial('#fff', { map: deckTex }), 0.007);
    const g = new THREE.Group(); g.add(deck); targets.push(deck);
    deckGroups[page] = g;
    parts.push({ obj: g, frame: (sp, m) => sp.vplatform(page, s.x0, theta, h, gamma, m) });
  }
  // traffic: folded-box cars on hidden paper belts, one belt per lane on each half (a belt never crosses the
  // crease). The two halves' belts run in step, so a car dips into the slot by the crease and comes up on the
  // other side, and dives into the end slot by each anchorage. Tap a car: it hops on its belt tab.
  const cars = [], pokes = [], proxies = [];
  const speed = s.traffic?.speed ?? 0.045, ret = 0.35, span = EL + ER, loop = span + ret;
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  for (const c of s.cars || []) {
    const entry = { c, dir: c.dir === -1 ? -1 : 1, hopT: -1, inst: {} };
    for (const page of ['near', 'far']) {
      const car = new THREE.Group();
      const body = paperBox(0.042, 0.011, 0.022, c.color, 0.003); body.position.y = 0.0055;
      const cab = paperBox(0.022, 0.009, 0.019, c.color, 0.003); cab.position.set(-0.003, 0.014, 0);
      const win = paperBox(0.023, 0.005, 0.0195, pal.glass, 0.002); win.position.set(-0.003, 0.0145, 0);
      car.add(body, cab, win);
      const head = glowSprite(pal.lamp, 0.05); head.position.set(0.024, 0.008, 0); car.add(head); glowsprites.push([head, 1]);
      const tail = glowSprite('#ff3b2a', 0.028); tail.position.set(-0.023, 0.008, 0); car.add(tail); glowsprites.push([tail, 0.9]);
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.035), proxyMat); proxy.position.y = 0.012; proxy.userData.hitProxy = true;
      const ph = new THREE.Group(); ph.add(proxy); car.add(ph);
      proxies.push({ mesh: ph, size: 0.05 });
      car.traverse((m) => { if (m.isMesh) m.userData.noAO = true; });
      deckGroups[page].add(car);
      entry.inst[page] = car;
      pokes.push({ targets: [proxy, body, cab, win], run() { if (entry.hopT < 0) entry.hopT = 0; } });
    }
    cars.push(entry);
  }
  let fold = 1;
  function placeCars(t) {
    for (const e of cars) {
      const p = ((((e.c.at ?? 0) * loop + t * speed) % loop) + loop) % loop; // distance along this lane's loop
      const X = e.dir > 0 ? -EL + p : ER - p; // across the bridge, crease at 0
      const vis = p < span;
      const page = X >= 0 ? 'near' : 'far', S = Math.abs(X), E = X >= 0 ? ER : EL;
      // dips: into the end slot by each anchorage and the slot either side of the crease
      const e1 = Math.min(1, Math.max(0, (S - 0.012) / 0.035), Math.max(0, (E - 0.03 - S) / 0.035));
      let y = -0.02 * (1 - sstep(0, 1, e1)), sx = 1, sy = 1;
      if (e.hopT >= 0) { const r = hop(e.hopT, 0.016); y += r.y; sx = r.sx; sy = r.sy; }
      for (const pg of ['near', 'far']) e.inst[pg].visible = vis && pg === page && e1 > 0.02;
      const car = e.inst[page];
      const [ax, az] = along(page, S);
      car.position.set(ax + (e.c.lane ?? 0.5) * Dx, y, az);
      // facing: along the hinge line, outward or toward the crease depending on the travel direction
      const outward = (X >= 0) === (e.dir > 0);
      car.rotation.y = (page === 'near' ? -theta : theta) + (outward ? 0 : Math.PI);
      car.scale.set(carScale * sx, carScale * fold * sy, carScale * sx);
    }
  }
  placeCars(0);
  // tower struts and caps: more platforms at their own heights
  const strutYs = [lv[1] + 0.004, lv[2] + 0.004, lv[3] + 0.004, H + 0.0105];
  const strutMat = paperMaterial(coralDark), capMat = paperMaterial(coral);
  if (towers) for (const page of ['near', 'far']) strutYs.forEach((y, i) => {
    const w = (i === 3 ? widths[3] - 0.006 : widths[Math.min(i + 1, 3)]) * 0.9;
    const m = platform(page, T - w / 2, T + w / 2, i === 3 ? capMat : strutMat);
    parts.push({ obj: m, frame: (sp, mm) => sp.vplatform(page, s.x0, theta, y, gamma, mm) });
  });

  // anchorages on the shore and side-span threads from each tower top (slack while the book is closed)
  const anchors = [];
  if (towers) for (const page of ['near', 'far']) {
    const E = page === 'near' ? ER : EL, sa = E + 0.05;
    const [ax, az] = along(page, sa);
    const blk = paperBox(0.05, 0.03, 0.05, pal.pier, 0.003);
    blk.position.set(ax + Dx / 2, 0.015, az); blk.rotation.y = page === 'near' ? -theta : theta;
    const g = new THREE.Group(); g.add(blk);
    parts.push({ obj: g, frame: (sp, m) => sp.pageFrame(page, m) });
    for (const [frames, zc] of [[fFront, 0.0035], [fBack, -0.0035]]) {
      const th = new Thread(0.0026, threadMat, 24);
      ctx.scene.add(th.mesh);
      anchors.push({ page, frames, zc, th, ax: ax + (zc > 0 ? 0.01 : Dx - 0.01), az });
    }
  }
  const tmpV = new THREE.Vector3();
  function dynamic(sp) {
    for (const an of anchors) {
      const f = an.frames(sp)[an.page === 'near' ? 'right' : 'left'];
      const topP = new THREE.Vector3((an.page === 'near' ? 1 : -1) * T, H - 0.004, an.zc).applyMatrix4(f);
      const anc = tmpV.set(an.ax, 0.03, an.az).applyMatrix4(sp.pageFrame(an.page, new THREE.Matrix4()));
      an.th.update(topP, anc.clone(), 0.012);
    }
  }
  // contact shade under the piers
  for (const [frames, side, dir] of [[fFront, 'right', 1], [fFront, 'left', -1]]) {
    const g = new THREE.Group();
    const st = aoStrip(dir * T - 0.08, dir * T + 0.08, 0.06, 0.45); g.add(st);
    parts.push(halfPart(g, frames, side, { ao: true }));
  }
  return {
    parts, targets, pokes, proxies,
    dynamic(sp) { dynamic(sp); fold = Math.max(0.05, sstep(0.3, 0.9, sp.upright)); },
    tick(t, dt, loops) {
      for (const e of cars) if (e.hopT >= 0) { e.hopT += dt / 0.5; if (e.hopT >= 1) e.hopT = -1; }
      placeCars(loops ? t : 0);
      return 'draw';
    },
    mount: { frames: fFront, deckH: h, depth: Dx, theta, gamma, x0: s.x0 },
  };
}

// ---------------------------------------------------------------- the figure on the bridge, facing the reader
export function deckFigure(ctx, s) {
  const host = ctx.pieces[s.on];
  if (!host?.mount?.deckH) throw new Error(`deck-figure: '${s.on}' has no deck`);
  const fig = makeFrontFigure(ctx.palette, s.height ?? 0.17);
  fig.fore.rotation.z = s.wave ?? 0.12; // a still wave (her forearm is on a brad)
  mergeStatic(fig.group, (o) => o === fig.fore);
  const holder = new THREE.Group(); holder.add(fig.group);
  // glued to the back of the front railing with a small spacer card, standing on the deck
  fig.group.position.set(s.x ?? -0.16, host.mount.deckH - 0.002, -(s.behind ?? 0.03));
  const spacer = card(polyShape([[-0.008, 0], [0.008, 0], [0.008, 0.03], [-0.008, 0.03]]), { color: ctx.palette.bridgeDark, depth: s.behind ?? 0.03, curveSegments: 1 });
  spacer.position.set(s.x ?? -0.16, host.mount.deckH + 0.004, -(s.behind ?? 0.03) / 2);
  holder.add(spacer);
  const side = (s.x ?? -0.16) < 0 ? 'left' : 'right';
  const targets = []; holder.traverse((m) => { if (m.isMesh) targets.push(m); });
  return { parts: [halfPart(holder, host.mount.frames, side)], targets };
}

// ---------------------------------------------------------------- fog lever (pull-tab linkage)
function fogDeclare(s, book) {
  const { theta, gamma } = vAngles(s, book);
  const W = book.width;
  return {
    on: s.on,
    vlayers: [{ name: 'fog card at rest', x0: s.x0, theta, gamma, reach: [0.01, (s.span?.[1] ?? 0.92) + 0.04], height: [0.01, s.restTop ?? 0.3] }],
    slots: [{ page: 'near', u0: (s.tab?.u ?? 0.5) - 0.03, u1: (s.tab?.u ?? 0.5) + 0.03, x0: -W / 2 - 0.12, x1: s.x0 }],
  };
}
export function fogLever(ctx, s) {
  const pal = ctx.palette, host = ctx.pieces[s.on];
  if (!host?.mount?.frames) throw new Error(`fog-lever: '${s.on}' is not a V-fold layer`);
  const frames = host.mount.frames;
  // a fog bank on two parallel arms behind the hills (a parallelogram linkage: it rises level, it never
  // tilts). Drawn where it sits when the tab is fully pulled; at rest it hangs lower, hidden by the ridge.
  const [x0, x1] = s.span || [0.22, 0.92], top = s.top ?? 0.3, thick = s.thick ?? 0.1;
  const [pinX, pinY] = s.pin || [0.62, 0.24], R = s.R ?? 0.3;
  const aPull = (s.pullA ?? 172) * deg, aRest = (s.restA ?? 210) * deg;
  const piv = [pinX - R * Math.cos(aPull), pinY - R * Math.sin(aPull)];
  const puffs = [];
  for (let x = x0 + 0.02, i = 0; x < x1 - 0.01; i++) { const r = 0.022 + 0.026 * hash(i, 7); puffs.push([x, r]); x += r * 1.15; }
  const tongue = s.tongue ?? 0; // the left end dips: it is the part that pours through the Gate
  const dip = (x) => (tongue ? tongue * Math.max(0, 1 - (x - x0) / 0.16) ** 1.5 : 0);
  const topAt0 = (x) => { const e = Math.min(1, (x - x0) / 0.08, (x1 - x) / 0.08); let y = top - 0.025; for (const [cx, r] of puffs) { const d = (x - cx) / r; if (Math.abs(d) < 1) y = Math.max(y, top - 0.025 + r * 0.55 * Math.sqrt(1 - d * d)); } return top - thick + (y - top + thick) * (0.35 + 0.65 * Math.sqrt(Math.max(0, e))); };
  const topAt = (x) => topAt0(x) - dip(x);
  const pts = [];
  for (let x = x0; x <= x1 + 1e-6; x += 0.005) pts.push([x, topAt(x)]);
  pts.push([x1, top - thick], [x0 + 0.04, top - thick - dip(x0 + 0.04)], [x0, top - thick * 0.6 - tongue]);
  // printed vellum: white crests, a blue-grey underside, so it reads against a pale page and pale hills
  const fbox = [x0, top - thick - tongue - 0.01, x1, top + 0.06];
  const ftex = printTexture(fbox, (g) => {
    const gr = g.createLinearGradient(0, fbox[1], 0, fbox[3]);
    gr.addColorStop(0, s.under || '#AEBBC8'); gr.addColorStop(0.55, s.color || '#E4EAF0'); gr.addColorStop(1, '#FBFCFC');
    g.fillStyle = gr; g.fillRect(fbox[0], fbox[1], fbox[2] - fbox[0], fbox[3] - fbox[1]);
    g.strokeStyle = 'rgba(120,138,156,0.55)'; g.lineWidth = 0.003; g.beginPath();
    for (let x = x0; x <= x1; x += 0.005) g.lineTo(x, topAt(x) - 0.006);
    g.stroke();
  }, 1200, 1024);
  const fogMat = paperMaterial('#fff', { map: ftex, translucent: true, opacity: s.opacity ?? 0.97, noCache: true });
  fogMat.emissive = new THREE.Color('#ffffff'); fogMat.emissiveMap = ftex; fogMat.emissiveIntensity = 0.22; // vellum: light comes through it
  const fogCard = card(polyShape(pts), { material: fogMat, depth: 0.0025, uvBox: fbox, curveSegments: 4 });
  const bank = new THREE.Group(); bank.add(fogCard);
  // the front arm's pin shows through an arc slot cut in the hills; the rivet it swings on shows too
  const bankZ = s.z ?? -0.0095;
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, -bankZ + 0.006, 14), paperMaterial(pal.sun || '#DCC380'));
  pin.rotation.x = Math.PI / 2; pin.position.set(pinX, pinY, (-bankZ + 0.006) / 2); bank.add(pin);
  bank.position.z = bankZ;
  const holder = new THREE.Group(); holder.add(bank);
  const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.004, 14), paperMaterial(pal.sun || '#DCC380'));
  rivet.rotation.x = Math.PI / 2; rivet.position.set(piv[0], piv[1], 0.0035); holder.add(rivet);
  const w = 0.0062, lo = Math.min(aPull, aRest) - 0.03, hi = Math.max(aPull, aRest) + 0.03;
  const slotShape = new THREE.Shape();
  slotShape.absarc(0, 0, R + w, lo, hi, false);
  slotShape.absarc(0, 0, R - w, hi, lo, true);
  const slot = new THREE.Mesh(new THREE.ShapeGeometry(slotShape, 24), new THREE.MeshBasicMaterial({ color: '#1d2a22', transparent: true, opacity: 0.5, depthWrite: false }));
  slot.position.set(piv[0], piv[1], 0.0024); slot.renderOrder = 2; holder.add(slot);
  const place = (k) => { const a = aRest + (aPull - aRest) * k; bank.position.x = R * (Math.cos(a) - Math.cos(aPull)); bank.position.y = R * (Math.sin(a) - Math.sin(aPull)); };
  // the pull-tab: out of the top board's plies at the reader's edge of the near page
  const W2 = (ctx.book?.width ?? 1.5) / 2, tabU = s.tab?.u ?? 0.5, tabW = s.tab?.w ?? 0.06, out = s.tab?.out ?? 0.075;
  const tabShape = roundRect(-out - 0.02, -tabW / 2, 0.03, tabW / 2, 0.012, [1, 0, 0, 1]);
  const tabTex = printTexture([-out - 0.02, -tabW / 2, 0.03, tabW / 2], (g) => {
    g.fillStyle = s.tabColor || pal.bridge; g.fillRect(-out - 0.02, -tabW / 2, out + 0.05, tabW);
    // a printed chevron pointing at the reader (no words)
    g.strokeStyle = pal.core || '#F4F1E8'; g.lineWidth = 0.005; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-out + 0.03, -0.014); g.lineTo(-out + 0.012, 0); g.lineTo(-out + 0.03, 0.014); g.stroke();
  }, 1500, 512);
  const tab = card(tabShape, { material: paperMaterial('#fff', { map: tabTex }), edgeColor: s.tabColor || pal.bridge, depth: 0.0024, uvBox: [-out - 0.02, -tabW / 2, 0.03, tabW / 2], curveSegments: 4 });
  tab.geometry.rotateX(-Math.PI / 2);
  const tabProxy = new THREE.Mesh(new THREE.BoxGeometry(out + 0.06, 0.03, tabW + 0.04), new THREE.MeshBasicMaterial({ visible: false }));
  tabProxy.userData.hitProxy = true;
  const proxyHolder = new THREE.Group(); proxyHolder.position.x = -out / 2; proxyHolder.add(tabProxy); // scaled by the engine to stay finger-sized
  const tabLift = new THREE.Group(); tabLift.add(tab);
  const tabSlide = new THREE.Group(); tabSlide.add(tabLift, proxyHolder);
  const tabMat = tab.material[0];
  const tabY = -0.004; // between the plies of the top board
  tabSlide.position.set(-W2, tabY, tabU);
  const tabHolder = new THREE.Group(); tabHolder.add(tabSlide);
  const maxPull = s.maxPull ?? 0.07;
  const st = { pull: 0, want: 0, drag: false, grab: 0, nudge: -1, hover: 0, hoverT: 0 };
  // the hint: once the book settles the tab slides out a few mm and back, and the fog stirs with it
  const nudgeAt = (t) => (t < 0 || t > 1 ? 0 : 0.024 * Math.sin(Math.PI * Math.min(1, t * 1.6)) ** 2 * (t < 0.62 ? 1 : 1 - (t - 0.62) / 0.38));
  function apply() {
    const extra = nudgeAt(st.nudge);
    place(Math.min(1, (st.pull + extra * 1.6) / maxPull));
    tabSlide.position.x = -W2 - st.pull - extra;
    tabLift.position.y = 0.0035 * st.hover; // on hover the tab lifts a hair off the cover and brightens
    tabMat.emissive.set('#ffffff'); tabMat.emissiveIntensity = 0.12 * st.hover;
  }
  apply();
  const parts = [halfPart(holder, frames, 'right'), { obj: tabHolder, noFit: true, frame: (sp, m) => sp.pageFrame('near', m) }];
  return {
    parts,
    drag: {
      targets: [tab, tabProxy], obj: tabHolder, axis: 1,
      begin(x) { st.drag = true; st.nudge = -1; st.grab = x + st.pull; st.want = st.pull; },
      move(x) { st.want = slotLimit(st.grab - x, 0, maxPull, 0.006, 0.02); },
      end() { st.drag = false; },
      hover(on) { st.hoverT = on ? 1 : 0; },
      get active() { return st.drag; },
    },
    proxies: [{ mesh: proxyHolder, size: out + 0.06 }],
    nudge() { if (!st.drag) st.nudge = 0; },
    actions: { pull(k = 1) { st.pull = st.want = k * maxPull; apply(); }, release() { st.pull = st.want = 0; apply(); }, hover(on = true) { st.hover = st.hoverT = on ? 1 : 0; apply(); } },
    tick(t, dt) {
      if (st.drag) st.pull += (st.want - st.pull) * Math.min(1, dt * 12);
      else if (st.pull > 0) { st.pull *= Math.exp(-dt / 0.55); if (st.pull < 1e-4) st.pull = 0; } // the fog sinks back under its own weight
      if (st.nudge >= 0) { st.nudge += dt / 1.1; if (st.nudge > 1) st.nudge = -1; }
      const hv = st.hover; st.hover += (st.hoverT - st.hover) * Math.min(1, dt * 10);
      apply();
      return st.drag || st.pull > 0 || st.nudge >= 0 || Math.abs(st.hover - hv) > 1e-4 ? 'fast' : false;
    },
    dynamic(sp) { if (sp.phi < Math.PI - 0.05 && !st.drag) { st.pull = st.want = 0; apply(); } }, // pushed back before the book closes
  };
}

// ---------------------------------------------------------------- sky dial (volvelle) -> Day / Night
function dialDeclare(s, book) {
  const { theta, gamma } = vAngles(s, book);
  const [cx, cy] = s.center || [-0.55, 0.15], r = s.r ?? 0.14;
  const left = cx < 0;
  return { on: s.on, vlayers: [{ name: 'dial', x0: s.x0, theta, gamma, reach: left ? [-cx + r, 0.01] : [0.01, cx + r], height: left ? [cy + r, 0.01] : [0.01, cy + r] }] };
}
export function skyDial(ctx, s) {
  const pal = ctx.palette, host = ctx.pieces[s.on];
  if (!host?.mount?.frames) throw new Error(`sky-dial: '${s.on}' is not a V-fold layer`);
  const [cx, cy] = s.center || [-0.55, 0.15], r = s.r ?? 0.14;
  const side = cx < 0 ? 'left' : 'right';
  const ph = ctx.moonPhase ?? 0.5;
  const tex = printTexture([-r, -r, r, r], (g) => {
    // upper half Day: pale sky and the sun; lower half Night: deep blue, stars and the moon in its real phase
    g.fillStyle = s.day || '#CCDCE7'; g.fillRect(-r, 0, 2 * r, r);
    g.fillStyle = s.night || '#2C3B57'; g.fillRect(-r, -r, 2 * r, r);
    g.fillStyle = pal.sun || '#DCC380'; g.beginPath(); g.arc(0, r * 0.6, r * 0.2, 0, 7); g.fill();
    g.strokeStyle = pal.sun || '#DCC380'; g.lineWidth = r * 0.035; g.lineCap = 'round';
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.27, r * 0.6 + Math.sin(a) * r * 0.27); g.lineTo(Math.cos(a) * r * 0.34, r * 0.6 + Math.sin(a) * r * 0.34); g.stroke(); }
    const my = -r * 0.6, mr = r * 0.19;
    g.fillStyle = pal.moon || '#F2EEDF'; g.beginPath(); g.arc(0, my, mr, 0, 7); g.fill();
    const lit = 1 - Math.abs(ph - 0.5) * 2, k = lit * 2 - 1, waxing = ph < 0.5;
    g.fillStyle = pal.moonShadow || '#5D6779';
    g.save(); g.translate(0, my); g.rotate(Math.PI); // printed upside down: it is the right way up when the dial has turned half way
    g.beginPath(); g.ellipse(0, 0, mr, mr, 0, Math.PI / 2, Math.PI * 1.5, !waxing); g.ellipse(0, 0, Math.abs(k) * mr, mr, 0, Math.PI * 1.5, Math.PI / 2, (k > 0) === waxing); g.fill();
    g.restore();
    g.fillStyle = '#F2EEDF';
    for (let i = 0; i < 14; i++) { const a = Math.PI + 0.25 + hash(i, 2) * (Math.PI - 0.5), rr = r * (0.35 + 0.55 * hash(i, 5)); g.globalAlpha = 0.5 + 0.5 * hash(i, 9); g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr, r * 0.018, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    // a ribbed rim for the thumb
    g.strokeStyle = 'rgba(20,20,19,0.35)'; g.lineWidth = r * 0.02;
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); g.lineTo(Math.cos(a) * r * 0.99, Math.sin(a) * r * 0.99); g.stroke(); }
    g.strokeStyle = 'rgba(20,20,19,0.25)'; g.lineWidth = r * 0.012; g.beginPath(); g.arc(0, 0, r * 0.995, 0, 7); g.stroke();
  }, 2400, 1024);
  // a knurled rim (small teeth all round), the cue that it turns under a thumb
  const discShape = new THREE.Shape(), teeth = s.teeth ?? 96;
  for (let i = 0; i <= teeth * 4; i++) { const a = (i / (teeth * 4)) * Math.PI * 2, rr = r * (1 + ((i % 4) < 2 ? 0.009 : -0.002)); i ? discShape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : discShape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  const mat = paperMaterial('#fff', { map: tex, emissiveMap: tex, emissive: '#ffffff', noCache: true });
  mat.emissiveIntensity = 0;
  const disc = card(discShape, { material: mat, edgeColor: '#E8E2CF', depth: 0.0035, uvBox: [-r, -r, r, r], curveSegments: 2 });
  const spin = new THREE.Group(); spin.add(disc);
  const holder = new THREE.Group(); holder.position.set(cx, cy, -(s.behind ?? 0.0125)); holder.add(spin);
  // a finger-sized invisible target over the visible part of the dial (scaled by the engine on small screens)
  const proxy = new THREE.Mesh(new THREE.CircleGeometry(r * 1.05, 24), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.userData.hitProxy = true;
  const proxyHolder = new THREE.Group(); proxyHolder.position.set(0, r * 0.45, (s.behind ?? 0.0125) + 0.012); proxyHolder.add(proxy); holder.add(proxyHolder);
  const dialObj = new THREE.Group(); dialObj.add(holder);
  let phi = 0, held = false, last = 0, nudge = -1, hover = 0, hoverT = 0, lamps = 0, peekDir = 1;
  const set = (a) => { phi = Math.max(0, Math.min(Math.PI, a)); spin.rotation.z = -phi; };
  // the hint, after every page turn: the dial turns about a quarter of the way toward the other half, the page's light
  // leans with it (lamps start to glow by day, the sun shows by night), holds a beat and settles back, in 1.3 s
  const PEEK = 0.28, PEEK_T = 1.3;
  const peekAt = (t) => {
    if (t < 0 || t > 1) return 0;
    if (t < 0.36) { const u = t / 0.36; return 1 - (1 - u) ** 3; }
    if (t < 0.56) return 1;
    const u = (t - 0.56) / 0.44; return 1 - (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);
  };
  const peek = () => peekAt(nudge);
  const show = () => {
    const pk = peek(); // the peek keeps the way it set out: a relight mid-peek moves phi across the middle, and the dial must not jump back
    spin.rotation.z = -(phi + peekDir * PEEK * Math.PI * pk);
    const lift = Math.max(hover, pk);
    spin.position.z = 0.002 * lift; mat.emissiveIntensity = 0.35 * lamps + 0.18 * lift;
  };
  return {
    parts: [halfPart(dialObj, host.mount.frames, side)],
    dial: {
      set(k, isHeld) { if (!held && !isHeld) set(k * Math.PI); },
    },
    setLight(L) { lamps = L.lamps; show(); },
    proxies: [{ mesh: proxyHolder, size: r * 2 }],
    nudge() { if (!held) { nudge = 0; peekDir = phi > Math.PI / 2 ? -1 : 1; } },
    tick(t, dt) {
      const peeking = nudge >= 0;
      const busy = peeking || Math.abs(hoverT - hover) > 1e-3;
      if (peeking) { nudge += dt / PEEK_T; if (nudge > 1) nudge = -1; }
      hover += (hoverT - hover) * Math.min(1, dt * 10);
      // first: relighting resets the dial to the theme (dial.set). Night leans a third as far: day light lifts a dark page fast
      if (peeking && !held) ctx.sky?.peek?.(PEEK * peek() * (peekDir < 0 ? 0.3 : 1));
      if (busy) show();
      return busy ? 'fast' : false;
    },
    drag: {
      targets: [disc, proxy], obj: holder, axis: 2, local: true,
      hover(on) { hoverT = on ? 1 : 0; },
      begin(p) { held = true; nudge = -1; ctx.sky?.peek?.(0); last = Math.atan2(p.y, p.x); },
      move(p) {
        const a = Math.atan2(p.y, p.x);
        let d = a - last; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
        last = a;
        set(phi - d); // turning clockwise moves the sun down to the right and brings the moon up
        ctx.sky?.preview(phi / Math.PI);
      },
      end() { held = false; ctx.sky?.commit(phi > Math.PI / 2 ? 'night' : 'day'); },
      // keys: Right or Down is night, Left or Up is day, 0 flips it
      step(dir) { ctx.sky?.commit(dir > 0 || (!dir && phi <= Math.PI / 2) ? 'night' : 'day'); },
      get active() { return held; },
    },
    actions: { turn(k = 0.5) { held = true; set(k * Math.PI); ctx.sky?.preview(k); }, letGo() { held = false; ctx.sky?.commit(phi > Math.PI / 2 ? 'night' : 'day'); } },
  };
}

// ---------------------------------------------------------------- ground print: the bay from the east, looking west through the Gate
const PRINTS = {
  near(g, { W, D, pal, gr }) { // right page: Marin, the bay in front, the ocean beyond the Gate
    water(g, W, D, pal);
    land(g, pal.landRight, gr.marin || [-0.5, 0.78], W, D, 1);
    road(g, pal, gr.roads?.near);
  },
  far(g, { W, D, pal, gr }) { // left page: San Francisco
    water(g, W, D, pal);
    land(g, pal.landLeft, gr.sf || [-0.75, 0.78], W, D, -1);
    road(g, pal, gr.roads?.far);
  },
};
function water(g, W, D, pal) {
  const gd = g.createLinearGradient(-W / 2, 0, W / 2, 0);
  gd.addColorStop(0, pal.bay); gd.addColorStop(0.55, pal.bay); gd.addColorStop(0.85, pal.ocean); gd.addColorStop(1, pal.ocean);
  g.fillStyle = gd; g.fillRect(-W / 2, 0, W, D);
  g.strokeStyle = pal.foam; g.globalAlpha = 0.5; g.lineWidth = 0.004; g.lineCap = 'round';
  for (const [x, u, l] of [[-0.62, 0.3, 0.1], [-0.5, 0.62, 0.12], [-0.3, 0.2, 0.09], [0.12, 0.45, 0.1], [0.42, 0.3, 0.11]]) {
    g.beginPath(); for (let i = 0; i <= 12; i++) { const t = i / 12; g.lineTo(x + 0.008 * Math.sin(t * Math.PI * 2), u + t * l); } g.stroke();
  }
  g.globalAlpha = 1;
}
function land(g, color, [x0, u0], W, D, seed) {
  g.fillStyle = color; g.beginPath(); g.moveTo(x0, D);
  for (let i = 0; i <= 40; i++) { const x = x0 + ((W / 2 - x0) * i) / 40; g.lineTo(x, u0 + 0.03 * Math.sin(x * 7 + seed) + 0.012 * Math.sin(x * 19 + seed * 2)); }
  g.lineTo(W / 2, D); g.closePath(); g.fill();
}
function road(g, pal, pts) {
  if (!pts) return;
  g.strokeStyle = pal.road; g.lineWidth = 0.045; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); pts.forEach(([x, u], i) => (i ? g.lineTo(x, u) : g.moveTo(x, u))); g.stroke();
  g.strokeStyle = pal.roadLine; g.lineWidth = 0.003; g.setLineDash([0.018, 0.016]);
  g.beginPath(); pts.forEach(([x, u], i) => (i ? g.lineTo(x, u) : g.moveTo(x, u))); g.stroke(); g.setLineDash([]);
}
export const ggSidePrint = {
  print(page, book, ground, pal, mask = false) {
    const W = book.width, D = book.depth;
    const box = page === 'near' ? [-W / 2, -D, W / 2, 0] : [-W / 2, 0, W / 2, D];
    return printTexture(box, (g) => {
      if (page === 'near') g.scale(1, -1); // draw in (x, u)
      if (mask) {
        g.fillStyle = '#fff'; g.fillRect(-W / 2, 0, W, D);
        g.fillStyle = '#000';
        land(g, '#000', page === 'near' ? (ground.marin || [-0.5, 0.78]) : (ground.sf || [-0.75, 0.78]), W, D, page === 'near' ? 1 : -1);
        return;
      }
      PRINTS[page](g, { W, D, pal, gr: ground });
    }, mask ? 250 : 1000, 2048);
  },
};

// ---------------------------------------------------------------- a card riding a slot along one half of a layer
// (the sailboat): a tab behind the layer runs in a slit cut along it. Idle: a slow drift. Drag: along the slot.
function sliderDeclare(s, book) {
  const { theta } = vAngles(s, book), [a, b] = s.slot || [0.12, 0.8];
  const sn = Math.sin(theta);
  return { on: s.on, slots: [{ page: a < 0 ? 'far' : 'near', u0: Math.min(Math.abs(a), Math.abs(b)) * sn, u1: Math.max(Math.abs(a), Math.abs(b)) * sn, x0: -0.75, x1: 0.75 }] };
}
export function layerSlider(ctx, s) {
  const pal = ctx.palette, host = ctx.pieces[s.on];
  if (!host?.mount?.frames) throw new Error(`layer-slider: '${s.on}' is not a V-fold layer`);
  const [a, b] = s.slot || [0.12, 0.8], side = a < 0 ? 'left' : 'right', y = s.y ?? 0.035;
  const boat = sailboatCard(pal, { x: 0, y: 0, h: s.h ?? 0.12 });
  const lift = new THREE.Group(); lift.add(boat); lift.traverse((m) => { if (m.isMesh) m.userData.noAO = true; });
  const slide = new THREE.Group(); slide.add(lift); slide.position.y = y;
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.02), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.userData.hitProxy = true; const ph = new THREE.Group(); ph.position.y = 0.06; ph.add(proxy); slide.add(ph);
  const holder = new THREE.Group(); holder.add(slide);
  // the slit: a thin dark cut along the layer, just above its foot
  const cut = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(b - a) + 0.03, 0.0032), new THREE.MeshBasicMaterial({ color: '#1d2a36', transparent: true, opacity: 0.4, depthWrite: false }));
  cut.position.set((a + b) / 2, y - 0.008, 0.0026); cut.renderOrder = 2; holder.add(cut);
  const lo = Math.min(a, b) + 0.04, hi = Math.max(a, b) - 0.04, amp = s.drift ?? 0.06;
  const st = { x: s.at ?? (a + b) / 2, base: s.at ?? (a + b) / 2, drag: false, grab: 0, want: 0, idleFrom: 0, hover: 0, hoverT: 0 };
  let tNow = 0;
  const place = () => { slide.position.x = st.x; lift.position.z = 0.003 * st.hover; lift.rotation.z = 0.02 * Math.sin(tNow * 1.3); };
  place();
  const targets = []; boat.traverse((m) => { if (m.isMesh) targets.push(m); }); targets.push(proxy);
  return {
    parts: [halfPart(holder, host.mount.frames, side)],
    proxies: [{ mesh: ph, size: 0.08 }],
    drag: {
      targets, obj: holder, axis: 2, local: true,
      hover(on) { st.hoverT = on ? 1 : 0; },
      begin(p) { st.drag = true; st.grab = p.x - st.x; st.want = st.x; },
      move(p) { st.want = slotLimit(p.x - st.grab, lo, hi, 0.012, 0.03); },
      end() { st.drag = false; st.base = Math.max(lo + amp, Math.min(hi - amp, st.x)); st.idleFrom = tNow + 2.5; },
      get active() { return st.drag; },
    },
    tick(t, dt, loops) {
      tNow = t;
      if (st.drag) st.x += (st.want - st.x) * Math.min(1, dt * 10);
      else if (loops && t > st.idleFrom) {
        // a slow drift along the slot, centred where the reader left it
        const target = st.base + amp * Math.sin((t - st.idleFrom) * 0.22);
        st.x += (target - st.x) * Math.min(1, dt * 1.5);
      }
      st.hover += (st.hoverT - st.hover) * Math.min(1, dt * 10);
      place();
      return 'slow';
    },
  };
}

export const declares = { vfoldLayer: layerDeclare, vBox: boxDeclare, fogLever: fogDeclare, skyDial: dialDeclare, deckFigure: (s) => ({ on: s.on }), layerSlider: sliderDeclare };
