// Kit, part 4: a billboard on the side-bound panorama.
//   billboard   a V-fold layer carrying one or more boards on posts. Each board is cut into vertical louvers on a
//               rod, a tri-vision sign: with two or three faces, the louvers turn one after another and the next ad
//               slides in. Tap a board: it turns to its next face. Pull the tab at the reader's edge: every board
//               turns with it, let go past half way and they finish the turn; the tab springs back, so each pull is
//               one turn. `drag: true` puts the drag on the
//               boards themselves instead: drag across any board and every board with faces turns with the
//               finger, louver after louver; let go past half way and they finish, short of it they fall back
//               (the boards are a set: they always show the same face number). On their own: the boards turn every
//               few seconds (`every`, 0 holds them), one a beat after the other (each board's phase); each beat
//               sends a board to its first face plus the beat count, so after a tap the boards fall back into step.
//               At night gooseneck lamps on the catwalk light the faces, or (`topLamps: n`) spotlights on arms over
//               the top edge throw pools of light down them. A board with one face is a plain sign (an
//               overhead road sign on a truss, a shop sign). The artwork lives in the moment file: each face is a
//               background colour plus text lines, SVG path data and simple shapes, drawn to a canvas, so the piece
//               itself carries no picture of its own. A group in the artwork can move now and then: `wave` rocks it
//               about a pivot (a figure's hand), `look` shifts it to one side and back (a pair of eyes looking
//               round), `blink` squashes it shut for a blink. Only the face showing moves, and a tap on its board
//               runs its moves at once; a board with moves answers a tap with them instead of turning. `screen:
//               true` makes a board a lit screen: neutral light of its own, no lamps or catwalk unless asked.
import * as THREE from 'three';
import { card, polyShape, paperMaterial, aoStrip, glowSprite } from '../engine/paper.js';
import { sstep } from '../engine/motion.js';
import { vAngles } from './panorama.js';
import { mergeStatic } from './filoli.js';
import { makePullTab } from './panorama2.js';

function layerFrames(x0, theta, gamma) {
  const f = { right: new THREE.Matrix4(), left: new THREE.Matrix4() };
  let sp0 = null, phi0 = null;
  return (sp) => { if (sp !== sp0 || sp.phi !== phi0) { sp.vlayer(x0, theta, gamma, f); sp0 = sp; phi0 = sp.phi; } return f; };
}
const halfPart = (obj, frames, side, extra = {}) => ({ obj, frame: (sp, m) => m.copy(frames(sp)[side]), ...extra });
const noAO = (obj) => { obj.traverse((m) => { if (m.isMesh) m.userData.noAO = true; }); return obj; };
const rect = (x0, y0, x1, y1) => polyShape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
const FONT = "system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif"; // a face may name its own font

// the front-view plan of each board, shared by declare and build
function boardPlan(b) {
  const [a, z] = b.x, [y0, y1] = b.y;
  if (!(a * z > 0 || (a >= 0 && z > 0))) throw new Error('billboard: a board must sit on one half of the layer (both x ends on the same side of the crease)');
  const lo = Math.min(Math.abs(a), Math.abs(z)), hi = Math.max(Math.abs(a), Math.abs(z)), sg = a + z < 0 ? -1 : 1;
  const faces = (b.faces || []).slice(0, 3), truss = !!b.truss;
  const frame = b.frame === false ? 0 : 0.007;
  const posts = Array.isArray(b.posts) ? b.posts : truss ? [Math.min(a, z) - 0.03, Math.max(a, z) + 0.03] : (() => {
    const n = b.posts ?? 2, w = Math.abs(z - a), m = Math.min(a, z);
    return n === 1 ? [m + w / 2] : Array.from({ length: n }, (_, i) => m + w * (0.2 + (0.6 * i) / Math.max(1, n - 1)));
  })();
  const postTop = b.postTop ?? (truss ? y1 + 0.012 : y0 + (y1 - y0) * 0.7);
  const pw = b.postW ?? (posts.length === 1 ? 0.026 : 0.014);
  const reach = Math.max(hi + frame, ...posts.map((p) => Math.abs(p) + pw / 2 + 0.005)) + 0.01;
  const top = Math.max(y1 + frame, postTop);
  return { a: Math.min(a, z), z: Math.max(a, z), lo, hi, sg, y0, y1, faces, truss, frame, posts, postTop, pw, reach, top };
}
function billboardDeclare(s, book) {
  const { theta, gamma } = vAngles(s, book);
  const reach = [0.05, 0.05], height = [0.012, 0.012];
  for (const b of s.boards || []) { const p = boardPlan(b), i = p.sg < 0 ? 0 : 1; reach[i] = Math.max(reach[i], p.reach); height[i] = Math.max(height[i], p.top); }
  if (s.reach) for (const i of [0, 1]) reach[i] = Math.max(reach[i], s.reach[i]);
  const out = { vlayers: [{ name: 'billboard', x0: s.x0, theta, gamma, reach, height }], slots: [] };
  if (s.tab) {
    const W2 = (book?.width ?? 1.5) / 2, u = s.tab.u ?? 0.5, tw = s.tab.w ?? 0.06;
    out.slots.push({ page: s.tab.page || 'near', u0: u - tw / 2, u1: u + tw / 2, x0: -W2 - 0.12, x1: -W2 + 0.2 });
  }
  return out;
}

// ---------------------------------------------------------------- one face, printed from the moment's description
// face: { bg, bg2 (optional second colour, a top-to-bottom wash), view: [w, h] (the drawing's own units, y down;
// default 1000 wide at the board's aspect), items: [...] }. Items, in view units:
//   { text, x, y, size, color, weight, align ('left' | 'center' | 'right'), tracking, font }
//   { path: '<SVG path data>', x, y, scale, rot (deg), color, stroke, lineWidth }
//   { shape: 'rect' | 'ellipse' | 'circle', x, y, w, h (rect: top-left corner and size; r rounds the corners),
//     rx, ry (ellipse, centred on x, y), r (circle), rot (deg), color, stroke, lineWidth }
//   { group: [...items], x, y, scale, rot, wave, look, blink }
// The moves (a group only; times in seconds, lengths in the group's units). Each runs now and then on its own, at
// `every` seconds give or take a third (so two groups with the same numbers drift apart), first after `phase`:
//   wave:  { pivot: [x, y] (0, 0), angle (deg each way, 16), swings (2), dur (1.6), every (6; 0 = only on a tap), phase (2) }
//   look:  { dirs: [[dx, dy], ...] (where it looks: [[-10, 0], [10, 0], [0, -8]]), move (0.22, each way), hold (0.9),
//            every (5), phase (1.5) }   the group slides to one of dirs, holds, slides back (pupils looking round)
//   blink: { pivot: [x, y] (0, 0, the line it closes on), dur (0.2), every (4), phase (0.8) }   squashed shut and open
// Text may set maxWidth (view units): a line wider than that is squeezed to fit, so a layout holds whatever the
// reader's system font is.
function drawItems(g, items, pose) {
  for (const it of items || []) {
    g.save();
    g.globalAlpha = it.opacity ?? 1;
    if (it.group) {
      g.translate(it.x ?? 0, it.y ?? 0); if (it.rot) g.rotate((it.rot * Math.PI) / 180); if (it.scale) g.scale(it.scale, it.scale);
      const q = pose?.get(it);
      if (q) {
        if (q.dx || q.dy) g.translate(q.dx, q.dy);
        if (q.a) { const [px, py] = it.wave?.pivot || [0, 0]; g.translate(px, py); g.rotate(q.a); g.translate(-px, -py); }
        if (q.sy !== 1) { const [px, py] = it.blink?.pivot || [0, 0]; g.translate(px, py); g.scale(1, q.sy); g.translate(-px, -py); }
      }
      drawItems(g, it.group, pose);
    } else if (it.text != null) {
      g.fillStyle = it.color || '#111';
      g.font = `${it.italic ? 'italic ' : ''}${it.weight ?? 500} ${it.size ?? 40}px ${it.font || FONT}`;
      g.textAlign = it.align || 'left'; g.textBaseline = it.baseline || 'alphabetic';
      if (it.tracking != null && 'letterSpacing' in g) g.letterSpacing = `${it.tracking}px`;
      g.translate(it.x ?? 0, it.y ?? 0); if (it.rot) g.rotate((it.rot * Math.PI) / 180);
      if (it.maxWidth) g.fillText(String(it.text), 0, 0, it.maxWidth); else g.fillText(String(it.text), 0, 0);
    } else {
      g.translate(it.x ?? 0, it.y ?? 0); if (it.rot) g.rotate((it.rot * Math.PI) / 180);
      let p;
      if (it.path) { if (it.scale) g.scale(it.scale, it.scale); p = new Path2D(it.path); }
      else {
        p = new Path2D();
        if (it.shape === 'ellipse') p.ellipse(0, 0, it.rx ?? 10, it.ry ?? it.rx ?? 10, 0, 0, Math.PI * 2);
        else if (it.shape === 'circle') p.arc(0, 0, it.r ?? 10, 0, Math.PI * 2);
        else if (it.r) p.roundRect(0, 0, it.w ?? 10, it.h ?? 10, it.r);
        else p.rect(0, 0, it.w ?? 10, it.h ?? 10);
      }
      if (it.color) { g.fillStyle = it.color; g.fill(p, it.rule || 'nonzero'); }
      if (it.stroke) { g.strokeStyle = it.stroke; g.lineWidth = (it.lineWidth ?? 2) / (it.path && it.scale ? it.scale : 1); g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(p); }
    }
    g.restore();
  }
}
// the groups in a face that move on their own
function movesIn(items, out = []) {
  for (const it of items || []) if (it.group) { if (it.wave || it.look || it.blink) out.push(it); movesIn(it.group, out); }
  return out;
}
// a group's moves, as clocks the piece runs: each has a kind, its times and its own seeded jitter
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function movesOf(it, face, tex) {
  const out = [], mk = (kind, o, every, phase, extra) => out.push({ kind, it, face, tex, every: o.every ?? every, phase: o.phase ?? phase, t0: -1, next: 0, away: true, held: false, ...extra });
  if (it.wave) { const w = it.wave; mk('wave', w, 6, 2, { amp: ((w.angle ?? 16) * Math.PI) / 180, swings: w.swings ?? 2, dur: w.dur ?? 1.6 }); }
  if (it.look) { const l = it.look; mk('look', l, 5, 1.5, { dirs: l.dirs || [[-10, 0], [10, 0], [0, -8]], move: l.move ?? 0.22, hold: l.hold ?? 0.9, dir: [0, 0], last: -1 }); }
  if (it.blink) { const b = it.blink; mk('blink', b, 4, 0.8, { dur: b.dur ?? 0.2 }); }
  return out;
}
function faceTexture(face, w, h, px = 2600) {
  const c = document.createElement('canvas');
  c.width = Math.max(4, Math.round(Math.min(2048, w * px))); c.height = Math.max(4, Math.round(c.width * (h / w)));
  const g = c.getContext('2d');
  const [vw, vh] = face.view || [1000, (1000 * h) / w];
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  // draw (and redraw, when a wave moves) the face; pose maps a waving group to its angle now
  t.userData.draw = (pose) => {
    g.setTransform(1, 0, 0, 1, 0, 0); g.scale(c.width / vw, c.height / vh);
    if (face.bg2) { const gr = g.createLinearGradient(0, 0, 0, vh); gr.addColorStop(0, face.bg || '#fff'); gr.addColorStop(1, face.bg2); g.fillStyle = gr; }
    else g.fillStyle = face.bg || '#F4F1E8';
    g.fillRect(0, 0, vw, vh);
    drawItems(g, face.items, pose);
    t.needsUpdate = true;
  };
  t.userData.draw(null);
  return t;
}

// a spotlight's pool on a face: brightest just under the lamp, widening and fading down the board (shared)
let spotTex = null;
function spotTexture() {
  if (spotTex) return spotTex;
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = j / (n - 1), x = Math.abs(i / (n - 1) - 0.5) * 2, half = 0.35 + 0.6 * v; // the cone widens downward
    const across = Math.max(0, 1 - (x / half) ** 2) ** 1.5, down = (1 - v) ** 1.4 * Math.min(1, v * 14);
    const a = Math.round(255 * across * down), o = (j * n + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = a;
  }
  g.putImageData(img, 0, 0);
  spotTex = new THREE.CanvasTexture(c); spotTex.colorSpace = THREE.SRGBColorSpace; spotTex.userData.shared = true;
  return spotTex;
}

// ---------------------------------------------------------------- the piece
export function billboard(ctx, s) {
  seed = 7; // the moves' jitter, the same every time the page is built
  const pal = ctx.palette, { theta, gamma } = vAngles(s, ctx.book);
  const frames = layerFrames(s.x0, theta, gamma);
  const D = billboardDeclare(s, ctx.book).vlayers[0], [rL, rR] = D.reach;
  const C = {
    post: pal.billboardPost || pal.lampPost || '#5E5A55', frame: pal.billboardFrame || '#3A3936', back: pal.billboardBack || '#2B2A28',
    base: s.base || pal.grass || pal.landLeft || '#C9B27A', rail: pal.billboardRail || pal.billboardPost || pal.lampPost || '#5E5A55',
  };
  const halves = { left: new THREE.Group(), right: new THREE.Group() };
  const stat = { left: new THREE.Group(), right: new THREE.Group() };
  halves.left.add(stat.left); halves.right.add(stat.right);
  // a low footing strip across both halves: a V-fold needs paper on both pages
  stat.left.add(card(rect(-rL, 0, 0, 0.012), { color: C.base, depth: 0.004, curveSegments: 1 }));
  stat.right.add(card(rect(0, 0, rR, 0.012), { color: C.base, depth: 0.004, curveSegments: 1 }));

  const boards = [], lampMats = [], glows = [], faceMats = [], pools = [];
  const zFront = s.z ?? 0.014;
  (s.boards || []).forEach((b, bi) => {
    const P = boardPlan(b), side = P.sg < 0 ? 'left' : 'right', st0 = stat[side], H = P.y1 - P.y0, Wb = P.z - P.a;
    const F = Math.max(1, P.faces.length), N = F === 1 ? 1 : (b.louvers ?? 14), w = Wb / N;
    const ap = F === 3 ? w / (2 * Math.sqrt(3)) : F === 2 ? 0.0012 : 0; // apothem: how far each face sits from the rod
    const zc = zFront - ap;
    // posts (cards standing on the layer, behind the board) and, for an overhead sign, a truss the board hangs on
    const pw = P.pw;
    for (const x of P.posts) st0.add(card(rect(x - pw / 2, 0, x + pw / 2, P.postTop), { color: b.postColor || C.post, depth: 0.005, curveSegments: 1 }));
    if (P.truss) {
      const tx0 = P.posts[0], tx1 = P.posts[P.posts.length - 1], th = Math.min(0.05, H * 0.45), ty = P.y0 + H * 0.5 - th / 2;
      const bars = [rect(tx0, ty, tx1, ty + 0.006), rect(tx0, ty + th - 0.006, tx1, ty + th)];
      const n = Math.max(2, Math.round((tx1 - tx0) / th));
      for (let i = 0; i < n; i++) {
        const xa = tx0 + ((tx1 - tx0) * i) / n, xb = tx0 + ((tx1 - tx0) * (i + 1)) / n, up = i % 2 === 0;
        const [p, q] = up ? [[xa, ty], [xb, ty + th]] : [[xa, ty + th], [xb, ty]];
        const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy), nx = (-dy / l) * 0.0025, ny = (dx / l) * 0.0025;
        bars.push(polyShape([[p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny], [q[0] - nx, q[1] - ny], [p[0] - nx, p[1] - ny]]));
      }
      const truss = card(bars, { color: C.post, depth: 0.004, curveSegments: 1 }); truss.position.z = zc - 2 * ap - 0.006; st0.add(truss);
    }
    // the board: a dark backing, the louvers in front of it, a frame round the edge
    if (F > 1) { const bk = card(rect(P.a, P.y0, P.z, P.y1), { color: C.back, depth: 0.003, curveSegments: 1 }); bk.position.z = zc - 2 * ap - 0.003; st0.add(bk); }
    if (P.frame) {
      const f = P.frame, fr = card([rect(P.a - f, P.y0 - f, P.z + f, P.y0), rect(P.a - f, P.y1, P.z + f, P.y1 + f), rect(P.a - f, P.y0, P.a, P.y1), rect(P.z, P.y0, P.z + f, P.y1)], { color: C.frame, depth: 0.004, curveSegments: 1 });
      fr.position.z = zFront + 0.002; st0.add(fr);
    }
    const lit = b.lit ?? s.lit ?? 0.9, screen = !!b.screen;
    const moves = [];
    const mats = P.faces.map((face, k) => {
      const t = faceTexture(face, Wb, H, b.px ?? 2600);
      for (const it of movesIn(face.items)) moves.push(...movesOf(it, k, t));
      // printed vinyl takes the lamps' warm light; a screen gives its own neutral light
      const m = paperMaterial('#fff', { map: t, emissiveMap: t, emissive: screen ? '#ffffff' : '#fff6e6', noCache: true, ...(screen ? { tooth: 0, grain: 0, bump: 0 } : {}) });
      faceMats.push([m, lit, b.dayGlow ?? s.dayGlow ?? 0.12]); return m;
    });
    if (!mats.length) mats.push(paperMaterial(C.back));
    const rods = [], hold = new THREE.Group(); hold.position.set(0, P.y0, 0);
    for (let i = 0; i < N; i++) {
      const rod = new THREE.Group(); rod.position.set(P.a + w * (i + 0.5), 0, zc);
      for (let k = 0; k < F; k++) {
        const geo = new THREE.PlaneGeometry(w * (N > 1 ? 0.985 : 1), H);
        const uv = geo.attributes.uv; for (let j = 0; j < uv.count; j++) uv.setX(j, (i + uv.getX(j)) / N);
        const ph = (k * 2 * Math.PI) / F, mesh = new THREE.Mesh(geo, mats[k]);
        mesh.rotation.y = ph; mesh.position.set(Math.sin(ph) * ap, H / 2, Math.cos(ph) * ap);
        mesh.castShadow = true; mesh.receiveShadow = !screen; // a lit screen shows no shade on its face
        rod.add(mesh);
      }
      hold.add(rod); rods.push(rod);
    }
    // the AO pass skips turning louvers (thin slats shade each other); a one-face board stays in it, or the shade of
    // whatever stands behind it would show through its face
    if (F > 1) noAO(hold);
    halves[side].add(hold);
    // the catwalk under a board: a ledge and a rail, with gooseneck lamps that throw light up onto the faces
    if ((b.catwalk ?? !screen) && !P.truss) {
      const cy = P.y0 - P.frame - 0.004, cw = [P.a - 0.006, P.z + 0.006];
      const bits = [rect(cw[0], cy - 0.007, cw[1], cy), rect(cw[0], cy + 0.022, cw[1], cy + 0.026)];
      for (let x = cw[0]; x <= cw[1] + 1e-6; x += (cw[1] - cw[0]) / Math.max(2, Math.round((cw[1] - cw[0]) / 0.035))) bits.push(rect(x - 0.0015, cy, x + 0.0015, cy + 0.022));
      const rail = card(bits, { color: C.rail, depth: 0.003, curveSegments: 1 }); rail.position.z = zFront + 0.012; st0.add(rail);
    }
    const nl = b.lamps ?? (P.truss || screen || b.catwalk === false ? 0 : Math.max(2, Math.round(Wb / 0.13)));
    for (let i = 0; i < nl; i++) {
      const x = P.a + (Wb * (i + 0.5)) / nl, y = P.y0 - P.frame - 0.004;
      const arm = card(polyShape([[x - 0.002, y], [x + 0.002, y], [x + 0.002, y + 0.03], [x - 0.002, y + 0.03]]), { color: C.rail, depth: 0.003, curveSegments: 1 });
      arm.position.z = zFront + 0.02; arm.userData.noAO = true; halves[side].add(arm); // kept out of the AO pass: it would smudge the face
      const hm = new THREE.MeshStandardMaterial({ color: '#4a4540', emissive: new THREE.Color(pal.lamp || '#FFD08A'), emissiveIntensity: 0, roughness: 0.6 });
      const head = card(polyShape([[x - 0.009, y + 0.028], [x + 0.009, y + 0.028], [x + 0.006, y + 0.038], [x - 0.006, y + 0.038]]), { material: hm, edgeMaterial: hm, depth: 0.006, curveSegments: 1 });
      head.position.z = zFront + 0.024; head.userData.noAO = true; halves[side].add(head); lampMats.push(hm);
      const gs = glowSprite(pal.lamp || '#FFD08A', b.glow ?? 0.07); gs.position.set(x, y + 0.04, zFront + 0.03); halves[side].add(gs); glows.push(gs);
    }
    // spotlights on the top edge (`topLamps: n`): an arm reaching forward over the face, a lamp head tipped down at
    // it, and at night a pool of light falling down the face from each head (`pool`, its strength, 0.5)
    const nt = b.topLamps ?? 0, yT = P.y1 + P.frame;
    for (let i = 0; i < nt; i++) {
      const x = P.a + (Wb * (i + 0.5)) / nt, reachZ = 0.034;
      const am = new THREE.MeshStandardMaterial({ color: C.rail, roughness: 0.7 });
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.016, 0.003), am); stem.position.set(x, yT + 0.008, zFront + 0.003);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, reachZ), am); arm.position.set(x, yT + 0.016, zFront + 0.003 + reachZ / 2);
      const hm = new THREE.MeshStandardMaterial({ color: '#4a4540', emissive: new THREE.Color(pal.lamp || '#FFD08A'), emissiveIntensity: 0, roughness: 0.6 });
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.009, 0.014, 16, 1), hm);
      head.position.set(x, yT + 0.011, zFront + reachZ); head.rotation.x = -0.55; // the open end tipped down and back at the face
      for (const m of [stem, arm, head]) { m.castShadow = true; m.userData.noAO = true; halves[side].add(m); }
      lampMats.push(hm);
      const gs = glowSprite(pal.lamp || '#FFD08A', b.glow ?? 0.05); gs.position.set(x, yT + 0.004, zFront + reachZ + 0.004); halves[side].add(gs); glows.push(gs);
      const pw2 = Math.min(Wb / nt * 1.5, H * 1.3), ph2 = H * 1.02;
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(pw2, ph2), new THREE.MeshBasicMaterial({ map: spotTexture(), color: new THREE.Color(pal.lamp || '#FFD08A'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      pool.position.set(x, P.y1 - ph2 / 2, zFront + 0.0026); pool.renderOrder = 3; pool.userData.noAO = true; pool.raycast = () => {};
      halves[side].add(pool); pools.push([pool, b.pool ?? 0.5]);
    }
    // the tap (and, with `drag`, the drag): an unseen card over the face, in front of the louvers
    let proxy = null, ph = null;
    if (F > 1 || moves.length) {
      proxy = new THREE.Mesh(new THREE.BoxGeometry(Wb, H, 0.004), new THREE.MeshBasicMaterial({ visible: false })); proxy.userData.hitProxy = true;
      ph = new THREE.Group(); ph.position.set((P.a + P.z) / 2, P.y0 + H / 2, zFront + 0.006); ph.add(proxy); halves[side].add(ph);
    }
    boards.push({ P, F, N, side, rods, start: b.start ?? 0, base: b.start ?? 0, beats: 0, p: 0, dir: 1, anim: null, peek: -1, next: (b.phase ?? bi * 0.6) + (s.every ?? 7), proxy, ph, hover: 0, hold, moves });
  });

  // a soft contact shade where each half meets its page
  const parts = [halfPart(halves.left, frames, 'left'), halfPart(halves.right, frames, 'right')];
  for (const [side, a, b] of [['left', -rL, 0], ['right', 0, rR]]) {
    const g = new THREE.Group(); const st = aoStrip(a, b, 0.04, s.footStrength ?? 0.2); st.position.z = -0.006; g.add(st);
    parts.push(halfPart(g, frames, side, { ao: true }));
  }
  mergeStatic(stat.left); mergeStatic(stat.right);

  // turning: p runs 0..1 through one turn, dir says which way (1: the louvers go from the left, -1: from the right);
  // the louvers follow one after another (stagger), eased, and the last one lands on the next face (or `steps` faces
  // on). base is the face showing.
  const STAG = s.stagger ?? 0.55, TURN = s.turn ?? 1.8, PEEK = 0.13;
  const pose = (bd) => {
    bd.hold.position.z = 0.003 * bd.hover;
    if (bd.F === 1) return;
    const step = (2 * Math.PI) / bd.F, steps = bd.anim?.steps ?? 1;
    bd.rods.forEach((rod, i) => {
      const j = bd.dir < 0 ? bd.N - 1 - i : i;
      const q = sstep(0, 1, (bd.p - STAG * (bd.N > 1 ? j / (bd.N - 1) : 0)) / (1 - STAG));
      rod.rotation.y = -(bd.base + bd.dir * q * steps) * step;
    });
  };
  const land = (bd) => { bd.base = (((bd.base + bd.dir * (bd.anim?.steps ?? 1)) % bd.F) + bd.F) % bd.F; };

  // the moves in the artwork: only the face showing moves (none while its board turns); a face that comes into view
  // starts its clocks afresh. Under reduced motion nothing moves on its own and a tap only sets a still pose (a wave
  // tips the group to one side, a look holds its first direction); the next tap sets it back.
  const REST = { a: 0, dx: 0, dy: 0, sy: 1 };
  const react = (bd) => { const k = showing(bd); let n = 0; for (const m of bd.moves) if (m.face === k) { m.t0 = -2; n++; } return n; };
  const showing = (bd) => (bd.anim || bd.p > 0 || bd.peek >= 0 || (drag && drag.active) || (tab && tab.pulling) ? -1 : bd.base);
  const value = (m, t) => {
    const u = t - m.t0;
    if (m.kind === 'wave') { const x = u / m.dur; return x >= 1 ? null : { a: m.amp * Math.sin(Math.PI * x) * Math.sin(2 * Math.PI * m.swings * x) }; }
    if (m.kind === 'blink') { const x = u / m.dur; return x >= 1 ? null : { sy: 1 - 0.9 * Math.sin(Math.PI * x) }; }
    const all = 2 * m.move + m.hold; if (u >= all) return null;
    const k = u < m.move ? sstep(0, 1, u / m.move) : u < m.move + m.hold ? 1 : 1 - sstep(0, 1, (u - m.move - m.hold) / m.move);
    return { dx: m.dir[0] * k, dy: m.dir[1] * k };
  };
  const heldValue = (m) => (m.kind === 'wave' ? { a: m.amp } : m.kind === 'look' ? { dx: m.dirs[0][0], dy: m.dirs[0][1] } : null);
  const fire = (m, t) => {
    m.t0 = t;
    if (m.kind === 'look') { let i = Math.floor(rand() * m.dirs.length); if (i === m.last && m.dirs.length > 1) i = (i + 1) % m.dirs.length; m.last = i; m.dir = m.dirs[i]; }
  };
  const later = (m, t) => t + m.every * (0.7 + 0.6 * rand());
  const movesTick = (bd, t, loops) => {
    let busy = false;
    const k = showing(bd), poses = new Map(), dirty = new Set();
    for (const m of bd.moves) {
      let v = null;
      if (m.face !== k) { // out of sight: back to rest, clocks restart when it shows again
        if (!m.away) { m.away = true; m.t0 = -1; m.held = false; dirty.add(m.tex); }
      } else {
        if (m.away) { m.away = false; m.next = t + m.phase * (0.8 + 0.4 * rand()); }
        if (m.t0 === -2) { if (loops) { fire(m, t); m.held = false; } else { m.t0 = -1; m.held = !m.held; } } // a tap, on the next frame
        if (loops && m.every > 0 && m.t0 < 0 && t >= m.next) fire(m, t);
        if (t + m.every * 2 < m.next) m.next = later(m, t); // the clock went back (a new page)
        if (m.t0 >= 0) {
          v = loops && t >= m.t0 ? value(m, t) : null;
          if (!v) { m.t0 = -1; m.next = later(m, t); } else busy = true;
        }
        if (!v && m.held) v = heldValue(m);
      }
      const q = poses.get(m.it) || { ...REST };
      if (v) Object.assign(q, v);
      poses.set(m.it, q);
      m.pose = m.pose || { ...REST };
      if (q.a !== m.pose.a || q.dx !== m.pose.dx || q.dy !== m.pose.dy || q.sy !== m.pose.sy) dirty.add(m.tex);
    }
    // keep what each group was drawn with, and redraw each face whose groups moved
    for (const m of bd.moves) m.pose = { ...poses.get(m.it) };
    for (const tex of dirty) tex.userData.draw(new Map(bd.moves.filter((m) => m.tex === tex).map((m) => [m.it, poses.get(m.it)])));
    return busy || dirty.size > 0;
  };
  const start = (bd, loops = true) => {
    if (bd.F === 1 || bd.anim) return;
    if (!loops) { bd.base = (bd.base + 1) % bd.F; bd.p = 0; pose(bd); return; }
    bd.dir = 1; bd.anim = { from: bd.p, to: 1 };
  };
  boards.forEach(pose);
  let loopsNow = true, tabFree = true;
  const playable = boards.filter((bd) => bd.F > 1); // boards that turn
  const tappable = boards.filter((bd) => bd.proxy); // a board with moves runs them on a tap; otherwise it turns

  // the drag on the boards (`drag: true`): every board with faces turns with the finger. The finger is read on one
  // upright plane through the crease, square to the reader (between the two halves of the V), so a stroke across a
  // board on either half reads the same way; a full turn is a stroke across about `dragSpan` (0.7) of the board.
  let drag = null;
  const extras = [];
  if (s.drag && playable.length) {
    const plane = new THREE.Group(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), O = new THREE.Vector3();
    const lx = new THREE.Vector3(), rx = new THREE.Vector3();
    let cos = { left: 0.8, right: 0.8 };
    extras.push({ obj: plane, noFit: true, frame: (sp, m) => {
      const f = frames(sp);
      lx.setFromMatrixColumn(f.left, 0).normalize(); rx.setFromMatrixColumn(f.right, 0).normalize();
      X.copy(lx).add(rx).normalize(); Y.setFromMatrixColumn(f.right, 1); Y.addScaledVector(X, -Y.dot(X)).normalize(); Z.crossVectors(X, Y);
      O.setFromMatrixPosition(f.right);
      cos = { left: Math.max(0.2, lx.dot(X)), right: Math.max(0.2, rx.dot(X)) };
      return m.makeBasis(X, Y, Z).setPosition(O);
    } });
    // the grip the keys move (and the engine's handle for this drag): it follows the finger and settles back
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.002, 0.002), new THREE.MeshBasicMaterial({ visible: false })); grip.userData.hitProxy = true;
    plane.add(grip);
    const home = playable[0], homeX = () => ((home.P.a + home.P.z) / 2) * cos[home.side], homeY = (home.P.y0 + home.P.y1) / 2;
    grip.position.set(homeX(), homeY, 0);
    const SPAN = s.dragSpan ?? 0.7;
    const g = { on: false, grab: 0, want: 0, s: 0, span: 0.3, bd: null, far: 0, hover: 0 };
    const boardAt = (x) => { // the board under a point of the plane (front-view x worked out from either half)
      let best = null, bd0 = 1e9;
      for (const bd of tappable) { const fx = x / cos[bd.side], d = Math.max(bd.P.a - fx, 0, fx - bd.P.z); if (d < bd0) { bd0 = d; best = bd; } }
      return best;
    };
    drag = {
      label: s.dragLabel || (s.label ? s.label + ', the boards' : 'The boards'), // its key button's name when a tab is the first drag
      targets: [grip, ...tappable.map((bd) => bd.proxy)], obj: plane, axis: 2, local: true,
      hover(on) { g.hover = on ? 1 : 0; for (const bd of boards) { bd.hover = g.hover; pose(bd); } },
      begin(p) {
        // a board still finishing a turn lands first, so the stroke starts from the face it shows
        settle();
        g.on = true; g.grab = p.x; g.want = 0; g.s = 0; g.far = 0; g.bd = boardAt(p.x);
        g.span = SPAN * (g.bd.P.z - g.bd.P.a) * cos[g.bd.side];
      },
      move(p) {
        const d = p.x - g.grab; g.far = Math.max(g.far, Math.abs(d));
        g.want = Math.max(-0.999, Math.min(0.999, d / g.span));
        grip.position.x = homeX() + Math.max(-1, Math.min(1, g.want)) * g.span;
      },
      end() {
        g.on = false;
        // a press that never moved is a tap on that board
        if (g.far < 0.006 && Math.abs(g.s) < 0.02) { for (const bd of playable) bd.p = 0; tap(g.bd); return; }
        // let go past half way and the boards finish the turn; short of it they fall back
        for (const bd of playable) bd.anim = { from: bd.p, to: bd.p > 0.5 ? 1 : 0 };
      },
      get active() { return g.on; },
    };
    // the hint: the louvers lean a little and settle (after the book opens, and on a tap on a face with no moves)
    drag.peek = (bd) => { if (!g.on && !bd.anim && !bd.p) bd.peek = 0; };
    drag.tick = (dt) => {
      if (!g.on) { grip.position.x += (homeX() - grip.position.x) * Math.min(1, dt * 8); return false; }
      g.s += (g.want - g.s) * Math.min(1, dt * 16);
      for (const bd of playable) { if (Math.abs(g.s) > 1e-3) bd.dir = Math.sign(g.s); bd.p = Math.abs(g.s); }
      return true;
    };
  }
  // a board still turning when a new stroke or pull starts lands where it is nearer, so the stroke starts from a face
  function settle() { for (const bd of playable) { if (bd.anim && bd.p > 0.5 && bd.anim.to >= 1) land(bd); bd.anim = null; bd.p = 0; bd.peek = -1; } }
  // the pull-tab: it springs back, and every board turns on to its next face while it is out, so each pull is one
  // turn (a two-face set: pull, the second pair; pull again, the first). Let go past half way and the boards finish
  // the turn; short of it they fall back. Its hint wiggle only leans the louvers a little.
  const tab = s.tab ? makePullTab(ctx, { ...s.tab, color: s.tab.color || pal.bridge || '#A44732', onBegin() { tabFree = true; settle(); }, onEnd() {
    for (const bd of playable) bd.anim = { from: bd.p, to: bd.p > 0.45 ? 1 : 0 };
    tabFree = false;
  } }) : null;
  if (tab) parts.push(tab.part);
  parts.push(...extras);
  ctx.lamp((k) => {
    for (const [m, l, d] of faceMats) m.emissiveIntensity = d * (1 - k) + l * k; // printed vinyl reads bright by day; lamps light it at night
    for (const m of lampMats) m.emissiveIntensity = 2.2 * k;
    for (const gs of glows) { gs.material.opacity = 0.85 * k; gs.visible = k > 0.01; }
    for (const [m, a] of pools) { m.material.opacity = a * k; m.visible = k > 0.01; }
  });

  // a tap: the face showing runs its moves; with nothing to move it turns (or, with the drag, leans as a hint)
  function tap(bd) {
    if (react(bd)) return;
    if (drag) { for (const b of playable) drag.peek(b); return; }
    start(bd, loopsNow);
  }
  const targets = []; for (const g of Object.values(halves)) g.traverse((m) => { if (m.isMesh && !m.userData.hitProxy) targets.push(m); });
  const flip = () => { for (const bd of playable) if (!bd.anim) { bd.dir = 1; bd.anim = { from: bd.p, to: 1 }; } };
  return {
    parts, targets,
    proxies: [...tappable.map((bd) => ({ mesh: bd.ph, size: Math.min(bd.P.z - bd.P.a, bd.P.y1 - bd.P.y0) })), ...(tab ? tab.proxies : [])],
    // with the drag, the pointer's taps arrive through the drag (a press that never moved); this poke is the keys' Enter
    pokes: drag
      ? [{ targets: tappable.map((bd) => bd.proxy), run() { for (const bd of tappable) tap(bd); }, hover: drag.hover }]
      : tappable.map((bd) => ({ targets: [bd.proxy], run() { tap(bd); }, hover(on) { bd.hover = on ? 1 : 0; pose(bd); } })),
    // the tab first: the piece's key button pulls it, as on every page with a tab; the boards' drag gets the second
    drag: drag && tab ? [tab.drag, drag] : drag || (tab ? tab.drag : undefined),
    nudge: tab ? () => tab.nudge() : drag ? () => { if (loopsNow) for (const bd of playable) drag.peek(bd); } : undefined,
    actions: {
      turn(i = 0) { const bd = playable[i]; if (bd) start(bd, loopsNow); }, flip, pull(k = 1) { tab?.set(k); },
      react(i = 0) { const bd = tappable[i]; if (bd) react(bd); }, wave(i = 0) { const bd = boards.filter((b) => b.moves.some((m) => m.kind === 'wave'))[i]; if (bd) react(bd); },
    },
    tick(t, dt, loops) {
      loopsNow = loops;
      let busy = tab ? tab.tick(dt) : false;
      if (drag && drag.tick(dt)) busy = true;
      if (tab && !tab.pulling && !tabFree && tab.k < 0.01) tabFree = true;
      for (const bd of playable) {
        if (drag?.active) { /* the finger has it */ }
        else if (tab && (tab.pulling || (tabFree && !bd.anim && tab.k > 0))) {
          // a pull turns the louvers with the tab; the nudge (its hint wiggle) only leans the first few
          bd.dir = 1; bd.p = Math.min(0.999, tab.pulling ? tab.k : tab.k * 0.4); bd.anim = null; busy = true;
        }
        else if (bd.anim) {
          const dir = Math.sign(bd.anim.to - bd.p) || 1;
          bd.p = loops ? bd.p + (dir * dt) / TURN : bd.anim.to;
          if ((dir > 0 && bd.p >= bd.anim.to) || (dir < 0 && bd.p <= bd.anim.to)) {
            if (bd.anim.to >= 1) land(bd);
            bd.p = 0; bd.anim = null;
          }
          busy = true;
        } else if (bd.peek >= 0) {
          bd.peek += dt / 1.2;
          if (bd.peek >= 1 || !loops) { bd.peek = -1; bd.p = 0; } else bd.p = PEEK * Math.sin(Math.PI * bd.peek) ** 2;
          bd.dir = 1; busy = true;
        } else if (bd.p) { bd.p = 0; busy = true; }
        // on its own: each beat sends a board to (its first face + beats), so boards that a tap or a pull put out of
        // step fall back into their pattern (two boards never show the same ad for long)
        if (loops && s.every !== 0 && !bd.anim && !(tab && tab.pulling) && !drag?.active && t >= bd.next) {
          bd.beats++; bd.next = t + (s.every ?? 7);
          const steps = (((bd.start + bd.beats - bd.base) % bd.F) + bd.F) % bd.F;
          if (steps) { bd.dir = 1; bd.anim = { from: bd.p, to: 1, steps }; }
        }
        else if (t + (s.every ?? 7) * 2 < bd.next) bd.next = t + (s.every ?? 7); // the clock went back (a new page): keep the beat
        pose(bd);
      }
      for (const bd of boards) if (bd.moves.length && movesTick(bd, t, loops)) busy = true;
      return busy ? 'fast' : false;
    },
    mount: { layers: [{ x0: s.x0, frames }], frames, x0: s.x0, theta, gamma },
  };
}

export const declares4 = { billboard: billboardDeclare };
