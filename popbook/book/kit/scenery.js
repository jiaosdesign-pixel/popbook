// Kit: scenery pieces. Each is a real paper mechanic: parallel walls, V-folds, sliders.
import * as THREE from 'three';
import { card, polyShape, printTexture, paperMaterial, aoStrip, glowSprite } from '../engine/paper.js';
import { vfoldGamma } from '../engine/mech.js';
import { paperBox } from './bridge.js';
import { slotLimit } from '../engine/motion.js';

const rad = Math.PI / 180;

// ---------- wave strips: parallel walls with a wavy top and a printed foam line
export function waves(ctx, s) {
  const pal = ctx.palette, parts = [];
  for (const row of s.rows) {
    const { page = 'near', u, h = 0.05, x0, x1, amp = 0.011, len = 0.26, phase = 0 } = row;
    const top = (x) => h + amp * Math.sin(((x - x0) / len) * Math.PI * 2 + phase) + amp * 0.35 * Math.sin(((x - x0) / len) * Math.PI * 4.3 + phase * 1.7);
    const pts = [[x0, 0]];
    const N = Math.ceil((x1 - x0) / 0.01);
    for (let i = 0; i <= N; i++) {
      const x = x0 + ((x1 - x0) * i) / N;
      const e = Math.min(1, (x - x0) / 0.05, (x1 - x) / 0.05);
      pts.push([x, Math.max(0.006, top(x) * (0.35 + 0.65 * Math.sqrt(Math.max(0, e))))]);
    }
    pts.push([x1, 0]);
    const box = [x0, 0, x1, h + amp * 1.5];
    const col = row.color || pal.wave[(parts.length) % pal.wave.length];
    const tex = printTexture(box, (g) => {
      g.fillStyle = col; g.fillRect(x0, 0, x1 - x0, box[3]);
      g.strokeStyle = pal.foam; g.lineWidth = 0.0032; g.globalAlpha = 0.85;
      g.beginPath();
      pts.slice(1, -1).forEach(([x, y], i) => { const yy = y - 0.007; i ? g.lineTo(x, yy) : g.moveTo(x, yy); });
      g.stroke();
    }, 1200, 2048);
    const wmat = paperMaterial('#fff', { map: tex }); wmat.userData.water = true;
    const m = card(polyShape(pts), { material: wmat, edgeColor: col, depth: 0.0035, uvBox: box, curveSegments: 1 });
    const g = new THREE.Group(); g.add(m);
    parts.push({ obj: g, frame: (sp, mm) => sp.wallFrame(page, 0, u, mm) });
    const ao = aoStrip(x0, x1, 0.035, 0.28);
    const ag = new THREE.Group(); ag.add(ao); ao.position.z = (page === 'near' ? 1 : -1) * u;
    parts.push({ obj: ag, frame: (sp, mm) => sp.pageFrame(page, mm), ao: true });
  }
  return { parts };
}

// ---------- V-fold hill straddling the gutter. theta: hinge angle from +x (deg), elev: crease elevation (deg)
export function vfoldHill(ctx, s) {
  const pal = ctx.palette;
  const theta = (s.theta ?? 38) * rad, elev = (s.elev ?? 50) * rad;
  const gamma = vfoldGamma(theta, elev);
  const parts = [];
  for (const page of ['near', 'far']) {
    const p = s[page] || {};
    const Lh = p.hinge ?? s.hinge ?? 0.4, Lc = s.crease ?? 0.42;
    const C = [Lc * Math.cos(gamma), Lc * Math.sin(gamma)];
    const Hp = [Lh, 0];
    // profile from hinge end to crease top: bulge outward, with soft bumps
    const pts = [[0, 0], Hp];
    const dx = C[0] - Hp[0], dy = C[1] - Hp[1], L = Math.hypot(dx, dy);
    let nx = dy / L, ny = -dx / L; // outward normal (away from O)
    if (nx * (Hp[0] + C[0]) / 2 + ny * (Hp[1] + C[1]) / 2 < 0) { nx = -nx; ny = -ny; }
    const bumps = p.bumps || s.bumps || [[0.3, 0.05], [0.7, 0.03]];
    for (let i = 1; i < 40; i++) {
      const t = i / 40;
      let off = (p.bulge ?? s.bulge ?? 0.06) * Math.sin(Math.PI * t);
      for (const [c, a] of bumps) off += a * Math.exp(-((t - c) ** 2) / 0.006);
      pts.push([Hp[0] + dx * t + nx * off * L, Hp[1] + dy * t + ny * off * L]);
    }
    pts.push(C);
    const col = page === 'near' ? (s.color || pal.hill) : (s.colorFar || s.color || pal.hill);
    const m = card(polyShape(pts), { color: col, depth: 0.004, curveSegments: 1 });
    parts.push({ obj: m, frame: (sp, mm) => mm.copy(sp.vfold(s.x, theta, gamma)[page]) });
  }
  const ag = new THREE.Group();
  for (const page of ['near', 'far']) {
    const a = aoStrip(0, s.hinge ?? 0.4, 0.04, 0.3);
    a.rotation.y = -(page === 'near' ? 1 : -1) * theta;
    a.position.x = s.x;
    const holder = new THREE.Group(); holder.add(a);
    parts.push({ obj: holder, frame: (sp, mm) => sp.pageFrame(page, mm), ao: true });
  }
  return { parts };
}

// ---------- fog bank: vellum parallel walls riding a pull-tab slot (tap: it rolls in through the Gate)
export function fog(ctx, s) {
  const pal = ctx.palette, parts = [];
  const state = { offset: 0, target: 0, t: 0, rolling: 0, pull: 0, want: 0, drag: false, idle: 0, grab: 0 };
  const groups = [];
  const rollDist = s.roll ?? 0.55;
  s.layers.forEach((ly, i) => {
    const { u, h, x0, x1, puff = 0.05 } = ly;
    // a long low bank: soft envelope rising towards the ocean side, overlapping puffs of uneven size
    const hash = (n) => { const v = Math.sin(n * 127.1 + i * 311.7) * 43758.5453; return v - Math.floor(v); };
    const puffs = [];
    for (let k = 0, x = x0 + puff * 0.6; x < x1; k++) { const r = puff * (0.55 + 1.1 * hash(k)); puffs.push([x, r]); x += r * (0.9 + 0.6 * hash(k + 7)); }
    const top = (x) => {
      const t = (x - x0) / (x1 - x0);
      const env = 0.45 + 0.55 * Math.sin(Math.min(1, t * 1.6) * Math.PI / 2);
      let y = h * env * 0.78;
      for (const [cx, r] of puffs) { const d = (x - cx) / r; if (Math.abs(d) < 1) y = Math.max(y, h * env * 0.78 + r * 0.55 * Math.sqrt(1 - d * d)); }
      const fade = Math.min(1, (x - x0) / 0.04, (x1 - x) / 0.04);
      return y * (0.25 + 0.75 * Math.sqrt(Math.max(0, fade)));
    };
    const pts = [[x0, 0]];
    for (let k = 0, N = Math.ceil((x1 - x0) / 0.006); k <= N; k++) { const x = x0 + ((x1 - x0) * k) / N; pts.push([x, top(x)]); }
    pts.push([x1, 0]);
    const sh = polyShape(pts);
    const mat = paperMaterial(ly.color || pal.fog, { translucent: true, opacity: ly.opacity ?? 0.9, noCache: true });
    const m = card(sh, { material: mat, depth: 0.0025, curveSegments: 10, castShadow: true });
    const g = new THREE.Group(); g.add(m); groups.push(g);
    parts.push({ obj: g, frame: (sp, mm) => sp.wallFrame(ly.page || 'far', state.offset * (1 + i * 0.35), u, mm) });
  });
  // easter egg: a plain paper pull-tab sticks out of the far page edge on the ocean side. Pull it and the
  // fog slides in through the Gate by hand; let go and it eases back. Same slot as the tap roll.
  const W2 = (ctx.book?.width ?? 2.1) / 2, tabU = s.tabU ?? 0.44, tabL = 0.1, tabW = 0.042;
  const tabX = W2 + 0.095 - tabL / 2; // centre: about 5 mm proud of the cover edge
  const tabShape = new THREE.Shape();
  tabShape.moveTo(-tabL / 2, -tabW / 2); tabShape.lineTo(tabL / 2 - 0.012, -tabW / 2);
  tabShape.quadraticCurveTo(tabL / 2, -tabW / 2, tabL / 2, -tabW / 2 + 0.012); tabShape.lineTo(tabL / 2, tabW / 2 - 0.012);
  tabShape.quadraticCurveTo(tabL / 2, tabW / 2, tabL / 2 - 0.012, tabW / 2); tabShape.lineTo(-tabL / 2, tabW / 2); tabShape.closePath();
  const tab = card(tabShape, { color: s.tabColor || pal.core || '#F4F1E8', depth: 0.0022, curveSegments: 4 });
  tab.geometry.rotateX(-Math.PI / 2);
  const tabProxy = new THREE.Mesh(new THREE.BoxGeometry(tabL + 0.04, 0.03, tabW + 0.04), new THREE.MeshBasicMaterial({ visible: false }));
  tabProxy.userData.hitProxy = true;
  const tabSlide = new THREE.Group(); tabSlide.add(tab, tabProxy);
  tabSlide.position.set(tabX, 0.0016, -tabU);
  const tabHolder = new THREE.Group(); tabHolder.add(tabSlide);
  parts.push({ obj: tabHolder, noFit: true, frame: (sp, mm) => sp.pageFrame('far', mm) });
  const lo = -rollDist, hi = 0;
  return {
    parts,
    drag: {
      targets: [tab, tabProxy], obj: tabHolder, axis: 1,
      begin(x) { state.drag = true; state.rolling = 0; state.pull = state.offset; state.grab = x - (tabX + state.offset); state.want = state.pull; },
      move(x) { state.want = slotLimit(x - state.grab - tabX, lo, hi, 0.012, 0.03); },
      end() { state.drag = false; state.pull = state.offset - state.idle; },
      get active() { return state.drag; },
    },
    tick(t, dt, loops = true) {
      // idle: a slow breath in through the Gate and back out (about 30 s); tap: roll in and back
      const idle = loops ? -(s.breath ?? 0.035) * (1 - Math.cos(t * 0.21)) : 0;
      state.idle = idle;
      if (state.drag) state.pull += (state.want - state.pull) * Math.min(1, dt * 10);
      else if (state.pull) { state.pull *= Math.exp(-dt / 1.3); if (Math.abs(state.pull) < 1e-4) state.pull = 0; }
      let roll = 0;
      if (state.rolling) {
        state.t += dt;
        const T = 7.0, p = Math.min(1, state.t / T);
        roll = -rollDist * Math.sin(Math.PI * p) ** 1.5;
        if (p >= 1) state.rolling = 0;
      }
      const o = state.pinned ?? (state.drag ? state.pull : idle + roll + state.pull);
      const moved = Math.abs(o - state.offset) > 1e-5;
      state.offset = o;
      tabSlide.position.x = tabX + o;
      return !moved ? false : (state.rolling || state.drag || Math.abs(state.pull) > 0.004) ? 'fast' : 'slow';
    },
    actions: {
      roll() { if (!state.rolling) { state.rolling = 1; state.t = 0; } },
      pin(v) { state.pinned = v == null ? undefined : -rollDist * v; state.offset = state.pinned ?? 0; tabSlide.position.x = tabX + state.offset; }, // screenshots
    },
    setLight(L) {
      for (const g of groups) g.traverse((m) => { if (m.isMesh) {
        const mat = Array.isArray(m.material) ? m.material[0] : m.material;
        mat.emissive.copy(L.keyColor).lerp(new THREE.Color('#ffffff'), 0.4);
        mat.emissiveIntensity = 0.06 + 0.16 * L.day + 0.25 * L.golden + 0.06 * L.night;
      } });
    },
  };
}

// ---------- skyline: two parallel walls (far blocks in Mist, near blocks lighter); windows only show when lit
export function skyline(ctx, s) {
  const pal = ctx.palette, parts = [];
  const layers = s.layers || [
    { du: -0.05, color: pal.skyline, blocks: [[0.045, 0.15], [0.03, 0.27, 'pyramid'], [0.05, 0.2], [0.04, 0.24], [0.05, 0.13]] },
    { du: 0, color: pal.skylineNear || '#DAD6CB', blocks: [[0.06, 0.08], [0.05, 0.12], [0.06, 0.07], [0.05, 0.1]] },
  ];
  layers.forEach((ly, li) => {
    const { page = s.page || 'near' } = s;
    const u = s.u + (ly.du || 0), x0 = s.x0 + (ly.dx || 0);
    const pts = [[x0, 0]];
    let x = x0;
    const rects = [];
    for (const [w, h, kind] of ly.blocks) {
      if (kind === 'stepped') { pts.push([x, h * 0.72], [x + w * 0.18, h * 0.72], [x + w * 0.18, h * 0.88], [x + w * 0.32, h * 0.88], [x + w * 0.32, h], [x + w * 0.68, h], [x + w * 0.68, h * 0.88], [x + w * 0.82, h * 0.88], [x + w * 0.82, h * 0.72], [x + w, h * 0.72]); rects.push([x, h * 0.72, w]); }
      else if (kind === 'pyramid') { pts.push([x, 0.06], [x + w * 0.2, 0.06], [x + w / 2 - 0.002, h - 0.02], [x + w / 2, h], [x + w / 2 + 0.002, h - 0.02], [x + w * 0.8, 0.06], [x + w, 0.06]); }
      else { pts.push([x, h], [x + w, h]); rects.push([x, h, w]); }
      x += w;
    }
    pts.push([x, 0]);
    const H = Math.max(...ly.blocks.map((b) => b[1]));
    const box = [x0, 0, x, H];
    const wins = (g, lit) => {
      for (const [rx, rh, rw] of rects) for (let yy = 0.022; yy < rh - 0.015; yy += 0.022) for (let xx = rx + 0.01; xx < rx + rw - 0.01; xx += 0.014) {
        if (lit && Math.sin(xx * 917 + yy * 311 + li) < 0.15) continue;
        g.fillRect(xx, yy, 0.006, 0.009);
      }
    };
    const tex = printTexture(box, (g) => {
      g.fillStyle = ly.color; g.fillRect(x0, 0, x - x0, H);
      let xx = x0; ly.blocks.forEach(([w], i) => { if (i % 2 && ly.blocks.length > 1) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(xx, 0, w, H); } xx += w; });
    }, 1400, 1024);
    const em = printTexture(box, (g) => { g.fillStyle = '#000'; g.fillRect(x0, 0, x - x0, H); g.fillStyle = '#ffd9a0'; wins(g, true); }, 1400, 1024);
    const mat = paperMaterial('#fff', { map: tex, emissiveMap: em, emissive: '#ffc98a' });
    ctx.lamp((k) => { mat.emissiveIntensity = 1.4 * k; });
    const m = card(polyShape(pts), { material: mat, edgeColor: ly.color, depth: 0.004, uvBox: box, curveSegments: 1 });
    const g = new THREE.Group(); g.add(m);
    parts.push({ obj: g, frame: (sp, mm) => sp.wallFrame(page, 0, u, mm) });
    const ao = aoStrip(x0, x, 0.03, 0.3); const ag = new THREE.Group(); ag.add(ao); ao.position.z = (page === 'near' ? 1 : -1) * u;
    parts.push({ obj: ag, frame: (sp, mm) => sp.pageFrame(page, mm), ao: true });
  });
  return { parts };
}

// ---------- sailboat: folded-box hull + sail card standing in a slot cut through the page.
// Idle: a slow drift along the slot. Drag: the reader pulls it along the slot like a pull-tab,
// with a little paper resistance, a soft stop at the slot ends and a settle when let go.
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function sailboat(ctx, s) {
  const pal = ctx.palette;
  const page = s.page || 'near';
  const g = new THREE.Group();
  const hull = new THREE.Shape();
  hull.moveTo(-0.05, 0.022); hull.lineTo(0.06, 0.022); hull.quadraticCurveTo(0.045, 0.0, 0.03, 0.0); hull.lineTo(-0.04, 0.0); hull.quadraticCurveTo(-0.05, 0.004, -0.05, 0.022);
  const hm = card(hull, { color: pal.hull, depth: 0.026, bevel: 0.002, curveSegments: 6 }); g.add(hm);
  const stripe = card(polyShape([[-0.05, 0.016], [0.058, 0.016], [0.056, 0.012], [-0.05, 0.012]]), { color: pal.bridge, depth: 0.0275, bevel: 0.0003 });
  g.add(stripe);
  const sail = card(polyShape([[-0.004, 0.026], [0.042, 0.03], [-0.004, 0.15]]), { color: pal.sail, depth: 0.0025 }); g.add(sail);
  const jib = card(polyShape([[0.0, 0.03], [0.006, 0.12], [-0.045, 0.03]]), { color: pal.sail2 || pal.sail, depth: 0.0025 }); jib.position.z = 0.003; g.add(jib);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0014, 0.13, 5), paperMaterial(pal.mast || '#7b6a58'));
  mast.position.set(-0.004, 0.09, 0.001); g.add(mast);
  g.scale.setScalar(s.scale ?? 1);
  const holder = new THREE.Group(); holder.add(g);
  const ao = aoStrip(-0.06, 0.07, 0.04, 0.35); g.add(ao);

  // the slot: a thin cut in the page along the boat's travel
  const slot = s.slot || [s.x - 0.3, s.x + 0.3];
  const lo = slot[0] - s.x, hi = slot[1] - s.x;
  const cutGeo = new THREE.PlaneGeometry(slot[1] - slot[0] + 0.12 * (s.scale ?? 1), 0.0032);
  cutGeo.rotateX(-Math.PI / 2);
  const cut = new THREE.Mesh(cutGeo, new THREE.MeshBasicMaterial({ color: pal.slot || '#1d2a36', transparent: true, opacity: 0.32, depthWrite: false }));
  cut.position.set((slot[0] + slot[1]) / 2, 0.0009, (page === 'near' ? 1 : -1) * s.u);
  cut.userData.aoBase = 0.32; cut.renderOrder = 1;
  const cutHolder = new THREE.Group(); cutHolder.add(cut);

  const st = { x: 0, v: 0, drag: false, want: 0, grab: 0, home: 0, released: -1e9, t: 0 };
  const targets = [];
  g.traverse((m) => { if (m.isMesh && m !== ao) targets.push(m); });
  return {
    parts: [
      { obj: holder, frame: (sp, mm) => sp.wallFrame(page, s.x + st.x, s.u, mm) },
      { obj: cutHolder, frame: (sp, mm) => sp.pageFrame(page, mm), ao: true },
    ],
    // idle = loops allowed (false under prefers-reduced-motion: no drift, the boat goes where it is put)
    tick(t, dt, idle = true) {
      st.t = t;
      let target;
      if (st.drag) target = st.want;
      else target = st.home + (idle ? 0.03 * sstep(2.5, 6, t - st.released) * Math.sin(t * 0.18) : 0);
      if (!idle) { st.x = target; st.v = 0; }
      else {
        const k = st.drag ? 260 : 110, c = 2 * Math.sqrt(k) * (st.drag ? 0.95 : 0.6);
        for (let i = 0, n = 3, h = dt / n; i < n; i++) { st.v += (k * (target - st.x) - c * st.v) * h; st.x += st.v * h; }
      }
      // the sail leans against the motion; a slow rock when it is left alone
      g.rotation.z = (idle ? 0.035 * Math.sin(t * 0.9) : 0) + Math.max(-0.14, Math.min(0.14, -st.v * 0.6));
      g.position.y = idle ? 0.002 * Math.sin(t * 0.9 + 1) : 0;
      return st.drag || Math.abs(st.v) > 0.02 ? 'fast' : 'slow';
    },
    drag: {
      targets, obj: holder, axis: 2,
      begin(x) { st.drag = true; st.grab = (x - s.x) - st.x; st.want = st.x; },
      move(x) {
        let raw = x - s.x - st.grab;
        // paper resistance: past the slot ends it gives a little, then stops
        if (raw > hi) raw = hi + 0.016 * (1 - Math.exp(-(raw - hi) / 0.04));
        if (raw < lo) raw = lo - 0.016 * (1 - Math.exp(-(lo - raw) / 0.04));
        st.want = raw;
      },
      end() { st.drag = false; st.released = st.t; st.home = Math.max(lo + 0.03, Math.min(hi - 0.03, st.x)); },
      get active() { return st.drag; },
      get x() { return s.x + st.x; },
    },
  };
}

// ---------- moon on a slider strip: hidden behind the fog by day, rises out of it at dusk
export function moon(ctx, s) {
  const pal = ctx.palette;
  const g = new THREE.Group();
  const r = s.radius ?? 0.05;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.004, 1, 0.0015), paperMaterial(pal.fog));
  g.add(strip);
  const disc = new THREE.Group(); g.add(disc);
  const circ = new THREE.Shape(); circ.absarc(0, 0, r, 0, Math.PI * 2, false);
  const moonTex = printTexture([-r, -r, r, r], (gx) => {
    gx.fillStyle = pal.moon; gx.fillRect(-r, -r, 2 * r, 2 * r);
    const ph = ctx.moonPhase ?? 0.5; // 0 new, .5 full
    const lit = 1 - Math.abs(ph - 0.5) * 2;
    const k = lit * 2 - 1, waxing = ph < 0.5;
    gx.fillStyle = pal.moonShadow;
    gx.beginPath();
    gx.ellipse(0, 0, r, r, 0, Math.PI / 2, Math.PI * 1.5, !waxing);
    gx.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI * 1.5, Math.PI / 2, (k > 0) === waxing);
    gx.fill();
    gx.fillStyle = 'rgba(0,0,0,0.05)';
    for (const [cx, cy, cr] of [[-0.3, 0.2, 0.18], [0.25, -0.15, 0.12], [0.1, 0.35, 0.08]]) { gx.beginPath(); gx.arc(cx * r, cy * r, cr * r, 0, 7); gx.fill(); }
  }, 2000, 256);
  const mat = paperMaterial('#fff', { map: moonTex, emissiveMap: moonTex, emissive: '#ffffff', noCache: true });
  const face = card(circ, { material: mat, edgeColor: pal.moon, depth: 0.003 });
  disc.add(face);
  const halo = glowSprite(pal.moonGlow || '#cfd8ff', r * 5); halo.position.z = -0.01; disc.add(halo);
  // normal (not additive) blending: the halo leaves the book's silhouette, and additive light on a
  // transparent canvas turns into a white ring on a light page
  halo.material.blending = THREE.NormalBlending;
  return {
    parts: [{ obj: g, noFit: true, frame: (sp, mm) => sp.wallFrame(s.page || 'far', s.x, s.u, mm) }],
    setLight(L) {
      const up = Math.max(0, Math.min(1, L.lamps * 1.15));
      const y = (s.hiddenH ?? 0.06) + ((s.nightH ?? 0.36) - (s.hiddenH ?? 0.06)) * up;
      disc.position.y = y;
      disc.visible = strip.visible = up > 0.02;
      strip.scale.y = y; strip.position.y = y / 2;
      halo.material.opacity = 0.32 * up;
      mat.emissiveIntensity = 0.55 + 0.25 * up;
    },
  };
}

// ---------- layered hills: parallel walls with soft organic silhouettes
export function hills(ctx, s) {
  const pal = ctx.palette, parts = [];
  s.layers.forEach((ly, i) => {
    const { page = 'far', u, x0, x1, h, peak = 0.5, seed = i + 1 } = ly;
    const hash = (n) => { const v = Math.sin(n * 91.7 + seed * 47.3) * 43758.5453; return v - Math.floor(v); };
    const pts = [[x0, 0]];
    const N = Math.ceil((x1 - x0) / 0.006);
    for (let k = 0; k <= N; k++) {
      const t = k / N, x = x0 + (x1 - x0) * t;
      // asymmetric hump with a couple of soft shoulders
      const d = t < peak ? t / peak : (1 - t) / (1 - peak);
      let y = h * Math.pow(Math.sin((Math.PI / 2) * d), ly.sharp ?? 1.4);
      y += h * 0.05 * Math.sin(t * 9 + seed) + h * 0.03 * Math.sin(t * 23 + seed * 2);
      y *= Math.min(1, Math.sqrt(Math.max(0, Math.min(t, 1 - t)) / 0.03));
      pts.push([x, Math.max(0.004, y)]);
    }
    pts.push([x1, 0]);
    const col = ly.color || pal.hill;
    const m = card(polyShape(pts), { color: col, depth: 0.004, curveSegments: 1 });
    const g = new THREE.Group(); g.add(m);
    parts.push({ obj: g, frame: (sp, mm) => sp.wallFrame(page, 0, u, mm) });
    const ao = aoStrip(x0, x1, 0.035, 0.3); const ag = new THREE.Group(); ag.add(ao); ao.position.z = (page === 'near' ? 1 : -1) * u;
    parts.push({ obj: ag, frame: (sp, mm) => sp.pageFrame(page, mm), ao: true });
  });
  return { parts };
}
