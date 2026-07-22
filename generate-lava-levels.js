'use strict';
// Run: node generate-lava-levels.js
// Produces: lava-levels.json with 25 solver-verified levels

const fs = require('fs');

// ── Connectivity ──────────────────────────────────────────────────────────────
function isEdge(r, c) {
  return r === 0 || r === 3 || c === 0 || c === 3;
}

function stableSet(grid) {
  const visited = new Set();
  const queue = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (isEdge(r, c) && grid[r][c] === 1) {
        const k = `${r},${c}`;
        if (!visited.has(k)) { visited.add(k); queue.push([r, c]); }
      }
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  while (queue.length) {
    const [r, c] = queue.pop();
    for (const [dr, dc] of dirs) {
      const nr = r+dr, nc = c+dc;
      if (nr < 0 || nr > 3 || nc < 0 || nc > 3) continue;
      const k = `${nr},${nc}`;
      if (!visited.has(k) && grid[nr][nc] === 1) { visited.add(k); queue.push([nr, nc]); }
    }
  }
  return visited;
}

function isBunnyConnected(grid, bunny) {
  return stableSet(grid).has(`${bunny[0]},${bunny[1]}`);
}

function applyRemovals(grid, cells) {
  const g = grid.map(row => [...row]);
  for (const [r, c] of cells) g[r][c] = 0;
  return g;
}

// ── Removal-set validity ──────────────────────────────────────────────────────
// Per spec: final-state check + each cell individually safe from original grid.
function isValidRemovalSet(grid, bunny, removals) {
  // 1. Final state: all N removed
  if (!isBunnyConnected(applyRemovals(grid, removals), bunny)) return false;
  // 2. Each cell alone (order-independence approximation)
  for (const cell of removals) {
    if (!isBunnyConnected(applyRemovals(grid, [cell]), bunny)) return false;
  }
  return true;
}

// Count valid removal sets of size n, up to cap
function findValidSets(grid, bunny, n, cap = 20) {
  const candidates = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (grid[r][c] === 1 && !(r === bunny[0] && c === bunny[1]))
        candidates.push([r, c]);

  const solutions = [];

  function choose(start, chosen) {
    if (solutions.length >= cap) return;
    if (chosen.length === n) {
      if (isValidRemovalSet(grid, bunny, chosen))
        solutions.push(chosen.map(x => [...x]));
      return;
    }
    for (let i = start; i < candidates.length; i++) {
      chosen.push(candidates[i]);
      choose(i + 1, chosen);
      chosen.pop();
      if (solutions.length >= cap) return;
    }
  }
  choose(0, []);
  return solutions;
}

// ── Random helpers ────────────────────────────────────────────────────────────
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Board generation ──────────────────────────────────────────────────────────
function generateBoard(filledCount) {
  const grid = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  const edgeCells = [];
  const innerCells = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      (isEdge(r, c) ? edgeCells : innerCells).push([r, c]);

  shuffle(edgeCells); shuffle(innerCells);

  const chosen = [];
  // Seed with at least 3 edge cells for solid anchoring
  const seedEdge = Math.min(3 + randInt(0, 3), edgeCells.length);
  for (let i = 0; i < seedEdge && chosen.length < filledCount; i++) chosen.push(edgeCells[i]);
  for (let i = 0; i < innerCells.length && chosen.length < filledCount; i++) chosen.push(innerCells[i]);

  for (const [r, c] of chosen) grid[r][c] = 1;

  // All filled cells must be frame-connected from the start
  const stable = stableSet(grid);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (grid[r][c] === 1 && !stable.has(`${r},${c}`)) return null;

  return grid;
}

// ── Level generation ──────────────────────────────────────────────────────────
function generateLevel(levelNum, targetN, maxAlt) {
  const MAX_ATTEMPTS = 10000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const filledCount = randInt(10, 14);
    const grid = generateBoard(filledCount);
    if (!grid) continue;

    const filled = [];
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        if (grid[r][c] === 1) filled.push([r, c]);

    if (filled.length - 1 < targetN) continue;

    // Prefer placing bunny on an inner cell for later levels, any cell for early
    const bunnyCandidates = levelNum >= 11
      ? (filled.filter(([r,c]) => !isEdge(r,c)).length >= 1
          ? filled.filter(([r,c]) => !isEdge(r,c))
          : filled)
      : filled;
    const bunny = bunnyCandidates[randInt(0, bunnyCandidates.length - 1)];

    const solutions = findValidSets(grid, bunny, targetN, maxAlt + 1);
    if (solutions.length === 0) continue;

    // Prefer fewest solutions; if we found exactly maxAlt+1 we have too many
    if (solutions.length > maxAlt) continue;

    // Pick the solution — shuffle and take first for variety
    shuffle(solutions);
    const solution = solutions[0];

    return { level: levelNum, grid, bunny, removeCount: targetN, solution, altCount: solutions.length };
  }
  return null;
}

// ── Difficulty schedule ───────────────────────────────────────────────────────
// [levelNum, N, maxAltSolutions]
const SCHEDULE = [
  // Easy: N=2, lenient on uniqueness
  [1,2,15],[2,2,12],[3,2,10],[4,2,8],[5,2,6],
  // Medium-easy: N=3
  [6,3,10],[7,3,8],[8,3,6],[9,3,5],[10,3,4],
  // Medium: N=4
  [11,4,6],[12,4,5],[13,4,4],[14,4,3],[15,4,3],[16,4,2],
  // Hard: N=5
  [17,5,4],[18,5,3],[19,5,3],[20,5,2],[21,5,2],
  // Very hard: N=6
  [22,6,3],[23,6,2],[24,6,2],[25,6,1],
];

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('Generating 25 Lava levels...\n');
const levels = [];

for (const [levelNum, n, maxAlt] of SCHEDULE) {
  process.stdout.write(`Level ${String(levelNum).padStart(2)} (N=${n}, maxAlt=${maxAlt})... `);
  const result = generateLevel(levelNum, n, maxAlt);
  if (!result) {
    console.error(`\nFailed to generate level ${levelNum}!`);
    process.exit(1);
  }
  const { altCount, ...save } = result;
  levels.push(save);
  console.log(`OK  (validSets=${altCount})`);
}

// ── Spot-check all levels ─────────────────────────────────────────────────────
console.log('\nVerifying all 25 levels...');
let pass = true;
for (const lvl of levels) {
  const { level, grid, bunny, solution } = lvl;
  const errs = [];

  const stable0 = stableSet(grid);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (grid[r][c] === 1 && !stable0.has(`${r},${c}`))
        errs.push(`initial disconnected cell [${r},${c}]`);

  for (const [r, c] of solution) {
    if (grid[r][c] !== 1) errs.push(`solution cell [${r},${c}] not filled`);
    if (r === bunny[0] && c === bunny[1]) errs.push(`solution contains bunny cell`);
  }

  if (!isBunnyConnected(applyRemovals(grid, solution), bunny))
    errs.push(`bunny disconnected in final state`);

  for (const cell of solution)
    if (!isBunnyConnected(applyRemovals(grid, [cell]), bunny))
      errs.push(`removing [${cell}] alone disconnects bunny`);

  if (errs.length) {
    console.error(`  Level ${level}: FAIL — ${errs.join('; ')}`);
    pass = false;
  } else {
    console.log(`  Level ${level}: OK`);
  }
}

if (!pass) { console.error('\nVerification failed.'); process.exit(1); }

console.log('\nAll 25 levels verified ✓');
fs.writeFileSync('lava-levels.json', JSON.stringify(levels, null, 2));
console.log('Written: lava-levels.json');
