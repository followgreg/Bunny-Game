#!/usr/bin/env node
'use strict';

/**
 * Cubrick flat puzzle generator — run once with: node generate-cubrick-puzzles.js
 *
 * Produces cubrick-puzzles.json: 8 level definitions.
 * Each level: 7 connected polyomino pieces tiling a flat 8×8 grid (64 cells).
 * Piece sizes per level are the same multiset {7,8,9,9,10,10,11} but assigned
 * to piece IDs A–G in a different order each level so the game feels fresh.
 * No two pieces in the same level share the same translation-only footprint.
 */

const fs = require('fs');

// ─── Level color palettes ─────────────────────────────────────────────────────
// 7 harmonious but visually distinct tones per level; muted/elegant to match
// Bunny Game aesthetic. Pieces A–G receive palette[0]–palette[6] in order.
const PALETTES = [
  // Level 1: clay / terracotta
  ['#C2806A', '#A86352', '#8A4E3C', '#D4977E', '#E0B49A', '#7A3C2C', '#B87868'],
  // Level 2: slate blue
  ['#5B7FA6', '#3D5A73', '#7896B5', '#2E4A63', '#90A8C4', '#4B6A88', '#9DBAD2'],
  // Level 3: sage green
  ['#7A9E7E', '#5C7F5F', '#9DBFA0', '#3E5F42', '#8BAF8E', '#4D6F50', '#6B8F6E'],
  // Level 4: dusty purple
  ['#8E7DAE', '#6B5C7A', '#A08EC0', '#5C4D6B', '#B3A2CC', '#4D3E5C', '#7A6B9A'],
  // Level 5: antique gold
  ['#BCA572', '#9A8050', '#D4C08A', '#8A7040', '#CCBA78', '#7A6030', '#C4AF68'],
  // Level 6: muted teal
  ['#6B9EA0', '#4A7A7A', '#7AB0B2', '#3A6A6A', '#8CC0C2', '#2A5A5A', '#5A8E90'],
  // Level 7: dusty rose
  ['#B58888', '#8B6868', '#C49898', '#7A5858', '#D4AAAA', '#6A4848', '#A87878'],
  // Level 8: warm charcoal / neutral
  ['#7C7570', '#5A5550', '#8C8680', '#4A4540', '#9C9690', '#3A3530', '#6B6560'],
];

// ─── Size assignments per level (multiset {7,8,9,9,10,10,11} shuffled) ───────
// Each row sums to 64; index 0=piece A … index 6=piece G.
const SIZE_ORDERS = [
  [ 7,  8,  9,  9, 10, 10, 11],  // level 1
  [11, 10, 10,  9,  9,  8,  7],  // level 2
  [ 9,  7, 11,  8, 10,  9, 10],  // level 3
  [10,  9,  7, 11,  8, 10,  9],  // level 4
  [ 8, 10,  9, 10, 11,  7,  9],  // level 5
  [ 9, 11,  8, 10,  7,  9, 10],  // level 6
  [10,  9, 10,  7,  9, 11,  8],  // level 7
  [ 9,  8, 10, 11,  9,  7, 10],  // level 8
];

const PIECE_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const DIRS      = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// ─── Grid helpers ─────────────────────────────────────────────────────────────
function cellKey(r, c)  { return r * 8 + c; }
function fromKey(k)     { return [Math.floor(k / 8), k % 8]; }

function neighbors(r, c) {
  const out = [];
  for (const [dr, dc] of DIRS) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) out.push([nr, nc]);
  }
  return out;
}

// ─── Shape signature: translate to origin, row-major sort, join ───────────────
// Translation-only — rotated/reflected shapes are considered distinct.
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
// Returns sorted [r, c] pairs or null if frontier exhausted before targetSize.
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

  return [...blob]
    .map(fromKey)
    .sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
}

// ─── Single level attempt ─────────────────────────────────────────────────────
// Returns array of 7 raw piece objects or null if any constraint fails.
function tryLevel(sizes) {
  const occupied   = new Set();
  const pieces     = [];
  const seenShapes = new Set();

  for (let i = 0; i < sizes.length; i++) {
    const empty = [];
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (!occupied.has(cellKey(r, c))) empty.push([r, c]);

    const [seedR, seedC] = empty[Math.floor(Math.random() * empty.length)];
    const cells = growPiece(occupied, seedR, seedC, sizes[i]);
    if (!cells) return null;

    const sig = shapeSignature(cells);
    if (seenShapes.has(sig)) return null;
    seenShapes.add(sig);

    for (const [r, c] of cells) occupied.add(cellKey(r, c));
    pieces.push({ slotIndex: i, cells, sig });
  }

  if (occupied.size !== 64) return null;
  return pieces;
}

// ─── Post-generation validator ────────────────────────────────────────────────
function validate(rawPieces, sizes) {
  const errors  = [];
  const allKeys = [];
  const shapes  = new Set();

  if (rawPieces.length !== 7) {
    errors.push(`expected 7 pieces, got ${rawPieces.length}`);
    return errors;
  }

  for (const p of rawPieces) {
    const id = PIECE_IDS[p.slotIndex];

    if (p.cells.length !== sizes[p.slotIndex])
      errors.push(`piece ${id}: expected ${sizes[p.slotIndex]} cells, got ${p.cells.length}`);

    // Connectivity via BFS
    const keySet = new Set(p.cells.map(([r, c]) => cellKey(r, c)));
    const vis    = new Set([p.cells[0].join(',')]);
    const q      = [[...p.cells[0]]];
    while (q.length) {
      const [r, c] = q.shift();
      for (const [nr, nc] of neighbors(r, c)) {
        const k = cellKey(nr, nc);
        const v = `${nr},${nc}`;
        if (keySet.has(k) && !vis.has(v)) { vis.add(v); q.push([nr, nc]); }
      }
    }
    if (vis.size !== p.cells.length)
      errors.push(`piece ${id}: not connected (visited ${vis.size}/${p.cells.length})`);

    if (shapes.has(p.sig)) errors.push(`piece ${id}: duplicate shape`);
    shapes.add(p.sig);

    allKeys.push(...p.cells.map(([r, c]) => cellKey(r, c)));
  }

  if (allKeys.length !== 64) errors.push(`total cells: ${allKeys.length} ≠ 64`);
  if (new Set(allKeys).size !== allKeys.length) errors.push('cell overlap between pieces');

  return errors;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('Cubrick flat puzzle generator');
console.log('8×8 grid | 7 pieces | sizes {7,8,9,9,10,10,11} | 8 levels\n');

// Sanity-check size order sums
for (let i = 0; i < 8; i++) {
  const sum = SIZE_ORDERS[i].reduce((a, b) => a + b, 0);
  if (sum !== 64) throw new Error(`SIZE_ORDERS[${i}] sums to ${sum}, expected 64`);
}

const output      = [];
let totalAttempts = 0;

for (let levelIdx = 0; levelIdx < 8; levelIdx++) {
  const sizes   = SIZE_ORDERS[levelIdx];
  const palette = PALETTES[levelIdx];

  process.stdout.write(`  Level ${levelIdx + 1}/8 ... `);
  const t0      = Date.now();
  let rawPieces = null;
  let attempts  = 0;

  while (!rawPieces) {
    attempts++;
    rawPieces = tryLevel(sizes);
  }
  totalAttempts += attempts;

  const errors = validate(rawPieces, sizes);
  if (errors.length) {
    console.error(`\nValidation FAILED for level ${levelIdx + 1}:`);
    for (const e of errors) console.error('  •', e);
    process.exit(1);
  }

  console.log(`✓  ${attempts.toLocaleString()} attempts  (${Date.now() - t0} ms)`);

  output.push({
    level: levelIdx + 1,
    pieces: rawPieces.map(p => ({
      id:    PIECE_IDS[p.slotIndex],
      color: palette[p.slotIndex],
      cells: p.cells,
    })),
  });
}

console.log(`\n8 levels generated and verified`);
console.log(`Total attempts: ${totalAttempts.toLocaleString()}`);
console.log(`Average per level: ${Math.round(totalAttempts / 8).toLocaleString()}`);

fs.writeFileSync('cubrick-puzzles.json', JSON.stringify(output, null, 2), 'utf8');
console.log('Written to cubrick-puzzles.json');
