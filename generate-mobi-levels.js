#!/usr/bin/env node
'use strict';

// MOBI level generator — complex-curve edition
// Alternating inner/outer control points create tight star-shaped folds.
// Low spline tension makes the curve hug control points so folds are real,
// not averaged away. At higher levels some cells are visited 2–4 times,
// producing multi-segment tiles.
//
// Run: node generate-mobi-levels.js
// Output: assets/data/mobi-levels.json  +  mobi-previews/*.svg

const fs   = require('fs');
const path = require('path');

// ── Seeded PRNG ───────────────────────────────────────────────────────────────
function mkRng(seed) {
  let s = (seed >>> 0);
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ── Cardinal / Catmull-Rom spline with tension ────────────────────────────────
// tension=1.0 → standard Catmull-Rom (smooth), tension<1 → hugs control pts
function crPt(p0, p1, p2, p3, t, tension) {
  const t2 = t*t, t3 = t2*t;
  const h00 =  2*t3 - 3*t2 + 1;
  const h10 =    t3 - 2*t2 + t;
  const h01 = -2*t3 + 3*t2;
  const h11 =    t3 -   t2;
  const m1x = tension * (p2[0] - p0[0]) * 0.5;
  const m1y = tension * (p2[1] - p0[1]) * 0.5;
  const m2x = tension * (p3[0] - p1[0]) * 0.5;
  const m2y = tension * (p3[1] - p1[1]) * 0.5;
  return [
    h00*p1[0] + h10*m1x + h01*p2[0] + h11*m2x,
    h00*p1[1] + h10*m1y + h01*p2[1] + h11*m2y,
  ];
}

function sampleClosed(pts, n, tension) {
  const N   = pts.length;
  const spn = Math.ceil(n / N);
  const out = [];
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i-1+N)%N], p1 = pts[i];
    const p2 = pts[(i+1)%N],   p3 = pts[(i+2)%N];
    for (let j = 0; j < spn; j++) out.push(crPt(p0, p1, p2, p3, j/spn, tension));
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
function exitEdge(fr, fc, tr, tc) {
  const dc = tc - fc, dr = tr - fr;
  if (Math.abs(dc) >= Math.abs(dr)) return dc > 0 ? 'right' : 'left';
  return dr > 0 ? 'bottom' : 'top';
}
const OPP = { top:'bottom', bottom:'top', left:'right', right:'left' };

function subsample(arr, maxN) {
  if (arr.length <= maxN) return arr;
  const out = [];
  for (let i = 0; i < maxN; i++) out.push(arr[Math.round(i*(arr.length-1)/(maxN-1))]);
  return out;
}

// ── Slice → multi-segment tiles ───────────────────────────────────────────────
function sliceCurve(samples) {
  // Build ordered list of consecutive same-cell runs
  const runs = [];
  let cur = null;
  for (const pt of samples) {
    const cell = cellOf(pt[0], pt[1]);
    if (!cell) { cur = null; continue; }
    if (!cur || cur.cell[0] !== cell[0] || cur.cell[1] !== cell[1]) {
      cur = { cell: [...cell], pts: [] };
      runs.push(cur);
    }
    cur.pts.push(pt);
  }
  if (runs.length < 8) return null;

  // Merge consecutive runs in same cell (shouldn't happen, safety net)
  const dedup = [runs[0]];
  for (let i = 1; i < runs.length; i++) {
    const prev = dedup[dedup.length-1];
    if (runs[i].cell[0] === prev.cell[0] && runs[i].cell[1] === prev.cell[1]) {
      prev.pts.push(...runs[i].pts);
    } else {
      dedup.push(runs[i]);
    }
  }

  // Merge first/last if same cell (closed-curve wrap)
  if (dedup.length >= 2) {
    const first = dedup[0], last = dedup[dedup.length-1];
    if (first.cell[0] === last.cell[0] && first.cell[1] === last.cell[1]) {
      first.pts = [...last.pts, ...first.pts];
      dedup.pop();
    }
  }
  if (dedup.length < 8) return null;

  const n = dedup.length;

  // Require all consecutive runs in adjacent cells (no out-of-grid gap)
  for (let i = 0; i < n; i++) {
    const a = dedup[i].cell, b = dedup[(i+1)%n].cell;
    if (Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) > 1) return null;
  }

  // Reject corner-clip runs (too few samples to make a meaningful arc)
  if (dedup.some(r => r.pts.length < 3)) return null;

  // Compute entry/exit edges for every run (the closed-curve makes this circular)
  const withEdges = dedup.map((run, i) => {
    const next = dedup[(i+1)%n], prev = dedup[(i-1+n)%n];
    const exit    = exitEdge(run.cell[0], run.cell[1], next.cell[0], next.cell[1]);
    const fromDir = exitEdge(prev.cell[0], prev.cell[1], run.cell[0], run.cell[1]);
    return { cell: run.cell, pts: run.pts, entryEdge: OPP[fromDir], exitEdge: exit };
  });

  // Group by cell → each unique cell becomes one tile with ≥1 segments
  const tileMap = new Map();
  for (const run of withEdges) {
    const key = `${run.cell[0]},${run.cell[1]}`;
    if (!tileMap.has(key)) tileMap.set(key, { row: run.cell[0], col: run.cell[1], segments: [] });
    const [row, col] = run.cell;
    const localPts = run.pts.map(([x, y]) => [
      Math.round(Math.max(0, Math.min(1, x-col)) * 1e4) / 1e4,
      Math.round(Math.max(0, Math.min(1, y-row)) * 1e4) / 1e4,
    ]);
    tileMap.get(key).segments.push({
      entryEdge:  run.entryEdge,
      exitEdge:   run.exitEdge,
      pathPoints: subsample(localPts, 16),
    });
  }

  const tiles = Array.from(tileMap.values());
  if (tiles.length < 10 || tiles.length > 63) return null;
  if (tiles.some(t => t.segments.length > 6)) return null;  // pathologically tangled

  return tiles;
}

// ── Level difficulty parameters ───────────────────────────────────────────────
function levelParams(lvl) {
  const t = (lvl - 1) / 24;   // 0 → 1
  return {
    N:       Math.round(10 + t * 28),    // 10 → 38 control points
    innerR:  1.80 - t * 1.20,            // 1.80 → 0.60
    outerR:  2.60 + t * 1.30,            // 2.60 → 3.90
    tension: 0.90 - t * 0.56,            // 0.90 → 0.34 (tighter at hard levels)
    cxVar:   0.5  + t * 0.5,             // center randomness
  };
}

// ── Generate one level ────────────────────────────────────────────────────────
function generateLevel(levelNum, rng) {
  const { N, innerR, outerR, tension, cxVar } = levelParams(levelNum);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  for (let attempt = 0; attempt < 500; attempt++) {
    const cx = 3.5 + (rng() - 0.5) * cxVar;
    const cy = 3.5 + (rng() - 0.5) * cxVar;
    const ao = rng() * Math.PI * 2;

    // Alternating inner/outer control points with ±30% fuzz on radius
    const ctrl = [];
    for (let i = 0; i < N; i++) {
      const isInner = (i % 2 === 0);
      const rTarget = isInner ? innerR : outerR;
      const rFuzz   = rTarget * (0.70 + rng() * 0.60);
      const r       = clamp(rFuzz, 0.35, 4.20);
      const angle   = ao + (i / N) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / N) * 0.8;
      ctrl.push([
        clamp(cx + Math.cos(angle) * r, 0.35, 7.65),
        clamp(cy + Math.sin(angle) * r, 0.35, 7.65),
      ]);
    }

    const samples = sampleClosed(ctrl, 8000, tension);
    const tiles   = sliceCurve(samples);
    if (!tiles) continue;

    // Must have at least 1 multi-segment tile on level ≥ 8
    if (levelNum >= 8) {
      const multi = tiles.filter(t => t.segments.length >= 2).length;
      if (multi < 1) continue;
    }
    // Levels ≥ 15 require several multi-segment tiles
    if (levelNum >= 15) {
      const multi = tiles.filter(t => t.segments.length >= 2).length;
      if (multi < 3) continue;
    }

    // Scramble rotations
    let allZero = true;
    for (const tile of tiles) {
      tile.initialRotation = Math.floor(rng() * 4);
      if (tile.initialRotation !== 0) allZero = false;
    }
    if (allZero) tiles[Math.floor(rng() * tiles.length)].initialRotation = 1 + Math.floor(rng() * 3);

    return { level: levelNum, tiles };
  }

  throw new Error(`Level ${levelNum}: failed after 500 attempts`);
}

// ── SVG preview for visual spot-checking ─────────────────────────────────────
function levelToSVG(level) {
  const sz = 500, cs = sz / 8;
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}">`,
    `<rect width="${sz}" height="${sz}" fill="#000"/>`,
  ];
  for (let i = 0; i <= 8; i++) {
    lines.push(`<line x1="${i*cs}" y1="0" x2="${i*cs}" y2="${sz}" stroke="rgba(255,255,255,0.18)" stroke-width="0.7"/>`);
    lines.push(`<line x1="0" y1="${i*cs}" x2="${sz}" y2="${i*cs}" stroke="rgba(255,255,255,0.18)" stroke-width="0.7"/>`);
  }
  // Shade multi-segment tiles for quick verification
  for (const tile of level.tiles) {
    if (tile.segments.length >= 2) {
      const x = tile.col*cs, y = tile.row*cs;
      const fill = tile.segments.length === 2 ? 'rgba(255,160,0,0.15)' : 'rgba(255,50,50,0.20)';
      lines.push(`<rect x="${x}" y="${y}" width="${cs}" height="${cs}" fill="${fill}"/>`);
    }
  }
  function pts2d(pts, col, row) {
    if (!pts || pts.length < 2) return '';
    const sx = col*cs, sy = row*cs;
    let d = `M${sx+pts[0][0]*cs},${sy+pts[0][1]*cs}`;
    for (let i = 1; i < pts.length-1; i++) {
      const mx = sx + (pts[i][0]+pts[i+1][0])/2*cs;
      const my = sy + (pts[i][1]+pts[i+1][1])/2*cs;
      d += ` Q${sx+pts[i][0]*cs},${sy+pts[i][1]*cs} ${mx},${my}`;
    }
    const last = pts[pts.length-1];
    d += ` L${sx+last[0]*cs},${sy+last[1]*cs}`;
    return d;
  }
  for (const tile of level.tiles) {
    for (const seg of tile.segments) {
      const d = pts2d(seg.pathPoints, tile.col, tile.row);
      if (d) lines.push(`<path d="${d}" fill="none" stroke="#39FF14" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
  }
  // Segment-count labels on multi tiles
  for (const tile of level.tiles) {
    if (tile.segments.length >= 2) {
      const x = tile.col*cs + cs*0.5, y = tile.row*cs + cs*0.5;
      lines.push(`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="13" fill="white" font-family="monospace" font-weight="bold">${tile.segments.length}</text>`);
    }
  }
  lines.push('</svg>');
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────
const NUM_LEVELS  = 25;
const outPath     = path.join(__dirname, 'assets', 'data', 'mobi-levels.json');
const previewsDir = path.join(__dirname, 'mobi-previews');
if (!fs.existsSync(previewsDir)) fs.mkdirSync(previewsDir);

console.log('Generating MOBI levels (complex-curve edition)...\n');
const levels = [];
const t0     = Date.now();

for (let i = 1; i <= NUM_LEVELS; i++) {
  const seed  = 0xd00df00d + i * 0x5555;
  const level = generateLevel(i, mkRng(seed));
  levels.push(level);

  const multi     = level.tiles.filter(t => t.segments.length >= 2).length;
  const totalSegs = level.tiles.reduce((s, t) => s + t.segments.length, 0);
  const maxSegs   = Math.max(...level.tiles.map(t => t.segments.length));
  process.stdout.write(
    `Level ${String(i).padStart(2)}: ${level.tiles.length} tiles, ${totalSegs} segs, ` +
    `${multi} multi-seg tiles (max ${maxSegs} per tile)\n`
  );

  // SVG preview for spot-check levels
  if ([1, 3, 5, 8, 10, 13, 15, 18, 20, 23, 25].includes(i)) {
    const fn = path.join(previewsDir, `level-${String(i).padStart(2,'0')}.svg`);
    fs.writeFileSync(fn, levelToSVG(level));
  }
}

fs.writeFileSync(outPath, JSON.stringify(levels));
console.log(`\nDone in ${((Date.now()-t0)/1000).toFixed(1)}s → ${outPath}`);
console.log(`SVG previews → ${previewsDir}/`);
