'use strict';
// Run: node generate-lava-levels.js
// Produces: lava-levels.json with 25 levels, all starting from a full 4×4 grid.

const fs = require('fs');

// Full 4×4 grid — every level starts with all 16 cells filled.
// A completely full grid is trivially frame-connected, so no starting-board check needed.
const FULL_GRID = [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]];

// ── Connectivity ──────────────────────────────────────────────────────────────
function stableSet(grid) {
  const visited = new Set();
  const queue = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if ((r === 0 || r === 3 || c === 0 || c === 3) && grid[r][c] === 1) {
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
// A removal set is valid if:
// 1. After removing all N cells, the bunny is still connected to the frame.
// 2. Each cell can be individually removed from the full grid without disconnecting the bunny.
//    (This approximates order-independence — the game blocks invalid moves at each step.)
function isValidRemovalSet(bunny, removals) {
  if (!isBunnyConnected(applyRemovals(FULL_GRID, removals), bunny)) return false;
  for (const cell of removals)
    if (!isBunnyConnected(applyRemovals(FULL_GRID, [cell]), bunny)) return false;
  return true;
}

// Find up to `cap` valid removal sets of size n.
function findValidSets(bunny, n, cap = 500) {
  const candidates = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (!(r === bunny[0] && c === bunny[1]))
        candidates.push([r, c]);  // all 15 non-bunny cells

  const solutions = [];

  function choose(start, chosen) {
    if (solutions.length >= cap) return;
    if (chosen.length === n) {
      if (isValidRemovalSet(bunny, chosen))
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

// ── Level generation ──────────────────────────────────────────────────────────
// Difficulty comes from N (remove count) and bunny position.
// Inner bunny positions (rows 1-2, cols 1-2) are generally harder since the
// bunny's connectivity depends more on surrounding blocks.
function generateLevel(levelNum, targetN, innerBunny) {
  // On a full grid every bunny position always has at least some valid removal sets
  // (as long as N < 15), so we just need to find a configuration with at least one solution.
  const ALL_CELLS = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      ALL_CELLS.push([r, c]);

  const innerCells = ALL_CELLS.filter(([r, c]) => r >= 1 && r <= 2 && c >= 1 && c <= 2);
  const edgeCells  = ALL_CELLS.filter(([r, c]) => r === 0 || r === 3 || c === 0 || c === 3);

  // Try up to 200 bunny placements
  const pool = shuffle([...(innerBunny ? innerCells : ALL_CELLS)]);
  for (const bunny of pool) {
    const solutions = findValidSets(bunny, targetN, 500);
    if (solutions.length === 0) continue;

    shuffle(solutions);
    return {
      level: levelNum,
      bunny,
      removeCount: targetN,
      solution: solutions[0],
      altCount: solutions.length,
    };
  }

  // Fallback: try all cells
  const fallback = shuffle([...ALL_CELLS]);
  for (const bunny of fallback) {
    const solutions = findValidSets(bunny, targetN, 500);
    if (solutions.length === 0) continue;
    shuffle(solutions);
    return { level: levelNum, bunny, removeCount: targetN, solution: solutions[0], altCount: solutions.length };
  }

  return null;
}

// ── Difficulty schedule ───────────────────────────────────────────────────────
// [levelNum, N, preferInnerBunny]
// Easy: N=2-3, edge bunny; Hard: N=5-6, inner bunny
const SCHEDULE = [
  [1,2,false],[2,2,false],[3,2,false],[4,2,false],[5,2,false],
  [6,3,false],[7,3,false],[8,3,false],[9,3,true],[10,3,true],
  [11,4,false],[12,4,false],[13,4,true],[14,4,true],[15,4,true],[16,4,true],
  [17,5,false],[18,5,true],[19,5,true],[20,5,true],[21,5,true],
  [22,6,false],[23,6,true],[24,6,true],[25,6,true],
];

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('Generating 25 Lava levels (full 4×4 grid)...\n');
const levels = [];

for (const [levelNum, n, innerBunny] of SCHEDULE) {
  process.stdout.write(`Level ${String(levelNum).padStart(2)} (N=${n}, inner=${innerBunny})... `);
  const result = generateLevel(levelNum, n, innerBunny);
  if (!result) {
    console.error(`\nFailed to generate level ${levelNum}!`);
    process.exit(1);
  }
  const { altCount, ...save } = result;
  levels.push(save);
  console.log(`OK  (validSets=${altCount})`);
}

// ── Verification ──────────────────────────────────────────────────────────────
console.log('\nVerifying all 25 levels...');
let pass = true;
for (const lvl of levels) {
  const { level, bunny, removeCount, solution } = lvl;
  const errs = [];

  if (solution.length !== removeCount)
    errs.push(`solution length ${solution.length} != removeCount ${removeCount}`);

  for (const [r, c] of solution) {
    if (r === bunny[0] && c === bunny[1]) errs.push(`solution contains bunny cell`);
  }

  if (!isBunnyConnected(applyRemovals(FULL_GRID, solution), bunny))
    errs.push(`bunny disconnected in final state`);

  for (const cell of solution)
    if (!isBunnyConnected(applyRemovals(FULL_GRID, [cell]), bunny))
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

// Grid field omitted — always full 4×4. lava.js initializes all 16 cells filled.
const output = levels.map(({ level, bunny, removeCount, solution }) =>
  ({ level, bunny, removeCount, solution })
);

fs.writeFileSync('assets/data/lava-levels.json', JSON.stringify(output, null, 2));
console.log('Written: assets/data/lava-levels.json');
