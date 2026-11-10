// Ground prints: what is printed flat on the two pages of the spread.
// Drawn in page coordinates (x along the gutter, u = distance from the gutter).
import { printTexture } from '../engine/paper.js';

function wobble(u, seed, amp) { return amp * (Math.sin(u * 7.1 + seed) * 0.6 + Math.sin(u * 15.3 + seed * 2.1) * 0.25); }

// preset "bay": water across the middle, land at both ends, an optional road to each end of a bridge
export function bayPrint(page, book, g, pal, mask = false) {
  const W = book.width, D = book.depth;
  // shape box for the slab top: near y=-u (u 0..D), far y=u
  const box = page === 'near' ? [-W / 2, -D, W / 2, 0] : [-W / 2, 0, W / 2, D];
  const water = page === 'near' ? pal.bay : pal.ocean;
  return printTexture(box, (ctx, s) => {
    if (page === 'near') ctx.scale(1, -1); // draw in (x,u)
    const P = (x, u) => [x, u];
    ctx.fillStyle = mask ? '#fff' : water; ctx.fillRect(-W / 2, 0, W, D);
    // land: left (SF) and right (Marin)
    const shore = (side) => {
      const x0 = side < 0 ? g.left : g.right;
      ctx.beginPath();
      const edge = side * W / 2;
      ctx.moveTo(edge, 0);
      for (let i = 0; i <= 40; i++) {
        const u = (i / 40) * D;
        const bulge = side < 0 ? (g.leftBulge || 0) * Math.sin((u / D) * Math.PI) : (g.rightBulge || 0) * Math.sin((u / D) * Math.PI);
        ctx.lineTo(x0 + side * bulge + wobble(u, side * 3 + (page === 'far' ? 5 : 0), 0.025), u);
      }
      ctx.lineTo(edge, D); ctx.closePath();
    };
    ctx.fillStyle = mask ? '#000' : pal.landLeft; shore(-1); ctx.fill();
    ctx.fillStyle = mask ? '#000' : pal.landRight; shore(1); ctx.fill();
    if (mask) return;
    // a thin pale shoreline (printed foam)
    ctx.lineWidth = 0.006; ctx.strokeStyle = pal.foam;
    shore(-1); ctx.stroke(); shore(1); ctx.stroke();
    // printed water lines, sparse
    ctx.strokeStyle = pal.foam; ctx.globalAlpha = 0.55; ctx.lineWidth = 0.004; ctx.lineCap = 'round';
    for (const [x, u, l] of (g.ripples?.[page] || [])) {
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) { const t = i / 12; ctx.lineTo(x + t * l, u + 0.008 * Math.sin(t * Math.PI * 2)); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // roads up to the bridge ends (near page only)
    if (g.roads && page === 'near') {
      for (const r of g.roads) {
        ctx.strokeStyle = pal.road; ctx.lineWidth = 0.05; ctx.lineJoin = 'round';
        ctx.beginPath(); r.forEach(([x, u], i) => (i ? ctx.lineTo(x, u) : ctx.moveTo(x, u))); ctx.stroke();
        ctx.strokeStyle = pal.roadLine; ctx.lineWidth = 0.004; ctx.setLineDash([0.018, 0.016]);
        ctx.beginPath(); r.forEach(([x, u], i) => (i ? ctx.lineTo(x, u) : ctx.moveTo(x, u))); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, mask ? 250 : 1000, 2048);
}
