// generate-next-boards.js
// Run: node generate-next-boards.js
// Output: assets/data/next-boards.json

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Master color list ────────────────────────────────────────────────────────

// Colors ordered by INTRODUCTION SEQUENCE (index = order introduced).
// Hues alternate warm/cool so the first 6 span the full color wheel —
// no two consecutive warm-range (red/orange/yellow) colors appear early.
//
// Hue reference:  red≈0°  lime≈92°  green≈133°  cyan≈184°  blue≈222°  purple≈278°
//                 orange≈24°  yellow≈54°  sky≈211°  teal≈174°  violet≈271°
//                 amber≈40°(dark)  indigo≈240°  sage≈80°(dark)  magenta≈312°
//                 coral≈12°  periwinkle≈233°  chartreuse≈62°  rose≈342°
const MASTER_COLORS = [
  { name: 'red',        hex: '#FF2233' },  // [0]  board 1   hue   0° — vivid red
  { name: 'blue',       hex: '#1155DD' },  // [1]  board 1   hue 222° — primary blue
  { name: 'lime',       hex: '#77DD00' },  // [2]  board 5   hue  92° — bright lime-green
  { name: 'purple',     hex: '#9922CC' },  // [3]  board 10  hue 278° — deep purple
  { name: 'cyan',       hex: '#00BBCC' },  // [4]  board 14  hue 184° — clear cyan
  { name: 'green',      hex: '#22BB44' },  // [5]  board 18  hue 133° — vivid green
  { name: 'orange',     hex: '#FF6600' },  // [6]  board 22  hue  24° — clear orange (first warm after red)
  { name: 'pink',       hex: '#EE2299' },  // [7]  board 26  hue 316° — hot pink
  { name: 'yellow',     hex: '#FFEE00' },  // [8]  board 30  hue  54° — bright yellow (after orange is known)
  { name: 'sky',        hex: '#3399FF' },  // [9]  board 34  hue 211° — sky blue (lighter than blue)
  { name: 'teal',       hex: '#11BBAA' },  // [10] board 38  hue 174° — teal
  { name: 'violet',     hex: '#8833EE' },  // [11] board 42  hue 271° — blue-violet (lighter than purple)
  { name: 'amber',      hex: '#CC8800' },  // [12] board 46  hue  40° — deep golden amber (darker than orange/yellow)
  { name: 'indigo',     hex: '#4444DD' },  // [13] board 50  hue 240° — medium indigo
  { name: 'sage',       hex: '#668833' },  // [14] board 54  hue  80° — dark sage (darker than lime)
  { name: 'magenta',    hex: '#DD22AA' },  // [15] board 58  hue 312° — vivid magenta
  { name: 'coral',      hex: '#FF7755' },  // [16] board 62  hue  12° — coral (lighter/warmer than red)
  { name: 'periwinkle', hex: '#7788FF' },  // [17] board 66  hue 233° — periwinkle
  { name: 'chartreuse', hex: '#CCEE00' },  // [18] board 70  hue  62° — chartreuse (yellower than lime)
  { name: 'rose',       hex: '#FF3366' },  // [19] board 75  hue 342° — rose/hot pink-red
];

// Board number when each color first becomes available (index matches MASTER_COLORS)
const COLOR_INTRO = [
   1,  1,  5, 10, 14, 18, 22, 26, 30, 34,
  38, 42, 46, 50, 54, 58, 62, 66, 70, 75
];

function getPalette(boardNum) {
  return MASTER_COLORS
    .filter((_, i) => COLOR_INTRO[i] <= boardNum)
    .map(c => c.name);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Simple seeded-ish random using a counter (deterministic per attempt)
// We use Math.random() but that's fine — the uniqueness check is the gate.

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
  // pick n distinct items from arr
  const shuffled = arr.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function parseRuns(seq) {
  const runs = [];
  let i = 0;
  while (i < seq.length) {
    const color = seq[i];
    let j = i;
    while (j < seq.length && seq[j] === color) j++;
    runs.push({ color, len: j - i });
    i = j;
  }
  return runs;
}

// ── Target sequence length ────────────────────────────────────────────────────

function targetLength(boardNum) {
  if (boardNum <= 15)  return 5 + Math.floor((boardNum - 1) / 3);
  if (boardNum <= 30)  return 8 + Math.floor((boardNum - 16) / 3);
  if (boardNum <= 50)  return 10 + Math.floor((boardNum - 31) / 4);
  if (boardNum <= 75)  return 12 + Math.floor((boardNum - 51) / 5);
  return 14 + Math.floor((boardNum - 76) / 5);
}

// ── Rule selection ────────────────────────────────────────────────────────────

function pickRule(boardNum) {
  const r = boardNum % 7;
  if (boardNum <= 15) return 'period2';
  if (boardNum <= 30) return (r < 4) ? 'period2' : 'period3';
  if (boardNum <= 50) {
    if (r < 2) return 'period2';
    if (r < 4) return 'period3';
    if (r < 6) return 'growingRuns';
    return 'runPair';
  }
  if (boardNum <= 75) {
    if (r < 2) return 'period3';
    if (r < 4) return 'growingRuns';
    if (r < 5) return 'runPair';
    return 'interleaved';
  }
  // 76-100
  if (r < 2) return 'growingRuns';
  if (r < 4) return 'runPair';
  return 'interleaved';
}

// ── Rule implementations ──────────────────────────────────────────────────────

// period2: A,B,A,B,...
function generatePeriod2(colors, length) {
  const seq = [];
  for (let i = 0; i < length; i++) seq.push(colors[i % 2]);
  return seq;
}

function isValidPeriod2(seq, params) {
  const colors = params.colors;
  return seq.every((c, i) => c === colors[i % 2]);
}

// period3: A,B,C,A,B,C,...
function generatePeriod3(colors, length) {
  const seq = [];
  for (let i = 0; i < length; i++) seq.push(colors[i % 3]);
  return seq;
}

function isValidPeriod3(seq, params) {
  const colors = params.colors;
  return seq.every((c, i) => c === colors[i % 3]);
}

// growingRuns: A(×1), B(×2), C(×3), D(×4),...
// Run r (0-indexed) has length r+1
function generateGrowingRuns(colors, length) {
  const seq = [];
  let run = 0;
  while (seq.length < length) {
    const runLen = run + 1;
    const color  = colors[run % colors.length];
    for (let j = 0; j < runLen && seq.length < length; j++) {
      seq.push(color);
    }
    run++;
  }
  return seq;
}

function isValidGrowingRuns(seq, params) {
  const runs = parseRuns(seq);
  // runs[k].len must equal k+1
  for (let k = 0; k < runs.length; k++) {
    if (runs[k].len !== k + 1) return false;
  }
  // Adjacent runs must differ in color
  for (let k = 1; k < runs.length; k++) {
    if (runs[k].color === runs[k - 1].color) return false;
  }
  return true;
}

// runPair: A(×N), B(×N), A(×N), B(×N),...
function generateRunPair(colors, runLen, length) {
  const seq = [];
  for (let i = 0; i < length; i++) {
    seq.push(colors[Math.floor(i / runLen) % 2]);
  }
  return seq;
}

function isValidRunPair(seq, params) {
  const { runLen } = params;
  const runs = parseRuns(seq);
  // All runs same length
  if (!runs.every(r => r.len === runLen)) return false;
  // Colors alternate between exactly 2 values
  const colorSet = new Set(runs.map(r => r.color));
  if (colorSet.size !== 2) return false;
  const colorArr = runs.map(r => r.color);
  for (let k = 1; k < colorArr.length; k++) {
    if (colorArr[k] === colorArr[k - 1]) return false;
  }
  return true;
}

// interleaved: even positions → A,B,A,B,...  odd positions → C,D,C,D,...
// Full: A,C,B,D,A,C,B,D,...
function generateInterleaved(evenColors, oddColors, length) {
  const seq = [];
  for (let i = 0; i < length; i++) {
    if (i % 2 === 0) {
      seq.push(evenColors[Math.floor(i / 2) % 2]);
    } else {
      seq.push(oddColors[Math.floor(i / 2) % 2]);
    }
  }
  return seq;
}

function isValidInterleaved(seq, params) {
  const { evenColors, oddColors } = params;
  const even = seq.filter((_, i) => i % 2 === 0);
  const odd  = seq.filter((_, i) => i % 2 === 1);

  // Even sub-sequence must follow period2 with evenColors
  if (!even.every((c, i) => c === evenColors[i % 2])) return false;
  // Odd sub-sequence must follow period2 with oddColors
  if (odd.length > 0 && !odd.every((c, i) => c === oddColors[i % 2])) return false;

  // The two color pairs must be disjoint
  const evenSet = new Set(evenColors);
  for (const c of oddColors) {
    if (evenSet.has(c)) return false;
  }
  return true;
}

// ── Uniqueness check ──────────────────────────────────────────────────────────

function isUnique(seqWithoutLast, answer, palette, isValidFn, params) {
  const valid = palette.filter(c => isValidFn([...seqWithoutLast, c], params));
  return valid.length === 1 && valid[0] === answer;
}

// ── Try to generate a single board candidate ──────────────────────────────────

function tryGenerateBoard(boardNum, palette, len) {
  const rule = pickRule(boardNum);

  try {
    if (rule === 'period2') {
      if (palette.length < 2) return null;
      const colors = pickN(palette, 2);
      const full   = generatePeriod2(colors, len);
      const answer = full[full.length - 1];
      const seq    = full.slice(0, -1);
      const params = { colors };
      return { seqWithoutLast: seq, answer, isValidFn: isValidPeriod2, params };
    }

    if (rule === 'period3') {
      if (palette.length < 3) return null;
      const colors = pickN(palette, 3);
      const full   = generatePeriod3(colors, len);
      const answer = full[full.length - 1];
      const seq    = full.slice(0, -1);
      const params = { colors };
      return { seqWithoutLast: seq, answer, isValidFn: isValidPeriod3, params };
    }

    if (rule === 'growingRuns') {
      const numColors = 3 + Math.floor(Math.random() * 3); // 3-5
      if (palette.length < numColors) return null;
      const colors = pickN(palette, numColors);
      // Ensure adjacent colors in the cycling are different
      // (they will be since they're all distinct)
      const full   = generateGrowingRuns(colors, len);
      const answer = full[full.length - 1];
      const seq    = full.slice(0, -1);
      const params = { colors };
      return { seqWithoutLast: seq, answer, isValidFn: isValidGrowingRuns, params };
    }

    if (rule === 'runPair') {
      if (palette.length < 2) return null;
      const colors = pickN(palette, 2);
      const runLenOptions = [2, 3, 4];
      const runLen = pick(runLenOptions);
      // Ensure length is a multiple of runLen * 2 so the pattern is clean
      // (adjust len upward to nearest boundary)
      let adjustedLen = len;
      // We just generate; isValid will check the visible portion
      const full = generateRunPair(colors, runLen, adjustedLen);
      const answer = full[full.length - 1];
      const seq  = full.slice(0, -1);
      const params = { colors, runLen };
      return { seqWithoutLast: seq, answer, isValidFn: isValidRunPair, params };
    }

    if (rule === 'interleaved') {
      if (palette.length < 4) return null;
      const four      = pickN(palette, 4);
      const evenColors = [four[0], four[1]];
      const oddColors  = [four[2], four[3]];
      const full   = generateInterleaved(evenColors, oddColors, len);
      const answer = full[full.length - 1];
      const seq    = full.slice(0, -1);
      const params = { evenColors, oddColors };
      return { seqWithoutLast: seq, answer, isValidFn: isValidInterleaved, params };
    }
  } catch (e) {
    return null;
  }

  return null;
}

// ── Main generation loop ──────────────────────────────────────────────────────

function generateBoards() {
  const boards = [];

  for (let boardNum = 1; boardNum <= 100; boardNum++) {
    const palette = getPalette(boardNum);
    let board     = null;
    let attempts  = 0;
    let len       = targetLength(boardNum);

    while (!board && attempts < 500) {
      attempts++;
      const candidate = tryGenerateBoard(boardNum, palette, len);

      if (candidate) {
        const { seqWithoutLast, answer, isValidFn, params } = candidate;
        if (isUnique(seqWithoutLast, answer, palette, isValidFn, params)) {
          board = {
            board: boardNum,
            sequence: seqWithoutLast,
            answer: answer,
            paletteAtThisBoard: palette,
          };
        }
      }

      if (attempts % 50 === 0) len++; // increase length if struggling
    }

    if (!board) {
      throw new Error('Could not generate unique board ' + boardNum + ' after 500 attempts');
    }

    boards.push(board);
    process.stdout.write('\rGenerated board ' + boardNum + '/100...');
  }

  console.log('\nDone.');
  return boards;
}

// ── Run ───────────────────────────────────────────────────────────────────────

const boards = generateBoards();

const outPath = path.join(__dirname, 'assets', 'data', 'next-boards.json');
fs.writeFileSync(outPath, JSON.stringify(boards, null, 2));

console.log('Wrote ' + boards.length + ' boards to ' + outPath);

// Sanity checks
console.log('\nSanity checks:');
console.log('  Board count:', boards.length);
console.log('  Board 1 palette size:', boards[0].paletteAtThisBoard.length);
console.log('  Board 100 palette size:', boards[99].paletteAtThisBoard.length);
console.log('  Board 1 rule sample:', boards[0].sequence.slice(0, 5).join(','), '→', boards[0].answer);
console.log('  Board 50 rule sample:', boards[49].sequence.slice(0, 5).join(','), '→', boards[49].answer);
console.log('  Board 100 rule sample:', boards[99].sequence.slice(0, 5).join(','), '→', boards[99].answer);
