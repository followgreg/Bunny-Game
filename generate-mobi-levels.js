#!/usr/bin/env node
'use strict';

// MOBI level generator — image-slice edition
//
// Reads all SVG files from mobi-source/ dynamically, generates 64 tile
// entries per level (8×8 grid), and detects which tiles are completely
// empty (no artwork) so the game can suppress the glow effect on them.
//
// Run:    node generate-mobi-levels.js
// Output: assets/data/mobi-levels.json

const fs   = require('fs');
const path = require('path');

const BASE    = __dirname;
const SRC_DIR = path.join(BASE, 'mobi-source');
const OUT     = path.join(BASE, 'assets', 'data', 'mobi-levels.json');

// ── Seeded LCG PRNG ───────────────────────────────────────────────────────────
function mkRng(seed) {
  let s = (seed >>> 0);
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ── SVG path parser ────────────────────────────────────────────────────────────
// Tokenizes an SVG path `d` attribute and walks every segment, tracking the
// pen position through relative commands (c, l, m, etc.) so that all extracted
// points are in the SVG's absolute coordinate space.
//
// Returns an array of [x, y] absolute-coordinate points.  For bezier curves,
// all control points are included — this ensures that a curve passing through a
// tile gets detected even if only its interior control points lie there.
function svgPathPoints(d) {
  const pts = [];
  // Tokenize: split at command letters and at numeric values (handles scientific
  // notation, leading -, optional decimal point, and no-separator sequences like
  // "M3.5.7" or "-.4.5").
  const RE_TOK = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/g;
  const tokens = [];
  let m;
  while ((m = RE_TOK.exec(d)) !== null) {
    tokens.push(m[1] != null ? m[1] : parseFloat(m[2]));
  }

  let i = 0;
  let cmd = null;
  let cx = 0, cy = 0; // current pen position
  let sx = 0, sy = 0; // current subpath start (for Z)

  const peek = () => (i < tokens.length && typeof tokens[i] === 'number') ? tokens[i] : null;

  // Consume the next numeric token; returns NaN if none is available.
  const num = () => (i < tokens.length && typeof tokens[i] === 'number') ? tokens[i++] : NaN;

  while (i < tokens.length) {
    // Advance command letter if present
    if (typeof tokens[i] === 'string') { cmd = tokens[i++]; }
    if (i >= tokens.length || cmd === null) break;

    // A command is repeated implicitly while numbers remain
    if (peek() === null && cmd.toUpperCase() !== 'Z') { cmd = null; continue; }

    const isRel = cmd !== 'Z' && cmd !== 'z' && cmd === cmd.toLowerCase();
    const r     = (v, base) => isRel ? base + v : v;
    const c     = cmd.toUpperCase();

    if (c === 'M') {
      cx = r(num(), cx); cy = r(num(), cy);
      sx = cx; sy = cy;
      pts.push([cx, cy]);
      // Subsequent coordinate pairs after M are treated as implicit L/l
      cmd = isRel ? 'l' : 'L';

    } else if (c === 'Z') {
      cx = sx; cy = sy;
      // Z has no operands; prevent infinite loop by resetting cmd
      cmd = null;

    } else if (c === 'L') {
      cx = r(num(), cx); cy = r(num(), cy);
      pts.push([cx, cy]);

    } else if (c === 'H') {
      cx = r(num(), cx);
      pts.push([cx, cy]);

    } else if (c === 'V') {
      cy = r(num(), cy);
      pts.push([cx, cy]);

    } else if (c === 'C') {
      const x1 = r(num(), cx), y1 = r(num(), cy);
      const x2 = r(num(), cx), y2 = r(num(), cy);
      const x  = r(num(), cx), y  = r(num(), cy);
      pts.push([x1, y1], [x2, y2]);
      cx = x; cy = y;
      pts.push([cx, cy]);

    } else if (c === 'S') {
      const x2 = r(num(), cx), y2 = r(num(), cy);
      const x  = r(num(), cx), y  = r(num(), cy);
      pts.push([x2, y2]);
      cx = x; cy = y;
      pts.push([cx, cy]);

    } else if (c === 'Q') {
      const x1 = r(num(), cx), y1 = r(num(), cy);
      const x  = r(num(), cx), y  = r(num(), cy);
      pts.push([x1, y1]);
      cx = x; cy = y;
      pts.push([cx, cy]);

    } else if (c === 'T') {
      cx = r(num(), cx); cy = r(num(), cy);
      pts.push([cx, cy]);

    } else if (c === 'A') {
      // Arc: rx ry x-rotation large-arc sweep-flag x y
      num(); num(); num(); num(); num(); // skip first 5 args
      cx = r(num(), cx); cy = r(num(), cy);
      pts.push([cx, cy]);

    } else {
      // Unknown command — skip one token to avoid infinite loop
      i++;
    }
  }

  return pts;
}

// ── Empty-tile detection ───────────────────────────────────────────────────────
// Parses all <path d="..."> elements in the SVG, converts their coordinates to
// absolute space, and returns a function isEmpty(row, col) that returns true
// when the 8×8 grid cell (row, col) contains no path coordinate points.
//
// viewBox: { x, y, w, h } from the SVG's viewBox attribute.
function buildEmptyDetector(svgContent, viewBox, gridSize = 8) {
  const { x: vx, y: vy, w: vw, h: vh } = viewBox;
  const tileW = vw / gridSize;
  const tileH = vh / gridSize;

  const covered = new Set(); // "row,col" keys

  // Walk every path d attribute in the file
  const pathRe = /\bd="([^"]+)"/g;
  let m;
  while ((m = pathRe.exec(svgContent)) !== null) {
    const pts = svgPathPoints(m[1]);
    for (const [px, py] of pts) {
      const col = Math.floor((px - vx) / tileW);
      const row = Math.floor((py - vy) / tileH);
      if (col >= 0 && col < gridSize && row >= 0 && row < gridSize) {
        covered.add(`${row},${col}`);
        // Early-exit optimisation: once all tiles are covered, stop
        if (covered.size === gridSize * gridSize) return () => false;
      }
    }
  }

  // Also handle <rect> elements (common for background fills)
  const rectRe = /<rect\s[^/]*?(?:\/?>|>)/gs;
  while ((m = rectRe.exec(svgContent)) !== null) {
    const s = m[0];
    const xm = s.match(/\bx="([-\d.]+)"/),  ym = s.match(/\by="([-\d.]+)"/);
    const wm = s.match(/\bwidth="([-\d.]+)"/), hm = s.match(/\bheight="([-\d.]+)"/);
    if (xm && ym && wm && hm) {
      const rx = parseFloat(xm[1]), ry = parseFloat(ym[1]);
      const rw = parseFloat(wm[1]), rh = parseFloat(hm[1]);
      const c1 = Math.max(0, Math.floor((rx       - vx) / tileW));
      const r1 = Math.max(0, Math.floor((ry       - vy) / tileH));
      const c2 = Math.min(gridSize - 1, Math.floor((rx + rw - vx) / tileW));
      const r2 = Math.min(gridSize - 1, Math.floor((ry + rh - vy) / tileH));
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) covered.add(`${r},${c}`);
      }
    }
  }

  return (row, col) => !covered.has(`${row},${col}`);
}

// ── Parse SVG viewBox ─────────────────────────────────────────────────────────
function parseViewBox(svgContent) {
  const m = svgContent.match(/viewBox="([^"]+)"/);
  if (m) {
    const [x, y, w, h] = m[1].trim().split(/[\s,]+/).map(Number);
    return { x, y, w, h };
  }
  // Fall back to width/height
  const wm = svgContent.match(/\bwidth="([0-9.]+)/);
  const hm = svgContent.match(/\bheight="([0-9.]+)/);
  if (wm && hm) return { x: 0, y: 0, w: parseFloat(wm[1]), h: parseFloat(hm[1]) };
  throw new Error('Cannot determine SVG dimensions');
}

// ── Generate one level ────────────────────────────────────────────────────────
function generateLevel(levelNum, sourceFile, svgContent) {
  const viewBox = parseViewBox(svgContent);
  const isEmpty = buildEmptyDetector(svgContent, viewBox);
  const rng     = mkRng(0xc0ffee00 + levelNum * 0x3333);

  const tiles  = [];
  let allZero  = true;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const rot    = Math.floor(rng() * 4);
      const empty  = isEmpty(row, col);
      if (rot !== 0) allZero = false;
      tiles.push({ row, col, initialRotation: rot, isEmpty: empty });
    }
  }

  // Guarantee at least one non-empty tile is scrambled
  if (allZero) {
    const nonEmpty = tiles.filter(t => !t.isEmpty);
    const target   = nonEmpty.length ? nonEmpty[Math.floor(rng() * nonEmpty.length)] : tiles[0];
    target.initialRotation = 1 + Math.floor(rng() * 3);
  }

  return { level: levelNum, sourceFile, tiles };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const files = fs.readdirSync(SRC_DIR)
  .filter(f => /\.svg$/i.test(f))
  .sort();

if (files.length === 0) {
  console.error('No SVG files found in', SRC_DIR);
  process.exit(1);
}

console.log(`Found ${files.length} source file(s) in mobi-source/:\n`);

const levels = [];
const t0 = Date.now();

for (let i = 0; i < files.length; i++) {
  const file    = files[i];
  const lvl     = i + 1;
  const content = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
  const level   = generateLevel(lvl, file, content);

  const emptyCount    = level.tiles.filter(t => t.isEmpty).length;
  const nonEmptyCount = 64 - emptyCount;
  process.stdout.write(
    `Level ${String(lvl).padStart(2)}: ${file}  ` +
    `[${nonEmptyCount} artwork tiles, ${emptyCount} empty]\n`
  );
  levels.push(level);
}

fs.writeFileSync(OUT, JSON.stringify(levels));
console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${OUT}`);
