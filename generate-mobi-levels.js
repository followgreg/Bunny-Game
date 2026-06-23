#!/usr/bin/env node
'use strict';

// MOBI level generator — rotate-to-reconnect curve puzzle
// Run: node generate-mobi-levels.js
// Output: assets/data/mobi-levels.json (25 levels)

const fs   = require('fs');
const path = require('path');

// ── Seeded PRNG (LCG) ─────────────────────────────────────────────────────────
function mkRng(seed) {
  let s = (seed >>> 0);
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ── Catmull-Rom spline (uniform) ──────────────────────────────────────────────
function crPoint(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [
    0.5 * ((2*p1[0]) + (-p0[0]+p2[0])*t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
    0.5 * ((2*p1[1]) + (-p0[1]+p2[1])*t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)
  ];
}

function sampleClosed(pts, n) {
  const N   = pts.length;
  const spn = Math.ceil(n / N);
  const out = [];
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % N];
    const p3 = pts[(i + 2) % N];
    for (let j = 0; j < spn; j++) {
      out.push(crPoint(p0, p1, p2, p3, j / spn));
    }
  }
  return out;
}

// ── Grid helpers ──────────────────────────────────────────────────────────────
const GRID = 8;

function cellOf(x, y) {
  const c = Math.floor(x), r = Math.floor(y);
  if (r < 0 || r >= GRID || c < 0 || c >= GRID) return null;
  return [r, c];
}

function exitEdge(fromR, fromC, toR, toC) {
  const dc = toC - fromC, dr = toR - fromR;
  if (Math.abs(dc) >= Math.abs(dr)) return dc > 0 ? 'right' : 'left';
  return dr > 0 ? 'bottom' : 'top';
}

const OPP = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

function subsample(arr, maxN) {
  if (arr.length <= maxN) return arr;
  const out = [];
  for (let i = 0; i < maxN; i++) {
    out.push(arr[Math.round(i * (arr.length - 1) / (maxN - 1))]);
  }
  return out;
}

// ── Slice the closed-curve sample array into per-cell tile data ───────────────
function sliceCurve(samples) {
  // Group consecutive samples into runs within the same cell
  const runs = [];
  let cur    = null;
  for (const pt of samples) {
    const cell = cellOf(pt[0], pt[1]);
    if (!cell) { cur = null; continue; }
    if (!cur || cur.cell[0] !== cell[0] || cur.cell[1] !== cell[1]) {
      cur = { cell: [...cell], pts: [] };
      runs.push(cur);
    }
    cur.pts.push(pt);
  }

  if (runs.length < 6) return null;

  // Merge adjacent duplicate-cell runs (can happen at gap boundaries)
  const dedup = [runs[0]];
  for (let i = 1; i < runs.length; i++) {
    const prev = dedup[dedup.length - 1];
    if (runs[i].cell[0] === prev.cell[0] && runs[i].cell[1] === prev.cell[1]) {
      prev.pts.push(...runs[i].pts);
    } else {
      dedup.push(runs[i]);
    }
  }

  // If first and last runs landed in the same cell (closed-curve wrap), merge
  if (dedup.length >= 2) {
    const first = dedup[0], last = dedup[dedup.length - 1];
    if (first.cell[0] === last.cell[0] && first.cell[1] === last.cell[1]) {
      first.pts = [...last.pts, ...first.pts];
      dedup.pop();
    }
  }

  if (dedup.length < 6) return null;

  // Each cell must appear at most once (simple, non-self-intersecting blob)
  const seen = new Set();
  for (const run of dedup) {
    const k = `${run.cell[0]},${run.cell[1]}`;
    if (seen.has(k)) return null;
    seen.add(k);
  }

  // All consecutive runs must be in grid-adjacent cells (no out-of-grid gaps)
  const n = dedup.length;
  for (let i = 0; i < n; i++) {
    const a = dedup[i].cell, b = dedup[(i + 1) % n].cell;
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > 1) return null;
  }

  // Reject runs with too few samples (corner clips that produce bad arcs)
  if (dedup.some(r => r.pts.length < 4)) return null;

  // Build final tile array
  const tiles = [];
  for (let i = 0; i < n; i++) {
    const run  = dedup[i];
    const next = dedup[(i + 1) % n];
    const prev = dedup[(i - 1 + n) % n];

    const exit    = exitEdge(run.cell[0], run.cell[1], next.cell[0], next.cell[1]);
    const fromDir = exitEdge(prev.cell[0], prev.cell[1], run.cell[0], run.cell[1]);
    const entry   = OPP[fromDir];

    const [row, col] = run.cell;
    const localPts = run.pts.map(([x, y]) => [
      Math.round(Math.max(0, Math.min(1, x - col)) * 1e4) / 1e4,
      Math.round(Math.max(0, Math.min(1, y - row)) * 1e4) / 1e4
    ]);

    tiles.push({
      row, col,
      entryEdge: entry,
      exitEdge:  exit,
      pathPoints: subsample(localPts, 18),
      initialRotation: 0
    });
  }

  return tiles;
}

// ── Level generator ────────────────────────────────────────────────────────────
function generateLevel(levelNum, rng) {
  const t        = (levelNum - 1) / 24;          // 0 → 1
  const N        = Math.round(8 + t * 5);         // 8 → 13 control points
  const baseR    = 2.0 + t * 1.0;                 // base radius 2.0 → 3.0
  const variance = 0.3 + t * 0.9;                 // 0.3 → 1.2

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  for (let attempt = 0; attempt < 300; attempt++) {
    const cx          = 3.5 + (rng() - 0.5) * 1.2;
    const cy          = 3.5 + (rng() - 0.5) * 1.2;
    const angleOffset = rng() * Math.PI * 2;

    const ctrl = [];
    for (let i = 0; i < N; i++) {
      const angle = angleOffset + (i / N) * Math.PI * 2 + (rng() - 0.5) * 0.5;
      const r     = clamp(baseR + (rng() - 0.5) * 2 * variance, 0.9, 3.9);
      ctrl.push([
        clamp(cx + Math.cos(angle) * r, 0.6, 7.4),
        clamp(cy + Math.sin(angle) * r, 0.6, 7.4)
      ]);
    }

    const samples = sampleClosed(ctrl, 6000);
    const tiles   = sliceCurve(samples);

    if (!tiles || tiles.length < 10 || tiles.length > 40) continue;

    // Scramble rotations — ensure puzzle is not accidentally already solved
    let allZero = true;
    for (const tile of tiles) {
      tile.initialRotation = Math.floor(rng() * 4);
      if (tile.initialRotation !== 0) allZero = false;
    }
    if (allZero) tiles[Math.floor(rng() * tiles.length)].initialRotation = 1 + Math.floor(rng() * 3);

    return { level: levelNum, tiles };
  }

  throw new Error(`Level ${levelNum}: failed to generate after 300 attempts`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const NUM_LEVELS = 25;
const outPath    = path.join(__dirname, 'assets', 'data', 'mobi-levels.json');

console.log('Generating MOBI levels...\n');
const levels = [];
const t0     = Date.now();

for (let i = 1; i <= NUM_LEVELS; i++) {
  const seed  = 0xc0ffee00 + i * 0x7777;
  const level = generateLevel(i, mkRng(seed));
  levels.push(level);
  process.stdout.write(`Level ${String(i).padStart(2)}: ${level.tiles.length} active tiles\n`);
}

fs.writeFileSync(outPath, JSON.stringify(levels));
console.log(`\nDone (${((Date.now() - t0) / 1000).toFixed(1)}s) → ${outPath}`);
