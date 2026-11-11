// Kit, part 4: a fairy-tale castle on the side-bound panorama.
//   castle   two V-fold layers, a step apart: in front, the curtain wall and gatehouse with round towers; behind,
//            the keep with its tall central spire. Pastel walls printed as stone, cone roofs with shingles and a gold
//            band, gold finials, pennants on poles. A pull-tab at the reader's edge raises the portcullis and swings
//            the gate open on a warm courtyard. Tap the castle: its windows light up one after another, from the
//            gate upward, and the pennants snap in a gust. On its own: the pennants flutter (each is three paper
//            segments on hinges). At night the windows are lit and the walls glow softly, or, with `uplight`, are floodlit from below.
import * as THREE from 'three';
import { card, polyShape, printTexture, paperMaterial, aoStrip, glowSprite, glowTexture } from '../engine/paper.js';
import { sstep } from '../engine/motion.js';
import { vAngles } from './panorama.js';
import { splitAtCrease, makePullTab } from './panorama2.js';
import { mergeStatic, rng } from './filoli.js';

function layerFrames(x0, theta, gamma) {
  const f = { right: new THREE.Matrix4(), left: new THREE.Matrix4() };
  let sp0 = null, phi0 = null;
  return (sp) => { if (sp !== sp0 || sp.phi !== phi0) { sp.vlayer(x0, theta, gamma, f); sp0 = sp; phi0 = sp.phi; } return f; };
}
const halfPart = (obj, frames, side, extra = {}) => ({ obj, frame: (sp, m) => m.copy(frames(sp)[side]), ...extra });
const rect = (x0, y0, x1, y1) => polyShape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);

// ---------------------------------------------------------------- the plan, shared by declare and build
// A tower: { x, w, h (body), roof (cone height), tone ('wall' | 'stone'), roofTone ('roof' | 'roofAlt'), flag, z }.
const FRONT = [
  { x: -0.4, w: 0.1, h: 0.29, roof: 0.15, tone: 'wall', flag: true, z: 0.01 },
  { x: 0.4, w: 0.1, h: 0.29, roof: 0.15, tone: 'wall', flag: true, z: 0.01 },
  { x: -0.105, w: 0.052, h: 0.27, roof: 0.09, tone: 'stone', roofTone: 'roofAlt', z: 0.006 },
  { x: 0.105, w: 0.052, h: 0.27, roof: 0.09, tone: 'stone', roofTone: 'roofAlt', z: 0.006 },
];
const BACK = [
  { x: -0.27, w: 0.052, h: 0.3, roof: 0.1, tone: 'wall', roofTone: 'roofAlt', z: -0.004 },
  { x: 0.27, w: 0.052, h: 0.3, roof: 0.1, tone: 'wall', roofTone: 'roofAlt', z: -0.004 },
  { x: -0.165, w: 0.078, h: 0.39, roof: 0.13, tone: 'wall', flag: true, z: 0.004 },
  { x: 0.165, w: 0.078, h: 0.39, roof: 0.13, tone: 'wall', flag: true, z: 0.004 },
  { x: 0, w: 0.092, h: 0.44, roof: 0.16, tone: 'wall', flag: true, z: 0.008 },
];
const POLE = 0.045;
function plan(s) {
  const fx0 = s.x0 ?? 0, bx0 = fx0 + (s.depth ?? 0.09);
  const wallW = s.wallW ?? 0.36, wallH = s.wallH ?? 0.15, gateW = s.gateW ?? 0.072, gateH = s.gateH ?? 0.105;
  const houseW = s.gateHouseW ?? 0.16, houseH = s.gateHouseH ?? 0.22;
  const keepW = s.keepW ?? 0.34, keepH = s.keepH ?? 0.3, keepRoof = s.keepRoof ?? 0.11;
  const front = s.towers || FRONT, back = s.keepTowers || BACK;
  const flagL = (t) => t.flagL ?? 1.5 * Math.max(0.045, t.w * 0.75), flagH = (t) => t.flagH ?? 1.5 * Math.max(0.02, t.w * 0.3);
  const top = (t) => t.h + t.roof + 0.012 + (t.flag ? POLE + flagH(t) * 0.1 : 0);
  // reach and height of each half of a layer, from what stands on it (flags fly toward +x)
  const extent = (items) => {
    const reach = [0.02, 0.02], height = [0.012, 0.012];
    for (const it of items) {
      const l = it.x0, r = it.x1;
      if (l < 0) { reach[0] = Math.max(reach[0], -l); height[0] = Math.max(height[0], it.top); }
      if (r > 0) { reach[1] = Math.max(reach[1], r); height[1] = Math.max(height[1], it.top); }
    }
    return { reach: reach.map((v) => v + 0.012), height: height.map((v) => v + 0.012) };
  };
  const towerItem = (t) => ({ x0: t.x - t.w * 0.68, x1: Math.max(t.x + t.w * 0.68, t.flag ? t.x + 0.003 + flagL(t) : -1), top: top(t) });
  const fe = extent([{ x0: -wallW, x1: wallW, top: wallH + 0.016 }, { x0: -houseW / 2, x1: houseW / 2, top: houseH + 0.016 }, ...front.map(towerItem)]);
  const be = extent([{ x0: -keepW / 2 - 0.01, x1: keepW / 2 + 0.01, top: keepH + keepRoof }, ...back.map(towerItem)]);
  return { fx0, bx0, wallW, wallH, gateW, gateH, houseW, houseH, keepW, keepH, keepRoof, front, back, flagL, flagH, fe, be };
}
function castleDeclare(s, book) {
  const { theta, gamma } = vAngles(s, book), p = plan(s), t = s.tab || {};
  return {
    vlayers: [
      { name: 'wall', x0: p.fx0, theta, gamma, reach: p.fe.reach, height: p.fe.height },
      { name: 'keep', x0: p.bx0, theta, gamma, reach: p.be.reach, height: p.be.height },
    ],
    slots: [{ page: t.page || 'near', u0: (t.u ?? 0.5) - 0.03, u1: (t.u ?? 0.5) + 0.03, x0: -0.87, x1: -0.55 }],
  };
}

// ---------------------------------------------------------------- printing
// crenellated top from x0 to x1 at height y: merlons stand mh above y
function crenels(x0, x1, y, mw = 0.016, gap = 0.013, mh = 0.014) {
  const pts = [], n = Math.max(1, Math.round((x1 - x0 + gap) / (mw + gap))), step = (x1 - x0 + gap) / n, w = step - gap;
  for (let i = 0; i < n; i++) { const a = x0 + i * step; pts.push([a, y + mh], [a + w, y + mh]); if (i < n - 1) pts.push([a + w, y], [a + step, y]); }
  return pts;
}
// a cone roof with slightly concave sides and an overhanging eave, apex at (x, h + roof)
function coneShape(t) {
  const half = t.w * 0.66, y0 = t.h - 0.006, apex = t.h + t.roof, s = new THREE.Shape();
  s.moveTo(t.x - half, y0); s.lineTo(t.x + half, y0);
  s.quadraticCurveTo(t.x + half * 0.28, y0 + t.roof * 0.32, t.x, apex);
  s.quadraticCurveTo(t.x - half * 0.28, y0 + t.roof * 0.32, t.x - half, y0);
  return s;
}
function archPath(x0, x1, y0, y1, path = new THREE.Path()) { // a round-headed opening, y1 the crown
  const r = (x1 - x0) / 2, cx = (x0 + x1) / 2, spring = y1 - r;
  path.moveTo(x0, y0); path.lineTo(x1, y0); path.lineTo(x1, spring); path.absarc(cx, spring, r, 0, Math.PI, false); path.lineTo(x0, y0);
  return path;
}
const archShape = (x0, x1, y0, y1) => archPath(x0, x1, y0, y1, new THREE.Shape());
function archFill(g, x0, x1, y0, y1) { const r = (x1 - x0) / 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y0); g.lineTo(x1, y1 - r); g.arc((x0 + x1) / 2, y1 - r, r, 0, Math.PI, false); g.closePath(); g.fill(); }

// windows on a tower: [x, y, w, h]
function towerWindows(t) {
  const ww = Math.min(0.017, t.w * 0.26), wh = ww * 1.8, out = [];
  const rows = t.h > 0.35 ? [0.42, 0.62, 0.8] : t.h > 0.25 ? [0.5, 0.76] : [0.62];
  for (const f of rows) {
    const y = t.h * f;
    if (t.w > 0.085 && f < 0.7) out.push([t.x - ww * 0.85, y, ww, wh], [t.x + ww * 0.85, y, ww, wh]);
    else out.push([t.x, y, ww, wh]);
  }
  return out;
}

export function castle(ctx, s) {
  const pal = ctx.palette, { theta, gamma } = vAngles(s, ctx.book), P = plan(s);
  const C = {
    wall: pal.castleWall || '#F0D6D2', stone: pal.castleStone || '#EFE4D2', roof: pal.castleRoof || '#7F9DCB', roofAlt: pal.castleRoofAlt || '#9C8FC4',
    gold: pal.castleGold || '#D4AF5E', glass: pal.castleGlass || '#4D5674', door: pal.castleDoor || '#7A5A44', trim: pal.castleTrim || '#FBF6EC',
    flag: pal.flag || '#C9554A', flagAlt: pal.flagAlt || '#6E8FC6', court: pal.castleCourt || '#E9C48E',
  };
  const tone = (t) => C[t.tone || 'wall'], roofC = (t) => C[t.roofTone || 'roof'];
  const ink = (a) => `rgba(70,50,70,${a})`;

  // one tower, printed: a round body (shaded as a cylinder), stone courses, a corbelled band, the cone with shingles
  const printTower = (g, t) => {
    const x0 = t.x - t.w / 2, x1 = t.x + t.w / 2;
    g.fillStyle = tone(t); g.fillRect(x0, 0, t.w, t.h);
    const cyl = g.createLinearGradient(x0, 0, x1, 0);
    cyl.addColorStop(0, 'rgba(255,255,255,0.22)'); cyl.addColorStop(0.35, 'rgba(255,255,255,0.05)'); cyl.addColorStop(0.75, ink(0.06)); cyl.addColorStop(1, ink(0.2));
    g.fillStyle = cyl; g.fillRect(x0, 0, t.w, t.h);
    g.strokeStyle = ink(0.07); g.lineWidth = 0.0009;
    for (let y = 0.012, row = 0; y < t.h - 0.02; y += 0.011, row++) {
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      for (let x = x0 + (row % 2) * 0.008; x < x1; x += 0.016) { g.beginPath(); g.moveTo(x, y - 0.011); g.lineTo(x, y); g.stroke(); }
    }
    // corbelled band under the eave: a darker course and a row of small arches
    const cb = t.h - 0.022;
    g.fillStyle = ink(0.12); g.fillRect(x0 - t.w * 0.04, cb, t.w * 1.08, 0.016);
    g.fillStyle = tone(t); for (let x = x0 + 0.004; x < x1 - 0.002; x += 0.009) archFill(g, x, x + 0.006, cb, cb + 0.01);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x0 - t.w * 0.04, cb + 0.014, t.w * 1.08, 0.002);
    // window surrounds (the glass is its own card, so it can light)
    g.fillStyle = C.trim; for (const [wx, wy, ww, wh] of towerWindows(t)) archFill(g, wx - ww / 2 - 0.003, wx + ww / 2 + 0.003, wy - 0.003, wy + wh + 0.003);
    // the cone: shingle rows, cylinder shading, a gold band at the eave
    const half = t.w * 0.66, y0 = t.h - 0.006, apex = t.h + t.roof;
    g.save(); g.beginPath(); g.moveTo(t.x - half, y0); g.lineTo(t.x + half, y0); g.quadraticCurveTo(t.x + half * 0.28, y0 + t.roof * 0.32, t.x, apex); g.quadraticCurveTo(t.x - half * 0.28, y0 + t.roof * 0.32, t.x - half, y0); g.closePath(); g.clip();
    g.fillStyle = roofC(t); g.fillRect(t.x - half, y0, 2 * half, t.roof + 0.01);
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 0.0011;
    for (let y = y0 + 0.012, row = 0; y < apex; y += 0.011, row++) for (let x = t.x - half + (row % 2) * 0.005; x < t.x + half; x += 0.01) { g.beginPath(); g.arc(x, y, 0.005, Math.PI, 0, true); g.stroke(); }
    const sh = g.createLinearGradient(t.x - half, 0, t.x + half, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0.25)'); sh.addColorStop(0.4, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(30,30,70,0.28)');
    g.fillStyle = sh; g.fillRect(t.x - half, y0, 2 * half, t.roof + 0.01);
    g.restore();
    g.fillStyle = C.gold; g.fillRect(t.x - half, y0, 2 * half, 0.007);
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(t.x - half, y0 + 0.005, 2 * half, 0.0012);
    // finial: a gold ball and spike
    g.fillStyle = C.gold; g.beginPath(); g.arc(t.x, apex + 0.004, 0.0055, 0, 7); g.fill();
    g.beginPath(); g.moveTo(t.x - 0.002, apex + 0.008); g.lineTo(t.x + 0.002, apex + 0.008); g.lineTo(t.x, apex + 0.022); g.closePath(); g.fill();
    if (t.flag) { g.fillStyle = C.gold; g.fillRect(t.x + 0.0005, apex + 0.008, 0.0028, POLE); }
  };

  const B = { // print boxes, front view
    front: [-P.fe.reach[0] - 0.01, 0, P.fe.reach[1] + 0.01, Math.max(...P.fe.height) + 0.01],
    back: [-P.be.reach[0] - 0.01, 0, P.be.reach[1] + 0.01, Math.max(...P.be.height) + 0.01],
  };
  const gw = P.gateW / 2;
  const frontPrint = (g) => {
    const r = rng(11);
    // curtain wall and gatehouse: dressed stone
    g.fillStyle = C.stone; g.fillRect(-P.wallW, 0, 2 * P.wallW, P.houseH + 0.02);
    g.strokeStyle = ink(0.07); g.lineWidth = 0.0009;
    for (let y = 0.014, row = 0; y < P.houseH + 0.02; y += 0.014, row++) {
      g.beginPath(); g.moveTo(-P.wallW, y); g.lineTo(P.wallW, y); g.stroke();
      for (let x = -P.wallW + (row % 2) * 0.012; x < P.wallW; x += 0.024) { g.beginPath(); g.moveTo(x, y - 0.014); g.lineTo(x, y); g.stroke(); }
    }
    for (let i = 0; i < 160; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.18)' : ink(0.05); g.fillRect(-P.wallW + r() * 2 * P.wallW, r() * P.houseH, 0.012, 0.006); }
    // the gatehouse a shade warmer, a base course, a string course under the battlements
    g.fillStyle = 'rgba(240,200,190,0.28)'; g.fillRect(-P.houseW / 2, 0, P.houseW, P.houseH + 0.02);
    g.fillStyle = ink(0.1); g.fillRect(-P.wallW, 0, 2 * P.wallW, 0.012);
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(-P.wallW, P.wallH - 0.012, 2 * P.wallW, 0.003); g.fillRect(-P.houseW / 2, P.houseH - 0.012, P.houseW, 0.003);
    // arrow slits along the wall
    g.fillStyle = ink(0.45);
    for (const x of [-0.3, -0.22, -0.16, 0.16, 0.22, 0.3]) if (Math.abs(x) < P.wallW - 0.03) g.fillRect(x - 0.0018, P.wallH * 0.45, 0.0036, 0.026);
    // the gate: voussoirs round the arch, a gold keystone
    g.fillStyle = C.trim; archFill(g, -gw - 0.012, gw + 0.012, 0, P.gateH + 0.012);
    g.fillStyle = C.gold; g.beginPath(); g.moveTo(-0.006, P.gateH + 0.014); g.lineTo(0.006, P.gateH + 0.014); g.lineTo(0.004, P.gateH - 0.002); g.lineTo(-0.004, P.gateH - 0.002); g.closePath(); g.fill();
    // window surround over the gate
    g.fillStyle = C.trim; archFill(g, -0.016, 0.016, P.houseH * 0.66 - 0.004, P.houseH * 0.66 + 0.05);
    for (const t of P.front) printTower(g, t);
  };
  const backPrint = (g) => {
    const kw = P.keepW / 2, r = rng(12);
    for (const t of P.back.filter((q) => (q.z ?? 0) < 0)) printTower(g, t);
    // the keep: pink walls, a balcony course, a steep slate roof with dormers
    g.fillStyle = C.wall; g.fillRect(-kw, 0, P.keepW, P.keepH);
    g.strokeStyle = ink(0.06); g.lineWidth = 0.0009;
    for (let y = 0.012, row = 0; y < P.keepH; y += 0.012, row++) { g.beginPath(); g.moveTo(-kw, y); g.lineTo(kw, y); g.stroke(); for (let x = -kw + (row % 2) * 0.009; x < kw; x += 0.018) { g.beginPath(); g.moveTo(x, y - 0.012); g.lineTo(x, y); g.stroke(); } }
    for (let i = 0; i < 90; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.16)' : ink(0.04); g.fillRect(-kw + r() * P.keepW, r() * P.keepH, 0.01, 0.005); }
    g.fillStyle = C.trim; g.fillRect(-kw, P.keepH * 0.52, P.keepW, 0.006); g.fillRect(-kw, P.keepH - 0.01, P.keepW, 0.006);
    g.fillStyle = C.trim; for (const [wx, wy, ww, wh] of keepWindows) archFill(g, wx - ww / 2 - 0.003, wx + ww / 2 + 0.003, wy - 0.003, wy + wh + 0.003);
    g.fillStyle = C.roof; g.beginPath(); g.moveTo(-kw - 0.01, P.keepH - 0.004); g.lineTo(kw + 0.01, P.keepH - 0.004); g.lineTo(kw * 0.55, P.keepH + P.keepRoof); g.lineTo(-kw * 0.55, P.keepH + P.keepRoof); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 0.0011;
    for (let y = P.keepH + 0.008, row = 0; y < P.keepH + P.keepRoof; y += 0.01, row++) for (let x = -kw + (row % 2) * 0.005; x < kw; x += 0.01) { const lim = kw + 0.01 - ((y - P.keepH) / P.keepRoof) * kw * 0.45; if (Math.abs(x) < lim - 0.004) { g.beginPath(); g.arc(x, y, 0.005, Math.PI, 0, true); g.stroke(); } }
    g.fillStyle = C.gold; g.fillRect(-kw - 0.01, P.keepH - 0.004, P.keepW + 0.02, 0.006); g.fillRect(-kw * 0.55, P.keepH + P.keepRoof - 0.004, P.keepW * 0.55, 0.004);
    for (const t of P.back.filter((q) => (q.z ?? 0) >= 0)) printTower(g, t);
  };
  const keepWindows = [];
  { const kw = P.keepW / 2; for (const y of [P.keepH * 0.2, P.keepH * 0.62]) for (let x = -kw + 0.035; x <= kw - 0.03; x += 0.05) if (Math.abs(x) > 0.06) keepWindows.push([x, y, 0.016, 0.03]); }

  const mats = {}, prints = { front: frontPrint, back: backPrint };
  // Night, option `uplight`: floodlights at the foot of the walls instead of the flat warm glow. The walls' night print
  // is the day print multiplied by a light map: the wash colour, strongest at the foot and falling off upward (to `fall`)
  // and toward the outer towers, with a warm core on the keep's centre (and a little round the gate).
  const U = s.uplight || null;
  const litPrint = (k) => (g) => {
    prints[k](g);
    const [bx0, , bx1, by1] = B[k], c = g.canvas, off = document.createElement('canvas');
    off.width = c.width; off.height = c.height;
    const o = off.getContext('2d'); o.setTransform(g.getTransform());
    o.fillStyle = '#000'; o.fillRect(bx0, 0, bx1 - bx0, by1);
    const v = o.createLinearGradient(0, 0, 0, by1), fall = U.fall ?? 0.4, wash = new THREE.Color(U.color || '#8C8CF2');
    const rgba = (col, a) => `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a})`;
    v.addColorStop(0, rgba(wash, 1)); v.addColorStop(0.35, rgba(wash, Math.min(1, 0.65 + 0.5 * fall))); v.addColorStop(1, rgba(wash, fall));
    o.fillStyle = v; o.fillRect(bx0, 0, bx1 - bx0, by1);
    const h = o.createLinearGradient(bx0, 0, bx1, 0); // the outer towers stand further from the lamps
    h.addColorStop(0, 'rgba(0,0,0,0.38)'); h.addColorStop(0.3, 'rgba(0,0,0,0)'); h.addColorStop(0.7, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,0.38)');
    o.fillStyle = h; o.fillRect(bx0, 0, bx1 - bx0, by1);
    const core = new THREE.Color(U.core || '#FFB89A');
    const glow = (x, y, r, a) => { const rg = o.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, rgba(core, a)); rg.addColorStop(0.45, rgba(core, a * 0.55)); rg.addColorStop(1, rgba(core, 0)); o.fillStyle = rg; o.fillRect(x - r, y - r, 2 * r, 2 * r); };
    const cr = U.coreR ?? 0.16;
    if (k === 'back') { const ct = P.back.reduce((a, t) => (t.h > a.h ? t : a), P.back[0]); glow(ct.x, ct.h * 0.78, cr, 0.95); }
    else glow(0, P.gateH * 0.9, cr * 0.75, 0.6);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'multiply'; g.drawImage(off, 0, 0); g.restore();
  };
  for (const k of ['front', 'back']) {
    const tex = printTexture(B[k], prints[k], 1500, 2048);
    mats[k] = U ? paperMaterial('#fff', { map: tex, emissiveMap: printTexture(B[k], litPrint(k), 900, 1024), emissive: '#ffffff' })
      : paperMaterial('#fff', { map: tex, emissiveMap: tex, emissive: pal.castleFlood || '#FFE7D2' });
  }
  // window glass: six materials, lit in turn (a tap's cascade runs from the gate upward and outward)
  const N = 6, winMats = Array.from({ length: N }, () => { const m = paperMaterial(C.glass, { noCache: true }); m.emissive.set('#FFCB7A'); return m; });
  const bucket = (x, y) => Math.min(N - 1, Math.floor((y / 0.62 + Math.abs(x) / 0.9) * N * 0.62));

  // ---- build both elevations as groups in front view, then split each at the crease
  const build = (k) => {
    const root = new THREE.Group(), mat = mats[k], box = B[k];
    const add = (shape, z, o = {}) => { const m = card(shape, { material: o.material || mat, edgeColor: o.edge || C.stone, depth: o.depth ?? 0.005, uvBox: o.material ? undefined : box, curveSegments: o.seg ?? 8 }); m.position.z = z; root.add(m); return m; };
    const towers = k === 'front' ? P.front : P.back;
    const tower = (t) => {
      const z = t.z ?? 0;
      add(rect(t.x - t.w / 2, 0, t.x + t.w / 2, t.h), z, { edge: tone(t), seg: 1 });
      add(rect(t.x - t.w * 0.54, t.h - 0.024, t.x + t.w * 0.54, t.h - 0.006), z + 0.0015, { edge: tone(t), seg: 1, depth: 0.003 }); // corbel band stands proud
      add(coneShape(t), z + 0.003, { edge: roofC(t) });
      const apex = t.h + t.roof;
      add(new THREE.Shape().absarc(t.x, apex + 0.004, 0.0055, 0, Math.PI * 2, false), z + 0.003, { edge: C.gold, depth: 0.003 });
      add(polyShape([[t.x - 0.002, apex + 0.008], [t.x + 0.002, apex + 0.008], [t.x, apex + 0.022]]), z + 0.003, { edge: C.gold, depth: 0.003, seg: 1 });
      for (const [wx, wy, ww, wh] of towerWindows(t)) { const w = card(archShape(wx - ww / 2, wx + ww / 2, wy, wy + wh), { material: winMats[bucket(wx, wy)], edgeColor: C.trim, depth: 0.003, curveSegments: 6 }); w.position.z = z + 0.0035; root.add(w); }
      if (t.flag) {
        add(rect(t.x + 0.0005, apex + 0.008, t.x + 0.0033, apex + 0.008 + POLE), z + 0.003, { edge: C.gold, depth: 0.002, seg: 1 });
        flags.push(makeFlag(t, apex + 0.008 + POLE, z + 0.003, flags.length));
        root.add(flags[flags.length - 1].root);
      }
    };
    if (k === 'front') {
      // curtain wall and gatehouse in one die-cut card, battlements along the tops, the gate cut through
      const W = P.wallW, hw = P.houseW / 2;
      const pts = [[-W, 0], ...crenels(-W, -hw, P.wallH), ...crenels(-hw, hw, P.houseH), ...crenels(hw, W, P.wallH), [W, 0]];
      const sh = polyShape(pts); sh.holes.push(archPath(-gw, gw, 0.0015, P.gateH));
      add(sh, 0, { edge: C.stone, seg: 10 });
      const ww = 0.022; const w = card(archShape(-ww / 2, ww / 2, P.houseH * 0.66, P.houseH * 0.66 + 0.042), { material: winMats[1], edgeColor: C.trim, depth: 0.003, curveSegments: 6 }); w.position.z = 0.0035; root.add(w);
      for (const t of towers) tower(t);
      // behind the gate: the courtyard (a card on spacers, lit at night), the portcullis on a slide, two door leaves
      const cb = [-gw - 0.02, 0, gw + 0.02, P.gateH + 0.02];
      const ctex = printTexture(cb, (g) => {
        const gr = g.createLinearGradient(0, 0, 0, cb[3]); gr.addColorStop(0, C.court); gr.addColorStop(1, '#F6DFB4');
        g.fillStyle = gr; g.fillRect(cb[0], 0, cb[2] - cb[0], cb[3]);
        g.strokeStyle = 'rgba(120,80,40,0.25)'; g.lineWidth = 0.001;
        for (let y = 0.006; y < 0.03; y += 0.006) { g.beginPath(); g.moveTo(cb[0], y); g.lineTo(cb[2], y); g.stroke(); }
        g.fillStyle = 'rgba(255,250,235,0.7)'; archFill(g, -0.012, 0.012, 0.03, 0.075); // a far doorway, bright
      }, 1500, 512);
      const court = card(rect(cb[0], cb[1], cb[2], cb[3]), { material: paperMaterial('#fff', { map: ctex, emissiveMap: ctex, emissive: '#FFD9A0' }), edgeColor: C.court, depth: 0.003, uvBox: cb, curveSegments: 1, castShadow: false });
      court.position.z = -0.05; root.add(court); courtMat = court.material[0];
      for (const sg of [-1, 1]) { const j = card(rect(sg < 0 ? -gw - 0.012 : gw, 0, sg < 0 ? -gw : gw + 0.012, P.gateH), { color: C.stone, depth: 0.003, curveSegments: 1 }); j.position.z = -0.025; root.add(j); } // the gate's reveals
      for (const sg of [-1, 1]) { // portcullis halves meet at the crease, so each rides with its own half
        const pc = new THREE.Group(), ph = P.gateH + 0.004, x0 = sg < 0 ? -gw - 0.004 : 0.0006, x1 = sg < 0 ? -0.0006 : gw + 0.004;
        const bars = [];
        for (let x = sg < 0 ? x1 - 0.004 : x0 + 0.004; sg < 0 ? x > x0 : x < x1; x += sg * 0.0085) bars.push(rect(x - 0.0011, 0.004, x + 0.0011, ph));
        for (let y = 0.02; y < ph; y += 0.018) bars.push(rect(x0, y - 0.001, x1, y + 0.001));
        for (let x = sg < 0 ? x1 - 0.004 : x0 + 0.004; sg < 0 ? x > x0 : x < x1; x += sg * 0.0085) bars.push(polyShape([[x - 0.0018, 0.004], [x + 0.0018, 0.004], [x, -0.002]]));
        const m = card(bars, { color: pal.castleIron || '#3E3A42', depth: 0.002, curveSegments: 1 }); pc.add(m);
        pc.position.z = -0.006; pc.userData.moving = true; root.add(pc); portcullis.push(pc);
        const leaf = new THREE.Group(); leaf.position.set(sg * gw, 0, -0.011); leaf.userData.moving = true;
        const inner = new THREE.Group(); inner.scale.x = -sg; leaf.add(inner);
        const lw = gw - 0.0008, r = gw, spring = P.gateH - r, ls = new THREE.Shape();
        ls.moveTo(0, 0); ls.lineTo(lw, 0); ls.lineTo(lw, P.gateH - 0.0015); ls.absarc(gw, spring, r, Math.PI / 2 + 0.02, Math.PI, false); ls.lineTo(0, 0);
        inner.add(card(ls, { color: C.door, depth: 0.003, curveSegments: 8 }));
        for (const y of [0.025, 0.065]) { const st = card(rect(0.002, y, lw - 0.002, y + 0.005), { color: pal.castleIron || '#3E3A42', depth: 0.002, curveSegments: 1 }); st.position.z = 0.002; inner.add(st); }
        root.add(leaf); leaves.push({ leaf, sg });
      }
    } else {
      const kw = P.keepW / 2;
      for (const t of towers.filter((q) => (q.z ?? 0) < 0)) tower(t);
      add(rect(-kw, 0, kw, P.keepH), 0, { edge: C.wall, seg: 1 });
      add(polyShape([[-kw - 0.01, P.keepH - 0.004], [kw + 0.01, P.keepH - 0.004], [kw * 0.55, P.keepH + P.keepRoof], [-kw * 0.55, P.keepH + P.keepRoof]]), 0.002, { edge: C.roof, seg: 1 });
      for (const [wx, wy, ww, wh] of keepWindows) { const w = card(archShape(wx - ww / 2, wx + ww / 2, wy, wy + wh), { material: winMats[bucket(wx, wy)], edgeColor: C.trim, depth: 0.003, curveSegments: 6 }); w.position.z = 0.0035; root.add(w); }
      for (const t of towers.filter((q) => (q.z ?? 0) >= 0)) tower(t);
    }
    return root;
  };

  // a pennant: three paper segments on hinges, flying toward +x from the pole
  const flags = [], portcullis = [], leaves = [];
  let courtMat = null;
  function makeFlag(t, top, z, i) {
    const L = P.flagL(t), H = P.flagH(t), n = 3, seg = L / n, col = i % 2 ? C.flagAlt : C.flag;
    const hh = (x) => (H / 2) * (1 - 0.5 * (x / L));
    const root = new THREE.Group(); root.position.set(t.x + 0.0033, top - H / 2, z); root.userData.moving = true;
    const segs = []; let parent = root;
    for (let k = 0; k < n; k++) {
      const g = new THREE.Group(); g.position.x = k ? seg : 0; parent.add(g);
      const a = k * seg, b = (k + 1) * seg;
      const pts = k < n - 1 ? [[0, -hh(a)], [seg, -hh(b)], [seg, hh(b)], [0, hh(a)]] : [[0, -hh(a)], [seg, -hh(b) - 0.001], [seg * 0.62, 0], [seg, hh(b) + 0.001], [0, hh(a)]]; // a swallowtail at the end
      g.add(card(polyShape(pts), { color: col, depth: 0.0016, curveSegments: 1, castShadow: false }));
      segs.push(g); parent = g;
    }
    return { root, segs, phase: i * 1.7 };
  }

  const front = build('front'), back = build('back');
  const halves = { front: splitAtCrease(front), back: splitAtCrease(back) };
  const moving = (o) => !!o.userData.moving;
  for (const k of ['front', 'back']) for (const side of ['left', 'right']) mergeStatic(halves[k][side], moving);
  const frames = { front: layerFrames(P.fx0, theta, gamma), back: layerFrames(P.bx0, theta, gamma) };
  const parts = [];
  for (const k of ['back', 'front']) {
    const ext = k === 'front' ? P.fe : P.be;
    for (const side of ['left', 'right']) {
      parts.push(halfPart(halves[k][side], frames[k], side));
      const g = new THREE.Group(), st = aoStrip(side === 'left' ? -ext.reach[0] + 0.01 : 0, side === 'left' ? 0 : ext.reach[1] - 0.01, 0.05, s.footStrength ?? 0.24); st.position.z = -0.006; g.add(st);
      parts.push(halfPart(g, frames[k], side, { ao: true }));
    }
  }
  // warm light from the open gate, and a pool on the ground in front of it (night)
  const glow = glowSprite('#FFCF8A', 0.16); glow.position.set(0.001, P.gateH * 0.5, -0.02);
  const gh = new THREE.Group(); gh.add(glow); parts.push(halfPart(gh, frames.front, 'right', { noFit: true }));
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.3), new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(pal.lamp || '#FFD08A'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.renderOrder = 2; pool.position.set(P.fx0 - 0.12, 0.0015, 0.0);
  parts.push({ obj: new THREE.Group().add(pool), noFit: true, frame: (sp, m) => sp.pageFrame('near', m) });

  const targets = []; for (const k of ['front', 'back']) for (const side of ['left', 'right']) halves[k][side].traverse((m) => { if (m.isMesh && m.userData.aoBase == null) targets.push(m); });

  // the pull-tab: up goes the portcullis, then the gate swings open
  const tab = makePullTab(ctx, { ...s.tab, page: s.tab?.page || 'near', color: s.tab?.color || C.flag, backTime: 1.2 });
  parts.push(tab.part);
  const st = { lamps: 0, spark: -1, gust: 0, hover: 0 };
  const place = () => {
    const k = tab.k, up = sstep(0, 0.6, k), open = sstep(0.45, 1, k);
    for (const pc of portcullis) pc.position.y = up * (P.gateH + 0.006);
    for (const { leaf, sg } of leaves) leaf.rotation.y = sg * -open * (s.swing ?? 1.25);
    glow.material.opacity = (0.25 + 0.75 * st.lamps) * (0.15 + 0.85 * open) * 0.8;
    if (courtMat) courtMat.emissiveIntensity = 0.15 + 0.9 * st.lamps;
    pool.material.opacity = 0.4 * st.lamps;
    // windows: lit at night; a tap runs a wave of light through them, bucket by bucket
    for (let i = 0; i < N; i++) {
      const e = st.spark < 0 ? 0 : sstep(i * 0.22, i * 0.22 + 0.18, st.spark) * (1 - sstep(i * 0.22 + 1.6, i * 0.22 + 2.4, st.spark));
      winMats[i].emissiveIntensity = Math.max(1.5 * st.lamps, 1.7 * e) + 0.25 * st.hover;
    }
    mats.front.emissiveIntensity = mats.back.emissiveIntensity = (U ? U.strength ?? 0.8 : s.flood ?? 0.3) * st.lamps;
    if (U) for (const m of [mats.front, mats.back]) m.color.setScalar(1 - (U.dim ?? 0.35) * st.lamps); // the floodlight, not the moon, colours the walls
  };
  ctx.lamp((v) => { st.lamps = v; place(); });
  const flutter = (t) => {
    const amp = 0.3 + 0.55 * st.gust;
    for (const f of flags) f.segs.forEach((g, k) => {
      g.rotation.y = amp * (k ? 0.9 : 0.5) * Math.sin(t * (3.1 + 1.6 * st.gust) - k * 1.15 + f.phase);
      g.rotation.z = (k ? 0.12 : 0.08) * Math.sin(t * 1.7 - k * 0.8 + f.phase) - (k ? 0 : 0.04 * (1 - st.gust));
    });
  };
  flutter(1.3);
  place();
  const tap = () => { st.spark = 0; st.gust = 1; };
  return {
    parts, targets,
    proxies: tab.proxies, drag: tab.drag, nudge: () => tab.nudge(),
    pokes: [{ targets, run: tap, hover(on) { st.hover = on ? 1 : 0; place(); } }],
    actions: { open(k = 1) { tab.set(k); place(); }, sparkle: tap },
    tick(t, dt, loops) {
      const busy = tab.tick(dt);
      const sparking = st.spark >= 0;
      if (sparking) { st.spark += dt; if (st.spark > N * 0.22 + 2.6) st.spark = -1; }
      if (st.gust > 0) st.gust = Math.max(0, st.gust - dt / 3.5);
      if (loops || st.gust > 0) flutter(t);
      place();
      return busy || sparking || st.gust > 0 ? 'fast' : loops ? 'draw' : false;
    },
    mount: { layers: [{ x0: P.bx0, frames: frames.back }, { x0: P.fx0, frames: frames.front }], frames: frames.front, x0: P.fx0, theta, gamma },
  };
}

export const declares4 = { castle: castleDeclare };
