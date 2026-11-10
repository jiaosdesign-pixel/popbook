// Kit, part 2: what Filoli and the Bay Trail need on the side-bound panorama.
//   vfold-wrap        turns an old wall piece (tree line, roof, facade, arch, shore, shrubs, posts, lamps) into
//                     V-fold layers: each wall becomes one layer at x0 (far u -> +u, near u -> -u), split at
//                     the crease into its two halves. A half with nothing on it gets a low tie strip, because
//                     a V-fold needs paper on both pages. Its fold room is declared in the moment ('fold') and
//                     checked against the real geometry when it is built.
//   layer-figure      the figure facing the reader, standing a step behind a layer (in its opening); her forearm waves on a brad
//   layer-rider       A rider on a bike in a slit along one half of a layer: she rides by herself, back and forth;
//                     a pull-tab at the reader's edge lets the reader take over (wheels turn, legs pedal)
//   layer-roller      a pumpkin in a slit along one half of a layer: it rolls by itself; drag it along the slit
//   string-lights-v   posts on layers joined by fixed-length threads with bulbs (slack while the book is shut)
//   revolving-picture a Nister revolving picture: plain pumpkin into a carved jack-o'-lantern; pull its rim tab, or tap the wheel to spin it
//   bat-lever         a pull-tab at the reader's edge of the left page: two bats swing up behind the roof on a
//                     lever, the second a beat later (lost motion)
//   coil-gull         a paper gull on a paper coil spring: it bobs; tap it and it bounces
//   ground:filoli-side, ground:baytrail-side
import * as THREE from 'three';
import { card, polyShape, printTexture, paperMaterial, aoStrip, glowSprite, glowTexture, roundRect } from '../engine/paper.js';
import { Spread, Thread } from '../engine/mech.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glowTexture as glowTextureFn } from '../engine/paper.js';
import { slotLimit, sstep, hop } from '../engine/motion.js';
import { vAngles } from './panorama.js';
import { estate, pumpkinArch, makeFrontFigure, mergeStatic, makePumpkin, makeJack, rng, ellipse, capsule, grassStrokes } from './filoli.js';
import { farShore, shoreRocks, shrubBank, trailPost, trailLamps, makeCyclist } from './baytrail.js';

const LEGACY = { estate, 'pumpkin-arch': pumpkinArch, 'far-shore': farShore, 'shore-rocks': shoreRocks, 'shrub-bank': shrubBank, 'trail-post': trailPost, 'trail-lamps': trailLamps };
function layerFrames(x0, theta, gamma) {
  const f = { right: new THREE.Matrix4(), left: new THREE.Matrix4() };
  let sp0 = null, phi0 = null;
  return (sp) => { if (sp !== sp0 || sp.phi !== phi0) { sp.vlayer(x0, theta, gamma, f); sp0 = sp; phi0 = sp.phi; } return f; };
}
const halfPart = (obj, frames, side, extra = {}) => ({ obj, frame: (sp, m) => m.copy(frames(sp)[side]), ...extra });
// small moving things skip the soft-occlusion pass (a draw call each, for a contact shade nobody sees)
const noAO = (obj) => { obj.traverse((m) => { if (m.isMesh) m.userData.noAO = true; }); return obj; };
const hostFrames = (host, s) => host?.mount?.layers?.[s.layer ?? 0]?.frames || host?.mount?.frames;

// ---------------------------------------------------------------- split a group at the crease (x = 0)
const ATTRS = ['position', 'normal', 'uv', 'uv1'];
function clipGeometry(src, matrix, sign) {
  const g = (src.index ? src.toNonIndexed() : src.clone());
  g.applyMatrix4(matrix);
  const names = ATTRS.filter((n) => g.attributes[n]);
  const out = Object.fromEntries(names.map((n) => [n, []]));
  const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
  const newGroups = [];
  const vert = (i) => names.map((n) => { const a = g.attributes[n]; return Array.from({ length: a.itemSize }, (_, k) => a.array[i * a.itemSize + k]); });
  const lerp = (A, B, t) => A.map((a, j) => a.map((v, k) => v + (B[j][k] - v) * t));
  for (const gr of groups) {
    const start0 = out.position.length / 3;
    for (let i = gr.start; i < gr.start + gr.count; i += 3) {
      let poly = [vert(i), vert(i + 1), vert(i + 2)];
      const res = [];
      for (let k = 0; k < poly.length; k++) {
        const A = poly[k], B = poly[(k + 1) % poly.length];
        const da = sign * A[0][0], db = sign * B[0][0];
        if (da >= 0) res.push(A);
        if ((da >= 0) !== (db >= 0)) res.push(lerp(A, B, da / (da - db)));
      }
      for (let k = 1; k + 1 < res.length; k++) for (const V of [res[0], res[k], res[k + 1]]) names.forEach((n, j) => out[n].push(...V[j]));
    }
    const cnt = out.position.length / 3 - start0;
    if (cnt) newGroups.push({ start: start0, count: cnt, materialIndex: gr.materialIndex ?? 0 });
  }
  g.dispose();
  if (!out.position.length) return null;
  const geo = new THREE.BufferGeometry();
  for (const n of names) geo.setAttribute(n, new THREE.Float32BufferAttribute(out[n], g.attributes[n]?.itemSize ?? (n === 'position' || n === 'normal' ? 3 : 2)));
  for (const gr of newGroups) geo.addGroup(gr.start, gr.count, gr.materialIndex);
  return geo;
}
// moves (or clips) everything under `root` into two groups, left (x <= 0) and right (x >= 0). Objects that sit
// wholly on one side keep their identity, so their own animations still work.
export function splitAtCrease(root) {
  const left = new THREE.Group(), right = new THREE.Group(), eps = 1e-4;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const move = (node, side) => {
    const h = new THREE.Group(); h.matrixAutoUpdate = false; h.matrix.copy(node.parent.matrixWorld);
    node.parent.remove(node); h.add(node); (side < 0 ? left : right).add(h);
  };
  const visit = (node) => {
    if (node.isSprite || node.isPoints) { const p = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld); move(node, p.x < 0 ? -1 : 1); return; }
    box.makeEmpty(); box.setFromObject(node, true);
    if (box.isEmpty()) return;
    if (box.max.x <= eps) { move(node, -1); return; }
    if (box.min.x >= -eps) { move(node, 1); return; }
    if (node.isMesh && !node.isInstancedMesh) {
      for (const [sign, side] of [[-1, left], [1, right]]) {
        const geo = clipGeometry(node.geometry, node.matrixWorld, sign);
        if (!geo) continue;
        const m = new THREE.Mesh(geo, node.material); m.castShadow = node.castShadow; m.receiveShadow = node.receiveShadow; m.renderOrder = node.renderOrder;
        m.userData = { ...node.userData };
        side.add(m);
      }
      node.parent.remove(node);
      return;
    }
    if (node.isLineSegments || node.isLine) { move(node, (box.min.x + box.max.x) / 2 < 0 ? -1 : 1); return; }
    for (const c of [...node.children]) visit(c);
  };
  for (const c of [...root.children]) visit(c);
  return { left, right };
}
function extent(group) {
  group.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(group, true);
  return b.isEmpty() ? { reach: 0, height: 0 } : { reach: Math.max(Math.abs(b.min.x), Math.abs(b.max.x)), height: b.max.y };
}

// ---------------------------------------------------------------- vfold-wrap
function wrapDeclare(s, book) {
  const { theta, gamma } = vAngles(s, book);
  return { vlayers: (s.fold || []).map((f, i) => ({ name: `layer ${i + 1}`, x0: f.x0, theta, gamma, reach: f.reach, height: f.height })) };
}
export function vfoldWrap(ctx, s) {
  const { theta, gamma } = vAngles(s, ctx.book);
  // one or several old pieces; walls at the same distance share one layer
  const inners = [].concat(s.inner || []), builts = [];
  for (const inner of inners) {
    const fn = LEGACY[inner?.kit];
    if (!fn) throw new Error(`vfold-wrap '${s.id}': '${inner?.kit}' is not a wall piece it can wrap`);
    builts.push(fn(ctx, { id: s.id, ...inner }));
  }
  const built = {
    parts: builts.flatMap((q) => q.parts), targets: builts.flatMap((q) => q.targets || []), pokes: builts.flatMap((q) => q.pokes || []),
    tick: builts.some((q) => q.tick) ? (t, dt, l) => builts.reduce((r, q) => { const v = q.tick?.(t, dt, l); return v === 'fast' || r === 'fast' ? 'fast' : v || r; }, false) : undefined,
    setLight: builts.some((q) => q.setLight) ? (L) => builts.forEach((q) => q.setLight?.(L)) : undefined,
    dynamic: builts.some((q) => q.dynamic) ? (sp) => builts.forEach((q) => q.dynamic?.(sp)) : undefined,
  };
  const flat = new Spread(ctx.book?.depth ?? 1).set(Math.PI), half = new Spread(ctx.book?.depth ?? 1).set(Math.PI / 2), m = new THREE.Matrix4(), m2 = new THREE.Matrix4();
  const byX0 = new Map();
  for (const part of built.parts) {
    if (part.ao) continue;
    part.frame(flat, m);
    const zc = new THREE.Vector3().setFromMatrixColumn(m, 2), p = new THREE.Vector3().setFromMatrixPosition(m);
    part.frame(half, m2); // a wall follows the bisector as the book closes; a print stays flat on its page
    const yc = new THREE.Vector3().setFromMatrixColumn(m2, 1);
    if (Math.abs(zc.z) > 0.99 && Math.abs(p.y) < 1e-6 && Math.abs(yc.z) > 0.3) { // a wall standing on a page
      const key = +(-p.z).toFixed(4); // far page (z < 0) -> behind the gutter (+), near page -> in front (-)
      if (!byX0.has(key)) byX0.set(key, []);
      byX0.get(key).push({ obj: part.obj, x: p.x });
    } // anything printed flat on the page (old light pools) was placed for the old layout: dropped
  }
  const parts = [], layers = [], tie = s.tie || ctx.palette.grass || ctx.palette.landLeft;
  for (const [x0, walls] of byX0) {
    const root = new THREE.Group();
    for (const w of walls) { const h = new THREE.Group(); h.position.x = w.x; h.add(w.obj); w.obj.matrixAutoUpdate = true; root.add(h); }
    const halves = splitAtCrease(root);
    // a V-fold needs paper on both pages: an empty half gets a low tie strip
    for (const [side, g] of [['left', halves.left], ['right', halves.right]]) {
      if (g.children.length) continue;
      const L = s.tieReach ?? 0.12, d = side === 'left' ? -1 : 1;
      const tieCard = card(polyShape([[0, 0], [d * L, 0], [d * L, 0.004], [0, 0.008]]), { color: tie, depth: 0.002, curveSegments: 1 });
      tieCard.castShadow = false; tieCard.userData.noAO = true; g.add(tieCard); // low and ground-coloured: it should not draw the eye
    }
    const fold = (s.fold || []).find((f) => Math.abs(f.x0 - x0) < 2e-3);
    const eL = extent(halves.left), eR = extent(halves.right);
    if (!fold) throw new Error(`vfold-wrap '${s.id}': a wall became a layer at x0 ${x0}, but 'fold' declares none there`);
    const over = [eL.reach - fold.reach[0], eR.reach - fold.reach[1], eL.height - fold.height[0], eR.height - fold.height[1]];
    if (over.some((v) => v > 0.012)) throw new Error(`vfold-wrap '${s.id}' x0 ${x0}: the real layer (reach ${eL.reach.toFixed(3)}, ${eR.reach.toFixed(3)}; height ${eL.height.toFixed(3)}, ${eR.height.toFixed(3)}) is bigger than its 'fold' declaration`);
    const frames = layerFrames(x0, theta, gamma);
    parts.push(halfPart(halves.left, frames, 'left'), halfPart(halves.right, frames, 'right'));
    for (const [side, a, b] of [['left', -eL.reach, 0], ['right', 0, eR.reach]]) {
      const g = new THREE.Group(); const st = aoStrip(a, b, 0.05, s.footStrength ?? 0.22); st.position.z = -0.006; g.add(st);
      parts.push(halfPart(g, frames, side, { ao: true }));
    }
    layers.push({ x0, frames });
  }
  layers.sort((a, b) => b.x0 - a.x0);
  // light pools on the page in front of lamps (light, not paper): placed where the lamp's foot meets its page
  if (s.pools?.length) {
    const mats = [];
    for (const pl of s.pools) {
      const page = pl.x < 0 ? 'far' : 'near', sv = Math.abs(pl.x), sg = page === 'near' ? 1 : -1;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pl.w ?? 0.28, pl.d ?? 0.22), new THREE.MeshBasicMaterial({ map: glowTextureFn(), color: new THREE.Color(ctx.palette.lamp || '#FFD08A'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 2;
      mesh.position.set(pl.x0 + sv * Math.cos(theta) - (pl.toward ?? 0.06), 0.0015, sg * sv * Math.sin(theta));
      const g = new THREE.Group(); g.add(mesh); mats.push(mesh.material);
      parts.push({ obj: g, noFit: true, frame: (sp, m) => sp.pageFrame(page, m) });
    }
    ctx.lamp((k) => { for (const mt of mats) mt.opacity = (s.poolStrength ?? 0.45) * k; });
  }
  return {
    parts, targets: built.targets, tick: built.tick, setLight: built.setLight, pokes: built.pokes, dynamic: built.dynamic,
    mount: { layers, frames: layers[0]?.frames, theta, gamma },
  };
}

// ---------------------------------------------------------------- a reusable pull-tab at the reader's edge of a page
export function makePullTab(ctx, o) {
  const pal = ctx.palette, W2 = (ctx.book?.width ?? 1.5) / 2, page = o.page || 'near', sgn = page === 'near' ? 1 : -1;
  const u = o.u ?? 0.5, out = o.out ?? 0.075, tw = o.w ?? 0.06, maxPull = o.maxPull ?? 0.07, color = o.color || pal.bridge || '#A44732';
  const box = [-out - 0.02, -tw / 2, 0.03, tw / 2];
  const tex = printTexture(box, (g) => {
    g.fillStyle = color; g.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    g.strokeStyle = pal.core || '#F4F1E8'; g.lineWidth = 0.005; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-out + 0.03, -0.014); g.lineTo(-out + 0.012, 0); g.lineTo(-out + 0.03, 0.014); g.stroke();
  }, 1500, 512);
  const mat = paperMaterial('#fff', { map: tex, noCache: true });
  const tab = card(roundRect(box[0], box[1], box[2], box[3], 0.012, [1, 0, 0, 1]), { material: mat, edgeColor: color, depth: 0.0024, uvBox: box, curveSegments: 4 });
  tab.geometry.rotateX(-Math.PI / 2);
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(out + 0.06, 0.03, tw + 0.04), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.userData.hitProxy = true;
  const ph = new THREE.Group(); ph.position.x = -out / 2; ph.add(proxy);
  const lift = new THREE.Group(); lift.add(tab);
  const slide = new THREE.Group(); slide.add(lift, ph); slide.position.set(-W2, -0.004, sgn * u);
  const holder = new THREE.Group(); holder.add(slide);
  const st = { pull: 0, want: 0, drag: false, grab: 0, nudge: -1, hover: 0, hoverT: 0 };
  const nudgeAt = (t) => (t < 0 || t > 1 ? 0 : 0.024 * Math.sin(Math.PI * Math.min(1, t * 1.6)) ** 2 * (t < 0.62 ? 1 : 1 - (t - 0.62) / 0.38));
  const api = {
    part: { obj: holder, noFit: true, frame: (sp, m) => sp.pageFrame(page, m) },
    proxies: [{ mesh: ph, size: out + 0.06 }],
    maxPull,
    get k() { return Math.min(1, (st.pull + nudgeAt(st.nudge) * 1.6) / maxPull); },
    get pulling() { return st.drag; },
    drag: {
      targets: [tab, proxy], obj: holder, axis: 1,
      begin(x) { st.drag = true; st.nudge = -1; st.grab = x + st.pull; st.want = st.pull; o.onBegin?.(); },
      move(x) { st.want = slotLimit(st.grab - x, 0, maxPull, 0.006, 0.02); },
      end() { st.drag = false; o.onEnd?.(); },
      hover(on) { st.hoverT = on ? 1 : 0; },
      get active() { return st.drag; },
    },
    nudge() { if (!st.drag) st.nudge = 0; },
    set(k) { st.pull = st.want = k * maxPull; api.apply(); },
    apply() {
      slide.position.x = -W2 - st.pull - nudgeAt(st.nudge);
      lift.position.y = 0.0035 * st.hover; mat.emissive.set('#ffffff'); mat.emissiveIntensity = 0.12 * st.hover;
    },
    tick(dt) {
      if (st.drag) st.pull += (st.want - st.pull) * Math.min(1, dt * 12);
      else if (st.pull > 0 && o.springBack !== false) { st.pull *= Math.exp(-dt / (o.backTime ?? 0.55)); if (st.pull < 1e-4) st.pull = 0; }
      if (st.nudge >= 0) { st.nudge += dt / 1.1; if (st.nudge > 1) st.nudge = -1; }
      const hv = st.hover; st.hover += (st.hoverT - st.hover) * Math.min(1, dt * 10);
      api.apply();
      return st.drag || st.pull > 0 || st.nudge >= 0 || Math.abs(st.hover - hv) > 1e-4;
    },
    slot: { page, u0: u - tw / 2, u1: u + tw / 2, x0: -W2 - 0.12, x1: -W2 + 0.2 },
  };
  api.apply();
  return api;
}

// ---------------------------------------------------------------- the figure facing the reader on a layer
export function layerFigure(ctx, s) {
  const host = ctx.pieces[s.on], frames = hostFrames(host, s);
  if (!frames) throw new Error(`layer-figure: '${s.on}' is not a V-fold layer`);
  const fig = makeFrontFigure(ctx.palette, s.height ?? 0.18);
  mergeStatic(fig.group, (o) => o === fig.fore);
  const x = s.x ?? -0.1, behind = s.behind ?? 0.03;
  fig.group.position.set(x, s.y ?? 0, -behind);
  // no spacer card: she stands in the layer's opening (the arch), where a spacer would show as a box on her chest
  const holder = new THREE.Group(); holder.add(fig.group);
  const blob = aoStrip(x - 0.04, x + 0.04, 0.03, 0.35); blob.position.z = -behind; holder.add(blob);
  const targets = []; holder.traverse((m) => { if (m.isMesh && m.userData.aoBase == null) targets.push(m); });
  return {
    parts: [halfPart(holder, frames, x < 0 ? 'left' : 'right')], targets,
    tick(t, dt, loops) {
      if (!loops) return false;
      // a small wave every few seconds: the forearm swings on its brad, then rests
      const cyc = t % (s.every ?? 7.5), env = sstep(0, 0.5, cyc) * (1 - sstep(2.6, 3.2, cyc));
      fig.fore.rotation.z = -0.08 + env * 0.32 * Math.sin(cyc * 6.5);
      return env > 0.001 ? 'slow' : 'draw';
    },
  };
}

// ---------------------------------------------------------------- slit along one half of a layer (shared by the rider and the roller)
function slitDeclare(s, book) {
  const { theta } = vAngles(s, book), [a, b] = s.slot || [-0.8, -0.15], sn = Math.sin(theta);
  const { gamma } = vAngles(s, book), R = Math.max(Math.abs(a), Math.abs(b)) + 0.1, H = s.h ?? 0.3;
  const out = { on: s.on, vlayers: s.x0 != null ? [{ name: 'slit rider', x0: s.x0, theta, gamma, reach: a < 0 ? [R, 0.01] : [0.01, R], height: a < 0 ? [H, 0.01] : [0.01, H] }] : [], slots: [{ page: a < 0 ? 'far' : 'near', u0: Math.min(Math.abs(a), Math.abs(b)) * sn, u1: Math.max(Math.abs(a), Math.abs(b)) * sn, x0: -0.75, x1: 0.75 }] };
  if (s.tab) out.slots.push({ page: s.tab.page || (a < 0 ? 'far' : 'near'), u0: (s.tab.u ?? 0.5) - 0.03, u1: (s.tab.u ?? 0.5) + 0.03, x0: -0.87, x1: -0.55 });
  return out;
}
function slitMesh(a, b, y) {
  const cut = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(b - a) + 0.03, 0.0032), new THREE.MeshBasicMaterial({ color: '#2a2418', transparent: true, opacity: 0.4, depthWrite: false }));
  cut.position.set((a + b) / 2, y, 0.0026); cut.renderOrder = 2;
  return cut;
}

// A rider on a bike: she rides by herself along the slit, turning round at each end (the card flips); pull the
// tab at the reader's edge and you ride her yourself; let go and she carries on from there.
export function layerRider(ctx, s) {
  const pal = ctx.palette, host = ctx.pieces[s.on], frames = hostFrames(host, s);
  if (!frames) throw new Error(`layer-rider: '${s.on}' is not a V-fold layer`);
  const [a, b] = s.slot || [-0.8, -0.15], side = a < 0 ? 'left' : 'right', lo = Math.min(a, b), hi = Math.max(a, b);
  const sc = s.scale ?? 1.5, y = s.y ?? 0.004;
  const cy = makeCyclist(pal); cy.root.scale.setScalar(sc);
  const flip = new THREE.Group(); flip.add(cy.root);
  const slide = new THREE.Group(); slide.add(flip); slide.position.set(0, y, s.z ?? 0.008);
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.03), new THREE.MeshBasicMaterial({ visible: false })); proxy.userData.hitProxy = true;
  const ph = new THREE.Group(); ph.position.y = 0.08; ph.add(proxy); slide.add(ph);
  const holder = new THREE.Group(); holder.add(slide, slitMesh(a, b, y + 0.012)); noAO(slide);
  const blob = aoStrip(-0.07, 0.07, 0.025, 0.35); slide.add(blob);
  const tab = s.tab ? makePullTab(ctx, { ...s.tab, page: s.tab.page || (side === 'left' ? 'far' : 'near'), springBack: false, color: s.tab.color || pal.bike?.frame }) : null;
  const run = hi - lo - 0.08, speed = s.speed ?? 0.04;
  const st = { p: (s.at ?? 0.3) * 2 * run, x: lo + 0.04, dir: 1, dist: 0, ring: 9, lamps: 0, taken: false };
  const placeAt = (p) => { p = ((p % (2 * run)) + 2 * run) % (2 * run); const fwd = p < run; st.x = lo + 0.04 + (fwd ? p : 2 * run - p); st.dir = fwd ? 1 : -1; };
  placeAt(st.p);
  const apply = () => { slide.position.x = st.x; flip.rotation.y = st.dir > 0 ? 0 : Math.PI; flip.position.z = st.dir > 0 ? 0 : 0.004; };
  apply();
  ctx.lamp((v) => { st.lamps = v; cy.lights.head1.material.opacity = 0.95 * v; cy.lights.tailL.material.opacity = 0.8 * v; cy.lights.beam.material.opacity = 0.3 * v; });
  const targets = [proxy]; cy.root.traverse((m) => { if (m.isMesh && m.userData.aoBase == null) targets.push(m); });
  const ring = () => { if (st.ring > 0.9) st.ring = 0; };
  const parts = [halfPart(holder, frames, side)];
  if (tab) parts.push(tab.part);
  return {
    parts, targets,
    pokes: [{ targets, run: ring, hover: (on) => { slide.position.z = on ? 0.003 : 0; } }],
    proxies: [{ mesh: ph, size: 0.12 }, ...(tab ? tab.proxies : [])],
    drag: tab ? tab.drag : undefined,
    nudge: tab ? () => tab.nudge() : undefined,
    actions: { ring, take(k = 0.5) { tab?.set(k); } },
    tick(t, dt, loops) {
      let moved = 0;
      if (tab) tab.tick(dt);
      const k = tab ? tab.k : 0;
      if (tab && (tab.pulling || k > 0.002)) {
        // the reader drives: the tab's strip runs to the slider behind the layer
        const target = lo + 0.04 + k * run, dx = target - st.x;
        moved = Math.abs(dx); st.dir = dx >= 0 ? 1 : -1; st.x += dx; st.taken = true;
      } else if (loops) {
        if (st.taken) { st.p = st.dir > 0 ? st.x - lo - 0.04 : 2 * run - (st.x - lo - 0.04); st.taken = false; }
        st.p += dt * speed; const x0 = st.x; placeAt(st.p); moved = Math.abs(st.x - x0);
      }
      st.dist += moved;
      for (const w of cy.wheels) w.rotation.z = -st.dist / (cy.R * sc);
      cy.pose(0.6 - (st.dist / (cy.R * sc)) * 0.42);
      if (loops) { cy.scarfTail.rotation.z = 0.12 * Math.sin(t * 2.3); cy.pony.rotation.z = 0.08 * Math.sin(t * 2.3 + 1); }
      if (st.ring < 0.9) {
        st.ring = Math.min(0.9, st.ring + dt);
        const p = st.ring / 0.9, up = Math.sin(Math.PI * Math.min(1, p / 0.55)) * (p < 0.55 ? 1 : 0);
        cy.root.position.y = 0.009 * up * sc; cy.root.rotation.z = 0.05 * up;
        cy.bell.scale.setScalar(1 + 0.5 * Math.exp(-p * 6) * Math.abs(Math.sin(p * 40)));
        cy.ringG.scale.setScalar(0.6 + p * 0.9); cy.ringMat.opacity = Math.sin(Math.PI * Math.min(1, p * 1.4)) * (p < 0.72 ? 1 : 0);
        if (st.ring >= 0.9) { cy.root.position.y = 0; cy.root.rotation.z = 0; cy.ringMat.opacity = 0; cy.bell.scale.setScalar(1); }
      }
      apply();
      return 'fast';
    },
  };
}

// a pumpkin rolling slowly along a slit; drag it to roll it yourself
export function layerRoller(ctx, s) {
  const pal = ctx.palette, host = ctx.pieces[s.on], frames = hostFrames(host, s);
  if (!frames) throw new Error(`layer-roller: '${s.on}' is not a V-fold layer`);
  const [a, b] = s.slot || [0.15, 0.6], side = a < 0 ? 'left' : 'right', lo = Math.min(a, b), hi = Math.max(a, b), r = s.r ?? 0.034, y = s.y ?? 0.004;
  const pk = makePumpkin(pal, r, pal[s.color] || s.color || pal.pumpkin);
  const spin = new THREE.Group(); pk.position.y = 0; spin.add(pk);
  const slide = new THREE.Group(); slide.add(spin); slide.position.y = y + r * 0.82;
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(r * 2.4, r * 2.4, 0.03), new THREE.MeshBasicMaterial({ visible: false })); proxy.userData.hitProxy = true;
  const ph = new THREE.Group(); ph.add(proxy); slide.add(ph);
  const holder = new THREE.Group(); holder.add(slide, slitMesh(a, b, y + 0.006)); noAO(slide);
  const st = { x: s.at ?? (lo + hi) / 2, base: s.at ?? (lo + hi) / 2, drag: false, grab: 0, want: 0, idleFrom: 0, last: 0 };
  const amp = Math.min(s.drift ?? 0.12, (hi - lo) / 2 - r - 0.01);
  const apply = () => { slide.position.x = st.x; spin.rotation.z = -(st.x - lo) / r; };
  apply();
  const targets = [...pk.userData.meshes, proxy];
  let tNow = 0;
  return {
    parts: [halfPart(holder, frames, side)], targets,
    proxies: [{ mesh: ph, size: r * 2 }],
    drag: {
      targets, obj: holder, axis: 2, local: true,
      hover(on) { slide.position.z = on ? 0.003 : 0; },
      begin(p) { st.drag = true; st.grab = p.x - st.x; st.want = st.x; },
      move(p) { st.want = slotLimit(p.x - st.grab, lo + r, hi - r, 0.01, 0.025); },
      end() { st.drag = false; st.base = Math.max(lo + r + amp, Math.min(hi - r - amp, st.x)); st.idleFrom = tNow + 2.5; },
      get active() { return st.drag; },
    },
    tick(t, dt, loops) {
      tNow = t;
      if (st.drag) st.x += (st.want - st.x) * Math.min(1, dt * 10);
      else if (loops && t > st.idleFrom) st.x += (st.base + amp * Math.sin((t - st.idleFrom) * 0.25) - st.x) * Math.min(1, dt * 1.5);
      apply();
      return 'slow';
    },
  };
}

// ---------------------------------------------------------------- string lights between posts on layers
export function stringLightsV(ctx, s) {
  const pal = ctx.palette, posts = [], parts = [];
  const postMat = paperMaterial(pal.wood || '#7A624A');
  for (const p of s.posts) {
    const host = ctx.pieces[p.on], frames = hostFrames(host, p);
    if (!frames) throw new Error(`string-lights-v: '${p.on}' is not a V-fold layer`);
    const g = new THREE.Group();
    const post = card(polyShape([[-0.006, 0], [0.006, 0], [0.005, p.h], [-0.005, p.h]]), { material: postMat, edgeColor: pal.woodDark, depth: 0.005, curveSegments: 1 });
    post.position.set(p.x, 0, p.z ?? 0.006); g.add(post);
    const side = p.x < 0 ? 'left' : 'right';
    parts.push(halfPart(g, frames, side));
    posts.push({ ...p, frames, side });
  }
  const wireMat = new THREE.MeshStandardMaterial({ color: pal.wire || '#3B342E', roughness: 0.7 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: pal.bulb || '#F3E3BF', emissive: new THREE.Color(pal.bulbGlow || '#FFD08A'), emissiveIntensity: 0, roughness: 0.4 });
  // all bulbs are one instanced mesh, all their glows one Points layer (two draw calls for the lot)
  const strings = [], total = s.strings.reduce((n, sg) => n + sg.bulbs, 0);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0055, 8, 6), bulbMat, total); bulbs.castShadow = false; bulbs.frustumCulled = false; bulbs.userData.noAO = true;
  ctx.scene.add(bulbs);
  const gPos = new Float32Array(total * 3), gCol = new Float32Array(total * 3), gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3)); gGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
  const glows = new THREE.Points(gGeo, new THREE.PointsMaterial({ map: glowTexture(), size: 0.05 / Math.tan(15 * Math.PI / 180), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, color: new THREE.Color(pal.bulbGlow || '#FFD08A') }));
  glows.frustumCulled = false; ctx.scene.add(glows);
  let k0 = 0;
  for (const sg of s.strings) {
    const th = new Thread(0.0013, wireMat, 24); th.mesh.userData.noAO = true; th.mesh.castShadow = false; ctx.scene.add(th.mesh);
    strings.push({ a: posts[sg.from], z: posts[sg.to], th, n: sg.bulbs, first: k0, sag: sg.sag ?? 0.06 });
    k0 += sg.bulbs;
  }
  let lamps = 0, tw = 0;
  const top = (p, sp) => new THREE.Vector3(p.x, p.h - 0.004, p.z ?? 0.006).applyMatrix4(p.frames(sp)[p.side]);
  const M = new THREE.Matrix4(), P = new THREE.Vector3();
  function dynamic(sp) {
    for (const sg of strings) {
      sg.th.update(top(sg.a, sp), top(sg.z, sp), sg.sag);
      const path = sg.th.mesh.geometry.parameters?.path;
      for (let i = 0; i < sg.n && path; i++) {
        P.copy(path.getPoint((i + 1) / (sg.n + 1))); P.y -= 0.006;
        bulbs.setMatrixAt(sg.first + i, M.makeTranslation(P.x, P.y, P.z)); gPos.set([P.x, P.y, P.z], (sg.first + i) * 3);
      }
    }
    bulbs.instanceMatrix.needsUpdate = true; gGeo.attributes.position.needsUpdate = true;
  }
  const light = () => {
    bulbMat.emissiveIntensity = 1.6 * lamps; glows.visible = lamps > 0.01;
    for (let i = 0; i < total; i++) { const ph = i * 1.7, v = lamps * (0.55 + 0.35 * Math.sin(tw * 1.7 + ph) * Math.sin(tw * 0.6 + ph * 2)); gCol[i * 3] = gCol[i * 3 + 1] = gCol[i * 3 + 2] = v; }
    gGeo.attributes.color.needsUpdate = true;
  };
  return {
    parts, dynamic,
    setLight(L) { lamps = L.lamps; light(); },
    tick(t) { if (lamps < 0.02) return false; tw = t; light(); return 'draw'; },
  };
}
const stringsDeclare = (s) => ({ on: s.posts?.[0]?.on });

// ---------------------------------------------------------------- Nister revolving picture: plain pumpkin -> jack-o'-lantern
function revolvingDeclare(s, book) {
  const { theta, gamma } = vAngles(s, book), [x, y] = s.at || [-0.5, 0.15], r = s.r ?? 0.07;
  const left = x < 0;
  return { on: s.on, vlayers: [{ name: 'revolving picture', x0: s.x0, theta, gamma, reach: left ? [-x + r + 0.08, 0.01] : [0.01, x + r + 0.08], height: left ? [y + r, 0.01] : [0.01, y + r] }] };
}
export function revolvingPicture(ctx, s) {
  const pal = ctx.palette, host = ctx.pieces[s.on], frames = hostFrames(host, s);
  if (!frames) throw new Error(`revolving-picture: '${s.on}' is not a V-fold layer`);
  const [cx, cy] = s.at || [-0.5, 0.15], r = s.r ?? 0.07, N = s.sectors ?? 8, side = cx < 0 ? 'left' : 'right';
  const g = new THREE.Group(); g.position.set(cx, cy, s.z ?? 0.004);
  // picture B (behind): the carved face, glowing at night
  const jack = makeJack(pal, r * 0.95); jack.group.position.set(0, -r * 0.95 * 0.82, -0.014); g.add(jack.group);
  // its glow lies flat in the layer's plane, in front of the wheel. makeJack's sprite faces the camera, so on this angled layer it cut through the wheel: half the wheel washed out, the other half left dark
  jack.group.remove(jack.glow); jack.glow.material.dispose();
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(r * 3.2, r * 3.2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(pal.jackGlow || '#ffb24a'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.z = 0.012; halo.userData.glow = true; g.add(halo);
  // picture A (in front): the plain pumpkin, cut into N sectors that slide under the frame's blades
  const aTex = printTexture([-r, -r, r, r], (gg) => {
    gg.fillStyle = pal.pumpkin; gg.fillRect(-r, -r, 2 * r, 2 * r);
    const hl = gg.createRadialGradient(-r * 0.35, r * 0.3, 0, -r * 0.35, r * 0.3, r * 0.9); hl.addColorStop(0, 'rgba(255,240,215,0.3)'); hl.addColorStop(1, 'rgba(255,240,215,0)');
    gg.fillStyle = hl; gg.fillRect(-r, -r, 2 * r, 2 * r);
    gg.strokeStyle = pal.pumpkinRib || '#7A3A1A'; gg.globalAlpha = 0.45; gg.lineWidth = r * 0.05;
    for (const k of [0.3, 0.62]) { gg.beginPath(); gg.ellipse(0, 0, k * r, r * 0.8, 0, 0, Math.PI * 2); gg.stroke(); }
  }, 1600, 512);
  const aMat = paperMaterial('#fff', { map: aTex, noCache: true });
  const sectorGeo = (w) => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.absarc(0, 0, r * 0.98, -w / 2, w / 2, false); sh.lineTo(0, 0); const geo = new THREE.ShapeGeometry(sh, 8); const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + r) / (2 * r), (p.getY(i) + r) / (2 * r)); return geo; };
  // all N sectors in one mesh, rebuilt when the picture turns (one draw call instead of N)
  const sectorsGeo = (w, rot) => { const geos = []; for (let i = 0; i < N; i++) { const gg = sectorGeo(w); gg.rotateZ((i / N) * Math.PI * 2 + rot); geos.push(gg); } const out = mergeGeometries(geos, false); geos.forEach((q) => q.dispose()); return out; };
  const sectors = new THREE.Mesh(sectorsGeo(2 * Math.PI / N, 0), aMat); sectors.position.z = 0.0015; sectors.castShadow = true; sectors.receiveShadow = true;
  // the wheel that turns: the cut picture and its frame spin together about the hub; the carved face behind stays upright
  const wheel = new THREE.Group(); wheel.add(sectors); g.add(wheel);
  // the frame: a ring and N thin blades, with a small tab sticking out at the rim
  const frameMat = paperMaterial(s.frame || pal.wood || '#7A624A');
  const ringShape = new THREE.Shape(); ringShape.absarc(0, 0, r * 1.14, 0, Math.PI * 2, false); const hole = new THREE.Path(); hole.absarc(0, 0, r * 0.98, 0, Math.PI * 2, true); ringShape.holes.push(hole);
  const ringCard = card(ringShape, { material: frameMat, edgeColor: pal.woodDark, depth: 0.003, curveSegments: 40 }); ringCard.position.z = 0.003; g.add(ringCard);
  const blades = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2 + Math.PI / N; blades.push(capsule(Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12, Math.cos(a) * r * 0.99, Math.sin(a) * r * 0.99, r * 0.022)); }
  const bladeCard = card(blades, { material: frameMat, depth: 0.0025, curveSegments: 3 }); bladeCard.position.z = 0.004; g.add(bladeCard);
  const hub = card(ellipse(0, 0, r * 0.14, r * 0.14), { material: frameMat, depth: 0.003 }); hub.position.z = 0.0045; g.add(hub);
  // the frame is one static card set: ring, blades and hub merge into one mesh per material
  const frameG = new THREE.Group(); for (const m of [ringCard, bladeCard, hub]) { g.remove(m); frameG.add(m); } mergeStatic(frameG); wheel.add(frameG);
  const tabG = new THREE.Group(); g.add(tabG);
  const tab = card(roundRect(r * 1.08, -0.016, r * 1.08 + 0.05, 0.016, 0.01, [0, 1, 1, 0]), { color: s.tabColor || pal.pumpkinDeep || '#B4572E', depth: 0.0025, curveSegments: 4 }); tab.position.z = 0.0035; tabG.add(tab);
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.004), new THREE.MeshBasicMaterial({ visible: false })); proxy.userData.hitProxy = true; // thin: the engine grows it to a fingertip, and the wheel's own tap disc must stay in front of it
  const ph = new THREE.Group(); ph.position.set(r * 1.08 + 0.025, 0, 0.006); ph.add(proxy); tabG.add(ph);
  // the tap: an unseen disc over the wheel, in front of the tab's grown proxy, so the wheel taps and the tab beside it still drags
  const face = new THREE.Mesh(new THREE.CircleGeometry(r * 1.14, 24), new THREE.MeshBasicMaterial({ visible: false })); face.userData.hitProxy = true; face.position.z = 0.024; g.add(face);
  const holder = new THREE.Group(); holder.add(g); noAO(tabG); noAO(jack.group);
  const maxPull = 0.05, SPIN = s.spin ?? 1.5, TURNS = 2 * Math.PI * 2;
  // spin: -1 at rest, else 0..1 through one tap's spin (two turns, coasting to a stop, the picture changing on the way)
  const st = { k: 0, want: 0, drag: false, grab: 0, nudge: -1, hover: 0, hoverT: 0, lamps: 0, spin: -1, rot: 0, rot0: 0, rot1: 0, k0: 0, k1: 0, lift: 0 };
  const spin = () => {
    st.k0 = st.k; st.k1 = (st.spin >= 0 ? st.k1 : Math.round(st.k)) ? 0 : 1; // each tap lands on the other picture
    st.rot0 = st.rot; st.rot1 = Math.floor(st.rot / (2 * Math.PI)) * 2 * Math.PI - TURNS; st.spin = 0; st.nudge = -1;
  };
  function apply() {
    const nud = st.nudge < 0 ? 0 : 0.12 * Math.sin(st.nudge * Math.PI);
    const k = Math.min(1, st.k + nud);
    // each sector of A narrows toward its leading edge as the disc behind turns: B shows between the blades
    const w = (2 * Math.PI / N) * (1 - 0.97 * k);
    sectors.geometry.dispose(); sectors.geometry = sectorsGeo(w, (k * Math.PI) / N);
    tabG.position.x = st.k * maxPull + nud * maxPull; tabG.position.z = 0.002 * st.hover;
    wheel.rotation.z = st.rot; wheel.position.z = 0.002 * st.lift;
    jack.innerMat.emissiveIntensity = st.lamps * 1.4 * k; halo.material.opacity = st.lamps * 0.45 * k;
  }
  apply();
  return {
    parts: [halfPart(holder, frames, side)],
    proxies: [{ mesh: ph, size: 0.05 }],
    setLight(L) { st.lamps = L.lamps; apply(); },
    nudge() { if (!st.drag && st.spin < 0) st.nudge = 0; },
    pokes: [{ targets: [face], run: spin, hover(on) { st.lift = on ? 1 : 0; apply(); } }],
    drag: {
      targets: [tab, proxy], obj: holder, axis: 2, local: true,
      hover(on) { st.hoverT = on ? 1 : 0; },
      begin(p) { st.drag = true; st.nudge = -1; st.grab = p.x - st.k * maxPull; st.want = st.k; },
      move(p) { st.want = Math.max(0, Math.min(1, (p.x - st.grab) / maxPull)); },
      end() { st.drag = false; },
      get active() { return st.drag; },
    },
    actions: { turn(k = 1) { st.k = st.want = k; apply(); }, spin },
    tick(t, dt, loops) {
      const k0 = st.k, h0 = st.hover, spinning = st.spin >= 0;
      if (st.drag) st.k += (st.want - st.k) * Math.min(1, dt * 12);
      if (spinning) {
        // reduced motion: no spin, the picture simply changes
        st.spin = loops ? Math.min(1, st.spin + dt / SPIN) : 1;
        const p = st.spin, ease = 1 - (1 - p) ** 3;
        st.rot = st.rot0 + (st.rot1 - st.rot0) * ease;
        if (!st.drag) st.k = st.want = st.k0 + (st.k1 - st.k0) * sstep(0.1, 0.85, p); // a pull on the tab takes the picture over
        if (p >= 1) { st.spin = -1; st.rot = 0; }
      }
      if (st.nudge >= 0) { st.nudge += dt / 1.0; if (st.nudge > 1) st.nudge = -1; }
      st.hover += (st.hoverT - st.hover) * Math.min(1, dt * 10);
      const busy = st.drag || spinning || st.nudge >= 0 || Math.abs(st.k - k0) > 1e-4 || Math.abs(st.hover - h0) > 1e-4;
      if (busy) apply();
      return busy ? 'fast' : false;
    },
  };
}

// ---------------------------------------------------------------- bat lever: a tab at the left page's edge, two bats behind the roof
function batShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.004); s.quadraticCurveTo(0.02, 0.022, 0.05, 0.02); s.quadraticCurveTo(0.046, 0.01, 0.052, 0.002);
  s.quadraticCurveTo(0.04, 0.004, 0.036, -0.006); s.quadraticCurveTo(0.028, 0.002, 0.022, -0.008); s.quadraticCurveTo(0.014, -0.002, 0, -0.006); s.closePath();
  return s;
}
function makeBat(pal, size) {
  const body = new THREE.Group();
  const wings = [];
  for (const sd of [1, -1]) { const w = new THREE.Group(); const m = card(batShape(), { color: pal.bat, edgeColor: pal.batEdge || '#8C8496', edgeMix: 0.45, depth: 0.0018, curveSegments: 6 }); m.scale.x = sd; w.add(m); body.add(w); wings.push(w); }
  const head = card(ellipse(0, 0.004, 0.011, 0.013), { color: pal.bat, depth: 0.003 }); head.position.z = 0.001; body.add(head);
  const ears = card([polyShape([[-0.009, 0.012], [-0.002, 0.014], [-0.007, 0.024]]), polyShape([[0.009, 0.012], [0.002, 0.014], [0.007, 0.024]])], { color: pal.bat, depth: 0.002 }); ears.position.z = 0.001; body.add(ears);
  mergeStatic(body, (o) => wings.includes(o));
  body.traverse((m) => { if (m.isMesh) m.castShadow = false; }); // small and high: their shadow would fall far behind
  body.scale.setScalar(size);
  return { body, wings };
}
function batDeclare(s, book) {
  const { theta, gamma } = vAngles(s, book), hidden = Math.max(...s.bats.map((b) => b.hidden + 0.03));
  const reachL = Math.max(0.01, ...s.bats.filter((b) => b.x < 0).map((b) => -b.x + 0.06)), reachR = Math.max(0.01, ...s.bats.filter((b) => b.x >= 0).map((b) => b.x + 0.06));
  return { on: s.on, vlayers: [{ name: 'bats at rest', x0: s.x0, theta, gamma, reach: [reachL, reachR], height: [hidden, hidden] }], slots: [{ page: s.tab?.page || 'far', u0: (s.tab?.u ?? 0.5) - 0.03, u1: (s.tab?.u ?? 0.5) + 0.03, x0: -0.87, x1: -0.55 }] };
}
export function batLever(ctx, s) {
  const pal = ctx.palette, host = ctx.pieces[s.on], frames = hostFrames(host, s);
  if (!frames) throw new Error(`bat-lever: '${s.on}' is not a V-fold layer`);
  const tab = makePullTab(ctx, { ...s.tab, page: s.tab?.page || 'far', color: s.tab?.color || pal.bat, backTime: 0.9 });
  const parts = [tab.part], bats = [];
  const armMat = paperMaterial(pal.wire || '#3B342E');
  for (const [i, b] of s.bats.entries()) {
    const side = b.x < 0 ? 'left' : 'right';
    const { body, wings } = makeBat(pal, b.size ?? 1.2);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.0018, 1, 0.0015), armMat); arm.castShadow = false;
    const g = new THREE.Group(); g.position.set(b.x, 0, -(b.behind ?? 0.012)); g.add(arm, body);
    const hold = new THREE.Group(); hold.add(g); noAO(hold);
    parts.push(halfPart(hold, frames, side));
    bats.push({ b, body, wings, arm, delay: i * (s.lag ?? 0.35), ph: i * 2.1 });
  }
  let flapT = 0, lamps = 0;
  function place(t) {
    const k = tab.k;
    for (const bt of bats) {
      // lost motion: the second bat's link has play in its slot, so it starts late and arrives together
      const q = sstep(0, 1, Math.max(0, Math.min(1, (k - bt.delay) / (1 - bt.delay))));
      const raised = Math.max(q, (s.nightUp ?? 0) * lamps);
      const y = bt.b.hidden + (bt.b.raised - bt.b.hidden) * raised;
      bt.body.position.y = y + 0.006 * Math.sin(flapT * 0.9 + bt.ph) * raised;
      bt.body.rotation.z = 0.15 * Math.sin(flapT * 0.5 + bt.ph) * raised;
      const flap = 1 - 0.45 * Math.max(0, Math.sin(flapT * 6 + bt.ph)) * raised;
      for (const w of bt.wings) w.scale.y = flap;
      bt.arm.scale.y = Math.max(0.001, y - 0.004); bt.arm.position.y = bt.arm.scale.y / 2;
    }
  }
  place(0);
  return {
    parts, proxies: tab.proxies, drag: tab.drag, nudge: () => tab.nudge(),
    actions: { pull(k = 1) { tab.set(k); place(flapT); } },
    setLight(L) { lamps = L.lamps; place(flapT); },
    tick(t, dt, loops) {
      const busy = tab.tick(dt);
      if (loops) flapT = t;
      place(flapT);
      return busy || tab.k > 0.01 || lamps > 0.02 ? 'fast' : false;
    },
  };
}

// ---------------------------------------------------------------- a gull on a paper coil spring
function coilDeclare(s, book) {
  const { theta, gamma } = vAngles(s, book), x = s.x ?? 0.3, top = (s.h ?? 0.16) + 0.04;
  return { on: s.on, vlayers: [{ name: 'gull', x0: s.x0, theta, gamma, reach: x < 0 ? [-x + 0.06, 0.01] : [0.01, x + 0.06], height: x < 0 ? [top, 0.01] : [0.01, top] }] };
}
export function coilGull(ctx, s) {
  const pal = ctx.palette, host = ctx.pieces[s.on], frames = hostFrames(host, s);
  if (!frames) throw new Error(`coil-gull: '${s.on}' is not a V-fold layer`);
  const x = s.x ?? 0.3, H = s.h ?? 0.16, side = x < 0 ? 'left' : 'right';
  const bird = new THREE.Group();
  const add = (shape, color, z, parent = bird) => { const m = card(shape, { color, depth: 0.0016, bevel: 0.0003, curveSegments: 6 }); m.position.z = z; parent.add(m); return m; };
  const wingShape = () => { const w = new THREE.Shape(); w.moveTo(-0.004, 0); w.quadraticCurveTo(-0.012, 0.018, -0.03, 0.022); w.quadraticCurveTo(-0.016, 0.01, 0.006, 0.002); w.closePath(); return w; };
  const wingFar = new THREE.Group(), wingNear = new THREE.Group(); bird.add(wingFar);
  add(wingShape(), pal.gullWing, -0.002, wingFar).scale.set(-0.9, 0.9, 1);
  add(ellipse(0, 0, 0.016, 0.005), pal.gullBody, 0);
  add(ellipse(0.015, 0.003, 0.005, 0.0045), pal.gullBody, 0.0002);
  add(polyShape([[0.019, 0.003], [0.026, 0.002], [0.019, 0.0015]]), pal.gullBeak, 0.0003);
  bird.add(wingNear); add(wingShape(), pal.gullWing, 0.002, wingNear);
  add(polyShape([[-0.024, 0.02], [-0.031, 0.022], [-0.026, 0.017]]), pal.gullTip || '#2E2E2E', 0.0022, wingNear);
  bird.scale.setScalar(s.scale ?? 2);
  // the coil: a thin paper strip folded into a zigzag (it compresses and stretches as the gull bobs)
  const coilMat = paperMaterial(pal.signWhite || '#F1EEE4');
  const coil = new THREE.Group();
  const zig = (len) => { const n = 9, pts = []; for (let i = 0; i <= n; i++) pts.push([(i % 2 ? 1 : -1) * 0.007, (i / n) * len]); const shp = []; for (let i = 0; i < n; i++) shp.push(capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0.0016)); return shp; };
  const coilCard = card(zig(1), { material: coilMat, depth: 0.002, curveSegments: 3 }); coil.add(coilCard);
  const g = new THREE.Group(); g.position.set(x, 0, s.z ?? -0.004); g.add(coil, bird);
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.02), new THREE.MeshBasicMaterial({ visible: false })); proxy.userData.hitProxy = true;
  const ph = new THREE.Group(); ph.add(proxy); bird.add(ph); ph.scale.setScalar(1 / (s.scale ?? 2));
  const targets = [proxy]; bird.traverse((m) => { if (m.isMesh) targets.push(m); });
  const st = { y: 0, v: 0, tNow: 0, hover: 0 };
  const place = () => {
    const y = H + st.y + 0.004 * Math.sin(st.tNow * 0.8);
    bird.position.y = y; bird.rotation.z = 0.05 * Math.sin(st.tNow * 0.8 + 1) - st.v * 0.6;
    coil.scale.y = y - 0.004; bird.position.z = 0.002 * st.hover;
    const f = Math.sin(st.tNow * 2.2) * 0.1 + st.v * 2;
    wingNear.rotation.z = f; wingFar.rotation.z = -f * 0.8;
  };
  place();
  return {
    parts: [halfPart(noAO(new THREE.Group().add(g)), frames, side)], targets,
    proxies: [{ mesh: ph, size: 0.08 }],
    pokes: [{ targets, run() { st.v -= 0.25; }, hover(on) { st.hover = on ? 1 : 0; place(); } }],
    tick(t, dt, loops) {
      st.tNow = loops ? t : st.tNow;
      // a damped spring: a tap pushes it down, it bounces and settles
      const a = -90 * st.y - 4 * st.v; st.v += a * dt; st.y += st.v * dt;
      place();
      return Math.abs(st.v) > 1e-3 || Math.abs(st.y) > 1e-4 ? 'fast' : 'draw';
    },
  };
}

// ---------------------------------------------------------------- ground prints for the side-bound Filoli and Bay Trail
// drawn per page in (x along the gutter, u from the gutter); the reader's edge is x = -W/2
function sidePrinter(draw) {
  return {
    print(page, book, ground, pal, mask = false) {
      const W = book.width, D = book.depth;
      const box = page === 'near' ? [-W / 2, -D, W / 2, 0] : [-W / 2, 0, W / 2, D];
      return printTexture(box, (g) => {
        if (page === 'near') g.scale(1, -1);
        if (mask) { g.fillStyle = '#000'; g.fillRect(-W / 2, 0, W, D); g.fillStyle = '#fff'; draw.water?.(g, { W, D, pal, ground, page }); return; }
        draw.paint(g, { W, D, pal, ground, page });
      }, mask ? 250 : 1000, 2048);
    },
  };
}
export const filoliSidePrint = sidePrinter({
  paint(g, { W, D, pal, ground, page }) {
    const r = rng(page === 'near' ? 5 : 6);
    g.fillStyle = pal.field; g.fillRect(-W / 2, 0, W, D);
    for (let i = 0; i < 26; i++) { g.fillStyle = r() < 0.5 ? pal.fieldPatch || pal.fieldDark : pal.fieldLight; g.globalAlpha = 0.28; g.beginPath(); g.ellipse(-W / 2 + r() * W, r() * D, 0.04 + r() * 0.09, 0.02 + r() * 0.05, r() * 3, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    grassStrokes(g, r, -W / 2, W / 2, 0, D, 900, [pal.fieldDark, pal.fieldLight, pal.tuft || pal.fieldDark], 0.012, 0.3);
    // a mown path from the reader's edge to the arch, straddling the gutter
    const pw = ground.path ?? 0.11;
    g.fillStyle = pal.path; g.beginPath(); g.moveTo(-W / 2, 0); g.lineTo(-W / 2, pw * 1.25); g.quadraticCurveTo(-0.3, pw * 1.05, 0.02, pw * 0.85); g.lineTo(0.02, 0); g.closePath(); g.fill();
    // gravel forecourt before the house, hedges either side at the back
    g.fillStyle = pal.stone; g.globalAlpha = 0.85; g.fillRect(0.12, 0, 0.2, 0.55); g.globalAlpha = 1;
    g.fillStyle = pal.hedge; for (const [x0, x1, u0, u1] of [[0.36, 0.72, 0.62, 0.7], [0.36, 0.72, 0.92, 1.0]]) { g.beginPath(); g.roundRect(x0, u0, x1 - x0, u1 - u0, 0.02); g.fill(); }
  },
});
export const baytrailSidePrint = sidePrinter({
  paint(g, { W, D, pal, ground, page }) {
    const r = rng(page === 'near' ? 11 : 12), shoreX = ground.shore ?? 0.02, tr = ground.trail || { x: -0.3, w: 0.12, bend: 0.06 };
    // the bay behind the shore, golden grass in front
    g.fillStyle = pal.ocean; g.fillRect(shoreX, 0, W / 2 - shoreX, D);
    const gr = g.createLinearGradient(shoreX, 0, W / 2, 0); gr.addColorStop(0, 'rgba(127,155,177,0.6)'); gr.addColorStop(1, 'rgba(176,189,200,0.5)');
    g.fillStyle = gr; g.fillRect(shoreX, 0, W / 2 - shoreX, D);
    g.strokeStyle = pal.foam; g.lineCap = 'round';
    for (let i = 0; i < 40; i++) { const x = shoreX + 0.04 + r() * (W / 2 - shoreX - 0.06), u = r() * D, l = 0.03 + r() * 0.06; g.globalAlpha = 0.2 + r() * 0.2; g.lineWidth = 0.003; g.beginPath(); for (let k = 0; k <= 8; k++) { const t = k / 8; g.lineTo(x + 0.004 * Math.sin(t * 6.28), u + t * l); } g.stroke(); }
    g.globalAlpha = 1;
    const shore = (u) => shoreX + 0.02 * Math.sin(u * 5 + (page === 'near' ? 1 : 2));
    g.fillStyle = pal.wetSand || pal.shoulder; g.beginPath(); g.moveTo(-W / 2, 0); for (let u = 0; u <= D + 1e-6; u += 0.02) g.lineTo(shore(u) + 0.02, u); g.lineTo(-W / 2, D); g.closePath(); g.fill();
    g.fillStyle = pal.grass; g.beginPath(); g.moveTo(-W / 2, 0); for (let u = 0; u <= D + 1e-6; u += 0.02) g.lineTo(shore(u) - 0.01, u); g.lineTo(-W / 2, D); g.closePath(); g.fill();
    grassStrokes(g, r, -W / 2, shoreX - 0.02, 0, D, 800, [pal.grassDark, pal.grassLight, pal.tuft], 0.012, 0.3);
    // the trail across both pages, a soft bow toward the water
    const tx = (u) => tr.x + tr.bend * Math.sin((u / D) * Math.PI * 0.5);
    g.fillStyle = pal.shoulder; g.beginPath(); for (let u = 0; u <= D + 1e-6; u += 0.02) g.lineTo(tx(u) + tr.w / 2 + 0.018, u); for (let u = D; u >= -1e-6; u -= 0.02) g.lineTo(tx(u) - tr.w / 2 - 0.018, u); g.closePath(); g.fill();
    g.fillStyle = pal.asphalt; g.beginPath(); for (let u = 0; u <= D + 1e-6; u += 0.02) g.lineTo(tx(u) + tr.w / 2, u); for (let u = D; u >= -1e-6; u -= 0.02) g.lineTo(tx(u) - tr.w / 2, u); g.closePath(); g.fill();
    g.strokeStyle = pal.trailLine; g.lineWidth = 0.003; g.setLineDash([0.02, 0.018]); g.beginPath(); for (let u = 0; u <= D + 1e-6; u += 0.02) g.lineTo(tx(u), u); g.stroke(); g.setLineDash([]);
  },
  water(g, { W, D, ground }) { const sx = ground.shore ?? 0.02; g.fillRect(sx + 0.02, 0, W / 2 - sx, D); },
});

export const declares2 = { vfoldWrap: wrapDeclare, layerFigure: (s) => ({ on: s.on }), layerRider: slitDeclare, layerRoller: slitDeclare, stringLights: stringsDeclare, revolving: revolvingDeclare, batLever: batDeclare, coilGull: coilDeclare };
