'use strict';
// generate-shaded-levels.js
// Run: node generate-shaded-levels.js
// Outputs: assets/data/shaded-levels.json

const fs   = require('fs');
const path = require('path');

// ── Color-distance scaling ────────────────────────────────────────────────────
// Two independent difficulty arcs:
//
//   Arc A — levels  1-24: 5 bars, delta 15→2  (complete 5-bar mastery)
//   Arc B — levels 25-50: 10 bars, delta 7→2  (reset, then tighten again)
//
// Increasing bar count at level 25 is its own difficulty layer; the delta
// resets to 7 so the transition feels like a fresh start, not a cliff.

const SPLIT_LEVEL    = 25;
const DELTA_MAX      = 15.0;   // arc A start (level 1)
const DELTA_MIN      =  2.0;   // shared floor for both arcs
const DELTA_START_10 =  7.0;   // arc B start (level 25)

function barCount(level) {
  return level < SPLIT_LEVEL ? 5 : 10;
}

function colorDistance(level) {
  if (level < SPLIT_LEVEL) {
    // Arc A: levels 1-24, t goes 0→1
    const t       = (level - 1) / (SPLIT_LEVEL - 2);
    const tCurved = Math.pow(t, 0.25);
    return DELTA_MAX * Math.pow(DELTA_MIN / DELTA_MAX, tCurved);
  }
  // Arc B: levels 25-50, t goes 0→1
  const t       = (level - SPLIT_LEVEL) / (50 - SPLIT_LEVEL);
  const tCurved = Math.pow(t, 0.25);
  return DELTA_START_10 * Math.pow(DELTA_MIN / DELTA_START_10, tCurved);
}

// ── CIELAB utilities (identical to Color Blind) ───────────────────────────────
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
  const X  = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) * 100;
  const Y  = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750) * 100;
  const Z  = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) * 100;
  function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
  const fy = f(Y / D65.Y);
  return { L: 116 * fy - 16, a: 500 * (f(X / D65.X) - fy), b: 200 * (fy - f(Z / D65.Z)) };
}

function labToRgb(L, a, b) {
  const fy = (L + 16) / 116;
  function fInv(t) { return t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787; }
  const x   = fInv(a / 500 + fy) * D65.X / 100;
  const y   = fInv(fy)           * D65.Y / 100;
  const z   = fInv(fy - b / 200) * D65.Z / 100;
  const rl  =  x *  3.2404542 - y * 1.5371385 - z * 0.4985314;
  const gl  = -x *  0.9692660 + y * 1.8760108 + z * 0.0415560;
  const bl2 =  x *  0.0556434 - y * 0.2040259 + z * 1.0572252;
  return { r: linearToSrgb255(rl), g: linearToSrgb255(gl), b: linearToSrgb255(bl2) };
}

// ── HSL → RGB ─────────────────────────────────────────────────────────────────
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

// ── UI-palette rejection (same guard as Color Blind) ─────────────────────────
const UI_PALETTE_RGB = [
  { r: 15,  g: 23,  b: 42  },
  { r: 17,  g: 24,  b: 39  },
  { r: 30,  g: 41,  b: 59  },
  { r: 45,  g: 63,  b: 85  },
  { r: 148, g: 163, b: 184 },
  { r: 249, g: 250, b: 251 },
];
const UI_LABS = UI_PALETTE_RGB.map(({ r, g, b }) => rgbToLab(r, g, b));

function deltaE76(labA, labB) {
  const dL = labA.L - labB.L, da = labA.a - labB.a, db = labA.b - labB.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

// Pick a random hue/saturation, return its Lab a* and b* (chroma direction).
// The 5 shades will use this chroma direction with varying L*.
// Saturation 60–80%, HSL lightness 0.50 (gives a punchy mid-value chroma vector).
function randomChroma() {
  const MAX_TRIES = 50;
  for (let i = 0; i < MAX_TRIES; i++) {
    const h = Math.random() * 360;
    const s = 0.60 + Math.random() * 0.20;
    const { r, g, b } = hslToRgb(h, s, 0.50);
    const lab = rgbToLab(r, g, b);
    if (UI_LABS.every(ui => deltaE76(lab, ui) >= 15)) return lab;
  }
  // Fallback: vivid orange
  const { r, g, b } = hslToRgb(30, 0.75, 0.50);
  return rgbToLab(r, g, b);
}

// ── Shuffle ───────────────────────────────────────────────────────────────────
function fisherYates(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ── Level generation ──────────────────────────────────────────────────────────
function generateLevel(level) {
  const N      = barCount(level);
  const delta  = colorDistance(level);
  const chroma = randomChroma();   // { L, a, b } — we use a and b only
  const halfN  = (N - 1) / 2;     // 2 for N=5, 4.5 for N=10

  // Center L* needs ±halfN*delta headroom + 5-unit safety buffer from 0/100.
  const margin   = halfN * delta + 5;
  const L_lo     = Math.max(margin, 15);
  const L_hi     = Math.min(100 - margin, 85);
  const L_center = L_lo + Math.random() * (L_hi - L_lo);

  // N lightness values, lightest first (highest L* → lowest L*)
  const correctOrder = [];
  for (let k = 0; k < N; k++) {
    const L       = L_center + (halfN - k) * delta;
    const clamped = Math.max(3, Math.min(97, L));
    const { r, g, b } = labToRgb(clamped, chroma.a, chroma.b);
    correctOrder.push(toHex(r, g, b));
  }

  // Shuffle — re-roll until not accidentally already in correct order
  let shuffledOrder;
  let attempts = 0;
  do {
    shuffledOrder = fisherYates(correctOrder);
    attempts++;
    if (attempts > 10000) throw new Error(`Level ${level}: shuffle loop exceeded 10k attempts`);
  } while (arraysEqual(shuffledOrder, correctOrder));

  return { level, n: N, correctOrder, shuffledOrder };
}

// ── Run ───────────────────────────────────────────────────────────────────────
const levels = [];
for (let lvl = 1; lvl <= 50; lvl++) levels.push(generateLevel(lvl));

const outDir  = path.join(__dirname, 'assets', 'data');
const outPath = path.join(outDir, 'shaded-levels.json');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(levels, null, 2));
console.log(`Wrote ${levels.length} levels to ${outPath}`);

// ── Spot-check ────────────────────────────────────────────────────────────────
const CHECK = [1, 5, 10, 20, 30, 40, 50];
const SEP   = '─'.repeat(80);
console.log('\nSpot check:');
console.log(SEP);
console.log('Lvl   delta   correctOrder (lightest → darkest)');
console.log(SEP);
for (const lvl of CHECK) {
  const e = levels[lvl - 1];
  const d = colorDistance(lvl).toFixed(2);
  console.log(`${String(lvl).padStart(3)}   ${String(d).padStart(5)}   ${e.correctOrder.join('  ')}`);
}
console.log(SEP);

// Verify no level is accidentally pre-solved
const preSolved = levels.filter(e => arraysEqual(e.shuffledOrder, e.correctOrder));
if (preSolved.length > 0) {
  console.error(`ERROR: ${preSolved.length} level(s) are pre-solved: ${preSolved.map(e => e.level).join(', ')}`);
  process.exit(1);
}
console.log(`\nAll ${levels.length} levels generated. 0 pre-solved shuffles. Done.`);
