#!/usr/bin/env node
'use strict';

/**
 * Cubrick puzzle generator — run once with: node generate-cubrick-puzzles.js
 *
 * Produces cubrick-puzzles.json: 30 valid 8×8 polyomino tilings,
 * each partitioned into 7 connected pieces with translation-unique shapes.
 *
 * Piece slots (fixed across all puzzles):
 *   A  7 cells  height 1  warm clay     #8B6F5E
 *   B  8 cells  height 2  slate blue    #5B7FA6
 *   C  9 cells  height 3  sage green    #7A9E7E
 *   D  9 cells  height 1  terracotta    #B5835A
 *   E 10 cells  height 2  dusty purple  #8E7DAE
 *   F 10 cells  height 3  antique gold  #A89060
 *   G 11 cells  height 2  muted teal    #6B9EA0
 *   Total: 7+8+9+9+10+10+11 = 64 ✓
 */

const fs = require('fs');

// ─── Piece slot definitions ───────────────────────────────────────────────────
const SLOTS = [
  { id: 'A', color: '#8B6F5E', height: 1, size: 7  },
  { id: 'B', color: '#5B7FA6', height: 2, size: 8  },
  { id: 'C', color: '#7A9E7E', height: 3, size: 9  },
  { id: 'D', color: '#B5835A', height: 1, size: 9  },
  { id: 'E', color: '#8E7DAE', height: 2, size: 10 },
  { id: 'F', color: '#A89060', height: 3, size: 10 },
  { id: 'G', color: '#6B9EA0', height: 2, size: 11 },
];

const TOTAL_CELLS = SLOTS.reduce((s, p) => s + p.size, 0);
if (TOTAL_CELLS !== 64) throw new Error(`Piece sizes sum to ${TOTAL_CELLS}, expected 64`);

// ─── Grid helpers ─────────────────────────────────────────────────────────────
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function cellKey(r, c)   { return r * 8 + c; }
function fromKey(k)      { return [Math.floor(k / 8), k % 8]; }

function neighbors(r, c) {
  const out = [];
  for (const [dr, dc] of DIRS) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) out.push([nr, nc]);
  }
  return out;
}

// ─── Shape signature: translate to origin, sort, join ─────────────────────────
// Translation-only normalization — rotated/reflected shapes are considered distinct.
function shapeSignature(cells) {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  return cells
    .map(([r, c]) => [r - minR, c - minC])
    .sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1])
    .map(([r, c]) => `${r},${c}`)
    .join('|');
}

// ─── Grow a connected blob via random frontier expansion ──────────────────────
// Returns sorted [row, col] pairs or null if frontier is exhausted before target.
function growPiece(occupied, seedR, seedC, targetSize) {
  const blob     = new Set([cellKey(seedR, seedC)]);
  const frontier = new Set();

  for (const [nr, nc] of neighbors(seedR, seedC)) {
    const k = cellKey(nr, nc);
    if (!occupied.has(k)) frontier.add(k);
  }

  while (blob.size < targetSize) {
    if (frontier.size === 0) return null;
    const arr  = [...frontier];
    const pick = arr[Math.floor(Math.random() * arr.length)];
    frontier.delete(pick);
    blob.add(pick);
    const [pr, pc] = fromKey(pick);
    for (const [nr, nc] of neighbors(pr, pc)) {
      const k = cellKey(nr, nc);
      if (!occupied.has(k) && !blob.has(k)) frontier.add(k);
    }
  }

  // Sort row-major for clean JSON output
  return [...blob]
    .map(fromKey)
    .sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
}

// ─── Single puzzle attempt ────────────────────────────────────────────────────
// Returns array of 7 piece objects or null if any constraint fails.
function tryOnce() {
  const occupied   = new Set();
  const pieces     = [];
  const seenShapes = new Set();

  for (const slot of SLOTS) {
    // All empty cells
    const empty = [];
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (!occupied.has(cellKey(r, c))) empty.push([r, c]);

    // Random seed
    const [seedR, seedC] = empty[Math.floor(Math.random() * empty.length)];
    const cells = growPiece(occupied, seedR, seedC, slot.size);
    if (!cells) return null;

    // Shape uniqueness (translation-only)
    const sig = shapeSignature(cells);
    if (seenShapes.has(sig)) return null;
    seenShapes.add(sig);

    for (const [r, c] of cells) occupied.add(cellKey(r, c));
    pieces.push({ id: slot.id, color: slot.color, height: slot.height, cells });
  }

  // Sanity: all 64 cells covered
  if (occupied.size !== 64) return null;

  return pieces;
}

// ─── Post-generation validator ────────────────────────────────────────────────
function validate(puzzle) {
  const errors = [];
  if (puzzle.pieces.length !== 7) {
    errors.push(`expected 7 pieces, got ${puzzle.pieces.length}`);
    return errors;
  }

  const allKeys = [];
  const shapes  = new Set();

  for (const piece of puzzle.pieces) {
    const slot = SLOTS.find(s => s.id === piece.id);
    if (!slot) { errors.push(`unknown piece id ${piece.id}`); continue; }

    if (piece.cells.length !== slot.size)
      errors.push(`piece ${piece.id}: expected ${slot.size} cells, got ${piece.cells.length}`);

    // Connectivity via BFS
    const keys = new Set(piece.cells.map(([r, c]) => cellKey(r, c)));
    const vis  = new Set([piece.cells[0].join(',')]);
    const q    = [[...piece.cells[0]]];
    while (q.length) {
      const [r, c] = q.shift();
      for (const [nr, nc] of neighbors(r, c)) {
        const k = cellKey(nr, nc);
        const v = `${nr},${nc}`;
        if (keys.has(k) && !vis.has(v)) { vis.add(v); q.push([nr, nc]); }
      }
    }
    if (vis.size !== piece.cells.length)
      errors.push(`piece ${piece.id}: not connected`);

    const sig = shapeSignature(piece.cells);
    if (shapes.has(sig)) errors.push(`piece ${piece.id}: duplicate shape`);
    shapes.add(sig);

    allKeys.push(...piece.cells.map(([r, c]) => cellKey(r, c)));
  }

  if (allKeys.length !== 64) errors.push(`total cells: ${allKeys.length} ≠ 64`);
  if (new Set(allKeys).size !== allKeys.length) errors.push('cell overlap between pieces');

  return errors;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('Cubrick puzzle generator');
console.log('8×8 grid | 7 pieces | sizes 7,8,9,9,10,10,11 | translation-unique shapes\n');

const output      = [];
let totalAttempts = 0;

for (let n = 1; n <= 30; n++) {
  process.stdout.write(`  Puzzle ${String(n).padStart(2)}/30 ... `);
  const t0 = Date.now();
  let puzzle = null, attempts = 0;
  while (!puzzle) { attempts++; puzzle = tryOnce(); }
  totalAttempts += attempts;

  // Validate
  const errors = validate({ pieces: puzzle });
  if (errors.length) {
    console.error(`\nValidation FAILED for puzzle ${n}:`);
    for (const e of errors) console.error('  •', e);
    process.exit(1);
  }

  console.log(`✓  ${attempts.toLocaleString()} attempts  (${Date.now() - t0} ms)`);
  output.push({ id: n, pieces: puzzle });
}

console.log(`\n30 puzzles generated and verified`);
console.log(`Total attempts: ${totalAttempts.toLocaleString()}`);
console.log(`Average per puzzle: ${Math.round(totalAttempts / 30).toLocaleString()}`);

fs.writeFileSync('cubrick-puzzles.json', JSON.stringify(output, null, 2), 'utf8');
console.log('\nWritten to cubrick-puzzles.json');
