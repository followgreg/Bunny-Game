'use strict';

// generate-honey-levels.js  — Part 4: difficulty-aware generation + scrambling
// Run: node generate-honey-levels.js
// Output: assets/data/honey-levels.json
// Format: [{demo, cells:[{q,r,edges,startRot}]}, ...]
//   demo    — true for tutorial board (radius-1, 7 cells)
//   edges   — solved edge set (sorted)
//   startRot— scramble offset: displayed at start as edges.map(e=>(e+startRot)%6)

const fs   = require('fs');
const path = require('path');

// Axial direction vectors for pointy-top hexagons, 0–5 clockwise from E.
// Edge e faces direction (e+1)%6; opposite direction of d is (d+3)%6.
const HEX_DIRS = [
  [+1,  0],  // 0: E
  [ 0, +1],  // 1: SE
  [-1, +1],  // 2: SW
  [-1,  0],  // 3: W
  [ 0, -1],  // 4: NW
  [+1, -1],  // 5: NE
];

const cellKey = (q, r) => `${q},${r}`;

// ── Grid helpers ─────────────────────────────────────────────────────────────

function cellsForRadius(radius) {
  const cells = [];
  for (let q = -radius; q <= radius; q++)
    for (let r = -radius; r <= radius; r++)
      if (Math.abs(q + r) <= radius) cells.push({ q, r });
  return cells;
}

function getNeighbors(q, r, radius) {
  const result = [];
  for (let d = 0; d < 6; d++) {
    const nq = q + HEX_DIRS[d][0];
    const nr = r + HEX_DIRS[d][1];
    if (Math.abs(nq) <= radius && Math.abs(nr) <= radius && Math.abs(nq + nr) <= radius)
      result.push({ nq, nr, fromDir: d, toDir: (d + 3) % 6 });
  }
  return result;
}

// ── Seeded RNG (xorshift32) ───────────────────────────────────────────────────

function makeRng(seed) {
  let s = (seed ^ 0xDEADBEEF) >>> 0;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
}

// ── Spanning tree + board derivation ─────────────────────────────────────────

function generateSpanningTree(cells, radius, rng) {
  const visited   = new Set();
  const treeEdges = [];
  let   frontier  = [];

  const start = cells[Math.floor(rng() * cells.length)];
  visited.add(cellKey(start.q, start.r));

  const addFrontier = (q, r) => {
    for (const n of getNeighbors(q, r, radius))
      if (!visited.has(cellKey(n.nq, n.nr)))
        frontier.push({ fromQ: q, fromR: r, ...n });
  };

  addFrontier(start.q, start.r);

  while (frontier.length && visited.size < cells.length) {
    const idx  = Math.floor(rng() * frontier.length);
    const edge = frontier.splice(idx, 1)[0];
    if (visited.has(cellKey(edge.nq, edge.nr))) continue;
    visited.add(cellKey(edge.nq, edge.nr));
    treeEdges.push(edge);
    addFrontier(edge.nq, edge.nr);
  }

  return treeEdges;
}

function deriveBoard(cells, treeEdges) {
  const edgeMap = {};
  for (const c of cells) edgeMap[cellKey(c.q, c.r)] = [];
  for (const e of treeEdges) {
    edgeMap[cellKey(e.fromQ, e.fromR)].push(e.fromDir);
    edgeMap[cellKey(e.nq,    e.nr   )].push(e.toDir);
  }
  return cells.map(c => ({
    q:     c.q,
    r:     c.r,
    edges: edgeMap[cellKey(c.q, c.r)].sort((a, b) => a - b),
  }));
}

// ── Difficulty metrics ────────────────────────────────────────────────────────

// Smallest r > 0 where rotating edge set by r gives the same set.
// period < 6 = symmetric piece (multiple equivalent orientations).
function rotationPeriod(edges) {
  if (edges.length === 0) return 1;
  const s = edges.slice().sort((a, b) => a - b).join(',');
  for (let r = 1; r < 6; r++)
    if (edges.map(e => (e + r) % 6).sort((a, b) => a - b).join(',') === s) return r;
  return 6;
}

// Sum of (6/period - 1): 0 for unique pieces, 1 for straights, 2 for symmetric-Y, etc.
// Lower = more constrained = fewer alternate solutions.
function ambiguityScore(board) {
  return board.reduce((sum, c) => sum + (6 / rotationPeriod(c.edges) - 1), 0);
}

// Cells with exactly 1 arm (dead-end caps).
function leafCount(board) {
  return board.filter(c => c.edges.length === 1).length;
}

// ── Strict network validation ─────────────────────────────────────────────────

// Returns true iff the board (with per-cell rotation offsets applied) forms
// a valid connected loop-free spanning network.
//   rotations[i] = how many steps cell i has been rotated from its solved state.
//
// Strict rules:
//   1. No arm may point outside the grid.
//   2. Every arm must be reciprocated by its neighbor.
//   3. All N cells must be reachable from cell 0 (connected).
function isValidNetwork(board, rotations) {
  const N = board.length;
  const cellMap = {};
  board.forEach((c, i) => { cellMap[cellKey(c.q, c.r)] = i; });

  for (let i = 0; i < N; i++) {
    const c           = board[i];
    const displayEdges = c.edges.map(e => (e + rotations[i]) % 6);

    for (const d of displayEdges) {
      const nq = c.q + HEX_DIRS[d][0];
      const nr = c.r + HEX_DIRS[d][1];
      const nk = cellKey(nq, nr);

      if (!(nk in cellMap)) return false;  // arm exits the grid

      const j      = cellMap[nk];
      const nEdges = board[j].edges.map(e => (e + rotations[j]) % 6);
      if (!nEdges.includes((d + 3) % 6)) return false;  // no reciprocal arm
    }
  }

  // BFS connectivity check
  const seen  = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const i           = queue.shift();
    const displayEdges = board[i].edges.map(e => (e + rotations[i]) % 6);
    for (const d of displayEdges) {
      const nq = board[i].q + HEX_DIRS[d][0];
      const nr = board[i].r + HEX_DIRS[d][1];
      const j  = cellMap[cellKey(nq, nr)];
      if (j !== undefined && !seen.has(j)) { seen.add(j); queue.push(j); }
    }
  }
  return seen.size === N;
}

// ── Scrambling ────────────────────────────────────────────────────────────────

// Assign random startRot to each cell; retry if the scrambled state is
// accidentally a valid network (player would win immediately).
function scramble(board, rng) {
  let rots;
  let tries = 0;
  do {
    rots = board.map(() => Math.floor(rng() * 6));
    tries++;
  } while (tries < 200 && isValidNetwork(board, rots));

  return board.map((c, i) => ({ ...c, startRot: rots[i] }));
}

// ── Board generation ──────────────────────────────────────────────────────────

function generateBoard(seed, radius) {
  const cells = cellsForRadius(radius);
  const rng   = makeRng(seed);
  const tree  = generateSpanningTree(cells, radius, rng);

  if (tree.length !== cells.length - 1)
    throw new Error(`Tree incomplete: seed=${seed} got ${tree.length} edges, expected ${cells.length - 1}`);

  const board     = deriveBoard(cells, tree);
  const zeroRots  = board.map(() => 0);

  if (!isValidNetwork(board, zeroRots))
    throw new Error(`Solved network failed validation at seed=${seed}`);

  return { board, rng };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const levels = [];

// ── Demo board: radius-1 (7 cells), ambiguity ≤ 4 ───────────────────────────
{
  let found = false;
  for (let s = 1; s <= 2000 && !found; s++) {
    const { board, rng } = generateBoard(s, 1);
    const score  = ambiguityScore(board);
    const leaves = leafCount(board);
    if (score <= 4) {
      const cells = scramble(board, rng);
      levels.push({ demo: true, cells });
      console.log(`Demo  : seed=${s}  cells=${board.length}  ambiguity=${score.toFixed(1)}  leaves=${leaves}`);
      found = true;
    }
  }
  if (!found) throw new Error('Could not find a suitable demo board in 2000 attempts');
}

// ── 25 real levels: radius-3 (37 cells), ambiguity ≤ 12, leaves ≤ 18 ────────
let nextSeed = 100;
while (levels.length < 26) {
  let found = false;
  for (let attempt = 0; attempt < 10000 && !found; attempt++) {
    const s = nextSeed + attempt;
    const { board, rng } = generateBoard(s, 3);
    const score  = ambiguityScore(board);
    const leaves = leafCount(board);
    if (score <= 12 && leaves <= 18) {
      const cells = scramble(board, rng);
      const levelNum = levels.length;  // 1-based after demo
      levels.push({ demo: false, cells });
      console.log(`Level ${String(levelNum).padStart(2)}: seed=${s}  ambiguity=${score.toFixed(1)}  leaves=${leaves}`);
      nextSeed = s + 1;
      found = true;
    }
  }
  if (!found) throw new Error(`Could not generate level ${levels.length} after 10000 attempts`);
}

// ── Spot-check: verify solved state of first and last real level ──────────────
[1, 25].forEach(idx => {
  const level  = levels[idx];
  const solved = level.cells.map(() => 0);
  if (!isValidNetwork(level.cells, solved))
    throw new Error(`Solved-state validation failed for level index ${idx}`);
  console.log(`\nSpot-check level ${idx}: solved-state valid ✓`);
});

// ── Write output ──────────────────────────────────────────────────────────────
const out = path.join(__dirname, 'assets', 'data', 'honey-levels.json');
fs.writeFileSync(out, JSON.stringify(levels, null, 2));
console.log(`\nWrote ${levels.length} levels (1 demo + 25 real) → ${out}`);
