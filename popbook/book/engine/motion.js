// Small motion helpers for kit pieces: sliders, belts, springs. Pure functions, no three.js.
// Any piece may use them (see STATUS.md, "Kit piece contract").

export const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// A hidden paper belt: position along a visible run of length `run`, followed by a hidden return run.
// Returns -1 while the item is on the hidden return run. Seamless by construction.
export function beltPos(t, { speed, run, returnRun = 0.45, phase = 0 }) {
  const loop = run + returnRun;
  const p = (((phase * loop + t * speed) % loop) + loop) % loop;
  return p >= run ? -1 : p;
}

// Damped spring toward a target, stable for dt up to 0.05 s (3 substeps). st = { x, v }.
export function springStep(st, target, dt, k = 120, zeta = 0.7) {
  const c = 2 * Math.sqrt(k) * zeta, n = 3, h = dt / n;
  for (let i = 0; i < n; i++) { st.v += (k * (target - st.x) - c * st.v) * h; st.x += st.v * h; }
  return st;
}

// Paper resistance at a slot end: past [lo, hi] it gives `give` units at most, then stops.
export function slotLimit(x, lo, hi, give = 0.016, soft = 0.04) {
  if (x > hi) return hi + give * (1 - Math.exp(-(x - hi) / soft));
  if (x < lo) return lo - give * (1 - Math.exp(-(lo - x) / soft));
  return x;
}

// A short hop (0..1 progress): lift, squash on take-off and landing. Returns { y, sx, sy }.
export function hop(p, height = 0.012) {
  if (p <= 0 || p >= 1) return { y: 0, sx: 1, sy: 1 };
  const y = height * Math.sin(Math.PI * Math.min(1, p / 0.8)) * (p < 0.8 ? 1 : 0);
  const squash = 0.14 * (Math.exp(-((p - 0.05) ** 2) / 0.003) + Math.exp(-((p - 0.84) ** 2) / 0.004));
  return { y, sx: 1 + squash * 0.6, sy: 1 - squash };
}
