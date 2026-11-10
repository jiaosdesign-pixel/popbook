// Page corners: the two lower outer corners of the near page can curl up a little, like the top board's
// corner lifting under a thumb. A triangular patch of the near page's print is rebuilt over the corner and
// bent progressively past a 45 degree fold line (a curl, not a hinge). Underneath, the page below shows.
// The patch casts and receives shadows like any card. Used by book.js in 'detail' mode for prev / next.
import * as THREE from 'three';
import { paperMaterial } from './paper.js';

// opts.layout 'side' (side-bound panorama): both corners sit on the reader's edge (x = -W/2), 'next' on the
// near (right) page and 'prev' on the far (left) page, mirrored. print may be a texture or { near, far }.
export function makeCorners(book, print, spec, opts = {}) {
  const prints = print?.isTexture ? { near: print, far: print } : print;
  const sideLayout = opts.layout === 'side';
  const W = spec.width, D = spec.depth, R = book.R ?? 0.07;
  const L = opts.leg ?? 0.3;           // leg of the corner triangle along each page edge
  const H = L / Math.SQRT2;              // fold line to corner distance
  const N = 22, M = 22;                  // rows (across the fold) and columns (along it)
  const PHI = opts.maxAngle ?? 1.9;      // curl angle at the very tip when k = 1
  const group = new THREE.Group();
  const frontMats = { near: paperMaterial('#fff', { map: prints.near }), far: paperMaterial('#fff', { map: prints.far }) };
  const backMat = paperMaterial(spec.core || '#F4F1E8', { noCache: true }); backMat.side = THREE.BackSide;
  const underMat = paperMaterial(spec.core || '#F4F1E8', { noCache: true });
  const sides = {};
  const configs = sideLayout ? [[-1, 'next', false], [-1, 'prev', true]] : [[-1, 'prev', false], [1, 'next', false]];
  for (const [side, dirName, onFar] of configs) {
    const frontMat = frontMats[onFar ? 'far' : 'near'];
    const C = new THREE.Vector2(side * W / 2, D);               // corner in (x, u)
    const A = new THREE.Vector2(side * (W / 2 - L), D), B = new THREE.Vector2(side * W / 2, D - L);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const tH = B.clone().sub(A).normalize();
    const nH = C.clone().sub(mid).normalize();
    const cc = new THREE.Vector2(side * (W / 2 - R), D - R);    // rounded page corner
    // flat (x, u) of every vertex, and its row
    const flat = [];
    for (let i = 0; i <= N; i++) {
      const s = (H * i) / N, w = H - s;
      for (let j = 0; j <= M; j++) {
        const t = ((j / M) * 2 - 1) * w;
        const p = mid.clone().addScaledVector(nH, s).addScaledVector(tH, t);
        if (Math.abs(p.x) > W / 2 - R && p.y > D - R) { const d = p.clone().sub(cc); if (d.length() > R) p.copy(cc).addScaledVector(d.normalize(), R); }
        flat.push(p);
      }
    }
    const pos = new Float32Array(flat.length * 3), uv = new Float32Array(flat.length * 2), uv1 = new Float32Array(flat.length * 2);
    flat.forEach((p, k) => { uv[k * 2] = (p.x + W / 2) / W; uv[k * 2 + 1] = onFar ? p.y / D : 1 - p.y / D; uv1[k * 2] = p.x * 2.2; uv1[k * 2 + 1] = -p.y * 2.2; });
    const idx = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    // wind every triangle to face up (+y) when flat; which way that is depends on the side
    const cross = (i0, i1, i2) => { const p0 = flat[i0], p1 = flat[i1], p2 = flat[i2]; return (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x); };
    // (x, u) maps to world (x, z): +y normal needs a clockwise (x, u) winding
    if (cross(idx[0], idx[1], idx[2]) > 0) for (let q = 0; q < idx.length; q += 3) [idx[q + 1], idx[q + 2]] = [idx[q + 2], idx[q + 1]];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    geo.setIndex(idx);
    const front = new THREE.Mesh(geo, frontMat), back = new THREE.Mesh(geo, backMat);
    for (const m of [front, back]) { m.castShadow = true; m.receiveShadow = true; m.renderOrder = 2; }
    // the page below, revealed where the corner lifts
    const ug = geo.clone(); const under = new THREE.Mesh(ug, underMat); under.receiveShadow = true;
    const up = ug.attributes.position;
    flat.forEach((p, k) => up.setXYZ(k, p.x, 0.00025, p.y));
    ug.computeVertexNormals();
    // the far page's corner is the near one mirrored across the gutter (three.js flips the winding)
    const holder = onFar ? new THREE.Group() : group;
    if (onFar) { holder.scale.z = -1; group.add(holder); }
    holder.add(under, back, front);
    const rowS = new Float32Array(N + 1), rowY = new Float32Array(N + 1);
    const S = { k: -1, target: 0, front, back, under, geo, flat };
    S.set = (k) => {
      if (Math.abs(k - S.k) < 1e-4) return false;
      S.k = k;
      // integrate the curl along each row: angle grows toward the tip
      let s1 = 0, y1 = 0; rowS[0] = 0; rowY[0] = 0;
      for (let i = 1; i <= N; i++) {
        const ph = k * PHI * Math.pow((i - 0.5) / N, 1.7), ds = H / N;
        s1 += Math.cos(ph) * ds; y1 += Math.sin(ph) * ds; rowS[i] = s1; rowY[i] = y1;
      }
      const P = geo.attributes.position;
      for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) {
        const kk = i * (M + 1) + j, p = flat[kk];
        const s = (H * i) / N;
        // move along the fold normal by the bent length instead of s, and lift by the bent height
        const x = p.x + nH.x * (rowS[i] - s), u = p.y + nH.y * (rowS[i] - s);
        P.setXYZ(kk, x, 0.0006 + rowY[i], u);
      }
      P.needsUpdate = true;
      geo.computeVertexNormals(); geo.computeBoundingSphere(); geo.computeBoundingBox();
      return true;
    };
    S.set(0);
    sides[dirName] = S;
  }
  return {
    group, sides,
    meshes: [sides.prev.front, sides.next.front],
    dirOf: new Map([[sides.prev.front, 'prev'], [sides.next.front, 'next']]),
    dispose() { for (const S of Object.values(sides)) { S.geo.dispose(); S.under.geometry.dispose(); } backMat.dispose(); underMat.dispose(); frontMats.near.dispose(); frontMats.far.dispose(); },
  };
}
