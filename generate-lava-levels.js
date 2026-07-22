'use strict';
// Run: node generate-lava-levels.js
// Produces: assets/data/lava-levels.json
//
// Mechanic: player removes one block, then board rotates 90° CW, then
// gravity fires (bottom block of each non-empty column falls off the board).
// Goal: bunny is the last block standing.
//
// Note: with a full 4×4 starting grid, only 6 bunny positions are solvable:
//   left-edge: [1,0] [2,0]   inner: [1,1] [1,2] [2,1] [2,2]
// All solutions are exactly 4 moves long.
// Difficulty: left-edge first (more constrained), inner last (less predictable
// rotation path but more valid sequences to discover).

const fs = require('fs');

// ── Physics — EXACT from spec ─────────────────────────────────────────────────

function rotateGrid90CW(grid, bunnyPos) {
  const size = 4;
  const newGrid = Array.from({length: size}, () => Array(size).fill(0));
  let newBunnyPos = [0, 0];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      newGrid[c][size-1-r] = grid[r][c];
      if (r === bunnyPos[0] && c === bunnyPos[1]) {
        newBunnyPos = [c, size-1-r];
      }
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
        if (r === bunnyPos[0] && c === bunnyPos[1]) {
          bunnyIndexInColumn = blocks.length;
        }
        blocks.push(1);
      }
    }

    if (blocks.length === 0) continue;

    if (blocks.length === 1) {
      if (bunnyIndexInColumn === 0) bunnySurvived = false;
      continue;
    }

    const surviving = blocks.length - 1;
    const bottomBlockWasBunny = (bunnyIndexInColumn === blocks.length - 1);
    if (bottomBlockWasBunny) {
      bunnySurvived = false;
      continue;
    }

    for (let i = 0; i < surviving; i++) {
      const newRow = size - 1 - i;
      newGrid[newRow][c] = 1;
      const originalIndexInSurviving = surviving - 1 - i;
      if (bunnyIndexInColumn === originalIndexInSurviving) {
        newBunnyPos = [newRow, c];
      }
    }
  }

  if (!bunnySurvived) return { newGrid, newBunnyPos: null, bunnySurvived: false };
  return { newGrid, newBunnyPos: newBunnyPos || bunnyPos, bunnySurvived: true };
}

function simulateTurn(grid, bunnyPos, removePos) {
  const afterRemove = grid.map(r => [...r]);
  afterRemove[removePos[0]][removePos[1]] = 0;

  const { newGrid: rotated, newBunnyPos: bunnyAfterRotate } =
    rotateGrid90CW(afterRemove, bunnyPos);

  const { newGrid: final, newBunnyPos: finalBunny, bunnySurvived } =
    applyGravity(rotated, bunnyAfterRotate);

  return { grid: final, bunnyPos: finalBunny, bunnySurvived };
}

// ── Win check ─────────────────────────────────────────────────────────────────

function isWin(grid, bunnyPos) {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (grid[r][c] && !(r === bunnyPos[0] && c === bunnyPos[1]))
        return false;
  return true;
}

// ── Find ALL solutions (DFS, depth 4) ────────────────────────────────────────

function findAllSolutions(startBunny) {
  const FULL = [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]];
  const solutions = [];

  function dfs(grid, bunny, path) {
    if (isWin(grid, bunny)) {
      solutions.push(path.map(m => [...m]));
      return;
    }
    if (path.length >= 4) return;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!grid[r][c] || (r === bunny[0] && c === bunny[1])) continue;
        const result = simulateTurn(grid, bunny, [r, c]);
        if (!result.bunnySurvived) continue;
        path.push([r, c]);
        dfs(result.grid, result.bunnyPos, path);
        path.pop();
      }
    }
  }

  dfs(FULL, startBunny, []);
  return solutions;
}

// ── Difficulty schedule ───────────────────────────────────────────────────────
// Only 6 bunny positions are solvable from a full 4×4 grid.
// Left-edge ([1,0],[2,0]): fewer valid sequences → more constrained → levels 1-8
// Inner ([1,1],[1,2],[2,1],[2,2]): more sequences → less predictable → levels 9-25
// Positions repeat across 25 levels; each occurrence gets a distinct solution
// drawn from that position's full solution pool.

const SCHEDULE = [
  // Levels 1-8: left-edge positions (fewer valid paths)
  [1,0],[2,0],[1,0],[2,0],[1,0],[2,0],[1,0],[2,0],
  // Levels 9-17: inner cells, first pass
  [1,1],[2,1],[1,2],[2,2],[1,1],[2,1],[1,2],[2,2],[1,1],
  // Levels 18-25: inner cells, second pass (different solutions)
  [2,1],[1,2],[2,2],[1,1],[2,1],[1,2],[2,2],[1,1],
];

// ── Pre-compute all solutions per position ────────────────────────────────────

console.log('Pre-computing all solutions for each solvable position...');
const SOLVABLE = [[1,0],[2,0],[1,1],[2,1],[1,2],[2,2]];
const allSolutionsMap = {};
for (const pos of SOLVABLE) {
  const key = `${pos[0]},${pos[1]}`;
  const sols = findAllSolutions(pos);
  allSolutionsMap[key] = sols;
  console.log(`  [${pos}]: ${sols.length} distinct solutions`);
}

// ── Generate levels ───────────────────────────────────────────────────────────

console.log('\nGenerating 25 Lava levels (rotate+gravity mechanic)...\n');

// Count occurrences per position to evenly space solution picks
const positionCount = {};
for (const pos of SCHEDULE) {
  const key = `${pos[0]},${pos[1]}`;
  positionCount[key] = (positionCount[key] || 0) + 1;
}

const positionPickIndex = {};
const levels = [];

for (let i = 0; i < SCHEDULE.length; i++) {
  const levelNum = i + 1;
  const bunny = SCHEDULE[i];
  const key = `${bunny[0]},${bunny[1]}`;
  const type = (bunny[1] === 0) ? 'left-edge' : 'inner   ';

  const pool = allSolutionsMap[key];
  const total = positionCount[key];
  const pickIdx = positionPickIndex[key] || 0;
  // Space picks evenly across the solution pool
  const solutionIdx = Math.floor((pickIdx / total) * pool.length);
  positionPickIndex[key] = pickIdx + 1;
  const solution = pool[solutionIdx];

  process.stdout.write(`Level ${String(levelNum).padStart(2)} bunny=[${bunny}] ${type}  `);
  console.log(`solution length=${solution.length}  moves=${JSON.stringify(solution)}`);
  levels.push({ level: levelNum, bunny, solution });
}

// ── Verify ────────────────────────────────────────────────────────────────────

console.log('\nVerifying all levels (replaying solutions)...');
const FULL = [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]];
let allOk = true;

for (const { level, bunny, solution } of levels) {
  let grid = FULL.map(r => [...r]);
  let pos = [...bunny];
  let ok = true;

  for (const move of solution) {
    if (!grid[move[0]][move[1]]) { console.error(`  Level ${level}: FAIL — cell [${move}] already empty`); ok = false; break; }
    if (move[0] === pos[0] && move[1] === pos[1]) { console.error(`  Level ${level}: FAIL — tried to remove bunny cell`); ok = false; break; }
    const result = simulateTurn(grid, pos, move);
    if (!result.bunnySurvived) { console.error(`  Level ${level}: FAIL — bunny fell off at move [${move}]`); ok = false; break; }
    grid = result.grid;
    pos = result.bunnyPos;
  }

  if (ok && !isWin(grid, pos)) { console.error(`  Level ${level}: FAIL — not a win state after solution`); ok = false; }
  if (ok) console.log(`  Level ${level}: OK  (${solution.length} moves, bunny ends at [${pos}])`);
  else allOk = false;
}

if (!allOk) { console.error('\nSome levels failed — check above.'); process.exit(1); }

console.log('\nAll 25 levels verified ✓');
fs.writeFileSync('assets/data/lava-levels.json', JSON.stringify(levels, null, 2));
console.log('Written: assets/data/lava-levels.json');
