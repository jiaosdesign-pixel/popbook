// Her time: San Francisco light computed in America/Los_Angeles, never UTC.
// NOAA solar position (accurate to well under a degree), moon phase, and a continuous
// light state. Since round 7 the book only shows two of its states: Day and Night (themeLight).
import * as THREE from 'three';

export const SF = { lat: 37.7749, lon: -122.4194, tz: 'America/Los_Angeles' };
export const SAN_CARLOS = SF; // old name, kept so nothing breaks; the location is San Francisco now
const rad = Math.PI / 180, deg = 180 / Math.PI;

// Local wall-clock parts of an instant in a time zone
export function zoneParts(date, tz = SF.tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second };
}
// Instant for a wall-clock time in a time zone (handles PST/PDT)
export function zoneToDate(y, m, d, hh, mm, tz = SF.tz) {
  let t = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 3; i++) {
    const p = zoneParts(new Date(t), tz);
    const asUTC = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
    t += Date.UTC(y, m - 1, d, hh, mm) - asUTC;
  }
  return new Date(t);
}

export function sunPosition(date, lat = SF.lat, lon = SF.lon) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * rad) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * rad) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * rad) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad));
  const yv = Math.tan((eps / 2) * rad) ** 2;
  const eot = 4 * deg * (yv * Math.sin(2 * L0 * rad) - 2 * e * Math.sin(M * rad) + 4 * e * yv * Math.sin(M * rad) * Math.cos(2 * L0 * rad) - 0.5 * yv * yv * Math.sin(4 * L0 * rad) - 1.25 * e * e * Math.sin(2 * M * rad));
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const tst = (((utcMin + eot + 4 * lon) % 1440) + 1440) % 1440;
  const ha = (tst / 4 - 180) * rad;
  const la = lat * rad;
  const cosZ = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha);
  const alt = Math.PI / 2 - Math.acos(Math.max(-1, Math.min(1, cosZ)));
  let az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(decl) * Math.cos(la)) + Math.PI;
  return { alt, az: (az + 2 * Math.PI) % (2 * Math.PI) };
}

// Sunrise / sunset for a local date, in local minutes, by bisection on altitude.
export function sunTimes(y, m, d) {
  const at = (min) => sunPosition(zoneToDate(y, m, d, Math.floor(min / 60), min % 60)).alt;
  const cross = (a, b, h) => { for (let i = 0; i < 20; i++) { const c = (a + b) / 2; ((at(a) - h) * (at(c) - h) <= 0) ? (b = c) : (a = c); } return Math.round((a + b) / 2); };
  const h0 = -0.833 * rad;
  let noon = 720, best = -9;
  for (let mm = 600; mm <= 840; mm += 5) { const a = at(mm); if (a > best) { best = a; noon = mm; } }
  return { sunrise: cross(180, noon, h0), sunset: cross(noon, 1380, h0), noon };
}

export function moonPhase(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  return ((((jd - 2451550.1) / 29.530588853) % 1) + 1) % 1; // 0 new, .5 full
}

// Book frame: +x north (Marin), -x south (SF), +z east (camera, the bay), -z west (Pacific).
export function sunDir(alt, az) {
  return new THREE.Vector3(Math.cos(alt) * Math.cos(az), Math.sin(alt), Math.cos(alt) * Math.sin(az));
}

const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const C = (h) => new THREE.Color(h);
function mix(a, b, t) { return a.clone().lerp(b, t); }

// Continuous light state from sun altitude/azimuth.
export function lightState(alt, az) {
  const a = alt * deg;
  const day = sstep(-2, 14, a);        // 0 night .. 1 full day
  const golden = sstep(-3, 2, a) * (1 - sstep(6, 16, a)); // peaks near the horizon
  const twilight = sstep(-12, -3, a) * (1 - sstep(-1, 4, a));
  const night = 1 - sstep(-10, -2, a);
  const lamps = 1 - sstep(-4, 3, a);

  // key light direction: the sun, clamped so shadows stay readable; moon at night
  const sun = sunDir(Math.max(alt, 9 * rad), az);
  const moon = new THREE.Vector3(-0.45, 0.78, -0.42).normalize();
  const keyDir = moon.clone().lerp(sun, sstep(-6, 1, a)).normalize();

  let keyColor = mix(C('#fff4e6'), C('#ffb46e'), golden);
  keyColor = mix(C('#9fb4ff'), keyColor, sstep(-6, 0, a));
  const keyI = 0.5 * night + (1 - night) * (0.7 + 3.1 * day) * (1 - 0.2 * golden * (1 - day));

  const skyDay = C('#dfe6ec'), skyGold = C('#f2d2b4'), skyDusk = C('#8a7fa3'), skyNight = C('#3b4766');
  let hemiSky = mix(skyNight, skyDusk, sstep(-10, -3, a));
  hemiSky = mix(hemiSky, skyGold, sstep(-3, 2, a));
  hemiSky = mix(hemiSky, skyDay, sstep(4, 16, a));
  const hemiGround = mix(C('#2a2a33'), C('#b9ad96'), day);
  const hemiI = 0.5 + 0.45 * day + 0.3 * twilight + 0.6 * golden;

  const bgDay = C('#262624'), bgGold = C('#2c2520'), bgDusk = C('#25222b'), bgNight = C('#17181c');
  let backdrop = mix(bgNight, bgDusk, sstep(-12, -4, a));
  backdrop = mix(backdrop, bgGold, sstep(-3, 1, a));
  backdrop = mix(backdrop, bgDay, sstep(6, 18, a));

  let phase = 'night';
  if (a > 12) phase = 'day'; else if (a > 0) phase = 'golden'; else if (a > -8) phase = 'twilight';
  return { alt, az, keyDir, keyColor, keyI, hemiSky, hemiGround, hemiI, backdrop, lamps, day, golden, night, twilight, phase };
}

// Resolve 'auto' | 'HH:MM' (+ optional 'YYYY-MM-DD') into an instant, in LA time.
export function resolveTime(time = 'auto', date) {
  const now = new Date();
  if (time === 'auto' && !date) return now;
  const p = zoneParts(now);
  let y = p.y, m = p.m, d = p.d, hh = p.hh, mm = p.mm;
  if (date) { const q = date.split('-').map(Number); if (q.length === 3 && q.every((v) => !isNaN(v))) [y, m, d] = q; }
  if (time && time !== 'auto') { const q = String(time).split(':').map(Number); if (!isNaN(q[0])) { hh = q[0]; mm = q[1] || 0; } }
  return zoneToDate(y, m, d, hh, mm);
}

// Named moments for the viewer switch, from today's real sunrise/sunset.
export function namedTimes(date) {
  const p = zoneParts(date || new Date());
  const t = sunTimes(p.y, p.m, p.d);
  const f = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  return { dawn: f(t.sunrise - 12), day: f(t.noon + 60), golden: f(t.sunset - 35), dusk: f(t.sunset + 14), night: '21:30', sunrise: f(t.sunrise), sunset: f(t.sunset) };
}

// ---- V1: two user-facing states. Day = an early-afternoon November sun from the south-southwest
// (shadows fall toward the reader and to the right). Night = moonlight, lamps on.
const R = Math.PI / 180;
export const THEME_SUN = { day: { alt: 31 * R, az: 200 * R }, night: { alt: -20 * R, az: 200 * R } };
export function themeLight(name) {
  const t = THEME_SUN[name] || THEME_SUN.day;
  const L = lightState(t.alt, t.az);
  L.phase = name === 'night' ? 'night' : 'day';
  L.studio = 0; L.rimI = 0; L.exposure = 1;
  return L;
}

// Day as a soft product shot (Nov 10): the book on a table under a big softbox, not under the sun. The key comes from
// the front left and above, so every face that points at the reader is lit and shades off gently; warm paper bounces
// light back up; a rim from the back right picks out the edges. `studio` (0..1) drives the rim and the softer shadow
// in book.js. Night stays moonlight (themeLight('night')).
export const STUDIO = { alt: 40, az: 165, keyI: 3.0, hemiI: 0.85, rimI: 1.3, exposure: 1.0 };
export function studioLight(o = {}) {
  const s = Object.assign({}, STUDIO, o);
  const L = lightState(31 * R, 200 * R); // a full day for every weight the pieces read (day 1, night 0, lamps off)
  L.keyDir = sunDir(s.alt * R, s.az * R);
  L.keyColor = C('#fff5ea');
  L.keyI = s.keyI;
  L.hemiSky = C('#f6f2ec');
  L.hemiGround = C('#d9ccb6');
  L.hemiI = s.hemiI;
  L.rimI = s.rimI;
  L.exposure = s.exposure;
  L.phase = 'day';
  L.studio = 1;
  return L;
}
// 'day' while the sun is up in San Francisco (upper limb above the horizon), else 'night'.
export function themeAt(date = new Date()) {
  return sunPosition(date).alt > -0.833 * R ? 'day' : 'night';
}
// Blend two light states (numbers, colours, directions) for a smooth relight.
export function blendLight(a, b, k) {
  const L = {};
  for (const key of Object.keys(b)) {
    const va = a[key], vb = b[key];
    if (typeof vb === 'number') L[key] = va + (vb - va) * k;
    else if (vb && vb.isColor) L[key] = va.clone().lerp(vb, k);
    else if (vb && vb.isVector3) L[key] = va.clone().lerp(vb, k).normalize();
    else L[key] = k < 0.5 ? va : vb;
  }
  return L;
}
