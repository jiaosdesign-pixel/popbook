// Kit, part 3: a shop front on the side-bound panorama.
//   shop-front      a café front as a V-fold layer: a stone pier, a stucco sign band, tall storefront glass whose
//                   warm room lights up at night, and a glass double door split from the wall on brads. A pull-tab
//                   at the reader's edge swings both leaves open: The figure is in the doorway with her cup. On its own:
//                   steam rises off the cup sign in vellum wisps, and now and then she lifts her cup.
//   cafe-patio      the patio in front as its own V-fold layer: an umbrella over a table and two chairs on one
//                   half, a young tree in a planter on the other. Tap the umbrella: its canopy spins on the pole.
//                   On its own: the tree's crown sways.
//   ground:cafe-side  sidewalk with scored joints, a kerb and the parking lot at the reader's edge, a mulch bed
//                   behind the wall
import * as THREE from 'three';
import { card, polyShape, printTexture, paperMaterial, aoStrip, glowSprite, glowTexture, roundRect } from '../engine/paper.js';
import { sstep } from '../engine/motion.js';
import { vAngles } from './panorama.js';
import { makeFrontFigure, mergeStatic, rng, ellipse, capsule } from './filoli.js';
import { makePullTab } from './panorama2.js';

function layerFrames(x0, theta, gamma) {
  const f = { right: new THREE.Matrix4(), left: new THREE.Matrix4() };
  let sp0 = null, phi0 = null;
  return (sp) => { if (sp !== sp0 || sp.phi !== phi0) { sp.vlayer(x0, theta, gamma, f); sp0 = sp; phi0 = sp.phi; } return f; };
}
const halfPart = (obj, frames, side, extra = {}) => ({ obj, frame: (sp, m) => m.copy(frames(sp)[side]), ...extra });
const noAO = (obj) => { obj.traverse((m) => { if (m.isMesh) m.userData.noAO = true; }); return obj; };
const rect = (x0, y0, x1, y1) => polyShape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);

// the front-view plan of the wall, shared by declare and build
function plan(s) {
  const L = s.reach?.[0] ?? 0.64, R = s.reach?.[1] ?? 0.7, H = s.h ?? 0.36;
  const door = s.door || [0.05, 0.21], doorH = s.doorH ?? 0.2;
  const wing = s.wing ?? 0.47, wingH = s.wingH ?? 0.27, pierH = H + 0.02;
  const head = s.head ?? 0.235;
  const sign = { x: s.signX ?? (door[0] + door[1]) / 2, y: s.signY ?? (head + H) / 2 + 0.006, t: s.signT ?? 0.06 };
  // steam off the cup sign: where it leaves the tile, how far it rises, how tall one wisp is (steam: false for none)
  const steam = s.steam === false ? null : { x: sign.x - sign.t * 0.07, y: sign.y + sign.t * 0.3, rise: s.steamRise ?? 0.15, h: s.steamH ?? 0.095, grow: 1.35 };
  const steamTop = steam ? steam.y + steam.rise + steam.h * steam.grow + 0.005 : 0;
  return { L, R, H, door, doorH, wing, wingH, pierH, sill: 0.02, head, sign, steam, steamTop };
}
function shopDeclare(s, book) {
  const { theta, gamma } = vAngles(s, book), p = plan(s);
  const out = { vlayers: [{ name: 'shop front', x0: s.x0, theta, gamma, reach: [p.L, p.R], height: [Math.max(p.pierH, p.sign.x < 0 ? p.steamTop : 0), Math.max(p.H + 0.01, p.sign.x < 0 ? 0 : p.steamTop)] }], slots: [] };
  const t = s.tab || {};
  out.slots.push({ page: t.page || 'near', u0: (t.u ?? 0.5) - 0.03, u1: (t.u ?? 0.5) + 0.03, x0: -0.87, x1: -0.55 });
  return out;
}

export function shopFront(ctx, s) {
  const pal = ctx.palette, { theta, gamma } = vAngles(s, ctx.book), p = plan(s);
  const frames = layerFrames(s.x0, theta, gamma);
  const C = {
    wall: pal.wall || pal.stone || '#D8C8AE', line: pal.wallLine || 'rgba(70,50,30,0.16)', pier: pal.brick || '#A86A4E', band: pal.signBand || pal.wall || '#CDBB9E',
    frame: pal.frame || '#2B2723', glass: pal.glass || '#3A3936', room: pal.interior || '#E7B676', sign: pal.sign || pal.trim || '#F4EBD8', roof: pal.roof || '#6B4A3A',
  };
  const { L, R, H, door, doorH, wing, wingH, pierH, sill, head } = p;
  const [d0, d1] = door, dm = (d0 + d1) / 2;
  // windows: [x0, x1, y0, y1, mullions]
  const wins = s.windows || [[-0.47, -0.03, sill, head, 3], [d1 + 0.025, wing - 0.04, sill, head, 2], [wing + 0.05, R - 0.06, sill + 0.01, wingH - 0.06, 1]];
  const pierX = [-L, -0.5];
  const box = [-L, 0, R, pierH + 0.01];
  const outline = { left: [[-L, 0], [0, 0], [0, H], [pierX[1], H], [pierX[1], pierH], [-L, pierH]], right: [[0, 0], [R, 0], [R, wingH], [wing, wingH], [wing, H], [0, H]] };

  // the room seen through the glass: pendant lamps, a counter, shelves, a few chairs (printed on the glass by day, lit at night)
  const room = (g, x0, x1, y0, y1, r, lit) => {
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    const w = x1 - x0, hh = y1 - y0;
    if (!lit) {
      g.fillStyle = C.glass; g.fillRect(x0, y0, w, hh);
      const gr = g.createLinearGradient(x0, y0, x0, y1); gr.addColorStop(0, 'rgba(231,182,118,0.55)'); gr.addColorStop(1, 'rgba(231,182,118,0.18)');
      g.fillStyle = gr; g.fillRect(x0, y0, w, hh);
    } else { g.fillStyle = '#000'; g.fillRect(x0, y0, w, hh); }
    const warm = lit ? '#ffcf8a' : C.room;
    // back wall glow and the counter
    g.fillStyle = warm; g.globalAlpha = lit ? 0.85 : 0.45; g.fillRect(x0, y0 + hh * 0.42, w, hh * 0.42);
    g.globalAlpha = 1; g.fillStyle = lit ? '#5a3a1c' : 'rgba(40,28,18,0.7)'; g.fillRect(x0, y0 + hh * 0.2, w, hh * 0.12);
    // shelves
    g.fillStyle = lit ? '#ffe3b0' : 'rgba(255,236,200,0.35)';
    for (const f of [0.62, 0.74]) g.fillRect(x0, y0 + hh * f, w, 0.0025);
    // pendant lamps on cords
    for (let x = x0 + 0.03 + r() * 0.02; x < x1 - 0.01; x += 0.06 + r() * 0.03) {
      g.strokeStyle = lit ? '#4a3420' : 'rgba(30,24,18,0.6)'; g.lineWidth = 0.0012; g.beginPath(); g.moveTo(x, y1); g.lineTo(x, y1 - hh * 0.16); g.stroke();
      g.fillStyle = lit ? '#fff1cf' : '#F6D9A0'; g.beginPath(); g.ellipse(x, y1 - hh * 0.18, 0.009, 0.007, 0, 0, 7); g.fill();
    }
    // chair backs and table tops in silhouette
    g.fillStyle = lit ? '#3b2814' : 'rgba(25,20,16,0.65)';
    for (let x = x0 + 0.02 + r() * 0.03; x < x1 - 0.02; x += 0.07 + r() * 0.04) {
      g.fillRect(x, y0, 0.003, hh * 0.22); g.fillRect(x - 0.012, y0 + hh * 0.22, 0.03, 0.003);
    }
    if (!lit) { // a pale reflection across the glass
      g.fillStyle = 'rgba(220,226,240,0.16)'; g.beginPath(); g.moveTo(x0 + w * 0.15, y0); g.lineTo(x0 + w * 0.42, y0); g.lineTo(x0 + w * 0.72, y1); g.lineTo(x0 + w * 0.45, y1); g.closePath(); g.fill();
    }
    g.restore();
  };
  const glassFrame = (g, [x0, x1, y0, y1, n]) => {
    g.strokeStyle = C.frame; g.lineWidth = 0.007; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.lineWidth = 0.004;
    for (let i = 1; i < n; i++) { const x = x0 + ((x1 - x0) * i) / n; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
    g.beginPath(); g.moveTo(x0, y0 + (y1 - y0) * 0.16); g.lineTo(x1, y0 + (y1 - y0) * 0.16); g.stroke(); // a low rail
  };
  const signAt = p.sign;
  const letters = (g, lit) => {
    // the sign: one cup tile over the door (no lettering; the place line says where)
    const { x, y, t } = signAt, x0 = x - t / 2;
    g.fillStyle = lit ? '#fff4dc' : C.sign;
    g.beginPath(); g.roundRect(x0, y - t / 2, t, t, 0.006); g.fill();
    g.fillStyle = lit ? '#000' : C.band; // the cup cut out of the tile, a wisp of steam above it
    g.beginPath(); g.moveTo(x0 + t * 0.2, y + t * 0.12); g.lineTo(x0 + t * 0.66, y + t * 0.12); g.lineTo(x0 + t * 0.6, y - t * 0.3); g.lineTo(x0 + t * 0.26, y - t * 0.3); g.closePath(); g.fill();
    g.lineWidth = t * 0.07; g.strokeStyle = lit ? '#000' : C.band; g.lineCap = 'round';
    g.beginPath(); g.arc(x0 + t * 0.7, y - t * 0.06, t * 0.11, -1.3, 1.3); g.stroke();
    g.beginPath(); g.moveTo(x0 + t * 0.4, y + t * 0.2); g.bezierCurveTo(x0 + t * 0.32, y + t * 0.28, x0 + t * 0.5, y + t * 0.3, x0 + t * 0.42, y + t * 0.4); g.stroke();
  };
  const print = (lit) => (g) => {
    const r = rng(5);
    if (lit) { g.fillStyle = '#000'; g.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]); }
    else {
      // split-face block: the wall, coursed
      g.fillStyle = C.wall; g.fillRect(box[0], 0, box[2] - box[0], box[3]);
      g.strokeStyle = C.line; g.lineWidth = 0.0012;
      for (let y = 0.02, row = 0; y < H; y += 0.02, row++) {
        g.beginPath(); g.moveTo(box[0], y); g.lineTo(box[2], y); g.stroke();
        for (let x = box[0] + (row % 2) * 0.02; x < box[2]; x += 0.04) { g.beginPath(); g.moveTo(x, y - 0.02); g.lineTo(x, y); g.stroke(); }
      }
      for (let i = 0; i < 400; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,248,230,0.12)' : 'rgba(80,60,40,0.07)'; g.fillRect(box[0] + r() * (box[2] - box[0]), r() * H, 0.012, 0.006); }
      // the sign band: smooth stucco over the glass
      g.fillStyle = C.band; g.fillRect(pierX[1], head + 0.012, wing - pierX[1], H - head - 0.012);
      g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(pierX[1], head + 0.012, wing - pierX[1], 0.004);
      // the stone pier at the reader's end
      g.fillStyle = C.pier; g.fillRect(-L, 0, pierX[1] + L, pierH);
      for (let y = 0; y < pierH; y += 0.018) for (let x = -L + (Math.round(y / 0.018) % 2) * 0.012; x < pierX[1]; x += 0.026) {
        g.fillStyle = `rgba(${r() < 0.5 ? '255,236,210' : '60,30,20'},${0.08 + r() * 0.12})`; g.fillRect(x + 0.001, y + 0.001, 0.024, 0.016);
      }
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(pierX[1] - 0.004, 0, 0.004, pierH);
      // the lower wing's eave: standing-seam metal, sloping toward the reader
      g.fillStyle = C.roof; g.beginPath(); g.moveTo(wing - 0.01, wingH + 0.004); g.lineTo(R + 0.01, wingH - 0.026); g.lineTo(R + 0.01, wingH - 0.05); g.lineTo(wing - 0.01, wingH - 0.02); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.001; for (let x = wing; x < R; x += 0.012) { g.beginPath(); g.moveTo(x, wingH - 0.02 - ((x - wing) / (R - wing)) * 0.03); g.lineTo(x, wingH + 0.004 - ((x - wing) / (R - wing)) * 0.03); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(wing - 0.004, 0, 0.004, H);
      // a base course
      g.fillStyle = 'rgba(60,40,25,0.12)'; g.fillRect(box[0], 0, box[2] - box[0], sill);
    }
    for (const w of wins) { room(g, w[0], w[1], w[2], w[3], rng(Math.round(w[0] * 100) + 50), lit); if (!lit) glassFrame(g, w); }
    // the room behind the door shows above it, through the transom
    room(g, d0, d1, doorH + 0.006, head, rng(9), lit); if (!lit) glassFrame(g, [d0, d1, doorH + 0.006, head, 2]);
    if (!lit) { g.fillStyle = C.frame; g.fillRect(d0 - 0.006, 0, d1 - d0 + 0.012, 0.006); g.fillRect(d0 - 0.006, sill * 0, 0.006, head); g.fillRect(d1, 0, 0.006, head); g.fillRect(d0, doorH, d1 - d0, 0.006); }
    letters(g, lit);
  };
  const tex = printTexture(box, print(false), 1400, 2048), em = printTexture(box, print(true), 700, 1024);
  const mat = paperMaterial('#fff', { map: tex, emissiveMap: em, emissive: '#ffc98a' });
  // the right half has a doorway cut through it
  const rightShape = polyShape(outline.right);
  const hole = new THREE.Path(); hole.moveTo(d0, 0.001); hole.lineTo(d0, doorH); hole.lineTo(d1, doorH); hole.lineTo(d1, 0.001); hole.closePath();
  rightShape.holes.push(hole);
  const halves = { left: new THREE.Group(), right: new THREE.Group() };
  halves.left.add(card(polyShape(outline.left), { material: mat, edgeColor: C.wall, depth: 0.005, uvBox: box, curveSegments: 1 }));
  halves.right.add(card(rightShape, { material: mat, edgeColor: C.wall, depth: 0.005, uvBox: box, curveSegments: 1 }));

  // the room behind the door: a card on spacers, its own warm print
  const rb = [d0 - 0.02, 0, d1 + 0.02, doorH + 0.02];
  const roomTex = printTexture(rb, (g) => room(g, rb[0], rb[2], 0, rb[3], rng(21), false), 1400, 1024);
  const roomEm = printTexture(rb, (g) => room(g, rb[0], rb[2], 0, rb[3], rng(21), true), 700, 512);
  const roomMat = paperMaterial('#fff', { map: roomTex, emissiveMap: roomEm, emissive: '#ffc98a' });
  const back = card(rect(rb[0], rb[1], rb[2], rb[3]), { material: roomMat, edgeColor: C.frame, depth: 0.003, uvBox: rb, curveSegments: 1, castShadow: false });
  back.position.z = -(s.roomDepth ?? 0.05);
  const jambs = [[rb[0], d0], [d1, rb[2]]].map(([a, b]) => { const j = card(rect(a, 0, b, doorH), { color: C.frame, depth: 0.004 }); j.position.z = -0.02; return j; });
  halves.right.add(back, ...jambs);

  // The figure in the doorway with her cup: on a spacer between the wall and the room
  const fig = makeFrontFigure(pal, s.figureH ?? 0.17);
  const cupG = new THREE.Group(); cupG.position.set(0.06, 0.2, 0.022);
  const cupW = 0.11, cupH = 0.15;
  cupG.add(card(polyShape([[-cupW / 2, 0], [cupW / 2, 0], [cupW / 2 + 0.008, cupH], [-cupW / 2 - 0.008, cupH]]), { color: pal.cup || '#F4F1E8', depth: 0.004, curveSegments: 1 }));
  const sleeve = card(polyShape([[-cupW / 2 - 0.001, cupH * 0.3], [cupW / 2 + 0.001, cupH * 0.3], [cupW / 2 + 0.004, cupH * 0.66], [-cupW / 2 - 0.004, cupH * 0.66]]), { color: pal.cupSleeve || '#8A6A48', depth: 0.004, curveSegments: 1 }); sleeve.position.z = 0.002;
  const lid = card(roundRect(-cupW / 2 - 0.014, cupH, cupW / 2 + 0.014, cupH + 0.022, 0.008), { color: pal.cupLid || '#3B342E', depth: 0.004, curveSegments: 4 }); lid.position.z = 0.002;
  cupG.add(sleeve, lid); fig.fore.add(cupG);
  mergeStatic(fig.group, (o) => o === fig.fore);
  fig.group.position.set(s.figureX ?? dm - 0.028, 0.002, -(s.figureBehind ?? 0.03));
  const spacer = card(rect(-0.008, 0, 0.008, 0.03), { color: C.frame, depth: 0.012, curveSegments: 1 }); spacer.position.set(fig.group.position.x, 0.08, -(s.figureBehind ?? 0.03) - 0.01); // behind her, between her and the room
  const person = new THREE.Group(); person.add(fig.group, spacer); halves.right.add(noAO(person));

  // the door: two glass leaves on brads at their outer stiles; they swing out toward the reader
  const leafW = (d1 - d0) / 2 - 0.002, leaves = [];
  const leafFrame = (w) => { const sh = rect(0, 0, w, doorH - 0.004); const hl = new THREE.Path(); hl.moveTo(0.012, 0.03); hl.lineTo(w - 0.01, 0.03); hl.lineTo(w - 0.01, doorH - 0.016); hl.lineTo(0.012, doorH - 0.016); hl.closePath(); sh.holes.push(hl); return sh; };
  const glassMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(C.glass), roughness: 0.25, metalness: 0, transparent: true, opacity: s.glassOpacity ?? 0.5, depthWrite: false });
  for (const [hx, dir] of [[d0, 1], [d1, -1]]) {
    const leaf = new THREE.Group(); leaf.position.set(hx, 0.002, 0.004);
    const inner = new THREE.Group(); inner.scale.x = dir; leaf.add(inner);
    const fr = card(leafFrame(leafW), { color: C.frame, depth: 0.003, curveSegments: 1 }); inner.add(fr);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(leafW - 0.022, doorH - 0.046), glassMat); gl.position.set(0.011 + (leafW - 0.022) / 2, 0.03 + (doorH - 0.046) / 2, 0); gl.renderOrder = 3; inner.add(gl);
    const handle = card(rect(leafW - 0.016, 0.07, leafW - 0.011, 0.14), { color: pal.handle || '#C9B48C', depth: 0.004, curveSegments: 1 }); handle.position.z = 0.003; inner.add(handle);
    halves.right.add(noAO(leaf)); leaves.push({ leaf, dir }); // the mirrored leaf is the same card, flipped by its group
  }
  const wallTargets = [...halves.left.children, ...halves.right.children.slice(0, 1)];
  const doorTargets = []; for (const { leaf } of leaves) leaf.traverse((m) => { if (m.isMesh) doorTargets.push(m); });
  const parts = [halfPart(halves.left, frames, 'left'), halfPart(halves.right, frames, 'right')];
  for (const [side, a, b] of [['left', -L, 0], ['right', 0, R]]) {
    const g = new THREE.Group(); const st = aoStrip(a, b, 0.05, s.footStrength ?? 0.24); st.position.z = -0.006; g.add(st);
    parts.push(halfPart(g, frames, side, { ao: true }));
  }
  // light from the doorway (night) and from the glass, pooled on the sidewalk
  const glow = glowSprite('#ffcf8a', 0.18); glow.position.set(dm, doorH * 0.55, -0.02); halves.right.add(glow);
  const layers = [{ x0: s.x0, frames }];
  const poolMats = [];
  const pool = (side, sv, w, d) => {
    const page = side === 'left' ? 'far' : 'near', sg = page === 'near' ? 1 : -1;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(pal.lamp || '#FFD08A'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 2;
    mesh.position.set(s.x0 + sv * Math.cos(theta) - 0.08, 0.0015, sg * sv * Math.sin(theta));
    poolMats.push(mesh.material);
    parts.push({ obj: new THREE.Group().add(mesh), noFit: true, frame: (sp, m) => sp.pageFrame(page, m) });
  };
  for (const pl of s.pools || [['left', 0.26, 0.42, 0.24], ['right', dm, 0.24, 0.26], ['right', (d1 + wing) / 2, 0.22, 0.2]]) pool(...pl);

  mergeStatic(halves.left);

  // steam off the cup sign: vellum wisps on a loop (leave the tile, rise past the roof line, drift, thin out). It is
  // this piece's living loop; with motion reduced the wisps hold one pose.
  const wisps = [], STEAM_T = s.steamPeriod ?? 5.5, SIP_T = 8;
  if (p.steam) {
    const { x, y, h } = p.steam, n = 14, pts = [], cx = (i) => 0.2 * h * Math.sin((2 * Math.PI * i) / n), half = (i) => 0.14 * h * Math.sin((Math.PI * i) / n) ** 0.55;
    for (let i = 0; i <= n; i++) pts.push([cx(i) - half(i), (h * i) / n]);
    for (let i = n - 1; i > 0; i--) pts.push([cx(i) + half(i), (h * i) / n]);
    const steamG = new THREE.Group(); steamG.position.set(x, y, 0.006);
    for (let i = 0; i < (s.wisps ?? 3); i++) {
      const wm = paperMaterial(pal.steam || '#FFFDF4', { translucent: true, opacity: 0 }); wm.depthWrite = false; wm.emissive = new THREE.Color('#ffcf8a');
      const mesh = card(polyShape(pts), { material: wm, translucent: true, depth: 0.002, curveSegments: 1, castShadow: false });
      mesh.receiveShadow = false; mesh.renderOrder = 4; mesh.userData.noAO = true;
      steamG.add(mesh); wisps.push({ mesh, wm, flip: i % 2 ? -1 : 1 });
    }
    parts.push(halfPart(new THREE.Group().add(steamG), frames, signAt.x < 0 ? 'left' : 'right', { noFit: true })); // the engine owns a part's own matrix
  }
  const steamAt = (t) => wisps.forEach((w, i) => {
    const q = (((t / STEAM_T + i / wisps.length) % 1) + 1) % 1, g = 0.75 + (p.steam.grow - 0.75) * q;
    w.mesh.position.set(0.03 * q * Math.sin(q * 5.2 + i * 2.1), p.steam.rise * q, i * 0.0006);
    w.mesh.scale.set(w.flip * g, g, 1);
    w.wm.opacity = (s.steamOpacity ?? 0.92) * Math.min(1, q / 0.12) * (1 - q) ** 0.8;
  });
  steamAt(STEAM_T * 0.3);

  // the pull-tab: open the door
  const tab = makePullTab(ctx, { ...s.tab, page: s.tab?.page || 'near', color: s.tab?.color || pal.bridge || '#A44732', backTime: 1.1 });
  parts.push(tab.part);
  let lamps = 0, sip = 0;
  const place = () => {
    const k = Math.max(sstep(0, 1, tab.k), sip);
    const open = sstep(0, 1, tab.k);
    for (const { leaf, dir } of leaves) leaf.rotation.y = -dir * open * (s.swing ?? 1.5);
    // she lifts her cup as the door opens, and on her own now and then; at rest it stays at her shoulder
    fig.fore.rotation.z = -0.35 + 0.5 * k;
    glow.material.opacity = 0.75 * lamps * (0.35 + 0.65 * open);
    for (const m of poolMats) m.opacity = 0.42 * lamps;
  };
  ctx.lamp((k) => { lamps = k; mat.emissiveIntensity = 1.35 * k; roomMat.emissiveIntensity = 0.25 + 1.2 * k; for (const w of wisps) w.wm.emissiveIntensity = 0.3 * k; place(); });
  place();
  return {
    parts, targets: [...wallTargets, ...doorTargets],
    proxies: tab.proxies, drag: tab.drag, nudge: () => tab.nudge(),
    pokes: [{ targets: doorTargets, run() { tab.set(1); }, hover() {} }],
    actions: { open(k = 1) { tab.set(k); place(); } },
    tick(t, dt, loops) {
      const busy = tab.tick(dt);
      if (loops) { // steam all the time; the cup lifts every eight seconds or so
        if (wisps.length) steamAt(t);
        const u = ((t + 3) % SIP_T) / SIP_T; sip = s.sip === false ? 0 : sstep(0, 0.07, u) * (1 - sstep(0.17, 0.26, u));
      } else sip = 0;
      place();
      return busy ? 'fast' : loops ? 'draw' : false;
    },
    mount: { layers, frames, x0: s.x0, theta, gamma },
  };
}

// ---------------------------------------------------------------- ground: sidewalk, kerb, the lot at the reader's edge, a bed behind the wall
function sidePrinter(draw) {
  return {
    print(page, book, ground, pal, mask = false) {
      const W = book.width, D = book.depth;
      const box = page === 'near' ? [-W / 2, -D, W / 2, 0] : [-W / 2, 0, W / 2, D];
      return printTexture(box, (g) => {
        if (page === 'near') g.scale(1, -1);
        if (mask) { g.fillStyle = '#000'; g.fillRect(-W / 2, 0, W, D); return; }
        draw(g, { W, D, pal, ground, page });
      }, mask ? 250 : 1000, 2048);
    },
  };
}
export const cafeSidePrint = sidePrinter((g, { W, D, pal, ground, page }) => {
  const r = rng(page === 'near' ? 21 : 22), kerb = ground.kerb ?? -0.5, wall = ground.wall ?? 0.14, slope = 1 / Math.tan((ground.theta ?? 105) * Math.PI / 180);
  const walk = pal.walk || '#DCD3C2', joint = pal.walkLine || 'rgba(90,70,50,0.22)';
  g.fillStyle = walk; g.fillRect(-W / 2, 0, W, D);
  // a warm mottle on the concrete
  for (let i = 0; i < 60; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,250,235,0.18)' : 'rgba(120,100,80,0.06)'; g.beginPath(); g.ellipse(-W / 2 + r() * W, r() * D, 0.03 + r() * 0.06, 0.02 + r() * 0.04, r() * 3, 0, 7); g.fill(); }
  // scored joints
  g.strokeStyle = joint; g.lineWidth = 0.0022;
  for (let x = kerb + 0.12; x < W / 2; x += 0.12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, D); g.stroke(); }
  for (let u = 0.12; u < D; u += 0.12) { g.beginPath(); g.moveTo(kerb, u); g.lineTo(W / 2, u); g.stroke(); }
  // the bed behind the wall (its foot runs along the layer's hinge line), mulch with a few low plants
  const foot = (u) => wall + slope * u + 0.012;
  g.fillStyle = pal.bed || pal.mulch || '#A9A47E'; g.beginPath(); g.moveTo(foot(0), 0); g.lineTo(foot(D), D); g.lineTo(W / 2, D); g.lineTo(W / 2, 0); g.closePath(); g.fill();
  for (let i = 0; i < 220; i++) { const u = r() * D, x = foot(u) + r() * (W / 2 - foot(u)); g.fillStyle = r() < 0.5 ? 'rgba(60,50,30,0.14)' : 'rgba(255,250,230,0.18)'; g.fillRect(x, u, 0.006, 0.003); }
  for (let i = 0; i < 26; i++) { const u = r() * D, x = foot(u) + 0.04 + r() * (W / 2 - foot(u) - 0.05); g.fillStyle = r() < 0.5 ? (pal.hedge || '#4F6A45') : (pal.treeLight || '#6F8A55'); g.beginPath(); g.ellipse(x, u, 0.018 + r() * 0.02, 0.014 + r() * 0.014, r() * 3, 0, 7); g.fill(); }
  // the kerb and the lot at the reader's edge
  g.fillStyle = pal.asphalt || '#55524C'; g.fillRect(-W / 2, 0, kerb + W / 2, D);
  for (let i = 0; i < 300; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; g.fillRect(-W / 2 + r() * (kerb + W / 2), r() * D, 0.004, 0.004); }
  g.fillStyle = pal.kerb || '#CFC6B4'; g.fillRect(kerb - 0.012, 0, 0.016, D);
});

// ---------------------------------------------------------------- the patio in front: umbrella, table, chairs; a young tree in a planter
function patioPlan(s) {
  const ux = s.umbrella ?? -0.46, tx = s.tree ?? 0.46, cr = s.canopy ?? 0.15, poleH = s.poleH ?? 0.33;
  const umbTop = poleH + 0.012, treeTop = (s.treeH ?? 0.27) + 0.11; // the finial; the crown's highest leaf
  const side = (sg) => ({ reach: Math.max(0.05, sg * ux > 0 ? Math.abs(ux) + cr : 0, sg * tx > 0 ? Math.abs(tx) + 0.12 : 0) + 0.02, height: Math.max(0.012, sg * ux > 0 ? umbTop : 0, sg * tx > 0 ? treeTop : 0) });
  const reach = s.reach || [side(-1).reach, side(1).reach], height = s.height || [side(-1).height, side(1).height];
  return { ux, tx, cr, poleH, reach, height };
}
function patioDeclare(s, book) {
  const { theta, gamma } = vAngles(s, book), p = patioPlan(s);
  return { vlayers: [{ name: 'patio', x0: s.x0, theta, gamma, reach: p.reach, height: p.height }] };
}
export function cafePatio(ctx, s) {
  const pal = ctx.palette, { theta, gamma } = vAngles(s, ctx.book), P = patioPlan(s);
  const pf = layerFrames(s.x0, theta, gamma), ph = { left: new THREE.Group(), right: new THREE.Group() };
  const [pL, pR] = P.reach, { ux, tx, cr, poleH } = P;
  const edge = pal.kerb || '#CFC6B4';
  // the patio's low edge runs across both halves (a V-fold needs paper on both pages)
  ph.left.add(card(rect(-pL, 0, 0, 0.012), { color: edge, depth: 0.004, curveSegments: 1 }));
  ph.right.add(card(rect(0, 0, pR, 0.012), { color: edge, depth: 0.004, curveSegments: 1 }));
  const wood = pal.wood || '#9A7550', woodDark = pal.woodDark || '#6E5238', ink = pal.umbrella || '#26221F';
  const uside = ux < 0 ? 'left' : 'right';
  // the umbrella: a pole on the table, the canopy on a pivot at the pole's head (it spins round the pole on a tap)
  const um = new THREE.Group();
  um.add(card(rect(ux - 0.004, 0, ux + 0.004, poleH - 0.02), { color: pal.pole || '#D9D4C7', depth: 0.004, curveSegments: 1 }));
  const can = new THREE.Shape(); const cy = poleH - 0.075;
  can.moveTo(-cr, cy); can.quadraticCurveTo(-cr * 0.4, cy + 0.045, 0, poleH); can.quadraticCurveTo(cr * 0.4, cy + 0.045, cr, cy);
  for (let i = 6; i >= 0; i--) { const x = -cr + (2 * cr * i) / 6; can.quadraticCurveTo(x + cr / 6, cy - 0.017, x, cy); }
  const canopy = new THREE.Group(); canopy.position.set(ux, 0, 0.007);
  const cm = card(can, { color: ink, depth: 0.004, curveSegments: 10 }); canopy.add(cm);
  const finial = card(ellipse(0, poleH + 0.004, 0.006, 0.006), { color: pal.pole || '#D9D4C7', depth: 0.004, curveSegments: 6 }); finial.position.z = 0.001; canopy.add(finial);
  // a generous invisible hit box over the canopy, so a fingertip finds it on a phone
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(2 * cr + 0.02, 0.1, 0.03), new THREE.MeshBasicMaterial({ visible: false })); proxy.userData.hitProxy = true;
  const ph0 = new THREE.Group(); ph0.position.set(0, cy + 0.02, 0); ph0.add(proxy); canopy.add(ph0);
  um.add(canopy);
  // table and two chairs
  um.add(card(rect(ux - 0.06, 0.105, ux + 0.06, 0.115), { color: wood, depth: 0.004, curveSegments: 1 }));
  um.add(card(rect(ux - 0.035, 0.0, ux - 0.028, 0.105), { color: woodDark, depth: 0.004, curveSegments: 1 }), card(rect(ux + 0.028, 0, ux + 0.035, 0.105), { color: woodDark, depth: 0.004, curveSegments: 1 }));
  for (const cx of [ux - 0.115, ux + 0.115]) {
    const fl = cx < ux ? -1 : 1, ch = new THREE.Group();
    ch.add(card(rect(cx - 0.035, 0.06, cx + 0.035, 0.07), { color: wood, depth: 0.004, curveSegments: 1 }));
    ch.add(card(rect(cx + fl * 0.03, 0, cx + fl * 0.036, 0.15), { color: woodDark, depth: 0.004, curveSegments: 1 }));
    ch.add(card(rect(cx - fl * 0.03, 0, cx - fl * 0.024, 0.065), { color: woodDark, depth: 0.004, curveSegments: 1 }));
    for (const y of [0.09, 0.115, 0.14]) ch.add(card(rect(Math.min(cx + fl * 0.006, cx + fl * 0.036), y - 0.006, Math.max(cx + fl * 0.006, cx + fl * 0.036), y), { color: wood, depth: 0.004, curveSegments: 1 }));
    ch.position.z = 0.012; um.add(ch);
  }
  um.position.z = 0.003; ph[uside].add(um);
  // a young tree in a planter
  const tside = tx < 0 ? 'left' : 'right', tr = rng(s.seed ?? 8), tree = new THREE.Group(), treeH = s.treeH ?? 0.27, potH = s.planterH ?? 0.055, potW = s.planterW ?? 0.11;
  tree.add(card(capsule(tx, potH - 0.01, tx + 0.006, treeH - 0.06, 0.008), { color: pal.trunk || '#6E5A44', depth: 0.004, curveSegments: 4 }));
  const leafC = [pal.trees || '#4F6A45', pal.treeLight || '#6F8A55', pal.treeDark || '#3E5638'];
  // the crown is its own piece on the trunk's head, so it can sway
  const crown = new THREE.Group(), cpy = treeH - 0.06; crown.position.set(tx, cpy, 0);
  for (let i = 0; i < 9; i++) {
    const a = tr() * Math.PI * 2, rr = tr() * 0.05, cx = Math.cos(a) * rr * 1.2, cy2 = treeH - cpy + Math.sin(a) * rr, sz = 0.035 + tr() * 0.022;
    const m = card(ellipse(cx, cy2, sz, sz * 0.85), { color: leafC[i % 3], depth: 0.003, curveSegments: 10 }); m.position.z = 0.002 + i * 0.0007; crown.add(m);
  }
  mergeStatic(crown); tree.add(crown);
  const pot = card(polyShape([[tx - potW / 2, 0], [tx + potW / 2, 0], [tx + potW / 2 + 0.008, potH], [tx - potW / 2 - 0.008, potH]]), { color: pal.planter || edge, depth: 0.004, curveSegments: 1 }); pot.position.z = 0.009;
  const rim = card(rect(tx - potW / 2 - 0.012, potH - 0.008, tx + potW / 2 + 0.012, potH + 0.004), { color: pal.planterRim || pal.walk || '#DCD3C2', depth: 0.004, curveSegments: 1 }); rim.position.z = 0.011;
  tree.add(pot, rim);
  ph[tside].add(tree);
  const moving = (o) => o === canopy || o === crown;
  mergeStatic(ph.left, moving); mergeStatic(ph.right, moving);
  const parts = [halfPart(ph.left, pf, 'left'), halfPart(ph.right, pf, 'right')];
  for (const [side, a, b] of [['left', -pL, 0], ['right', 0, pR]]) {
    const g = new THREE.Group(); const st = aoStrip(a, b, 0.04, 0.2); st.position.z = -0.006; g.add(st);
    parts.push(halfPart(g, pf, side, { ao: true }));
  }
  const targets = [proxy]; canopy.traverse((m) => { if (m.isMesh && m !== proxy) targets.push(m); });
  // the spin: a tap gives the canopy a turn and a half; paper drag slows it, a soft spring settles it face-on
  const st = { a: 0, v: 0, hover: 0 };
  const place = () => { canopy.rotation.y = st.a; canopy.position.z = 0.007 + 0.003 * st.hover; };
  place();
  return {
    parts, targets,
    proxies: [{ mesh: ph0, size: 0.1 }],
    pokes: [{ targets, run() { st.v += s.spin ?? 14; }, hover(on) { st.hover = on ? 1 : 0; place(); } }],
    actions: { spin() { st.v += s.spin ?? 14; } },
    tick(t, dt, loops) {
      // a light breeze in the young tree: this piece's living loop
      if (loops && s.breeze !== false) crown.rotation.z = 0.045 * Math.sin(t * 0.9) + 0.018 * Math.sin(t * 2.3 + 1);
      const sway = loops && s.breeze !== false ? 'slow' : false;
      if (Math.abs(st.v) < 1e-3 && Math.abs(st.a) < 1e-4) return sway;
      const turn = 2 * Math.PI, near = Math.round(st.a / Math.PI) * Math.PI; // either face of the canopy reads the same
      const acc = (Math.abs(st.v) > 2.5 ? 0 : -18 * (st.a - near)) - 2.2 * st.v;
      st.v += acc * Math.min(dt, 0.05); st.a += st.v * Math.min(dt, 0.05);
      if (Math.abs(st.v) < 1e-3 && Math.abs(st.a - near) < 1e-4) { st.a = 0; st.v = 0; }
      if (st.a > turn) st.a -= turn;
      place();
      return 'fast';
    },
    mount: { layers: [{ x0: s.x0, frames: pf }], frames: pf, x0: s.x0, theta, gamma },
  };
}

export const declares3 = { shopFront: shopDeclare, cafePatio: patioDeclare };
