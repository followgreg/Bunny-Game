#!/usr/bin/env node
'use strict';

/**
 * Cubrick puzzle generator — run once with:  node generate-puzzles.js
 *
 * Produces cubrick-puzzles.json: 30 valid 4×4×4 polycube tilings, each
 * partitioned into 8 connected pieces of 6–10 cells that span ≥2 layers.
 */

const fs = require('fs');

// ─── Piece palette ────────────────────────────────────────────────────────────
const PIECE_IDS    = 'ABCDEFGH';
const PIECE_COLORS = [
  '#8B6F5E', // A — warm clay
  '#5B7FA6', // B — slate blue
  '#7A9E7E', // C — sage green
  '#B5835A', // D — terracotta
  '#8E7DAE', // E — dusty purple
  '#A89060', // F — antique gold
  '#6B9EA0', // G — muted teal
  '#A07080', // H — dusty rose
];

// ─── Grid encoding ────────────────────────────────────────────────────────────
// Integer key = layer*16 + row*4 + col   (0..63)
// Layer 0 = bottom, layer 3 = top.  Row and col both 0-3.
const CK    = (l, r, c) => l * 16 + r * 4 + c;
const COORD = (key)     => [key >> 4, (key >> 2) & 3, key & 3];

const FACE_DIRS = [
  [ 1, 0, 0], [-1, 0, 0],
  [ 0, 1, 0], [ 0,-1, 0],
  [ 0, 0, 1], [ 0, 0,-1],
];

function adjCells(key) {
  const [l, r, c] = COORD(key);
  const out = [];
  for (const [dl, dr, dc] of FACE_DIRS) {
    const nl = l + dl, nr = r + dr, nc = c + dc;
    if (nl >= 0 && nl < 4 && nr >= 0 && nr < 4 && nc >= 0 && nc < 4)
      out.push(CK(nl, nr, nc));
  }
  return out;
}

// ─── Piece validation ─────────────────────────────────────────────────────────
function isConnected(cells) {
  if (cells.length === 0) return true;
  const S   = new Set(cells);
  const vis = new Set([cells[0]]);
  const q   = [cells[0]];
  while (q.length) {
    for (const n of adjCells(q.shift())) {
      if (S.has(n) && !vis.has(n)) { vis.add(n); q.push(n); }
    }
  }
  return vis.size === S.size;
}

function spansMultipleLayers(cells) {
  const layers = new Set(cells.map(key => key >> 4));
  return layers.size >= 2;
}

// Canonical string for shape-uniqueness: normalize to min bounding origin,
// sort cells, join.  Two translationally equivalent pieces produce the same key.
function shapeSignature(cells) {
  const coords = cells.map(COORD);
  const minL   = Math.min(...coords.map(co => co[0]));
  const minR   = Math.min(...coords.map(co => co[1]));
  const minC   = Math.min(...coords.map(co => co[2]));
  return coords
    .map(([l, r, c]) => [l - minL, r - minR, c - minC])
    .sort((a, b) => a[0]-b[0] || a[1]-b[1] || a[2]-b[2])
    .map(t => t.join(','))
    .join(';');
}

// ─── Piece grower ─────────────────────────────────────────────────────────────
// Random BFS expansion from `seed` into empty cells until `targetSize` reached.
// Returns null if the frontier is exhausted before target.
function growPiece(occupied, seed, targetSize) {
  const piece    = new Set([seed]);
  const frontier = new Set(adjCells(seed).filter(n => !occupied.has(n)));

  while (piece.size < targetSize) {
    if (!frontier.size) return null;

    const arr  = [...frontier];
    const pick = arr[Math.floor(Math.random() * arr.length)];
    frontier.delete(pick);
    piece.add(pick);

    for (const n of adjCells(pick)) {
      if (!occupied.has(n) && !piece.has(n)) frontier.add(n);
    }
  }
  return [...piece];
}

// ─── Single puzzle attempt ────────────────────────────────────────────────────
// Returns an array of 8 cell-key arrays, or null if any constraint fails.
function tryOnce() {
  const occupied = new Set();
  const pieces   = [];

  for (let p = 0; p < 8; p++) {
    // Collect empty cells
    const empty = [];
    for (let i = 0; i < 64; i++) if (!occupied.has(i)) empty.push(i);

    const remaining = empty.length;
    const afterThis = 7 - p; // pieces still to place after this one

    let cells;

    if (p === 7) {
      // Last piece must be exactly all remaining cells
      if (remaining < 6 || remaining > 10) return null;
      cells = empty;
      if (!isConnected(cells)) return null;
    } else {
      // Size bounds that guarantee the remaining pieces can all be 6–10
      const minSize = Math.max(6, remaining - afterThis * 10);
      const maxSize = Math.min(10, remaining - afterThis * 6);
      if (minSize > maxSize) return null;

      const target = minSize + Math.floor(Math.random() * (maxSize - minSize + 1));
      const seed   = empty[Math.floor(Math.random() * empty.length)];
      cells = growPiece(occupied, seed, target);
      if (!cells) return null;
    }

    // Each piece must span at least 2 layers
    if (!spansMultipleLayers(cells)) return null;

    for (const c of cells) occupied.add(c);
    pieces.push(cells);
  }

  // Sanity: all 64 cells covered
  if (occupied.size !== 64) return null;

  // No two pieces may share the same shape (translation-only comparison)
  const seenShapes = new Set();
  for (const cells of pieces) {
    const sig = shapeSignature(cells);
    if (seenShapes.has(sig)) return null;
    seenShapes.add(sig);
  }

  return pieces;
}

// ─── Generator loop ───────────────────────────────────────────────────────────
function generatePuzzle(id) {
  let attempts = 0;
  while (true) {
    attempts++;
    const pieces = tryOnce();
    if (pieces) {
      return {
        id,
        _attempts: attempts,
        pieces: pieces.map((cells, i) => ({
          id:    PIECE_IDS[i],
          color: PIECE_COLORS[i],
          cells: cells.map(COORD),
        })),
      };
    }
  }
}

// ─── Post-generation validator ────────────────────────────────────────────────
function validatePuzzle(puzzle) {
  const errors = [];
  if (puzzle.pieces.length !== 8) errors.push('must have 8 pieces');

  const allKeys = [];
  for (const piece of puzzle.pieces) {
    const keys = piece.cells.map(([l, r, c]) => CK(l, r, c));

    if (keys.length < 6 || keys.length > 10)
      errors.push(`piece ${piece.id}: size ${keys.length} not in [6,10]`);

    if (!isConnected(keys))
      errors.push(`piece ${piece.id}: not connected`);

    if (!spansMultipleLayers(keys))
      errors.push(`piece ${piece.id}: confined to one layer`);

    for (const k of keys) {
      const [l, r, c] = COORD(k);
      if (l < 0 || l > 3 || r < 0 || r > 3 || c < 0 || c > 3)
        errors.push(`piece ${piece.id}: cell out of bounds`);
    }

    allKeys.push(...keys);
  }

  if (allKeys.length !== 64) errors.push(`total cells: ${allKeys.length} ≠ 64`);

  const keySet = new Set(allKeys);
  if (keySet.size !== 64) errors.push('cells overlap between pieces');

  // Shape uniqueness
  const sigs = puzzle.pieces.map(p => shapeSignature(p.cells.map(([l,r,c]) => CK(l,r,c))));
  const sigSet = new Set(sigs);
  if (sigSet.size !== sigs.length) errors.push('duplicate piece shapes');

  return errors;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('Cubrick puzzle generator\n');
console.log('Rules: 4×4×4 cube | 8 pieces | 6–10 cells each | multi-layer | unique shapes\n');

const rawPuzzles = [];
let totalAttempts = 0;

for (let n = 1; n <= 30; n++) {
  process.stdout.write(`  Puzzle ${String(n).padStart(2)}/30 ... `);
  const t0 = Date.now();
  const result = generatePuzzle(n);
  const ms = Date.now() - t0;

  // Validate independently
  const errors = validatePuzzle(result);
  if (errors.length) {
    console.error(`\nValidation FAILED for puzzle ${n}:`);
    for (const e of errors) console.error('  •', e);
    process.exit(1);
  }

  totalAttempts += result._attempts;
  console.log(`✓  ${result._attempts.toLocaleString()} attempts  (${ms} ms)`);
  rawPuzzles.push(result);
}

// Strip internal _attempts field from output
const output = rawPuzzles.map(({ _attempts, ...p }) => p);

console.log(`\n30 puzzles generated and verified`);
console.log(`Total generation attempts: ${totalAttempts.toLocaleString()}`);
console.log(`Average per puzzle: ${Math.round(totalAttempts / 30).toLocaleString()}`);

fs.writeFileSync(
  'cubrick-puzzles.json',
  JSON.stringify(output, null, 2),
  'utf8',
);
console.log('\nWritten to cubrick-puzzles.json');
