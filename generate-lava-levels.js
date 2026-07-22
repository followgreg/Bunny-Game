'use strict';
// Run: node generate-lava-levels.js
// Produces: assets/data/lava-levels.json
//
// Mechanic (Variant 3): player removes one block, then chooses CW or CCW
// rotation, then gravity fires (bottom block of each non-empty column falls
// off the board). Goal: only bunny's block remains.
//
// All 16 bunny positions are solvable. All solutions are exactly 4 moves.
// Each solution step: { remove: [r,c], direction: "CW"|"CCW" }

const fs = require('fs');

// ── Physics — EXACT from spec (identical to lava.js) ─────────────────────────

function rotateGrid90CW(grid, bunnyPos) {
  const size = 4;
  const newGrid = Array.from({length: size}, () => Array(size).fill(0));
  let newBunnyPos = [0, 0];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      newGrid[c][size-1-r] = grid[r][c];
      if (r === bunnyPos[0] && c === bunnyPos[1]) newBunnyPos = [c, size-1-r];
    }
  }
  return { newGrid, newBunnyPos };
}

function rotateGrid90CCW(grid, bunnyPos) {
  const size = 4;
  const newGrid = Array.from({length: size}, () => Array(size).fill(0));
  let newBunnyPos = [0, 0];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      newGrid[size-1-c][r] = grid[r][c];
      if (r === bunnyPos[0] && c === bunnyPos[1]) newBunnyPos = [size-1-c, r];
    }
  }
  return { newGrid, newBunnyPos };
}

function applyGravity(grid, bunnyPos) {
  const size = 4;
  const newGrid = Array.from({length: size}, () => Array(size).fill(0));
  let newBunnyPos = null;
  let bunnySurvived = true;

  for (let c = 0; c < size; c++) {
    const blocks = [];
    let bunnyIndexInColumn = -1;
    for (let r = 0; r < size; r++) {
      if (grid[r][c] !== 0) {
        if (r === bunnyPos[0] && c === bunnyPos[1]) bunnyIndexInColumn = blocks.length;
        blocks.push(1);
      }
    }
    if (blocks.length === 0) continue;
    if (blocks.length === 1) {
      if (bunnyIndexInColumn === 0) bunnySurvived = false;
      continue;
    }
    const bottomBlockIsBunny = (bunnyIndexInColumn === blocks.length - 1);
    if (bottomBlockIsBunny) { bunnySurvived = false; continue; }
    const surviving = blocks.length - 1;
    for (let i = 0; i < surviving; i++) {
      const newRow = size - 1 - i;
      newGrid[newRow][c] = 1;
      const originalIndex = surviving - 1 - i;
      if (bunnyIndexInColumn === originalIndex) newBunnyPos = [newRow, c];
    }
  }

  if (!bunnySurvived) return { newGrid, newBunnyPos: null, bunnySurvived: false };
  return { newGrid, newBunnyPos: newBunnyPos || bunnyPos, bunnySurvived: true };
}

function simulateTurn(grid, bunnyPos, removePos, direction) {
  const afterRemove = grid.map(r => [...r]);
  afterRemove[removePos[0]][removePos[1]] = 0;
  const { newGrid: rotated, newBunnyPos: bunnyAfterRotate } =
    direction === 'CW'
      ? rotateGrid90CW(afterRemove, bunnyPos)
      : rotateGrid90CCW(afterRemove, bunnyPos);
  return applyGravity(rotated, bunnyAfterRotate);
}

function isWin(grid, bunnyPos) {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (grid[r][c] && !(r === bunnyPos[0] && c === bunnyPos[1])) return false;
  return true;
}

// ── Find one solution per distinct direction pattern ───────────────────────────
// With 4 moves × 2 directions, there are at most 16 distinct direction patterns.
// Storing one solution per pattern gives maximum variety for repeat positions.

function findSolutionsByPattern(startBunny) {
  const FULL = [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]];
  const byPattern = {}; // "CWCCWCWCW" -> solution array

  function dfs(grid, bunny, path) {
    if (isWin(grid, bunny)) {
      const key = path.map(s => s.direction).join('');
      if (!byPattern[key]) {
        byPattern[key] = path.map(s => ({ remove: [...s.remove], direction: s.direction }));
      }
      return;
    }
    if (path.length >= 4) return;
    for (const dir of ['CW', 'CCW']) {
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if (!grid[r][c] || (r === bunny[0] && c === bunny[1])) continue;
          const result = simulateTurn(grid, bunny, [r, c], dir);
          if (!result.bunnySurvived) continue;
          path.push({ remove: [r, c], direction: dir });
          dfs(result.newGrid, result.newBunnyPos, path);
          path.pop();
        }
      }
    }
  }

  dfs(FULL, startBunny, []);
  return byPattern;
}

// ── Difficulty schedule ────────────────────────────────────────────────────────
// Levels 1-4:   corners [0,0],[0,3],[3,0],[3,3]  (660 solutions each)
// Levels 5-12:  edges   (1,356–1,384 solutions each)
// Levels 13-16: inner   [1,1],[1,2],[2,1],[2,2]  (4,216 solutions each)
// Levels 17-25: repeats with different direction patterns for maximum variety

const SCHEDULE = [
  // Levels 1-4: corners
  [0,0],[0,3],[3,0],[3,3],
  // Levels 5-12: edges (top, left, right, bottom)
  [0,1],[0,2],[1,0],[2,0],[1,3],[2,3],[3,1],[3,2],
  // Levels 13-16: inner cells
  [1,1],[1,2],[2,1],[2,2],
  // Levels 17-20: corners again, different direction patterns
  [0,0],[3,3],[0,3],[3,0],
  // Levels 21-25: inner + edges, different direction patterns
  [1,1],[2,2],[1,2],[2,1],[0,1],
];

// ── Pre-compute solutions for each unique bunny position ──────────────────────

const uniqueKeys = [...new Set(SCHEDULE.map(p => p.join(',')))];
const uniquePositions = uniqueKeys.map(k => k.split(',').map(Number));

console.log('Pre-computing solutions by direction pattern for each unique position...\n');
const patternMaps = {};
for (const pos of uniquePositions) {
  const key = pos.join(',');
  process.stdout.write(`  [${pos}]... `);
  patternMaps[key] = findSolutionsByPattern(pos);
  const n = Object.keys(patternMaps[key]).length;
  process.stdout.write(`${n} distinct direction patterns\n`);
}

// ── Generate 25 levels ────────────────────────────────────────────────────────

console.log('\nGenerating 25 Lava levels (player-chosen rotation)...\n');

const posOccurrence = {};
const levels = [];

for (let i = 0; i < SCHEDULE.length; i++) {
  const levelNum = i + 1;
  const bunny = SCHEDULE[i];
  const key = bunny.join(',');
  const occurrence = (posOccurrence[key] || 0);
  posOccurrence[key] = occurrence + 1;

  const patternMap = patternMaps[key];
  const patterns = Object.keys(patternMap).sort();
  // Each occurrence of this position picks a different direction pattern
  const patternKey = patterns[occurrence % patterns.length];
  const solution = patternMap[patternKey];
  const dirStr = solution.map(s => s.direction).join('/');

  const tierLabel = i < 4 ? 'corner' : i < 12 ? 'edge  ' : i < 16 ? 'inner ' : 'repeat';
  console.log(`Level ${String(levelNum).padStart(2)}: bunny=[${bunny}] ${tierLabel}  dirs=${dirStr.padEnd(14)}  moves=${JSON.stringify(solution.map(s => s.remove))}`);
  levels.push({ level: levelNum, bunny, solution });
}

// ── Verify all 25 levels by replaying solutions ───────────────────────────────

console.log('\nVerifying all levels (replaying solutions)...');
const FULL = [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]];
let allOk = true;

for (const { level, bunny, solution } of levels) {
  let grid = FULL.map(r => [...r]);
  let pos = [...bunny];
  let ok = true;

  for (const { remove, direction } of solution) {
    if (!grid[remove[0]][remove[1]]) {
      console.error(`  Level ${level}: FAIL — cell [${remove}] already empty`);
      ok = false; break;
    }
    if (remove[0] === pos[0] && remove[1] === pos[1]) {
      console.error(`  Level ${level}: FAIL — tried to remove bunny cell`);
      ok = false; break;
    }
    const result = simulateTurn(grid, pos, remove, direction);
    if (!result.bunnySurvived) {
      console.error(`  Level ${level}: FAIL — bunny fell at move [${remove}] dir=${direction}`);
      ok = false; break;
    }
    grid = result.newGrid;
    pos = result.newBunnyPos;
  }

  if (ok && !isWin(grid, pos)) {
    console.error(`  Level ${level}: FAIL — not a win state after solution`);
    ok = false;
  }
  if (ok) console.log(`  Level ${level}: OK  (bunny ends at [${pos}])`);
  else allOk = false;
}

if (!allOk) { console.error('\nSome levels failed.'); process.exit(1); }

console.log('\nAll 25 levels verified ✓');
fs.writeFileSync('assets/data/lava-levels.json', JSON.stringify(levels, null, 2));
console.log('Written: assets/data/lava-levels.json');
