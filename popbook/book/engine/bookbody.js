// The book itself: a top-bound board book. Near half (static) holds the thick page block,
// far half (thin) swings up and over the gutter. Cream hard cover, rounded corners,
// board pages with thin printed colour stripes on their edges, a spine that bends.
import * as THREE from 'three';
import { paperMaterial, edgeMaterial, roundRect, finishUVs } from './paper.js';
import { mergeStatic } from '../kit/filoli.js';

// A flat slab on a page. u0..u1 = distance from gutter. Built "as open".
function slab(page, x0, x1, u0, u1, yBottom, thick, r, corners, faceMat, sideMat, bevel = 0.0016, holes = []) {
  // shape coords: x, y=-z  (near: z=u -> y=-u ; far: z=-u -> y=u)
  const y0 = page === 'near' ? -u1 : u0, y1 = page === 'near' ? -u0 : u1;
  const shape = roundRect(x0, y0, x1, y1, r, corners);
  for (const h of holes) shape.holes.push(h);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(thick - 2 * bevel, 0.0002), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 10 });
  geo.translate(0, 0, bevel);
  finishUVs(geo, [x0, y0, x1, y1]);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, yBottom, 0);
  const m = new THREE.Mesh(geo, [faceMat, sideMat]);
  m.castShadow = false; m.receiveShadow = true; // the book body never needs to shadow itself; the table shadow is separate
  return m;
}

// a board's edge: core paper with a printed colour stripe along its top and a faint gap line at its foot,
// mapped across the thickness (ExtrudeGeometry side walls carry v = 1 - z, z = 0..thick)
const edgeMats = new Map();
function edgeStripeMaterial(core, stripe, thick) {
  const key = core + stripe + thick;
  if (edgeMats.has(key)) return edgeMats.get(key);
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = core; g.fillRect(0, 0, 4, 128);
  g.fillStyle = stripe; g.fillRect(0, 0, 4, 26); // top of the board (canvas top = v 1)
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, 120, 4, 8); // where it sits on the board below
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8;
  t.repeat.set(1, -1 / thick); t.offset.set(0, 1 / thick);
  const m = paperMaterial('#ffffff', { map: t, noCache: true, tooth: 0.12 }); // a lighter tooth on the cut edges
  edgeMats.set(key, m);
  return m;
}
// break a title into two balanced lines for the cover
function splitTitle(t) {
  const w = t.split(' ');
  if (w.length < 3) return [t];
  let best = 1, bd = 1e9;
  for (let i = 1; i < w.length; i++) { const d = Math.abs(w.slice(0, i).join(' ').length - w.slice(i).join(' ').length); if (d < bd) { bd = d; best = i; } }
  return [w.slice(0, best).join(' '), w.slice(best).join(' ')];
}
export function buildBook(spec, prints) {
  const W = spec.width, D = spec.depth;
  const m = spec.coverMargin ?? 0.045, ct = spec.coverThickness ?? 0.024;
  const board = spec.board ?? 0.0105, GAP = 0.0004;
  const nNear = spec.nearPages ?? 6, nFar = spec.farPages ?? 2;
  const Tn = nNear * board, Tf = nFar * board;
  const near = new THREE.Group(), far = new THREE.Group();
  far.matrixAutoUpdate = false;
  const coverMat = paperMaterial(spec.cover || '#e7dfcb', { roughness: 0.82, bump: 0.12, tooth: 0.16, grain: 0.04, noCache: true }); // smooth fine stock: a fine tooth, no patches
  const coverEdge = paperMaterial(new THREE.Color(spec.cover || '#e7dfcb').multiplyScalar(0.93).getStyle(), { roughness: 0.85 });
  const coreMat = paperMaterial(spec.core || '#efe9db');
  const stripes = spec.stripes || ['#8fb3b9', '#a9b56a', '#d9a441', '#c8664a', '#e9e2d0', '#7fa1b5'];
  const R = 0.07;

  // the front cover's die-cut arch window (side-bound book): reading upright on the shut book, its top toward
  // the back edge (+x). In the far half's shape coords (x, u). Through it: a glimpse of the moment, printed on
  // the first board behind the cover (set by the engine from a still of the open spread).
  const side = spec.binding === 'side', across = D + m - GAP, along = W + 2 * m, uMid = (D + m + GAP) / 2;
  let win = null;
  if (side && spec.title && spec.window !== false) {
    const aw = spec.windowW ?? 0.48, ah = spec.windowH ?? 0.7, top = W / 2 + m - (spec.windowTop ?? 0.47);
    const r = aw / 2, xc = top - r, xb = top - ah;
    const path = new THREE.Path();
    path.moveTo(xb, uMid - r); path.lineTo(xc, uMid - r); path.absarc(xc, uMid, r, -Math.PI / 2, Math.PI / 2, false); path.lineTo(xb, uMid + r); path.lineTo(xb, uMid - r);
    win = { path, aw, ah, top, xb, xc, r, xMid: (top + xb) / 2 };
  }
  const halves = [['near', near, Tn, nNear], ['far', far, Tf, nFar]];
  const topSkin = {};
  for (const [page, grp, T, n] of halves) {
    const rc = page === 'near' ? [1, 1, 0, 0] : [0, 0, 1, 1];
    // cover
    // (the two halves stop a hair short of the gutter line, so their gutter faces never coincide)
    const holes = page === 'far' && win ? [win.path] : [];
    grp.add(slab(page, -W / 2 - m, W / 2 + m, GAP, D + m, -T - ct, ct, R + 0.02, rc, coverMat, coverEdge, 0.004, holes));
    // boards: one solid slab each (no coplanar layers, no sub-pixel skin slabs). The printed colour stripe on
    // each board's edge is a mipmapped texture across the board's thickness, so it stays smooth while the
    // camera floats instead of crawling (it used to be a 1.6 mm slab: thinner than a pixel at hero size).
    for (let i = 0; i < n; i++) {
      const yb = -T + i * board;
      const top = i === n - 1;
      const col = stripes[(i + (page === 'far' ? 3 : 0)) % stripes.length];
      const face = top ? paperMaterial('#ffffff', { map: prints[page], emissiveMap: prints[page + 'Water'], emissive: '#ffb27a' }) : coreMat;
      if (top) face.userData.water = true;
      const side = edgeStripeMaterial(spec.core || '#efe9db', top ? (spec.edgeTop?.[page] || col) : col, board);
      const mesh = slab(page, -W / 2, W / 2, GAP, D, yb, board, R, rc, face, side, 0);
      grp.add(mesh);
      if (top) topSkin[page] = mesh;
    }
  }

  // the page block sits on the cover: a soft contact darkening on the cover rim around it
  for (const [page, grp, T] of [['near', near, Tn], ['far', far, Tf]]) {
    const ox = W / 2 + m, ou = D + m, PX = 1400 / (2 * ox);
    const c = document.createElement('canvas'); c.width = Math.round(2 * ox * PX); c.height = Math.round(ou * PX);
    const g = c.getContext('2d');
    // canvas: x right, y = distance from the gutter (u)
    const rect = () => { g.beginPath(); g.roundRect((ox - W / 2) * PX, -R * PX, W * PX, (D + R) * PX, R * PX); };
    g.filter = `blur(${0.014 * PX}px)`; g.fillStyle = 'rgba(0,0,0,0.42)'; rect(); g.fill();
    g.filter = `blur(${0.004 * PX}px)`; g.fillStyle = 'rgba(0,0,0,0.35)'; rect(); g.fill();
    g.filter = 'none'; g.globalCompositeOperation = 'destination-out'; rect(); g.fill();
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(2 * ox, ou);
    geo.rotateX(-Math.PI / 2);
    // canvas top (u = 0) lands at the gutter; u grows toward the open edge
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0x000000 });
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2;
    const rim = new THREE.Mesh(geo, mat);
    rim.position.set(0, -T + 0.0006, (page === 'near' ? 1 : -1) * ou / 2);
    if (page === 'far') rim.rotation.y = Math.PI; // flip so u = 0 sits at the gutter
    rim.renderOrder = 1;
    grp.add(rim);
  }

  // spine: a ribbon from the near cover's gutter edge to the far cover's, bending round the back
  const spineMat = coverMat;
  const spine = new THREE.Mesh(new THREE.BufferGeometry(), [spineMat, coverEdge]);
  spine.castShadow = false; spine.receiveShadow = true;
  const width = W + 2 * m;
  function updateSpine(spread) {
    const r = spread.r;
    // flat open, the spine is a zero-length sliver between the two covers: hidden (it flickered at the gutter)
    spine.visible = !spine.userData.off && r > 0.03;
    if (!spine.visible) return;
    const rot = (z, y) => [z * Math.cos(r) + y * Math.sin(r) * 0 - 0, 0]; // unused helper kept simple
    // points in (z,y). Far cover bottom gutter corner at open = (0, -Tf-ct)
    const Pn = new THREE.Vector2(0, -Tn - ct);
    const yF = -Tf - ct; // rotate (z=0,y=yF) by r about x: y' = y cos r, z' = y sin r
    const Pf = new THREE.Vector2(yF * Math.sin(r), yF * Math.cos(r));
    const k = Math.sin(r / 2) * (Tn + Tf + 2 * ct) * 0.7;
    const P1 = new THREE.Vector2(Pn.x - k, Pn.y);
    // far cover outward direction at its gutter edge: rotate (z=+1,y=0) by r -> (cos r, sin r)
    const P2 = new THREE.Vector2(Pf.x + k * Math.cos(r), Pf.y + k * Math.sin(r));
    const curve = new THREE.CubicBezierCurve(Pn, P1, P2, Pf);
    const pts = curve.getPoints(16);
    // inner offset by ct (towards the book)
    const inner = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const t = new THREE.Vector2().subVectors(b, a).normalize();
      const nrm = new THREE.Vector2(-t.y, t.x); // left normal
      return p.clone().addScaledVector(nrm, -ct * 0.9);
    });
    const outline = pts.concat(inner.reverse());
    // shape coords: sx = -z, sy = y ; extrude along +z then rotateY(90deg): sx -> -z ... map so world z = z
    const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(-p.x, p.y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 2 });
    g.rotateY(Math.PI / 2);
    g.translate(-width / 2, 0, 0);
    finishUVs(g);
    spine.geometry.dispose();
    spine.geometry = g;
  }

  let ribbonPivot = null;
  // one quiet detail: a Sand ribbon bookmark slipped into the page block, its tail draped over the front edge
  if (spec.ribbon) {
    const rw = 0.034, rt = 0.0018, yIn = -Tn * 0.45, yLow = -Tn - ct - 0.009;
    const zEdge = D + m;
    const path = new THREE.CurvePath();
    path.add(new THREE.LineCurve(new THREE.Vector2(D - 0.12, yIn), new THREE.Vector2(D + 0.004, yIn)));
    path.add(new THREE.CubicBezierCurve(new THREE.Vector2(D + 0.004, yIn), new THREE.Vector2(D + 0.03, yIn), new THREE.Vector2(zEdge + 0.012, yIn - 0.02), new THREE.Vector2(zEdge + 0.02, yLow + 0.03)));
    path.add(new THREE.CubicBezierCurve(new THREE.Vector2(zEdge + 0.02, yLow + 0.03), new THREE.Vector2(zEdge + 0.025, yLow + 0.008), new THREE.Vector2(zEdge + 0.05, yLow), new THREE.Vector2(zEdge + 0.1, yLow)));
    const pts = path.getSpacedPoints(40);
    const inner = pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const t = new THREE.Vector2().subVectors(b, a).normalize(); return p.clone().add(new THREE.Vector2(-t.y, t.x).multiplyScalar(rt)); });
    // the tail ends in a swallowtail notch, cut by trimming the outline's last point
    const shape = new THREE.Shape(pts.concat(inner.reverse()).map((p) => new THREE.Vector2(-p.x, p.y)));
    const rg = new THREE.ExtrudeGeometry(shape, { depth: rw, bevelEnabled: false, curveSegments: 2 });
    rg.rotateY(Math.PI / 2);
    rg.translate(spec.ribbon.x ?? 0.5, 0, 0);
    finishUVs(rg);
    const rm = paperMaterial(spec.ribbon.color || '#DCC380', { roughness: 0.7 });
    const ribbon = new THREE.Mesh(rg, rm); ribbon.castShadow = false; ribbon.receiveShadow = true;
    // pivot where the ribbon leaves the page block, so the tail can sway (the hint that the book opens)
    const px = (spec.ribbon.x ?? 0.5) + rw / 2;
    ribbonPivot = new THREE.Group(); ribbonPivot.position.set(px, yIn, D + 0.004);
    ribbon.position.set(-px, -yIn, -(D + 0.004));
    ribbonPivot.add(ribbon);
    near.add(ribbonPivot);
  }
  // the front cover title, foil-stamped into the board: on the outside of the half that swings, so it faces up
  // while the book is shut and turns away with the cover as it opens. Letterspaced serif caps, antique gold
  // with a debossed shadow; redrawn once the font has loaded.
  // the cover's type and line work: one foil layer over the whole cover face, drawn upright for the shut book.
  // Letterspaced serif caps for the title, a small spaced author line at the foot, a hairline arch frame echoing
  // the window. The foil reads dark (espresso) by day and catches the light at night (the engine drives it).
  let titleMesh = null, glimpse = null;
  if (spec.title) {
    const PXU = 1400 / across, c = document.createElement('canvas');
    c.width = Math.round(across * PXU); c.height = Math.round(along * PXU);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const X = (u) => (u - GAP) * PXU, Y = (x) => (W / 2 + m - x) * PXU; // shape (x, u) -> canvas px
    const words = String(spec.title).toUpperCase().split(' ');
    const lines = side ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')].filter(Boolean) : [words.join(' ')];
    const draw = (serif, mono) => {
      const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      const cx = c.width / 2, cap = (spec.titleCap ?? 0.074) * PXU;
      // title: letterspaced caps; shrinks to fit 80% of the board if a line runs long (a wider display face)
      const capR = 0.7, trk = 0.32;
      let size = cap / capR;
      const setT = () => { g.font = `400 ${size}px ${serif}`; try { g.letterSpacing = `${size * capR * trk}px`; } catch (_) { /* older canvas: no tracking */ } };
      setT();
      const widest = Math.max(...lines.map((ln) => g.measureText(ln).width));
      if (widest > c.width * 0.8) { size *= (c.width * 0.8) / widest; setT(); }
      const capPx = size * capR;
      const y1 = (spec.titleY ?? 0.21) * PXU;
      lines.forEach((ln, i) => g.fillText(ln, cx + capPx * trk / 2, y1 + i * capPx * 1.62));
      // a short rule under it
      g.fillRect(cx - c.width * 0.05, y1 + (lines.length - 1) * capPx * 1.62 + capPx * 0.62, c.width * 0.1, Math.max(2, capPx * 0.05));
      if (win) { // hairline frame echoing the arch, 0.03 outside the cut
        const o = 0.03 * PXU, xL = X(uMid - win.r) - o, xR = X(uMid + win.r) + o, yb = Y(win.xb) + o, yc = Y(win.xc);
        g.lineWidth = Math.max(1.5, 0.004 * PXU); g.globalAlpha = 0.75;
        g.beginPath(); g.moveTo(xL, yb); g.lineTo(xL, yc); g.arc(cx, yc, (xR - xL) / 2, Math.PI, 0, false); g.lineTo(xR, yb); g.closePath(); g.stroke();
        g.globalAlpha = 1;
      }
      // author: small, spaced, near the foot
      const acap = (spec.authorCap ?? 0.032) * PXU;
      g.font = `400 ${acap / capR}px ${serif}`; // the title's face, small and spaced
      try { g.letterSpacing = `${acap * 0.7}px`; } catch (_) { /* fine */ }
      if (spec.author) g.fillText(String(spec.author).toUpperCase(), cx + acap * 0.3, c.height - (spec.authorY ?? 0.17) * PXU);
      tex.needsUpdate = true;
    };
    // letterspaced serif caps; Memoir (the site's display face) takes over once its file is in home/fonts/fonts.css
    const MEMOIR = '"Memoir", Georgia, serif', SERIF = 'Georgia, "Times New Roman", serif', MONO = '"Martian Mono", ui-monospace, monospace';
    draw(SERIF, MONO);
    if (document.fonts?.load) document.fonts.load('400 32px "Memoir"').then((f) => { if (f.length) draw(MEMOIR, MONO); }).catch(() => {});
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3A2A17'), map: tex, transparent: true, roughness: 0.45, metalness: 0.35, depthWrite: false, emissive: new THREE.Color('#F4DDA6'), emissiveMap: tex, emissiveIntensity: 0 });
    mat.polygonOffset = true; mat.polygonOffsetFactor = -4;
    const geo = new THREE.PlaneGeometry(across, along);
    // upright for the shut book: text runs along -z of the far half (to the right once shut), up is +x
    if (side) geo.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)));
    else geo.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)));
    titleMesh = new THREE.Mesh(geo, mat); titleMesh.receiveShadow = true; titleMesh.renderOrder = 2;
    titleMesh.position.set(0, -Tf - ct - 0.0006, -uMid);
    titleMesh.userData.noAO = true;
    far.add(titleMesh);
    if (win) {
      // the glimpse: printed on the first board, seen through the cut, framed by the cover's real thickness
      const gg = new THREE.PlaneGeometry(win.r * 2 + 0.02, win.ah + 0.02);
      gg.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)));
      const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.glimpseFill || '#C9D6E0') });
      glimpse = new THREE.Mesh(gg, gm); glimpse.position.set(win.xMid, -Tf - 0.0005, -uMid);
      glimpse.userData.noAO = true;
      far.add(glimpse);
    }
  }
  // the board stack never moves inside its half: one mesh per material (draw calls). The top skins stay
  // separate (the page-turn leaf borrows their materials, the print sits on them), and so does the ribbon.
  for (const grp of [near, far]) mergeStatic(grp, (o) => o === topSkin.near || o === topSkin.far || o === ribbonPivot || o === titleMesh || o === glimpse);
  const group = new THREE.Group();
  group.add(near, far, spine);
  return {
    group, near, far, spine, Tn, Tf, ct, ribbon: ribbonPivot, topSkin, board, R, coreMat, titleMat: titleMesh?.material || null, glimpse, glimpseAspect: win ? (win.r * 2 + 0.02) / (win.ah + 0.02) : 1,
    bottom: -Tn - ct,
    update(spread) {
      far.matrix.makeRotationFromQuaternion(spread.qFar);
      far.matrixWorldNeedsUpdate = true;
      updateSpine(spread);
    },
  };
}
