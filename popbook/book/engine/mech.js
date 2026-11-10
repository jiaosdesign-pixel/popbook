// Pop-up mechanics. Book frame: gutter along X at y=0,z=0. Near page z>0 (towards camera),
// far page z<0 when open. The far half rotates about the gutter by r = PI - phi.
// phi = spread angle (0 closed, PI flat). All pieces are modelled "as open" and get a frame
// that is a pure function of phi, so every piece really is driven by the page angle.
import * as THREE from 'three';

const X = new THREE.Vector3(1, 0, 0);

export class Spread {
  constructor(depth) { this.D = depth; this.set(Math.PI); }
  set(phi) {
    this.phi = phi;
    const r = Math.PI - phi; this.r = r;
    this.dN = new THREE.Vector3(0, 0, 1);
    this.dF = new THREE.Vector3(0, Math.sin(r), -Math.cos(r));
    this.nF = new THREE.Vector3(0, Math.cos(r), Math.sin(r));
    this.b = new THREE.Vector3(0, Math.sin(phi / 2), Math.cos(phi / 2)); // bisector
    this.qFar = new THREE.Quaternion().setFromAxisAngle(X, r);
    this.upright = Math.sin(phi / 2); // 1 when flat-open, 0 when closed
    return this;
  }
  dir(page) { return page === 'far' ? this.dF : this.dN; }
  // point on a page surface, x along gutter, u = distance from gutter
  point(page, x, u, out = new THREE.Vector3()) {
    return out.copy(this.dir(page)).multiplyScalar(u).add(new THREE.Vector3(x, 0, 0));
  }
  // page frame: maps open-world coords of a piece lying on that page
  pageFrame(page, out = new THREE.Matrix4()) {
    return page === 'far' ? out.makeRotationFromQuaternion(this.qFar) : out.identity();
  }
  // parallel wall (floating-layer side) hinged on `page` at distance u. Local: x along gutter,
  // y up the wall (along bisector), z = wall normal (towards camera when open).
  wallFrame(page, x, u, out = new THREE.Matrix4()) {
    const o = this.point(page, x, u);
    const Z = new THREE.Vector3().crossVectors(X, this.b);
    return out.makeBasis(X, this.b, Z).setPosition(o);
  }
  // a figure/prop standing on a platform half at height h, s from the platform crease
  standFrame(page, h, x, s, out = new THREE.Matrix4()) {
    const o = this.b.clone().multiplyScalar(h).add(this.dir(page).clone().multiplyScalar(s)).add(new THREE.Vector3(x, 0, 0));
    const Z = new THREE.Vector3().crossVectors(X, this.b);
    return out.makeBasis(X, this.b, Z).setPosition(o);
  }
  // platform half of a floating layer at height h (crease above the gutter).
  // Local coords = open-world coords relative to the crease point.
  layerFrame(page, h, out = new THREE.Matrix4()) {
    this.pageFrame(page, out);
    const o = this.b.clone().multiplyScalar(h);
    return out.setPosition(o);
  }
  // V-fold: origin x0 on the gutter. Hinge on each page leaves the gutter at angle theta
  // (radians, measured from +X towards the open edge; use PI - theta to lean left).
  // gamma = corner angle between hinge and crease. Returns frames for both panels:
  // panel-local x along hinge, y in panel plane towards crease (crease at angle gamma).
  vfold(x0, theta, gammaN, gammaF = gammaN) {
    const O = new THREE.Vector3(x0, 0, 0);
    const hN = new THREE.Vector3(Math.cos(theta), 0, 0).addScaledVector(this.dN, Math.sin(theta)).normalize();
    const hF = new THREE.Vector3(Math.cos(theta), 0, 0).addScaledVector(this.dF, Math.sin(theta)).normalize();
    const k = hN.dot(hF);
    const cn = Math.cos(gammaN), cf = Math.cos(gammaF);
    let c;
    const cross = new THREE.Vector3().crossVectors(hN, hF);
    const cl = cross.length();
    if (cl < 1e-4) {
      // closed: take the limit of the nearly closed pose, so the crease falls the same way it was folding
      // (toward the reader or away from it, depending on theta)
      if (this.phi < 1e-3) return new Spread(this.D).set(1e-3).vfold(x0, theta, gammaN, gammaF);
      const inPlane = new THREE.Vector3().crossVectors(this.nF.clone().negate(), hN).normalize();
      c = hN.clone().multiplyScalar(cn).addScaledVector(inPlane, Math.sin(gammaN));
    } else {
      const den = 1 - k * k;
      const p = (cn - k * cf) / den, q = (cf - k * cn) / den;
      const base = hN.clone().multiplyScalar(p).addScaledVector(hF, q);
      const s2 = Math.max(0, 1 - base.lengthSq()) / (cl * cl);
      const s = Math.sqrt(s2);
      const c1 = base.clone().addScaledVector(cross, s), c2 = base.clone().addScaledVector(cross, -s);
      c = c1.dot(this.b) >= c2.dot(this.b) ? c1 : c2;
      c.normalize();
    }
    const panel = (h, flip) => {
      const e2 = c.clone().addScaledVector(h, -c.dot(h)).normalize();
      const Z = new THREE.Vector3().crossVectors(h, e2);
      const m = new THREE.Matrix4().makeBasis(h, e2, Z).setPosition(O);
      return m;
    };
    return { near: panel(hN), far: panel(hF), crease: c, O };
  }

  // V-fold layer seen from the reader (side-bound panorama): two frames in "front view" coordinates,
  // x along the layer (right half x >= 0 on the near page, left half x <= 0 on the far page), y up the
  // crease, z toward the reader. Both halves share the crease at x = 0. Pure function of the page angle.
  vlayer(x0, theta, gamma = Math.PI / 2, out = { right: new THREE.Matrix4(), left: new THREE.Matrix4() }) {
    const v = this.vfold(x0, theta, gamma);
    out.right.copy(v.near);
    out.left.copy(v.far).multiply(FLIP_Y);
    out.crease = v.crease; out.O = v.O;
    return out;
  }
  // platform between two parallel V-folds (a V-box): stays parallel to its page, origin on the crease
  // of the front V-fold at height h. Local coords = open-world coords relative to that point.
  vplatform(page, x0, theta, h, gamma = Math.PI / 2, out = new THREE.Matrix4()) {
    const v = this.vfold(x0, theta, gamma);
    this.pageFrame(page, out);
    return out.setPosition(v.O.clone().addScaledVector(v.crease, h));
  }
}
const FLIP_Y = new THREE.Matrix4().makeRotationY(Math.PI);

// Where a V-fold layer lies in the closed book: the four corners of each half (front-view rectangles
// [0..reach] x [0..height]) in page coordinates { x: along the gutter, u: from the gutter }.
export function vlayerFootprint(depth, x0, theta, gamma, reach, height) {
  const sp = new Spread(depth).set(1e-3), f = sp.vlayer(x0, theta, gamma), pts = [];
  for (const [side, m] of [['right', f.right], ['left', f.left]]) {
    const R = reach[side === 'right' ? 1 : 0], H = height[side === 'right' ? 1 : 0];
    for (const [s, y] of [[0, 0], [R, 0], [R, H], [0, H]]) {
      const p = new THREE.Vector3(side === 'right' ? s : -s, y, 0).applyMatrix4(m);
      pts.push({ side, x: p.x, u: Math.hypot(p.y, p.z) });
    }
  }
  return pts;
}

// Design helper: corner angle that makes a V-fold crease rise to elevation e at full open.
export function vfoldGamma(theta, elev) {
  return Math.acos(Math.cos(elev) * Math.abs(Math.cos(theta)));
}

// Thread with fixed length between two moving anchors. Draws slack as a gravity sag.
export class Thread {
  constructor(radius, material, segs = 24) {
    this.radius = radius; this.material = material; this.segs = segs;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.castShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.length = null;
  }
  // restSag: sag at full length (fraction of span) so a "taut" thread still reads as string
  update(a, b, restSag = 0.01) {
    const d = a.distanceTo(b);
    if (this.length == null) this.length = d * (1 + (8 / 3) * restSag * restSag);
    const L = Math.max(this.length, d);
    // parabola sag for arc length L over chord d
    const sag = Math.sqrt(Math.max(0, (3 * d * (L - d)) / 8)) + 0.0005;
    const pts = [];
    for (let i = 0; i <= this.segs; i++) {
      const t = i / this.segs;
      const p = a.clone().lerp(b, t);
      p.y -= 4 * sag * t * (1 - t);
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.TubeGeometry(curve, this.segs, this.radius, 5, false);
  }
}
