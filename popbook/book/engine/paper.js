// Paper: grain texture, matte card materials, die-cut card meshes.
// The engine owns the look. Kit pieces only ask for card(shape, {color}).
import * as THREE from 'three';

let GRAIN = null;
export function grainTexture() {
  if (GRAIN) return GRAIN;
  // the site's paper (home/paper/grain-*.svg: fractal noise, frequency .75, two octaves): a fine dark tooth,
  // a faint mottle and a few fibres. Mapped through uv1 (world-scaled per card), so it never swims with the camera.
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (t) => t * t * (3 - 2 * t);
  const noise = (N) => { // tileable value noise with N cells across
    const grid = new Float32Array(N * N).map(() => Math.random());
    return (x, y) => {
      const gx = (x / S) * N, gy = (y / S) * N, ix = Math.floor(gx), iy = Math.floor(gy), fx = sm(gx - ix), fy = sm(gy - iy);
      const at = (i, j) => grid[((j % N + N) % N) * N + ((i % N + N) % N)];
      return lerp(lerp(at(ix, iy), at(ix + 1, iy), fx), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), fx), fy);
    };
  };
  const tooth1 = noise(256), tooth2 = noise(128), mottle = noise(16);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = 0.6 * tooth1(x, y) + 0.4 * tooth2(x, y); // fractal, about two texels per speck
    const speck = Math.max(0, 0.58 - t) * 2.4; // dark tooth only, like the site's grain (it only darkens)
    const v = 168 + (mottle(x, y) - 0.5) * 7 - speck * 70 + (Math.random() - 0.5) * 10; // a quiet mottle: the tooth carries the paper
    const k = (y * S + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.max(0, Math.min(255, v)); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // fibres
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * S, y = Math.random() * S, a = Math.random() * Math.PI, l = 4 + Math.random() * 12;
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    g.lineWidth = 0.6 + Math.random() * 0.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  GRAIN = new THREE.CanvasTexture(c);
  GRAIN.wrapS = GRAIN.wrapT = THREE.RepeatWrapping;
  GRAIN.channel = 1; // uses uv1 (world-scaled)
  // uv1 runs 2.2 per book unit; one tile per ~1.5 units puts the tooth near the site's scale at hero size
  GRAIN.repeat.set(0.3, 0.3);
  GRAIN.anisotropy = 8;
  GRAIN.colorSpace = THREE.NoColorSpace;
  GRAIN.userData.shared = true;
  return GRAIN;
}

const CREAM = new THREE.Color('#efe8d8');
const TOOTH = 0.32; // how strongly the grain darkens the paper colour (subtle)
const matCache = new Map();

// Matte paper. opts: {map, emissiveMap, emissive, translucent, edgeMix, roughness}
export function paperMaterial(color, opts = {}) {
  const key = !opts.map && !opts.emissiveMap && !opts.translucent && !opts.noCache ? `${color}|${opts.roughness ?? ''}|${opts.bump ?? ''}` : null;
  if (key && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.94,
    metalness: 0,
    bumpMap: grainTexture(),
    bumpScale: opts.bump ?? 0.1,
    aoMap: grainTexture(),
    aoMapIntensity: opts.grain ?? 0.12,
    map: opts.map || null,
    emissiveMap: opts.emissiveMap || null,
    emissive: opts.emissiveMap ? new THREE.Color(opts.emissive || '#ffffff') : new THREE.Color(0x000000),
    emissiveIntensity: 0,
    side: THREE.FrontSide,
  });
  if (opts.map) m.color.set('#ffffff');
  // the tooth shows in the paper's own colour, not only in its shadowed light: the grain (already bound as the
  // aoMap, on uv1) darkens the diffuse colour a little, the way the site's grain overlay darkens its paper
  m.userData.grainK = { value: opts.tooth ?? TOOTH };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.grainK = m.userData.grainK;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float grainK;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n#ifdef USE_AOMAP\n  diffuseColor.rgb *= 1.0 - grainK * clamp(1.0 - texture2D(aoMap, vAoMapUv).r / 0.66, -0.4, 1.0);\n#endif');
  };
  m.customProgramCacheKey = () => 'paper-tooth';
  if (opts.translucent) { m.transparent = true; m.opacity = opts.opacity ?? 0.86; m.side = THREE.DoubleSide; }
  if (key) { m.userData.shared = true; matCache.set(key, m); }
  return m;
}

export function edgeMaterial(color, mix = 0.55) {
  const c = new THREE.Color(color).lerp(CREAM, mix);
  return paperMaterial('#' + c.getHexString());
}

// Rounded rectangle path helper (x0,y0)-(x1,y1)
export function roundRect(x0, y0, x1, y1, r, corners = [1, 1, 1, 1]) {
  const s = new THREE.Shape();
  const [bl, br, tr, tl] = corners.map((c) => c * r);
  s.moveTo(x0 + bl, y0);
  s.lineTo(x1 - br, y0); if (br) s.quadraticCurveTo(x1, y0, x1, y0 + br);
  s.lineTo(x1, y1 - tr); if (tr) s.quadraticCurveTo(x1, y1, x1 - tr, y1);
  s.lineTo(x0 + tl, y1); if (tl) s.quadraticCurveTo(x0, y1, x0, y1 - tl);
  s.lineTo(x0, y0 + bl); if (bl) s.quadraticCurveTo(x0, y0, x0 + bl, y0);
  return s;
}

export function polyShape(pts) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  s.closePath();
  return s;
}

// A die-cut card: extruded shape (in local XY), centred on z=0, rounded cut edges.
// Face material on both caps; lighter "core" material on the cut edge.
export function card(shape, o = {}) {
  const depth = o.depth ?? 0.004;
  const bev = o.bevel ?? Math.min(depth * 0.3, 0.0012);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(depth - 2 * bev, 0.0002), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev,
    bevelOffset: -bev, bevelSegments: o.bevelSegments ?? 2, curveSegments: o.curveSegments ?? 12, steps: 1,
  });
  geo.translate(0, 0, -depth / 2 + bev);
  finishUVs(geo, o.uvBox);
  const face = o.material || paperMaterial(o.color || '#ffffff', o);
  const edge = o.edgeMaterial || (o.translucent ? face : edgeMaterial(o.edgeColor || o.color || '#ffffff', o.edgeMix ?? 0.6));
  const mesh = new THREE.Mesh(geo, [face, edge]);
  mesh.castShadow = o.castShadow ?? true;
  mesh.receiveShadow = true;
  return mesh;
}

// caps: uv normalised to the shape bbox (for printed faces); uv1: world-scaled (grain)
export function finishUVs(geo, box) {
  geo.computeBoundingBox();
  const bb = box || geo.boundingBox;
  const minX = box ? box[0] : bb.min.x, minY = box ? box[1] : bb.min.y;
  const w = (box ? box[2] - box[0] : bb.max.x - bb.min.x) || 1, h = (box ? box[3] - box[1] : bb.max.y - bb.min.y) || 1;
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const uv1 = new Float32Array(pos.count * 2);
  const cap = geo.groups[0];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    uv1[i * 2] = (x + z) * 2.2; uv1[i * 2 + 1] = (y + z * 0.7) * 2.2;
    if (cap && i >= cap.start && i < cap.start + cap.count) uv.setXY(i, (x - minX) / w, (y - minY) / h);
  }
  geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  uv.needsUpdate = true;
}

// Printed face: draw on a canvas in shape coordinates. draw(ctx, sx, sy, W, H) where sx/sy map shape units to px.
export function printTexture(box, draw, pxPerUnit = 900, maxPx = 2048) {
  const w = box[2] - box[0], h = box[3] - box[1];
  let s = pxPerUnit;
  if (Math.max(w, h) * s > maxPx) s = maxPx / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w * s)); c.height = Math.max(2, Math.round(h * s));
  const g = c.getContext('2d');
  // shape coords -> canvas px (y up -> y down)
  g.setTransform(s, 0, 0, -s, -box[0] * s, box[3] * s);
  draw(g, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Soft contact-darkening decal (cheap ambient occlusion) lying on a surface.
let AO_TEX = null;
function aoTexture() {
  if (AO_TEX) return AO_TEX;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  // fade the ends
  const img = g.getImageData(0, 0, 64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const e = Math.min(1, Math.min(x, 63 - x) / 10);
    img.data[(y * 64 + x) * 4 + 3] *= e;
  }
  g.putImageData(img, 0, 0);
  AO_TEX = new THREE.CanvasTexture(c);
  AO_TEX.userData.shared = true;
  return AO_TEX;
}
// A strip along local X, centred on z=0, lying in the XZ plane slightly above y=0.
export function aoStrip(x0, x1, depth, strength = 0.35) {
  const geo = new THREE.PlaneGeometry(x1 - x0, depth);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, 0.0008, 0);
  const m = new THREE.MeshBasicMaterial({ map: aoTexture(), transparent: true, opacity: strength, depthWrite: false, color: 0x000000 });
  m.polygonOffset = true; m.polygonOffsetFactor = -2;
  const mesh = new THREE.Mesh(geo, m);
  mesh.renderOrder = 1;
  mesh.userData.aoBase = strength;
  return mesh;
}

// Additive glow sprite for lamps at night
let GLOW_TEX = null;
export function glowTexture() {
  if (GLOW_TEX) return GLOW_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  GLOW_TEX = new THREE.CanvasTexture(c);
  GLOW_TEX.colorSpace = THREE.SRGBColorSpace;
  GLOW_TEX.userData.shared = true;
  return GLOW_TEX;
}
export function glowSprite(color, size) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(color), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, size);
  s.userData.glow = true;
  return s;
}

// Free a built moment: geometries always, materials and textures unless shared through the cache.
export function disposeTree(obj) {
  obj.traverse((m) => {
    m.geometry?.dispose();
    for (const mat of [].concat(m.material || [])) {
      if (mat.userData?.shared) continue;
      for (const k of ['map', 'emissiveMap', 'bumpMap', 'aoMap']) if (mat[k] && !mat[k].userData?.shared) mat[k].dispose();
      mat.dispose();
    }
  });
}
