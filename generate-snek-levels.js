#!/usr/bin/env node
'use strict';

// Carve-from-rectangle shape generator + Hamiltonian-path solver for SNEK.
// Run: node generate-snek-levels.js
// Output: assets/data/snek-levels.json

const fs   = require('fs');
const path = require('path');

// ── Target cell counts per level ──────────────────────────────────────────────
const TARGETS = [
   6,  7,  8,  9, 10,
  11, 12, 13, 14, 15,
  16, 17, 18, 19, 20,
  21, 22, 24, 25, 28,
  30, 33, 35, 36, 40,
];

// ── Seeded PRNG (LCG) ─────────────────────────────────────────────────────────
function mkRng(seed) {
  let s = (seed >>> 0);
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ── Core geometry helpers ─────────────────────────────────────────────────────
const DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
const k    = (r, c) => `${r},${c}`;

function buildSet(cells) {
  return new Set(cells.map(([r,c]) => k(r,c)));
}

function isConnected(cells) {
  if (cells.length <= 1) return true;
  const set     = buildSet(cells);
  const visited = new Set();
  const start   = cells[0];
  visited.add(k(start[0], start[1]));
  const queue   = [start];
  while (queue.length) {
    const [r, c] = queue.shift();
    for (const [dr, dc] of DIRS) {
      const key = k(r+dr, c+dc);
      if (set.has(key) && !visited.has(key)) { visited.add(key); queue.push([r+dr, c+dc]); }
    }
  }
  return visited.size === cells.length;
}

function degree1Count(cells, cellSet) {
  return cells.filter(([r,c]) =>
    DIRS.filter(([dr,dc]) => cellSet.has(k(r+dr,c+dc))).length === 1
  ).length;
}

function bipartiteBalance(cells) {
  let b = 0;
  for (const [r,c] of cells) b += (r+c)%2 === 0 ? 1 : -1;
  return b; // positive = more even-coloured, negative = more odd-coloured
}

function irregularityScore(cells) {
  const rowC = {}, colC = {};
  for (const [r,c] of cells) {
    rowC[r] = (rowC[r]||0)+1;
    colC[c] = (colC[c]||0)+1;
  }
  return {
    distinctRows: new Set(Object.values(rowC)).size,
    distinctCols: new Set(Object.values(colC)).size,
  };
}

function isIrregular(cells) {
  const n         = cells.length;
  const threshold = n >= 15 ? 3 : 2;
  const { distinctRows, distinctCols } = irregularityScore(cells);
  return distinctRows >= threshold && distinctCols >= threshold;
}

function normalise(cells) {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([,c]) => c));
  return cells.map(([r,c]) => [r-minR, c-minC]);
}

// ── Shape carver ──────────────────────────────────────────────────────────────
// Starts from a random base rectangle whose area > target, then removes edge
// cells one-by-one while:
//   (a) maintaining connectivity,
//   (b) keeping degree-1 (dead-end) vertex count ≤ 2,
//   (c) biasing toward cells that balance bipartite colouring,
//   (d) biasing toward corner-like cells to create notches.

function carveShape(target, rng) {
  const minArea = target + Math.max(3, Math.ceil(target * 0.4));
  const maxArea = target * 2 + 4;

  // Enumerate valid rectangle dimensions
  const rects = [];
  for (let rows = 2; rows <= 12; rows++) {
    for (let cols = 2; cols <= 15; cols++) {
      const area = rows * cols;
      if (area >= minArea && area <= maxArea) rects.push([rows, cols]);
    }
  }
  if (rects.length === 0) rects.push([2, target + 2]);

  const [baseRows, baseCols] = rects[Math.floor(rng() * rects.length)];

  let cells = [];
  for (let r = 0; r < baseRows; r++)
    for (let c = 0; c < baseCols; c++)
      cells.push([r, c]);

  let cellSet = buildSet(cells);
  let balance = bipartiteBalance(cells);

  // ── Main carve loop ──
  let iters = 0;
  while (cells.length > target && iters++ < 2000) {
    const edge = cells.filter(([r,c]) =>
      DIRS.some(([dr,dc]) => !cellSet.has(k(r+dr,c+dc)))
    );

    const candidates = [];
    for (const [r,c] of edge) {
      const key = k(r,c);

      // Tentatively remove
      cellSet.delete(key);
      const rem       = cells.filter(([er,ec]) => !(er===r && ec===c));
      const connected = isConnected(rem);
      const d1        = connected ? degree1Count(rem, cellSet) : 999;
      cellSet.add(key);

      if (!connected || d1 > 2) continue;

      // Score: balance bonus + corner bonus
      const isEven       = (r+c)%2 === 0;
      const balanceBonus = (balance > 0 && isEven) || (balance < 0 && !isEven) ? 4 : 0;
      const extCount     = DIRS.filter(([dr,dc]) => !cellSet.has(k(r+dr,c+dc))).length;
      const score        = balanceBonus + extCount;  // always ≥ 1
      candidates.push({ r, c, score, isEven });
    }

    if (candidates.length === 0) break;

    // Weighted-random pick (weight = score²)
    const totalW = candidates.reduce((s, x) => s + x.score * x.score, 0);
    let pick     = rng() * totalW;
    let chosen   = candidates[0];
    for (const cand of candidates) {
      pick -= cand.score * cand.score;
      if (pick <= 0) { chosen = cand; break; }
    }

    const chosenKey = k(chosen.r, chosen.c);
    balance -= chosen.isEven ? 1 : -1;
    cellSet.delete(chosenKey);
    cells = cells.filter(([r,c]) => !(r===chosen.r && c===chosen.c));
  }

  // ── Extra carving to enforce irregularity (±2 cell tolerance) ──
  const minCount  = target - 2;
  let extraIters  = 0;
  while (!isIrregular(cells) && cells.length > minCount && extraIters++ < 50) {
    const edge = cells.filter(([r,c]) =>
      DIRS.some(([dr,dc]) => !cellSet.has(k(r+dr,c+dc)))
    );
    const valid = edge.filter(([r,c]) => {
      const key = k(r,c);
      cellSet.delete(key);
      const rem = cells.filter(([er,ec]) => !(er===r && ec===c));
      const ok  = isConnected(rem) && degree1Count(rem, cellSet) <= 2;
      cellSet.add(key);
      return ok;
    });
    if (valid.length === 0) break;
    const [pr,pc] = valid[Math.floor(rng() * valid.length)];
    const pk = k(pr,pc);
    balance -= (pr+pc)%2===0 ? 1 : -1;
    cellSet.delete(pk);
    cells = cells.filter(([r,c]) => !(r===pr && c===pc));
  }

  return cells;
}

// ── Hamiltonian-path solver ───────────────────────────────────────────────────
function solve(cells, startR, startC) {
  const cellSet = new Set(cells.map(([r,c]) => k(r,c)));
  const total   = cells.length;
  const path    = [[startR, startC]];
  const visited = new Set([k(startR, startC)]);
  let found     = false;
  let iters     = 0;
  const MAX     = 2_000_000;

  function bt(r, c) {
    if (found || iters > MAX) return;
    if (path.length === total) { found = true; return; }
    for (const [dr, dc] of DIRS) {
      if (found || iters > MAX) return;
      const nr = r+dr, nc = c+dc, key = k(nr,nc);
      if (cellSet.has(key) && !visited.has(key)) {
        visited.add(key); path.push([nr,nc]);
        bt(nr, nc);
        if (!found) { path.pop(); visited.delete(key); iters++; }
      }
    }
  }

  if (!cellSet.has(k(startR, startC))) return null;
  bt(startR, startC);
  return found ? path : null;
}

function findSolvableStart(cells) {
  for (const [r, c] of cells) {
    const path = solve(cells, r, c);
    if (path) return { start: [r, c], solution: path };
  }
  return null;
}

// ── Visual grid printer ───────────────────────────────────────────────────────
function printGrid(cells) {
  const maxR = Math.max(...cells.map(([r]) => r));
  const maxC = Math.max(...cells.map(([,c]) => c));
  const set  = buildSet(cells);
  for (let r = 0; r <= maxR; r++) {
    let row = '';
    for (let c = 0; c <= maxC; c++) row += set.has(k(r,c)) ? '■ ' : '  ';
    console.log('  ' + row.trimEnd());
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
const NUM_LEVELS = 25;
const levels     = [];
const t0         = Date.now();

for (let i = 0; i < NUM_LEVELS; i++) {
  const target = TARGETS[i];
  let result   = null;
  let attempts = 0;
  const rng    = mkRng(0xdeadbeef + i * 0x1337);

  while (!result && attempts++ < 300) {
    const rawCells = carveShape(target, rng);

    // Quick structural filters before running the expensive solver
    if (!isIrregular(rawCells)) continue;
    if (Math.abs(bipartiteBalance(rawCells)) > 1) continue;

    const cells = normalise(rawCells);
    const found = findSolvableStart(cells);
    if (found) {
      result = { level: i+1, cells, start: found.start, solution: found.solution };
    }
  }

  if (!result) {
    console.error(`\nLevel ${i+1}: FAILED after ${attempts} attempts — adjust seeds or thresholds`);
    process.exit(1);
  }

  const { distinctRows, distinctCols } = irregularityScore(result.cells);
  console.log(
    `\nLevel ${i+1}: ${result.cells.length} cells, start [${result.start}], ` +
    `row-widths: ${distinctRows}, col-heights: ${distinctCols} (attempt ${attempts})`
  );
  printGrid(result.cells);
  levels.push(result);
}

if (levels.length !== NUM_LEVELS) {
  console.error(`Expected ${NUM_LEVELS} levels, got ${levels.length}`);
  process.exit(1);
}

const outPath = path.join(__dirname, 'assets', 'data', 'snek-levels.json');
fs.writeFileSync(outPath, JSON.stringify(levels, null, 2));
console.log(`\nWrote ${outPath} (${levels.length} verified levels) in ${((Date.now()-t0)/1000).toFixed(1)}s`);
