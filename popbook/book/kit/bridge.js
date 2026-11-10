// Kit: suspension bridge (Golden Gate). A floating layer / box across the gutter:
// front + back elevation cards are the walls, the deck is the platform creased over the gutter,
// tower caps and portal struts are extra platforms. Cables and suspenders are thread.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { card, polyShape, roundRect, printTexture, paperMaterial, glowSprite, aoStrip, finishUVs } from '../engine/paper.js';
import { Thread } from '../engine/mech.js';

export function paperBox(w, h, d, color, r = 0.002) {
  const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3));
  const pos = g.attributes.position, uv1 = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv1[i * 2] = (pos.getX(i) + pos.getZ(i)) * 2.2; uv1[i * 2 + 1] = (pos.getY(i) + pos.getZ(i)) * 2.2; }
  g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  const m = new THREE.Mesh(g, paperMaterial(color));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function build(ctx, s) {
  const pal = ctx.palette;
  const T = s.towerX ?? 0.46, H = s.towerH ?? 0.66, h = s.deckH ?? 0.2, a = s.halfDepth ?? 0.065;
  const L0 = s.from ?? -0.82, L1 = s.to ?? 0.74;
  const td = 0.03, rail = 0.011, ph = 0.03, pw = 0.048, pil = 0.03;
  const widths = [0.046, 0.04, 0.035, 0.031];
  const top = h + rail;
  const lv = [top, top + (H - top) * 0.3, top + (H - top) * 0.55, top + (H - top) * 0.78, H];
  const coral = pal.bridge, coralDark = pal.bridgeDark;

  // ---- elevation card outline
  const pts = [];
  const P = (x, y) => pts.push([x, y]);
  P(L0, 0); P(L0 + pil, 0); P(L0 + pil, h - td);
  for (const c of [-T, T]) {
    const wb = widths[0] / 2;
    P(c - wb, h - td); P(c - wb, ph); P(c - pw, ph); P(c - pw, 0); P(c + pw, 0); P(c + pw, ph); P(c + wb, ph); P(c + wb, h - td);
  }
  P(L1 - pil, h - td); P(L1 - pil, 0); P(L1, 0); P(L1, top);
  for (const c of [T, -T]) {
    P(c + widths[0] / 2, top);
    for (let k = 0; k < 4; k++) { P(c + widths[k] / 2, lv[k + 1]); if (k < 3) P(c + widths[k + 1] / 2, lv[k + 1]); }
    // stepped crown
    P(c + widths[3] / 2 - 0.004, H); P(c + widths[3] / 2 - 0.004, H + 0.008); P(c - widths[3] / 2 + 0.004, H + 0.008); P(c - widths[3] / 2 + 0.004, H);
    for (let k = 3; k >= 0; k--) { P(c - widths[k] / 2, lv[k + 1]); P(c - widths[k] / 2, lv[k]); }
  }
  P(L0, top);
  const box = [L0, 0, L1, H + 0.01];

  const face = printTexture(box, (g) => {
    g.fillStyle = coral; g.fillRect(L0, 0, L1 - L0, H + 0.01);
    // truss lattice
    g.strokeStyle = coralDark; g.lineWidth = 0.0024;
    g.beginPath(); g.moveTo(L0, h - td + 0.004); g.lineTo(L1, h - td + 0.004); g.moveTo(L0, h - 0.002); g.lineTo(L1, h - 0.002); g.stroke();
    g.lineWidth = 0.0016;
    g.beginPath();
    for (let x = L0; x < L1; x += 0.022) { g.moveTo(x, h - td + 0.004); g.lineTo(x + 0.011, h - 0.002); g.lineTo(x + 0.022, h - td + 0.004); }
    g.stroke();
    // railing posts
    g.lineWidth = 0.001; g.beginPath();
    for (let x = L0; x < L1; x += 0.006) { g.moveTo(x, h + 0.001); g.lineTo(x, top - 0.002); }
    g.stroke();
    // tower panels: recessed vertical lines and setback shadows
    for (const c of [-T, T]) {
      for (let k = 0; k < 4; k++) {
        const w = widths[k] / 2 - 0.007;
        g.fillStyle = coralDark; g.globalAlpha = 0.35;
        g.fillRect(c - w, lv[k] + 0.012, w * 2, lv[k + 1] - lv[k] - 0.02);
        g.globalAlpha = 1;
      }
      // concrete pier
      g.fillStyle = pal.pier; g.fillRect(c - pw, 0, pw * 2, ph);
    }
    g.fillStyle = pal.pier; g.fillRect(L0, 0, pil, h - td); g.fillRect(L1 - pil, 0, pil, h - td);
  }, 1400, 2048);

  // night flood: brighter at the tower base
  const glow = printTexture(box, (g) => {
    g.fillStyle = '#000'; g.fillRect(L0, 0, L1 - L0, H + 0.01);
    for (const c of [-T, T]) {
      const gr = g.createLinearGradient(0, ph, 0, H);
      gr.addColorStop(0, 'rgba(255,190,140,1)'); gr.addColorStop(1, 'rgba(255,150,100,0.35)');
      g.fillStyle = gr; g.fillRect(c - 0.03, ph, 0.06, H - ph + 0.01);
    }
    g.fillStyle = 'rgba(255,170,120,0.35)'; g.fillRect(L0, h - td, L1 - L0, td + rail);
  }, 300, 512);

  const wallMat = paperMaterial('#fff', { map: face, emissiveMap: glow, emissive: '#e8a27a' });
  ctx.lamp((k) => { wallMat.emissiveIntensity = 0.3 * k; });
  const threadMat = new THREE.MeshStandardMaterial({ color: pal.cable, roughness: 0.65 });
  const lineMat = new THREE.LineBasicMaterial({ color: pal.cable, transparent: true, opacity: 0.85 });

  const cableY = (x) => { const yMid = top + 0.018, yT = H - 0.004; return yMid + (yT - yMid) * (x / T) ** 2; };
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: '#5b544c', emissive: new THREE.Color(pal.lamp), emissiveIntensity: 0, roughness: 0.6 });
  const redMat = new THREE.MeshStandardMaterial({ color: '#7a3a30', emissive: new THREE.Color('#ff3b2a'), emissiveIntensity: 0, roughness: 0.6 });
  ctx.lamp((k) => { lampHeadMat.emissiveIntensity = 2.2 * k; redMat.emissiveIntensity = 3 * k; });

  const targets = [];
  function wall(page) {
    const g = new THREE.Group();
    const m = card(polyShape(pts), { material: wallMat, edgeColor: coral, depth: 0.005, uvBox: box, curveSegments: 2 });
    g.add(m); targets.push(m);
    // main span cable (taut, in the wall plane) + suspenders
    const cpts = []; for (let i = 0; i <= 40; i++) { const x = -T + (2 * T * i) / 40; cpts.push(new THREE.Vector3(x, cableY(x), 0.0035)); }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cpts), 60, 0.0028, 5, false), threadMat);
    tube.castShadow = true; g.add(tube);
    const sp = [];
    for (let x = -T + 0.03; x < T - 0.02; x += 0.028) { sp.push(x, cableY(x), 0.0035, x, top, 0.0035); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    g.add(new THREE.LineSegments(sg, lineMat));
    // lamp posts along the rail
    for (let x = L0 + 0.08; x < L1 - 0.03; x += 0.16) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.02, 4), threadMat);
      post.position.set(x, top + 0.01, -0.001); g.add(post);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), lampHeadMat);
      head.position.set(x, top + 0.021, -0.001); g.add(head);
      const gs = glowSprite(pal.lamp, 0.045); gs.position.copy(head.position); g.add(gs);
      ctx.lamp((k) => { gs.material.opacity = 0.85 * k; });
    }
    for (const c of [-T, T]) {
      const r = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), redMat);
      r.position.set(c, H + 0.013, 0); g.add(r);
      const gs = glowSprite('#ff4a3a', 0.03); gs.position.copy(r.position); g.add(gs);
      ctx.lamp((k) => { gs.material.opacity = 0.6 * k; });
    }
    return g;
  }
  const front = wall('near'), back = wall('far');
  const parts = [
    { obj: front, frame: (sp, m) => sp.wallFrame('near', 0, a, m) },
    { obj: back, frame: (sp, m) => sp.wallFrame('far', 0, a, m) },
  ];

  // ---- deck platform halves
  const deckTex = (page) => {
    const bx = page === 'near' ? [L0, -a, L1, 0] : [L0, 0, L1, a];
    return printTexture(bx, (g) => {
      g.fillStyle = pal.road; g.fillRect(L0, -a, L1 - L0, 2 * a);
      const wk = 0.012;
      g.fillStyle = pal.walk;
      g.fillRect(L0, page === 'near' ? -a : a - wk, L1 - L0, wk);
      g.strokeStyle = pal.roadLine; g.lineWidth = 0.002; g.setLineDash([0.02, 0.018]);
      for (const f of [0.38, 0.72]) { const y = (page === 'near' ? -1 : 1) * a * f; g.beginPath(); g.moveTo(L0, y); g.lineTo(L1, y); g.stroke(); }
      g.setLineDash([]);
    }, 900, 2048);
  };
  for (const page of ['near', 'far']) {
    const bx = page === 'near' ? [L0, -a, L1, 0] : [L0, 0, L1, a];
    const mesh = card(roundRect(bx[0], bx[1], bx[2], bx[3], 0.001), { material: paperMaterial('#fff', { map: deckTex(page) }), edgeColor: coral, depth: 0.007, uvBox: bx, curveSegments: 1 });
    mesh.geometry.rotateX(-Math.PI / 2);
    mesh.geometry.translate(0, -0.0035, 0);
    const g = new THREE.Group(); g.add(mesh); targets.push(mesh);
    // cars live in their own kit piece ('deck-traffic'): folded boxes on a belt inside this deck
    parts.push({ obj: g, frame: (sp, m) => sp.layerFrame(page, h, m) });
  }

  // ---- tower caps and portal struts (platforms at their own heights)
  const strutYs = [lv[1] + 0.004, lv[2] + 0.004, lv[3] + 0.004, H + 0.0105];
  for (const c of [-T, T]) {
    strutYs.forEach((y, i) => {
      const w = (i === 3 ? widths[3] - 0.006 : widths[Math.min(i + 1, 3)]) * 0.9;
      for (const page of ['near', 'far']) {
        const bx = page === 'near' ? [c - w / 2, -a, c + w / 2, 0] : [c - w / 2, 0, c + w / 2, a];
        const m = card(roundRect(bx[0], bx[1], bx[2], bx[3], 0.0005), { color: i === 3 ? coral : coralDark, depth: 0.006, curveSegments: 1 });
        m.geometry.rotateX(-Math.PI / 2);
        m.geometry.translate(0, -0.003, 0);
        parts.push({ obj: m, frame: (sp, mm) => sp.layerFrame(page, y, mm) });
      }
    });
  }

  // ---- anchorages + side-span threads (slack when closed, pulled straight as the towers rise)
  const anchorU = a + (s.anchorOffset ?? 0.05);
  const anchors = [];
  for (const page of ['near', 'far']) for (const [tx, ax] of [[-T, L0 + 0.02], [T, L1 - 0.02]]) {
    const blk = paperBox(0.05, 0.03, 0.04, pal.pier, 0.003);
    const g = new THREE.Group(); blk.position.set(ax, 0.015, (page === 'near' ? 1 : -1) * anchorU); g.add(blk);
    parts.push({ obj: g, frame: (sp, m) => sp.pageFrame(page, m) });
    const th = new Thread(0.0026, threadMat, 28);
    anchors.push({ page, tx, ax, th });
    ctx.scene.add(th.mesh);
  }
  const sideLines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat);
  sideLines.matrixAutoUpdate = false;
  ctx.scene.add(sideLines);

  const tmp = new THREE.Matrix4();
  function dynamic(sp) {
    const seg = [];
    for (const an of anchors) {
      const wm = sp.wallFrame(an.page, 0, a, tmp);
      const topP = new THREE.Vector3(an.tx, H - 0.004, 0.0035).applyMatrix4(wm);
      const anc = sp.point(an.page, an.ax, anchorU).add(sp.page === 'x' ? 0 : (an.page === 'near' ? sp.dN : sp.nF).clone().multiplyScalar(0)).add(
        (an.page === 'near' ? new THREE.Vector3(0, 1, 0) : sp.nF.clone()).multiplyScalar(0.03));
      an.th.update(topP, anc, 0.012);
      // side-span suspenders: from the thread down to the deck edge
      const pos = an.th.mesh.geometry.parameters?.path;
      if (pos) {
        const n = 7;
        for (let i = 1; i < n; i++) {
          const t = i / n;
          const p = pos.getPoint(t);
          // deck edge under it (wall-local x of p)
          const xl = p.x;
          const lo = (an.tx < 0 ? xl > L0 + pil && xl < an.tx - 0.03 : xl < L1 - pil && xl > an.tx + 0.03);
          if (!lo) continue;
          const d = new THREE.Vector3(xl, top, 0.0035).applyMatrix4(wm);
          if (p.distanceTo(d) > 0.004) seg.push(p.x, p.y, p.z, d.x, d.y, d.z);
        }
      }
    }
    sideLines.geometry.dispose();
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    sideLines.geometry = g;
  }

  // contact AO under the wall feet (on the pages) and under the deck
  for (const page of ['near', 'far']) {
    const g = new THREE.Group();
    for (const c of [-T, T]) { const st = aoStrip(c - 0.07, c + 0.07, 0.05, 0.5); st.position.z = (page === 'near' ? 1 : -1) * a; g.add(st); }
    const st = aoStrip(L0 - 0.02, L1 + 0.02, 0.16, 0.18); st.position.z = (page === 'near' ? 1 : -1) * a * 0.5; g.add(st);
    parts.push({ obj: g, frame: (sp, m) => sp.pageFrame(page, m), ao: true });
  }

  return {
    parts, dynamic, targets,
    // where a walker stands: on the near walkway of the deck
    mount: { deckH: h, halfDepth: a, walkS: a - 0.006, deckFrom: L0 + pil, deckTo: L1 - pil, truss: td },
  };
}
