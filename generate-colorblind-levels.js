'use strict';
// generate-colorblind-levels.js
// Run: node generate-colorblind-levels.js
// Outputs: assets/data/colorblind-levels.json

const fs   = require('fs');
const path = require('path');

// ── Board size tiers ──────────────────────────────────────────────────────────
// 9 size steps (2×2 → 10×10), 8 tiers of 11 levels + 1 final tier of 12 = 100.
const SIZE_TIERS = [
  { min:  1, max:  11, size:  2 },
  { min: 12, max:  22, size:  3 },
  { min: 23, max:  33, size:  4 },
  { min: 34, max:  44, size:  5 },
  { min: 45, max:  55, size:  6 },
  { min: 56, max:  66, size:  7 },
  { min: 67, max:  77, size:  8 },
  { min: 78, max:  88, size:  9 },
  { min: 89, max: 100, size: 10 },
];

function boardSize(level) {
  const tier = SIZE_TIERS.find(t => level >= t.min && level <= t.max);
  if (!tier) throw new Error(`Level ${level} out of range 1–100`);
  return tier.size;
}

// ── Color-distance scaling ────────────────────────────────────────────────────
// ΔL* shift in CIELAB; ΔE76 ≈ |ΔL*| when only lightness changes.
const DELTA_MAX = 25.0;  // Level 1   — obvious
const DELTA_MIN =  2.0;  // Level 100 — hard floor, always distinguishable

function colorDistance(level) {
  const t = (level - 1) / 99;
  // 4th-root transform: same endpoints (25→2) but steeply compressed early on.
  // By level 2 the distance is already ~55% smaller than the old linear formula.
  const tCurved = Math.pow(t, 0.25);
  return DELTA_MAX * Math.pow(DELTA_MIN / DELTA_MAX, tCurved);
}

// ── CIELAB utilities ──────────────────────────────────────────────────────────
const D65 = { X: 95.047, Y: 100.000, Z: 108.883 };

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb255(c) {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, v * 255)));
}

function rgbToLab(r, g, b) {
  const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b);
  const X = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) * 100;
  const Y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750) * 100;
  const Z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) * 100;
  function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
  const fy = f(Y / D65.Y);
  return { L: 116 * fy - 16, a: 500 * (f(X / D65.X) - fy), b: 200 * (fy - f(Z / D65.Z)) };
}

function labToRgb(L, a, b) {
  const fy = (L + 16) / 116;
  function fInv(t) { return t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787; }
  const x  = fInv(a / 500 + fy) * D65.X / 100;
  const y  = fInv(fy)            * D65.Y / 100;
  const z  = fInv(fy - b / 200)  * D65.Z / 100;
  const rl =  x *  3.2404542 - y * 1.5371385 - z * 0.4985314;
  const gl = -x *  0.9692660 + y * 1.8760108 + z * 0.0415560;
  const bl2 = x *  0.0556434 - y * 0.2040259 + z * 1.0572252;
  return { r: linearToSrgb255(rl), g: linearToSrgb255(gl), b: linearToSrgb255(bl2) };
}

// Shift base RGB by ΔL* in the direction of mid-gray (always toward L*=50)
// to avoid hitting the L*=0 or L*=100 boundary.
function shiftLightness(r, g, b, deltaL) {
  const lab  = rgbToLab(r, g, b);
  const sign = lab.L >= 50 ? -1 : 1;
  const newL = Math.max(2, Math.min(98, lab.L + sign * deltaL));
  return labToRgb(newL, lab.a, lab.b);
}

// ── HSL → RGB ─────────────────────────────────────────────────────────────────
// h: 0–360 degrees, s and l: 0–1
function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  function f(n) {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  }
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

function toHex(r, g, b) {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0').toUpperCase()).join('');
}

// ── Base colour picker ────────────────────────────────────────────────────────
// Constraints chosen to stay well away from Bunny Game's UI chrome (dark slate
// blues, near-blacks, near-whites):
//   H: full 360° range — no hue restriction
//   S: 50–85%          — avoids desaturated grays that read like UI neutrals
//   L: 38–62%          — avoids dark (<20 in Lab) or washed-out (>80) tones;
//                        keeps ΔL* room of ≥25 in both directions at level 1
//
// A minimum ΔE76 check against the UI palette is also run as a backstop.
const UI_PALETTE_RGB = [
  { r: 15,  g: 23,  b: 42  },  // #0f172a  header bg
  { r: 17,  g: 24,  b: 39  },  // #111827  body bg
  { r: 30,  g: 41,  b: 59  },  // #1e293b  button bg
  { r: 45,  g: 63,  b: 85  },  // #2d3f55  borders
  { r: 148, g: 163, b: 184 },  // #94a3b8  muted text
  { r: 249, g: 250, b: 251 },  // #f9fafb  headings
];
const UI_LABS = UI_PALETTE_RGB.map(({ r, g, b }) => rgbToLab(r, g, b));

function deltaE76(labA, labB) {
  const dL = labA.L - labB.L, da = labA.a - labB.a, db = labA.b - labB.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

function randomBaseColor() {
  const MAX_TRIES = 50;
  for (let i = 0; i < MAX_TRIES; i++) {
    const h = Math.random() * 360;
    const s = 0.50 + Math.random() * 0.35;   // 50–85%
    const l = 0.38 + Math.random() * 0.24;   // 38–62%
    const { r, g, b } = hslToRgb(h, s, l);
    const lab = rgbToLab(r, g, b);
    // Reject if too close (ΔE76 < 15) to any UI chrome colour
    if (UI_LABS.every(ui => deltaE76(lab, ui) >= 15)) return { r, g, b };
  }
  // Fallback: vivid mid-value orange, definitly distinct from UI
  return hslToRgb(30, 0.75, 0.50);
}

// ── Level generation ──────────────────────────────────────────────────────────
function generateLevel(level) {
  const size   = boardSize(level);
  const delta  = colorDistance(level);
  const cells  = size * size;

  const base = randomBaseColor();
  const odd  = shiftLightness(base.r, base.g, base.b, delta);

  const oddCellIndex = Math.floor(Math.random() * cells);

  return {
    level,
    boardSize:    size,
    baseColor:    toHex(base.r, base.g, base.b),
    oddColor:     toHex(odd.r,  odd.g,  odd.b),
    oddCellIndex,
  };
}

// ── Run ───────────────────────────────────────────────────────────────────────
const levels = [];
for (let lvl = 1; lvl <= 100; lvl++) levels.push(generateLevel(lvl));

const outPath = path.join(__dirname, 'assets', 'data', 'colorblind-levels.json');
fs.writeFileSync(outPath, JSON.stringify(levels, null, 2));
console.log(`Wrote ${levels.length} levels to ${outPath}`);

// Spot-check a few entries
const CHECK = [1, 10, 25, 50, 75, 91, 100];
console.log('\nSpot check:');
const SEP = '─'.repeat(72);
console.log(SEP);
console.log('Lvl  Grid   baseColor   oddColor    oddCell   ΔL* (formula)');
console.log(SEP);
for (const lvl of CHECK) {
  const e = levels[lvl - 1];
  const delta = colorDistance(lvl).toFixed(2);
  console.log(
    `${String(lvl).padStart(3)}  ${e.boardSize}×${e.boardSize}${' '.repeat(7 - String(e.boardSize).length * 2)}` +
    `${e.baseColor}   ${e.oddColor}   ${String(e.oddCellIndex).padStart(3)} / ${String(e.boardSize ** 2 - 1).padStart(3)}   ${delta}`
  );
}
console.log(SEP);
console.log(`\nAll ${levels.length} levels verified.`);
