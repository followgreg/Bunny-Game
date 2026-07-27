#!/usr/bin/env node
'use strict';

// ── Cell constants ────────────────────────────────────────────────────────────
const CELL = {
  EMPTY:        'empty',
  WALL:         'wall',
  PLATFORM:     'platform',
  RAMP_LEFT:    'ramp_left',
  RAMP_RIGHT:   'ramp_right',
  SLOT:         'slot',
  TARGET:       'target',
  MARBLE_START: 'marble_start',
};

const ROWS = 8;
const COLS = 8;

// ── Simulation engine ─────────────────────────────────────────────────────────
function simulateMarble(grid, startCol) {
  let r = 0, c = startCol, dr = 1, dc = 0;
  const visited = new Set();
  const path = [{ r, c }];
  const MAX_STEPS = 200;

  for (let step = 0; step < MAX_STEPS; step++) {
    const nextR = r + dr;
    const nextC = c + dc;

    if (nextR < 0 || nextR >= ROWS || nextC < 0 || nextC >= COLS) {
      return { result: 'fail', path };
    }

    const nextCell = grid[nextR][nextC];

    if (nextCell === CELL.TARGET) {
      path.push({ r: nextR, c: nextC });
      return { result: 'win', path };
    }

    if (nextCell === CELL.WALL || nextCell === CELL.PLATFORM) {
      if (dc !== 0) { dc = 0; dr = 1; continue; }
      else { return { result: 'fail', path }; }
    }

    if (nextCell === CELL.RAMP_RIGHT) {
      path.push({ r: nextR, c: nextC }); r = nextR; c = nextC;
      dr = 1; dc = 1; continue;
    }

    if (nextCell === CELL.RAMP_LEFT) {
      path.push({ r: nextR, c: nextC }); r = nextR; c = nextC;
      dr = 1; dc = -1; continue;
    }

    path.push({ r: nextR, c: nextC }); r = nextR; c = nextC;
    const key = `${r},${c},${dr},${dc}`;
    if (visited.has(key)) return { result: 'fail', path };
    visited.add(key);
  }

  return { result: 'fail', path };
}

// ── Grid / slot helpers ───────────────────────────────────────────────────────
function cloneGrid(grid) { return grid.map(row => row.slice()); }

function findSlots(grid) {
  const slots = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c] === CELL.SLOT) slots.push({ row: r, col: c });
  return slots;
}

function findMarbleStart(grid) {
  for (let c = 0; c < COLS; c++)
    if (grid[0][c] === CELL.MARBLE_START) return c;
  throw new Error('No MARBLE_START found in row 0');
}

const RAMP_CHOICES = [CELL.EMPTY, CELL.RAMP_LEFT, CELL.RAMP_RIGHT];

function enumerateWinners(grid) {
  const slots = findSlots(grid);
  const startCol = findMarbleStart(grid);
  const N = slots.length;
  const total = Math.pow(3, N);
  const winners = [];

  for (let combo = 0; combo < total; combo++) {
    const assignment = [];
    let tmp = combo;
    for (let i = 0; i < N; i++) {
      assignment.push(RAMP_CHOICES[tmp % 3]);
      tmp = Math.floor(tmp / 3);
    }
    const g = cloneGrid(grid);
    const slotResult = slots.map((s, i) => ({ row: s.row, col: s.col, ramp: assignment[i] }));
    slotResult.forEach(({ row, col, ramp }) => { g[row][col] = ramp; });
    if (simulateMarble(g, startCol).result === 'win') winners.push(slotResult);
  }

  return winners;
}

function isUnique(grid) {
  const winners = enumerateWinners(grid);
  return { unique: winners.length === 1, count: winners.length, winners };
}

// ── Grid builder ──────────────────────────────────────────────────────────────
// marble: [row, col], slots: [[r,c],...], walls: [[r,c],...], target: [row, col]
function buildGrid(marble, slots, walls, target) {
  const grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) row.push(CELL.EMPTY);
    grid.push(row);
  }
  grid[marble[0]][marble[1]] = CELL.MARBLE_START;
  slots.forEach(([r, c]) => { grid[r][c] = CELL.SLOT; });
  walls.forEach(([r, c]) => { grid[r][c] = CELL.WALL; });
  grid[target[0]][target[1]] = CELL.TARGET;
  return grid;
}

// ── Level definitions ─────────────────────────────────────────────────────────
//
// Design pattern for easy levels: all 5 slots sit on straight-fall segments
// (never on diagonal arcs). The one critical ramp slot forces a direction
// change; every other slot must stay EMPTY or marble leaves the target column.
//
// Path notation:
//   M(c)  = marble start col c
//   S(r)  = straight fall through row r
//   RR(r) = ramp_right fires at row r  → marble goes diag right (+col each step)
//   RL(r) = ramp_left  fires at row r  → marble goes diag left  (-col each step)
//   W(r,c)= wall at (r,c) stops horizontal motion, marble resumes straight fall
//   T(r,c)= target

const levelDefs = [

  // ── Easy 1 ───────────────────────────────────────────────────────────────
  // M(3) → S(1) S(2) RR(3) → diag(4,4) → W(5,5) → S(5) S(6) T(7,4)
  // Solution: slot(3,3)=ramp_right, all others empty
  {
    id: 1, difficulty: 'easy',
    grid: buildGrid(
      [0, 3],
      [[1,3],[2,3],[3,3],[5,4],[6,4]],
      [[5,5]],
      [7, 4]
    )
  },

  // ── Easy 2 ───────────────────────────────────────────────────────────────
  // M(5) → S(1) S(2) RL(3) → diag(4,4) → W(5,3) → S(5) S(6) T(7,4)
  // Solution: slot(3,5)=ramp_left, all others empty
  {
    id: 2, difficulty: 'easy',
    grid: buildGrid(
      [0, 5],
      [[1,5],[2,5],[3,5],[5,4],[6,4]],
      [[5,3]],
      [7, 4]
    )
  },

  // ── Easy 3 ───────────────────────────────────────────────────────────────
  // M(4) → S(1) RR(2) → diag(3,5) → W(4,6) → S(4) S(5) S(6) T(7,5)
  // Solution: slot(2,4)=ramp_right, all others empty
  {
    id: 3, difficulty: 'easy',
    grid: buildGrid(
      [0, 4],
      [[1,4],[2,4],[4,5],[5,5],[6,5]],
      [[4,6]],
      [7, 5]
    )
  },

  // ── Easy 4 ───────────────────────────────────────────────────────────────
  // M(4) → S(1) RL(2) → diag(3,3) → W(4,2) → S(4) S(5) S(6) T(7,3)
  // Solution: slot(2,4)=ramp_left, all others empty
  {
    id: 4, difficulty: 'easy',
    grid: buildGrid(
      [0, 4],
      [[1,4],[2,4],[4,3],[5,3],[6,3]],
      [[4,2]],
      [7, 3]
    )
  },

  // ── Easy 5 ───────────────────────────────────────────────────────────────
  // M(2) → S(1) S(2) S(3) RR(4) → diag(5,3) → W(6,4) → S(6) T(7,3)
  // Solution: slot(4,2)=ramp_right, all others empty
  {
    id: 5, difficulty: 'easy',
    grid: buildGrid(
      [0, 2],
      [[1,2],[2,2],[3,2],[4,2],[6,3]],
      [[6,4]],
      [7, 3]
    )
  },

  // ── Easy 6 ───────────────────────────────────────────────────────────────
  // M(6) → S(1) S(2) S(3) RL(4) → diag(5,5) → W(6,4) → S(6) T(7,5)
  // Solution: slot(4,6)=ramp_left, all others empty
  {
    id: 6, difficulty: 'easy',
    grid: buildGrid(
      [0, 6],
      [[1,6],[2,6],[3,6],[4,6],[6,5]],
      [[6,4]],
      [7, 5]
    )
  },

  // ── Easy 7 ───────────────────────────────────────────────────────────────
  // M(3) → S(1) S(2) S(3) S(4) RR(5) → diag(6,4) → W(7,5) → T(7,4)
  // Solution: slot(5,3)=ramp_right, all others empty
  {
    id: 7, difficulty: 'easy',
    grid: buildGrid(
      [0, 3],
      [[1,3],[2,3],[3,3],[4,3],[5,3]],
      [[7,5]],
      [7, 4]
    )
  },

  // ── Easy 8 ───────────────────────────────────────────────────────────────
  // M(5) → S(1) S(2) S(3) S(4) RL(5) → diag(6,4) → W(7,3) → T(7,4)
  // Solution: slot(5,5)=ramp_left, all others empty
  {
    id: 8, difficulty: 'easy',
    grid: buildGrid(
      [0, 5],
      [[1,5],[2,5],[3,5],[4,5],[5,5]],
      [[7,3]],
      [7, 4]
    )
  },

];

// ── Runner ────────────────────────────────────────────────────────────────────
function generateLevels(defs) {
  console.log('=== Verifying easy levels 1-8 ===\n');
  const verified = [];
  let allPass = true;

  defs.forEach(def => {
    const { unique, count, winners } = isUnique(def.grid);
    const status = unique ? 'UNIQUE ✓' : `NOT UNIQUE ✗ (${count} solutions)`;
    console.log(`Level ${def.id}: ${count} winning combination(s) — ${status}`);

    if (!unique) {
      allPass = false;
      winners.slice(0, 3).forEach((w, i) => {
        console.log(`  Solution ${i + 1}:`, w.map(s => `(${s.row},${s.col})=${s.ramp}`).join(', '));
      });
    } else {
      const sol = winners[0];
      const activRamps = sol.filter(s => s.ramp !== CELL.EMPTY);
      console.log(`  Solution: ${activRamps.map(s => `(${s.row},${s.col})=${s.ramp}`).join(', ')}`);
      verified.push({ id: def.id, difficulty: def.difficulty, grid: def.grid, solution: sol });
    }
  });

  console.log(`\n${verified.length}/${defs.length} levels verified unique`);
  if (!allPass) {
    console.error('\nSome levels failed uniqueness — fix their grid definitions before writing JSON.');
    process.exit(1);
  }
  return verified;
}

const verified = generateLevels(levelDefs);

const fs = require('fs');
const path = require('path');
fs.writeFileSync(
  path.join(__dirname, 'slope-levels.json'),
  JSON.stringify({ levels: verified }, null, 2)
);
console.log('\nWrote slope-levels.json');
