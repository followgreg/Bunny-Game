#!/usr/bin/env node
'use strict';

// Carve-from-rectangle shape generator + Hamiltonian-path solver for SNEK.
// Run: node generate-snek-levels.js
// Output: assets/data/snek-levels.json
//
// Existing entries in snek-levels.json are preserved as-is; only missing
// levels are generated and appended.

const fs   = require('fs');
const path = require('path');

// ── Target cell counts for all 100 levels ─────────────────────────────────────
const TARGETS = [
  // 1-25 (original)
   6,  7,  8,  9, 10,
  11, 12, 13, 14, 15,
  16, 17, 18, 19, 20,
  21, 22, 24, 25, 28,
  30, 33, 35, 36, 40,
  // 26-40 (~42-53 cells)
  42, 43, 44, 44, 45,
  46, 47, 47, 48, 49,
  50, 51, 51, 52, 53,
  // 41-55 (~54-65 cells)
  54, 55, 56, 56, 57,
  58, 59, 59, 60, 61,
  62, 62, 63, 64, 65,
  // 56-70 (~65-77 cells)
  65, 66, 67, 68, 68,
  69, 70, 71, 71, 72,
  73, 74, 74, 75, 77,
  // 71-85 (~77-88 cells)
  77, 78, 79, 80, 80,
  81, 82, 83, 83, 84,
  85, 86, 86, 87, 88,
  // 86-100 (~88-100 cells)
  88, 89, 90, 91, 92,
  92, 93, 94, 95, 96,
  97, 97, 98, 99, 100,
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
  return b;
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
function carveShape(target, rng) {
  const minArea = target + Math.max(3, Math.ceil(target * 0.4));
  const maxArea = target * 2 + 4;

  const rects = [];
  for (let rows = 2; rows <= 14; rows++) {
    for (let cols = 2; cols <= 16; cols++) {
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

  let iters = 0;
  while (cells.length > target && iters++ < 2000) {
    const edge = cells.filter(([r,c]) =>
      DIRS.some(([dr,dc]) => !cellSet.has(k(r+dr,c+dc)))
    );

    const candidates = [];
    for (const [r,c] of edge) {
      const key = k(r,c);
      cellSet.delete(key);
      const rem       = cells.filter(([er,ec]) => !(er===r && ec===c));
      const connected = isConnected(rem);
      const d1        = connected ? degree1Count(rem, cellSet) : 999;
      cellSet.add(key);
      if (!connected || d1 > 2) continue;

      const isEven       = (r+c)%2 === 0;
      const balanceBonus = (balance > 0 && isEven) || (balance < 0 && !isEven) ? 4 : 0;
      const extCount     = DIRS.filter(([dr,dc]) => !cellSet.has(k(r+dr,c+dc))).length;
      candidates.push({ r, c, score: balanceBonus + extCount, isEven });
    }

    if (candidates.length === 0) break;

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

  const minCount = target - 2;
  let extraIters = 0;
  while (!isIrregular(cells) && cells.length > minCount && extraIters++ < 50) {
    const edge  = cells.filter(([r,c]) => DIRS.some(([dr,dc]) => !cellSet.has(k(r+dr,c+dc))));
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
    balance -= (pr+pc)%2===0 ? 1 : -1;
    cellSet.delete(k(pr,pc));
    cells = cells.filter(([r,c]) => !(r===pr && c===pc));
  }

  return cells;
}

// ── Warnsdorff heuristic solver ───────────────────────────────────────────────
// O(n²) — fast but not complete. Provide rng for random tie-breaking.
function solveWarnsdorff(cells, startR, startC, rng) {
  const cellSet = buildSet(cells);
  const total   = cells.length;
  const visited = new Set([k(startR, startC)]);
  const path    = [[startR, startC]];
  let r = startR, c = startC;

  while (path.length < total) {
    const moves = DIRS
      .map(([dr,dc]) => [r+dr, c+dc])
      .filter(([nr,nc]) => cellSet.has(k(nr,nc)) && !visited.has(k(nr,nc)));
    if (moves.length === 0) return null;

    const scored = moves.map(([nr,nc]) => ({
      r: nr, c: nc,
      fwd: DIRS.filter(([dr,dc]) => {
        const nk = k(nr+dr, nc+dc);
        return cellSet.has(nk) && !visited.has(nk);
      }).length,
    }));

    const minFwd = Math.min(...scored.map(s => s.fwd));
    const tied   = scored.filter(s => s.fwd === minFwd);
    const chosen = rng ? tied[Math.floor(rng() * tied.length)] : tied[0];

    r = chosen.r; c = chosen.c;
    visited.add(k(r, c));
    path.push([r, c]);
  }

  return path;
}

// ── Backtracking solver (complete, exponential) ───────────────────────────────
function solveBacktrack(cells, startR, startC, maxIters) {
  const cellSet = buildSet(cells);
  const total   = cells.length;
  const path    = [[startR, startC]];
  const visited = new Set([k(startR, startC)]);
  let found     = false;
  let iters     = 0;

  function bt(r, c) {
    if (found || iters > maxIters) return;
    if (path.length === total) { found = true; return; }
    for (const [dr, dc] of DIRS) {
      if (found || iters > maxIters) return;
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

// ── Find a solvable start cell ────────────────────────────────────────────────
// Key insight: degree-1 cells MUST be path endpoints, so only try those as
// start cells when they exist (shrinks the search from n starts to ≤2).
// Strategy: Warnsdorff (deterministic) → Warnsdorff (random ×5) → backtracking.
function findSolvableStart(cells, rng) {
  const cellSet = buildSet(cells);

  // Identify degree-1 cells — Hamiltonian path must start/end there if any exist
  const d1 = cells.filter(([r,c]) =>
    DIRS.filter(([dr,dc]) => cellSet.has(k(r+dr,c+dc))).length === 1
  );
  const startCandidates = d1.length > 0 ? d1 : cells;

  // Pass 1: Warnsdorff deterministic
  for (const [r, c] of startCandidates) {
    const p = solveWarnsdorff(cells, r, c, null);
    if (p) return { start: [r, c], solution: p };
  }

  // Pass 2: Warnsdorff with random tie-breaking (5 attempts per start cell)
  for (let t = 0; t < 5; t++) {
    const tRng = mkRng((rng() * 0xffffffff) >>> 0);
    for (const [r, c] of startCandidates) {
      const p = solveWarnsdorff(cells, r, c, tRng);
      if (p) return { start: [r, c], solution: p };
    }
  }

  // Pass 3: backtracking fallback with budget scaled to cell count
  const n   = cells.length;
  const max = n <= 25 ? 2_000_000 : n <= 40 ? 500_000 : n <= 60 ? 100_000 : 30_000;
  for (const [r, c] of startCandidates) {
    const p = solveBacktrack(cells, r, c, max);
    if (p) return { start: [r, c], solution: p };
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
const NUM_LEVELS = 100;
const outPath    = path.join(__dirname, 'assets', 'data', 'snek-levels.json');

// Preserve any already-generated levels
const levels = [];
try {
  const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  levels.push(...existing);
  if (levels.length > 0)
    console.log(`Loaded ${levels.length} existing level(s) — generating ${NUM_LEVELS - levels.length} new\n`);
} catch (_) {
  console.log('Generating all 100 levels from scratch\n');
}

const startFrom = levels.length;
const t0        = Date.now();

for (let i = startFrom; i < NUM_LEVELS; i++) {
  const target = TARGETS[i];
  let result   = null;
  let attempts = 0;
  const rng    = mkRng(0xdeadbeef + i * 0x1337);

  while (!result && attempts++ < 500) {
    const rawCells = carveShape(target, rng);
    if (!isIrregular(rawCells)) continue;
    if (Math.abs(bipartiteBalance(rawCells)) > 1) continue;

    const cells = normalise(rawCells);
    const found = findSolvableStart(cells, rng);
    if (found) {
      result = { level: i+1, cells, start: found.start, solution: found.solution };
    }
  }

  if (!result) {
    console.error(`\nLevel ${i+1}: FAILED after ${attempts} attempts`);
    process.exit(1);
  }

  const { distinctRows, distinctCols } = irregularityScore(result.cells);
  const elapsed = ((Date.now()-t0)/1000).toFixed(1);
  console.log(
    `Level ${i+1}: ${result.cells.length} cells  rows:${distinctRows} cols:${distinctCols}  start:[${result.start}]  attempt:${attempts}  t:${elapsed}s`
  );
  printGrid(result.cells);
  levels.push(result);

  // Write incrementally so a crash doesn't lose all work
  fs.writeFileSync(outPath, JSON.stringify(levels, null, 2));
}

console.log(`\nDone — ${levels.length} levels in ${((Date.now()-t0)/1000).toFixed(1)}s`);
