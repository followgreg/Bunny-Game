#!/usr/bin/env node
'use strict';

// generate-circuit-levels.js
// Produces circuit-levels.json — 25 levels for Circuit.
//
// Circuit reuses Honey's 25 solved hex networks verbatim (radius-3, 37 cells).
// In honey-levels.json a cell's `edges` array is ALREADY the solved orientation;
// Honey's `startRot` is only its scramble and is ignored here. Rotation 0 being
// the solved state is asserted for every level before anything is emitted.
//
// Each level keeps the full solved network, blanks out N cells per the scaling
// table, and moves those pieces to the shelf.

const fs   = require('fs');
const path = require('path');

const HEX_DIRS = [
  [+1,  0],  // 0: E
  [ 0, +1],  // 1: SE
  [-1, +1],  // 2: SW
  [-1,  0],  // 3: W
  [ 0, -1],  // 4: NW
  [+1, -1],  // 5: NE
];

// Blanks per level
const BLANKS = {
  1: 1,
  2: 2, 3: 2, 4: 2, 5: 2, 6: 2,
  7: 3, 8: 3, 9: 3,
  10: 4, 11: 4, 12: 4,
  13: 5, 14: 5, 15: 5,
  16: 6, 17: 6, 18: 6,
  19: 7, 20: 7,
  21: 8, 22: 8,
  23: 9, 24: 9,
  25: 10,
};

// Deterministic RNG so re-running produces identical levels (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Piece canonicalisation ───────────────────────────────────────────────────
// A piece is a set of active edges. Rotating adds r (mod 6) to every edge.
// The canonical form is the lexicographically smallest rotation, so the same
// physical piece always serialises identically regardless of how it sits on the
// board. solvedRotation is the offset that maps canonical -> solved.

const rot = (edges, r) => edges.map(e => (e + r) % 6).sort((a, b) => a - b);
const key = edges => edges.join(',');

function canonicalise(solvedEdges) {
  const solved = [...solvedEdges].sort((a, b) => a - b);
  let best = null, bestR = 0;
  for (let r = 0; r < 6; r++) {
    const cand = rot(solved, r);
    if (best === null || key(cand) < key(best)) { best = cand; bestR = r; }
  }
  // canonical = rot(solved, bestR)  =>  solved = rot(canonical, -bestR)
  const solvedRotation = (6 - bestR) % 6;
  if (key(rot(best, solvedRotation)) !== key(solved))
    throw new Error('canonicalisation failed for ' + key(solved));
  return { canonical: best, solvedRotation };
}

// Distinct orientations a piece has (6 divided by its rotational symmetry).
// A straight-through piece [0,3] has only 3; a bent piece [0,1] has 6.
// Higher is a more interesting placement decision for the player.
function distinctOrientations(canonical) {
  const seen = new Set();
  for (let r = 0; r < 6; r++) seen.add(key(rot(canonical, r)));
  return seen.size;
}

// ── Connectivity check (identical property to Honey's) ───────────────────────
// Solved = every cell in one component AND edgeCount === N-1 (a spanning tree,
// so fully connected with no loops).
function checkNetwork(cells) {
  const N = cells.length;
  const map = {};
  cells.forEach((c, i) => { map[c.q + ',' + c.r] = i; });

  const parent = cells.map((_, i) => i);
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };

  let edgeCount = 0;
  cells.forEach((c, i) => {
    c.activeEdges.forEach(d => {
      const j = map[(c.q + HEX_DIRS[d][0]) + ',' + (c.r + HEX_DIRS[d][1])];
      if (j === undefined || j <= i) return;
      if (cells[j].activeEdges.indexOf((d + 3) % 6) === -1) return;
      const a = find(i), b = find(j);
      if (a !== b) parent[b] = a;
      edgeCount++;
    });
  });

  const root = find(0);
  const connected = cells.every((_, i) => find(i) === root);
  return { connected, edgeCount, N, solved: connected && edgeCount === N - 1 };
}

const hexDist = (a, b) => {
  const dq = a.q - b.q, dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
};

// ── Blank selection ──────────────────────────────────────────────────────────
// Prefer pieces with more distinct orientations (a genuine rotation decision).
// From 7 blanks up, also require the blanks be spread out rather than clustered
// so the puzzle is "which piece goes where", not one local cluster.
function selectBlanks(cells, n, rand) {
  const MIN_SPREAD = n >= 7 ? 2 : 0;

  const scored = cells.map((c, i) => ({
    i,
    q: c.q,
    r: c.r,
    orients: distinctOrientations(c.canonical),
    degree: c.canonical.length,
    jitter: rand(),
  }));

  // Interesting = several distinct orientations and a degree in 2..5.
  const interesting = scored
    .filter(s => s.orients >= 3 && s.degree >= 2 && s.degree <= 5)
    .sort((a, b) => (b.orients - a.orients) || (a.jitter - b.jitter));
  const fallback = scored
    .filter(s => !(s.orients >= 3 && s.degree >= 2 && s.degree <= 5))
    .sort((a, b) => (b.orients - a.orients) || (a.jitter - b.jitter));

  for (let attempt = 0; attempt < 4000; attempt++) {
    // Re-jitter into a fresh key first: calling rand() inside the comparator
    // would make it inconsistent, and V8 may then order results arbitrarily,
    // costing reproducibility.
    const pool = interesting
      .map(s => ({ s, j: rand() }))
      .sort((a, b) => (b.s.orients - a.s.orients) || (a.j - b.j))
      .map(x => x.s);
    const picked = [];

    for (const cand of pool) {
      if (picked.length >= n) break;
      if (MIN_SPREAD && picked.some(p => hexDist(p, cand) < MIN_SPREAD)) continue;
      picked.push(cand);
    }
    if (picked.length === n) return picked.map(p => p.i);

    // Relax to the fallback pool if the spread constraint was too tight.
    if (attempt > 2000) {
      for (const cand of fallback) {
        if (picked.length >= n) break;
        if (MIN_SPREAD && picked.some(p => hexDist(p, cand) < MIN_SPREAD)) continue;
        picked.push(cand);
      }
      if (picked.length === n) return picked.map(p => p.i);
    }
  }
  throw new Error('could not select ' + n + ' blanks satisfying constraints');
}

// ── Build ────────────────────────────────────────────────────────────────────

const honey = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'assets/data/honey-levels.json'), 'utf8'));

const levels = [];

for (let lvl = 1; lvl <= 25; lvl++) {
  const src = honey[lvl];
  if (!src || !Array.isArray(src.cells))
    throw new Error('honey level ' + lvl + ' missing');

  // Assert rotation 0 really is the solved network before relying on it.
  const asSolved = src.cells.map(c => ({ q: c.q, r: c.r, activeEdges: [...c.edges] }));
  const base = checkNetwork(asSolved);
  if (!base.solved)
    throw new Error(`honey level ${lvl}: rotation 0 is not solved ` +
                    `(connected=${base.connected} edges=${base.edgeCount} N=${base.N})`);

  const rand = rng(0xC1C1 ^ (lvl * 2654435761));

  const cells = src.cells.map(c => {
    const { canonical, solvedRotation } = canonicalise(c.edges);
    return { q: c.q, r: c.r, canonical, solvedRotation, solvedEdges: [...c.edges].sort((a, b) => a - b) };
  });

  const n = BLANKS[lvl];
  const blankIdx = new Set(selectBlanks(cells, n, rand));

  const outCells = cells.map((c, i) => {
    const missing = blankIdx.has(i);
    return {
      q: c.q,
      r: c.r,
      edges: c.canonical,
      solvedRotation: c.solvedRotation,
      isMissing: missing,
      // Placed pieces start correctly placed; blanks hold no piece.
      currentRotation: missing ? null : c.solvedRotation,
    };
  });

  // Shelf pieces, shuffled so their order does not hint at placement.
  const shelf = [...blankIdx].map(i => ({
    edges: cells[i].canonical,
    solvedQ: cells[i].q,
    solvedR: cells[i].r,
    solvedRotation: cells[i].solvedRotation,
  }));
  for (let i = shelf.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shelf[i], shelf[j]] = [shelf[j], shelf[i]];
  }

  levels.push({
    level: lvl,
    cells: outCells,
    missingCells: [...blankIdx].map(i => ({ q: cells[i].q, r: cells[i].r })),
    shelfPieces: shelf,
  });
}

// ── Verification ─────────────────────────────────────────────────────────────
// Reassemble each level from its own output: placed cells as-is, plus every
// shelf piece at its stated position and rotation. Must yield a connected,
// loop-free 37-cell network.

let failures = 0;
for (const lv of levels) {
  const placed = lv.cells
    .filter(c => !c.isMissing)
    .map(c => ({ q: c.q, r: c.r, activeEdges: rot(c.edges, c.currentRotation) }));

  const fromShelf = lv.shelfPieces.map(p => ({
    q: p.solvedQ, r: p.solvedR, activeEdges: rot(p.edges, p.solvedRotation),
  }));

  const all = placed.concat(fromShelf);
  const res = checkNetwork(all);

  const expected = BLANKS[lv.level];
  const problems = [];
  if (all.length !== 37)                    problems.push(`cell count ${all.length}`);
  if (lv.shelfPieces.length !== expected)   problems.push(`shelf ${lv.shelfPieces.length} != ${expected}`);
  if (lv.missingCells.length !== expected)  problems.push(`blanks ${lv.missingCells.length} != ${expected}`);
  if (!res.solved)                          problems.push(`network connected=${res.connected} edges=${res.edgeCount}/${res.N - 1}`);

  // Every shelf piece must land on a declared blank
  const blanks = new Set(lv.missingCells.map(m => m.q + ',' + m.r));
  if (!lv.shelfPieces.every(p => blanks.has(p.solvedQ + ',' + p.solvedR)))
    problems.push('shelf piece targets a non-blank cell');

  // A shelf piece already at its solved rotation would be a free placement
  const trivial = lv.shelfPieces.filter(p => p.solvedRotation === 0).length;

  const spread = lv.missingCells.length > 1
    ? Math.min(...lv.missingCells.flatMap((a, i) =>
        lv.missingCells.slice(i + 1).map(b => hexDist(a, b))))
    : '-';

  if (problems.length) { failures++; console.log(`  Level ${lv.level}: FAIL — ${problems.join('; ')}`); }
  else console.log(`  Level ${lv.level}: ok — ${expected} blank(s), min spread ${spread}, ${trivial} piece(s) already solved-rotation`);
}

if (failures) {
  console.error(`\n${failures} level(s) failed verification — not writing.`);
  process.exit(1);
}

fs.writeFileSync(
  path.join(__dirname, 'circuit-levels.json'),
  JSON.stringify(levels, null, 2));

console.log(`\nWrote circuit-levels.json (${levels.length} levels)`);
