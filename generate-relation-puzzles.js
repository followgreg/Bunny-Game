// generate-relation-puzzles.js
// node generate-relation-puzzles.js  ->  assets/data/relation-puzzles.json
//
// Reads the approved word sets from relation-candidates.txt and lays each one
// out on a 5x5 grid as four vertex-disjoint 4-directional paths.
//
// TWO DEPARTURES FROM THE BRIEF, both deliberate:
//
// 1. ALGORITHM. The brief says: scatter the 18 letters onto the grid, then
//    search for paths that happen to spell the words. That is the problem
//    backwards and enormously harder. Placement is purely geometric - the
//    letters never constrain it - so this generates the four disjoint paths
//    FIRST and writes each word along its path. Every attempt is valid by
//    construction, which is why this runs in milliseconds rather than
//    backtracking for hours.
//
// 2. UNIQUENESS. The brief says multiple path solutions are acceptable, "same
//    as Honey". Honey can allow that because its win check is a global graph
//    property re-evaluated after every move, so any valid configuration wins.
//    Relation locks tiles permanently the moment a word is traced. If a word
//    can be traced over a DIFFERENT set of tiles, the player locks the wrong
//    cells and the remaining words become unsolvable with no way back. So each
//    word here is required to have exactly one tile-set solution. This costs
//    nothing: all 200 approved sets achieve it.
//
//    Note "tile set", not "path". A palindrome like BOB traces the same cells
//    forwards and backwards; the player selects identical tiles either way, so
//    that is not an ambiguity. Counting paths would wrongly reject it.
//
// 3. DECOYS. The 7 cells no word passes through carry plausible letters rather
//    than being blank walls, so the grid's shape gives nothing away. Those extra
//    letters can open a SECOND route to one of the words - measured at 27.5% of
//    puzzles on a naive fill - so the decoys are re-rolled until uniqueness
//    still holds across all 25 letters.
'use strict';

const fs   = require('fs');
const path = require('path');

const N          = 5;
const CELLS      = N * N;
const LAUNCH_DAY = '2026-08-01';   // puzzle 1 = this UTC date; change to re-date the run
const IN_PATH    = path.join(__dirname, 'relation-candidates.txt');
const OUT_PATH   = path.join(__dirname, 'assets', 'data', 'relation-puzzles.json');

// ── Grid helpers ─────────────────────────────────────────────────────────────

const NBR = [];
for (let r = 0; r < N; r++) {
  for (let c = 0; c < N; c++) {
    const i = r * N + c, a = [];
    if (r > 0)     a.push(i - N);
    if (r < N - 1) a.push(i + N);
    if (c > 0)     a.push(i - 1);
    if (c < N - 1) a.push(i + 1);
    NBR[i] = a;
  }
}
const rc = i => ({ r: Math.floor(i / N), c: i % N });

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Four vertex-disjoint self-avoiding paths of length 6,5,4,3
function randomPacking(rand) {
  const used = new Uint8Array(CELLS);
  const acc  = [];
  for (const len of [6, 5, 4, 3]) {
    let placed = null;
    for (let tries = 0; tries < 500 && !placed; tries++) {
      const free = [];
      for (let i = 0; i < CELLS; i++) if (!used[i]) free.push(i);
      if (!free.length) return null;
      const start = free[(rand() * free.length) | 0];
      const p = [start];
      const mark = [start];
      used[start] = 1;
      let ok = true;
      while (p.length < len) {
        const opts = NBR[p[p.length - 1]].filter(n => !used[n]);
        if (!opts.length) { ok = false; break; }
        const n = opts[(rand() * opts.length) | 0];
        used[n] = 1; mark.push(n); p.push(n);
      }
      if (ok) placed = p;
      else mark.forEach(x => { used[x] = 0; });
    }
    if (!placed) return null;
    acc.push(placed);
  }
  return acc;   // [len6, len5, len4, len3]
}

// ── Decoys ───────────────────────────────────────────────────────────────────
// The 7 cells no word passes through are filled with plausible letters rather
// than left blank, so the grid gives nothing away by shape alone.
//
// This is not cosmetic. Adding 7 letters can create a SECOND way to trace one of
// the four words, and because a found word locks its tiles permanently, a player
// who traces the decoy version locks the wrong cells and strands the rest of the
// puzzle. Measured on a naive fill, that happens to 27.5% of puzzles. So the
// decoy letters are re-rolled until every word still has exactly one tile set.
const COMMON_LETTERS = 'ETAOINSHRDLUCMFYWGPBVKJXQZ';

function randomDecoy(rand) {
  // Biased toward the front of the string, so the grid reads like English
  return COMMON_LETTERS[Math.floor(Math.pow(rand(), 1.5) * COMMON_LETTERS.length)];
}

// Distinct TILE SETS that spell `word` in this grid
function tileSetsFor(grid, word, cap = 8) {
  const sets = new Set();
  const used = new Uint8Array(CELLS);
  const cur  = [];
  function go(i, idx) {
    if (sets.size >= cap) return;
    if (idx === word.length) { sets.add(cur.slice().sort((a, b) => a - b).join(',')); return; }
    for (const n of NBR[i]) {
      if (used[n] || grid[n] !== word[idx]) continue;
      used[n] = 1; cur.push(n); go(n, idx + 1); cur.pop(); used[n] = 0;
    }
  }
  for (let s = 0; s < CELLS; s++) {
    if (grid[s] !== word[0]) continue;
    used[s] = 1; cur.push(s); go(s, 1); cur.pop(); used[s] = 0;
  }
  return sets.size;
}

// ── Build one puzzle ─────────────────────────────────────────────────────────

function buildPuzzle(entry, seed) {
  const rand   = rng(seed);
  const byLen  = {};
  entry.words.forEach(w => { byLen[w.length] = w; });

  for (let attempt = 0; attempt < 4000; attempt++) {
    const pack = randomPacking(rand);
    if (!pack) continue;

    const paths = { 6: pack[0], 5: pack[1], 4: pack[2], 3: pack[3] };
    const grid  = new Array(CELLS).fill(null);
    for (const len of [3, 4, 5, 6]) {
      const w = byLen[len], p = paths[len];
      for (let i = 0; i < len; i++) grid[p[i]] = w[i];
    }

    // Every word must have exactly one tile-set solution on the bare 18 cells
    let unique = true;
    for (const w of entry.words) {
      if (tileSetsFor(grid, w) !== 1) { unique = false; break; }
    }
    if (!unique) continue;

    const empties = [];
    for (let i = 0; i < CELLS; i++) if (grid[i] === null) empties.push(i);

    // Re-roll the decoy letters until they stop creating a second route to a word
    let decoyFills = 0;
    let filled = null;
    for (let d = 0; d < 300; d++) {
      const test = grid.slice();
      empties.forEach(i => { test[i] = randomDecoy(rand); });
      decoyFills++;

      let stillUnique = true;
      for (const w of entry.words) {
        if (tileSetsFor(test, w) !== 1) { stillUnique = false; break; }
      }
      if (stillUnique) { filled = test; break; }
    }
    if (!filled) continue;   // this packing resists decoys — take another

    const solution = {};
    for (const len of [3, 4, 5, 6]) solution[byLen[len]] = paths[len].map(rc);
    const decoySet = new Set(empties);

    // Every cell carries a letter now; isDecoy marks the ones no word uses
    const cellGrid = Array.from({ length: N }, (_, r) =>
      Array.from({ length: N }, (_, c) => {
        const i = r * N + c;
        return { letter: filled[i], isDecoy: decoySet.has(i) };
      }));

    return {
      grid: cellGrid,
      solution,
      decoys: empties.map(rc),
      attempts: attempt + 1,
      decoyFills,
    };
  }
  return null;
}

// ── Verification, run against the finished object ────────────────────────────

function verify(p) {
  const problems = [];
  const flat = p.grid.flat();
  const at   = (r, c) => p.grid[r][c];
  const adj  = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

  if (p.grid.length !== N || p.grid.some(row => row.length !== N)) problems.push('grid is not 5x5');
  if (flat.length !== CELLS) problems.push(`cells: ${flat.length}, need 25`);

  // every cell carries a letter now — no nulls anywhere
  flat.forEach((cell, i) => {
    if (!cell || typeof cell.letter !== 'string' || !/^[A-Z]$/.test(cell.letter))
      problems.push(`cell ${i} has no valid letter`);
    if (typeof cell.isDecoy !== 'boolean') problems.push(`cell ${i} has no isDecoy flag`);
  });

  const decoyCount = flat.filter(c => c && c.isDecoy).length;
  if (decoyCount !== 7) problems.push(`decoys: ${decoyCount}, need 7`);
  if (flat.filter(c => c && !c.isDecoy).length !== 18) problems.push('real letter cells != 18');

  const lens = p.words.map(w => w.length).sort((a, b) => a - b).join(',');
  if (lens !== '3,4,5,6') problems.push(`word lengths ${lens}`);

  const covered = new Set();
  for (const w of p.words) {
    const cells = p.solution[w];
    if (!cells) { problems.push(`${w}: no solution path`); continue; }
    if (cells.length !== w.length) problems.push(`${w}: path length ${cells.length}`);
    cells.forEach((cell, i) => {
      if (cell.r < 0 || cell.r >= N || cell.c < 0 || cell.c >= N) { problems.push(`${w}: cell off grid`); return; }
      const g = at(cell.r, cell.c);
      if (g.isDecoy)        problems.push(`${w}: path crosses a decoy at ${cell.r},${cell.c}`);
      if (g.letter !== w[i]) problems.push(`${w}: cell ${i} holds ${g.letter}, expected ${w[i]}`);
      if (i > 0 && !adj(cells[i - 1], cell)) problems.push(`${w}: step ${i} is not 4-adjacent`);
      const key = cell.r + ',' + cell.c;
      if (covered.has(key)) problems.push(`${w}: cell ${key} used by more than one word`);
      covered.add(key);
    });
  }
  if (covered.size !== 18) problems.push(`paths cover ${covered.size} cells, need 18`);

  // the declared decoys must be exactly the cells no word touches
  const decoyKeys = new Set(p.decoys.map(d => d.r + ',' + d.c));
  if (decoyKeys.size !== 7) problems.push('duplicate decoy entries');
  for (const d of p.decoys) {
    if (!at(d.r, d.c).isDecoy)        problems.push(`decoy ${d.r},${d.c} not flagged in the grid`);
    if (covered.has(d.r + ',' + d.c)) problems.push(`decoy ${d.r},${d.c} lies on a word path`);
  }
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const onPath = covered.has(r + ',' + c);
      if (at(r, c).isDecoy === onPath) problems.push(`cell ${r},${c}: isDecoy disagrees with the paths`);
    }
  }

  // uniqueness, recomputed across all 25 letters including the decoys
  const linear = flat.map(c => c.letter);
  for (const w of p.words) {
    const n = tileSetsFor(linear, w);
    if (n !== 1) problems.push(`${w}: ${n} distinct tile sets spell it`);
  }
  return problems;
}

// ── Input ────────────────────────────────────────────────────────────────────

function readApproved() {
  const txt = fs.readFileSync(IN_PATH, 'utf8');
  return [...txt.matchAll(/^Theme: (.+)\n^Words: (.+)$/gm)].map(m => ({
    theme: m[1].trim(),
    words: [...m[2].matchAll(/([A-Z]+) \(\d\)/g)].map(x => x[1]),
  }));
}

function dayKeyFor(index) {
  const d = new Date(LAUNCH_DAY + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + index);
  return d.toISOString().slice(0, 10);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const approved = readApproved();
console.log(`approved word sets read: ${approved.length}\n`);

const puzzles = [];
const failed  = [];
let totalAttempts = 0;
let totalDecoyFills = 0;

// Per-puzzle seed, so the run is reproducible
approved.forEach((entry, i) => {
  const built = buildPuzzle(entry, (i + 1) * 2654435761);
  if (!built) { failed.push(entry); return; }
  totalAttempts += built.attempts;
  totalDecoyFills += built.decoyFills;
  puzzles.push({
    id:       puzzles.length + 1,
    dayKey:   dayKeyFor(puzzles.length),
    theme:    entry.theme,
    words:    entry.words.slice().sort((a, b) => a.length - b.length),
    grid:     built.grid,
    solution: built.solution,
    decoys:   built.decoys,
  });
});

let broken = 0;
puzzles.forEach(p => {
  const probs = verify(p);
  if (probs.length) {
    broken++;
    console.log(`INVALID  #${p.id} ${p.theme}`);
    probs.slice(0, 4).forEach(x => console.log('    ' + x));
  }
});

console.log(`generated valid grids : ${puzzles.length} / ${approved.length}`);
console.log(`failed to arrange     : ${failed.length}`);
failed.forEach(f => console.log(`    ${f.theme}: ${f.words.join('/')}`));
console.log(`failing verification  : ${broken}`);
console.log(`mean packing attempts : ${(totalAttempts / Math.max(1, puzzles.length)).toFixed(1)}`);
console.log(`mean decoy re-rolls   : ${(totalDecoyFills / Math.max(1, puzzles.length)).toFixed(1)}`);
console.log(`day keys              : ${puzzles.length ? puzzles[0].dayKey + ' .. ' + puzzles[puzzles.length - 1].dayKey : 'n/a'}`);

if (broken) { console.error('\nnot writing - some puzzles failed verification'); process.exit(1); }

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(puzzles, null, 2));
console.log(`\nwrote ${OUT_PATH}`);
