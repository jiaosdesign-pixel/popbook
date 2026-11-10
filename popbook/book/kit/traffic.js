// Kit: deck traffic. Tiny folded-box cars riding a hidden paper belt inside a bridge deck.
// One belt loop per lane, so every car on a lane moves at the same speed and none ever passes another.
// A car rises out of a slot at one end of the deck, crosses, and dives back into the slot at the other
// end. The return run is under the deck, hidden behind the truss card. The boxes are folded, so they
// collapse flat as the deck folds into the closed book.
import * as THREE from 'three';
import { glowSprite, glowTexture, aoStrip } from '../engine/paper.js';
import { paperBox } from './bridge.js';
import { sstep, hop } from '../engine/motion.js';

export function build(ctx, s) {
  const pal = ctx.palette;
  const host = ctx.pieces[s.on];
  if (!host?.mount?.deckFrom) throw new Error(`deck-traffic: '${s.on}' has no deck to ride in`);
  const { deckH: h, halfDepth: a, deckFrom, deckTo, truss } = host.mount;
  const x0 = deckFrom + 0.03, x1 = deckTo - 0.03, run = x1 - x0;
  const loop = run + (s.returnRun ?? 0.45); // the belt's hidden return run under the deck
  const dip = 0.05, sink = Math.min(0.027, truss - 0.002);
  const speed = s.speed ?? 0.045; // deck units per second: about half a minute to cross
  const lanes = { near: new THREE.Group(), far: new THREE.Group() };
  const cars = [], lights = [], pokes = [];
  // an invisible, slightly larger box per car: tiny cars are hard to hit
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  for (const c of s.cars) {
    const lane = c.lane === 'far' ? 'far' : 'near';
    const dir = lane === 'near' ? 1 : -1; // right-hand traffic: the lane nearer the reader drives north (+x)
    const car = new THREE.Group();
    const body = paperBox(0.042, 0.012, 0.022, c.color, 0.003); body.position.set(0, 0.007, 0); body.castShadow = false;
    const cab = paperBox(0.022, 0.011, 0.019, c.color, 0.003); cab.position.set(-0.003, 0.0175, 0); cab.castShadow = false;
    const win = paperBox(0.023, 0.006, 0.0195, pal.glass, 0.002); win.position.set(-0.003, 0.0185, 0); win.castShadow = false;
    const blob = aoStrip(-0.026, 0.026, 0.034, 0.32); blob.position.y = 0.0004;
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.036, 0.04), proxyMat); proxy.position.y = 0.014; proxy.userData.hitProxy = true;
    car.add(body, cab, win, blob, proxy);
    const head = glowSprite(pal.lamp, 0.05); head.position.set(0.024, 0.009, 0); car.add(head);
    const tail = glowSprite('#ff3b2a', 0.03); tail.position.set(-0.023, 0.009, 0); car.add(tail);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.026), new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(pal.lamp), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(0.062, 0.0012, 0); car.add(pool);
    lights.push([head, 1], [tail, 1], [pool, 0.7]);
    car.rotation.y = dir > 0 ? 0 : Math.PI;
    car.position.z = dir * a * (c.lane_offset ?? 0.55);
    lanes[lane].add(car);
    const entry = { car, dir, phase: c.at ?? 0, hop: -1, body: [body, cab, win] };
    cars.push(entry);
    // easter egg: tap a car and it gives a little hop on its belt tab
    pokes.push({ targets: [proxy, body, cab, win], run() { if (entry.hop < 0) entry.hop = 0; } });
  }
  ctx.lamp((k) => { for (const [m, o] of lights) m.material.opacity = o * k; });

  let fold = 1;
  function place(t) {
    for (const c of cars) {
      const p = (((c.phase * loop + t * speed) % loop) + loop) % loop;
      if (p >= run) { c.car.visible = false; continue; }
      c.car.visible = true;
      const e = sstep(0, 1, Math.min(1, p / dip, (run - p) / dip));
      c.car.position.x = c.dir > 0 ? x0 + p : x1 - p;
      let y = 0, sx = 1, sy = 1;
      if (c.hop >= 0) ({ y, sx, sy } = hop(c.hop, 0.013));
      c.car.position.y = -sink * (1 - e) + y;
      c.car.scale.set(sx, fold * sy, sx);
    }
  }
  place(0);

  return {
    parts: ['near', 'far'].map((lane) => ({ obj: lanes[lane], frame: (sp, m) => sp.layerFrame(lane, h, m) })),
    // folded boxes collapse as the deck halves fold toward their pages
    dynamic(sp) { fold = Math.max(0.04, sstep(0.35, 0.95, sp.upright)); for (const c of cars) c.car.scale.y = fold; },
    tick(t, dt) {
      for (const c of cars) if (c.hop >= 0) { c.hop += dt / 0.5; if (c.hop >= 1) c.hop = -1; }
      place(t); return 'draw';
    },
    pokes,
  };
}
