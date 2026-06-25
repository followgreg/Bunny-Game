// generate-next-boards.js
// Run: node generate-next-boards.js
// Output: assets/data/next-boards.json

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Master color list ────────────────────────────────────────────────────────
const MASTER_COLORS = [
  { name: 'red',        hex: '#FF2233' },  // [0]  board 1   hue   0°
  { name: 'blue',       hex: '#1155DD' },  // [1]  board 1   hue 222°
  { name: 'lime',       hex: '#77DD00' },  // [2]  board 5   hue  92°
  { name: 'purple',     hex: '#9922CC' },  // [3]  board 10  hue 278°
  { name: 'cyan',       hex: '#00BBCC' },  // [4]  board 14  hue 184°
  { name: 'green',      hex: '#22BB44' },  // [5]  board 18  hue 133°
  { name: 'orange',     hex: '#FF6600' },  // [6]  board 22  hue  24°
  { name: 'pink',       hex: '#EE2299' },  // [7]  board 26  hue 316°
  { name: 'yellow',     hex: '#FFEE00' },  // [8]  board 30  hue  54°
  { name: 'sky',        hex: '#3399FF' },  // [9]  board 34  hue 211°
  { name: 'teal',       hex: '#11BBAA' },  // [10] board 38  hue 174°
  { name: 'violet',     hex: '#8833EE' },  // [11] board 42  hue 271°
  { name: 'amber',      hex: '#CC8800' },  // [12] board 46  hue  40°
  { name: 'indigo',     hex: '#4444DD' },  // [13] board 50  hue 240°
  { name: 'sage',       hex: '#668833' },  // [14] board 54  hue  80°
  { name: 'magenta',    hex: '#DD22AA' },  // [15] board 58  hue 312°
  { name: 'coral',      hex: '#FF7755' },  // [16] board 62  hue  12°
  { name: 'periwinkle', hex: '#7788FF' },  // [17] board 66  hue 233°
  { name: 'chartreuse', hex: '#CCEE00' },  // [18] board 70  hue  62°
  { name: 'rose',       hex: '#FF3366' },  // [19] board 75  hue 342°
];

// ── Color introduction (by OLD 1-100 board numbers — unchanged) ──────────────
const COLOR_INTRO = [
   1,  1,  5, 10, 14, 18, 22, 26, 30, 34,
  38, 42, 46, 50, 54, 58, 62, 66, 70, 75
];

// ── Board mapping ─────────────────────────────────────────────────────────────
// The game has 86 boards: old boards 1 and 2, then old boards 17-100.
// Palette for new board N is looked up by OLD board number (color schedule).
// Rule and length are determined by NEW board position (difficulty schedule).
// These two schedules are fully independent.
const OLD_BOARD = [1, 2, ...Array.from({ length: 84 }, (_, i) => i + 17)];
const TOTAL_BOARDS = OLD_BOARD.length; // 86

function getPalette(newBoardNum) {
  const oldNum = OLD_BOARD[newBoardNum - 1];
  return MASTER_COLORS
    .filter((_, i) => COLOR_INTRO[i] <= oldNum)
    .map(c => c.name);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
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
// Linear ramp from 5 (board 1) to 16 (board 86). Strictly non-decreasing.
// Never resets at color-introduction or rule-tier boundaries.

function targetLength(boardNum) {
  return 5 + Math.floor((boardNum - 1) * 11 / (TOTAL_BOARDS - 1));
}

// ── Rule selection ────────────────────────────────────────────────────────────
// Five tiers mapped monotonically to new board position — fully independent of
// the color-introduction schedule. Complexity index 0-4 never decreases.
//
//   period2     boards  1-17   simple alternation         (complexity 0)
//   period3     boards 18-34   3-color cycle              (complexity 1)
//   growingRuns boards 35-51   growing run lengths        (complexity 2)
//   runPair     boards 52-68   fixed alternating runs     (complexity 3)
//   interleaved boards 69-86   two interleaved 2-cycles   (complexity 4)

const RULE_TIERS = ['period2', 'period3', 'growingRuns', 'runPair', 'interleaved'];

function pickRule(boardNum) {
  const t = (boardNum - 1) / (TOTAL_BOARDS - 1); // 0 → 1
  return RULE_TIERS[Math.min(4, Math.floor(t * 5))];
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

function generateGrowingRuns(colors, length) {
  const seq = [];
  let run = 0;
  while (seq.length < length) {
    const runLen = run + 1;
    const color  = colors[run % colors.length];
    for (let j = 0; j < runLen && seq.length < length; j++) seq.push(color);
    run++;
  }
  return seq;
}

function isValidGrowingRuns(seq, params) {
  const runs = parseRuns(seq);
  for (let k = 0; k < runs.length; k++) {
    if (runs[k].len !== k + 1) return false;
  }
  for (let k = 1; k < runs.length; k++) {
    if (runs[k].color === runs[k - 1].color) return false;
  }
  return true;
}

function generateRunPair(colors, runLen, length) {
  const seq = [];
  for (let i = 0; i < length; i++) seq.push(colors[Math.floor(i / runLen) % 2]);
  return seq;
}

function isValidRunPair(seq, params) {
  const { runLen } = params;
  const runs = parseRuns(seq);
  if (!runs.every(r => r.len === runLen)) return false;
  const colorSet = new Set(runs.map(r => r.color));
  if (colorSet.size !== 2) return false;
  const colorArr = runs.map(r => r.color);
  for (let k = 1; k < colorArr.length; k++) {
    if (colorArr[k] === colorArr[k - 1]) return false;
  }
  return true;
}

function generateInterleaved(evenColors, oddColors, length) {
  const seq = [];
  for (let i = 0; i < length; i++) {
    seq.push(i % 2 === 0
      ? evenColors[Math.floor(i / 2) % 2]
      : oddColors[Math.floor(i / 2) % 2]);
  }
  return seq;
}

function isValidInterleaved(seq, params) {
  const { evenColors, oddColors } = params;
  const even = seq.filter((_, i) => i % 2 === 0);
  const odd  = seq.filter((_, i) => i % 2 === 1);
  if (!even.every((c, i) => c === evenColors[i % 2])) return false;
  if (odd.length > 0 && !odd.every((c, i) => c === oddColors[i % 2])) return false;
  const evenSet = new Set(evenColors);
  for (const c of oddColors) { if (evenSet.has(c)) return false; }
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

    if (rule === 'growingRuns') {
      const numColors = 3 + Math.floor(Math.random() * 3); // 3-5
      if (palette.length < numColors) return null;
      const colors = pickN(palette, numColors);
      const full   = generateGrowingRuns(colors, len);
      const seq    = full.slice(0, -1);
      return { seqWithoutLast: seq, answer: full[full.length - 1], isValidFn: isValidGrowingRuns, params: { colors } };
    }

    if (rule === 'runPair') {
      if (palette.length < 2) return null;
      const colors = pickN(palette, 2);
      const runLen = pick([2, 3, 4]);
      const full   = generateRunPair(colors, runLen, len);
      const seq    = full.slice(0, -1);
      return { seqWithoutLast: seq, answer: full[full.length - 1], isValidFn: isValidRunPair, params: { colors, runLen } };
    }

    if (rule === 'interleaved') {
      if (palette.length < 4) return null;
      const four       = pickN(palette, 4);
      const evenColors = [four[0], four[1]];
      const oddColors  = [four[2], four[3]];
      const full       = generateInterleaved(evenColors, oddColors, len);
      const seq        = full.slice(0, -1);
      return { seqWithoutLast: seq, answer: full[full.length - 1], isValidFn: isValidInterleaved, params: { evenColors, oddColors } };
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
            answer,
            paletteAtThisBoard: palette,
          };
        }
      }

      if (attempts % 50 === 0) len++;
    }

    if (!board) {
      throw new Error('Could not generate unique board ' + boardNum + ' after 500 attempts');
    }

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

const RULE_COMPLEXITY = { period2: 0, period3: 1, growingRuns: 2, runPair: 3, interleaved: 4 };

console.log('\nVerification:');
console.log('  Board count:', boards.length);
console.log('  Board  1 palette:', boards[0].paletteAtThisBoard.length, 'colors, rule:', pickRule(1), 'len:', targetLength(1));
console.log('  Board 18 palette:', boards[17].paletteAtThisBoard.length, 'colors, rule:', pickRule(18), 'len:', targetLength(18));
console.log('  Board 35 palette:', boards[34].paletteAtThisBoard.length, 'colors, rule:', pickRule(35), 'len:', targetLength(35));
console.log('  Board 52 palette:', boards[51].paletteAtThisBoard.length, 'colors, rule:', pickRule(52), 'len:', targetLength(52));
console.log('  Board 69 palette:', boards[68].paletteAtThisBoard.length, 'colors, rule:', pickRule(69), 'len:', targetLength(69));
console.log('  Board 86 palette:', boards[85].paletteAtThisBoard.length, 'colors, rule:', pickRule(86), 'len:', targetLength(86));

// Monotone rule complexity check
let prevC = -1;
let violations = 0;
const ruleCounts = {};
for (let n = 1; n <= TOTAL_BOARDS; n++) {
  const rule = pickRule(n);
  ruleCounts[rule] = (ruleCounts[rule] || 0) + 1;
  const c = RULE_COMPLEXITY[rule];
  if (c < prevC) {
    console.error('  VIOLATION board ' + n + ': ' + rule + ' (' + c + ') < prev (' + prevC + ')');
    violations++;
  }
  prevC = c;
}
if (violations === 0) {
  console.log('  Rule complexity: monotone non-decreasing ✓');
} else {
  console.log('  Rule complexity violations: ' + violations + ' ✗');
}
console.log('  Rule distribution:', ruleCounts);

// Monotone length check
let prevLen = -1;
let lenViolations = 0;
for (let n = 1; n <= TOTAL_BOARDS; n++) {
  const l = targetLength(n);
  if (l < prevLen) {
    console.error('  LENGTH VIOLATION board ' + n + ': ' + l + ' < prev ' + prevLen);
    lenViolations++;
  }
  prevLen = l;
}
if (lenViolations === 0) {
  console.log('  Sequence length: monotone non-decreasing ✓');
} else {
  console.log('  Sequence length violations: ' + lenViolations + ' ✗');
}

console.log('  Sample board  1:', boards[0].sequence.slice(0, 5).join(','), '→', boards[0].answer);
console.log('  Sample board 18:', boards[17].sequence.slice(0, 5).join(','), '→', boards[17].answer);
console.log('  Sample board 35:', boards[34].sequence.slice(0, 5).join(','), '→', boards[34].answer);
console.log('  Sample board 86:', boards[85].sequence.slice(0, 5).join(','), '→', boards[85].answer);
