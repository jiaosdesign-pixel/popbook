// Kit: a tiny paper person. Layered die-cut cards (hair, head, coat, scarf, legs, arms),
// standing on a platform parallel to the walls so it folds flat with the floating layer.
// Poses: walk, stand, wave. Faces +x (walking right) unless flip.
import * as THREE from 'three';
import { card, polyShape, paperMaterial } from '../engine/paper.js';

function capsule(x0, y0, x1, y1, w) {
  // rounded limb from (x0,y0) to (x1,y1)
  const s = new THREE.Shape();
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L * w / 2, ny = dx / L * w / 2;
  s.moveTo(x0 + nx, y0 + ny); s.lineTo(x1 + nx, y1 + ny);
  s.absarc(x1, y1, w / 2, Math.atan2(ny, nx), Math.atan2(ny, nx) - Math.PI, true);
  s.lineTo(x0 - nx, y0 - ny);
  s.absarc(x0, y0, w / 2, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) - Math.PI, true);
  return s;
}
function circle(x, y, r) { const s = new THREE.Shape(); s.absarc(x, y, r, 0, Math.PI * 2, false); return s; }

export function makeFigure(pal, pose = 'walk', height = 0.09) {
  const g = new THREE.Group();
  const layers = [];
  const add = (shape, color, z) => { const m = card(shape, { color, depth: 0.0016, bevel: 0.0004, curveSegments: 10 }); m.position.z = z; layers.push(m); g.add(m); return m; };
  const c = pal.figure;
  // unit figure: feet at y=0, top of head ~1
  // back arm + back leg (slightly darker, behind)
  const walk = pose === 'walk';
  add(capsule(-0.01, 0.43, walk ? -0.13 : -0.02, 0.05, 0.085), c.legsBack, -0.0032);
  add(polyShape([[walk ? -0.17 : -0.07, 0.0], [walk ? -0.05 : 0.05, 0.0], [walk ? -0.07 : 0.04, 0.06], [walk ? -0.16 : -0.06, 0.06]]), c.shoes, -0.0034);
  add(capsule(0.0, 0.74, walk ? -0.12 : -0.05, 0.47, 0.07), c.coatBack, -0.0018);
  // front leg
  add(capsule(0.02, 0.43, walk ? 0.13 : 0.03, 0.05, 0.085), c.legs, -0.0012);
  add(polyShape([[walk ? 0.08 : -0.02, 0.0], [walk ? 0.22 : 0.1, 0.0], [walk ? 0.2 : 0.09, 0.06], [walk ? 0.09 : -0.01, 0.06]]), c.shoes, -0.0012);
  // coat (A-line)
  add(polyShape([[-0.1, 0.8], [0.09, 0.8], [0.13, 0.36], [-0.15, 0.36]]), c.coat, 0);
  // scarf
  add(polyShape([[-0.075, 0.82], [0.075, 0.82], [0.07, 0.75], [-0.07, 0.75]]), c.scarf, 0.0016);
  add(polyShape([[0.03, 0.78], [0.075, 0.78], [0.06, 0.6], [0.025, 0.62]]), c.scarf, 0.0018);
  // front arm
  const armTip = pose === 'wave' ? [0.2, 1.02] : walk ? [0.14, 0.48] : [0.04, 0.46];
  const arm = add(capsule(0.03, 0.76, armTip[0], armTip[1], 0.068), c.coat, 0.0024);
  arm.userData.arm = true;
  // head + hair
  add(circle(0.02, 0.9, 0.08), c.skin, 0.0006);
  const hair = new THREE.Shape();
  hair.absarc(0.0, 0.915, 0.088, Math.PI * 0.05, Math.PI * 1.2, false);
  hair.lineTo(-0.1, 0.74); hair.lineTo(-0.035, 0.76); hair.lineTo(-0.02, 0.86); hair.lineTo(0.07, 0.95);
  add(hair, c.hair, 0.0012);
  g.scale.setScalar(height);
  return { group: g, layers };
}

export function build(ctx, s) {
  const pal = ctx.palette;
  const host = ctx.pieces[s.on];
  if (!host || !host.mount) throw new Error(`walker: '${s.on}' has no walkway to stand on`);
  const { deckH, walkS } = host.mount;
  const fig = makeFigure(pal, s.pose || 'walk', s.height ?? 0.09);
  const outer = new THREE.Group();
  fig.group.rotation.y = s.flip ? Math.PI : 0;
  outer.add(fig.group);
  return {
    parts: [{ obj: outer, frame: (sp, m) => sp.standFrame('near', deckH, s.x ?? 0, walkS, m) }],
    targets: fig.layers,
    figure: fig,
  };
}
