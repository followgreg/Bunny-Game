#!/usr/bin/env node
'use strict';

// MOBI level generator — image-slice edition
//
// Reads all SVG files from mobi-source/ (dynamically — no hardcoded count
// or filename list), assigns each one a level, and generates 64 scrambled
// tile entries (8×8 grid) per level. No path-tracing, no curve math — just
// grid positions and random rotations. The actual artwork is rendered at
// runtime by cropping each source SVG with CSS overflow clipping.
//
// Run:    node generate-mobi-levels.js
// Output: assets/data/mobi-levels.json

const fs   = require('fs');
const path = require('path');

const BASE    = __dirname;
const SRC_DIR = path.join(BASE, 'mobi-source');
const OUT     = path.join(BASE, 'assets', 'data', 'mobi-levels.json');

// Seeded LCG PRNG — same seed → same scramble every time
function mkRng(seed) {
  let s = (seed >>> 0);
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// Generate 64 scrambled tiles for one level
function generateLevel(levelNum, sourceFile) {
  const rng   = mkRng(0xc0ffee00 + levelNum * 0x3333);
  const tiles = [];
  let allZero = true;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const rot = Math.floor(rng() * 4);
      if (rot !== 0) allZero = false;
      tiles.push({ row, col, initialRotation: rot });
    }
  }

  // Guarantee at least one tile is scrambled so the puzzle is never pre-solved
  if (allZero) {
    const idx = Math.floor(rng() * 64);
    tiles[idx].initialRotation = 1 + Math.floor(rng() * 3);
  }

  return { level: levelNum, sourceFile, tiles };
}

// Read folder dynamically — picking up new files automatically on re-run
const files = fs.readdirSync(SRC_DIR)
  .filter(f => /\.svg$/i.test(f))
  .sort();

if (files.length === 0) {
  console.error('No SVG files found in', SRC_DIR);
  process.exit(1);
}

console.log(`Found ${files.length} source file(s) in mobi-source/:`);
files.forEach(f => console.log('  ' + f));
console.log('');

const levels = files.map((file, i) => {
  const lvl   = i + 1;
  const level = generateLevel(lvl, file);
  console.log(`Level ${String(lvl).padStart(2)}: ${file} — 64 tiles`);
  return level;
});

fs.writeFileSync(OUT, JSON.stringify(levels));
console.log(`\nDone → ${OUT}`);
