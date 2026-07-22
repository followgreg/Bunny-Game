'use strict';
// Run: node generate-lava-levels.js
// Produces: assets/data/lava-levels.json — 25 levels, full 4×4 starting grid.
//
// removeCount = TRUE maximum safe removals for each bunny position.
// Algorithm: find the minimum "skeleton" (bunny + shortest path to frame),
// then remove everything else in outermost-first (BFS) order.
// This is provably optimal — no valid sequence can remove more cells.

const fs = require('fs');

const FULL_GRID = [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]];
const DIRS = [[-1,0],[1,0],[0,-1],[0,1]];

function isFrame(r, c) { return r===0 || r===3 || c===0 || c===3; }

function inBounds(r, c) { return r>=0 && r<4 && c>=0 && c<4; }

// ── Connectivity check (used for verification) ────────────────────────────────
function stableSet(grid) {
  const visited = new Set();
  const queue = [];
  for (let r=0;r<4;r++) for (let c=0;c<4;c++)
    if (isFrame(r,c) && grid[r][c]) {
      const k=`${r},${c}`; if(!visited.has(k)){visited.add(k);queue.push([r,c]);}
    }
  let qi=0;
  while (qi<queue.length) {
    const [r,c]=queue[qi++];
    for (const [dr,dc] of DIRS) {
      const nr=r+dr, nc=c+dc;
      if (!inBounds(nr,nc)) continue;
      const k=`${nr},${nc}`;
      if (!visited.has(k) && grid[nr][nc]) { visited.add(k); queue.push([nr,nc]); }
    }
  }
  return visited;
}

function allConnected(grid) {
  const stable = stableSet(grid);
  for (let r=0;r<4;r++) for (let c=0;c<4;c++)
    if (grid[r][c] && !stable.has(`${r},${c}`)) return false;
  return true;
}

// ── Core algorithm ────────────────────────────────────────────────────────────
// Finds the TRUE maximum safe removal set and a valid removal sequence.
//
// The minimum skeleton is the bunny cell plus the shortest path from bunny to
// any frame cell in the 4×4 grid.  Everything outside the skeleton can be
// safely removed; removing in BFS-distance-descending order (outermost first)
// is always valid because each removed cell's BFS-distance-d-1 neighbor is
// still present when it is removed.
//
// 4×4 results:
//   Edge bunny  (r=0|3 or c=0|3): skeleton={bunny},           maxRemove=15
//   Inner bunny ([1,1],[1,2],[2,1],[2,2]): skeleton={bunny,adj-frame-cell}, maxRemove=14
//
function computeLevel(bunny) {
  const [br, bc] = bunny;

  // Build skeleton: BFS from bunny until we hit a frame cell, trace back
  if (isFrame(br, bc)) {
    // Bunny IS on the frame — skeleton is just the bunny cell.
    // Removal order: BFS from bunny, farthest first.
    const dist = new Map([[ `${br},${bc}`, 0 ]]);
    const queue = [[br, bc, 0]];
    let qi = 0;
    while (qi < queue.length) {
      const [r, c, d] = queue[qi++];
      for (const [dr, dc] of DIRS) {
        const nr = r+dr, nc = c+dc;
        if (!inBounds(nr, nc)) continue;
        const k = `${nr},${nc}`;
        if (!dist.has(k)) { dist.set(k, d+1); queue.push([nr, nc, d+1]); }
      }
    }
    // All 15 non-bunny cells, sorted farthest first
    const toRemove = [];
    for (let r=0;r<4;r++) for (let c=0;c<4;c++) {
      if (r===br && c===bc) continue;
      toRemove.push([r, c, dist.get(`${r},${c}`)]);
    }
    toRemove.sort((a, b) => b[2]-a[2] || a[0]-b[0] || a[1]-b[1]);
    return { bunny, removeCount: 15, solution: toRemove.map(([r,c])=>[r,c]) };
  }

  // Inner bunny: BFS to find shortest path to frame, keep that path as skeleton.
  // Find nearest frame cell via BFS
  const prev = new Map();
  const q2 = [[br, bc]];
  prev.set(`${br},${bc}`, null);
  let qi = 0, frameCell = null;
  outer:
  while (qi < q2.length) {
    const [r, c] = q2[qi++];
    for (const [dr, dc] of DIRS) {
      const nr = r+dr, nc = c+dc;
      if (!inBounds(nr, nc)) continue;
      const k = `${nr},${nc}`;
      if (prev.has(k)) continue;
      prev.set(k, [r, c]);
      if (isFrame(nr, nc)) { frameCell = [nr, nc]; break outer; }
      q2.push([nr, nc]);
    }
  }

  // Trace skeleton path bunny → frame cell
  const skeletonSet = new Set();
  let cur = frameCell;
  while (cur) {
    skeletonSet.add(`${cur[0]},${cur[1]}`);
    cur = prev.get(`${cur[0]},${cur[1]}`);
  }
  skeletonSet.add(`${br},${bc}`);

  // BFS outward from skeleton to assign distances to every cell
  const dist = new Map();
  const bfsQueue = [];
  for (const k of skeletonSet) {
    dist.set(k, 0);
    const [r, c] = k.split(',').map(Number);
    bfsQueue.push([r, c, 0]);
  }
  qi = 0;
  while (qi < bfsQueue.length) {
    const [r, c, d] = bfsQueue[qi++];
    for (const [dr, dc] of DIRS) {
      const nr = r+dr, nc = c+dc;
      if (!inBounds(nr, nc)) continue;
      const k = `${nr},${nc}`;
      if (!dist.has(k)) { dist.set(k, d+1); bfsQueue.push([nr, nc, d+1]); }
    }
  }

  // All non-skeleton cells, sorted farthest from skeleton first
  const toRemove = [];
  for (let r=0;r<4;r++) for (let c=0;c<4;c++) {
    const k = `${r},${c}`;
    if (!skeletonSet.has(k)) toRemove.push([r, c, dist.get(k)]);
  }
  toRemove.sort((a, b) => b[2]-a[2] || a[0]-b[0] || a[1]-b[1]);

  const removeCount = toRemove.length; // 16 - skeleton.size
  return { bunny, removeCount, solution: toRemove.map(([r,c])=>[r,c]) };
}

// ── Survey all 16 positions ───────────────────────────────────────────────────
console.log('Surveying all 16 bunny positions (true maximum)...\n');
const allPositions = [];
for (let r=0;r<4;r++) for (let c=0;c<4;c++) {
  const result = computeLevel([r, c]);
  const type = isFrame(r,c) ? 'edge ' : 'INNER';
  console.log(`  [${r},${c}] ${type}  maxRemove=${result.removeCount}`);
  allPositions.push(result);
}

// ── Build 25-level schedule ───────────────────────────────────────────────────
// Difficulty: edge bunny + high removeCount = easy; inner bunny + low removeCount = hard.
// Since all edge positions give removeCount=15 and all inner give 14,
// vary bunny position within each tier for variety.
// Schedule: levels 1-18 use the 12 unique edge positions (cycling 1.5×),
//           levels 19-22 use near-inner [2,1],[2,2] (1 step from frame, max=14),
//           levels 23-25 use deep-inner [1,1],[1,2] (max=14, but farther from corner).
// All positions explicitly listed for clear intent:

const SCHEDULE_BUNNIES = [
  // Easy: edge bunnies, cycle through corners and midpoints
  [0,0],[0,3],[3,0],[3,3],   // 1-4: corners
  [0,1],[0,2],               // 5-6: top edge mid
  [1,0],[2,0],               // 7-8: left edge mid
  [1,3],[2,3],               // 9-10: right edge mid
  [3,1],[3,2],               // 11-12: bottom edge mid
  // Repeat edge bunnies with variety
  [0,0],[3,3],[0,3],[3,0],   // 13-16: corners again (different order)
  [0,2],[1,0],               // 17-18: edge mid variety
  // Medium: inner bunnies one step from frame corners
  [2,1],[2,2],               // 19-20
  [1,2],[2,1],               // 21-22
  // Hard: inner bunnies farther from frame
  [1,1],[1,2],[2,2],         // 23-25
];

const levels = SCHEDULE_BUNNIES.map((bunny, i) => {
  const { removeCount, solution } = computeLevel(bunny);
  return { level: i+1, bunny, removeCount, solution };
});

console.log('\nLevel schedule:');
for (const { level, bunny, removeCount } of levels) {
  const type = isFrame(bunny[0],bunny[1]) ? 'edge ' : 'INNER';
  console.log(`  Level ${String(level).padStart(2)}: bunny=[${bunny}] ${type}  removeCount=${removeCount}`);
}

// ── Verify ────────────────────────────────────────────────────────────────────
console.log('\nVerifying all 25 levels (step-by-step connectivity)...');
let pass = true;
for (const { level, bunny, removeCount, solution } of levels) {
  const errs = [];
  if (solution.length !== removeCount)
    errs.push(`solution.length ${solution.length} != removeCount ${removeCount}`);

  const g = FULL_GRID.map(row => [...row]);
  for (const [r, c] of solution) {
    if (r===bunny[0] && c===bunny[1]) { errs.push(`solution contains bunny`); break; }
    if (!g[r][c]) { errs.push(`cell [${r},${c}] already removed`); break; }
    g[r][c] = 0;
    if (!allConnected(g)) { errs.push(`disconnection after removing [${r},${c}]`); break; }
  }

  if (errs.length) {
    console.error(`  Level ${level}: FAIL — ${errs.join('; ')}`);
    pass = false;
  } else {
    console.log(`  Level ${level}: OK  bunny=[${bunny}]  removeCount=${removeCount}`);
  }
}

if (!pass) { console.error('\nVerification failed.'); process.exit(1); }
console.log('\nAll 25 levels verified ✓');

fs.writeFileSync(
  'assets/data/lava-levels.json',
  JSON.stringify(levels.map(({ level, bunny, removeCount, solution }) =>
    ({ level, bunny, removeCount, solution })), null, 2)
);
console.log('Written: assets/data/lava-levels.json');
