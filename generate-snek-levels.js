#!/usr/bin/env node
'use strict';

// Hamiltonian-path backtracking solver + level generator for SNEK.
// Run: node generate-snek-levels.js
// Output: assets/data/snek-levels.json

const fs = require('fs');
const path = require('path');

// ── Shape candidate bank ──────────────────────────────────────────────────────
// Each level has a primary shape + fallbacks.
// Rules to keep shapes solvable:
//   - At most 2 cells with degree 1 (dead ends), since ≥3 dead ends makes
//     Hamiltonian path structurally impossible.
//   - |black_cells - white_cells| ≤ 1 in the bipartite grid colouring.

// Helper: build a rectangle
function rect(rows, cols, minR = 0, minC = 0) {
  const out = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push([r + minR, c + minC]);
  return out;
}

// Helper: subtract cells from a shape
function minus(cells, ...remove) {
  const skip = new Set(remove.map(([r, c]) => `${r},${c}`));
  return cells.filter(([r, c]) => !skip.has(`${r},${c}`));
}

const LEVELS_CANDIDATES = [
  // ── Tier 1: 6-10 cells ──────────────────────────────────────────────────

  // Level 1 (6): L-shape — two dead ends only
  [
    [[0,0],[1,0],[2,0],[2,1],[2,2],[2,3]],
    rect(2,3),
  ],

  // Level 2 (7): C-shape — two dead ends only
  [
    [[0,0],[0,1],[0,2],[1,2],[2,2],[2,1],[2,0]],
    [[0,0],[0,1],[0,2],[0,3],[1,3],[2,3],[2,2]],
  ],

  // Level 3 (8): 2×4 rectangle — no dead ends
  [
    rect(2,4),
    [[0,0],[0,1],[1,1],[1,2],[2,2],[2,3],[3,3],[0,2]],
  ],

  // Level 4 (9): 3×3 — no dead ends
  [
    rect(3,3),
    [[0,0],[0,1],[0,2],[1,0],[1,2],[2,0],[2,1],[2,2],[1,1]],
  ],

  // Level 5 (10): rectangular ring (3×4 minus interior 1×2)
  [
    [[0,0],[0,1],[0,2],[0,3],[1,0],[1,3],[2,0],[2,1],[2,2],[2,3]],
    rect(2,5),
  ],

  // ── Tier 2: 11-16 cells ─────────────────────────────────────────────────

  // Level 6 (11): 3×4 minus top-left corner
  [
    minus(rect(3,4), [0,0]),
    rect(1,11),
  ],

  // Level 7 (12): 3×4 rectangle
  [
    rect(3,4),
    rect(2,6),
  ],

  // Level 8 (13): 3×5 minus two bottom corners
  [
    minus(rect(3,5), [2,0], [2,4]),
    rect(1,13),
  ],

  // Level 9 (14): 2×7 rectangle
  [
    rect(2,7),
    rect(2,7),
  ],

  // Level 10 (15): 3×5 rectangle
  [
    rect(3,5),
    rect(1,15),
  ],

  // ── Tier 3: 17-22 cells ─────────────────────────────────────────────────

  // Level 11 (16): 4×4 rectangle
  [
    rect(4,4),
    rect(2,8),
  ],

  // Level 12 (17): 4×4 + extra cell dangling from one side (1 dead end)
  [
    [...rect(4,4), [4,1]],
    rect(1,17),
  ],

  // Level 13 (18): 3×6 rectangle
  [
    rect(3,6),
    rect(2,9),
  ],

  // Level 14 (19): 4×5 minus one interior cell (no dead ends)
  [
    minus(rect(4,5), [1,2]),
    minus(rect(4,5), [2,2]),
  ],

  // Level 15 (20): 4×5 rectangle
  [
    rect(4,5),
    rect(2,10),
  ],

  // ── Tier 4: 23-30 cells ─────────────────────────────────────────────────

  // Level 16 (21): 4×5 + 1 dead-end cell
  [
    [...rect(4,5), [4,2]],
    rect(3,7),
  ],

  // Level 17 (22): 4×6 minus 1 black + 1 white interior cell (keeps balance)
  // (1,1) is black (1+1=2), (2,3) is white (2+3=5) → 11B/11W ✓
  [
    minus(rect(4,6), [1,1], [2,3]),
    rect(2,11),
  ],

  // Level 18 (24): 4×6 rectangle
  [
    rect(4,6),
    rect(3,8),
  ],

  // Level 19 (25): 5×5 rectangle
  [
    rect(5,5),
    rect(1,25),
  ],

  // Level 20 (28): 4×7 rectangle
  [
    rect(4,7),
    rect(2,14),
  ],

  // ── Tier 5: 31-40 cells ─────────────────────────────────────────────────

  // Level 21 (30): 5×6 rectangle
  [
    rect(5,6),
    rect(3,10),
  ],

  // Level 22 (33): 4×8 + 1 dead end
  [
    [...rect(4,8), [4,3]],
    rect(3,11),
  ],

  // Level 23 (35): 5×7 rectangle
  [
    rect(5,7),
    rect(5,7),
  ],

  // Level 24 (36): 6×6 rectangle
  [
    rect(6,6),
    rect(4,9),
  ],

  // Level 25 (40): 5×8 rectangle
  [
    rect(5,8),
    rect(4,10),
  ],
];

// ── Normalise cells so min row/col = 0 ───────────────────────────────────────

function normalise(cells) {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  return cells.map(([r, c]) => [r - minR, c - minC]);
}

// ── Hamiltonian-path solver ───────────────────────────────────────────────────

function solve(cells, startR, startC) {
  const key   = (r, c) => `${r},${c}`;
  const cellSet = new Set(cells.map(([r, c]) => key(r, c)));
  const total = cells.length;
  const visited = new Set([key(startR, startC)]);
  const DIRS  = [[-1,0],[1,0],[0,-1],[0,1]];
  let found   = false;

  function bt(r, c, count) {
    if (found) return;
    if (count === total) { found = true; return; }
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      const k = key(nr, nc);
      if (!found && cellSet.has(k) && !visited.has(k)) {
        visited.add(k);
        bt(nr, nc, count + 1);
        if (!found) visited.delete(k);
      }
    }
  }

  if (!cellSet.has(key(startR, startC))) return false;
  bt(startR, startC, 1);
  return found;
}

function findSolvableStart(cells) {
  for (const [r, c] of cells) {
    if (solve(cells, r, c)) return [r, c];
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const levels = [];

for (let i = 0; i < LEVELS_CANDIDATES.length; i++) {
  const candidates = LEVELS_CANDIDATES[i];
  let result = null;

  for (const rawCells of candidates) {
    const cells = normalise(rawCells);
    const start = findSolvableStart(cells);
    if (start) {
      result = { level: i + 1, cells, start };
      break;
    }
  }

  if (!result) {
    console.error(`Level ${i + 1}: ALL candidates failed — add more shapes!`);
    process.exit(1);
  }

  levels.push(result);
  console.log(`Level ${i + 1}: ${result.cells.length} cells, start [${result.start}] ✓`);
}

if (levels.length !== 25) {
  console.error(`Expected 25 levels, got ${levels.length}`);
  process.exit(1);
}

const outPath = path.join(__dirname, 'assets', 'data', 'snek-levels.json');
fs.writeFileSync(outPath, JSON.stringify(levels, null, 2));
console.log(`\nWrote ${outPath} (${levels.length} verified levels)`);
