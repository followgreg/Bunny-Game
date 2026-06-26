#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const N      = 5;
const TARGET = 25;

// ── RNG (xorshift32) ─────────────────────────────────────────────────────────

function makeRng(seed) {
  let s = ((seed ^ 0xDEADBEEF) >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 0x100000000;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Step 1: Star placement ────────────────────────────────────────────────────
// One star per row + one per column + no two touching (including diagonally).
// Returns starCols[row] = col, or null if backtracking exhausted.

function generateStars(rng) {
  const starCols = new Array(N);
  const usedCols = new Set();

  function bt(row) {
    if (row === N) return true;
    for (const col of shuffle([0, 1, 2, 3, 4], rng)) {
      if (usedCols.has(col)) continue;
      // Only the immediately preceding row can be diagonally adjacent
      if (row > 0 && Math.abs(col - starCols[row - 1]) <= 1) continue;
      starCols[row] = col;
      usedCols.add(col);
      if (bt(row + 1)) return true;
      usedCols.delete(col);
    }
    return false;
  }

  return bt(0) ? starCols : null;
}

// ── Step 2: Region growing ────────────────────────────────────────────────────
// Grows 5 face-connected regions of exactly N cells each, one star per region.
// Returns shapeGrid[r][c] = 1..5, or null after max attempts.

const D4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];

function generateRegions(starCols, rng) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const g  = Array.from({ length: N }, () => new Array(N).fill(0));
    const sz = new Array(N + 1).fill(0);

    // Seed each region at its star's cell
    for (let r = 0; r < N; r++) {
      g[r][starCols[r]] = r + 1;
      sz[r + 1] = 1;
    }

    let assigned = N;

    while (assigned < N * N) {
      // Round-robin: grow each non-full region by one cell (balanced growth)
      const regions = shuffle([1, 2, 3, 4, 5].filter(r => sz[r] < N), rng);
      let progress = false;

      for (const reg of regions) {
        // Collect unassigned cells face-adjacent to this region
        const front = [];
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            if (g[r][c] !== 0) continue;
            for (const [dr, dc] of D4) {
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < N && nc >= 0 && nc < N && g[nr][nc] === reg) {
                front.push([r, c]);
                break;
              }
            }
          }
        }

        if (front.length === 0) continue;
        shuffle(front, rng);
        const [r, c] = front[0];
        g[r][c] = reg;
        sz[reg]++;
        assigned++;
        progress = true;
      }

      if (!progress) break; // stuck — retry
    }

    if (assigned === N * N && sz.slice(1).every(s => s === N)) return g;
  }

  return null;
}

// ── Step 3: Uniqueness solver ─────────────────────────────────────────────────
// Backtracking: one star per row/col/shape, no two touching.
// Returns up to `limit` solutions (each [[row, col], ...]).

function solve(shapeGrid, limit = 2) {
  const solutions  = [];
  const usedCols   = new Array(N).fill(false);
  const usedShapes = new Array(N + 1).fill(false);
  const placed     = []; // [row, col] in row order

  function bt(row) {
    if (solutions.length >= limit) return;
    if (row === N) { solutions.push(placed.slice()); return; }

    for (let col = 0; col < N; col++) {
      if (usedCols[col]) continue;
      const shape = shapeGrid[row][col];
      if (usedShapes[shape]) continue;
      // Adjacency: only row-1 star can touch row (1★/row → at most one)
      if (row > 0 && Math.abs(col - placed[row - 1][1]) <= 1) continue;

      placed.push([row, col]);
      usedCols[col]     = true;
      usedShapes[shape] = true;
      bt(row + 1);
      placed.pop();
      usedCols[col]     = false;
      usedShapes[shape] = false;
    }
  }

  bt(0);
  return solutions;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`Generating ${TARGET} uniquely-solvable 5×5 Star Battle levels...\n`);

const levels = [];
let seed     = 1;
let attempts = 0;

while (levels.length < TARGET) {
  attempts++;
  const rng = makeRng(seed++);

  const starCols  = generateStars(rng);            if (!starCols)  continue;
  const shapeGrid = generateRegions(starCols, rng); if (!shapeGrid) continue;

  const sols = solve(shapeGrid, 2);
  if (sols.length !== 1) continue;

  levels.push({ level: levels.length + 1, shapeGrid, solution: sols[0] });
  process.stdout.write(`  Level ${levels.length}/${TARGET}  (seed ${seed - 1})\n`);
}

console.log(`\nDone — ${attempts} seeds tried.\n`);

// ── Write output ──────────────────────────────────────────────────────────────

const outPath = path.join(__dirname, 'assets', 'data', 'solo-levels.json');
fs.writeFileSync(outPath, JSON.stringify(levels, null, 2));
console.log(`Wrote: ${outPath}`);

// ── Spot-check ────────────────────────────────────────────────────────────────

console.log('\nSpot-checking levels 1, 7, 13, 19, 25...');
let allOk = true;
for (const i of [0, 6, 12, 18, 24]) {
  const { level, shapeGrid, solution } = levels[i];
  const sols = solve(shapeGrid, 2);
  const ok   = sols.length === 1 &&
    solution.every(([r, c], idx) => sols[0][idx][0] === r && sols[0][idx][1] === c);
  allOk = allOk && ok;
  console.log(`  Level ${level}: unique=${sols.length === 1}, solution_match=${ok ? 'yes' : 'NO'} ${ok ? '✓' : '✗'}`);
}
console.log(allOk ? '\nAll spot-checks passed!' : '\nSome spot-checks FAILED!');
