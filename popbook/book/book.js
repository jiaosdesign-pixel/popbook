// Living pop-up book. Public API (see STATUS.md for the full list):
//   mountBook(container, { moment, theme, mode, state, startOpen, caption, onEnter, label, keysBefore, ... }) ->
//     (startOpen: true shows the book open on its page from the first frame: no cover, no opening animation)
//     { setTheme(t), setMoment(m, {direction}), setMode(m), setCorners({prev,next}), meta, open(), close(), act(), setProgress(p), destroy() }
//   themeAt(date) -> 'day' | 'night' (sun up in San Francisco or not)
// Host pages include the three.js import map. The container sets the size.
import * as THREE from 'three';
import { Spread, vlayerFootprint } from './engine/mech.js';
import { buildBook } from './engine/bookbody.js';
import { themeLight, studioLight, themeAt, blendLight, resolveTime, moonPhase, sunDir } from './engine/sky.js';
import { disposeTree, paperMaterial, roundRect } from './engine/paper.js';
import { cursorValue, prepareCursors } from './engine/cursors.js';
import { makeCorners } from './engine/corners.js';
import { bayPrint } from './kit/ground.js';
import { KIT } from './kit/index.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export { themeAt };

const FONTS = 'fonts/fonts.css'; // the site's self-hosted faces (Alegreya Sans, Martian Mono)
const STORY_LIMIT = 6;
const deg = Math.PI / 180;

// ---------------------------------------------------------------- validation
function closest(id, list) {
  const d = (a, b) => { const m = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) m[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; };
  return list.slice().sort((a, b) => d(id, a) - d(id, b))[0];
}
export function validateMoment(m) {
  const errors = [];
  if (!m || !Array.isArray(m.pieces)) return ['moment has no "pieces" list'];
  const ids = new Set(), kinds = {};
  let story = 0;
  for (const p of m.pieces) {
    if (!KIT[p.kit]) errors.push(`'${p.kit}' is not in the kit; did you mean '${closest(p.kit, Object.keys(KIT))}'?`);
    if (ids.has(p.id)) errors.push(`two pieces share the id '${p.id}'`);
    ids.add(p.id); kinds[p.id] = p.kit;
    if (!['ground', 'sky'].includes(p.role) && p.kit !== 'walker') story++;
  }
  if (story > STORY_LIMIT) errors.push(`${story} story pieces; the limit is ${STORY_LIMIT}. Cut the weakest one.`);
  if (typeof m.caption !== 'string') errors.push('caption must be a string: your exact words, or ""');
  if (typeof m.place !== 'string') errors.push('place must be a string, e.g. "Golden Gate Bridge, San Francisco"');
  if (typeof m.date !== 'string' || !/^\d{4}-\d{2}(-\d{2})?$/.test(m.date)) errors.push('date must be "YYYY-MM" or "YYYY-MM-DD"');
  for (const p of m.pieces) {
    if (p.kit === 'walker' && !ids.has(p.on)) errors.push(`walker '${p.id}' stands on '${p.on}', which is not a piece`);
    if (p.kit === 'deck-traffic') {
      if (kinds[p.on] !== 'suspension-bridge') errors.push(`deck-traffic '${p.id}' rides in '${p.on}', which is not a bridge deck`);
      const n = (p.cars || []).length;
      if (n < 2 || n > 4) errors.push(`deck-traffic '${p.id}' has ${n} cars; use 2 to 4`);
    }
  }
  if (m.book?.binding === 'side') return errors.concat(validatePanorama(m));
  // fold-flat rule: a standing wall at distance u with height h lies flat towards the open edge, so u + h <= page depth
  const D = m.book?.depth ?? 1, Wd = m.book?.width ?? 2;
  const stand = (id, u, h) => { if (u + h > D + 1e-6) errors.push(`'${id}' would stick out of the closed book (gutter distance ${u} + height ${h} > page depth ${D}); move it toward the gutter or make it shorter`); };
  for (const p of m.pieces) {
    if (p.kit === 'suspension-bridge') stand(p.id, p.halfDepth ?? 0.065, (p.towerH ?? 0.66) + 0.01);
    for (const r of p.rows || []) stand(p.id, r.u, r.h + (r.amp ?? 0.011));
    for (const l of p.layers || []) if (l.u != null) stand(p.id, l.u, l.h ?? 0);
    if (p.kit === 'moon') stand(p.id, p.u, (p.nightH ?? 0.36) + (p.radius ?? 0.05));
    if (p.kit === 'sailboat') {
      stand(p.id, p.u, 0.15 * (p.scale ?? 1));
      const sl = p.slot || [p.x - 0.3, p.x + 0.3];
      if (sl[0] > p.x || sl[1] < p.x) errors.push(`sailboat '${p.id}' sits outside its own slot`);
      if (sl[0] - 0.06 < -Wd / 2 || sl[1] + 0.06 > Wd / 2) errors.push(`sailboat '${p.id}' slot runs off the page`);
    }
    if (p.kit === 'skyline') stand(p.id, p.u, 0.27);
    // deck-traffic: folded boxes collapse with the deck, and the belt lives inside the deck card
  }
  return errors;
}
async function loadMoment(src) {
  const m = typeof src === 'string' ? await (await fetch(src)).json() : src;
  const errors = validateMoment(m);
  if (errors.length) { console.error('[popbook] moment rejected:\n- ' + errors.join('\n- ')); const e = new Error(errors[0]); e.errors = errors; throw e; }
  return m;
}


// ---------------------------------------------------------------- helpers
// Shadow on the imaginary table under soft studio light: a tight contact line, a short penumbra, a drop
// toward the reader and to the right (the key light comes from the back left, by day and by night), and a
// wide faint ambient. A smooth window takes everything to zero well inside the plane, and the alpha is
// dithered so the long faint gradients never band.
// Side-bound panorama (book.binding 'side'): the gutter runs away from the reader. Every standing piece must
// be a mechanism the opening drives: a V-fold layer or V-box that crosses the gutter, something mounted on
// one, a thread, a print, or a tab/slot that stays on one page. Kit pieces describe themselves with
// declare(spec, book) -> { vlayers: [{ x0, theta, gamma, reach: [left, right], height: [left, right] }],
// slots: [{ page, u0, u1, x0, x1 }], on: pieceId }.
function validatePanorama(m) {
  const errors = [];
  const W = m.book.width, D = m.book.depth, ids = new Set(m.pieces.map((p) => p.id));
  const layers = [];
  for (const p of m.pieces) {
    const k = KIT[p.kit];
    if (!k) continue;
    if (!k.panorama) { errors.push(`'${p.id}' uses '${p.kit}', which is not a side-bound mechanism (it would be a wall on one page that nothing lifts)`); continue; }
    const d = k.declare ? k.declare(p, m.book) : {};
    if (d.on && !ids.has(d.on)) errors.push(`'${p.id}' is mounted on '${d.on}', which is not a piece`);
    if (d.on && !layers.length && !m.pieces.some((q) => q.id === d.on)) errors.push(`'${p.id}' has nothing to stand on`);
    for (const v of d.vlayers || []) {
      const tag = `'${p.id}'${v.name ? ' ' + v.name : ''}`;
      const b = Math.min(v.theta, Math.PI - v.theta);
      // tied to both pages: the crease starts on the gutter and both halves reach onto their page
      if (!(v.x0 > -W / 2 && v.x0 < W / 2)) errors.push(`${tag}: the crease must start on the gutter (x0 ${v.x0} is off the page)`);
      if (!(v.reach[0] > 0 && v.reach[1] > 0)) errors.push(`${tag}: a V-fold needs a half on each page (reach ${v.reach})`);
      if (v.gamma + 1e-6 < b) errors.push(`${tag}: corner angle ${(v.gamma * 180 / Math.PI).toFixed(1)} is below the hinge angle ${(b * 180 / Math.PI).toFixed(1)}; it would not stand`);
      // height fits the room: where the layer lies in the closed book
      for (const q of vlayerFootprint(D, v.x0, v.theta, v.gamma, v.reach, v.height)) {
        if (q.x < -W / 2 - 1e-3 || q.x > W / 2 + 1e-3 || q.u > D + 1e-3) { errors.push(`${tag}: folds out of the closed book (${q.side} half reaches x ${q.x.toFixed(3)}, u ${q.u.toFixed(3)}; the page is ${W} x ${D}). Make it shorter or move it`); break; }
      }
      layers.push({ ...v, tag, box: vlayerFootprint(D, v.x0, v.theta, v.gamma, v.reach, v.height) });
    }
    for (const sl of d.slots || []) {
      if (!(sl.u0 > 0.005 && sl.u1 <= D)) errors.push(`'${p.id}': a slot or tab strip must stay on one page (u ${sl.u0} to ${sl.u1}); it may not cross the gutter`);
      if (sl.x0 < -W / 2 - 0.12 || sl.x1 > W / 2) errors.push(`'${p.id}': its slot runs off the page`);
    }
  }
  // layers that fold over each other share their angles, so they fall flat together like dominoes
  for (let i = 0; i < layers.length; i++) for (let j = i + 1; j < layers.length; j++) {
    const A = layers[i], B = layers[j];
    const span = (L) => [Math.min(...L.box.map((q) => q.x)), Math.max(...L.box.map((q) => q.x))];
    const [a0, a1] = span(A), [b0, b1] = span(B);
    const overlap = Math.min(a1, b1) - Math.max(a0, b0) > 1e-3;
    if (overlap && (Math.abs(A.theta - B.theta) > 1e-4 || Math.abs(A.gamma - B.gamma) > 1e-4)) errors.push(`${A.tag} and ${B.tag} fold over each other but have different angles; give them the same theta and gamma`);
  }
  return errors;
}
const SHADOW = { pad: 0.42, side: 0.24, back: 0.17, front: 0.27, lift: 0.016, reach: 0.25 };
function contactShadowTexture(fw, fd, pad, side = false) {
  // offsets are given as (to the right, toward the reader) on screen; map them into the book frame
  const off = (r, t) => (side ? [-t, r] : [r, t]);
  const S = 1280, c = document.createElement('canvas'); c.width = S; c.height = Math.round(S * (fd + 2 * pad) / (fw + 2 * pad));
  const g = c.getContext('2d');
  const k = S / (fw + 2 * pad);
  const rr = (ctx, blur, alpha, grow, dx, dy, r = 0.08) => {
    ctx.filter = blur ? `blur(${blur * k}px)` : 'none'; ctx.fillStyle = `rgba(0,0,0,${alpha})`; // black at low alpha: on the transparent canvas a coloured shadow turns into a glow (premultiplied alpha), and over the paper page it already reads warm
    const x = (pad - grow + dx) * k, y = (pad - grow + dy) * k, w = (fw + 2 * grow) * k, h = (fd + 2 * grow) * k;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, (r + Math.max(0, grow)) * k); ctx.fill();
  };
  // paper under room light: a low, wide shadow that fades out
  rr(g, 0.15, 0.07, 0.03, ...off(0.015, 0.03)); // wide ambient
  rr(g, 0.08, 0.1, 0.0, ...off(0.03, 0.05)); // soft drop, toward the reader and to the right
  rr(g, 0.034, 0.12, 0.0, ...off(0.008, 0.014)); // penumbra
  rr(g, 0.012, 0.22, -0.006, ...off(0.0, 0.002)); // contact
  // window: 1 under the book, 0 at SHADOW.reach beyond its edge
  const m = document.createElement('canvas'); m.width = c.width; m.height = c.height;
  const mg = m.getContext('2d');
  rr(mg, (SHADOW.reach * 0.32), 1, SHADOW.reach * 0.38, ...off(0.01, 0.02), 0.2);
  g.filter = 'none'; g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0);
  // dither the alpha (plus or minus one step) so faint gradients stay smooth on a flat page colour
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 3; i < d.length; i += 4) if (d[i]) d[i] = Math.max(0, Math.min(255, d[i] + (Math.random() * 2.4 - 1.2)));
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
// a board leaf: a slow peel off the page, a quicker swing over the top, a soft landing
const leafEase = (t) => { const a = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; const b = t * t * (3 - 2 * t); return 0.7 * a + 0.3 * b; };

function ensureFonts() {
  if (document.querySelector('link[data-popbook-fonts], link[href$="fonts/fonts.css"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = FONTS; l.dataset.popbookFonts = '1';
  document.head.appendChild(l);
}
const shown = (x) => { for (; x; x = x.parent) if (!x.visible) return false; return true; };

// ---------------------------------------------------------------- mount
export async function mountBook(container, opts = {}) {
  const o = { moment: '/book/moments/golden-gate.json', state: 'auto', background: 'transparent', caption: true, mode: 'home', ao: !window.matchMedia?.('(pointer: coarse)').matches, ...opts };
  let moment = await loadMoment(o.moment);
  if (o.coverTitle !== false && !document.querySelector('link[href$="fonts/fonts.css"]')) ensureFonts(); // the site's faces, for a bare book page
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const still = !!o.still;
  const motion = !reduced && !still;
  prepareCursors();

  // ---- mode: 'home' (the whole book is a door: enter cursor, stronger lean, ribbon hint) or
  // 'detail' (the book is the subject: no enter, a closer, calmer camera)
  let mode = o.mode === 'detail' ? 'detail' : 'home';
  const MODES = {
    home: { enter: true, lean: 0.7, bob: 0.016, sway: 0.035, swayHover: 0.06, frame: null, tilt: 1 },
    detail: { enter: false, lean: 0, bob: 0.008, sway: 0.016, swayHover: 0, frame: 0.88, tilt: 0.6 },
  };
  const M = () => MODES[mode];
  const canEnter = () => M().enter && !!o.onEnter;
  let setTab = false, setRole = false;
  function applyModeAttrs() {
    container.dataset.mode = mode;
    if (canEnter()) {
      if (!container.hasAttribute('tabindex')) { container.tabIndex = 0; setTab = true; }
      if (!container.hasAttribute('role')) { container.setAttribute('role', 'button'); setRole = true; }
    } else {
      if (setTab) { container.removeAttribute('tabindex'); setTab = false; }
      if (setRole) { container.removeAttribute('role'); setRole = false; }
    }
  }

  // ---- DOM
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  if (o.label) container.setAttribute('aria-label', o.label);
  applyModeAttrs();
  const stage = document.createElement('div');
  stage.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
  container.appendChild(stage);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: still });
  { // no GPU (SwiftShader, llvmpipe: headless browsers, some VMs): the book would crawl, so the page keeps its poster
    const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software/i.test(name)) { renderer.dispose(); stage.remove(); throw new Error('software WebGL (' + name + ')'); }
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false; // count every pass of a frame (debugState)
  if (o.background && o.background !== 'transparent') renderer.setClearColor(new THREE.Color(o.background), 1);
  else renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;';
  stage.appendChild(canvas);

  let captionEl = null, captionLine = null, captionStamp = null;
  function setCaption(m) {
    if (!captionEl) return;
    const has = m.caption && m.caption.trim();
    captionLine.textContent = has ? m.caption : '[your line]';
    captionLine.style.opacity = has ? '' : '.3';
    if (m.captionStatus) captionLine.dataset.status = m.captionStatus; else delete captionLine.dataset.status;
    captionStamp.textContent = m.stamp || '';
  }
  if (o.caption) {
    ensureFonts();
    captionEl = document.createElement('div');
    captionEl.style.cssText = 'position:absolute;left:0;right:0;bottom:0;text-align:center;pointer-events:none;padding:0 16px 6px;color:inherit;';
    captionLine = document.createElement('div');
    captionLine.style.cssText = "font-family:'Alegreya Sans',sans-serif;font-weight:400;font-size:clamp(20px,2vw,23px);line-height:1.4;";
    captionStamp = document.createElement('div');
    captionStamp.style.cssText = "font-family:'Martian Mono',ui-monospace,monospace;font-stretch:87.5%;font-size:13px;letter-spacing:.05em;text-transform:uppercase;opacity:.55;margin-top:8px;";
    captionEl.append(captionLine, captionStamp);
    container.appendChild(captionEl);
    setCaption(moment);
  }

  // ---- scene
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
  const root = new THREE.Group(); // the book frame: +x north, +z east (geographic, see sky.js)
  scene.add(root);

  // ---- soft ambient occlusion (paper pieces darken where they meet the page)
  let composer = null, gtao = null;
  if (o.ao) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    gtao = new GTAOPass(scene, camera, 1, 1, undefined, { radius: 0.16, distanceExponent: 1.4, thickness: 0.6, scale: 1.0, samples: 16, distanceFallOff: 1.0 }, { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    gtao.blendIntensity = 0.85;
    // AO sees only solid paper: glows, light pools, AO decals, vellum and the table shadow are hidden from its depth pass
    const gtaoRender = gtao.render.bind(gtao);
    gtao.render = (...args) => {
      const hidden = [];
      scene.traverse((m) => {
        if (!m.visible) return;
        const mat = Array.isArray(m.material) ? m.material[0] : m.material;
        if (m.isSprite || (mat && mat.transparent) || m.isLineSegments || m.userData.noAO) { m.visible = false; hidden.push(m); }
      });
      gtaoRender(...args);
      for (const m of hidden) m.visible = true;
    };
    composer.addPass(gtao);
    composer.addPass(new OutputPass());
  }
  const draw = () => (composer ? composer.render() : renderer.render(scene, camera));

  // ---- light (lives in the book frame)
  const key = new THREE.DirectionalLight(0xffffff, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -1.75, right: 1.75, top: 1.75, bottom: -1.75, near: 0.5, far: 14 });
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.012;
  key.shadow.radius = 6; key.shadow.blurSamples = 24;
  // the key, sky and fill lights live in a rig turned like the old three-quarter book (yaw -14), so the
  // light keeps its place relative to the reader whichever way the book is bound
  const rig = new THREE.Group(); scene.add(rig);
  rig.add(key, key.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1); rig.add(hemi);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4); fill.position.set(0.3, 2.2, 5); rig.add(fill, fill.target);
  const warm = new THREE.PointLight(0xffd08a, 0, 1.25, 1.6); warm.position.set(-0.05, 0.4, 0.26); root.add(warm);
  // studio rim (day only): a cool kicker from the back right that picks out the paper edges
  const rim = new THREE.DirectionalLight(0xeef2ff, 0); rim.position.copy(sunDir(38 * deg, 322 * deg)).multiplyScalar(6); rig.add(rim, rim.target);

  // ---------------------------------------------------------------- world: everything that belongs to one moment
  // building a spread is the one long job (ground prints, a dozen pieces, shaders): it yields to the browser after
  // each step, so a phone keeps scrolling and the tasks stay short. Nothing is on stage until swapWorld.
  const breath = () => new Promise((r) => setTimeout(r, 0));
  async function buildWorld(m) {
    const pal = m.palette;
    const group = new THREE.Group();
    const bookSpec = { ...m.book, cover: pal.cover, core: pal.core, stripes: pal.stripes, ribbon: m.book?.ribbon, title: o.coverTitle === false ? null : (o.coverTitle ?? 'A pop-up book'), author: o.coverAuthor ?? '', glimpseFill: pal.ocean };
    const g = m.ground || {};
    // ground printer: 'bay' by default; a kit may register 'ground:<preset>': { print(page, book, ground, palette, mask) }
    const print = KIT['ground:' + g.preset]?.print || bayPrint;
    const prints = { near: print('near', bookSpec, g, pal), far: print('far', bookSpec, g, pal) };
    await breath();
    prints.nearWater = print('near', bookSpec, g, pal, true); prints.farWater = print('far', bookSpec, g, pal, true);
    await breath();
    const book = buildBook(bookSpec, prints);
    await breath();
    group.add(book.group);
    // the two lower outer corners of the near page, which curl for prev / next (detail view)
    const side = bookSpec.binding === 'side';
    const corners = makeCorners(book, prints, bookSpec, { layout: side ? 'side' : 'top' });
    group.add(corners.group);
    const lamps = [], parts = [], dynamics = [], tickers = [], wavers = [], dialTicks = [], lightables = [], drags = [], pokes = [], dials = [], nudges = [], proxies = [];
    const ctx = { palette: pal, scene: group, lamp: (fn) => lamps.push(fn), pieces: {}, moonPhase: moonPhase(resolveTime('auto', o.date)), book: bookSpec, sky: skyHooks };
    if (g.nightDim) { // opt-in: a pale ground printed for day darkens with the lamps at night (day untouched)
      const gm = new Set(); group.traverse((x) => { for (const mt of [].concat(x.material || [])) if (mt.map && (mt.map === prints.near || mt.map === prints.far)) gm.add(mt); });
      lamps.push((k) => { for (const mt of gm) mt.color.setScalar(1 - g.nightDim * k); });
    }
    for (const p of m.pieces) {
      await breath();
      const built = KIT[p.kit].build(ctx, p);
      built.spec = p;
      ctx.pieces[p.id] = built;
      for (const part of built.parts) {
        part.obj.matrixAutoUpdate = false;
        if (part.ao) part.obj.traverse((x) => { if (x.userData.aoBase != null) part.aoMeshes = (part.aoMeshes || []).concat(x); });
        group.add(part.obj);
        parts.push(part);
      }
      if (built.dynamic) dynamics.push(built.dynamic);
      if (built.tick) tickers.push(built.tick);
      if (built.tick && built.dial) dialTicks.push(built.tick); // ticked through a page turn too, so a peek settles as its page folds
      if (built.setLight) lightables.push(built.setLight);
      for (const d of [].concat(built.drag || [])) drags.push(d);
      for (const pk of built.pokes || []) pokes.push(pk);
      if (built.dial) dials.push(built.dial);
      if (built.nudge) built.dial ? nudges.unshift(built.nudge) : nudges.push(built.nudge); // the sky dial's peek goes first: it is the piece readers miss
      for (const px of built.proxies || []) proxies.push(px);
      if (built.waver) wavers.push(built.waver); // { obj, base }: a forearm on a brad the home page can wave (greet)
    }
    const tapTargets = new Set();
    if (m.tap) for (const id of [].concat(m.tap.on)) for (const x of (ctx.pieces[id]?.targets || [])) tapTargets.add(x);
    const dragOf = new Map(), pokeOf = new Map(), hoverOf = new Map();
    for (const d of drags) for (const x of d.targets) { dragOf.set(x, d); if (d.hover) hoverOf.set(x, d.hover); }
    for (const pk of pokes) for (const x of pk.targets) { pokeOf.set(x, pk.run); if (pk.hover) hoverOf.set(x, pk.hover); }
    // day is the studio light (sky.js studioLight); the moment's light block sets the shadow's softness and the lamp pool
    const lt0 = m.light || {};
    const LD = studioLight();
    const LN = themeLight('night');
    await breath();
    const waterMats = new Set(), pickables = [];
    group.traverse((x) => {
      for (const mat of [].concat(x.material || [])) if (mat.userData?.water) waterMats.add(mat);
      if (x.isMesh && x.userData.aoBase == null && ![].concat(x.material).some((mt) => mt.blending === THREE.AdditiveBlending)) pickables.push(x);
    });
    // contact shadow on an imaginary table
    const fw = bookSpec.width + 2 * 0.045, fd = 2 * (bookSpec.depth + 0.045), pad = SHADOW.pad;
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(fw + 2 * pad, fd + 2 * pad), new THREE.MeshBasicMaterial({ map: contactShadowTexture(fw, fd, pad, side), transparent: true, depthWrite: false, opacity: 1 }));
    shadowPlane.rotation.x = -Math.PI / 2;
    const shadowGroup = new THREE.Group(); shadowGroup.add(shadowPlane);
    const tableY = book.bottom - 0.002; // the table touches the cover (the float lifts the book off it)
    shadowPlane.position.y = tableY;
    return {
      m, pal, group, book, bookSpec, prints, corners, parts, dynamics, tickers, wavers, dialTicks, lightables, lamps, drags, dragOf, pokeOf, hoverOf, tapTargets, pickables, dials, side,
      nudges, proxies, nudgePlan: null, nudgeRounds: 0, LD, LN, pool: lt0.pool ?? 1, poolAt: lt0.poolAt || [-0.05, 0.4, 0.26],
      shadowSoft: side ? { radius: lt0.shadowRadius ?? 14, intensity: lt0.shadowIntensity ?? 0.6, half: 1.35 } : { radius: 6, intensity: 1, half: 1.75 },
      lightYaw: (side ? (m.camera?.lightYaw ?? -14) : (m.camera?.yaw ?? -14)) * deg,
      waterMats: [...waterMats], pieces: ctx.pieces, shadowGroup, shadowPlane, tableY, fw, fd, pad,
      REST: (m.book?.restAngle ?? 150) * deg, spread: new Spread(bookSpec.depth).set(Math.PI), elShut: (m.camera?.shutElevation ?? 44) * deg,
      yaw: (m.camera?.yaw ?? -14) * deg, el: (m.camera?.elevation ?? 27) * deg, pts: [], ptsUp: [], spts: [],
      fit: null,
    };
  }
  let W = null; // the world on stage
  let F = null; // a page turn in progress: { from, to, dir, t0, dur, leaf, done }

  // ---- mechanics: a world is posed by its own spread angle; 'nearMoving' turns the world so its far
  // page stays flat and its near page swings instead (the leaf of a page turn)
  const FLAT = new Spread(1).set(Math.PI);
  function applyFrames(w = W) {
    const sp = w.spread;
    for (const part of w.parts) {
      part.frame(sp, part.obj.matrix);
      part.obj.matrixWorldNeedsUpdate = true;
      if (part.aoMeshes) for (const x of part.aoMeshes) x.material.opacity = x.userData.aoBase * sp.upright ** 3;
    }
  }
  let shadowDirty = 3; // 0 clean, 1 slow movers (update every 8th frame), 2 fast (every 2nd), 3 now
  const wantShadow = (lvl) => { shadowDirty = Math.max(shadowDirty, lvl); };
  function pose(w, p, nearMoving = false) {
    w.spread.set(p);
    w.book.update(w.spread);
    applyFrames(w);
    for (const d of w.dynamics) d(w.spread);
    w.group.rotation.x = nearMoving ? -(Math.PI - p) : 0;
    wantShadow(3);
  }
  const applyMechanics = (p) => pose(W, p);
  function setPiecesVisible(w, v) { for (const c of w.group.children) if (c !== w.book.group) c.visible = v; }

  // ---- light: two states, Day and Night, with a short blended relight between them
  let theme = o.theme === 'day' || o.theme === 'night' ? o.theme
    : themeAt(o.time && o.time !== 'auto' ? resolveTime(o.time, o.date) : new Date());
  // the sky is one number: 0 = Day, 1 = Night. setTheme animates it; a sky dial in the book can turn it by hand
  const DAY = studioLight(), NIGHT = themeLight('night');
  const lightAt = (k) => { const D = W?.LD || DAY, N = W?.LN || NIGHT; return k <= 0 ? D : k >= 1 ? N : blendLight(D, N, k); };
  let skyK = theme === 'night' ? 1 : 0, skyHeld = false;
  let Lcur = lightAt(skyK), lightAnim = null;
  // a peek's lean: the sky k the light shows while a peek has it leaning (null when it shows skyK). A relight or a page
  // turn that starts mid-peek hands the lean to leanFade, which eases it out across that relight or turn (no freeze, no
  // snap), and the rest of that peek is muted (peekMuted) so it cannot pull the light back.
  let leanK = null, peekMuted = false, leanFade = null; // leanFade: { off, t0, dur }, off = shown k - skyK when it began
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const shownK = (now = performance.now()) => {
    if (leanK != null) return leanK;
    if (!leanFade) return skyK;
    return clamp01(skyK + leanFade.off * (1 - easeInOutQuad(clamp01((now - leanFade.t0) / leanFade.dur))));
  };
  function releaseLean(dur, t0 = performance.now()) {
    const off = shownK(t0) - skyK;
    if (leanK != null) peekMuted = true;
    leanK = null;
    leanFade = Math.abs(off) > 1e-4 ? { off, t0, dur } : null;
  }
  // what a kit dial may do: preview(k) while the reader turns it, commit(theme) when they let go
  const skyHooks = {
    get k() { return skyK; },
    preview(k) {
      if (lightAnim) { const d = lightAnim.done; lightAnim = null; d(); }
      leanK = null; leanFade = null;
      skyHeld = true; skyK = Math.max(0, Math.min(1, k)); Lcur = lightAt(skyK); applyLight(Lcur); kick();
    },
    // peek(a): the light leans a (0..1) of the way toward the other theme and back, without changing the theme. The
    // dial's hint after every page turn uses it, so the reader sees that the dial is what turns day into night.
    peek(a) {
      if (a <= 1e-3) peekMuted = false; // that peek is over
      if (skyHeld || lightAnim || F || peekMuted) return; // a relight or a page turn owns the light
      const k = theme === 'night' ? 1 - a : a;
      leanK = a > 1e-4 ? k : null; leanFade = null;
      Lcur = lightAt(k); applyLight(Lcur); // no kick(): it runs inside the frame loop, and a kick there resets the clock
    },
    commit(name) {
      skyHeld = false;
      const changed = name !== theme;
      const p = setTheme(name, { force: true });
      if (changed) o.onThemeChange?.(name);
      return p;
    },
  };
  const cWhite = new THREE.Color('#ffffff'), cWarmFill = new THREE.Color('#ffc59a'), FOIL_NIGHT = new THREE.Color('#F4DDA6'), FOIL_DAY = new THREE.Color('#3A2A17'), FOIL_GOLD = new THREE.Color('#B8954E');
  function lightWorld(w, L) {
    for (const fn of w.lamps) fn(L.lamps);
    const sheen = 0.17 * L.golden * (1 - 0.6 * L.night);
    for (const mt of w.waterMats) { mt.emissive.set('#ffbe6e'); mt.emissiveIntensity = sheen * (mt.emissiveMap ? 1 : 0.8); }
    for (const fn of w.lightables) fn(L);
    for (const d of w.dials) d.set(skyK, skyHeld);
    if (w.book.titleMat) { // the foil: espresso by day (dark on the kraft board), catching the light at night
      const tm = w.book.titleMat;
      tm.color.copy(FOIL_DAY).lerp(FOIL_GOLD, L.night); tm.emissive.copy(FOIL_NIGHT); tm.emissiveIntensity = 0.95 * L.night; tm.roughness = 0.45 - 0.15 * L.night;
    }
  }
  // the lamp pool (night): full when the spread lies open, off while the book is shut or a leaf is up (turnUp), and
  // after a landing or a swap it fades in over POOL_IN ms instead of switching on in one frame (a light fade, so
  // reduced motion keeps it too)
  const POOL_IN = 400;
  let poolT0 = -1e9;
  const poolLevel = (L, turnUp = 0, now = performance.now()) => {
    if (!W) return 0.8 * L.lamps;
    const t = clamp01((now - poolT0) / POOL_IN);
    return 0.8 * L.lamps * W.pool * (1 - 0.92 * turnUp) * Math.max(0, (W.spread.upright - 0.6) / 0.4) ** 2 * t * t * (3 - 2 * t);
  };
  let shadowK = 1;
  function applyLight(L) {
    key.position.copy(L.keyDir).multiplyScalar(6);
    key.color.copy(L.keyColor); key.intensity = L.keyI;
    hemi.color.copy(L.hemiSky); hemi.groundColor.copy(L.hemiGround); hemi.intensity = L.hemiI;
    // studio bounce from the camera side
    fill.intensity = 0.4 + 0.5 * L.day + 0.35 * L.night + 1.1 * L.golden;
    fill.color.copy(L.hemiSky).lerp(cWhite, 0.5).lerp(cWarmFill, L.golden * 0.7);
    warm.intensity = poolLevel(L);
    rim.intensity = L.rimI ?? 0;
    renderer.toneMappingExposure = (L.exposure ?? 1) + 0.32 * L.night + 0.3 * L.twilight + 0.25 * L.golden;
    shadowK = 1 - 0.18 * L.night;
    lightWorld(W, L);
    if (F) { lightWorld(F.to, L); F.leaf.light(L.lamps); }
    container.style.setProperty('--book-sky', '#' + L.backdrop.getHexString());
    o.onTint?.(L);
    wantShadow(2);
  }
  let themePending = null;
  function setTheme(name, { instant = false, force = false } = {}) {
    if (name === 'light') name = 'day'; else if (name === 'dark') name = 'night'; // the site's switch may say light / dark
    if (name !== 'day' && name !== 'night') return Promise.reject(new Error(`theme must be 'day' or 'night', not '${name}'`));
    const to = name === 'night' ? 1 : 0;
    // already there (or on the way): nothing to redo. This is what the host's echo of onThemeChange hits.
    if (!force && name === theme && !skyHeld) return lightAnim && lightAnim.to === to ? themePending : Promise.resolve(name);
    theme = name;
    container.dataset.theme = name; container.dataset.phase = name;
    if (lightAnim) { const d = lightAnim.done; lightAnim = null; d(); }
    skyHeld = false;
    if (!motion || instant || !visible) { leanK = null; leanFade = null; skyK = to; Lcur = lightAt(skyK); applyLight(Lcur); wantShadow(3); if (W) snapshotGlimpse(W); kick(); return Promise.resolve(name); }
    // the time it takes follows how far the sky has to turn (a dial let go halfway relights in half the time)
    const dur = (o.relight ?? 900) * Math.max(0.35, Math.abs(to - skyK));
    releaseLean(dur); // mid-peek: the lean eases out across the relight instead of snapping back on its first frame
    themePending = new Promise((res) => { lightAnim = { from: skyK, to, t0: performance.now(), dur, done: () => res(name) }; kick(); });
    return themePending;
  }

  // ---- camera fit: the book and its pieces inside the frame, and the table shadow inside the canvas
  function measure(w) {
    // measure in the book's own frame (an axis-aligned box of the rotated book would overshoot), then rotate
    const pts = [], ptsUp = [], spts = [];
    const yaw0 = root.rotation.y;
    pose(w, w.REST);
    root.rotation.y = 0; root.updateMatrixWorld(true);
    const corners = (bb, out) => { for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) out.push(new THREE.Vector3(x, y, z)); };
    corners(new THREE.Box3().setFromObject(w.book.group), pts);
    for (const part of w.parts) if (!part.noFit && !part.ao) { const bb = new THREE.Box3().setFromObject(part.obj); if (!bb.isEmpty()) corners(bb, pts); }
    // the cover standing upright mid-opening: the camera eases back to keep it in frame
    pose(w, Math.PI / 2);
    const upBox = new THREE.Box3().setFromObject(w.book.far);
    // the shut book: on arrival the camera holds closer on the cover (its title), then pulls back as it opens
    pose(w, 0);
    const shutBox = new THREE.Box3().setFromObject(w.book.group);
    root.rotation.y = yaw0; root.updateMatrixWorld(true);
    const rot = new THREE.Matrix4().makeRotationY(w.yaw);
    for (const p of pts) { p.applyMatrix4(rot); ptsUp.push(p.clone()); }
    const tmp = []; corners(upBox, tmp); for (const p of tmp) ptsUp.push(p.applyMatrix4(rot));
    const ptsShut = []; corners(shutBox, ptsShut); for (const p of ptsShut) p.applyMatrix4(rot); w.ptsShut = ptsShut;
    // where the table shadow has faded to nothing
    const y = w.tableY - SHADOW.lift;
    if (w.side) { for (const x of [-w.fw / 2 - SHADOW.front, w.fw / 2 + SHADOW.back]) for (const z of [-w.fd / 2 - SHADOW.side, w.fd / 2 + SHADOW.side]) spts.push(new THREE.Vector3(x, y, z).applyMatrix4(rot)); }
    else for (const x of [-w.fw / 2 - SHADOW.side, w.fw / 2 + SHADOW.side]) for (const z of [-w.fd / 2 - SHADOW.back, w.fd / 2 + SHADOW.front]) spts.push(new THREE.Vector3(x, y, z).applyMatrix4(rot));
    w.pts = pts; w.ptsUp = ptsUp; w.spts = spts;
    pose(w, w.REST);
  }
  let size = { w: 1, h: 1 };
  function placeCamera(target, dist, el, yaw = 0, pitch = 0, bob = 0) {
    const e = el + pitch;
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(e) * dist, target.y + Math.sin(e) * dist - bob, target.z + Math.cos(yaw) * Math.cos(e) * dist);
    camera.lookAt(target.x, target.y - bob, target.z);
    camera.updateMatrixWorld(true);
  }
  function solveFit(w, P, S, xOverride, elOverride) {
    const elFit = elOverride ?? w.el;
    const reserve = captionEl ? Math.min(110, Math.max(70, captionEl.offsetHeight + 18)) : Math.max(8, 0.025 * size.h);
    const yBot = -1 + (2 * reserve) / size.h, yTop = mode === 'detail' ? 0.93 : 0.9;
    const xLim = xOverride ?? M().frame ?? (size.w < 520 ? 0.94 : (w.m.camera?.frame ?? 0.8));
    const sLim = 0.985; // the shadow's faded edge stays inside the canvas
    const target = new THREE.Vector3(0, 0.15, 0);
    let dist = 6;
    const v = new THREE.Vector3();
    const span = (Q) => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const p of Q) { v.copy(p).project(camera); a = Math.min(a, v.x); b = Math.max(b, v.x); c = Math.min(c, v.y); d = Math.max(d, v.y); } return [a, b, c, d]; };
    for (let it = 0; it < 5; it++) {
      let lo = 1, hi = 40;
      for (let k = 0; k < 28; k++) {
        const mid = (lo + hi) / 2; placeCamera(target, mid, elFit);
        const [a, b, c, d] = span(P), [sa, sb, sc] = span(S);
        const ok = b - a <= 2 * xLim && d - c <= yTop - yBot && sa >= -sLim && sb <= sLim && sc >= -sLim;
        ok ? (hi = mid) : (lo = mid);
      }
      dist = hi; placeCamera(target, dist, elFit);
      const [a, b, c, d] = span(P);
      const halfH = Math.tan((camera.fov * deg) / 2) * dist, halfW = halfH * camera.aspect;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      target.addScaledVector(right, ((a + b) / 2) * halfW).addScaledVector(up, ((c + d) / 2 - (yTop + yBot) / 2) * halfH);
    }
    return { target, dist };
  }
  const phoneDetailNow = () => mode === 'detail' && size.w < 520;
  const _sv = new THREE.Vector3();
  const spanOf = (Q) => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const q of Q) { _sv.copy(q).project(camera); a = Math.min(a, _sv.x); b = Math.max(b, _sv.x); c = Math.min(c, _sv.y); d = Math.max(d, _sv.y); } return [a, b, c, d]; };
  function fitWorld(w) {
    w.fit = { base: solveFit(w, w.pts, w.spts), up: solveFit(w, w.ptsUp, w.spts) };
    if (phoneDetailNow()) {
      // a phone's detail view: the canvas is the screen, so the camera comes in a fifth closer (the book's hidden outer
      // edges and the shadow's faded sides may run off), then the view slides so the standing pieces stay under the
      // top edge and the shadow's foot stays above the caption
      const f = w.fit.base; f.dist *= 0.8;
      placeCamera(f.target, f.dist, w.el);
      const pTop = spanOf(w.pts)[3], sBot = spanOf(w.spts)[2];
      let shift = 0; if (sBot < -0.98) shift = -0.98 - sBot; if (pTop + shift > 0.93) shift = 0.93 - pTop;
      const halfH = Math.tan((camera.fov * deg) / 2) * f.dist, up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      f.target.addScaledVector(up, -shift * halfH);
    }
    // shut: the cover fills a bit more than half the width (more on a phone), never closer than the open fit's half
    const shut = solveFit(w, w.ptsShut, w.ptsShut, size.w < 520 ? 0.78 : 0.56, w.elShut);
    shut.dist = Math.max(shut.dist, w.fit.base.dist * 0.55);
    w.fit.shut = shut;
    return w.fit;
  }
  // the cover window's glimpse: one still of the open spread, rendered once per moment and theme into a small
  // target and printed on the first board behind the cut (no per-frame cost)
  const glimpseCam = new THREE.PerspectiveCamera(24, 1, 0.05, 30);
  let skyTex = null;
  function skyBacking(L) {
    const c = skyTex?.image || document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'), n = L.night;
    const top = new THREE.Color('#9FC0D8').lerp(new THREE.Color('#1E2B45'), n), mid = new THREE.Color('#CFE0EA').lerp(new THREE.Color('#3B4766'), n), low = new THREE.Color('#F2EAD8').lerp(new THREE.Color('#4A4F66'), n);
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#' + top.getHexString()); gr.addColorStop(0.55, '#' + mid.getHexString()); gr.addColorStop(1, '#' + low.getHexString());
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    if (!skyTex) { skyTex = new THREE.CanvasTexture(c); skyTex.colorSpace = THREE.SRGBColorSpace; } else skyTex.needsUpdate = true;
    return skyTex;
  }
  // o.glimpse = { day, night } image URLs: one fixed picture in the window whatever page is open (one book, one
  // cover), so the home poster, which shows the closed cover, never has to change when a moment is added.
  // The pictures come from tools/launch/glimpse.mjs (debugGlimpseShot below); without o.glimpse the still is live.
  const fixedGlimpse = {};
  if (o.glimpse) for (const t of ['day', 'night']) if (o.glimpse[t]) new THREE.TextureLoader().load(o.glimpse[t], (tx) => { tx.colorSpace = THREE.SRGBColorSpace; fixedGlimpse[t] = tx; if (W && t === theme) { snapshotGlimpse(W); kick(); } });
  function snapshotGlimpse(w) {
    const gm = w.book.glimpse;
    // not mid-turn: glimpseRender re-poses the world flat, which would undo the turn's pose for one drawn frame (the
    // window is shut away during a turn anyway; endTurn takes the new page's still)
    if (!gm || F) return;
    if (o.glimpse) {
      const tx = fixedGlimpse[theme];
      if (tx && gm.material.map !== tx) { gm.material.map = tx; gm.material.toneMapped = false; gm.material.color.set('#ffffff'); gm.material.needsUpdate = true; }
      return;
    }
    if (!w.glimpseRT) w.glimpseRT = new THREE.WebGLRenderTarget(440, Math.round(440 / w.book.glimpseAspect), { samples: 4, type: THREE.HalfFloatType });
    glimpseRender(w, () => { renderer.setRenderTarget(w.glimpseRT); renderer.clear(); renderer.render(scene, glimpseCam); });
    if (gm.material.map !== w.glimpseRT.texture) { gm.material.map = w.glimpseRT.texture; gm.material.color.set('#ffffff'); gm.material.needsUpdate = true; }
    wantShadow(3);
  }
  // the still's camera, pose and sky around one render call (the live snapshot, or the export below)
  function glimpseRender(w, draw) {
    const g = w.m.cover?.glimpse || {};
    const at = new THREE.Vector3(...(g.at || [0.1, 0.36, 0])), from = new THREE.Vector3(...(g.from || [-2.6, 0.62, 0]));
    root.updateMatrixWorld(true);
    glimpseCam.fov = g.fov ?? 22; glimpseCam.aspect = w.book.glimpseAspect; glimpseCam.updateProjectionMatrix();
    glimpseCam.position.copy(root.localToWorld(from)); glimpseCam.lookAt(root.localToWorld(at)); glimpseCam.updateMatrixWorld(true);
    const keepPhi = w.spread.phi;
    pose(w, w.REST);
    // the page stays (it is the ground in the still); the table shadow, the page corners and the fog lever's
    // bank (pull-tab pieces) are left out, so the arch shows the scene, not a white band
    const hide = [w.shadowGroup, w.corners.group];
    for (const pc of w.m.pieces) if (pc.kit === 'fog-lever') for (const part of w.pieces[pc.id]?.parts || []) hide.push(part.obj);
    const was = hide.map((o) => o.visible); hide.forEach((o) => { o.visible = false; });
    // a sky behind it: a soft gradient in the day sky's colour, or the night sky
    const prevBg = scene.background;
    scene.background = skyBacking(Lcur);
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    renderer.shadowMap.needsUpdate = true;
    const out = draw();
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha); // the still must leave the live canvas as it found it (transparent)
    scene.background = prevBg;
    hide.forEach((o, i) => { o.visible = was[i]; });
    pose(w, keepPhi);
    return out;
  }
  // soft studio light for side-bound spreads: a wider blur, a lighter shadow, a tighter shadow box
  function worldShadowAndLamp() {
    const sh = W.shadowSoft;
    key.shadow.radius = sh.radius; key.shadow.intensity = sh.intensity;
    Object.assign(key.shadow.camera, { left: -sh.half, right: sh.half, top: sh.half, bottom: -sh.half });
    key.shadow.camera.updateProjectionMatrix();
    warm.position.set(...W.poolAt);
    wantShadow(3);
  }
  // small things stay easy to hit: every hit proxy covers at least MIN_HIT css px on screen
  const MIN_HIT = 40;
  function scaleProxies(w) {
    if (!w?.proxies.length || size.w < 2) return;
    const a = new THREE.Vector3(0, 0, 0).applyMatrix4(root.matrixWorld).project(camera), b = new THREE.Vector3(0, 0, 0.1).applyMatrix4(root.matrixWorld).project(camera), c = new THREE.Vector3(0.1, 0, 0).applyMatrix4(root.matrixWorld).project(camera);
    const px = (u, v) => Math.hypot((u.x - v.x) * size.w / 2, (u.y - v.y) * size.h / 2);
    const ppu = Math.max(px(a, b), px(a, c)) / 0.1;
    for (const pr of w.proxies) pr.mesh.scale.setScalar(Math.max(1, MIN_HIT / (pr.size * ppu)));
  }
  function fit() {
    fitWorld(W);
    if (F) fitWorld(F.to);
    root.updateMatrixWorld(true);
    placeCamera(W.fit.base.target, W.fit.base.dist, W.el);
    scaleProxies(W); if (F) scaleProxies(F.to);
    if (captionEl) {
      const v = new THREE.Vector3();
      let lowest = Infinity;
      for (const p of W.pts) { v.copy(p).project(camera); lowest = Math.min(lowest, v.y); }
      const px = ((1 - lowest) / 2) * size.h;
      captionEl.style.top = Math.min(size.h - captionEl.offsetHeight, px + 10) + 'px';
      captionEl.style.bottom = 'auto';
    }
  }
  function resize() {
    const r = container.getBoundingClientRect();
    size = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
    renderer.setSize(size.w, size.h, false);
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(size.w, size.h); }
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    fit();
    kick();
  }

  function dropWorld(w) { root.remove(w.group); scene.remove(w.shadowGroup); disposeTree(w.group); disposeTree(w.shadowGroup); w.glimpseRT?.dispose(); }
  // put a built world on stage at once (and free the old one)
  function swapWorld(next) {
    if (W) dropWorld(W);
    W = next;
    root.rotation.y = W.yaw; rig.rotation.y = W.lightYaw;
    root.add(W.group);
    W.shadowGroup.rotation.y = W.yaw; scene.add(W.shadowGroup);
    camera.fov = W.m.camera?.fov ?? 32; camera.updateProjectionMatrix();
    warm.color.set(W.pal.lamp || '#ffd08a');
    worldShadowAndLamp();
    measure(W);
    pose(W, phi);
    leanK = null; leanFade = null; peekMuted = false;
    Lcur = lightAt(skyK);
    applyLight(Lcur);
    if (size.w > 1) fit();
    snapshotGlimpse(W);
  }

  // ---- page turn: one board leaf swings over the gutter. The old spread's pieces fold flat between
  // the lifting leaf and the page it falls onto; the new spread's pieces stand up between the page it
  // left and the leaf as it lands. Both are the same parallel-fold mechanics, driven by the leaf angle.
  function faceGeometry(page, Wd, D, R, flip) {
    const sh = page === 'near' ? roundRect(-Wd / 2, -D, Wd / 2, 0, R, [1, 1, 0, 0]) : roundRect(-Wd / 2, 0, Wd / 2, D, R, [0, 0, 1, 1]);
    const bx = page === 'near' ? [-Wd / 2, -D, Wd / 2, 0] : [-Wd / 2, 0, Wd / 2, D];
    const g = new THREE.ShapeGeometry(sh, 10);
    const pos = g.attributes.position, uv = g.attributes.uv, uv1 = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      uv.setXY(i, (x - bx[0]) / (bx[2] - bx[0]), (y - bx[1]) / (bx[3] - bx[1]));
      uv1[i * 2] = x * 2.2; uv1[i * 2 + 1] = y * 2.2;
    }
    g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    g.rotateX(-Math.PI / 2);
    if (flip) g.rotateX(Math.PI);
    return { g, sh };
  }
  function makeLeaf(from, to, dir) {
    const Wd = from.bookSpec.width, D = from.bookSpec.depth, b = from.book.board, R = from.book.R;
    const start = dir === 'next' ? 'near' : 'far', end = dir === 'next' ? 'far' : 'near';
    const inner = new THREE.Group();
    // the board itself, lying exactly where the top board of the starting page block is
    const { sh } = faceGeometry(start, Wd, D, R, false);
    const bodyGeo = new THREE.ExtrudeGeometry(sh, { depth: b - 0.0008, bevelEnabled: false, curveSegments: 10 });
    bodyGeo.rotateX(-Math.PI / 2); bodyGeo.translate(0, -b + 0.0004, 0);
    const body = new THREE.Mesh(bodyGeo, [from.book.coreMat, from.book.topSkin[start].material[1]]);
    const front = new THREE.Mesh(faceGeometry(start, Wd, D, R, false).g, paperMaterial('#fff', { map: from.prints[start] }));
    front.position.y = 0.0003;
    const back = new THREE.Mesh(faceGeometry(end, Wd, D, R, true).g, paperMaterial('#fff', { map: to.prints[end] }));
    back.position.y = -b - 0.0003;
    const dim = (lamps) => { for (const [mesh, w] of [[front, from], [back, to]]) if (w.m.ground?.nightDim) mesh.material.color.setScalar(1 - w.m.ground.nightDim * lamps); }; // the turning leaf matches its dimmed page
    dim(Lcur.lamps);
    for (const m of [body, front, back]) { m.castShadow = true; m.receiveShadow = true; inner.add(m); }
    inner.position.y = b / 2;
    const pivot = new THREE.Group(); pivot.position.y = -b / 2; pivot.add(inner);
    return {
      pivot,
      set(th) { pivot.rotation.x = dir === 'next' ? -th : th; },
      light: dim, // a relight mid-turn keeps the leaf in step with its pages
      dispose() { bodyGeo.dispose(); for (const m of [front, back]) { m.geometry.dispose(); m.material.dispose(); } },
    };
  }
  function startTurn(next, dir) {
    return new Promise((res) => {
      const from = W, to = next;
      root.add(to.group);
      measure(to); fitWorld(to);
      lightWorld(to, Lcur);
      const fromNear = dir === 'next', toNear = dir === 'prev'; // which world swings its near page
      for (const [w, nearMoving] of [[from, fromNear], [to, toNear]]) {
        if (nearMoving) { w.book.near.visible = false; w.book.spine.visible = false; w.book.spine.userData.off = true; } else w.book.far.visible = false;
      }
      const leaf = makeLeaf(from, to, dir);
      root.add(leaf.pivot);
      F = { from, to, dir, t0: 0, dur: o.turnMs ?? 1150, leaf, fromNear, toNear, done: res };
      poseTurn(0);
      try { renderer.compile(scene, camera); } catch (_) { /* compile is only a warm-up */ }
      F.t0 = performance.now();
      releaseLean(F.dur, F.t0); // a peek in progress eases back to the theme's light across the turn
      kick();
    });
  }
  function poseTurn(th) {
    const { from, to, fromNear, toNear, leaf } = F;
    pose(from, Math.PI - th, fromNear);
    if (!fromNear) from.book.update(FLAT); // its far half is hidden; keep its spine flat
    pose(to, th, toNear);
    if (!toNear) to.book.update(FLAT);
    // a folded piece is paper-thin in real life, ours are card-thick: hide each spread while it lies nearly
    // flat under the leaf. The wedge on the far side opens away from the reader, so it can hide earlier.
    const NEAR_HIDE = from.side ? 0.14 : 0.06, FAR_HIDE = from.side ? 0.14 : 0.4;
    setPiecesVisible(to, th > (toNear ? FAR_HIDE : NEAR_HIDE));
    setPiecesVisible(from, Math.PI - th > (fromNear ? FAR_HIDE : NEAR_HIDE));
    from.corners.group.visible = false; to.corners.group.visible = false;
    leaf.set(th);
  }
  function endTurn() {
    const { from, to, leaf, done } = F;
    root.remove(leaf.pivot); leaf.dispose();
    dropWorld(from);
    for (const x of [to.book.near, to.book.far, to.book.spine]) x.visible = true;
    to.book.spine.userData.off = false;
    setPiecesVisible(to, true);
    W = to; F = null;
    root.rotation.y = W.yaw; rig.rotation.y = W.lightYaw;
    W.shadowGroup.rotation.y = W.yaw; scene.add(W.shadowGroup);
    camera.fov = W.m.camera?.fov ?? 32; camera.updateProjectionMatrix();
    warm.color.set(W.pal.lamp || '#ffd08a');
    worldShadowAndLamp();
    leanK = null; peekMuted = false; // the old page's peek went with it
    poolT0 = performance.now(); // the new page's lamp pool fades in
    phi = W.REST; pose(W, phi);
    Lcur = lightAt(shownK()); applyLight(Lcur);
    snapshotGlimpse(W);
    done();
  }

  // ---- state + animation
  // o.startOpen (or state 'open'): the book is open on its page from the first frame. No shut cover, no cover hold, no
  // opening, the open framing from the start, and it stays open when scrolled away (an embed under a caption card)
  const startOpen = !!o.startOpen || o.state === 'open' || still;
  let phi = 0;
  swapWorld(await buildWorld(moment));
  phi = startOpen ? W.REST : 0;
  applyMechanics(phi);
  let anim = null; // {from,to,t0,dur,ease,done}
  let visible = true, opened = startOpen, manual = false, turning = false, building = 0;

  function endAnim() { if (anim) { const d = anim.done; anim = null; d(); } }
  function animateTo(to, dur, delay = 0, ease = easeInOut) {
    endAnim();
    if (!motion) { phi = to; applyMechanics(phi); kick(); return Promise.resolve(); }
    return new Promise((res) => { anim = { from: phi, to, t0: performance.now() + delay, dur, ease, done: res }; kick(); });
  }
  // first arrival only: the shut book holds a moment so the cover title can be read, then opens.
  // Reduced motion: the cover shows, then the book is simply open (no animation).
  let firstOpen = !startOpen;
  function open() {
    opened = true;
    const hold = firstOpen ? (o.coverHold ?? 750) : 0; firstOpen = false;
    if (!motion) {
      endAnim();
      return new Promise((res) => setTimeout(() => { if (opened) { phi = W.REST; applyMechanics(phi); kick(); } res(); }, hold));
    }
    return animateTo(W.REST, 2100, 120 + hold);
  }
  function close() { opened = false; return animateTo(0, 1300); }

  // ---- pointer: tilt, hover hint, drag (boat, fog tab), pokes (cars), tap (bridge), enter (the book)
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  // page corners (detail view by default): hover lifts a corner, a click or a short drag asks the page to turn
  const cornerAllow = { prev: true, next: true };
  let hoverCorner = null, press = null, pressK = 0, zone = null;
  const turnHold = { prev: 0, next: 0 };
  const cornersOn = () => (o.corners ?? mode === 'detail');
  const cornerUsable = (dir) => cornersOn() && cornerAllow[dir];
  function setZone(z) { if (z !== zone) { zone = z; o.onHoverChange?.(z); } }
  let lastTouch = performance.now();
  // home only: greet (the host page asks: her forearm waves while the hint bubble shows), the ribbon's tug (an idle nudge
  // every few seconds until the visitor first points at the book) and hover's lift (the camera comes in a little, the near
  // page's corner curls). greetK, curlK and tugT ease or count in the frame loop.
  let greet = false, greetK = 0, everHovered = false, tugNext = 4, tugT = -1;
  let hoverK = 0, hovering = false, dragging = null, settleUntil = 0, down = null, suppressClick = false, lastPick = 0, curKind = null;
  const ray = new THREE.Raycaster();
  const ndc = (e) => { const r = canvas.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
  const isOpen = () => !anim && !F && phi > W.REST - 0.05;
  // what is under the pointer: { kind: 'corner' | 'drag' | 'poke' | 'tap' | 'book', dir?, drag?, run? } or null
  const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;
  const isTouch = (e) => e.pointerType === 'touch' || (e.pointerType === undefined && coarse);
  const TOUCH_TOL = 30; // CSS px: a fingertip is about 40 wide, a pull-tab on a phone can be 8
  const _box = new THREE.Box3(), _pv = new THREE.Vector3();
  // the nearest playable piece to a fingertip, measured in screen space from its projected bounds
  function nearTarget(e, tol) {
    const r = canvas.getBoundingClientRect(); let best = null, bestD = tol;
    const consider = (obj, make) => {
      if (!shown(obj)) return;
      _box.setFromObject(obj); if (_box.isEmpty()) return;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < 8; i++) {
        _pv.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z).project(camera);
        const sx = r.left + ((_pv.x + 1) / 2) * r.width, sy = r.top + ((1 - _pv.y) / 2) * r.height;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      const d = Math.hypot(Math.max(x0 - e.clientX, 0, e.clientX - x1), Math.max(y0 - e.clientY, 0, e.clientY - y1));
      if (d < bestD) { bestD = d; best = make(); }
    };
    for (const [obj, d] of W.dragOf) consider(obj, () => ({ kind: 'drag', drag: d, hover: W.hoverOf.get(obj) }));
    for (const [obj, run] of W.pokeOf) consider(obj, () => ({ kind: 'poke', run, hover: W.hoverOf.get(obj) }));
    for (const obj of W.tapTargets) consider(obj, () => ({ kind: 'tap' }));
    for (const [obj, cd] of W.corners.dirOf) if (cornerUsable(cd)) consider(obj, () => ({ kind: 'corner', dir: cd }));
    return best;
  }
  function pick(e) {
    if (F) return null;
    ray.setFromCamera(ndc(e), camera);
    const hit = ray.intersectObjects(W.pickables, false).find((h) => shown(h.object));
    let direct = hit ? { kind: 'book' } : null;
    if (hit && isOpen()) {
      const cd = W.corners.dirOf.get(hit.object);
      const hv = W.hoverOf.get(hit.object);
      const d = W.dragOf.get(hit.object);
      const run = W.pokeOf.get(hit.object);
      if (cd) direct = cornerUsable(cd) ? { kind: 'corner', dir: cd } : { kind: 'book' };
      else if (d) direct = { kind: 'drag', drag: d, hover: hv };
      else if (run) direct = { kind: 'poke', run, hover: hv };
      else if (W.tapTargets.has(hit.object)) direct = { kind: 'tap' };
    }
    // in the detail view a finger that lands beside a small piece still gets it (a mouse stays exact; on the home page the whole book is the door)
    if (isOpen() && mode === 'detail' && isTouch(e) && (!direct || direct.kind === 'book')) { const near = nearTarget(e, TOUCH_TOL); if (near) return near; }
    return direct;
  }
  const _n = new THREE.Vector3(), _p = new THREE.Vector3(), _h = new THREE.Vector3(), _plane = new THREE.Plane();
  // where the pointer meets the dragged piece's own plane (its local z for a standing card, local y for a
  // tab lying on the page), as x along the gutter (book frame)
  function slotX(e, d) {
    ray.setFromCamera(ndc(e), camera);
    const mw = d.obj.matrixWorld;
    _plane.setFromNormalAndCoplanarPoint(_n.setFromMatrixColumn(mw, d.axis ?? 2).normalize(), _p.setFromMatrixPosition(mw));
    if (!ray.ray.intersectPlane(_plane, _h)) return null;
    // 'local' drags (a dial) get the point in the piece's own coordinates; the rest get x along the gutter
    if (d.local) { d.obj.updateMatrixWorld(); return d.obj.worldToLocal(_h.clone()); }
    return root.worldToLocal(_h).x;
  }
  // a playable piece answers the pointer: it lifts a hair or catches the light (kit 'hover(on)')
  let hoverFn = null;
  function setHover(fn) { if (fn === hoverFn) return; hoverFn?.(false); hoverFn = fn; fn?.(true); kick(); }
  function setCursor(kind) { if (kind !== curKind) { curKind = kind; canvas.style.cursor = cursorValue(kind); } }
  function zoneFor(p) {
    if (!p) return null;
    if (p.kind === 'drag') return 'drag';
    if (p.kind === 'poke' || p.kind === 'tap') return 'tap';
    if (p.kind === 'corner') return 'turn';
    return canEnter() ? 'enter' : null;
  }
  function cursorFor(p) {
    if (!p) return '';
    if (p.kind === 'corner') return p.dir === 'next' ? 'turnNext' : 'turnPrev';
    if (p.kind === 'drag') return 'grab';
    if (p.kind === 'poke' || p.kind === 'tap') return 'tap';
    return canEnter() ? 'enter' : '';
  }
  function onDown(e) {
    lastTouch = performance.now();
    if (e.button !== 0) return;
    endKeyDrag();
    suppressClick = false; // a touch drag ends without a click, so the flag must not outlive its gesture
    down = { x: e.clientX, y: e.clientY, moved: false };
    const p = pick(e);
    if (p?.kind === 'corner') {
      press = { dir: p.dir, x: e.clientX, y: e.clientY, moved: false }; pressK = 0.55;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
      kick(); return;
    }
    if (p?.kind === 'drag') {
      const x = slotX(e, p.drag);
      if (x == null) return;
      dragging = p.drag; dragging.begin(x);
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
      setCursor('grabbing');
      kick();
    }
  }
  function onMove(e) {
    if (motion) { const n = ndc(e); tilt.tx = n.x; tilt.ty = n.y; kick(); }
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
    if (dragging) { const x = slotX(e, dragging); if (x != null) dragging.move(x); kick(); return; }
    if (press) {
      const dpx = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (dpx > 6) press.moved = true;
      pressK = Math.min(1, 0.55 + dpx / 140); // the corner follows a short pull
      kick(); return;
    }
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      const now = performance.now();
      if (now - lastPick < 40) return;
      lastPick = now;
      const p = pick(e);
      hovering = !!p;
      hoverCorner = p?.kind === 'corner' ? p.dir : null;
      setHover(p?.hover || null);
      setCursor(cursorFor(p));
      setZone(zoneFor(p));
      kick();
    }
  }
  function endDrag() {
    if (!dragging) return;
    dragging.end(); dragging = null;
    settleUntil = performance.now() + 2500;
  }
  function onUp(e) {
    if (press) {
      const { dir, moved } = press; press = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* fine */ }
      suppressClick = true;
      if (e.type !== 'pointercancel' && (!moved || pressK > 0.72) && cornerUsable(dir)) { turnHold[dir] = performance.now() + 700; o.onTurn?.(dir); }
      kick(); return;
    }
    if (dragging) {
      endDrag(); suppressClick = true;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* fine */ }
      setCursor(e.pointerType === 'mouse' ? 'grab' : '');
      kick();
    }
  }
  function onLeave() { setHover(null); tilt.tx = 0; tilt.ty = 0; hovering = false; hoverCorner = null; if (!dragging) { setCursor(''); setZone(null); } kick(); }
  function runTap() {
    const [pid, a] = W.m.tap.do.split('.');
    W.pieces[pid]?.actions?.[a]?.();
    kick();
  }
  function enter(source) { if (canEnter()) o.onEnter({ source, moment: api.meta }); }
  function onClick(e) {
    if (suppressClick) { suppressClick = false; return; }
    if (down?.moved) { down = null; return; }
    down = null;
    const p = pick(e);
    if (!p || p.kind === 'drag') return;
    if (p.kind === 'poke') { p.run(); settleUntil = Math.max(settleUntil, performance.now() + 800); kick(); return; }
    if (p.kind === 'tap' && W.m.tap) return runTap();
    enter('pointer');
  }
  // a touch that starts on a draggable moves it instead of scrolling the page
  function onTouchStart(e) {
    const t = e.touches[0];
    const k = t && pick({ clientX: t.clientX, clientY: t.clientY })?.kind;
    if (k === 'drag' || k === 'corner') e.preventDefault();
  }
  function onKey(e) {
    if (e.target !== container || (e.key !== 'Enter' && e.key !== ' ') || !canEnter()) return;
    e.preventDefault();
    enter('key');
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  container.addEventListener('keydown', onKey);

  // ---- keys (detail view): every playable piece gets one unseen button, in piece order (a piece's `label` names it). Tab walks them, focus shows
  // as the piece's own hover state (no ring), Enter or Space taps it, the arrow keys drag it. The buttons sit before
  // o.keysBefore in the page (so Tab reaches them where the page wants) or, without it, inside the book.
  const keysEl = document.createElement('div');
  keysEl.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;';
  if (o.keysBefore?.parentNode) o.keysBefore.parentNode.insertBefore(keysEl, o.keysBefore); else stage.appendChild(keysEl);
  const KEY_STEP = 26, KEY_HOLD = 600; // CSS px an arrow press moves a piece; ms a key drag outlives its last key
  let keyDrag = null, keyCtl = [];
  const _g = new THREE.Vector3(), _a = new THREE.Vector3();
  const toScreen = (v) => { v.project(camera); const r = canvas.getBoundingClientRect(); return { clientX: r.left + ((v.x + 1) / 2) * r.width, clientY: r.top + ((1 - v.y) / 2) * r.height }; };
  const gripAt = (c) => toScreen((c.drag || c.poke).targets[0].getWorldPosition(_g));
  // the way a drag's slot runs on screen (its +x, as a unit vector)
  function slotDir(d, g) {
    const obj = d.local ? d.obj : root;
    obj.updateWorldMatrix(true, false);
    _a.setFromMatrixColumn(obj.matrixWorld, 0).normalize().multiplyScalar(0.05).add(d.targets[0].getWorldPosition(_g));
    const p = toScreen(_a), x = p.clientX - g.clientX, y = p.clientY - g.clientY, n = Math.hypot(x, y) || 1;
    return { x: x / n, y: y / n };
  }
  function endKeyDrag() {
    if (!keyDrag) return;
    clearTimeout(keyDrag.timer); keyDrag.d.end(); keyDrag = null;
    settleUntil = performance.now() + 2500; kick();
  }
  function keyHold() { if (keyDrag) { clearTimeout(keyDrag.timer); keyDrag.timer = setTimeout(endKeyDrag, KEY_HOLD); } }
  // one step along the slot: the piece is asked to sit `steps` further than where it is now, like a short pull
  function keyMove(c, way, steps = 1) {
    const d = c.drag, g = gripAt(c), a = slotDir(d, g);
    if (keyDrag?.d !== d) { endKeyDrag(); const x0 = slotX(g, d); if (x0 == null) return; d.begin(x0); keyDrag = { d, timer: 0 }; }
    clearTimeout(keyDrag.timer);
    const x = slotX({ clientX: g.clientX + way * steps * KEY_STEP * a.x, clientY: g.clientY + way * steps * KEY_STEP * a.y }, d);
    if (x != null) d.move(x);
    kick();
  }
  function keyDown(e, c) {
    const h = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0, v = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!h && !v) { if (e.key === 'Home' || e.key === 'End') e.stopPropagation(); return; }
    // on a piece the arrows belong to the piece: they never turn the day or scroll the page
    e.preventDefault(); e.stopPropagation();
    if (!c.drag || !isOpen() || e.altKey || e.metaKey || e.ctrlKey) return;
    lastTouch = performance.now();
    if (c.drag.step) { if (!e.repeat) c.drag.step(h + v); return; }
    // an arrow along the slot moves the piece that way; an arrow across it still moves it (Right and Down agree)
    const a = slotDir(c.drag, gripAt(c)), along = h * a.x + v * a.y;
    const main = Math.abs(a.x) >= Math.abs(a.y) ? Math.sign(a.x) : Math.sign(a.y);
    keyMove(c, Math.abs(along) > 0.3 ? Math.sign(along) : (h + v) * (main || 1));
  }
  function keyTap(c) {
    if (!isOpen()) return;
    lastTouch = performance.now();
    if (c.poke) { c.poke.run(); settleUntil = Math.max(settleUntil, performance.now() + 800); kick(); return; }
    const d = c.drag;
    if (d.step) return d.step(0);
    // a piece that only drags: one long pull, the way that moves it (a boat at the end of its slot comes back)
    const g0 = gripAt(c), x0 = g0.clientX, y0 = g0.clientY;
    keyMove(c, c.way, 3); keyHold();
    setTimeout(() => {
      if (keyDrag?.d !== d) return;
      const g = gripAt(c);
      if (Math.hypot(g.clientX - x0, g.clientY - y0) < 3) { c.way = -c.way; keyMove(c, c.way, 3); keyHold(); }
    }, 220);
  }
  function keyFocus(c, el) {
    const g = gripAt(c), r = keysEl.getBoundingClientRect();
    el.style.left = (g.clientX - r.left) + 'px'; el.style.top = (g.clientY - r.top) + 'px';
    // no ring: the piece answers instead, with its hover state and, where it has one, its hint wiggle
    setHover(c.hover);
    if (motion && isOpen() && !keyDrag) c.nudge?.();
  }
  function syncKeys() {
    endKeyDrag(); keysEl.textContent = ''; keyCtl = [];
    if (mode !== 'detail' || !W) return;
    const add = (name, poke, drag, nudge) => {
      const hovers = [...new Set([poke?.hover, drag?.hover].filter(Boolean))];
      const c = { poke, drag, nudge, way: 1, hover: hovers.length ? (on) => { for (const f of hovers) f(on); } : null };
      const el = document.createElement('button');
      el.type = 'button';
      el.style.cssText = 'position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;padding:0;border:0;background:none;opacity:0;outline:0;pointer-events:none;';
      el.setAttribute('aria-label', drag ? `${name}, arrow keys move it` : name);
      el.addEventListener('focus', () => keyFocus(c, el));
      el.addEventListener('blur', () => { endKeyDrag(); if (c.hover && hoverFn === c.hover) setHover(null); });
      el.addEventListener('click', () => keyTap(c));
      el.addEventListener('keydown', (e) => keyDown(e, c));
      el.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow')) keyHold(); });
      keysEl.appendChild(el); keyCtl.push(c);
    };
    for (const sp of W.m.pieces) {
      const b = W.pieces[sp.id], pokes = b.pokes || [], drags = [].concat(b.drag || []), name = sp.label || sp.id;
      // one stop per piece: a piece with many taps (the cars on the bridge) takes them in turn, one per press
      let k = 0;
      const poke = pokes.length > 1 ? { get targets() { return pokes[k % pokes.length].targets; }, run() { pokes[k++ % pokes.length].run(); } } : pokes[0];
      if (poke || drags[0]) add(name, poke, drags[0], b.nudge);
      drags.slice(1).forEach((d, i) => add(d.label || `${name} ${i + 2}`, null, d)); // a piece may name its second drag
    }
    if (W.m.tap && W.tapTargets.size) add(W.m.tap.label || [].concat(W.m.tap.on)[0], { targets: [...W.tapTargets], run: runTap });
  }
  syncKeys();

  // ---- loop (renders only while something moves and the book is on screen)
  let raf = 0, last = performance.now(), frameN = 0, shadowN = 0;
  let lt = 0, ft = 0; // loop clock and float clock: they only advance while running, so loops resume where they paused
  const camTarget = new THREE.Vector3();
  function frame(now) {
    raf = 0;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; // never negative: a kick() inside a frame moves `last` past the next frame's timestamp
    let busy = false;
    if (anim) {
      const p = Math.max(0, Math.min(1, (now - anim.t0) / anim.dur));
      phi = anim.from + (anim.to - anim.from) * anim.ease(p);
      applyMechanics(phi);
      if (p >= 1) endAnim();
      busy = true;
    }
    let turnK = 0, turnUp = 0;
    if (F) {
      const p = Math.max(0, Math.min(1, (now - F.t0) / F.dur));
      const th = Math.PI * leafEase(p);
      poseTurn(th);
      turnK = th / Math.PI; turnUp = Math.sin(th);
      busy = true;
      if (p >= 1) { endTurn(); turnK = 0; turnUp = 0; }
    }
    // the light: a relight (lightAnim moves skyK) and a peek's lean easing out (leanFade) share one applyLight
    let lp = -1;
    if (lightAnim) {
      lp = Math.max(0, Math.min(1, (now - lightAnim.t0) / lightAnim.dur));
      skyK = lightAnim.from + (lightAnim.to - lightAnim.from) * easeInOutQuad(lp);
    }
    if (lightAnim || leanFade) {
      Lcur = lightAt(shownK(now));
      applyLight(Lcur);
      if (leanFade && now >= leanFade.t0 + leanFade.dur) leanFade = null;
      busy = true;
    }
    if (lp >= 1) { const d = lightAnim.done; lightAnim = null; d(); wantShadow(3); snapshotGlimpse(W); }
    // the folding page's sky dial finishes its peek as the page goes down (after the light: its dial.set would undo it)
    if (F) for (const tk of F.from.dialTicks) tk(lt, dt, false);
    // the lamp pool's point light hangs where the turning leaf passes; dim it while the leaf is up
    warm.intensity = poolLevel(Lcur, turnUp, now);
    if (now - poolT0 < POOL_IN) busy = true;
    // page corners: ease each toward its target curl
    let cornerBusy = false;
    if (!F) {
      const homeCurl = mode === 'home' && motion && isOpen();
      const curlDir = 'next'; // the reader's right-hand corner, the one a thumb lifts to turn on
      const showC = (cornersOn() || homeCurl) && isOpen();
      W.corners.group.visible = showC;
      for (const dir of ['prev', 'next']) {
        const S = W.corners.sides[dir];
        const target = !showC ? 0 : homeCurl ? (dir === curlDir ? 0.42 * hoverK : 0) : !cornerUsable(dir) ? 0 : press?.dir === dir ? pressK : hoverCorner === dir ? 0.52 : now < turnHold[dir] ? 0.35 : 0;
        const next = motion ? S.k + (target - S.k) * Math.min(1, dt * 9) : target;
        if (S.set(Math.abs(next - target) < 0.002 ? target : next)) { wantShadow(2); cornerBusy = true; }
      }
    }
    const loops = motion && opened && isOpen();
    const handling = !!dragging || !!keyDrag || now < settleUntil;
    if (loops && !building && W.nudges.length) { // no new hints while the next page builds
      const idle = now - lastTouch;
      if (!W.nudgePlan && (W.nudgeRounds === 0 || (W.nudgeRounds === 1 && idle > 45000))) {
        W.nudgePlan = W.nudges.map((fn, i) => ({ t: lt + (W.nudgeRounds ? 0.3 : 1.4) + i * 1.1, fn }));
        W.nudgeRounds++;
      }
      if (W.nudgePlan) { for (const n of W.nudgePlan) if (!n.done && lt >= n.t) { n.done = true; n.fn(); } if (W.nudgePlan.every((n) => n.done)) W.nudgePlan = null; }
    }
    if ((loops || handling) && isOpen()) {
      lt += dt;
      let need = 0;
      for (const tk of W.tickers) { const r = tk(lt, dt, loops); if (r === 'fast') need = 2; else if ((r === 'slow' || r === true) && need < 1) need = 1; }
      applyFrames();
      if (need) wantShadow(need);
    }
    // float + tilt (camera moves; the book, its light and its shadows stay put)
    const md = M();
    if (motion && opened) ft += dt;
    const bob = motion && opened ? md.bob * Math.sin(ft * 0.85) : 0;
    hoverK += ((hovering && !dragging ? 1 : 0) - hoverK) * Math.min(1, dt * 4);
    tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 3);
    tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 3);
    // the hint: the ribbon tail sways a little, more when the pointer is over the book (home), which also leans in.
    // At home, until the visitor first points at the book, the ribbon gives a short tug every 8 s (a damped swing, 1.5 s).
    if (hovering) everHovered = true;
    let tug = 0;
    if (motion && opened && mode === 'home' && !everHovered && !F) {
      if (tugT < 0 && ft >= tugNext) { tugT = 0; tugNext = ft + 8; }
      if (tugT >= 0) { tugT += dt; tug = 0.32 * Math.exp(-3 * tugT) * Math.sin(13 * tugT); if (tugT > 1.5) tugT = -1; }
    } else tugT = -1;
    if (motion) for (const w of F ? [F.from, F.to] : [W]) if (w.book.ribbon) w.book.ribbon.rotation.y = (md.sway + md.swayHover * hoverK) * Math.sin(ft * 1.1) + tug;
    // greet: her forearm swings from its rest angle while the host page shows its hint bubble
    greetK += ((greet && motion && mode === 'home' && !F ? 1 : 0) - greetK) * Math.min(1, dt * 6);
    if (!F && W.wavers.length && (greetK > 0.001 || W.waving)) {
      for (const wv of W.wavers) wv.obj.rotation.z = wv.base + greetK * 0.42 * Math.sin(ft * 9);
      W.waving = greetK > 0.001; if (!W.waving) for (const wv of W.wavers) wv.obj.rotation.z = wv.base;
      wantShadow(2);
    }
    const up = phi < W.REST ? Math.max(0, Math.sin(Math.PI - phi)) : 0;
    let base = W.fit.base, upFit = W.fit.up, el = W.el;
    camTarget.copy(base.target).lerp(upFit.target, up);
    let dist = base.dist + (upFit.dist - base.dist) * up;
    if (o.shutFrame !== false && W.fit.shut && !F) { // closer on the shut cover, easing out as the book opens
      const c = (1 - Math.min(1, phi / (0.55 * Math.PI))) ** 2;
      camTarget.lerp(W.fit.shut.target, c); dist += (W.fit.shut.dist - dist) * c; el += (W.elShut - el) * c;
    }
    if (F) { // ease between the two spreads' framings, and back off a little while the leaf stands up
      const tb = F.to.fit.base, tu = F.to.fit.up;
      camTarget.lerp(tb.target, turnK).lerp(new THREE.Vector3().copy(upFit.target).lerp(tu.target, turnK), 0.35 * turnUp);
      dist += (tb.dist - dist) * turnK; dist += ((upFit.dist + (tu.dist - upFit.dist) * turnK) - dist) * 0.35 * turnUp;
      el += (F.to.el - el) * turnK;
    }
    const lean = 1 + md.lean * hoverK;
    if (mode === 'home' && motion) dist *= 1 - 0.035 * hoverK; // lift: the book comes up toward the reader a little
    placeCamera(camTarget, dist, el, motion ? -tilt.x * 0.07 * lean * md.tilt : 0, motion ? -tilt.y * 0.035 * lean * md.tilt : 0, bob);
    // table shadow: the book floats a few mm above it, so it widens and softens with the float
    const sp = W.shadowPlane, liftK = (md.bob + bob) / (2 * Math.max(1e-6, md.bob));
    sp.position.y = W.tableY - (md.bob + bob);
    sp.material.opacity = (1 - 0.12 * liftK) * shadowK;
    // it follows the far half: full spread when open, only the near half when closed
    const Dd = W.bookSpec.depth + 0.045, e = Math.max(0, Math.cos(Math.PI - phi)) * Dd;
    const k = 1 + 0.025 * liftK;
    sp.scale.set(k, k * (Dd + e) / (2 * Dd), 1);
    sp.position.z = (Dd - e) / 2;
    const settling = Math.abs(tilt.tx - tilt.x) + Math.abs(tilt.ty - tilt.y) > 0.002 || Math.abs((hovering ? 1 : 0) - hoverK) > 0.01;
    const more = visible && (busy || settling || cornerBusy || tugT >= 0 || greetK > 0.001 || (motion && opened) || handling || !!press);
    if (shadowDirty) {
      const every = shadowDirty >= 3 ? 1 : shadowDirty === 2 ? 2 : 8;
      if (frameN % every === 0 || !more) { renderer.shadowMap.needsUpdate = true; shadowDirty = 0; shadowN++; }
    }
    renderer.info.reset();
    draw();
    frameN++;
    if (more) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  // ---- observers: pause everything offscreen and in hidden tabs; with state 'auto', open and close with the viewport
  const ro = new ResizeObserver(resize); ro.observe(container);
  let io = null;
  const auto = () => o.state === 'auto' && !startOpen && !manual && !turning;
  if (!still) {
    io = new IntersectionObserver((ents) => {
      for (const en of ents) {
        visible = en.isIntersecting && !document.hidden;
        if (!auto()) { kick(); continue; }
        if (en.isIntersecting && en.intersectionRatio >= 0.3) { if (!opened) open(); }
        else if (!en.isIntersecting) { if (opened && motion) { opened = false; endAnim(); phi = 0; applyMechanics(0); } }
        else if (en.intersectionRatio < 0.3 && opened) { close(); }
        kick();
      }
    }, { threshold: [0, 0.3, 0.6] });
    io.observe(container);
  }
  const onVis = () => {
    if (document.hidden) { if (auto() && motion) { opened = false; endAnim(); phi = 0; applyMechanics(0); } visible = false; }
    else {
      const r = container.getBoundingClientRect();
      visible = r.bottom > 0 && r.top < innerHeight;
      if (auto() && !opened && visible) open();
      kick();
    }
  };
  document.addEventListener('visibilitychange', onVis);

  container.dataset.theme = theme; container.dataset.phase = theme;
  applyLight(Lcur);
  resize();
  kick();
  if (still) { // deterministic frame for screenshots
    await document.fonts?.ready;
    resize();
    placeCamera(W.fit.base.target, W.fit.base.dist, W.el);
    W.shadowPlane.position.y = W.tableY - M().bob;
    renderer.shadowMap.needsUpdate = true;
    draw();
    container.dataset.ready = '1';
  }

  // ---- turning to another moment. Open and moving: one leaf turns ('next' lifts the near page over the
  // gutter, 'prev' brings the far page back). Closed, offscreen or reduced motion: the spread is swapped in place.
  let turnQueue = Promise.resolve();
  async function turnTo(src, dir) {
    // the page is about to go: its hints that have not played yet are dropped (a dial peek that starts while the next
    // page builds would be cut short by the turn); the idle hint 45 s on still comes if the turn fails
    W.nudgePlan = null; W.nudgeRounds = Math.max(W.nudgeRounds, 1);
    building++;
    let next, world;
    try {
      next = await loadMoment(src);
      world = await buildWorld(next); // build first, in short tasks, so nothing moves until the spread is ready
    } finally { building--; }
    turning = true;
    try {
      endDrag(); endKeyDrag(); setCursor(''); setZone(null); hoverCorner = null; press = null;
      if (motion && visible && opened && isOpen() && world.bookSpec.width === W.bookSpec.width && world.bookSpec.depth === W.bookSpec.depth) {
        await startTurn(world, dir);
      } else {
        swapWorld(world);
        poolT0 = performance.now(); // the lamp pool fades in with the new page (a light fade: reduced motion too)
        kick();
      }
      moment = next; setCaption(next); syncKeys();
    } finally { turning = false; }
    return api.meta;
  }

  const api = {
    // Day / Night. The page owns its switch; the book follows with a short relight (~0.9 s).
    setTheme,
    get theme() { return theme; },
    // Turn to another moment (url or object). Resolves with its meta once the new spread is open.
    setMoment(src, { direction = 'next' } = {}) {
      const dir = direction === 'prev' ? 'prev' : 'next';
      const p = turnQueue.then(() => turnTo(src, dir)); turnQueue = p.catch(() => {}); return p;
    },
    // 'home' | 'detail': what a click on the book means, and how close and calm the camera is.
    setMode(m) {
      mode = m === 'detail' ? 'detail' : 'home';
      applyModeAttrs(); curKind = null; setCursor(''); setZone(null); hoverCorner = null;
      syncKeys();
      fit(); kick();
      return mode;
    },
    get mode() { return mode; },
    // Which page corners may turn (the page disables 'prev' on the first moment, 'next' on the last).
    // home: wave hello (her forearm, where the page has a waving figure) while the host shows its hint; standing() says
    // whether the page stands open (the host waits for it before its one-time hint, so she can wave as it shows)
    greet(on) { greet = !!on; kick(); return W.wavers.length > 0; },
    standing() { return !!W && !F && isOpen(); },
    setCorners(c = {}) { if ('prev' in c) cornerAllow.prev = !!c.prev; if ('next' in c) cornerAllow.next = !!c.next; kick(); return { ...cornerAllow }; },
    get corners() { return { enabled: cornersOn(), ...cornerAllow }; },
    // The words live in the page: the moment's text for a detail view.
    get meta() { return { id: moment.id, caption: moment.caption, captionStatus: moment.captionStatus || null, place: moment.place, date: moment.date }; },
    open, close,
    // Back-compat: an old 'HH:MM' time picks the theme the sun would give at that time.
    setTime(t) { return setTheme(themeAt(t && t !== 'auto' ? resolveTime(t, o.date) : new Date())); },
    setPhi(p) { endAnim(); phi = p; applyMechanics(p); kick(); }, // debug: mid-opening frames
    // Trigger a piece's action: act('fog') or act('tap') runs the moment's tap reaction; act('fog.roll') is explicit.
    act(name = 'tap', arg) {
      const tap = W.m.tap;
      const target = name === 'tap' && tap ? tap.do : name;
      let [pid, a] = target.split('.');
      const piece = W.pieces[pid];
      if (!piece?.actions) return false;
      if (!a) a = tap && tap.do.startsWith(pid + '.') ? tap.do.split('.')[1] : Object.keys(piece.actions)[0];
      const run = () => { piece.actions[a]?.(arg); applyFrames(); wantShadow(3); kick(); };
      if (!opened && a !== 'pin') { open(); setTimeout(run, motion ? 2300 : 0); } else run();
      return true;
    },
    // Drive the opening yourself (e.g. from scroll): 0 closed .. 1 open. Hands control to the host for good.
    setProgress(p) {
      manual = true; endAnim();
      const k = Math.max(0, Math.min(1, +p || 0));
      phi = W.REST * k; opened = k >= 0.999;
      applyMechanics(phi); kick();
    },
    get light() { return Lcur; },
    // debug: draw calls each piece adds per pass (one per visible mesh material group), for budgeting
    get debugPieces() {
      const out = {}, count = (o) => { let n = 0; o.traverse((x) => { if ((x.isMesh || x.isSprite || x.isPoints || x.isLine) && shown(x)) n += x.geometry?.groups?.length || 1; }); return n; };
      for (const [id, pc] of Object.entries(W.pieces)) out[id] = pc.parts.reduce((n, p) => n + count(p.obj), 0);
      out._book = count(W.book.group); out._scene = 0; scene.traverse((x) => { if ((x.isMesh || x.isSprite || x.isPoints || x.isLine) && shown(x)) out._scene += x.geometry?.groups?.length || 1; });
      return out;
    },
    get debugState() { return { phi, opened, visible, manual, turning, turn: F ? F.dir : null, theme, mode, skyK, shownK: shownK(), pool: warm.intensity, lightNight: Lcur.night, anim: !!anim, raf: !!raf, motion, dragging: !!dragging, loopClock: lt, frames: frameN, shadowUpdates: shadowN, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, cursor: curKind }; },
    // debug: client coords of a piece, for click and drag tests. ref: undefined (first part origin, raised by dy),
    // 'drag' (its draggable), 'poke:N' (its N-th poke target)
    // Touch has no hover, so on request the playable pieces show themselves once: each one's hover state (a tab lifts a
    // hair, a card catches the light), one after another. The page calls this when the detail view opens on a phone.
    showPlayables() {
      if (!W || !isOpen()) return 0;
      const fns = [...new Set(W.hoverOf.values())];
      fns.forEach((f, i) => setTimeout(() => { try { f(true); } catch (_) { /* a piece mid-swap */ } kick(); setTimeout(() => { try { f(false); } catch (_) { /* same */ } kick(); }, 700); }, 150 + i * 220));
      return fns.length;
    },
    // debug: where each key button's piece is on screen right now (tools/launch/flows.mjs)
    debugKeys() { return keyCtl.map((c, i) => { const g = gripAt(c); return { label: keysEl.children[i].getAttribute('aria-label'), x: Math.round(g.clientX), y: Math.round(g.clientY), drag: !!c.drag, step: !!c.drag?.step, tap: !!c.poke }; }); },
    debugFit() { const v = new THREE.Vector3(); const sp = (Q) => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const q of Q) { v.copy(q).project(camera); a = Math.min(a, v.x); b = Math.max(b, v.x); c = Math.min(c, v.y); d = Math.max(d, v.y); } return [a, b, c, d].map((x) => +x.toFixed(3)); };
      return { mode, size, dist: +W.fit.base.dist.toFixed(3), P: sp(W.pts), S: sp(W.spts), Up: sp(W.ptsUp), nP: W.pts.length, frame: W.m.camera?.frame }; },
    // the cover window's still as a PNG data URL, drawn straight to the canvas (tone mapped and in sRGB, as the
    // window shows it); tools/launch/glimpse.mjs saves it for o.glimpse. Leaves the canvas to redraw on the next frame.
    debugGlimpseShot() {
      if (!W.book.glimpse) return null;
      const w = Math.round(440), h = Math.round(440 / W.book.glimpseAspect), pr = renderer.getPixelRatio(), sz = renderer.getSize(new THREE.Vector2());
      renderer.setPixelRatio(1); renderer.setSize(w, h, false);
      const url = glimpseRender(W, () => { renderer.setRenderTarget(null); renderer.clear(); renderer.render(scene, glimpseCam); return renderer.domElement.toDataURL('image/png'); });
      renderer.setPixelRatio(pr); renderer.setSize(sz.x, sz.y, false); wantShadow(3); kick();
      return url;
    },
    // debug: a fingerprint of where each piece's paper is right now (transforms, instanced copies, opacity, texture
    // offsets). Two calls a moment apart that differ for a piece mean it moves on its own: the moment skill's loop census.
    debugLoops() {
      const out = {};
      for (const [id, pc] of Object.entries(W.pieces)) {
        let h = 0, n = 0;
        const eat = (v) => { h += v * (1 + (n++ % 31) * 0.137); };
        for (const part of pc.parts) {
          part.obj.updateMatrixWorld(true);
          part.obj.traverse((o) => {
            for (const v of o.matrixWorld.elements) eat(v);
            if (o.isInstancedMesh) for (const v of o.instanceMatrix.array) eat(v);
            for (const mt of [].concat(o.material || [])) { eat(mt.opacity ?? 1); if (mt.map) { eat(mt.map.offset.x); eat(mt.map.offset.y); } }
          });
        }
        out[id] = h;
      }
      return out;
    },
    debugPick(x, y, touch = true) { return pick({ clientX: x, clientY: y, pointerType: touch ? 'touch' : 'mouse' })?.kind || null; },
    debugScreen(id, dy = 0.04, ref) {
      const v = new THREE.Vector3();
      if (id === 'corner') { // debugScreen('corner', 0, 'next' | 'prev'): a point just inside that page corner
        const sd = ref === 'prev' ? -1 : 1;
        if (W.side) v.set(-(W.bookSpec.width / 2 - 0.07), 0.002, sd * (W.bookSpec.depth - 0.07));
        else v.set(sd * (W.bookSpec.width / 2 - 0.07), 0.002, W.bookSpec.depth - 0.07);
        v.applyMatrix4(root.matrixWorld).project(camera);
        const r = canvas.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      }
      const piece = W.pieces[id];
      if (!piece) return null;
      if (ref === 'drag') [].concat(piece.drag)[0].targets[0].getWorldPosition(v);
      else if (ref?.startsWith('drag@')) { const [dx, dy, dz] = ref.slice(5).split(',').map(Number); v.set(dx, dy, dz || 0).applyMatrix4([].concat(piece.drag)[0].obj.matrixWorld); } // a point in the draggable's own frame (a dial rim)
      else if (ref?.startsWith('poke:')) piece.pokes[+ref.slice(5)].targets[0].getWorldPosition(v);
      else v.set(0, dy, 0).applyMatrix4(piece.parts[0].obj.matrixWorld);
      v.project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    destroy() {
      cancelAnimationFrame(raf); ro.disconnect(); io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('keydown', onKey);
      if (F) { F.leaf.dispose(); dropWorld(F.to); F = null; }
      dropWorld(W);
      renderer.dispose();
      if (setTab) container.removeAttribute('tabindex');
      if (setRole) container.removeAttribute('role');
      endKeyDrag(); keysEl.remove();
      stage.remove(); captionEl?.remove();
    },
  };
  return api;
}
