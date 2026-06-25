// generate-next-boards.js
// Run: node generate-next-boards.js
// Output: assets/data/next-boards.json

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Master color list ────────────────────────────────────────────────────────
const MASTER_COLORS = [
  { name: 'red',        hex: '#FF2233' },
  { name: 'blue',       hex: '#1155DD' },
  { name: 'lime',       hex: '#77DD00' },
  { name: 'purple',     hex: '#9922CC' },
  { name: 'cyan',       hex: '#00BBCC' },
  { name: 'green',      hex: '#22BB44' },
  { name: 'orange',     hex: '#FF6600' },
  { name: 'pink',       hex: '#EE2299' },
  { name: 'yellow',     hex: '#FFEE00' },
  { name: 'sky',        hex: '#3399FF' },
  { name: 'teal',       hex: '#11BBAA' },
  { name: 'violet',     hex: '#8833EE' },
  { name: 'amber',      hex: '#CC8800' },
  { name: 'indigo',     hex: '#4444DD' },
  { name: 'sage',       hex: '#668833' },
  { name: 'magenta',    hex: '#DD22AA' },
  { name: 'coral',      hex: '#FF7755' },
  { name: 'periwinkle', hex: '#7788FF' },
  { name: 'chartreuse', hex: '#CCEE00' },
  { name: 'rose',       hex: '#FF3366' },
];

const TOTAL_BOARDS = 86;

// ── Hardcoded palette schedules for boards 1-20 ───────────────────────────────
// Boards 1-2:  2 colors (period-2 requires exactly 2)
// Boards 3-10: +1 color per board, reaching 10 by board 10
// Boards 11-20: +1 color per board (teal→rose), reaching all 20 by board 20
const EARLY_PALETTES = [
  null, // index 0 unused (boards are 1-indexed)
  ['red', 'blue'],
  ['red', 'blue'],
  ['red', 'blue', 'lime'],
  ['red', 'blue', 'lime', 'purple'],
  ['red', 'blue', 'lime', 'purple', 'cyan'],
  ['red', 'blue', 'lime', 'purple', 'cyan', 'green'],
  ['red', 'blue', 'lime', 'purple', 'cyan', 'green', 'orange'],
  ['red', 'blue', 'lime', 'purple', 'cyan', 'green', 'orange', 'pink'],
  ['red', 'blue', 'lime', 'purple', 'cyan', 'green', 'orange', 'pink', 'yellow'],
  ['red', 'blue', 'lime', 'purple', 'cyan', 'green', 'orange', 'pink', 'yellow', 'sky'],
  ['red', 'blue', 'lime', 'purple', 'cyan', 'green', 'orange', 'pink', 'yellow', 'sky', 'teal'],
  ['red', 'blue', 'lime', 'purple', 'cyan', 'green', 'orange', 'pink', 'yellow', 'sky', 'teal', 'violet'],
  ['red', 'blue', 'lime', 'purple', 'cyan', 'green', 'orange', 'pink', 'yellow', 'sky', 'teal', 'violet', 'amber'],
  ['red', 'blue', 'lime', 'purple', 'cyan', 'green', 'orange', 'pink', 'yellow', 'sky', 'teal', 'violet', 'amber', 'indigo'],
  ['red', 'blue', 'lime', 'purple', 'cyan', 'green', 'orange', 'pink', 'yellow', 'sky', 'teal', 'violet', 'amber', 'indigo', 'sage'],
  ['red', 'blue', 'lime', 'purple', 'cyan', 'green', 'orange', 'pink', 'yellow', 'sky', 'teal', 'violet', 'amber', 'indigo', 'sage', 'magenta'],
  ['red', 'blue', 'lime', 'purple', 'cyan', 'green', 'orange', 'pink', 'yellow', 'sky', 'teal', 'violet', 'amber', 'indigo', 'sage', 'magenta', 'coral'],
  ['red', 'blue', 'lime', 'purple', 'cyan', 'green', 'orange', 'pink', 'yellow', 'sky', 'teal', 'violet', 'amber', 'indigo', 'sage', 'magenta', 'coral', 'periwinkle'],
  ['red', 'blue', 'lime', 'purple', 'cyan', 'green', 'orange', 'pink', 'yellow', 'sky', 'teal', 'violet', 'amber', 'indigo', 'sage', 'magenta', 'coral', 'periwinkle', 'chartreuse'],
  ['red', 'blue', 'lime', 'purple', 'cyan', 'green', 'orange', 'pink', 'yellow', 'sky', 'teal', 'violet', 'amber', 'indigo', 'sage', 'magenta', 'coral', 'periwinkle', 'chartreuse', 'rose'],
];

function getPalette(boardNum) {
  if (boardNum <= 20) return EARLY_PALETTES[boardNum].slice();
  return MASTER_COLORS.map(c => c.name);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
  return arr.slice().sort(() => Math.random() - 0.5).slice(0, n);
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
// Boards 1-2:   5 circles
// Boards 3-10:  7 circles
// Boards 11-20: explicit 8→20 climb
// Boards 21-86: smooth ramp 21→30

const BOARD_11_20_LENS = [8, 9, 10, 11, 12, 13, 15, 16, 18, 20];

function targetLength(boardNum) {
  if (boardNum <= 2)  return 5;
  if (boardNum <= 10) return 7;
  if (boardNum <= 20) return BOARD_11_20_LENS[boardNum - 11];
  return 21 + Math.round((boardNum - 21) * 9 / 65);
}

// ── Rule selection ────────────────────────────────────────────────────────────
// Boards 1-2:   period2  — ABAB, exactly 2 colors
// Boards 3-10:  period3  — ABCABC, exactly 3 colors
// Boards 11-25: growingMarker  — gap between markers GROWS: A×1,B,A×2,B,A×3,B,...
// Boards 26-45: shrinkingMarker— gap between markers SHRINKS: A×N,B,A×(N-1),B,...
// Boards 46-65: tripleAsym    — 3 colors with fixed but UNEQUAL run lengths [a,b,c]
// Boards 66-86: pairGrow      — 2 colors, BOTH run lengths grow: A×1,B×1,A×2,B×2,...

const RULE_COMPLEXITY = {
  period2: 0, period3: 1,
  growingMarker: 2, shrinkingMarker: 3, tripleAsym: 4, pairGrow: 5,
};

function pickRule(boardNum) {
  if (boardNum <= 2)  return 'period2';
  if (boardNum <= 10) return 'period3';
  if (boardNum <= 25) return 'growingMarker';
  if (boardNum <= 45) return 'shrinkingMarker';
  if (boardNum <= 65) return 'tripleAsym';
  return 'pairGrow';
}

// ── shrinkStartStep: minimum S so pattern total elements >= len ───────────────
// Total elements for startStep S: sum_{k=1}^{S}(k+1) = S*(S+3)/2
function shrinkStartStep(len) {
  let s = 1;
  while (s * (s + 3) / 2 < len) s++;
  return s;
}

// ── tripleAsym length pools — all entries have 3 distinct values ──────────────
const TRIPLE_ASYM_POOLS = [
  // Boards 46-52: period 5-7, smaller values
  [[1,2,3],[3,2,1],[2,1,4],[4,1,2],[1,4,2],[2,4,1],[3,1,4],[4,3,1]],
  // Boards 53-59: period 7-10, medium values
  [[2,3,5],[5,3,2],[1,4,5],[5,4,1],[3,5,2],[2,5,3],[4,1,6],[6,1,4]],
  // Boards 60-65: period 9-14, one dominant value
  [[2,1,7],[7,1,2],[3,1,8],[4,2,7],[5,3,6],[6,3,5],[1,3,9],[9,3,1]],
];

function tripleAsymLengths(boardNum) {
  const pool = boardNum <= 52 ? TRIPLE_ASYM_POOLS[0]
             : boardNum <= 59 ? TRIPLE_ASYM_POOLS[1]
             :                  TRIPLE_ASYM_POOLS[2];
  return pick(pool);
}

// ── Rule implementations ──────────────────────────────────────────────────────

function generatePeriod2(colors, length) {
  const seq = [];
  for (let i = 0; i < length; i++) seq.push(colors[i % 2]);
  return seq;
}

function isValidPeriod2(seq, params) {
  return seq.every((c, i) => c === params.colors[i % 2]);
}

function generatePeriod3(colors, length) {
  const seq = [];
  for (let i = 0; i < length; i++) seq.push(colors[i % 3]);
  return seq;
}

function isValidPeriod3(seq, params) {
  return seq.every((c, i) => c === params.colors[i % 3]);
}

// growingMarker: filler×startStep, marker, filler×(startStep+1), marker, ...
function generateGrowingMarker(filler, marker, startStep, length) {
  const seq = [];
  let step = startStep;
  while (seq.length < length) {
    for (let j = 0; j < step && seq.length < length; j++) seq.push(filler);
    if (seq.length < length) seq.push(marker);
    step++;
  }
  return seq;
}

function isValidGrowingMarker(seq, { filler, marker, startStep }) {
  let step = startStep, fillerCount = 0, mode = 'filler';
  for (const c of seq) {
    if (mode === 'filler') {
      if (c !== filler) return false;
      fillerCount++;
      if (fillerCount === step) { mode = 'marker'; fillerCount = 0; }
    } else {
      if (c !== marker) return false;
      step++;
      mode = 'filler';
    }
  }
  return true;
}

// shrinkingMarker: filler×startStep, marker, filler×(startStep-1), marker, ...
function generateShrinkingMarker(filler, marker, startStep, length) {
  const seq = [];
  let step = startStep;
  while (seq.length < length && step > 0) {
    for (let j = 0; j < step && seq.length < length; j++) seq.push(filler);
    if (seq.length < length) seq.push(marker);
    step--;
  }
  return seq;
}

function isValidShrinkingMarker(seq, { filler, marker, startStep }) {
  let step = startStep, fillerCount = 0, mode = 'filler';
  for (const c of seq) {
    if (step === 0) return false;
    if (mode === 'filler') {
      if (c !== filler) return false;
      fillerCount++;
      if (fillerCount === step) { mode = 'marker'; fillerCount = 0; }
    } else {
      if (c !== marker) return false;
      step--;
      mode = 'filler';
    }
  }
  return true;
}

// tripleAsym: colors[0]×a, colors[1]×b, colors[2]×c repeating with a≠b≠c
function generateTripleAsym(colors, lengths, length) {
  const seq = [];
  let phase = 0, runLeft = lengths[0];
  while (seq.length < length) {
    seq.push(colors[phase]);
    runLeft--;
    if (runLeft === 0) { phase = (phase + 1) % 3; runLeft = lengths[phase]; }
  }
  return seq;
}

function isValidTripleAsym(seq, { colors, lengths }) {
  let phase = 0, runLeft = lengths[0];
  for (const c of seq) {
    if (c !== colors[phase]) return false;
    runLeft--;
    if (runLeft === 0) { phase = (phase + 1) % 3; runLeft = lengths[phase]; }
  }
  return true;
}

// pairGrow: color1×1, color2×1, color1×2, color2×2, color1×3, color2×3, ...
function generatePairGrow(color1, color2, length) {
  const seq = [];
  let step = 1, isFirst = true;
  while (seq.length < length) {
    const color = isFirst ? color1 : color2;
    for (let j = 0; j < step && seq.length < length; j++) seq.push(color);
    if (!isFirst) step++;
    isFirst = !isFirst;
  }
  return seq;
}

function isValidPairGrow(seq, { color1, color2 }) {
  const runs = parseRuns(seq);
  if (runs.length === 0) return false;
  for (let k = 0; k < runs.length; k++) {
    const step = Math.floor(k / 2) + 1;
    const expectedColor = k % 2 === 0 ? color1 : color2;
    if (runs[k].color !== expectedColor) return false;
    if (k < runs.length - 1 && runs[k].len !== step) return false;
    if (k === runs.length - 1 && runs[k].len > step) return false;
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
      const seq    = full.slice(0, -1);
      return { seqWithoutLast: seq, answer: full[full.length - 1], isValidFn: isValidPeriod2, params: { colors } };
    }

    if (rule === 'period3') {
      if (palette.length < 3) return null;
      const colors = pickN(palette, 3);
      const full   = generatePeriod3(colors, len);
      const seq    = full.slice(0, -1);
      return { seqWithoutLast: seq, answer: full[full.length - 1], isValidFn: isValidPeriod3, params: { colors } };
    }

    if (rule === 'growingMarker') {
      if (palette.length < 2) return null;
      const two     = pickN(palette, 2);
      const filler  = two[0], marker = two[1];
      const startStep = 1;
      const full = generateGrowingMarker(filler, marker, startStep, len);
      const seq  = full.slice(0, -1);
      return { seqWithoutLast: seq, answer: full[full.length - 1], isValidFn: isValidGrowingMarker, params: { filler, marker, startStep } };
    }

    if (rule === 'shrinkingMarker') {
      if (palette.length < 2) return null;
      const two     = pickN(palette, 2);
      const filler  = two[0], marker = two[1];
      const startStep = shrinkStartStep(len);
      const full = generateShrinkingMarker(filler, marker, startStep, len);
      const seq  = full.slice(0, -1);
      return { seqWithoutLast: seq, answer: full[full.length - 1], isValidFn: isValidShrinkingMarker, params: { filler, marker, startStep } };
    }

    if (rule === 'tripleAsym') {
      if (palette.length < 3) return null;
      const colors  = pickN(palette, 3);
      const lengths = tripleAsymLengths(boardNum);
      const full = generateTripleAsym(colors, lengths, len);
      const seq  = full.slice(0, -1);
      return { seqWithoutLast: seq, answer: full[full.length - 1], isValidFn: isValidTripleAsym, params: { colors, lengths } };
    }

    if (rule === 'pairGrow') {
      if (palette.length < 2) return null;
      const two    = pickN(palette, 2);
      const color1 = two[0], color2 = two[1];
      const full = generatePairGrow(color1, color2, len);
      const seq  = full.slice(0, -1);
      return { seqWithoutLast: seq, answer: full[full.length - 1], isValidFn: isValidPairGrow, params: { color1, color2 } };
    }
  } catch (e) {
    return null;
  }
  return null;
}

// ── Main generation loop ──────────────────────────────────────────────────────

function generateBoards() {
  const boards = [];
  for (let boardNum = 1; boardNum <= TOTAL_BOARDS; boardNum++) {
    const palette = getPalette(boardNum);
    let board    = null;
    let attempts = 0;
    let len      = targetLength(boardNum);

    while (!board && attempts < 500) {
      attempts++;
      const candidate = tryGenerateBoard(boardNum, palette, len);
      if (candidate) {
        const { seqWithoutLast, answer, isValidFn, params } = candidate;
        if (isUnique(seqWithoutLast, answer, palette, isValidFn, params)) {
          board = { board: boardNum, sequence: seqWithoutLast, answer, paletteAtThisBoard: palette };
        }
      }
      if (attempts % 50 === 0) len++;
    }

    if (!board) throw new Error('Could not generate unique board ' + boardNum + ' after 500 attempts');
    boards.push(board);
    process.stdout.write('\rGenerated board ' + boardNum + '/' + TOTAL_BOARDS + '...');
  }
  console.log('\nDone.');
  return boards;
}

// ── Run ───────────────────────────────────────────────────────────────────────

const boards = generateBoards();
const outPath = path.join(__dirname, 'assets', 'data', 'next-boards.json');
fs.writeFileSync(outPath, JSON.stringify(boards, null, 2));
console.log('Wrote ' + boards.length + ' boards to ' + outPath);

// ── Verification ──────────────────────────────────────────────────────────────

console.log('\nVerification:');
console.log('  Board count:', boards.length);

// Monotone rule complexity
let prevC = -1, ruleViolations = 0;
const ruleCounts = {};
for (let n = 1; n <= TOTAL_BOARDS; n++) {
  const rule = pickRule(n);
  ruleCounts[rule] = (ruleCounts[rule] || 0) + 1;
  const c = RULE_COMPLEXITY[rule];
  if (c < prevC) { console.error('  RULE REGRESSION board ' + n + ': ' + rule + '(' + c + ') < prev(' + prevC + ')'); ruleViolations++; }
  prevC = c;
}
console.log('  Rule complexity:', ruleViolations === 0 ? 'monotone non-decreasing ✓' : ruleViolations + ' violations ✗');
console.log('  Rule distribution:', ruleCounts);

// Monotone length
let prevLen = -1, lenViolations = 0;
for (let n = 1; n <= TOTAL_BOARDS; n++) {
  const l = targetLength(n);
  if (l < prevLen) { console.error('  LENGTH REGRESSION board ' + n + ': ' + l + ' < ' + prevLen); lenViolations++; }
  prevLen = l;
}
console.log('  Sequence length:', lenViolations === 0 ? 'monotone non-decreasing ✓' : lenViolations + ' violations ✗');

// No period-2 after board 2
let p2 = false;
for (let n = 3; n <= TOTAL_BOARDS; n++) {
  if (pickRule(n) === 'period2') { console.error('  PERIOD-2 at board ' + n); p2 = true; }
}
console.log('  No period-2 after board 2:', p2 ? '✗' : '✓');

// Spot samples
console.log('  Board  1:', boards[0].sequence.slice(0, 5).join(','), '→', boards[0].answer);
console.log('  Board 11:', boards[10].sequence.slice(0, 6).join(','), '→', boards[10].answer);
console.log('  Board 26:', boards[25].sequence.slice(0, 6).join(','), '→', boards[25].answer);
console.log('  Board 46:', boards[45].sequence.slice(0, 6).join(','), '→', boards[45].answer);
console.log('  Board 66:', boards[65].sequence.slice(0, 6).join(','), '→', boards[65].answer);
console.log('  Board 86:', boards[85].sequence.slice(0, 6).join(','), '→', boards[85].answer);
