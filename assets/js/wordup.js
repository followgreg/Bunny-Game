(function (root) {
  'use strict';

  // ── Standard Boggle 16-die set ─────────────────────────────────────────────
  //
  // Source: New Boggle (1992) commercial distribution.
  // Die 10 carries Q as the combined token 'Qu' — one cell, two letters consumed
  // when the cell is used in a word.  All other faces are single uppercase letters.
  var BOGGLE_DICE = [
    ['A', 'A', 'E', 'E', 'G', 'N'],   //  0
    ['E', 'L', 'R', 'T', 'T', 'Y'],   //  1
    ['A', 'O', 'O', 'T', 'T', 'W'],   //  2
    ['A', 'B', 'B', 'J', 'O', 'O'],   //  3
    ['E', 'H', 'R', 'T', 'V', 'W'],   //  4
    ['C', 'I', 'M', 'O', 'T', 'U'],   //  5
    ['D', 'I', 'S', 'T', 'T', 'Y'],   //  6
    ['E', 'I', 'O', 'S', 'S', 'T'],   //  7
    ['D', 'E', 'L', 'R', 'V', 'Y'],   //  8
    ['A', 'C', 'H', 'O', 'P', 'S'],   //  9
    ['H', 'I', 'M', 'N', 'Qu', 'U'],  // 10 — Q face displayed as 'Qu'
    ['E', 'E', 'I', 'N', 'S', 'U'],   // 11
    ['E', 'E', 'G', 'H', 'N', 'W'],   // 12
    ['A', 'F', 'F', 'K', 'P', 'S'],   // 13
    ['H', 'L', 'N', 'N', 'R', 'Z'],   // 14
    ['D', 'E', 'I', 'L', 'R', 'X'],   // 15
  ];

  // ── ET calendar date — resets at 12:01 AM ET daily ───────────────────────
  //
  // Subtracting 1 minute before computing the ET date means the key changes
  // at clock-time 12:01 AM ET: at 12:00 AM ET, (now - 1 min) still maps to
  // yesterday's date; at 12:01 AM ET, (now - 1 min) maps to today's date.
  //
  // DST boundaries (US Eastern):
  //   Spring forward — 2nd Sunday of March at 2:00 AM EST = 07:00 UTC
  //   Fall back      — 1st Sunday of November at 2:00 AM EDT = 06:00 UTC
  function getEtDateKey() {
    var ts   = Date.now() - 60000;
    var year = new Date(ts).getUTCFullYear();

    var mar1     = new Date(Date.UTC(year,  2, 1)).getUTCDay();
    var dstStart = Date.UTC(year,  2, 1 + (7 - mar1) % 7 + 7, 7, 0, 0);

    var nov1     = new Date(Date.UTC(year, 10, 1)).getUTCDay();
    var dstEnd   = Date.UTC(year, 10, 1 + (7 - nov1) % 7,     6, 0, 0);

    var offsetMs = (ts >= dstStart && ts < dstEnd) ? -4 * 3600000 : -5 * 3600000;
    var et       = new Date(ts + offsetMs);

    return (
      et.getUTCFullYear() + '-' +
      String(et.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(et.getUTCDate()).padStart(2, '0')
    );
  }

  // ── Seedable PRNG — 32-bit LCG (same pattern as Cropped) ─────────────────
  function hashString(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h >>> 0;
  }

  function makePrng(seed) {
    var state = (seed >>> 0) || 2463534242;
    return function () {
      state = ((state * 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  // ── Daily grid ─────────────────────────────────────────────────────────────
  //
  // Algorithm: shuffle all 16 Boggle dice (Fisher-Yates), take the first 9,
  // roll each die (random face from 6).  Returns an array of 9 strings —
  // single uppercase letters or 'Qu'.  Same dateKey → identical result.
  function getDailyGrid(dateKey) {
    var seed = hashString('wordup-' + dateKey);
    var rng  = makePrng(seed);

    var dice = BOGGLE_DICE.map(function (d) { return d.slice(); });
    for (var i = dice.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = dice[i]; dice[i] = dice[j]; dice[j] = tmp;
    }

    var grid = [];
    for (var k = 0; k < 9; k++) {
      grid.push(dice[k][Math.floor(rng() * 6)]);
    }

    return grid;
  }

  // ── Part 2 — Grid rendering ────────────────────────────────────────────────

  //   Cell layout (row-major, unchanged by cosmetic rotation):
  //   0  1  2
  //   3  4  5
  //   6  7  8
  var ADJACENCY = [
    [1, 3, 4],
    [0, 2, 3, 4, 5],
    [1, 4, 5],
    [0, 1, 4, 6, 7],
    [0, 1, 2, 3, 5, 6, 7, 8],
    [1, 2, 4, 7, 8],
    [3, 4, 7],
    [3, 4, 5, 6, 8],
    [4, 5, 7],
  ];

  var DIRECTIONS_TEXT =
    'A new 3×3 grid of letters appears every day. ' +
    'Tap letters in sequence — each step must touch the previous cell ' +
    '(including diagonally). No cell can be used twice in the same word. ' +
    'Find as many valid words of 3 or more letters as you can before time runs out. ' +
    'Longer words score more points, and a full 9-letter word is worth a 50-point bonus. ' +
    'Use the Rotate button to spin the board and see the letters from a new angle.';

  // Game state
  var dailyKey  = null;
  var dailyGrid = null;   // array of 9 strings

  // ── Render the 3×3 letter grid ────────────────────────────────────────────
  function renderGrid(grid) {
    var el = document.getElementById('wu-grid');
    if (!el) return;
    el.innerHTML = '';
    for (var i = 0; i < 9; i++) {
      var cell       = document.createElement('div');
      cell.className = 'wu-cell' + (grid[i] === 'Qu' ? ' wu-cell--qu' : '');
      cell.dataset.idx = String(i);
      cell.textContent = grid[i];
      el.appendChild(cell);
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      dailyKey  = getEtDateKey();
      dailyGrid = getDailyGrid(dailyKey);
      renderGrid(dailyGrid);

      var helpBtn = document.getElementById('help-btn');
      if (helpBtn) helpBtn.addEventListener('click', function () {
        openDirections(DIRECTIONS_TEXT);
      });
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  var WordUp = {
    getEtDateKey : getEtDateKey,
    getDailyGrid : getDailyGrid,
    ADJACENCY    : ADJACENCY,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WordUp;
  } else {
    root.WordUp = WordUp;
  }

}(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {})));

// ── Node.js test / preview ─────────────────────────────────────────────────
if (typeof require === 'function' && typeof module !== 'undefined' && require.main === module) {
  var wu = module.exports;

  var key  = wu.getEtDateKey();
  var grid = wu.getDailyGrid(key);

  console.log('ET date key : ' + key);
  console.log('Grid:');
  console.log('  ' + grid.slice(0, 3).join('  '));
  console.log('  ' + grid.slice(3, 6).join('  '));
  console.log('  ' + grid.slice(6, 9).join('  '));

  var grid2 = wu.getDailyGrid(key);
  var det = grid.every(function (l, i) { return l === grid2[i]; });
  console.log('\nDeterminism : ' + (det ? 'PASS' : 'FAIL'));

  var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  var gridY     = wu.getDailyGrid(yesterday);
  var diff      = grid.some(function (l, i) { return l !== gridY[i]; });
  console.log('Cross-day   : ' + (diff ? 'PASS — grids differ' : 'NOTE — identical (rare)'));
}
