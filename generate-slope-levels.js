#!/usr/bin/env node
'use strict';

// ── Cell constants ────────────────────────────────────────────────────────────
const CELL = {
  EMPTY:        'empty',
  WALL:         'wall',
  PLATFORM:     'platform',
  RAMP_LEFT:    'ramp_left',
  RAMP_RIGHT:   'ramp_right',
  TARGET:       'target',
  MARBLE_START: 'marble_start',
};

const ROWS = 8, COLS = 8;

// ── Seeded LCG PRNG ───────────────────────────────────────────────────────────
function makePRNG(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ── Simulation engine (mirrors slope.js) ─────────────────────────────────────
function simulateMarble(grid, startCol) {
  let r = 0, c = startCol, dr = 1, dc = 0;
  const visited = new Set();
  const path = [{ r, c }];
  for (let step = 0; step < 200; step++) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS)
      return { result: 'fail', path };
    const cell = grid[nr][nc];
    if (cell === CELL.TARGET) { path.push({ r: nr, c: nc }); return { result: 'win', path }; }
    if (cell === CELL.WALL || cell === CELL.PLATFORM) {
      if (dc !== 0) { dc = 0; dr = 1; continue; }
      return { result: 'fail', path };
    }
    if (cell === CELL.RAMP_RIGHT) {
      path.push({ r: nr, c: nc }); r = nr; c = nc; dr = 1; dc = 1; continue;
    }
    if (cell === CELL.RAMP_LEFT) {
      path.push({ r: nr, c: nc }); r = nr; c = nc; dr = 1; dc = -1; continue;
    }
    // EMPTY / MARBLE_START — pass through
    path.push({ r: nr, c: nc }); r = nr; c = nc;
    const key = `${r},${c},${dr},${dc}`;
    if (visited.has(key)) return { result: 'fail', path };
    visited.add(key);
  }
  return { result: 'fail', path };
}

// ── Level definitions ─────────────────────────────────────────────────────────
//
// New mechanic: every non-fixed cell starts as a random ramp.
// Player toggles: RAMP_RIGHT → RAMP_LEFT → EMPTY → RAMP_RIGHT.
// Multiple solutions acceptable; we verify ONE designed solution exists.

const levelDefs = [

  // ── Easy 1 ──────────────────────────────────────────────────────────────────
  // marble(0,3) → fall (1-2,3) → RAMP_RIGHT(3,3) → diag (4,4)
  //   → wall(5,5) stops → fall (5-6,4) → target(7,4)
  {
    id: 1, difficulty: 'easy', seed: 1001,
    marbleStart: [0, 3], target: [7, 4], walls: [[5, 5]],
    solution: [
      { row: 1, col: 3, ramp: CELL.EMPTY },
      { row: 2, col: 3, ramp: CELL.EMPTY },
      { row: 3, col: 3, ramp: CELL.RAMP_RIGHT },
      { row: 4, col: 4, ramp: CELL.EMPTY },
      { row: 5, col: 4, ramp: CELL.EMPTY },
      { row: 6, col: 4, ramp: CELL.EMPTY },
    ],
  },

  // ── Easy 2 ──────────────────────────────────────────────────────────────────
  // marble(0,5) → fall (1-2,5) → RAMP_LEFT(3,5) → diag (4,4)
  //   → wall(5,3) stops → fall (5-6,4) → target(7,4)
  {
    id: 2, difficulty: 'easy', seed: 1002,
    marbleStart: [0, 5], target: [7, 4], walls: [[5, 3]],
    solution: [
      { row: 1, col: 5, ramp: CELL.EMPTY },
      { row: 2, col: 5, ramp: CELL.EMPTY },
      { row: 3, col: 5, ramp: CELL.RAMP_LEFT },
      { row: 4, col: 4, ramp: CELL.EMPTY },
      { row: 5, col: 4, ramp: CELL.EMPTY },
      { row: 6, col: 4, ramp: CELL.EMPTY },
    ],
  },

  // ── Easy 3 ──────────────────────────────────────────────────────────────────
  // marble(0,4) → fall (1,4) → RAMP_RIGHT(2,4) → diag (3,5)
  //   → wall(4,6) stops → fall (4-6,5) → target(7,5)
  {
    id: 3, difficulty: 'easy', seed: 1003,
    marbleStart: [0, 4], target: [7, 5], walls: [[4, 6]],
    solution: [
      { row: 1, col: 4, ramp: CELL.EMPTY },
      { row: 2, col: 4, ramp: CELL.RAMP_RIGHT },
      { row: 3, col: 5, ramp: CELL.EMPTY },
      { row: 4, col: 5, ramp: CELL.EMPTY },
      { row: 5, col: 5, ramp: CELL.EMPTY },
      { row: 6, col: 5, ramp: CELL.EMPTY },
    ],
  },

  // ── Easy 4 ──────────────────────────────────────────────────────────────────
  // marble(0,4) → fall (1,4) → RAMP_LEFT(2,4) → diag (3,3)
  //   → wall(4,2) stops → fall (4-6,3) → target(7,3)
  {
    id: 4, difficulty: 'easy', seed: 1004,
    marbleStart: [0, 4], target: [7, 3], walls: [[4, 2]],
    solution: [
      { row: 1, col: 4, ramp: CELL.EMPTY },
      { row: 2, col: 4, ramp: CELL.RAMP_LEFT },
      { row: 3, col: 3, ramp: CELL.EMPTY },
      { row: 4, col: 3, ramp: CELL.EMPTY },
      { row: 5, col: 3, ramp: CELL.EMPTY },
      { row: 6, col: 3, ramp: CELL.EMPTY },
    ],
  },

  // ── Easy 5 ──────────────────────────────────────────────────────────────────
  // marble(0,2) → fall (1-3,2) → RAMP_RIGHT(4,2) → diag (5,3)
  //   → wall(6,4) stops → fall (6,3) → target(7,3)
  {
    id: 5, difficulty: 'easy', seed: 1005,
    marbleStart: [0, 2], target: [7, 3], walls: [[6, 4]],
    solution: [
      { row: 1, col: 2, ramp: CELL.EMPTY },
      { row: 2, col: 2, ramp: CELL.EMPTY },
      { row: 3, col: 2, ramp: CELL.EMPTY },
      { row: 4, col: 2, ramp: CELL.RAMP_RIGHT },
      { row: 5, col: 3, ramp: CELL.EMPTY },
      { row: 6, col: 3, ramp: CELL.EMPTY },
    ],
  },

  // ── Easy 6 ──────────────────────────────────────────────────────────────────
  // marble(0,6) → fall (1-3,6) → RAMP_LEFT(4,6) → diag (5,5)
  //   → wall(6,4) stops → fall (6,5) → target(7,5)
  {
    id: 6, difficulty: 'easy', seed: 1006,
    marbleStart: [0, 6], target: [7, 5], walls: [[6, 4]],
    solution: [
      { row: 1, col: 6, ramp: CELL.EMPTY },
      { row: 2, col: 6, ramp: CELL.EMPTY },
      { row: 3, col: 6, ramp: CELL.EMPTY },
      { row: 4, col: 6, ramp: CELL.RAMP_LEFT },
      { row: 5, col: 5, ramp: CELL.EMPTY },
      { row: 6, col: 5, ramp: CELL.EMPTY },
    ],
  },

  // ── Easy 7 ──────────────────────────────────────────────────────────────────
  // marble(0,3) → fall (1-4,3) → RAMP_RIGHT(5,3) → diag (6,4)
  //   → wall(7,5) stops → target(7,4)
  {
    id: 7, difficulty: 'easy', seed: 1009,
    marbleStart: [0, 3], target: [7, 4], walls: [[7, 5]],
    solution: [
      { row: 1, col: 3, ramp: CELL.EMPTY },
      { row: 2, col: 3, ramp: CELL.EMPTY },
      { row: 3, col: 3, ramp: CELL.EMPTY },
      { row: 4, col: 3, ramp: CELL.EMPTY },
      { row: 5, col: 3, ramp: CELL.RAMP_RIGHT },
      { row: 6, col: 4, ramp: CELL.EMPTY },
    ],
  },

  // ── Easy 8 ──────────────────────────────────────────────────────────────────
  // marble(0,5) → fall (1-4,5) → RAMP_LEFT(5,5) → diag (6,4)
  //   → wall(7,3) stops → target(7,4)
  {
    id: 8, difficulty: 'easy', seed: 1008,
    marbleStart: [0, 5], target: [7, 4], walls: [[7, 3]],
    solution: [
      { row: 1, col: 5, ramp: CELL.EMPTY },
      { row: 2, col: 5, ramp: CELL.EMPTY },
      { row: 3, col: 5, ramp: CELL.EMPTY },
      { row: 4, col: 5, ramp: CELL.EMPTY },
      { row: 5, col: 5, ramp: CELL.RAMP_LEFT },
      { row: 6, col: 4, ramp: CELL.EMPTY },
    ],
  },

];

// ── Generator ─────────────────────────────────────────────────────────────────
function generateLevel(def) {
  const prng = makePRNG(def.seed);

  // Build base structure with fixed elements only
  const base = Array.from({ length: ROWS }, () => Array(COLS).fill(CELL.EMPTY));
  base[def.marbleStart[0]][def.marbleStart[1]] = CELL.MARBLE_START;
  base[def.target[0]][def.target[1]] = CELL.TARGET;
  (def.walls || []).forEach(([r, c]) => { base[r][c] = CELL.WALL; });
  (def.platforms || []).forEach(([r, c]) => { base[r][c] = CELL.PLATFORM; });

  // Fill all EMPTY cells with random ramps (deterministic via seed)
  const initialGrid = base.map(row =>
    row.map(ct => ct === CELL.EMPTY
      ? (prng() < 0.5 ? CELL.RAMP_RIGHT : CELL.RAMP_LEFT)
      : ct)
  );

  // Verify designed solution wins
  const solutionGrid = initialGrid.map(row => row.slice());
  def.solution.forEach(({ row, col, ramp }) => { solutionGrid[row][col] = ramp; });
  const startCol = def.marbleStart[1];
  const solResult = simulateMarble(solutionGrid, startCol);

  // Check initial state (informational)
  const initResult = simulateMarble(initialGrid, startCol);

  console.log(`Level ${def.id}: solution=${solResult.result}, initial=${initResult.result}`);
  if (solResult.result !== 'win') {
    console.error(`  ✗ ERROR: designed solution does not win!`);
    process.exit(1);
  }
  console.log(`  ✓ Verified`);

  return { id: def.id, difficulty: def.difficulty, grid: initialGrid };
}

// ── Run ───────────────────────────────────────────────────────────────────────
console.log('=== Generating Slope levels (full-grid mechanic) ===\n');
const levels = levelDefs.map(generateLevel);

const fs = require('fs');
const path = require('path');
fs.writeFileSync(
  path.join(__dirname, 'slope-levels.json'),
  JSON.stringify({ levels }, null, 2)
);
console.log('\nWrote slope-levels.json');
