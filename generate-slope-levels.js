#!/usr/bin/env node
'use strict';

const ROWS = 8, COLS = 8;

// ── Simulation engine — matches slope.js exactly ─────────────────────────────
const SOLID = { wall: 1, platform: 1, ramp_left: 1, ramp_right: 1 };

function simulateMarble(grid, marbleStart) {
  let r = 0, c = marbleStart, state = 'falling';
  const visited = new Set();
  for (let step = 0; step < 300; step++) {
    const key = `${r},${c},${state}`;
    if (visited.has(key)) return { result: 'fail' };
    visited.add(key);

    if (state === 'falling') {
      const belowR = r + 1;
      if (belowR >= ROWS) return { result: 'fail' };
      const below = grid[belowR][c];
      if (below === 'target') return { result: 'win' };
      if (below === 'empty' || below === 'slot') { r = belowR; continue; }
      if (below === 'ramp_right') {
        if (c + 1 >= COLS) return { result: 'fail' };
        r = belowR; c = c + 1; state = 'moving_right'; continue;
      }
      if (below === 'ramp_left') {
        if (c - 1 < 0) return { result: 'fail' };
        r = belowR; c = c - 1; state = 'moving_left'; continue;
      }
      return { result: 'fail' };
    }

    // Horizontal — support below CURRENT position is checked FIRST
    const dc = state === 'moving_right' ? 1 : -1;
    const aheadC = c + dc;
    const belowR = r + 1;

    if (belowR >= ROWS) return { result: 'fail' };
    if (!SOLID[grid[belowR][c]]) { state = 'falling'; continue; }

    if (aheadC < 0 || aheadC >= COLS) return { result: 'fail' };
    const ahead = grid[r][aheadC];
    if (ahead === 'target') return { result: 'win' };
    if (ahead === 'empty' || ahead === 'slot') { c = aheadC; continue; }
    return { result: 'fail' }; // ramp / wall / platform ahead
  }
  return { result: 'fail' };
}

// ── Solvability ───────────────────────────────────────────────────────────────
// A level is solvable iff SOME assignment of the toggleable cells lets the
// marble reach the target. Only marbleStart / target / fixedElements matter:
// the player can cycle every other cell through ramp_right | ramp_left | empty,
// so the shipped ramp orientations are irrelevant here.
//
// Exhaustive DFS over marble states, branching on each toggleable cell the
// moment its value is first consulted.
function isSolvable({ marbleStart, target, fixedElements }) {
  const OPTIONS = ['ramp_right', 'ramp_left', 'empty'];
  const base = Array.from({ length: ROWS }, () => Array(COLS).fill('__free'));
  base[0][marbleStart] = 'marble_start';
  base[target.row][target.col] = 'target';
  fixedElements.forEach(({ row, col, type }) => { base[row][col] = type; });

  let found = false, nodes = 0;
  const LIMIT = 4_000_000;
  const opts = (r, c, a) => a.has(`${r},${c}`) ? [a.get(`${r},${c}`)]
                          : (base[r][c] === '__free' ? OPTIONS : [base[r][c]]);
  const put = (a, r, c, v) => {
    if (base[r][c] !== '__free') return a;
    const n = new Map(a); n.set(`${r},${c}`, v); return n;
  };

  function dfs(r, c, state, a, seen) {
    if (found || nodes++ > LIMIT) return;
    const key = `${r},${c},${state}`;
    if (seen.has(key)) return;
    seen.add(key);

    if (state === 'falling') {
      const nr = r + 1;
      if (nr >= ROWS) return;
      for (const v of opts(nr, c, a)) {
        const a2 = put(a, nr, c, v);
        if (v === 'target') { found = true; return; }
        if (v === 'empty' || v === 'slot') dfs(nr, c, 'falling', a2, new Set(seen));
        else if (v === 'ramp_right' || v === 'ramp_left') {
          const d = v === 'ramp_right' ? 1 : -1;
          const dc2 = c + d, st = d === 1 ? 'moving_right' : 'moving_left';
          if (dc2 >= 0 && dc2 < COLS) {
            for (const dv of opts(nr, dc2, a2)) {
              const a3 = put(a2, nr, dc2, dv);
              if (dv === 'target') { found = true; return; }
              if (dv === 'empty' || dv === 'slot') dfs(nr, dc2, st, a3, new Set(seen));
              if (found) return;
            }
          }
        }
        if (found) return;
      }
      return;
    }

    const d = state === 'moving_right' ? 1 : -1;
    const nc = c + d, br = r + 1;
    if (br >= ROWS) return;
    for (const bv of opts(br, c, a)) {
      const a2 = put(a, br, c, bv);
      if (!SOLID[bv]) dfs(r, c, 'falling', a2, new Set(seen));
      else {
        if (nc < 0 || nc >= COLS) continue;
        for (const av of opts(r, nc, a2)) {
          const a3 = put(a2, r, nc, av);
          if (av === 'target') { found = true; return; }
          if (av === 'empty' || av === 'slot') dfs(r, nc, state, a3, new Set(seen));
          if (found) return;
        }
      }
      if (found) return;
    }
  }

  dfs(0, marbleStart, 'falling', new Map(), new Set());
  return found;
}

// ── Level generator ────────────────────────────────────────────────────────────
function generateLevel(config) {
  const { level, marbleStart, target, fixedElements } = config;

  // Validate the board itself BEFORE burning attempts on ramp fills. Levels 24
  // and 25 once shipped unsolvable because this check did not exist.
  if (fixedElements.some(f => f.row === 1 && f.col === marbleStart))
    throw new Error(`Level ${level}: fixed element directly below the marble start (col ${marbleStart}) — unwinnable`);

  if (!isSolvable(config))
    throw new Error(`Level ${level}: no ramp configuration can reach the target — unwinnable`);

  let attempts = 0;
  while (attempts < 10000) {
    attempts++;

    // Build base grid
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill('empty'));
    grid[0][marbleStart] = 'marble_start';
    grid[target.row][target.col] = 'target';
    fixedElements.forEach(({ row, col, type }) => { grid[row][col] = type; });

    // Fill all remaining empty cells with random ramps
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c] === 'empty')
          grid[r][c] = Math.random() < 0.5 ? 'ramp_right' : 'ramp_left';

    // Reject if marble already wins with random starting config
    if (simulateMarble(grid, marbleStart).result === 'win') continue;

    console.log(`  Level ${level}: accepted after ${attempts} attempt${attempts === 1 ? '' : 's'}`);
    return { level, marbleStart, target, fixedElements, grid };
  }

  throw new Error(`Level ${level}: could not generate valid board after 10000 attempts`);
}

// ── 25 level configs (fixed elements only — ramps are random) ─────────────────
const LEVEL_CONFIGS = [

  // ── Tier 1 (levels 1-5): 0-2 fixed elements ─────────────────────────────────
  {
    level: 1, marbleStart: 3,
    target: { row: 7, col: 6 },
    fixedElements: []
  },
  {
    level: 2, marbleStart: 2,
    target: { row: 7, col: 5 },
    fixedElements: [
      { row: 3, col: 4, type: 'wall' }
    ]
  },
  {
    level: 3, marbleStart: 5,
    target: { row: 7, col: 1 },
    fixedElements: [
      { row: 2, col: 3, type: 'wall' },
      { row: 5, col: 6, type: 'wall' }
    ]
  },
  {
    level: 4, marbleStart: 4,
    target: { row: 6, col: 1 },
    fixedElements: [
      { row: 4, col: 6, type: 'wall' },
      { row: 6, col: 2, type: 'wall' }
    ]
  },
  {
    level: 5, marbleStart: 1,
    target: { row: 7, col: 4 },
    fixedElements: [
      { row: 3, col: 2, type: 'wall' },
      { row: 5, col: 5, type: 'wall' }
    ]
  },

  // ── Tier 2 (levels 6-10): 3-5 fixed elements ────────────────────────────────
  {
    level: 6, marbleStart: 6,
    target: { row: 7, col: 2 },
    fixedElements: [
      { row: 2, col: 4, type: 'wall' },
      { row: 4, col: 1, type: 'wall' },
      { row: 6, col: 5, type: 'wall' }
    ]
  },
  {
    level: 7, marbleStart: 3,
    target: { row: 5, col: 7 },
    fixedElements: [
      { row: 1, col: 5, type: 'wall' },
      { row: 3, col: 2, type: 'wall' },
      { row: 5, col: 6, type: 'wall' },
      { row: 6, col: 1, type: 'wall' }
    ]
  },
  {
    level: 8, marbleStart: 5,
    target: { row: 7, col: 0 },
    fixedElements: [
      { row: 2, col: 2, type: 'wall' },
      { row: 4, col: 5, type: 'wall' },
      { row: 5, col: 7, type: 'wall' },
      { row: 6, col: 3, type: 'wall' }
    ]
  },
  {
    level: 9, marbleStart: 2,
    target: { row: 6, col: 6 },
    fixedElements: [
      { row: 1, col: 4, type: 'wall' },
      { row: 3, col: 1, type: 'wall' },
      { row: 5, col: 3, type: 'wall' },
      { row: 5, col: 7, type: 'wall' },
      { row: 7, col: 5, type: 'wall' }
    ]
  },
  {
    level: 10, marbleStart: 6,
    target: { row: 7, col: 3 },
    fixedElements: [
      { row: 2, col: 1, type: 'wall' },
      { row: 3, col: 5, type: 'wall' },
      { row: 4, col: 7, type: 'wall' },
      { row: 5, col: 2, type: 'wall' },
      { row: 6, col: 4, type: 'wall' }
    ]
  },

  // ── Tier 3 (levels 11-15): 5-7 fixed elements ───────────────────────────────
  {
    level: 11, marbleStart: 4,
    target: { row: 7, col: 1 },
    fixedElements: [
      { row: 1, col: 6, type: 'wall' },
      { row: 2, col: 3, type: 'wall' },
      { row: 3, col: 7, type: 'wall' },
      { row: 4, col: 1, type: 'wall' },
      { row: 5, col: 4, type: 'wall' },
      { row: 6, col: 2, type: 'wall' }
    ]
  },
  {
    level: 12, marbleStart: 1,
    target: { row: 6, col: 5 },
    fixedElements: [
      { row: 1, col: 3, type: 'wall' },
      { row: 2, col: 6, type: 'wall' },
      { row: 3, col: 4, type: 'wall' },
      { row: 4, col: 2, type: 'wall' },
      { row: 5, col: 7, type: 'wall' },
      { row: 6, col: 0, type: 'wall' }
    ]
  },
  {
    level: 13, marbleStart: 7,
    target: { row: 7, col: 3 },
    fixedElements: [
      { row: 1, col: 5, type: 'wall' },
      { row: 2, col: 2, type: 'wall' },
      { row: 3, col: 6, type: 'wall' },
      { row: 4, col: 0, type: 'wall' },
      { row: 4, col: 4, type: 'wall' },
      { row: 5, col: 3, type: 'wall' },
      { row: 6, col: 6, type: 'wall' }
    ]
  },
  {
    level: 14, marbleStart: 0,
    target: { row: 7, col: 4 },
    fixedElements: [
      { row: 1, col: 2, type: 'wall' },
      { row: 2, col: 5, type: 'wall' },
      { row: 3, col: 1, type: 'wall' },
      { row: 3, col: 7, type: 'wall' },
      { row: 4, col: 3, type: 'wall' },
      { row: 5, col: 6, type: 'wall' },
      { row: 6, col: 1, type: 'wall' }
    ]
  },
  {
    level: 15, marbleStart: 5,
    target: { row: 5, col: 2 },
    fixedElements: [
      { row: 1, col: 1, type: 'wall' },
      { row: 2, col: 4, type: 'wall' },
      { row: 2, col: 7, type: 'wall' },
      { row: 3, col: 3, type: 'wall' },
      { row: 4, col: 6, type: 'wall' },
      { row: 5, col: 0, type: 'wall' },
      { row: 6, col: 5, type: 'wall' }
    ]
  },

  // ── Tier 4 (levels 16-20): 7-9 fixed elements ───────────────────────────────
  {
    level: 16, marbleStart: 3,
    target: { row: 7, col: 7 },
    fixedElements: [
      { row: 1, col: 0, type: 'wall' },
      { row: 1, col: 4, type: 'wall' },
      { row: 2, col: 6, type: 'wall' },
      { row: 3, col: 2, type: 'wall' },
      { row: 4, col: 5, type: 'wall' },
      { row: 5, col: 1, type: 'wall' },
      { row: 5, col: 7, type: 'wall' },
      { row: 6, col: 3, type: 'wall' }
    ]
  },
  {
    level: 17, marbleStart: 6,
    target: { row: 6, col: 1 },
    fixedElements: [
      { row: 1, col: 3, type: 'wall' },
      { row: 2, col: 0, type: 'wall' },
      { row: 2, col: 7, type: 'wall' },
      { row: 3, col: 4, type: 'wall' },
      { row: 4, col: 2, type: 'wall' },
      { row: 4, col: 6, type: 'wall' },
      { row: 5, col: 5, type: 'wall' },
      { row: 6, col: 0, type: 'wall' }
    ]
  },
  {
    level: 18, marbleStart: 2,
    target: { row: 7, col: 6 },
    fixedElements: [
      { row: 1, col: 5, type: 'wall' },
      { row: 2, col: 1, type: 'wall' },
      { row: 3, col: 3, type: 'wall' },
      { row: 3, col: 7, type: 'wall' },
      { row: 4, col: 0, type: 'wall' },
      { row: 4, col: 4, type: 'wall' },
      { row: 5, col: 2, type: 'wall' },
      { row: 5, col: 6, type: 'wall' },
      { row: 6, col: 5, type: 'wall' }
    ]
  },
  {
    level: 19, marbleStart: 7,
    target: { row: 7, col: 2 },
    fixedElements: [
      { row: 1, col: 2, type: 'wall' },
      { row: 1, col: 6, type: 'wall' },
      { row: 2, col: 4, type: 'wall' },
      { row: 3, col: 0, type: 'wall' },
      { row: 3, col: 5, type: 'wall' },
      { row: 4, col: 3, type: 'wall' },
      { row: 4, col: 7, type: 'wall' },
      { row: 5, col: 1, type: 'wall' },
      { row: 6, col: 4, type: 'wall' }
    ]
  },
  {
    level: 20, marbleStart: 1,
    target: { row: 6, col: 6 },
    fixedElements: [
      { row: 1, col: 4, type: 'wall' },
      { row: 2, col: 2, type: 'wall' },
      { row: 2, col: 6, type: 'wall' },
      { row: 3, col: 1, type: 'wall' },
      { row: 3, col: 5, type: 'wall' },
      { row: 4, col: 3, type: 'wall' },
      { row: 4, col: 7, type: 'wall' },
      { row: 5, col: 0, type: 'wall' },
      { row: 5, col: 4, type: 'wall' }
    ]
  },

  // ── Tier 5 (levels 21-25): 9-12 fixed elements ──────────────────────────────
  {
    level: 21, marbleStart: 4,
    target: { row: 7, col: 0 },
    fixedElements: [
      { row: 1, col: 1, type: 'wall' },
      { row: 1, col: 6, type: 'wall' },
      { row: 2, col: 3, type: 'wall' },
      { row: 2, col: 7, type: 'wall' },
      { row: 3, col: 2, type: 'wall' },
      { row: 3, col: 5, type: 'wall' },
      { row: 4, col: 0, type: 'wall' },
      { row: 4, col: 4, type: 'wall' },
      { row: 5, col: 3, type: 'wall' },
      { row: 6, col: 6, type: 'wall' }
    ]
  },
  {
    level: 22, marbleStart: 0,
    target: { row: 7, col: 5 },
    fixedElements: [
      { row: 1, col: 2, type: 'wall' },
      { row: 1, col: 5, type: 'wall' },
      { row: 2, col: 0, type: 'wall' },
      { row: 2, col: 4, type: 'wall' },
      { row: 3, col: 3, type: 'wall' },
      { row: 3, col: 7, type: 'wall' },
      { row: 4, col: 1, type: 'wall' },
      { row: 4, col: 6, type: 'wall' },
      { row: 5, col: 2, type: 'wall' },
      { row: 5, col: 5, type: 'wall' }
    ]
  },
  {
    level: 23, marbleStart: 6,
    target: { row: 6, col: 3 },
    fixedElements: [
      { row: 1, col: 0, type: 'wall' },
      { row: 1, col: 3, type: 'wall' },
      { row: 1, col: 7, type: 'wall' },
      { row: 2, col: 2, type: 'wall' },
      { row: 2, col: 5, type: 'wall' },
      { row: 3, col: 1, type: 'wall' },
      { row: 3, col: 4, type: 'wall' },
      { row: 4, col: 3, type: 'wall' },
      { row: 4, col: 6, type: 'wall' },
      { row: 5, col: 0, type: 'wall' },
      { row: 5, col: 5, type: 'wall' }
    ]
  },
  {
    level: 24, marbleStart: 5,
    target: { row: 7, col: 7 },
    fixedElements: [
      { row: 1, col: 1, type: 'wall' },
      { row: 1, col: 4, type: 'wall' },
      { row: 2, col: 0, type: 'wall' },
      { row: 2, col: 3, type: 'wall' },
      { row: 2, col: 6, type: 'wall' },
      { row: 3, col: 2, type: 'wall' },
      { row: 3, col: 5, type: 'wall' },
      { row: 4, col: 1, type: 'wall' },
      { row: 4, col: 4, type: 'wall' },
      { row: 4, col: 7, type: 'wall' },
      { row: 5, col: 3, type: 'wall' }
    ]
  },
  {
    level: 25, marbleStart: 4,
    target: { row: 7, col: 1 },
    fixedElements: [
      { row: 1, col: 0, type: 'wall' },
      { row: 1, col: 2, type: 'wall' },
      { row: 1, col: 5, type: 'wall' },
      { row: 2, col: 1, type: 'wall' },
      { row: 2, col: 7, type: 'wall' },
      { row: 3, col: 0, type: 'wall' },
      { row: 3, col: 3, type: 'wall' },
      { row: 3, col: 6, type: 'wall' },
      { row: 4, col: 2, type: 'wall' },
      { row: 4, col: 5, type: 'wall' },
      { row: 5, col: 4, type: 'wall' }
    ]
  },

];

// ── Run ───────────────────────────────────────────────────────────────────────
console.log('=== Generating 25 Slope levels ===\n');

const levels = LEVEL_CONFIGS.map(generateLevel);

const fs = require('fs');
const path = require('path');
fs.writeFileSync(
  path.join(__dirname, 'slope-levels.json'),
  JSON.stringify(levels, null, 2)
);

console.log(`\nWrote slope-levels.json (${levels.length} levels)`);
