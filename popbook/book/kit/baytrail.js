// Kit: the Bay Trail, Foster City. Every piece is a real paper mechanic:
//   ground:baytrail  printer: bay on the far page, shore, golden grass and the curving trail on the near page,
//                    with the two belt slots cut along the trail's lanes
//   drift-water      wave strips (scenery.waves) each riding its own short slot: a slow drift
//   far-shore        hazy hill walls across the water (scenery.hills) and a low town strip whose lights come on at night
//   shore-rocks      die-cut rock clusters with printed stones along the water's edge
//   shrub-bank       golden shrub walls; they also hide the two ends of the bike's belt
//   trail-post       wooden trail marker with two little signs (no words)
//   trail-lamps      lamp posts along the trail; heads and light pools on the trail at night
//   bike-rider       A rider on a bike: a figure with brads (wheels, cranks, knees) on a tab in a hidden belt loop
//                    along the trail. Out on the near lane, round a pulley behind the shrubs, back on the far lane.
//                    Headlight at night. Poke: she rings the bell (a little hop, two ring marks).
//   gull             a paper gull on a wire over the water, gliding along a slot (role: sky)
import * as THREE from 'three';
import { card, polyShape, printTexture, paperMaterial, aoStrip, glowSprite, glowTexture } from '../engine/paper.js';
import { paperBox } from './bridge.js';
import { waves } from './scenery.js';
import { sstep, rng, capsule, ellipse, wallPart, aoPart, poolMesh, printedCard, grassStrokes, PRINTS, mergeStatic } from './filoli.js';

const pageSign = (page) => (page === 'near' ? 1 : -1);

// ---------------------------------------------------------------- the trail's centre line, shared by the printer and the bike
// u(x) = u0 + bend * x^2 + tilt * x  (a soft curve that bows toward the water in the middle)
export const trailU = (t, x) => t.u0 + t.bend * x * x + t.tilt * x;
const shoreU = (sh, x) => sh.u + sh.amp * Math.sin(x * 3.1 + 0.7) + sh.amp * 0.5 * Math.sin(x * 7.3 + 2.0);

PRINTS.baytrail = {};
PRINTS.baytrail.far = (g, { W, D, pal }) => {
  g.fillStyle = pal.ocean; g.fillRect(-W / 2, 0, W, D);
  // haze toward the far shore
  const gr = g.createLinearGradient(0, 0.3, 0, D);
  gr.addColorStop(0, 'rgba(176,189,200,0)'); gr.addColorStop(1, 'rgba(176,189,200,0.55)');
  g.fillStyle = gr; g.fillRect(-W / 2, 0, W, D);
  const r = rng(31);
  g.strokeStyle = pal.foam; g.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const x = -W / 2 + r() * W, u = 0.05 + r() * 0.5, l = 0.03 + r() * 0.07;
    g.globalAlpha = 0.18 + r() * 0.2; g.lineWidth = 0.003;
    g.beginPath(); for (let k = 0; k <= 8; k++) { const t = k / 8; g.lineTo(x + t * l, u + 0.004 * Math.sin(t * Math.PI * 2)); } g.stroke();
  }
  g.globalAlpha = 1;
};
PRINTS.baytrail.near = (g, { W, D, pal, ground }) => {
  const r = rng(17), T = ground.trail, SH = ground.shore;
  g.fillStyle = pal.bay; g.fillRect(-W / 2, 0, W, D);
  const r2 = rng(5);
  g.strokeStyle = pal.foam; g.lineCap = 'round';
  for (let i = 0; i < 14; i++) { const x = -W / 2 + r2() * W, u = 0.02 + r2() * 0.08, l = 0.03 + r2() * 0.05; g.globalAlpha = 0.3; g.lineWidth = 0.003; g.beginPath(); g.moveTo(x, u); g.lineTo(x + l, u + 0.003); g.stroke(); }
  g.globalAlpha = 1;
  // land: damp sand and pebbles at the waterline, then golden grass
  const land = (off) => { g.beginPath(); g.moveTo(-W / 2, D); for (let x = -W / 2; x <= W / 2 + 0.01; x += 0.01) g.lineTo(x, shoreU(SH, x) + off); g.lineTo(W / 2, D); g.closePath(); };
  g.fillStyle = pal.wetSand; land(0); g.fill();
  g.strokeStyle = pal.foam; g.lineWidth = 0.004; g.globalAlpha = 0.8;
  g.beginPath(); for (let x = -W / 2; x <= W / 2 + 0.01; x += 0.01) g.lineTo(x, shoreU(SH, x)); g.stroke(); g.globalAlpha = 1;
  g.fillStyle = pal.grass; land(0.05); g.fill();
  for (let i = 0; i < 26; i++) { // soft patches: greener where it is damp, paler where it is dry
    const x = -W / 2 + r() * W, u = SH.u + 0.08 + r() * (D - SH.u - 0.1), rx = 0.05 + r() * 0.12;
    g.fillStyle = r() < 0.5 ? pal.grassPatch : pal.grassLight; g.globalAlpha = 0.35;
    g.beginPath(); g.ellipse(x, u, rx, rx * (0.3 + r() * 0.3), (r() - 0.5) * 0.4, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  grassStrokes(g, r, -W / 2, W / 2, SH.u + 0.04, D, 5200, [pal.grassDark, pal.grassLight, pal.grassDark], 0.013, 0.4);
  // dirt shoulders, then the asphalt band
  const band = (half) => {
    g.beginPath();
    for (let x = -W / 2 - 0.02; x <= W / 2 + 0.02; x += 0.01) g.lineTo(x, trailU(T, x) - half);
    for (let x = W / 2 + 0.02; x >= -W / 2 - 0.02; x -= 0.01) g.lineTo(x, trailU(T, x) + half);
    g.closePath();
  };
  g.fillStyle = pal.shoulder; band(T.width / 2 + 0.03); g.fill();
  grassStrokes(g, r, -W / 2, W / 2, 0.2, 0.75, 900, [pal.shoulderDark], 0.008, 0.25);
  g.fillStyle = pal.asphalt; band(T.width / 2); g.fill();
  // fine aggregate on the asphalt
  for (let i = 0; i < 2600; i++) {
    const x = -W / 2 + r() * W, u = trailU(T, x) + (r() - 0.5) * T.width;
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'; g.fillRect(x, u, 0.0025, 0.0025);
  }
  // the two belt slots, cut along the lanes (the mechanism, honestly shown)
  g.strokeStyle = 'rgba(25,22,20,0.38)'; g.lineWidth = 0.0028;
  for (const d of [-T.lane, T.lane]) { g.beginPath(); for (let x = T.x0 - 0.06; x <= T.x1 + 0.06; x += 0.01) g.lineTo(x, trailU(T, x) + d); g.stroke(); }
  // a pale dashed centre line
  g.strokeStyle = pal.trailLine; g.lineWidth = 0.004; g.setLineDash([0.03, 0.03]); g.globalAlpha = 0.8;
  g.beginPath(); for (let x = -W / 2; x <= W / 2; x += 0.01) g.lineTo(x, trailU(T, x)); g.stroke();
  g.setLineDash([]); g.globalAlpha = 1;
};
PRINTS.baytrail.water = (g, { W, D, ground }, page) => {
  if (page === 'far') { g.fillRect(-W / 2, 0, W, D); return; }
  const SH = ground.shore;
  g.beginPath(); g.moveTo(-W / 2, 0); for (let x = -W / 2; x <= W / 2 + 0.01; x += 0.01) g.lineTo(x, shoreU(SH, x)); g.lineTo(W / 2, 0); g.closePath(); g.fill();
};

// ---------------------------------------------------------------- drift-water: wave strips, each in its own short slot
export function driftWater(ctx, s) {
  const built = waves(ctx, s), parts = [], offs = s.rows.map(() => 0);
  const T = new THREE.Matrix4();
  built.parts.forEach((p, i) => {
    const row = Math.floor(i / 2), r = s.rows[row], page = r.page || 'near';
    const frame = p.ao
      ? (sp, m) => { sp.pageFrame(page, m); return m.multiply(T.makeTranslation(offs[row], 0, 0)); }
      : (sp, m) => sp.wallFrame(page, offs[row], r.u, m);
    parts.push({ ...p, frame });
  });
  const ph = s.rows.map((r, i) => (r.phase ?? i) * 1.7);
  return {
    parts,
    tick(t) { s.rows.forEach((r, i) => { offs[i] = (r.drift ?? 0.025) * Math.sin(t * (r.speed ?? 0.12) + ph[i]); }); return 'slow'; },
  };
}

// ---------------------------------------------------------------- far shore: hazy hills and a town strip with lights at night
export function farShore(ctx, s) {
  const pal = ctx.palette;
  const parts = [];
  for (const ly of s.layers.filter((l) => l.kind !== 'town')) {
    const page = ly.page || 'far', sd = ly.seed ?? 1;
    const top = (x) => {
      const t = (x - ly.x0) / (ly.x1 - ly.x0);
      let y = ly.h * (0.6 + 0.22 * Math.sin(x * 2.3 + sd) + 0.13 * Math.sin(x * 5.1 + sd * 2.3) + 0.05 * Math.sin(x * 12.7 + sd * 0.7));
      if (ly.peak != null) y += ly.h * 0.35 * Math.exp(-((t - ly.peak) ** 2) / 0.02);
      return y * Math.sqrt(Math.max(0.05, Math.min(1, t / 0.03, (1 - t) / 0.03)));
    };
    const pts = [[ly.x0, 0]];
    for (let x = ly.x0; x <= ly.x1 + 1e-6; x += 0.005) pts.push([x, top(x)]);
    pts.push([ly.x1, 0]);
    const box = [ly.x0, 0, ly.x1, ly.h * 1.5];
    const { mesh } = printedCard(pts, box, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, ly.h * 1.3);
      gr.addColorStop(0, ly.base || ly.color); gr.addColorStop(1, ly.color);
      g.fillStyle = gr; g.fillRect(box[0], 0, box[2] - box[0], box[3]);
      // soft printed folds of the hills
      g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 0.006;
      for (let k = 0; k < 7; k++) { const x = ly.x0 + ((k + 0.5) / 7) * (ly.x1 - ly.x0); g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + 0.04, top(x) * 0.5, x + 0.02, top(x) * 0.9); g.stroke(); }
    }, { edge: ly.color, depth: 0.004, px: 900 });
    parts.push(wallPart(new THREE.Group().add(mesh), page, 0, ly.u), aoPart(page, ly.x0, ly.x1, ly.u, 0.03, 0.2));
  }
  const town = s.layers.find((l) => l.kind === 'town');
  let pts = null, gCol = null, gGeo = null;
  if (town) {
    const r = rng(town.seed ?? 3), page = town.page || 'far';
    // a low strip of tiny pale blocks, the town on the far shore
    const prof = [[town.x0, 0]];
    const blocks = [];
    for (let x = town.x0; x < town.x1;) { const w = 0.006 + r() * 0.012, h = town.h * (0.35 + 0.65 * r()); if (r() < 0.75) { blocks.push([x, w, h]); prof.push([x, h], [x + w, h]); } else prof.push([x, town.h * 0.2], [x + w, town.h * 0.2]); x += w; }
    prof.push([town.x1, 0]);
    const box = [town.x0, 0, town.x1, town.h];
    const { mesh } = printedCard(prof, box, (g) => {
      g.fillStyle = town.color || pal.town; g.fillRect(town.x0, 0, town.x1 - town.x0, town.h);
      for (const [x, w, h] of blocks) if (r() < 0.5) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, 0, w * 0.6, h); }
    }, { edge: town.color || pal.town, depth: 0.002, px: 1400 });
    parts.push(wallPart(new THREE.Group().add(mesh), page, 0, town.u));
    // lights: one Points layer
    const n = town.lights ?? 46, pos = new Float32Array(n * 3);
    gCol = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const b = blocks[Math.floor(r() * blocks.length)]; pos.set([b[0] + r() * b[1], 0.002 + r() * b[2] * 0.8, 0.003], i * 3); }
    gGeo = new THREE.BufferGeometry(); gGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); gGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
    const mat = new THREE.PointsMaterial({ map: glowTexture(), size: town.glow ?? 0.022, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, color: new THREE.Color(pal.shoreLight || '#FFD9A0') });
    pts = new THREE.Points(gGeo, mat); pts.frustumCulled = false;
    const hold = new THREE.Group(); hold.add(pts);
    parts.push({ obj: hold, noFit: true, frame: (sp, m) => sp.wallFrame(page, 0, town.u, m) });
  }
  const tw = Array.from({ length: gCol ? gCol.length / 3 : 0 }, (_, i) => [Math.sin(i * 12.9898) * 0.5 + 0.5, 0.4 + (i % 5) * 0.15]);
  let k = 0;
  const light = (t = 0) => { if (!gCol) return; tw.forEach(([a, f], i) => { const v = k * (0.65 + 0.35 * Math.sin(t * f + a * 6.28)); gCol[i * 3] = gCol[i * 3 + 1] = gCol[i * 3 + 2] = v; }); gGeo.attributes.color.needsUpdate = true; pts.visible = k > 0.01; };
  ctx.lamp((v) => { k = v; light(); });
  return { parts, tick(t) { if (k > 0.01) { light(t); return 'draw'; } return false; } };
}

// ---------------------------------------------------------------- shore rocks: die-cut clusters with printed stones
export function shoreRocks(ctx, s) {
  const pal = ctx.palette, parts = [];
  s.layers.forEach((ly, i) => {
    const r = rng(ly.seed ?? i + 5), page = ly.page || 'near';
    const stones = [];
    for (let x = ly.x0; x < ly.x1;) { const w = 0.02 + r() * 0.035, h = ly.h * (0.45 + 0.55 * r()); stones.push([x + w / 2, w / 2, h, (r() * 3) | 0]); x += w * (0.55 + r() * 0.35); }
    const top = (x) => { let y = 0.003; for (const [cx, rx, h] of stones) { const d = (x - cx) / rx; if (Math.abs(d) < 1) y = Math.max(y, h * Math.sqrt(1 - d * d) ** 0.7); } return y; };
    const pts = [[ly.x0, 0]];
    for (let x = ly.x0; x <= ly.x1; x += 0.003) pts.push([x, top(x)]);
    pts.push([ly.x1, 0]);
    const box = [ly.x0 - 0.01, 0, ly.x1 + 0.01, ly.h * 1.05];
    const cols = pal.rocks;
    const { mesh } = printedCard(pts, box, (g) => {
      g.fillStyle = cols[1]; g.fillRect(box[0], 0, box[2] - box[0], box[3]);
      for (const [cx, rx, h, c] of stones) {
        g.fillStyle = cols[c]; g.beginPath(); g.ellipse(cx, 0, rx, h, 0, 0, Math.PI); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.0018; g.beginPath(); g.ellipse(cx, 0, rx * 0.98, h * 0.98, 0, Math.PI * 0.25, Math.PI * 0.8); g.stroke();
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(cx + rx * 0.3, 0, rx * 0.6, h * 0.5, 0, 0, Math.PI); g.fill();
      }
    }, { edge: cols[2], depth: 0.004, px: 1200 });
    parts.push(wallPart(new THREE.Group().add(mesh), page, 0, ly.u), aoPart(page, ly.x0, ly.x1, ly.u, 0.025, 0.3));
  });
  return { parts };
}

// ---------------------------------------------------------------- shrub bank: golden shrubs with dry grass spikes
export function shrubBank(ctx, s) {
  const pal = ctx.palette, parts = [];
  s.layers.forEach((ly, i) => {
    const r = rng(ly.seed ?? i + 2), page = ly.page || 'near', col = ly.color || pal.shrub;
    const bumps = [];
    for (let x = ly.x0; x < ly.x1 + 0.02;) { const rc = 0.03 + r() * 0.05; bumps.push([x, rc, ly.h * (0.6 + 0.4 * r())]); x += rc * (0.9 + r() * 0.6); }
    const env = (x) => Math.min(1, (x - ly.x0) / (ly.taperL ?? 0.06), (ly.x1 - x) / (ly.taperR ?? 0.06));
    const top = (x) => { let y = ly.h * 0.25; for (const [cx, rc, h] of bumps) { const d = Math.abs(x - cx); if (d < rc) y = Math.max(y, h - rc + Math.sqrt(rc * rc - d * d)); } return y * Math.sqrt(Math.max(0.03, env(x))); };
    const pts = [[ly.x0, 0]];
    for (let x = ly.x0; x <= ly.x1; x += 0.004) {
      let y = top(x);
      if (r() < 0.22) y += 0.008 + r() * 0.018; // dry grass spikes poking out
      pts.push([x, y]);
    }
    pts.push([ly.x1, 0]);
    const box = [ly.x0, 0, ly.x1, ly.h * 1.3];
    const { mesh } = printedCard(pts, box, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, ly.h);
      gr.addColorStop(0, pal.shrubDark); gr.addColorStop(0.6, col); gr.addColorStop(1, ly.tip || pal.shrubLight);
      g.fillStyle = gr; g.fillRect(box[0], 0, box[2] - box[0], box[3]);
      g.lineCap = 'round';
      for (let k = 0; k < (ly.x1 - ly.x0) * 2200; k++) {
        const x = ly.x0 + r() * (ly.x1 - ly.x0), y = r() * ly.h, l = 0.01 + r() * 0.02, a = Math.PI / 2 + (r() - 0.5) * 0.6;
        g.strokeStyle = r() < 0.5 ? pal.shrubLight : pal.shrubDark; g.globalAlpha = 0.35; g.lineWidth = 0.002;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      for (const [cx, rc, h] of bumps) { g.globalAlpha = 0.12; g.fillStyle = '#000'; g.beginPath(); g.ellipse(cx + rc * 0.3, h - rc * 1.2, rc * 0.8, rc * 0.5, 0, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }, { edge: col, depth: 0.004, px: 1000 });
    parts.push(wallPart(new THREE.Group().add(mesh), page, 0, ly.u), aoPart(page, ly.x0, ly.x1, ly.u, 0.04, 0.32));
  });
  return { parts };
}

// ---------------------------------------------------------------- trail post with two little signs (no words)
export function trailPost(ctx, s) {
  const pal = ctx.palette, page = s.page || 'near', h = s.layers[0].h;
  const g = new THREE.Group();
  const post = paperBox(0.02, h, 0.02, pal.wood, 0.003); post.position.y = h / 2; g.add(post);
  const sign = (y, hh, base, draw) => {
    const box = [-0.016, 0, 0.016, hh];
    const { mesh } = printedCard([[-0.016, 0], [0.016, 0], [0.016, hh], [-0.016, hh]], box, (gg) => { gg.fillStyle = base; gg.fillRect(-0.016, 0, 0.032, hh); draw(gg); }, { edge: base, depth: 0.002, px: 3000 });
    mesh.position.set(0, y, 0.011); g.add(mesh);
  };
  sign(h - 0.05, 0.036, pal.signWhite, (gg) => { gg.fillStyle = pal.signGreen; gg.fillRect(-0.012, 0.02, 0.024, 0.012); gg.fillStyle = '#3a3a3a'; gg.fillRect(-0.01, 0.006, 0.02, 0.004); gg.fillRect(-0.01, 0.013, 0.014, 0.003); });
  sign(h - 0.098, 0.04, pal.signYellow, (gg) => { gg.fillStyle = '#2a2a2a'; gg.fillRect(-0.012, 0.028, 0.024, 0.004); gg.beginPath(); gg.arc(-0.005, 0.013, 0.005, 0, 7); gg.arc(0.006, 0.013, 0.005, 0, 7); gg.fill(); });
  const cap = paperBox(0.024, 0.006, 0.024, pal.woodDark || pal.wood, 0.002); cap.position.y = h + 0.003; g.add(cap);
  mergeStatic(g);
  const blob = aoStrip(-0.03, 0.03, 0.03, 0.35); g.add(blob);
  return { parts: [wallPart(g, page, s.x, s.layers[0].u)] };
}

// ---------------------------------------------------------------- trail lamps
export function trailLamps(ctx, s) {
  const pal = ctx.palette, parts = [], glows = [], pools = [], heads = [];
  const headMat = paperMaterial('#ffffff', { noCache: true }); headMat.color.set(pal.lampGlass || '#E8E2CF'); headMat.emissive.set(pal.lamp);
  for (const l of s.layers) {
    const page = l.page || 'near', g = new THREE.Group();
    const post = paperBox(0.009, l.h, 0.009, pal.lampPost, 0.002); post.position.y = l.h / 2; g.add(post);
    const base = paperBox(0.018, 0.012, 0.018, pal.lampPost, 0.003); base.position.y = 0.006; g.add(base);
    const head = paperBox(0.02, 0.026, 0.02, '#ffffff', 0.003); head.material = headMat; head.position.y = l.h + 0.012; g.add(head);
    const roof = paperBox(0.03, 0.006, 0.03, pal.lampPost, 0.002); roof.position.y = l.h + 0.028; g.add(roof);
    mergeStatic(g, (o) => o === head);
    heads.push(head);
    const glow = glowSprite(pal.lamp, 0.11); glow.position.y = l.h + 0.012; glow.position.z = 0.012; g.add(glow); glows.push(glow);
    parts.push(wallPart(g, page, l.x, l.u));
    const pool = poolMesh(pal.lamp, 0.3, 0.2); pool.position.set(l.x + 0.03, 0.0015, pageSign(page) * (l.u + 0.05));
    const ph = new THREE.Group(); ph.add(pool); pools.push(pool);
    parts.push({ obj: ph, noFit: true, frame: (sp, m) => sp.pageFrame(page, m) });
  }
  ctx.lamp((k) => { headMat.emissiveIntensity = 1.8 * k; for (const g of glows) g.material.opacity = 0.8 * k; for (const p of pools) p.material.opacity = 0.42 * k; });
  return { parts };
}

// ---------------------------------------------------------------- A rider on a bike
// Unit: book units, rider facing +x. Wheels, cranks and knees are brads; everything is a card.
function ring(r0, r1) { const s = new THREE.Shape(); s.absarc(0, 0, r1, 0, Math.PI * 2, false); const h = new THREE.Path(); h.absarc(0, 0, r0, 0, Math.PI * 2, true); s.holes.push(h); return s; }
export function makeCyclist(pal) {
  const c = pal.figure, b = pal.bike;
  const root = new THREE.Group(); // the whole bike + rider (hop, wheelie pivot at the rear contact)
  const add = (shape, color, z, parent = root, o = {}) => { const m = card(shape, { color, depth: o.depth ?? 0.0016, bevel: 0.0004, curveSegments: o.seg ?? 10, edgeMix: o.edgeMix ?? 0.6 }); m.position.z = z; parent.add(m); return m; };
  const R = 0.03, rear = [-0.043, R], front = [0.044, R], BB = [-0.003, 0.027];
  const seatTop = [-0.017, 0.07], headTop = [0.031, 0.072], headBot = [0.035, 0.058];
  // wheels (spin on their hubs)
  const wheels = [];
  for (const [hx, hy] of [rear, front]) {
    const w = new THREE.Group(); w.position.set(hx, hy, 0); root.add(w);
    add(ring(R - 0.0045, R), b.tire, -0.0012, w, { seg: 32 });
    add(ring(R - 0.0062, R - 0.0045), b.rim, -0.0011, w, { seg: 32 });
    const sp = [];
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI; sp.push(capsule(-Math.cos(a) * (R - 0.005), -Math.sin(a) * (R - 0.005), Math.cos(a) * (R - 0.005), Math.sin(a) * (R - 0.005), 0.0012)); }
    add(sp, b.spoke, -0.0014, w, { seg: 3, edgeMix: 0.2 });
    add(ellipse(0, 0, 0.0035, 0.0035), b.hub, -0.0008, w);
    wheels.push(w);
  }
  // far crank + far leg are behind the frame
  const tube = (p, q, w = 0.0034) => capsule(p[0], p[1], q[0], q[1], w);
  const legs = [];
  const makeLeg = (z, col, shoe) => {
    const thigh = new THREE.Group(), shin = new THREE.Group();
    root.add(thigh); thigh.add(shin);
    add(capsule(0, 0, 0.037, 0, 0.0105), col, z, thigh);
    shin.position.set(0.037, 0, 0);
    add(capsule(0, 0, 0.04, 0, 0.0088), col, z + 0.0001, shin);
    const foot = new THREE.Group(); foot.position.set(0.04, 0, 0); shin.add(foot);
    add(ellipse(0.004, 0, 0.0085, 0.0045), shoe, z + 0.0002, foot);
    return { thigh, shin, foot };
  };
  const crank = (z) => { const g = new THREE.Group(); g.position.set(BB[0], BB[1], 0); root.add(g); add(capsule(0, 0, 0.012, 0, 0.003), b.crank, z, g); add(polyShape([[0.009, -0.0015], [0.016, -0.0015], [0.016, 0.0015], [0.009, 0.0015]]), b.crank, z + 0.0002, g); return g; };
  const crankFar = crank(-0.003);
  legs.push(makeLeg(-0.0035, c.legsBack, c.shoes));
  // frame
  add([tube(rear, BB), tube(rear, seatTop), tube(BB, seatTop, 0.0042), tube(seatTop, headTop, 0.004), tube(BB, headBot, 0.0046), tube(headBot, front, 0.0034), tube(headBot, headTop, 0.0048)], b.frame, 0, root, { seg: 6 });
  add(ellipse(BB[0], BB[1], 0.0055, 0.0055), b.frame, 0.0002);
  // fender-ish chain guard, saddle, bars, basket, bell
  add(polyShape([[-0.04, 0.029], [-0.004, 0.024], [-0.002, 0.031], [-0.038, 0.034]]), b.guard, 0.0004);
  add(capsule(-0.029, 0.077, -0.011, 0.079, 0.0055), b.saddle, 0.0006);
  add(tube([-0.017, 0.07], [-0.02, 0.077], 0.0032), b.crank, 0.0005);
  add(tube(headTop, [0.03, 0.086], 0.0032), b.crank, 0.0006);
  add(tube([0.03, 0.086], [0.041, 0.087], 0.003), b.crank, 0.0007);
  const basket = add(polyShape([[0.042, 0.06], [0.07, 0.06], [0.073, 0.084], [0.04, 0.084]]), b.basket, 0.0008);
  add(polyShape([[0.042, 0.068], [0.071, 0.068], [0.071, 0.07], [0.042, 0.07]]), b.basketDark, 0.0009);
  add(polyShape([[0.042, 0.076], [0.072, 0.076], [0.072, 0.078], [0.042, 0.078]]), b.basketDark, 0.0009);
  const bell = add(ellipse(0.036, 0.0905, 0.0035, 0.003), b.bell, 0.001);
  // rider: torso, head, helmet, ponytail, scarf, arm
  const torso = new THREE.Group(); root.add(torso);
  add(capsule(-0.019, 0.083, -0.004, 0.128, 0.026), c.coat, 0.002, torso);
  add(capsule(-0.026, 0.085, -0.008, 0.088, 0.016), c.legs, 0.0019, torso); // seat of the leggings over the saddle
  const head = new THREE.Group(); head.position.set(0.002, 0.146, 0); torso.add(head);
  const pony = new THREE.Group(); pony.position.set(-0.009, 0.004, 0); head.add(pony);
  add(capsule(0, 0, -0.012, -0.012, 0.007), c.hair, 0.0018, pony);
  add(ellipse(0, 0, 0.0105, 0.0115), c.skin, 0.0024, head);
  add(polyShape([[-0.011, 0.002], [0.002, 0.003], [0.0, 0.009], [-0.011, 0.007]]), c.hair, 0.0026, head);
  const helmet = new THREE.Shape(); helmet.absarc(-0.0005, 0.0015, 0.0125, 0, Math.PI, false); helmet.lineTo(-0.013, 0.0015); helmet.lineTo(0.012, 0.0015);
  add(helmet, b.helmet, 0.0028, head);
  add(polyShape([[-0.004, 0.012], [0.004, 0.0125], [0.0025, 0.0138], [-0.003, 0.0136]]), b.helmetStripe, 0.003, head);
  add(ellipse(0.0065, -0.0005, 0.0013, 0.0016), c.hair, 0.0029, head); // eye
  const scarf = new THREE.Group(); scarf.position.set(-0.004, 0.13, 0); torso.add(scarf);
  add(capsule(-0.002, 0.0, 0.01, 0.002, 0.008), c.scarf, 0.0031, scarf);
  const tail = new THREE.Group(); tail.position.set(-0.002, 0.0, 0); scarf.add(tail);
  add(polyShape([[0, 0.003], [-0.02, -0.001], [-0.022, -0.007], [0, -0.004]]), c.scarf, 0.003, tail);
  // near leg, near crank, near arm in front of everything
  const crankNear = crank(0.0042);
  legs.push(makeLeg(0.0045, c.legs, c.shoes));
  add([capsule(-0.006, 0.124, 0.017, 0.101, 0.0085), capsule(0.017, 0.101, 0.039, 0.087, 0.0075)], c.coat, 0.0052, torso);
  add(ellipse(0.04, 0.087, 0.0045, 0.0045), c.skin, 0.0054, torso);
  // night lights
  const head1 = glowSprite('#FFF1C8', 0.06); head1.position.set(0.072, 0.07, 0.004); root.add(head1);
  const tailL = glowSprite('#ff4a36', 0.03); tailL.position.set(-0.07, 0.05, 0.002); root.add(tailL);
  const beam = poolMesh('#FFE7B0', 0.16, 0.06); beam.position.set(0.14, 0.0012, 0); root.add(beam);
  const lampLens = add(ellipse(0.071, 0.07, 0.0028, 0.0028), '#F6EBC8', 0.0012);
  // ring marks for the bell (hidden until rung)
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.ringMark || '#FAF9F5'), transparent: true, opacity: 0, depthWrite: false });
  const ringG = new THREE.Group(); ringG.position.set(0.036, 0.095, 0.004); root.add(ringG);
  for (const [a, rr] of [[0.6, 0.009], [0.6, 0.015]]) {
    const arc = new THREE.Shape(); arc.absarc(0, 0, rr + 0.0011, Math.PI / 2 - a, Math.PI / 2 + a, false); arc.absarc(0, 0, rr - 0.0011, Math.PI / 2 + a, Math.PI / 2 - a, true);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(arc, 8), ringMat); ringG.add(m);
  }
  // two-bone IK for each leg: hip to pedal
  const hip = [-0.017, 0.082], L1 = 0.037, L2 = 0.04, crankR = 0.012;
  function pose(theta) {
    crankNear.rotation.z = theta; crankFar.rotation.z = theta + Math.PI;
    [theta + Math.PI, theta].forEach((th, i) => {
      const leg = legs[i];
      const px = BB[0] + Math.cos(th) * (crankR + 0.0005), py = BB[1] + Math.sin(th) * (crankR + 0.0005);
      const dx = px - hip[0], dy = py - hip[1], d = Math.min(L1 + L2 - 1e-4, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx), k = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
      const thighA = a + k; // knee forward and up
      leg.thigh.position.set(hip[0], hip[1], 0); leg.thigh.rotation.z = thighA;
      const kb = Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2));
      leg.shin.rotation.z = -(Math.PI - kb);
      leg.foot.rotation.z = -(thighA - (Math.PI - kb)) ; // keep the shoe level
    });
  }
  pose(0.6);
  const moving = new Set([...wheels, crankFar, crankNear, torso, ringG, bell, lampLens, ...legs.map((l) => l.thigh)]);
  mergeStatic(root, (o) => moving.has(o) || o.isSprite);
  return { root, wheels, pose, scarfTail: tail, pony, lights: { head1, tailL, beam, lampLens }, ringG, ringMat, bell, R };
}

export function bikeRider(ctx, s) {
  const pal = ctx.palette, page = s.page || 'near', T = s.trail;
  const cy = makeCyclist(pal);
  cy.root.scale.setScalar(s.scale ?? 1);
  const flip = new THREE.Group(); flip.add(cy.root);
  const yaw = new THREE.Group(); yaw.add(flip);
  const holder = new THREE.Group(); holder.add(yaw);
  const blob = aoStrip(-0.06, 0.06, 0.025, 0.4); flip.add(blob);
  // an invisible, larger hit box for the poke
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.17, 0.03), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.position.set(0, 0.085, 0); flip.add(proxy);
  const targets = [proxy];
  cy.root.traverse((m) => { if (m.isMesh && m.userData.aoBase == null && !m.material?.blending) targets.push(m); });

  // the belt: near lane left to right, round the pulley behind the right shrubs, far lane back, round the left pulley
  const x0 = T.x0, x1 = T.x1, run = x1 - x0, turn = s.turn ?? 0.16, loop = 2 * (run + turn);
  const speed = s.speed ?? 0.045;
  const st = { p: (s.at ?? 0.35) * loop, x: x0, u: trailU(T, x0) + T.lane, dir: 1, sink: 0, yaw: 0, ring: 9, dist: 0 };
  function place(p) {
    p = ((p % loop) + loop) % loop;
    let x, lane, dir;
    if (p < run) { x = x0 + p; lane = T.lane; dir = 1; }
    else if (p < run + turn) { const q = (p - run) / turn; x = x1 + 0.03 * Math.sin(q * Math.PI); lane = T.lane * Math.cos(q * Math.PI); dir = q < 0.5 ? 1 : -1; }
    else if (p < 2 * run + turn) { x = x1 - (p - run - turn); lane = -T.lane; dir = -1; }
    else { const q = (p - 2 * run - turn) / turn; x = x0 - 0.03 * Math.sin(q * Math.PI); lane = -T.lane * Math.cos(q * Math.PI); dir = q < 0.5 ? -1 : 1; }
    st.x = x; st.u = trailU(T, x) + lane; st.dir = dir;
    // she sinks into the slot only while she is behind the shrubs at either end
    const edge = Math.min(Math.abs(x - x0), Math.abs(x - x1));
    st.sink = 1 - sstep(0.0, s.dip ?? 0.1, edge);
    const du = 2 * T.bend * x + T.tilt; // slope of the trail
    st.yaw = -Math.atan(du) * 0.6;
  }
  place(st.p);
  let k = 1, lamps = 0;
  function apply() {
    flip.rotation.y = st.dir > 0 ? 0 : Math.PI;
    yaw.rotation.y = st.yaw * k;
    flip.position.y = -0.2 * (s.scale ?? 1) * st.sink;
    cy.lights.beam.material.opacity = 0.38 * lamps * (1 - st.sink);
  }
  apply();
  ctx.lamp((v) => { lamps = v; cy.lights.head1.material.opacity = 0.95 * v; cy.lights.tailL.material.opacity = 0.8 * v; cy.lights.beam.material.opacity = 0.38 * v; apply(); });
  const ring = () => { if (st.ring > 0.9) st.ring = 0; };
  return {
    parts: [{ obj: holder, frame: (sp, m) => sp.wallFrame(page, st.x, st.u, m) }],
    targets,
    pokes: [{ targets, run: ring }],
    actions: { ring },
    dynamic(sp) { k = sp.upright ** 2; apply(); },
    tick(t, dt, loops) {
      if (loops) { st.p += dt * speed; place(st.p); }
      const d = loops ? dt * speed : 0;
      st.dist += d;
      const sc = s.scale ?? 1;
      for (const w of cy.wheels) w.rotation.z -= d / (cy.R * sc);
      cy.pose(0.6 - (st.dist / (cy.R * sc)) * 0.42);
      cy.scarfTail.rotation.z = 0.12 * Math.sin(t * 2.3) * (loops ? 1 : 0);
      cy.pony.rotation.z = 0.08 * Math.sin(t * 2.3 + 1) * (loops ? 1 : 0);
      // the bell: a small hop with the front wheel lifting a touch, two ring marks pop and fade
      if (st.ring < 0.9) {
        st.ring = Math.min(0.9, st.ring + dt);
        const p = st.ring / 0.9;
        const hopY = 0.009 * Math.sin(Math.PI * Math.min(1, p / 0.55)) * (p < 0.55 ? 1 : 0);
        cy.root.position.y = hopY * (s.scale ?? 1);
        cy.root.rotation.z = 0.05 * Math.sin(Math.PI * Math.min(1, p / 0.55)) * (p < 0.55 ? 1 : 0);
        cy.bell.scale.setScalar(1 + 0.5 * Math.exp(-p * 6) * Math.abs(Math.sin(p * 40)));
        cy.ringG.scale.setScalar(0.6 + p * 0.9);
        cy.ringMat.opacity = Math.sin(Math.PI * Math.min(1, p * 1.4)) * (p < 0.72 ? 1 : 0);
        if (st.ring >= 0.9) { cy.root.position.y = 0; cy.root.rotation.z = 0; cy.ringMat.opacity = 0; cy.bell.scale.setScalar(1); }
      }
      apply();
      return st.ring < 0.9 ? 'fast' : 'slow';
    },
  };
}

// ---------------------------------------------------------------- gull on a wire, gliding along a slot over the water (role: sky)
export function gull(ctx, s) {
  const pal = ctx.palette, page = s.page || 'far', ly = s.layers[0];
  const g = new THREE.Group();
  const wire = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 1, 0.0012), paperMaterial(pal.wire || '#4a4540')); g.add(wire);
  const bird = new THREE.Group(); g.add(bird);
  const add = (shape, color, z, parent = bird) => { const m = card(shape, { color, depth: 0.0014, bevel: 0.0003, curveSegments: 6 }); m.position.z = z; parent.add(m); return m; };
  const wingFar = new THREE.Group(), wingNear = new THREE.Group(); bird.add(wingFar);
  const wingShape = () => { const w = new THREE.Shape(); w.moveTo(-0.004, 0); w.quadraticCurveTo(-0.012, 0.018, -0.03, 0.022); w.quadraticCurveTo(-0.016, 0.01, 0.006, 0.002); w.closePath(); return w; };
  add(wingShape(), pal.gullWing, -0.002, wingFar).scale.set(-0.9, 0.9, 1);
  add(ellipse(0, 0, 0.016, 0.005), pal.gullBody, 0);
  add(ellipse(0.015, 0.003, 0.005, 0.0045), pal.gullBody, 0.0002);
  add(polyShape([[0.019, 0.003], [0.026, 0.002], [0.019, 0.0015]]), pal.gullBeak, 0.0003);
  add(polyShape([[-0.014, 0.001], [-0.024, 0.004], [-0.022, -0.002]]), pal.gullWing, 0.0001);
  bird.add(wingNear);
  add(wingShape(), pal.gullWing, 0.002, wingNear);
  add(polyShape([[-0.024, 0.02], [-0.031, 0.022], [-0.026, 0.017]]), pal.gullTip, 0.0022, wingNear);
  bird.scale.setScalar(s.scale ?? 1);
  const holder = new THREE.Group(); holder.add(g);
  const st = { x: 0 };
  const place = (t) => {
    st.x = (s.range ?? 0.16) * Math.sin(t * (s.speed ?? 0.05));
    const dir = Math.cos(t * (s.speed ?? 0.05)) >= 0 ? 1 : -1;
    bird.scale.x = dir * (s.scale ?? 1); // a two-sided card: it turns at the slot ends
    bird.position.y = ly.h - 0.01 + 0.006 * Math.sin(t * 0.7);
    bird.rotation.z = 0.06 * Math.sin(t * 0.7 + 1);
    wingNear.rotation.z = 0.12 * Math.sin(t * 2.2); wingFar.rotation.z = -0.1 * Math.sin(t * 2.2);
    wire.scale.y = bird.position.y; wire.position.y = bird.position.y / 2;
  };
  place(s.t0 ?? 1.2);
  return {
    parts: [{ obj: holder, noFit: true, frame: (sp, m) => sp.wallFrame(page, s.x + st.x, ly.u, m) }],
    tick(t) { place(t + (s.t0 ?? 1.2)); return 'draw'; },
  };
}
