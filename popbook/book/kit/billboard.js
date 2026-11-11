// Kit, part 4: a billboard on the side-bound panorama.
//   billboard   a V-fold layer carrying one or more boards on posts. Each board is cut into vertical louvers on a
//               rod, a tri-vision sign: with two or three faces, the louvers turn one after another and the next ad
//               slides in. Tap a board: it turns to its next face. Pull the tab at the reader's edge: every board
//               turns with it, let go past half way and they finish the turn. On their own: the boards turn every
//               few seconds, one a beat after the other (each board's phase); each beat sends a board to its first
//               face plus the beat count, so after a tap the boards fall back into step. At night gooseneck lamps
//               on the catwalk light the faces. A board with one face is a plain sign (an overhead road sign on a
//               truss, a shop sign). The artwork lives in the moment file: each face is a background colour plus
//               text lines, SVG path data and simple shapes, drawn to a canvas, so the piece itself carries no
//               picture of its own.
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
  const postTop = truss ? y1 + 0.012 : y0 + (y1 - y0) * 0.7;
  const reach = Math.max(hi + frame, ...posts.map((p) => Math.abs(p) + 0.012)) + 0.01;
  const top = Math.max(y1 + frame, postTop);
  return { a: Math.min(a, z), z: Math.max(a, z), lo, hi, sg, y0, y1, faces, truss, frame, posts, postTop, reach, top };
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
//   { group: [...items], x, y, scale, rot }
function drawItems(g, items) {
  for (const it of items || []) {
    g.save();
    g.globalAlpha = it.opacity ?? 1;
    if (it.group) {
      g.translate(it.x ?? 0, it.y ?? 0); if (it.rot) g.rotate((it.rot * Math.PI) / 180); if (it.scale) g.scale(it.scale, it.scale);
      drawItems(g, it.group);
    } else if (it.text != null) {
      g.fillStyle = it.color || '#111';
      g.font = `${it.italic ? 'italic ' : ''}${it.weight ?? 500} ${it.size ?? 40}px ${it.font || FONT}`;
      g.textAlign = it.align || 'left'; g.textBaseline = it.baseline || 'alphabetic';
      if (it.tracking != null && 'letterSpacing' in g) g.letterSpacing = `${it.tracking}px`;
      g.translate(it.x ?? 0, it.y ?? 0); if (it.rot) g.rotate((it.rot * Math.PI) / 180);
      g.fillText(String(it.text), 0, 0);
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
function faceTexture(face, w, h, px = 2600) {
  const c = document.createElement('canvas');
  c.width = Math.max(4, Math.round(Math.min(2048, w * px))); c.height = Math.max(4, Math.round(c.width * (h / w)));
  const g = c.getContext('2d');
  const [vw, vh] = face.view || [1000, (1000 * h) / w];
  g.scale(c.width / vw, c.height / vh);
  if (face.bg2) { const gr = g.createLinearGradient(0, 0, 0, vh); gr.addColorStop(0, face.bg || '#fff'); gr.addColorStop(1, face.bg2); g.fillStyle = gr; }
  else g.fillStyle = face.bg || '#F4F1E8';
  g.fillRect(0, 0, vw, vh);
  drawItems(g, face.items);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- the piece
export function billboard(ctx, s) {
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

  const boards = [], lampMats = [], glows = [], faceMats = [];
  const zFront = s.z ?? 0.014;
  (s.boards || []).forEach((b, bi) => {
    const P = boardPlan(b), side = P.sg < 0 ? 'left' : 'right', st0 = stat[side], H = P.y1 - P.y0, Wb = P.z - P.a;
    const F = Math.max(1, P.faces.length), N = F === 1 ? 1 : (b.louvers ?? 14), w = Wb / N;
    const ap = F === 3 ? w / (2 * Math.sqrt(3)) : F === 2 ? 0.0012 : 0; // apothem: how far each face sits from the rod
    const zc = zFront - ap;
    // posts (cards standing on the layer, behind the board) and, for an overhead sign, a truss the board hangs on
    const pw = b.postW ?? (P.posts.length === 1 ? 0.026 : 0.014);
    for (const x of P.posts) st0.add(card(rect(x - pw / 2, 0, x + pw / 2, P.postTop), { color: C.post, depth: 0.005, curveSegments: 1 }));
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
    const lit = b.lit ?? s.lit ?? 0.9;
    const mats = P.faces.map((face) => {
      const t = faceTexture(face, Wb, H, b.px ?? 2600);
      const m = paperMaterial('#fff', { map: t, emissiveMap: t, emissive: '#fff6e6', noCache: true });
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
        mesh.castShadow = true; mesh.receiveShadow = true;
        rod.add(mesh);
      }
      hold.add(rod); rods.push(rod);
    }
    noAO(hold); halves[side].add(hold);
    // the catwalk under a board: a ledge and a rail, with gooseneck lamps that throw light up onto the faces
    if (b.catwalk !== false && !P.truss) {
      const cy = P.y0 - P.frame - 0.004, cw = [P.a - 0.006, P.z + 0.006];
      const bits = [rect(cw[0], cy - 0.007, cw[1], cy), rect(cw[0], cy + 0.022, cw[1], cy + 0.026)];
      for (let x = cw[0]; x <= cw[1] + 1e-6; x += (cw[1] - cw[0]) / Math.max(2, Math.round((cw[1] - cw[0]) / 0.035))) bits.push(rect(x - 0.0015, cy, x + 0.0015, cy + 0.022));
      const rail = card(bits, { color: C.rail, depth: 0.003, curveSegments: 1 }); rail.position.z = zFront + 0.012; st0.add(rail);
    }
    const nl = b.lamps ?? (P.truss || b.catwalk === false ? 0 : Math.max(2, Math.round(Wb / 0.13)));
    for (let i = 0; i < nl; i++) {
      const x = P.a + (Wb * (i + 0.5)) / nl, y = P.y0 - P.frame - 0.004;
      const arm = card(polyShape([[x - 0.002, y], [x + 0.002, y], [x + 0.002, y + 0.03], [x - 0.002, y + 0.03]]), { color: C.rail, depth: 0.003, curveSegments: 1 });
      arm.position.z = zFront + 0.02; st0.add(arm);
      const hm = new THREE.MeshStandardMaterial({ color: '#4a4540', emissive: new THREE.Color(pal.lamp || '#FFD08A'), emissiveIntensity: 0, roughness: 0.6 });
      const head = card(polyShape([[x - 0.009, y + 0.028], [x + 0.009, y + 0.028], [x + 0.006, y + 0.038], [x - 0.006, y + 0.038]]), { material: hm, edgeMaterial: hm, depth: 0.006, curveSegments: 1 });
      head.position.z = zFront + 0.024; head.userData.noAO = true; halves[side].add(head); lampMats.push(hm);
      const gs = glowSprite(pal.lamp || '#FFD08A', b.glow ?? 0.07); gs.position.set(x, y + 0.04, zFront + 0.03); halves[side].add(gs); glows.push(gs);
    }
    // the tap: an unseen card over the face, in front of the louvers
    let proxy = null, ph = null;
    if (F > 1) {
      proxy = new THREE.Mesh(new THREE.BoxGeometry(Wb, H, 0.004), new THREE.MeshBasicMaterial({ visible: false })); proxy.userData.hitProxy = true;
      ph = new THREE.Group(); ph.position.set((P.a + P.z) / 2, P.y0 + H / 2, zFront + 0.006); ph.add(proxy); halves[side].add(ph);
    }
    boards.push({ P, F, N, rods, start: b.start ?? 0, base: b.start ?? 0, beats: 0, p: 0, anim: null, next: (b.phase ?? bi * 0.6) + (s.every ?? 7), proxy, ph, hover: 0, hold });
  });

  // a soft contact shade where each half meets its page
  const parts = [halfPart(halves.left, frames, 'left'), halfPart(halves.right, frames, 'right')];
  for (const [side, a, b] of [['left', -rL, 0], ['right', 0, rR]]) {
    const g = new THREE.Group(); const st = aoStrip(a, b, 0.04, s.footStrength ?? 0.2); st.position.z = -0.006; g.add(st);
    parts.push(halfPart(g, frames, side, { ao: true }));
  }
  mergeStatic(stat.left); mergeStatic(stat.right);

  // turning: p runs 0..1 through one turn; the louvers follow one after another (stagger), eased, and the last
  // one lands on the next face (or `steps` faces on). base is the face showing.
  const STAG = s.stagger ?? 0.55, TURN = s.turn ?? 1.8;
  const pose = (bd) => {
    if (bd.F === 1) return;
    const step = (2 * Math.PI) / bd.F;
    bd.rods.forEach((rod, i) => {
      const q = sstep(0, 1, (bd.p - STAG * (bd.N > 1 ? i / (bd.N - 1) : 0)) / (1 - STAG));
      rod.rotation.y = -(bd.base + q * (bd.anim?.steps ?? 1)) * step;
    });
    bd.hold.position.z = 0.003 * bd.hover;
  };
  const start = (bd, loops = true) => {
    if (bd.F === 1 || bd.anim) return;
    if (!loops) { bd.base = (bd.base + 1) % bd.F; bd.p = 0; pose(bd); return; }
    bd.anim = { from: bd.p, to: 1 };
  };
  boards.forEach(pose);
  let loopsNow = true, tabFree = true;
  const tab = s.tab ? makePullTab(ctx, { ...s.tab, color: s.tab.color || pal.bridge || '#A44732', onBegin() { tabFree = true; }, onEnd() {
    // let go past half way and the boards finish the turn; short of it they fall back
    for (const bd of boards) if (bd.F > 1 && !bd.anim) bd.anim = { from: bd.p, to: bd.p > 0.45 ? 1 : 0 };
    tabFree = false;
  } }) : null;
  if (tab) parts.push(tab.part);
  ctx.lamp((k) => {
    for (const [m, l, d] of faceMats) m.emissiveIntensity = d * (1 - k) + l * k; // printed vinyl reads bright by day; lamps light it at night
    for (const m of lampMats) m.emissiveIntensity = 2.2 * k;
    for (const gs of glows) gs.material.opacity = 0.85 * k;
  });

  const playable = boards.filter((bd) => bd.F > 1);
  const targets = []; for (const g of Object.values(halves)) g.traverse((m) => { if (m.isMesh && !m.userData.hitProxy) targets.push(m); });
  return {
    parts, targets,
    proxies: [...playable.map((bd) => ({ mesh: bd.ph, size: Math.min(bd.P.z - bd.P.a, bd.P.y1 - bd.P.y0) })), ...(tab ? tab.proxies : [])],
    pokes: playable.map((bd) => ({ targets: [bd.proxy], run() { start(bd, loopsNow); }, hover(on) { bd.hover = on ? 1 : 0; pose(bd); } })),
    drag: tab ? tab.drag : undefined,
    nudge: tab ? () => tab.nudge() : undefined,
    actions: { turn(i = 0) { const bd = playable[i]; if (bd) start(bd, loopsNow); }, pull(k = 1) { tab?.set(k); } },
    tick(t, dt, loops) {
      loopsNow = loops;
      let busy = tab ? tab.tick(dt) : false;
      if (tab && !tab.pulling && !tabFree && tab.k < 0.01) tabFree = true;
      for (const bd of playable) {
        if (bd.anim) {
          const dir = Math.sign(bd.anim.to - bd.p) || 1;
          bd.p = loops ? bd.p + (dir * dt) / TURN : bd.anim.to;
          if ((dir > 0 && bd.p >= bd.anim.to) || (dir < 0 && bd.p <= bd.anim.to)) {
            if (bd.anim.to >= 1) bd.base = (bd.base + (bd.anim.steps ?? 1)) % bd.F;
            bd.p = 0; bd.anim = null;
          }
          busy = true;
        } else if (tab && (tab.pulling || (tabFree && tab.k > 0))) { bd.p = Math.min(0.999, tab.k); busy = true; }
        else if (bd.p) { bd.p = 0; busy = true; }
        // on its own: each beat sends a board to (its first face + beats), so boards that a tap or a pull put out of
        // step fall back into their pattern (two boards never show the same ad for long)
        if (loops && s.every !== 0 && !bd.anim && !(tab && tab.pulling) && t >= bd.next) {
          bd.beats++; bd.next = t + (s.every ?? 7);
          const steps = (((bd.start + bd.beats - bd.base) % bd.F) + bd.F) % bd.F;
          if (steps) bd.anim = { from: bd.p, to: 1, steps };
        }
        else if (t + (s.every ?? 7) * 2 < bd.next) bd.next = t + (s.every ?? 7); // the clock went back (a new page): keep the beat
        pose(bd);
      }
      return busy ? 'fast' : false;
    },
    mount: { layers: [{ x0: s.x0, frames }], frames, x0: s.x0, theta, gamma },
  };
}

export const declares4 = { billboard: billboardDeclare };
