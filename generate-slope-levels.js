#!/usr/bin/env node
'use strict';

const ROWS = 8, COLS = 8;

// ── Simulation engine ─────────────────────────────────────────────────────────
function simulateMarble(grid, marbleStart) {
  let r = 0, c = marbleStart, dr = 1, dc = 0;
  const visited = new Set();
  for (let step = 0; step < 200; step++) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return { result: 'fail' };
    const cell = grid[nr][nc];
    if (cell === 'target') return { result: 'win' };
    if (cell === 'wall' || cell === 'platform') {
      if (dc !== 0) { dc = 0; dr = 1; continue; }
      return { result: 'fail' };
    }
    if (cell === 'ramp_right') { r = nr; c = nc; dr = 1; dc =  1; continue; }
    if (cell === 'ramp_left')  { r = nr; c = nc; dr = 1; dc = -1; continue; }
    // empty / marble_start — pass through
    r = nr; c = nc;
    const key = `${r},${c},${dr},${dc}`;
    if (visited.has(key)) return { result: 'fail' };
    visited.add(key);
  }
  return { result: 'fail' };
}

// ── Level generator ────────────────────────────────────────────────────────────
function generateLevel(config) {
  const { level, marbleStart, target, fixedElements } = config;
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
    level: 24, marbleStart: 3,
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
    level: 25, marbleStart: 5,
    target: { row: 7, col: 1 },
    fixedElements: [
      { row: 1, col: 0, type: 'wall' },
      { row: 1, col: 2, type: 'wall' },
      { row: 1, col: 5, type: 'wall' },
      { row: 2, col: 1, type: 'wall' },
      { row: 2, col: 4, type: 'wall' },
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
