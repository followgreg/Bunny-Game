#!/usr/bin/env node
/**
 * generate-spell-levels.js
 *
 * Builds assets/data/spell-levels.json for the Spell game.
 * Run once:  node generate-spell-levels.js
 *
 * Spell uses SNEK's first 50 boards verbatim — same cells, same start, same
 * verified Hamiltonian solution path. The word is NOT one letter per cell.
 * A 3–7 letter word is spread along the solution path as evenly spaced
 * checkpoints: the first letter sits on the start cell, the last on the final
 * cell of the path, the rest at equal intervals between. Every other cell is
 * blank.
 *
 * In play that makes the letters ordered gates. Stepping on a blank cell is
 * always fine; stepping on a lettered cell only works if it is the next letter
 * of the word. So the word constrains the *order* in which you sweep the
 * board, while SNEK's "cover every cell exactly once" stays the real puzzle.
 *
 * Coordinate note: snek-levels.json stores cells as [row, col] pairs. Spell
 * keeps `cells` in that same array form and mirrors each solution step as
 * {q: row, r: col}, so a letterMap key of "q,r" is the same "row,col" string
 * SNEK already uses internally. No coordinate remapping happens.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SNEK_PATH   = path.join(__dirname, 'assets', 'data', 'snek-levels.json');
const OUT_PATH    = path.join(__dirname, 'assets', 'data', 'spell-levels.json');
const BOARD_COUNT = 50;

// ── Word length by board size ────────────────────────────────────────────────
// Bigger board, longer word — so the checkpoints stay roughly evenly dense.
function wordLengthFor(cellCount) {
  if (cellCount <=  8) return 3;
  if (cellCount <= 15) return 4;
  if (cellCount <= 25) return 5;
  if (cellCount <= 40) return 6;
  return 7;
}

// ── Curated word list ────────────────────────────────────────────────────────
// Common English words by length. Criteria:
//   - familiar, not obscure, not proper nouns
//   - no profanity
//   - no two consecutive letters the same
//
// That last rule mattered when adjacent cells held consecutive letters. Now
// that letters are spread out — never closer than two cells apart on any of
// the 50 boards — it is no longer strictly required. It is kept because the
// list is already curated and verified against it, and it costs nothing.

const WORDS = {
  3: [
    'CAT', 'DOG', 'RUN', 'FLY', 'SKY', 'MUD', 'SUN', 'WAR', 'MAP', 'CUP',
    'BOX', 'JAR', 'OWL', 'FOX', 'ICE', 'KEY', 'NET', 'PEN', 'RIB', 'TAG',
    'WAX', 'ZIP', 'HAT', 'LOG', 'ARM'
  ],
  4: [
    'FAST', 'JUMP', 'WIND', 'BOLD', 'DARK', 'GIFT', 'FARM', 'WISH', 'LAMP', 'CALM',
    'DUSK', 'FERN', 'GLOW', 'HAWK', 'IRON', 'KELP', 'MINT', 'NEST', 'PORT', 'QUIZ',
    'RAFT', 'SILK', 'TIDE', 'VOLT', 'WOLF'
  ],
  5: [
    'BLAZE', 'FROST', 'GLINT', 'HUMID', 'PLANT', 'QUIRK', 'CRISP', 'DWARF', 'EMBER', 'FLINT',
    'GRAPE', 'HOTEL', 'INDEX', 'JOKER', 'KNIFE', 'LEMON', 'MARSH', 'NOBLE', 'ORBIT', 'PRISM',
    'RIVER', 'STORM', 'TIGER', 'VAPOR', 'WHALE'
  ],
  6: [
    'BASKET', 'CANDLE', 'DRAGON', 'FALCON', 'GARDEN', 'HUNTER', 'ISLAND', 'JACKET',
    'MARBLE', 'NECTAR', 'ORCHID', 'PENCIL', 'QUARTZ', 'RANGER', 'SILVER', 'TEMPLE',
    'VELVET', 'WINTER', 'ZEPHYR', 'PLANET', 'FROSTY', 'JAUNTY', 'MODEST', 'OUTLAW'
  ],
  7: [
    'BLANKET', 'DOLPHIN', 'FACTORY', 'HUNDRED', 'IMAGINE', 'JUSTICE', 'KINGDOM', 'LANTERN',
    'MONARCH', 'NETWORK', 'ORCHARD', 'PANTHER', 'QUANTUM', 'RAINBOW', 'STADIUM', 'THUNDER',
    'VOLCANO', 'WHISPER', 'CAPTAIN', 'DIAMOND', 'EXPLORE', 'GRAVITY', 'HARVEST', 'JOURNEY',
    'TRIUMPH', 'MYSTERY', 'PYRAMID', 'CRYSTAL'
  ]
};

// ── Word list validation ─────────────────────────────────────────────────────

function hasConsecutiveRepeat(word) {
  for (let i = 0; i < word.length - 1; i++) {
    if (word[i] === word[i + 1]) return true;
  }
  return false;
}

function validateWordList() {
  const problems = [];
  const seen = new Set();

  for (const lenKey of Object.keys(WORDS)) {
    const len  = Number(lenKey);
    const list = WORDS[lenKey];

    if (list.length < 15) problems.push(`length ${len}: only ${list.length} words (need at least 15)`);

    for (const word of list) {
      if (word.length !== len)        problems.push(`"${word}" is ${word.length} letters, sits in the ${len} tier`);
      if (!/^[A-Z]+$/.test(word))     problems.push(`"${word}" is not plain uppercase A–Z`);
      if (hasConsecutiveRepeat(word)) problems.push(`"${word}" has two consecutive identical letters`);
      if (seen.has(word))             problems.push(`"${word}" appears more than once`);
      seen.add(word);
    }
  }
  return problems;
}

// ── Letter placement ─────────────────────────────────────────────────────────
// Evenly spaced indices along a path of `pathLen` cells: first letter at 0,
// last at pathLen - 1.
function letterIndices(pathLen, wordLen) {
  const idx = [];
  for (let i = 0; i < wordLen; i++) {
    idx.push(Math.round(i * (pathLen - 1) / (wordLen - 1)));
  }
  return idx;
}

// ── Build ────────────────────────────────────────────────────────────────────

function build() {
  const problems = validateWordList();
  if (problems.length) {
    console.error('Word list failed validation:');
    problems.forEach(p => console.error('  - ' + p));
    process.exit(1);
  }

  const totalWords = Object.keys(WORDS).reduce((n, k) => n + WORDS[k].length, 0);
  console.log(`Word list OK — ${totalWords} words across lengths 3–7, every word verified `
            + 'free of consecutive repeated letters.\n');

  const snek   = JSON.parse(fs.readFileSync(SNEK_PATH, 'utf8'));
  const boards = snek.slice(0, BOARD_COUNT);
  console.log(`Read ${boards.length} boards from ${path.relative(__dirname, SNEK_PATH)} — used verbatim.\n`);

  const used    = new Set();
  const levels  = [];
  const flags   = [];

  for (const board of boards) {
    const cellCount = board.cells.length;
    const wordLen   = wordLengthFor(cellCount);

    if (!board.solution || board.solution.length !== cellCount) {
      flags.push(`SNEK board ${board.level}: stored solution does not cover every cell exactly once`);
      continue;
    }

    const pool = WORDS[wordLen];
    const word = pool.find(w => !used.has(w));
    if (!word) {
      flags.push(`SNEK board ${board.level} (${cellCount} cells): out of unused ${wordLen}-letter words`);
      continue;
    }
    used.add(word);

    // Spread the letters along the verified Hamiltonian path.
    const solution = board.solution.map(c => ({ q: c[0], r: c[1] }));
    const idx      = letterIndices(solution.length, word.length);
    const letterMap = {};
    idx.forEach((pathPos, i) => {
      const cell = solution[pathPos];
      letterMap[`${cell.q},${cell.r}`] = word[i];
    });

    // Sanity: distinct cells, and the gaps the player walks between letters.
    const gaps = idx.slice(1).map((v, i) => v - idx[i]);
    if (Object.keys(letterMap).length !== word.length) {
      flags.push(`SNEK board ${board.level}: letters collided on the same cell`);
      used.delete(word);
      continue;
    }

    levels.push({
      level:        levels.length + 1,
      snekLevel:    board.level,
      word:         word,
      cells:        board.cells,
      solution:     solution,
      letterMap:    letterMap,
      letterSteps:  idx,
      start:        { q: board.start[0], r: board.start[1] }
    });

    console.log(`  Level ${String(levels.length).padStart(2)}  ${word.padEnd(7)} `
              + `${String(cellCount).padStart(2)} cells, ${word.length} letters at path steps `
              + `[${idx.join(', ')}]  gaps ${gaps.join('/')}`);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(levels, null, 2));

  if (flags.length) {
    console.log('\nFlags:');
    flags.forEach(f => console.log('  ⚠  ' + f));
  }

  console.log(`\nWrote ${levels.length} levels to ${path.relative(__dirname, OUT_PATH)}.`);
}

build();
