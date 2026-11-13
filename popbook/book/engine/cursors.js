// Cursors drawn like the book: ink outline, paper fill, one accent (the site's blue), and a pale halo so they read
// on a light and a dark page. SVG first; once rasterised, crisp 1x/2x PNGs via image-set().
// Kinds: 'enter' (a small open book with a pop-up rising from its gutter: click opens the book; on the home page the
// "Enter my world" sticker grows out of this exact drawing, home.js), 'turnNext' / 'turnPrev' (a page corner lifting,
// for the detail view's page corners; mirrored on the left), 'tap' (a fingertip, light touch),
// 'grab' (open hand), 'grabbing' (closed hand). Each has a plain CSS fallback.
// Shared with the site (home/SYSTEM-NOTES.md on playground): the site's link cursor home/cursors/pointer.* is this
// 'tap' drawing, byte for byte (hotspot 13 5); if 'tap' changes, re-run review/system/make-cursors.mjs there.
// Off a zone the canvas cursor is cleared to '' so the page's paper arrow shows (never 'default'). 'enter' keeps
// its folded accent corner on the lower right, like the site arrow. Same recipe as the site: halo 3.0 #FAF9F5,
// ink 1.6 #141413, one accent (the site's ochre #9A7428; it was Coral, then blue), drawn on 32, scaled .84, offset 2.6, rasterised 1x and 2x.
const INK = '#141413', PAPER = '#FAF9F5', HALO = '#FAF9F5', ACCENT = '#9A7428'; // the site accent (round 4: ochre, the cover's foil darkened); one value on both themes, like home/cursors/
const HALO_W = 3.0, INK_W = 1.6;

// shapes: { l: [x1,y1,x2,y2,w] } capsule | { c: [cx,cy,r] } circle | { p: 'd' } path
function layer(shapes, color, grow) {
  return shapes.map((s) => {
    if (s.l) { const [x1, y1, x2, y2, w] = s.l; return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w + 2 * grow}" stroke-linecap="round"/>`; }
    if (s.c) { const [cx, cy, r] = s.c; return `<circle cx="${cx}" cy="${cy}" r="${r + grow}" fill="${color}"/>`; }
    return `<path d="${s.p}" fill="${color}"${grow ? ` stroke="${color}" stroke-width="${2 * grow}" stroke-linejoin="round"` : ''}/>`;
  }).join('');
}
// union silhouette: halo, then ink, then paper on top, so only the outer edge of the ink shows
// drawn on a 32 grid, then scaled into the box so the halo never touches the edge
const K = 0.84, OFF = 2.6;
function figure(shapes, detail = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g transform="translate(${OFF} ${OFF}) scale(${K})">${layer(shapes, HALO, INK_W + HALO_W)}${layer(shapes, INK, INK_W)}${layer(shapes, PAPER, 0)}${detail}</g></svg>`;
}

const palmOpen = { p: 'M8.6 16.2 C8.6 15 9.4 14.4 10.6 14.4 H22.2 C23.2 14.4 23.8 15.1 23.6 16.2 L22.4 24.6 C22 26.6 20.6 27.6 18.6 27.6 H13.4 C11.2 27.6 9.8 26.4 9.3 24.4 Z' };
const SHAPES = {
  // a small open book, its pop-up (accent) rising from the gutter: "enter the book". The sticker's doorway mark.
  enter: figure([{ p: 'M3 14.2 L16 11.2 L29 14.2 V24.2 L16 21.2 L3 24.2 Z' }, { p: 'M10.6 10 L16 1.8 L21.4 10 Z' }],
    `<path d="M16 11.4 V21" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>`
    + `<path d="M10.6 10 L16 1.8 L21.4 10 Z" fill="${ACCENT}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`),
  // a page with its lower-right corner lifting (accent underside): "turn the page"
  turn: figure([{ p: 'M5 3.6 H22 V16.6 L12.8 26.4 H5 Z' }],
    `<path d="M22 16.6 L12.8 26.4 C12.9 21.8 13.9 19.6 15.4 18.6 C17 17.5 19 17 22 16.6 Z" fill="${ACCENT}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`
    + `<path d="M8.4 8.6 H18.4 M8.4 12.4 H16.4" stroke="${INK}" stroke-opacity=".3" stroke-width="1.3" stroke-linecap="round"/>`),
  // pointing fingertip with two small touch marks
  tap: figure([
    { l: [12.4, 4.4, 12.4, 17, 3.6] },
    { c: [16.2, 15.2, 1.95] }, { c: [19.6, 15.8, 1.95] }, { c: [22.4, 17.2, 1.8] },
    { l: [9.6, 20.6, 7.4, 16.8, 3.4] },
    { p: 'M10.2 15.6 H22.6 C23.8 15.6 24.2 16.6 24 17.8 L22.8 24.8 C22.4 26.8 21 27.8 19 27.8 H13.6 C11.4 27.8 10.2 26.6 9.8 24.6 Z' },
  ], `<path d="M7.4 3.2 C6.4 4.4 6.4 6 7.2 7.2 M17.4 3.2 C18.4 4.4 18.4 6 17.6 7.2" fill="none" stroke="${ACCENT}" stroke-width="1.5" stroke-linecap="round"/>`),
  // open hand: four fingers spread, thumb out
  grab: figure([
    { l: [10.6, 7.6, 10.6, 16.4, 3.1] }, { l: [14.4, 5.4, 14.4, 16, 3.1] }, { l: [18.2, 6, 18.2, 16, 3.1] }, { l: [21.8, 8.8, 21.6, 16.6, 2.9] },
    { l: [8.6, 21, 5.4, 15.4, 3.1] }, palmOpen,
  ]),
  // closed hand: curled knuckles, thumb across
  grabbing: figure([
    { c: [11, 13.4, 2.0] }, { c: [14.8, 12.6, 2.0] }, { c: [18.6, 12.8, 2.0] }, { c: [22, 14, 1.9] },
    { p: 'M8.8 15.6 C8.8 14.5 9.6 13.8 10.8 13.8 H22.4 C23.4 13.8 24 14.6 23.8 15.6 L22.6 23.8 C22.2 25.8 20.8 26.8 18.8 26.8 H13.6 C11.4 26.8 10 25.6 9.5 23.6 Z' },
  ], `<rect x="9.4" y="17.4" width="8.2" height="3.6" rx="1.8" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/>`),
};
// turning a page: the same page-corner sheet; mirrored for the left (prev) corner
SHAPES.turnNext = SHAPES.turn;
SHAPES.turnPrev = SHAPES.turn.replace(/(<svg[^>]*>)([\s\S]*)(<\/svg>)/, '$1<g transform="translate(32 0) scale(-1 1)">$2</g>$3');
const HOT = Object.fromEntries(Object.entries({ enter: [16, 13], turn: [5, 3.6], tap: [12.4, 2.8], grab: [16, 17], grabbing: [16, 18] }).map(([k, [x, y]]) => [k, [Math.round(OFF + K * x), Math.round(OFF + K * y)]]));
HOT.turnNext = HOT.turn; HOT.turnPrev = [32 - HOT.turn[0], HOT.turn[1]];
const FALLBACK = { enter: 'pointer', turn: 'pointer', tap: 'pointer', grab: 'grab', grabbing: 'grabbing', turnNext: 'pointer', turnPrev: 'pointer' };

export const cursorSVG = (kind) => SHAPES[kind];
export const cursorHotspot = (kind) => HOT[kind];
const svgURL = (kind) => `url("data:image/svg+xml,${encodeURIComponent(SHAPES[kind])}")`;
const values = {};
for (const k of Object.keys(SHAPES)) values[k] = `${svgURL(k)} ${HOT[k][0]} ${HOT[k][1]}, ${FALLBACK[k]}`;
// 'tap' is the site's link cursor: use the site's own files (home/cursors/pointer.*) so the two can never drift;
// the drawing above is the same picture and stays as the fallback (a page without the site's files)
const SITE_TAP = null; // the site uses its own cursor files here
if (SITE_TAP) values.tap = `url("${SITE_TAP}.svg") ${HOT.tap[0]} ${HOT.tap[1]}, ${values.tap}`; // null in the public popbook copy

// CSS cursor value for a kind ('' for the page default)
export function cursorValue(kind) { return kind ? values[kind] : ''; }

// Rasterise to 1x and 2x PNGs so the cursor stays crisp on retina screens. Safe to call more than once.
let ready = null;
export function prepareCursors() {
  if (ready) return ready;
  const fn = typeof CSS !== 'undefined' && CSS.supports ? ['image-set', '-webkit-image-set'].find((f) => CSS.supports('cursor', `${f}(url("a.png") 1x) 1 1, auto`)) : null;
  if (!fn) return (ready = Promise.resolve(false));
  const raster = (kind, scale) => new Promise((res) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 32 * scale; const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/png')); };
    img.onerror = () => res(null);
    img.src = `data:image/svg+xml,${encodeURIComponent(SHAPES[kind])}`;
  });
  ready = Promise.all(Object.keys(SHAPES).map(async (k) => {
    const [a, b] = await Promise.all([raster(k, 1), raster(k, 2)]);
    if (!a || !b) return;
    const v = k === 'tap' && SITE_TAP
      ? `${fn}(url("${SITE_TAP}.png") 1x, url("${SITE_TAP}@2x.png") 2x) ${HOT.tap[0]} ${HOT.tap[1]}, ${fn}(url("${a}") 1x, url("${b}") 2x) ${HOT.tap[0]} ${HOT.tap[1]}, ${svgURL(k)} ${HOT.tap[0]} ${HOT.tap[1]}, ${FALLBACK[k]}`
      : `${fn}(url("${a}") 1x, url("${b}") 2x) ${HOT[k][0]} ${HOT[k][1]}, ${svgURL(k)} ${HOT[k][0]} ${HOT[k][1]}, ${FALLBACK[k]}`;
    if (CSS.supports('cursor', v)) values[k] = v;
  })).then(() => true);
  return ready;
}
