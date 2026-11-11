// Kit: Filoli, Woodside, at Halloween. Every piece is a real paper mechanic:
//   estate          parallel walls on the far page: tree line, hipped roof with chimneys, brick facade (windows light at night)
//   pumpkin-arch    hero. Two die-cut straw arch cards (front and back) with puffy card pumpkins glued on
//   figure-front    the figure facing the reader, standing between the arch cards; her waving forearm is on a brad
//   gauze-curtain   a wood frame with vellum gauze hung from its bar; the tattered strips swing on their own
//   string-lights   posts on both pages with a fixed-length thread between them: slack when closed, strung when open
//   pumpkin-patch   folded-box hay bales, a jack-o'-lantern with a cut-out face, and one pumpkin that rolls in a slot (tap)
//   paper-bats      bats on wire sliders hidden behind the house by day, raised at night (like the moon)
//   grass-tufts     dry grass cards pinned at the base, swaying a little
//   page-print      what is printed flat on a page, as a decal over the spread print (lawns, paths, trails)
// Shared helpers used by baytrail.js are exported from here.
import * as THREE from 'three';
import { card, polyShape, printTexture, paperMaterial, aoStrip, glowSprite, glowTexture } from '../engine/paper.js';
import { paperBox } from './bridge.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- shared helpers
export const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function rng(seed = 1) { let a = (seed * 2654435761) >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function capsule(x0, y0, x1, y1, w) {
  const s = new THREE.Shape();
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1e-6, nx = -dy / L * w / 2, ny = dx / L * w / 2;
  s.moveTo(x0 + nx, y0 + ny); s.lineTo(x1 + nx, y1 + ny);
  s.absarc(x1, y1, w / 2, Math.atan2(ny, nx), Math.atan2(ny, nx) - Math.PI, true);
  s.lineTo(x0 - nx, y0 - ny);
  s.absarc(x0, y0, w / 2, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) - Math.PI, true);
  return s;
}
export function ellipse(x, y, rx, ry, rot = 0) { const s = new THREE.Shape(); s.absellipse(x, y, rx, ry, 0, Math.PI * 2, false, rot); return s; }
const pageSign = (page) => (page === 'near' ? 1 : -1);
// a part that stands as a wall at (page, x, u), with an optional extra offset applied by the caller
export const wallPart = (obj, page, x, u, extra = {}) => ({ obj, frame: (sp, m) => sp.wallFrame(page, x, u, m), ...extra });
// soft contact darkening on the page in front of / behind a wall
export function aoPart(page, x0, x1, u, depth = 0.035, strength = 0.28) {
  const ao = aoStrip(x0, x1, depth, strength); ao.position.z = pageSign(page) * u;
  const g = new THREE.Group(); g.add(ao);
  return { obj: g, frame: (sp, m) => sp.pageFrame(page, m), ao: true };
}
// additive light pool lying on a page (night)
export function poolMesh(color, w, d, opacity = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2;
  return m;
}
// printed card: a die-cut silhouette with a printed face
export function printedCard(pts, box, draw, o = {}) {
  const tex = printTexture(box, draw, o.px ?? 1100, 2048);
  const mat = paperMaterial('#fff', { map: tex, ...(o.emissiveMap ? { emissiveMap: o.emissiveMap, emissive: o.emissive || '#ffc98a' } : {}) });
  const shape = Array.isArray(pts) ? polyShape(pts) : pts;
  const m = card(shape, { material: mat, edgeColor: o.edge, depth: o.depth ?? 0.004, uvBox: box, curveSegments: o.curveSegments ?? 1, castShadow: o.castShadow ?? true });
  return { mesh: m, mat };
}

// ---------------------------------------------------------------- ground printers (engine hook 'ground:<preset>')
// What is printed flat on the two pages. PRINTS[preset][page](g, env) draws in (x, u) page coordinates;
// PRINTS[preset].water(g, env, page) paints water white for the water mask (golden sheen), optional.
export const PRINTS = {};
export function groundPrinter(preset) {
  return {
    print(page, book, ground, pal, mask = false) {
      const W = book.width, D = book.depth, P = PRINTS[preset];
      const box = page === 'near' ? [-W / 2, -D, W / 2, 0] : [-W / 2, 0, W / 2, D];
      return printTexture(box, (g) => {
        if (page === 'near') g.scale(1, -1); // draw in (x, u)
        const env = { W, D, pal, ground, page };
        if (mask) { g.fillStyle = '#000'; g.fillRect(-W / 2, 0, W, D); g.fillStyle = '#fff'; P.water?.(g, env, page); return; }
        P[page](g, env);
      }, mask ? 250 : 1000, 2048);
    },
  };
}
// Merge the static cards under a group into one mesh per material (draw calls). skip(obj) keeps an object
// (and everything under it) as it is: moving parts, tap targets, transparent vellum, AO decals.
function sliceGeo(geo, start, count) {
  const out = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(geo.attributes)) out.setAttribute(k, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize, a.normalized));
  return out;
}
export function mergeStatic(root, skip = () => false) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), buckets = new Map(), remove = [];
  root.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh) return;
    for (let a = m; a && a !== root; a = a.parent) if (skip(a)) return;
    const mats = [].concat(m.material);
    if (mats.some((mt) => mt.transparent || mt.userData?.noMerge) || m.userData.aoBase != null) return;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.attributes.position.count, materialIndex: 0 }];
    for (const gr of groups) {
      const mat = Array.isArray(m.material) ? mats[gr.materialIndex ?? 0] : m.material;
      const part = sliceGeo(geo, gr.start, Math.min(gr.count, geo.attributes.position.count - gr.start));
      const key = mat.uuid + '|' + Object.keys(part.attributes).sort().join(',') + '|' + m.castShadow;
      if (!buckets.has(key)) buckets.set(key, { mat, cast: m.castShadow, geos: [] });
      buckets.get(key).geos.push(part);
    }
    geo.dispose();
    remove.push(m);
  });
  for (const m of remove) m.parent.remove(m);
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat); mesh.castShadow = b.cast; mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}

// dry-grass texture strokes over an area (used by several prints)
export function grassStrokes(g, r, x0, x1, u0, u1, n, cols, len = 0.012, alpha = 0.35) {
  g.lineCap = 'round'; g.lineWidth = 0.0022;
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * r(), u = u0 + (u1 - u0) * r();
    g.strokeStyle = cols[(r() * cols.length) | 0]; g.globalAlpha = alpha * (0.5 + r() * 0.5);
    const a = -Math.PI / 2 + (r() - 0.5) * 0.9, l = len * (0.5 + r());
    g.beginPath(); g.moveTo(x, u); g.lineTo(x + Math.cos(a) * l * 0.5, u + Math.sin(a) * l); g.stroke();
  }
  g.globalAlpha = 1;
}

PRINTS.filoli = {};
PRINTS.filoli.near = (g, { W, D, pal }) => {
  const r = rng(11);
  g.fillStyle = pal.field; g.fillRect(-W / 2, 0, W, D);
  for (let i = 0; i < 22; i++) {
    const x = -W / 2 + r() * W, u = 0.05 + r() * (D - 0.08), rx = 0.05 + r() * 0.12;
    g.fillStyle = r() < 0.5 ? pal.fieldPatch : pal.fieldLight; g.globalAlpha = 0.35;
    g.beginPath(); g.ellipse(x, u, rx, rx * (0.3 + r() * 0.3), (r() - 0.5) * 0.4, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  grassStrokes(g, r, -W / 2, W / 2, 0, D, 5200, [pal.fieldDark, pal.fieldLight, pal.fieldDark], 0.014, 0.4);
  // the mown path from the front edge up to the arch
  g.fillStyle = pal.path;
  g.beginPath();
  const pathL = (u) => -0.07 - 0.03 * u + 0.05 * Math.sin(u * 2.4), pathR = (u) => 0.07 + 0.05 * u + 0.05 * Math.sin(u * 2.4);
  g.moveTo(pathL(0), 0);
  for (let u = 0; u <= D + 0.01; u += 0.02) g.lineTo(pathL(u), u);
  for (let u = D; u >= 0; u -= 0.02) g.lineTo(pathR(u), u);
  g.closePath(); g.fill();
  grassStrokes(g, r, -0.2, 0.25, 0, D, 900, [pal.fieldDark, pal.path], 0.008, 0.25);
  // straw scattered at the foot of the arch
  g.strokeStyle = pal.straw; g.lineWidth = 0.002;
  for (let i = 0; i < 260; i++) {
    const side = r() < 0.5 ? -1 : 1, x = side * (0.25 + r() * 0.12) + (r() - 0.5) * 0.06, u = 0.02 + r() * 0.22, a = r() * Math.PI, l = 0.01 + r() * 0.012;
    g.globalAlpha = 0.7; g.beginPath(); g.moveTo(x, u); g.lineTo(x + Math.cos(a) * l, u + Math.sin(a) * l); g.stroke();
  }
  g.globalAlpha = 1;
};
PRINTS.filoli.far = (g, { W, D, pal }) => {
  const r = rng(5);
  g.fillStyle = pal.field; g.fillRect(-W / 2, 0, W, D);
  grassStrokes(g, r, -W / 2, W / 2, 0, D, 3600, [pal.fieldDark, pal.fieldLight], 0.012, 0.35);
  // gravel forecourt in front of the house and the path to it
  g.fillStyle = pal.path;
  g.beginPath(); g.roundRect(-0.5, 0.3, 1.0, 0.1, 0.02); g.fill();
  g.beginPath(); g.moveTo(-0.07, 0); g.lineTo(0.07, 0); g.lineTo(0.06, 0.32); g.lineTo(-0.06, 0.32); g.closePath(); g.fill();
  // clipped hedge band at the foot of the trees
  g.fillStyle = pal.hedge; g.globalAlpha = 0.9;
  g.beginPath(); g.roundRect(-1.05, 0.5, 0.58, 0.07, 0.03); g.fill();
  g.beginPath(); g.roundRect(0.49, 0.5, 0.58, 0.07, 0.03); g.fill();
  g.globalAlpha = 1;
};

// ---------------------------------------------------------------- grass tufts (role: ground). layers: [{page,x,u,h,w,color,seed}]
export function grassTufts(ctx, s) {
  const pal = ctx.palette, parts = [], pivots = [];
  for (const [i, t] of s.layers.entries()) {
    const r = rng(t.seed ?? i + 3), n = t.blades ?? 7, w = t.w ?? 0.05, h = t.h;
    const shapes = [];
    for (let k = 0; k < n; k++) {
      const bx = -w / 2 + (w * (k + 0.5)) / n + (r() - 0.5) * 0.006;
      const lean = (bx / w) * 0.9 + (r() - 0.5) * 0.5, hh = h * (0.55 + 0.45 * r()), bw = 0.0045 + r() * 0.002;
      const tipx = bx + Math.sin(lean) * hh * 0.6;
      const sh = new THREE.Shape();
      sh.moveTo(bx - bw, 0); sh.quadraticCurveTo(bx - bw * 0.6 + (tipx - bx) * 0.3, hh * 0.55, tipx, hh);
      sh.quadraticCurveTo(bx + bw * 0.6 + (tipx - bx) * 0.3, hh * 0.5, bx + bw, 0); sh.closePath();
      shapes.push(sh);
    }
    const col = t.color || pal.tuft;
    const m = card(shapes, { color: col, depth: 0.0018, curveSegments: 4, edgeMix: 0.35 });
    const pivot = new THREE.Group(); pivot.add(m);
    const holder = new THREE.Group(); holder.add(pivot);
    pivots.push({ pivot, ph: r() * 6.28, f: 0.5 + r() * 0.35, a: t.sway ?? 0.035 });
    parts.push(wallPart(holder, t.page || 'near', t.x, t.u));
  }
  let k = 1;
  return {
    parts,
    dynamic(sp) { k = sp.upright ** 2; },
    tick(t) { for (const p of pivots) p.pivot.rotation.z = k * p.a * (Math.sin(t * p.f + p.ph) + 0.35 * Math.sin(t * p.f * 2.3 + p.ph * 2)); return 'draw'; },
  };
}

// ---------------------------------------------------------------- pumpkins
const PUMPKIN_SQ = 0.82;
export function pumpkinShape(r, sq = PUMPKIN_SQ) {
  const s = new THREE.Shape(), N = 72;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    let rr = r * (0.955 + 0.045 * Math.abs(Math.cos(a * 2.5)));
    let y = rr * sq * Math.sin(a);
    y -= r * 0.1 * Math.exp(-((a - Math.PI / 2) ** 2) / 0.05); // dimple where the stem goes in
    const p = [rr * Math.cos(a), y];
    i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]);
  }
  return s;
}
const pumpkinMats = new Map();
function pumpkinMaterial(color, rib) {
  const key = color + rib;
  if (pumpkinMats.has(key)) return pumpkinMats.get(key);
  const tex = printTexture([-1, -1, 1, 1], (g) => {
    g.fillStyle = color; g.fillRect(-1, -1, 2, 2);
    const hl = g.createRadialGradient(-0.35, 0.3, 0, -0.35, 0.3, 0.8);
    hl.addColorStop(0, 'rgba(255,240,215,0.28)'); hl.addColorStop(1, 'rgba(255,240,215,0)');
    g.fillStyle = hl; g.fillRect(-1, -1, 2, 2);
    g.strokeStyle = rib; g.lineWidth = 0.05; g.globalAlpha = 0.5;
    for (const k of [0.3, 0.62]) { g.beginPath(); g.ellipse(0, 0, k, PUMPKIN_SQ * 0.96, 0, Math.PI * 0.62, Math.PI * 1.38); g.stroke(); g.beginPath(); g.ellipse(0, 0, k, PUMPKIN_SQ * 0.96, 0, -Math.PI * 0.38, Math.PI * 0.38); g.stroke(); }
    g.beginPath(); g.moveTo(0, -PUMPKIN_SQ * 0.9); g.lineTo(0, PUMPKIN_SQ * 0.82); g.stroke();
    g.globalAlpha = 1;
  }, 120, 256);
  tex.userData.shared = true;
  const m = paperMaterial('#fff', { map: tex, noCache: true });
  m.userData.shared = true;
  pumpkinMats.set(key, m);
  return m;
}
// one puffy card pumpkin, centred on its own middle. Returns a group (the pumpkin + its stem).
export function makePumpkin(pal, r, color, o = {}) {
  const g = new THREE.Group();
  const rib = pal.pumpkinRib || '#7a3a1a';
  const body = card(pumpkinShape(r), { material: pumpkinMaterial(color, color === pal.pumpkinWhite ? '#b9b09a' : rib), edgeColor: color, depth: o.depth ?? Math.max(0.006, r * 0.42), bevel: Math.min(0.004, r * 0.14), bevelSegments: 3, uvBox: [-r, -r, r, r], curveSegments: 2 });
  g.add(body);
  const st = card(polyShape([[-r * 0.09, r * PUMPKIN_SQ * 0.78], [r * 0.08, r * PUMPKIN_SQ * 0.78], [r * 0.16, r * PUMPKIN_SQ * 1.18], [r * 0.03, r * PUMPKIN_SQ * 1.22]]), { color: pal.stem || '#6B5B3A', depth: 0.004 });
  st.position.z = 0.001; g.add(st);
  g.userData.meshes = [body, st];
  return g;
}

// ---------------------------------------------------------------- estate: tree line, roof, facade (far page)
function treeProfile(x0, x1, h, seed, o = {}) {
  const r = rng(seed), crowns = [];
  for (let x = x0 - 0.02; x < x1 + 0.03;) {
    const rc = 0.045 + r() * 0.06, spire = r() < (o.spires ?? 0.18);
    let hc = h * (0.62 + 0.38 * r());
    if (o.dip) { const [dx, dw, df] = o.dip; hc *= 1 - (1 - df) * Math.exp(-((x - dx) ** 2) / (dw * dw)); }
    crowns.push({ x, rc: spire ? rc * 0.62 : rc, hc: spire ? hc * 1.12 : hc, spire });
    x += rc * (0.8 + r() * 0.6);
  }
  const top = (x) => {
    let y = h * 0.32;
    for (const c of crowns) {
      const d = Math.abs(x - c.x);
      if (d >= c.rc) continue;
      const yy = c.spire ? c.hc - (d / c.rc) * c.rc * 2.1 : c.hc - c.rc + Math.sqrt(c.rc * c.rc - d * d);
      y = Math.max(y, yy);
    }
    const e = Math.min(1, (x - x0) / 0.02, (x1 - x) / 0.02);
    return y * Math.sqrt(Math.max(0.05, e));
  };
  return { top, crowns };
}
// a Main Street shop front (estate option shop / bulbs): display windows and a door at street level under a striped
// awning, a row of tall windows above, a cornice; bulbs along the top and down both sides. Everything glows at night.
function shopFacade(pal, s, ly, page, winMats) {
  const w = s.width / 2, hf = s.facadeH, box = [-w, 0, w, hf];
  const gh = Math.min(0.12, hf * 0.46), aw = 0.024, dw = 0.036, up0 = gh + aw + 0.022, up1 = hf - 0.03;
  const n = Math.max(1, Math.floor((2 * w - 0.03) / 0.058)), ux = (i) => -w + (2 * w * (i + 0.5)) / n, uw = Math.min(0.034, (2 * w) / n - 0.024);
  const bulbs = [];
  if (s.bulbs) {
    const bs = 0.0145, top = hf - 0.007;
    for (let x = -w + 0.007; x <= w - 0.006; x += bs) bulbs.push([x, top]);
    for (let y = top - bs; y > gh + aw + 0.006; y -= bs) bulbs.push([-w + 0.007, y], [w - 0.007, y]);
  }
  // option wash (0..1, off): at night the bulbs wash the facade warm from the top down, and the lit glass shades from the
  // ceiling light down to the sill instead of glowing flat
  const wash = s.wash || 0;
  let G = null;
  const shade = (y0, y1, col) => {
    if (!wash || !G) return col;
    const gr = G.createLinearGradient(0, y1, 0, y0); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(150,96,46,1)'); return gr;
  };
  const panes = (g, x0, x1, y0, y1, lit) => {
    g.fillStyle = lit ? shade(y0, y1, '#ffcf8a') : pal.glass; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (!lit) { g.fillStyle = 'rgba(255,214,150,0.22)'; g.fillRect(x0, y0, x1 - x0, (y1 - y0) * 0.55); g.fillStyle = 'rgba(230,236,245,0.14)'; g.beginPath(); g.moveTo(x0 + (x1 - x0) * 0.15, y0); g.lineTo(x0 + (x1 - x0) * 0.4, y0); g.lineTo(x0 + (x1 - x0) * 0.65, y1); g.lineTo(x0 + (x1 - x0) * 0.4, y1); g.fill(); }
    g.fillStyle = lit ? '#000' : pal.trim;
    for (let x = x0 + 0.032; x < x1 - 0.012; x += 0.032) g.fillRect(x - 0.001, y0, 0.002, y1 - y0);
  };
  const draw = (lit) => (g) => {
    const r = rng(Math.round((s.x ?? 0) * 100) + 7);
    if (lit) {
      G = g; g.fillStyle = '#000'; g.fillRect(-w, 0, 2 * w, hf);
      if (wash) { // the brick, lit by the bulbs: strongest under the top row, fading toward the awning
        const c = new THREE.Color(pal.brick), rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
        const gr = g.createLinearGradient(0, hf, 0, gh); gr.addColorStop(0, `rgba(${rgb},${0.55 * wash})`); gr.addColorStop(0.35, `rgba(${rgb},${0.25 * wash})`); gr.addColorStop(1, `rgba(${rgb},${0.1 * wash})`);
        g.fillStyle = gr; g.fillRect(-w, gh, 2 * w, hf - gh);
      }
    }
    else {
      g.fillStyle = pal.brick; g.fillRect(-w, 0, 2 * w, hf);
      g.strokeStyle = 'rgba(0,0,0,0.05)'; g.lineWidth = 0.0012; // clapboard
      for (let y = gh + aw + 0.01; y < hf; y += 0.007) { g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.stroke(); }
      g.fillStyle = pal.stone; g.fillRect(-w, 0, 2 * w, 0.013);
      g.fillStyle = pal.trim; g.fillRect(-w, hf - 0.018, 2 * w, 0.01); g.fillRect(-w, hf - 0.005, 2 * w, 0.005); // cornice
      for (let x = -w + 0.008; x < w; x += 0.012) g.fillRect(x, hf - 0.024, 0.005, 0.006); // dentils
      g.fillRect(-w, 0.013, 0.008, gh - 0.013); g.fillRect(w - 0.008, 0.013, 0.008, gh - 0.013); // pilasters
      g.fillRect(-w, gh - 0.004, 2 * w, 0.006);
    }
    // street level: display windows either side of the door, a kick plate under them
    if (!lit) { g.fillStyle = pal.trim; g.fillRect(-w + 0.008, 0.013, 2 * w - 0.016, 0.012); }
    panes(g, -w + 0.012, -dw / 2 - 0.006, 0.027, gh - 0.008, lit); panes(g, dw / 2 + 0.006, w - 0.012, 0.027, gh - 0.008, lit);
    g.fillStyle = lit ? shade(0.013, gh - 0.007, '#ffb866') : pal.door; g.fillRect(-dw / 2, 0.013, dw, gh - 0.02);
    if (!lit) { g.fillStyle = 'rgba(255,214,150,0.35)'; g.fillRect(-dw / 2 + 0.006, 0.05, dw - 0.012, gh - 0.07); }
    // the awning: a striped band with a scalloped edge
    if (!lit) {
      const a0 = gh + 0.002, st = 0.016;
      for (let x = -w, i = 0; x < w; x += st, i++) {
        g.fillStyle = i % 2 ? '#FBF6EC' : (pal.awning || '#C9554A');
        g.beginPath(); g.moveTo(x, a0 + aw); g.lineTo(x + st, a0 + aw); g.lineTo(x + st, a0 + 0.004); g.arc(x + st / 2, a0 + 0.004, st / 2, 0, Math.PI, true); g.closePath(); g.fill();
      }
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(-w, a0 + aw - 0.003, 2 * w, 0.003);
    }
    // upstairs: tall windows with trim
    for (let i = 0; i < n; i++) {
      const x = ux(i);
      if (!lit) { g.fillStyle = pal.trim; g.fillRect(x - uw / 2 - 0.005, up0 - 0.005, uw + 0.01, up1 - up0 + 0.01); g.fillRect(x - uw / 2 - 0.008, up1 + 0.005, uw + 0.016, 0.005); }
      if (lit && r() < 0.2) continue;
      g.fillStyle = lit ? shade(up0, up1, r() < 0.5 ? '#ffd9a0' : '#ffc27a') : pal.glass; g.fillRect(x - uw / 2, up0, uw, up1 - up0);
      g.fillStyle = lit ? '#000' : pal.trim; g.fillRect(x - 0.001, up0, 0.002, up1 - up0); g.fillRect(x - uw / 2, (up0 + up1) / 2 - 0.001, uw, 0.002);
    }
    for (const [x, y] of bulbs) {
      if (!lit) { g.fillStyle = 'rgba(90,70,50,0.35)'; g.beginPath(); g.arc(x, y, 0.0046, 0, 7); g.fill(); }
      g.fillStyle = lit ? '#fff2cf' : '#FFF6DF'; g.beginPath(); g.arc(x, y, lit ? 0.0048 : 0.0036, 0, 7); g.fill();
    }
  };
  const tex = printTexture(box, draw(false), 1600, 2048), em = printTexture(box, draw(true), 900, 1024);
  const mat = paperMaterial('#fff', { map: tex, emissiveMap: em, emissive: '#ffc98a' });
  winMats.push(mat);
  const mesh = card(polyShape([[-w, 0], [w, 0], [w, hf], [-w, hf]]), { material: mat, edgeColor: pal.brick, depth: 0.005, uvBox: box, curveSegments: 1 });
  return [wallPart(new THREE.Group().add(mesh), page, s.x ?? 0, ly.u), aoPart(page, -w, w, ly.u, 0.04, 0.32)];
}

// Options (all off by default; Filoli uses none): colors {brick, trim, roof, stone, door, glass, awning} override the
// palette for this instance; shop: true prints a ground-floor display window with a striped awning (a shop front, not
// a house); bulbs: true prints bulbs along the facade's top and side edges, lit at night.
export function estate(ctx, s) {
  const pal = s.colors ? { ...ctx.palette, ...s.colors } : ctx.palette, parts = [], page = s.page || 'far';
  const winMats = [];
  for (const ly of s.layers) {
    if (ly.kind === 'trees') {
      const { top, crowns } = treeProfile(ly.x0, ly.x1, ly.h, ly.seed ?? 3, ly);
      const pts = [[ly.x0, 0]];
      for (let x = ly.x0; x <= ly.x1 + 1e-6; x += 0.004) pts.push([x, top(x)]);
      pts.push([ly.x1, 0]);
      const box = [ly.x0, 0, ly.x1, ly.h * 1.25];
      const col = ly.color || pal.trees;
      const { mesh } = printedCard(pts, box, (g) => {
        g.fillStyle = col; g.fillRect(box[0], 0, box[2] - box[0], box[3]);
        // printed crown shading: a darker underside and a lighter sunlit edge on each crown
        for (const c of crowns) {
          const cy = c.spire ? c.hc - c.rc * 1.2 : c.hc - c.rc;
          g.fillStyle = 'rgba(0,0,0,0.13)'; g.beginPath(); g.ellipse(c.x + c.rc * 0.15, cy - c.rc * 0.45, c.rc * 0.95, c.rc * 0.6, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255,245,210,0.09)'; g.beginPath(); g.ellipse(c.x - c.rc * 0.3, cy + c.rc * 0.35, c.rc * 0.5, c.rc * 0.35, 0, 0, Math.PI * 2); g.fill();
        }
      }, { edge: col, px: 900 });
      parts.push(wallPart(new THREE.Group().add(mesh), page, 0, ly.u), aoPart(page, ly.x0, ly.x1, ly.u, 0.04, 0.3));
    } else if (ly.kind === 'roof') {
      const w = s.width / 2, hf = s.facadeH, top = hf + (ly.pitch ?? 0.075), inset = ly.inset ?? 0.1;
      const pts = [[-w - 0.018, hf - 0.022], [w + 0.018, hf - 0.022], [w - inset, top], [-w + inset, top]];
      const box = [-w - 0.02, hf - 0.03, w + 0.02, top + 0.01];
      const { mesh } = printedCard(pts, box, (g) => {
        g.fillStyle = pal.roof; g.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
        g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 0.0015;
        for (let y = hf - 0.015; y < top; y += 0.008) { g.beginPath(); g.moveTo(box[0], y); g.lineTo(box[2], y); g.stroke(); }
      }, { edge: pal.roof });
      const grp = new THREE.Group(); grp.add(mesh);
      // chimneys: brick stacks with a pale cap, glued to the roof card
      for (const cx of ly.chimneys || [-0.32, -0.2, 0.2, 0.32]) {
        const ch = card(polyShape([[cx - 0.017, hf], [cx + 0.017, hf], [cx + 0.017, top + 0.05], [cx - 0.017, top + 0.05]]), { color: pal.chimney, depth: 0.004 });
        ch.position.z = 0.003;
        const cap = card(polyShape([[cx - 0.021, top + 0.044], [cx + 0.021, top + 0.044], [cx + 0.021, top + 0.054], [cx - 0.021, top + 0.054]]), { color: pal.trim, depth: 0.004 });
        cap.position.z = 0.0035;
        grp.add(ch, cap);
      }
      parts.push(wallPart(mergeStatic(grp), page, s.x ?? 0, ly.u));
    } else if (ly.kind === 'facade' && (s.shop || s.bulbs)) {
      parts.push(...shopFacade(pal, s, ly, page, winMats));
    } else if (ly.kind === 'facade') {
      const w = s.width / 2, hf = s.facadeH;
      const pts = [[-w, 0], [w, 0], [w, hf], [-w, hf]];
      const box = [-w, 0, w, hf];
      const bays = s.bays ?? 7, bw = 0.042, mx = 0.075;
      const bx = (i) => -w + mx + ((2 * w - 2 * mx) * i) / (bays - 1);
      const rows = [[0.032, 0.066], [0.124, 0.056]];
      const win = (g, x, y0, hh, frame) => {
        if (frame) { g.fillStyle = pal.trim; g.fillRect(x - bw / 2 - 0.005, y0 - 0.005, bw + 0.01, hh + 0.01); }
        g.fillStyle = frame ? pal.glass : g.fillStyle; g.fillRect(x - bw / 2, y0, bw, hh);
        if (frame) { g.fillStyle = pal.trim; g.fillRect(x - 0.001, y0, 0.002, hh); g.fillRect(x - bw / 2, y0 + hh * 0.5 - 0.001, bw, 0.002); }
      };
      const tex = printTexture(box, (g) => {
        g.fillStyle = pal.brick; g.fillRect(-w, 0, 2 * w, hf);
        g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 0.0012;
        for (let y = 0.012; y < hf; y += 0.0055) { g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.stroke(); }
        g.fillStyle = pal.stone; g.fillRect(-w, 0, 2 * w, 0.013); // plinth
        g.fillStyle = pal.trim; g.fillRect(-w, hf - 0.016, 2 * w, 0.009); g.fillRect(-w, hf - 0.004, 2 * w, 0.004); // cornice
        g.fillStyle = pal.trim; g.fillRect(-w, 0.106, 2 * w, 0.004); // string course
        for (let i = 0; i < bays; i++) {
          const x = bx(i);
          if (i === (bays - 1) / 2) { // door: arched surround, panelled door
            g.fillStyle = pal.trim; g.beginPath(); g.moveTo(x - 0.03, 0.013); g.lineTo(x - 0.03, 0.07); g.arc(x, 0.07, 0.03, Math.PI, 0, true); g.lineTo(x + 0.03, 0.013); g.fill();
            g.fillStyle = pal.door; g.beginPath(); g.moveTo(x - 0.021, 0.013); g.lineTo(x - 0.021, 0.07); g.arc(x, 0.07, 0.021, Math.PI, 0, true); g.lineTo(x + 0.021, 0.013); g.fill();
          } else win(g, x, rows[0][0], rows[0][1], true);
          win(g, x, rows[1][0], rows[1][1], true);
        }
      }, 1400, 2048);
      const em = printTexture(box, (g) => {
        g.fillStyle = '#000'; g.fillRect(-w, 0, 2 * w, hf);
        const r = rng(4);
        for (let i = 0; i < bays; i++) for (const [ri, [y0, hh]] of rows.entries()) {
          const x = bx(i);
          if (ri === 0 && i === (bays - 1) / 2) { g.fillStyle = '#ffcf8a'; g.beginPath(); g.arc(x, 0.07, 0.018, Math.PI, 0, true); g.fill(); continue; }
          if (r() < 0.22) continue; // a few rooms stay dark
          g.fillStyle = r() < 0.5 ? '#ffd9a0' : '#ffc27a'; g.fillRect(x - bw / 2, y0, bw, hh);
          g.fillStyle = '#000'; g.fillRect(x - 0.001, y0, 0.002, hh); g.fillRect(x - bw / 2, y0 + hh * 0.5 - 0.001, bw, 0.002);
        }
      }, 700, 1024);
      const mat = paperMaterial('#fff', { map: tex, emissiveMap: em, emissive: '#ffc98a' });
      winMats.push(mat);
      const mesh = card(polyShape(pts), { material: mat, edgeColor: pal.brick, depth: 0.005, uvBox: box, curveSegments: 1 });
      parts.push(wallPart(new THREE.Group().add(mesh), page, s.x ?? 0, ly.u), aoPart(page, -w, w, ly.u, 0.04, 0.32));
    }
  }
  ctx.lamp((k) => { for (const m of winMats) m.emissiveIntensity = 1.5 * k; });
  return { parts };
}

// ---------------------------------------------------------------- pumpkin arch (hero)
function archOutline(W, H, legW, spring, seed) {
  // inverted U: outer edge with straw tufts poking out, inner edge smoother
  const r = rng(seed), outer = [], inner = [];
  const ro = W / 2, ri = W / 2 - legW, ryo = H - spring, ryi = H - spring - legW * 0.85;
  const N = 140;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 bottom-left .. 1 bottom-right along the outer edge
    const L1 = spring, L2 = (Math.PI / 2) * (ro + ryo), tot = 2 * L1 + L2, d = t * tot;
    let x, y, nx, ny;
    if (d < L1) { x = -ro; y = d; nx = -1; ny = 0; }
    else if (d > L1 + L2) { x = ro; y = tot - d; nx = 1; ny = 0; }
    else { const a = Math.PI - ((d - L1) / L2) * Math.PI; x = ro * Math.cos(a); y = spring + ryo * Math.sin(a); nx = Math.cos(a); ny = Math.sin(a); }
    const tuft = y > 0.03 ? (r() < 0.35 ? 0.004 + r() * 0.009 : r() * 0.003) : 0;
    outer.push([x + nx * tuft, y + ny * tuft]);
  }
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI;
    inner.push([ri * Math.cos(a), spring + ryi * Math.sin(a) + (r() - 0.5) * 0.004]);
  }
  return { pts: [...outer, [ri, 0], ...inner, [-ri, 0]], ro, ri, ryo, ryi };
}
export function pumpkinArch(ctx, s) {
  const pal = ctx.palette, parts = [], targets = [];
  const W = s.width ?? 0.62, H = s.height ?? 0.46, legW = s.legW ?? 0.085, spring = s.spring ?? 0.22;
  const front = s.layers.find((l) => l.kind === 'front'), back = s.layers.find((l) => l.kind === 'back');
  const page = s.page || 'near';
  const { pts, ro, ri, ryo, ryi } = archOutline(W, H, legW, spring, s.seed ?? 9);
  const box = [-ro - 0.02, 0, ro + 0.02, H + 0.025];
  const strawPrint = (base, seed) => (g) => {
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(box[0], 0, box[2] - box[0], box[3]);
    g.lineCap = 'round';
    for (let i = 0; i < 1600; i++) {
      const x = box[0] + r() * (box[2] - box[0]), y = r() * box[3];
      const a = Math.atan2(y - spring, x) + Math.PI / 2 + (r() - 0.5) * 0.9;
      const l = 0.008 + r() * 0.014;
      g.strokeStyle = r() < 0.5 ? pal.strawLight : pal.strawDark; g.globalAlpha = 0.55; g.lineWidth = 0.0018;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    g.globalAlpha = 1;
  };
  const mk = (base, seed) => printedCard(pts, box, strawPrint(base, seed), { edge: pal.straw, depth: 0.005, px: 1200 }).mesh;
  const frontCard = mk(pal.straw, 21), backCard = mk(pal.strawDark, 22);
  const fg = new THREE.Group(); fg.add(frontCard);
  const bg = new THREE.Group(); bg.add(backCard);
  // pumpkins glued along the arch: big ones at the feet, small ones over the top
  const r = rng(s.seed ?? 9);
  const cols = [pal.pumpkin, pal.pumpkinDeep, pal.pumpkin, pal.pumpkinYellow, pal.pumpkinWhite, pal.pumpkin, pal.pumpkinDeep, pal.gourd];
  const mid = (t) => { // centreline of the arch band, t 0..1 from bottom-left over the top to bottom-right
    const rm = (ro + ri) / 2, rym = (ryo + ryi) / 2, L1 = spring, L2 = (Math.PI / 2) * (rm + rym), tot = 2 * L1 + L2, d = t * tot;
    if (d < L1) return [-rm, d];
    if (d > L1 + L2) return [rm, tot - d];
    const a = Math.PI - ((d - L1) / L2) * Math.PI; return [rm * Math.cos(a), spring + rym * Math.sin(a)];
  };
  let ci = 0;
  for (let t = 0.035; t < 0.975;) {
    const edge = Math.min(t, 1 - t);
    const rad = (edge < 0.18 ? 0.04 : 0.028) + r() * 0.014;
    const [x, y] = mid(t);
    const side = (r() - 0.5) * legW * 0.55;
    const nx = t < 0.5 ? 1 : -1;
    const p = makePumpkin(pal, rad, cols[ci++ % cols.length]);
    p.position.set(x + (edge < 0.25 ? side * nx : side * 0.3), y + (edge < 0.25 ? 0 : side * 0.6), 0.008 + r() * 0.006);
    p.rotation.z = (r() - 0.5) * 0.5;
    fg.add(p);
    t += (rad * 1.55) / ((2 * spring + Math.PI / 2 * (ro + ri + ryo + ryi) / 2));
  }
  // straw tufts tucked between the pumpkins
  for (let i = 0; i < 16; i++) {
    const [x, y] = mid(0.04 + (i / 15) * 0.92);
    const blades = [];
    for (let k = 0; k < 6; k++) { const a = r() * Math.PI * 2, l = 0.014 + r() * 0.012; blades.push(capsule(0, 0, Math.cos(a) * l, Math.sin(a) * l, 0.003)); }
    const tuft = card(blades, { color: r() < 0.5 ? pal.straw : pal.strawDark, depth: 0.0018, curveSegments: 3 });
    tuft.position.set(x + (r() - 0.5) * 0.06, y + (r() - 0.5) * 0.05, 0.0045);
    fg.add(tuft);
  }
  mergeStatic(fg); mergeStatic(bg);
  parts.push(wallPart(fg, page, s.x ?? 0, front.u), wallPart(bg, page, s.x ?? 0, back.u));
  parts.push(aoPart(page, -ro, -ri, front.u, 0.05, 0.4), aoPart(page, ri, ro, front.u, 0.05, 0.4));
  return { parts, targets };
}

// ---------------------------------------------------------------- the figure, facing the reader, waving (forearm on a brad)
export function makeFrontFigure(pal, height = 0.16) {
  const c = pal.figure, g = new THREE.Group(), layers = [];
  const add = (shape, color, z, parent = g) => { const m = card(shape, { color, depth: 0.004, bevel: 0.001, curveSegments: 10 }); m.position.z = z; parent.add(m); layers.push(m); return m; };
  // hair behind the head (shoulder length)
  const hb = new THREE.Shape(); hb.moveTo(-0.098, 0.77); hb.quadraticCurveTo(-0.115, 0.9, -0.08, 0.97); hb.quadraticCurveTo(0, 1.03, 0.08, 0.97); hb.quadraticCurveTo(0.115, 0.9, 0.098, 0.77); hb.quadraticCurveTo(0, 0.74, -0.098, 0.77);
  add(hb, c.hair, -0.014);
  // legs: the left one mid-step (heel up), the right one planted
  add(capsule(-0.045, 0.42, -0.052, 0.085, 0.074), c.legsBack, -0.01);
  add(capsule(0.045, 0.42, 0.058, 0.05, 0.078), c.legs, -0.009);
  add(ellipse(-0.054, 0.07, 0.04, 0.026, 0.25), c.shoes, -0.006);
  add(ellipse(0.062, 0.032, 0.046, 0.028), c.shoes, -0.006);
  // coat, A-line with soft shoulders
  const coat = new THREE.Shape();
  coat.moveTo(-0.07, 0.8); coat.lineTo(0.07, 0.8); coat.quadraticCurveTo(0.118, 0.795, 0.122, 0.75);
  coat.lineTo(0.165, 0.37); coat.quadraticCurveTo(0, 0.345, -0.165, 0.37); coat.lineTo(-0.122, 0.75); coat.quadraticCurveTo(-0.118, 0.795, -0.07, 0.8);
  add(coat, c.coat, 0);
  add(polyShape([[-0.004, 0.36], [0.006, 0.36], [0.004, 0.74], [-0.004, 0.74]]), c.coatBack, 0.004);
  add(capsule(-0.095, 0.5, -0.04, 0.5, 0.012), c.coatBack, 0.004); // pocket flap
  // neck, head
  add(polyShape([[-0.024, 0.77], [0.024, 0.77], [0.024, 0.84], [-0.024, 0.84]]), c.skin, 0.003);
  add(ellipse(0, 0.893, 0.074, 0.08), c.skin, 0.006);
  // fringe with a side part
  const fr = new THREE.Shape();
  fr.absarc(0, 0.9, 0.082, -0.25, Math.PI + 0.25, false);
  fr.lineTo(-0.072, 0.86); fr.quadraticCurveTo(-0.05, 0.93, 0.02, 0.925); fr.quadraticCurveTo(0.06, 0.92, 0.078, 0.855);
  add(fr, c.hair, 0.009);
  // a hint of a face: two eyes and cheeks
  add(ellipse(-0.027, 0.885, 0.0075, 0.0095), c.hair, 0.01);
  add(ellipse(0.027, 0.885, 0.0075, 0.0095), c.hair, 0.01);
  add(ellipse(-0.043, 0.86, 0.014, 0.008), c.cheek || '#D9A08A', 0.0095);
  add(ellipse(0.043, 0.86, 0.014, 0.008), c.cheek || '#D9A08A', 0.0095);
  // scarf: a wrap round the neck and one tail down the front
  add(polyShape([[-0.072, 0.81], [0.072, 0.81], [0.066, 0.75], [-0.066, 0.75]]), c.scarf, 0.012);
  add(polyShape([[0.018, 0.78], [0.058, 0.78], [0.052, 0.56], [0.018, 0.575]]), c.scarf, 0.013);
  // left arm down, right arm up waving: upper arm fixed, forearm on a brad at the elbow
  add(capsule(-0.108, 0.76, -0.152, 0.47, 0.062), c.coat, 0.016);
  add(ellipse(-0.154, 0.455, 0.024, 0.026), c.skin, 0.017);
  add(capsule(0.108, 0.76, 0.2, 0.69, 0.062), c.coat, 0.016);
  const fore = new THREE.Group(); fore.position.set(0.2, 0.69, 0); g.add(fore);
  add(capsule(0, 0, 0.03, 0.17, 0.058), c.coat, 0.018, fore);
  add(ellipse(0.034, 0.2, 0.025, 0.028), c.skin, 0.019, fore);
  add(ellipse(0.2, 0.69, 0.012, 0.012), c.coatBack, 0.02); // the brad
  // optional: a bow headband (figure.bow; figure.bowDot prints dots on it) and a shoulder bag at her side
  // (figure.bag, figure.bagLight prints a check on it). Both are off unless the palette names them.
  if (c.bow) {
    const band = new THREE.Shape(); band.absarc(0, 0.9, 0.09, 0.32, Math.PI - 0.32, false); band.absarc(0, 0.9, 0.077, Math.PI - 0.32, 0.32, true);
    add(band, c.bow, 0.0098);
    const dot = c.bowDot;
    for (const sg of [-1, 1]) {
      const lobe = new THREE.Shape(); lobe.moveTo(0, 0.99);
      lobe.quadraticCurveTo(sg * 0.035, 1.055, sg * 0.078, 1.045); lobe.quadraticCurveTo(sg * 0.1, 1.0, sg * 0.082, 0.955); lobe.quadraticCurveTo(sg * 0.04, 0.95, 0, 0.99);
      add(lobe, c.bow, 0.0102);
      if (dot) for (const [dx, dy] of [[0.03, 1.012], [0.06, 1.028], [0.07, 0.975], [0.045, 0.975]]) add(ellipse(sg * dx, dy, 0.0075, 0.0075), dot, 0.0106);
    }
    add(ellipse(0, 0.99, 0.017, 0.021), c.bow, 0.0108);
  }
  if (c.bag) {
    add(capsule(-0.06, 0.795, -0.128, 0.49, 0.012), c.bag, 0.0165); // the strap over her shoulder
    const box = [-0.175, 0.37, -0.085, 0.5];
    const tex = printTexture(box, (q) => {
      q.fillStyle = c.bag; q.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
      q.fillStyle = c.bagLight || '#F1EEE4';
      for (let i = 0; i < 6; i++) for (let j = 0; j < 9; j++) if ((i + j) % 2) q.fillRect(box[0] + i * 0.015, box[1] + j * 0.0145, 0.015, 0.0145);
    }, 2000, 512);
    const bag = card(polyShape([[box[0], box[1]], [box[2], box[1]], [box[2] - 0.004, box[3]], [box[0] + 0.004, box[3]]]), { material: paperMaterial('#fff', { map: tex }), edgeColor: c.bag, depth: 0.004, bevel: 0.001, uvBox: box, curveSegments: 1 });
    bag.position.z = 0.0175; g.add(bag); layers.push(bag);
  }
  g.scale.setScalar(height);
  return { group: g, layers, fore };
}
function mergeFigure(fig) {
  mergeStatic(fig.group, (o) => o === fig.fore);
  fig.layers = []; fig.group.traverse((m) => { if (m.isMesh && m.userData.aoBase == null) fig.layers.push(m); });
}
export function figureFront(ctx, s) {
  const pal = ctx.palette, page = s.page || 'near';
  const fig = makeFrontFigure(pal, s.height ?? 0.16);
  mergeFigure(fig);
  const holder = new THREE.Group(); holder.add(fig.group);
  const blob = aoStrip(-0.04, 0.04, 0.03, 0.4); fig.group.parent.add(blob); blob.rotation.x = 0; // contact shadow at her feet
  blob.position.z = 0.004;
  let k = 1;
  return {
    parts: [wallPart(holder, page, s.x ?? 0, s.u)],
    targets: fig.layers,
    dynamic(sp) { k = sp.upright ** 2; },
    tick(t) {
      // a small wave every few seconds: the forearm swings on its brad, then rests
      const cyc = t % 7.5, env = sstep(0, 0.5, cyc) * (1 - sstep(2.6, 3.2, cyc));
      fig.fore.rotation.z = k * (-0.08 + env * 0.32 * Math.sin(cyc * 6.5));
      return env > 0.001 ? 'slow' : 'draw';
    },
  };
}

// ---------------------------------------------------------------- gauze curtain on a wood frame
export function gauzeCurtain(ctx, s) {
  const pal = ctx.palette, page = s.page || 'near';
  const { x0, x1 } = s, u = s.layers[0].u, H = s.layers[0].h - 0.01;
  const g = new THREE.Group();
  const wood = (w, h, x, y) => { const b = paperBox(w, h, 0.012, pal.wood, 0.002); b.position.set(x, y, -0.008); g.add(b); return b; };
  wood(0.014, H, x0, H / 2); wood(0.014, H, x1, H / 2); wood(x1 - x0 + 0.03, 0.012, (x0 + x1) / 2, H - 0.004);
  const mat = paperMaterial(pal.gauze, { translucent: true, opacity: s.opacity ?? 0.78, noCache: true });
  const matB = paperMaterial(pal.gauzeDeep || pal.gauze, { translucent: true, opacity: (s.opacity ?? 0.78) * 0.9, noCache: true });
  const r = rng(s.seed ?? 4);
  const top = H - 0.01;
  // left panel: gathered and tied to the post, flaring below the tie
  const lp = new THREE.Shape();
  lp.moveTo(x0 + 0.004, top); lp.lineTo(x0 + 0.13, top); lp.quadraticCurveTo(x0 + 0.06, top - 0.08, x0 + 0.03, 0.18);
  lp.quadraticCurveTo(x0 + 0.075, 0.1, x0 + 0.085, 0.03);
  for (let k = 0; k < 6; k++) lp.lineTo(x0 + 0.085 - (k + 0.5) * 0.013, 0.012 + r() * 0.035), lp.lineTo(x0 + 0.085 - (k + 1) * 0.013, 0.045 + r() * 0.02);
  lp.lineTo(x0 + 0.004, 0.05); lp.closePath();
  const left = card(lp, { material: mat, depth: 0.0015, curveSegments: 10 }); left.position.z = 0.004; g.add(left);
  const tie = card(polyShape([[x0 - 0.004, 0.17], [x0 + 0.045, 0.172], [x0 + 0.045, 0.19], [x0 - 0.004, 0.188]]), { color: pal.twine || pal.wood, depth: 0.003 });
  tie.position.z = 0.006; g.add(tie);
  // right panel: hangs from the bar on a pivot (the bar is the hinge); its tattered strips swing on their own
  const pivot = new THREE.Group(); pivot.position.set(0, top, 0.002); g.add(pivot);
  const a = x0 + 0.1, b = x1 - 0.004, cut = 0.17;
  const rp = new THREE.Shape(); rp.moveTo(a, 0); rp.lineTo(b, 0); rp.lineTo(b, cut - top); rp.lineTo(a, cut - top); rp.closePath();
  const main = card(rp, { material: mat, depth: 0.0015 }); pivot.add(main);
  const fold = card(polyShape([[a + 0.05, 0], [a + 0.075, 0], [a + 0.07, cut - top - 0.01], [a + 0.055, cut - top - 0.01]]), { material: matB, depth: 0.0016 });
  fold.position.z = 0.001; pivot.add(fold);
  const strips = [];
  for (let x = a; x < b - 0.004;) {
    const w = Math.min(b - x, 0.012 + r() * 0.016), len = 0.06 + r() * 0.1;
    const sh = new THREE.Shape(); sh.moveTo(0, 0.006); sh.lineTo(w, 0.006);
    sh.lineTo(w * (0.75 + r() * 0.2), -len * (0.7 + r() * 0.2)); sh.lineTo(w * 0.5, -len); sh.lineTo(w * (0.05 + r() * 0.2), -len * (0.75 + r() * 0.2)); sh.closePath();
    const st = card(sh, { material: r() < 0.3 ? matB : mat, depth: 0.0012, curveSegments: 2 });
    const sp = new THREE.Group(); sp.position.set(x, cut - top, 0.0005 + r() * 0.001); sp.add(st); pivot.add(sp);
    strips.push({ sp, ph: r() * 6.28, f: 0.7 + r() * 0.5 });
    x += w * (0.8 + r() * 0.3);
  }
  mergeStatic(g, (o) => o === pivot);
  const holder = new THREE.Group(); holder.add(g);
  let k = 1;
  return {
    parts: [wallPart(holder, page, 0, u), aoPart(page, x0 - 0.02, x1 + 0.02, u, 0.03, 0.2)],
    dynamic(sp) { k = sp.upright ** 2; },
    tick(t) {
      pivot.rotation.x = k * (0.05 * Math.sin(t * 0.55) + 0.02 * Math.sin(t * 1.3 + 1));
      for (const st of strips) { st.sp.rotation.x = k * 0.16 * Math.sin(t * st.f + st.ph); st.sp.rotation.z = k * 0.04 * Math.sin(t * st.f * 0.7 + st.ph * 1.3); }
      return 'slow';
    },
    setLight(L) {
      for (const m of [mat, matB]) { m.emissive.copy(L.keyColor).lerp(new THREE.Color('#ffffff'), 0.4); m.emissiveIntensity = 0.04 + 0.1 * L.day + 0.05 * L.night; }
    },
  };
}

// ---------------------------------------------------------------- string lights: posts on both pages, fixed-length thread
function sagCurve(a, b, L, n = 28) {
  const d = a.distanceTo(b), Lx = Math.max(L, d);
  const sag = Math.sqrt(Math.max(0, (3 * d * (Lx - d)) / 8)) + 0.0005;
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; const p = a.clone().lerp(b, t); p.y -= 4 * sag * t * (1 - t); pts.push(p); }
  return pts;
}
export function stringLights(ctx, s) {
  const pal = ctx.palette, parts = [], posts = {};
  for (const p of s.layers) {
    const g = new THREE.Group();
    const post = paperBox(0.01, p.h, 0.01, pal.wood, 0.002); post.position.y = p.h / 2; g.add(post);
    const cap = paperBox(0.016, 0.008, 0.016, pal.woodDark || pal.wood, 0.002); cap.position.y = p.h; g.add(cap);
    parts.push(wallPart(g, p.page, p.x, p.u));
    posts[p.id] = p;
  }
  const wireMat = paperMaterial(pal.wire || '#3B342E');
  const bulbMat = paperMaterial('#ffffff', { noCache: true }); bulbMat.color.set(pal.bulb || '#F3E3BF'); bulbMat.emissive.set(pal.bulbGlow || pal.lamp); bulbMat.emissiveIntensity = 0;
  const strings = [];
  const lineGroup = new THREE.Group(); lineGroup.matrixAutoUpdate = false;
  const r = rng(s.seed ?? 6);
  const nB = s.strings.reduce((a, st) => a + (st.bulbs ?? 9), 0);
  // all bulbs in one instanced mesh, all their glows in one Points layer (two draw calls, not 60)
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0055, 8, 6), bulbMat, nB); bulbs.castShadow = false;
  const gPos = new Float32Array(nB * 3), gCol = new Float32Array(nB * 3), tw = [];
  const gGeo = new THREE.BufferGeometry(); gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3)); gGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
  const gMat = new THREE.PointsMaterial({ map: glowTexture(), size: s.glowSize ?? 0.05, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, color: new THREE.Color(pal.bulbGlow || pal.lamp) });
  const glowPts = new THREE.Points(gGeo, gMat); glowPts.frustumCulled = false;
  lineGroup.add(bulbs, glowPts);
  let bi = 0;
  for (const st of s.strings) {
    const tube = new THREE.Mesh(new THREE.BufferGeometry(), wireMat); tube.castShadow = false;
    lineGroup.add(tube);
    const idx = [];
    for (let i = 0; i < (st.bulbs ?? 9); i++, bi++) { idx.push(bi); tw.push({ ph: r() * 6.28, f: 0.6 + r() * 0.9 }); }
    strings.push({ ...st, tube, idx, L: null });
  }
  const top = (sp, p) => new THREE.Vector3(0, p.h, 0).applyMatrix4(sp.wallFrame(p.page, p.x, p.u, new THREE.Matrix4()));
  const pools = [];
  for (const st of s.strings) {
    const A = posts[st.from], B = posts[st.to];
    if (!A || !B) throw new Error(`string-lights: unknown post in ${st.from} -> ${st.to}`);
    // a soft warm pool on the ground under the middle of each string (night only)
    const mx = (A.x + B.x) / 2, mu = (pageSign(A.page) * A.u + pageSign(B.page) * B.u) / 2;
    const pg = mu >= 0 ? 'near' : 'far';
    const pool = poolMesh(pal.bulbGlow || pal.lamp, Math.abs(A.x - B.x) + 0.2, 0.22); pool.position.set(mx, 0.0016, mu);
    const holder = new THREE.Group(); holder.add(pool);
    parts.push({ obj: holder, noFit: true, frame: (sp, m) => sp.pageFrame(pg, m) });
    pools.push(pool);
  }
  parts.push({ obj: lineGroup, frame: (sp, m) => m.identity() });
  let lamps = 0;
  function update(sp) {
    for (const st of strings) {
      const a = top(sp, posts[st.from]), b = top(sp, posts[st.to]);
      if (st.L == null) { const open = new THREE.Vector3(), o2 = new THREE.Vector3(); const sp0 = sp.constructor ? new sp.constructor(sp.D).set(Math.PI) : sp; open.copy(top(sp0, posts[st.from])); o2.copy(top(sp0, posts[st.to])); const sg = st.sag ?? 0.07; st.L = open.distanceTo(o2) * (1 + (8 / 3) * sg * sg); }
      const pts = sagCurve(a, b, st.L);
      st.tube.geometry.dispose();
      st.tube.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.0011, 4, false);
      const n = st.idx.length;
      st.idx.forEach((k, i) => {
        const t = (i + 1) / (n + 1), f = t * 28, i0 = Math.floor(f);
        _v.copy(pts[i0]).lerp(pts[Math.min(28, i0 + 1)], f - i0); _v.y -= 0.007;
        bulbs.setMatrixAt(k, _m.makeTranslation(_v.x, _v.y, _v.z)); gPos.set([_v.x, _v.y, _v.z], k * 3);
      });
    }
    bulbs.instanceMatrix.needsUpdate = true; gGeo.attributes.position.needsUpdate = true;
  }
  const _v = new THREE.Vector3(), _m = new THREE.Matrix4();
  function glow(t = 0) {
    tw.forEach(({ ph, f }, k) => { const v = lamps * (0.72 + 0.28 * Math.sin(t * f + ph)); gCol[k * 3] = gCol[k * 3 + 1] = gCol[k * 3 + 2] = v; });
    gGeo.attributes.color.needsUpdate = true;
    glowPts.visible = lamps > 0.01;
    bulbMat.emissiveIntensity = 1.6 * lamps;
  }
  ctx.lamp((k) => { lamps = k; glow(); for (const p of pools) p.material.opacity = 0.32 * k; });
  return {
    parts,
    dynamic(sp) { update(sp); },
    tick(t) { if (lamps > 0.01) glow(t); return 'draw'; },
  };
}

// ---------------------------------------------------------------- pumpkin patch: hay bales, jack-o'-lantern, a rolling pumpkin
function jackShape(r) {
  const s = pumpkinShape(r);
  const hole = (pts) => { const h = new THREE.Path(); pts.forEach(([x, y], i) => (i ? h.lineTo(x * r, y * r) : h.moveTo(x * r, y * r))); h.closePath(); s.holes.push(h); };
  hole([[-0.5, 0.12], [-0.18, 0.12], [-0.34, 0.42]]); // eyes
  hole([[0.18, 0.12], [0.5, 0.12], [0.34, 0.42]]);
  hole([[-0.08, -0.04], [0.08, -0.04], [0, 0.1]]); // nose
  hole([[-0.55, -0.2], [-0.35, -0.3], [-0.25, -0.2], [-0.12, -0.32], [0, -0.22], [0.12, -0.32], [0.25, -0.2], [0.35, -0.3], [0.55, -0.2], [0.3, -0.5], [-0.3, -0.5]]); // grin
  return s;
}
const baleFold = (sp) => Math.max(0.04, sstep(0.35, 0.95, sp.upright));
export function makeJack(pal, jr) {
  const face = card(jackShape(jr), { material: pumpkinMaterial(pal.pumpkin, pal.pumpkinRib || '#7a3a1a'), edgeColor: pal.pumpkin, depth: Math.max(0.008, jr * 0.24), bevel: Math.min(0.003, jr * 0.06), bevelSegments: 3, uvBox: [-jr, -jr, jr, jr], curveSegments: 2 });
  face.position.z = 0.006;
  const innerMat = paperMaterial(pal.jackInner || '#4A2A16', { noCache: true }); innerMat.emissive.set(pal.jackGlow || '#ffb24a');
  const inner = card(pumpkinShape(jr * 0.9), { material: innerMat, depth: 0.003 }); inner.position.z = -0.002;
  const stem = card(polyShape([[-jr * 0.1, jr * 0.6], [jr * 0.1, jr * 0.6], [jr * 0.18, jr * 1.02], [jr * 0.02, jr * 1.06]]), { color: pal.stem || '#6B5B3A', depth: 0.005 });
  stem.position.z = 0.006;
  const rock = new THREE.Group(); rock.add(face, inner, stem);
  face.position.y = inner.position.y = stem.position.y = jr * PUMPKIN_SQ;
  const group = new THREE.Group(); group.add(rock);
  const glow = glowSprite(pal.jackGlow || '#ffb24a', jr * 3.6); glow.position.set(0, jr * PUMPKIN_SQ, 0.03); group.add(glow);
  return { group, rock, innerMat, glow, meshes: [face, stem] };
}
export function pumpkinPatch(ctx, s) {
  const pal = ctx.palette, page = s.page || 'near', parts = [], targets = [], boxes = [];
  // hay bales: folded boxes, twine bands; they collapse flat as the page folds
  for (const b of s.bales || []) {
    const grp = new THREE.Group();
    const bale = paperBox(b.w, b.h, b.d, pal.hay, 0.004); bale.position.y = b.h / 2; grp.add(bale);
    for (const tx of [-b.w * 0.28, b.w * 0.28]) { const tw = paperBox(0.006, b.h + 0.002, b.d + 0.002, pal.hayDark, 0.001); tw.position.set(tx, b.h / 2, 0); grp.add(tw); }
    mergeStatic(grp);
    grp.position.set(b.x, b.y ?? 0, pageSign(page) * b.u);
    grp.rotation.y = b.rot ?? 0;
    const holder = new THREE.Group(); holder.add(grp);
    parts.push({ obj: holder, frame: (sp, m) => sp.pageFrame(page, m) });
    boxes.push({ grp, y: b.y ?? 0 });
  }
  // loose pumpkins standing on the ground (cards on a little foot tab)
  for (const p of s.pumpkins || []) {
    const pk = makePumpkin(pal, p.r, pal[p.color] || p.color || pal.pumpkin);
    pk.position.set(0, p.r * PUMPKIN_SQ, 0); pk.rotation.z = p.tilt ?? 0;
    const holder = new THREE.Group(); holder.add(pk);
    parts.push(wallPart(holder, page, p.x, p.u));
    targets.push(...pk.userData.meshes);
  }
  // jack-o'-lanterns: cut-out face over an inner card that glows at night. The big one sits on the bales.
  const jacks = [];
  const lift = new THREE.Matrix4();
  const addJack = (J, big) => {
    const jk = makeJack(pal, J.r);
    const jholder = new THREE.Group(); jholder.add(jk.group);
    // folded-box bales collapse as the page folds, so the lift follows the page angle
    parts.push({ obj: jholder, frame: (sp, m) => { sp.wallFrame(page, J.x, J.u, m); return m.multiply(lift.makeTranslation(0, (J.y ?? 0) * baleFold(sp), 0)); } });
    targets.push(...jk.meshes);
    const jpool = poolMesh(pal.jackGlow || '#ffb24a', big ? 0.34 : 0.16, big ? 0.24 : 0.11); jpool.position.set(J.x, 0.0018, pageSign(page) * (J.u + (big ? 0.07 : 0.03)));
    const jp = new THREE.Group(); jp.add(jpool);
    parts.push({ obj: jp, noFit: true, frame: (sp, m) => sp.pageFrame(page, m) });
    jacks.push({ ...jk, pool: jpool, big });
    return jk;
  };
  const J = s.jack, bigJack = addJack(J, true);
  const rock = bigJack.rock;
  for (const p of s.lanterns || []) addJack(p, false);
  // the roller: a pumpkin in a short slot. Tap: it rolls to the other end of the slot, bumps, settles.
  const R = s.roller, rr = R.r;
  const roller = makePumpkin(pal, rr, pal.pumpkin);
  const spin = new THREE.Group(); spin.add(roller); // rotates about its own centre
  const rh = new THREE.Group(); rh.add(spin); spin.position.y = rr * PUMPKIN_SQ;
  const st = { x: R.slot[0], from: R.slot[0], to: R.slot[0], t: 1, wob: 0, wt: 9 };
  parts.push({ obj: rh, frame: (sp, m) => sp.wallFrame(page, st.x, R.u, m) });
  targets.unshift(...roller.userData.meshes); // first, so debugScreen(id, 0, 'poke:0') finds the roller
  const cutGeo = new THREE.PlaneGeometry(R.slot[1] - R.slot[0] + rr * 1.6, 0.003); cutGeo.rotateX(-Math.PI / 2);
  const cut = new THREE.Mesh(cutGeo, new THREE.MeshBasicMaterial({ color: '#2a2016', transparent: true, opacity: 0.35, depthWrite: false }));
  cut.position.set((R.slot[0] + R.slot[1]) / 2, 0.0012, pageSign(page) * R.u); cut.userData.aoBase = 0.35; cut.renderOrder = 1;
  const ch = new THREE.Group(); ch.add(cut);
  parts.push({ obj: ch, frame: (sp, m) => sp.pageFrame(page, m), ao: true });

  ctx.lamp((k) => { for (const j of jacks) { j.innerMat.emissiveIntensity = 2.2 * k; j.glow.material.opacity = (j.big ? 0.6 : 0.5) * k; j.pool.material.opacity = (j.big ? 0.45 : 0.3) * k; } });
  let fold = 1;
  return {
    parts, targets,
    dynamic(sp) {
      fold = baleFold(sp);
      for (const b of boxes) { b.grp.scale.y = fold; b.grp.position.y = b.y * fold; }
    },
    tick(t, dt) {
      let busy = false;
      if (st.t < 1) {
        st.t = Math.min(1, st.t + dt / 1.6);
        const p = st.t, d = st.to - st.from;
        // ease out, a small bump back off the slot end, then rest
        const e = 1 - Math.pow(1 - Math.min(1, p / 0.75), 3);
        const bump = p > 0.75 ? -0.06 * Math.sin(((p - 0.75) / 0.25) * Math.PI) : 0;
        st.x = st.from + d * (e + bump);
        spin.rotation.z = -(st.x - R.slot[0]) / rr;
        busy = true;
      }
      if (st.wt < 2.2) {
        st.wt += dt;
        rock.rotation.z = 0.16 * Math.exp(-st.wt * 2.2) * Math.sin(st.wt * 11);
        busy = true;
      }
      return busy ? 'fast' : false;
    },
    pokes: [{ targets, run: () => roll() }],
    actions: { roll: () => roll() },
  };
  function roll() {
    if (st.t < 1) return;
    st.from = st.x; st.to = Math.abs(st.x - R.slot[0]) < 1e-3 ? R.slot[1] : R.slot[0]; st.t = 0; st.wt = 0.15;
  }
}

// ---------------------------------------------------------------- paper bats on wire sliders (role: sky)
function batShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.012);
  s.quadraticCurveTo(0.03, 0.03, 0.07, 0.022);
  s.quadraticCurveTo(0.062, 0.006, 0.054, 0.0); s.quadraticCurveTo(0.046, 0.01, 0.038, 0.0); s.quadraticCurveTo(0.03, 0.01, 0.02, -0.004);
  s.quadraticCurveTo(0.012, -0.004, 0.008, -0.012); s.lineTo(-0.008, -0.012);
  s.quadraticCurveTo(-0.012, -0.004, -0.02, -0.004); s.quadraticCurveTo(-0.03, 0.01, -0.038, 0.0); s.quadraticCurveTo(-0.046, 0.01, -0.054, 0.0); s.quadraticCurveTo(-0.062, 0.006, -0.07, 0.022);
  s.quadraticCurveTo(-0.03, 0.03, 0, 0.012);
  return s;
}
export function paperBats(ctx, s) {
  const pal = ctx.palette, parts = [], bats = [];
  const page = s.page || 'far';
  for (const [i, b] of s.layers.entries()) {
    const g = new THREE.Group();
    const wire = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 1, 0.0012), paperMaterial(pal.wire || '#3B342E')); wire.castShadow = false;
    g.add(wire);
    const body = new THREE.Group(); g.add(body);
    const scale = b.size ?? 1;
    const wingL = new THREE.Group(), wingR = new THREE.Group();
    const half = (side) => { const sh = batShape(); const m = card(sh, { color: pal.bat, edgeColor: pal.batEdge || '#8C8496', edgeMix: 0.45, depth: 0.0018, curveSegments: 6 }); m.scale.x = side; return m; };
    // each wing is the full silhouette clipped by scale: left and right halves pivot at the body
    const wl = half(1); wl.geometry = wl.geometry.clone(); wingL.add(wl);
    body.add(wingL);
    const head = card(ellipse(0, 0.016, 0.011, 0.013), { color: pal.bat, edgeColor: pal.batEdge || '#8C8496', edgeMix: 0.45, depth: 0.003 }); head.position.z = 0.001; body.add(head);
    const ears = card([polyShape([[-0.009, 0.024], [-0.002, 0.026], [-0.007, 0.036]]), polyShape([[0.009, 0.024], [0.002, 0.026], [0.007, 0.036]])], { color: pal.bat, depth: 0.002 }); ears.position.z = 0.001; body.add(ears);
    body.scale.setScalar(scale);
    const holder = new THREE.Group(); holder.add(g);
    const st = { y: b.hiddenH, sway: 0 };
    parts.push({ obj: holder, noFit: true, frame: (sp, m) => sp.wallFrame(page, b.x + st.sway, b.u, m) });
    bats.push({ b, g, body, wire, wingL, st, ph: i * 2.1 });
  }
  let up = 0;
  const place = (t = 0) => {
    for (const bt of bats) {
      const y = bt.b.hiddenH + (bt.b.nightH - bt.b.hiddenH) * up;
      bt.st.sway = 0.025 * Math.sin(t * 0.32 + bt.ph) * up;
      bt.body.position.y = y + 0.008 * Math.sin(t * 0.9 + bt.ph) * up;
      bt.body.rotation.z = 0.12 * Math.sin(t * 0.32 + bt.ph + 0.8) * up;
      // flap: the wing card flexes (squash in y), small and calm
      bt.wingL.scale.y = 1 - 0.35 * Math.max(0, Math.sin(t * 3.2 + bt.ph)) * up;
      bt.wire.scale.y = Math.max(0.001, bt.body.position.y - 0.012); bt.wire.position.y = bt.wire.scale.y / 2;
      bt.g.visible = up > 0.02;
    }
  };
  place();
  return {
    parts,
    setLight(L) { up = Math.max(0, Math.min(1, L.lamps * 1.1)); place(); },
    tick(t) { if (up < 0.02) return false; place(t); return 'draw'; },
  };
}
