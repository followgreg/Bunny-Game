/* numeral.js — Numeral game logic */
(function (global) {
  'use strict';

  var ROWS = 12;
  var COLS = 12;

  // ── Grid initialisation ───────────────────────────────────────────────────
  function initGrid() {
    var grid = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        row.push(Math.floor(Math.random() * 9) + 1); // 1–9
      }
      grid.push(row);
    }
    return grid;
  }

  // ── Path helpers ──────────────────────────────────────────────────────────
  function allBlanksBetween(grid, r1, c1, r2, c2) {
    var dr = Math.sign(r2 - r1);
    var dc = Math.sign(c2 - c1);
    var r = r1 + dr;
    var c = c1 + dc;
    while (r !== r2 || c !== c2) {
      if (grid[r][c] !== null) return false;
      r += dr;
      c += dc;
    }
    return true;
  }

  function isWrapPair(grid, r1, c1, r2, c2) {
    if (r2 !== r1 + 1) return false;
    var colsLen = grid[0].length;
    var v1 = grid[r1][c1];
    var v2 = grid[r2][c2];
    if (v1 === null || v2 === null) return false;
    if (v1 !== v2 && v1 + v2 !== 10) return false;
    for (var ca = c1 + 1; ca < colsLen; ca++) {
      if (grid[r1][ca] !== null) return false;
    }
    for (var cb = 0; cb < c2; cb++) {
      if (grid[r2][cb] !== null) return false;
    }
    return true;
  }

  function isValidPair(grid, r1, c1, r2, c2) {
    var v1 = grid[r1][c1];
    var v2 = grid[r2][c2];
    if (v1 === null || v2 === null) return false;

    if (isWrapPair(grid, r1, c1, r2, c2)) return true;
    if (isWrapPair(grid, r2, c2, r1, c1)) return true;

    var sameRow  = r1 === r2;
    var sameCol  = c1 === c2;
    var sameDiag = Math.abs(r1 - r2) === Math.abs(c1 - c2);
    if (!sameRow && !sameCol && !sameDiag) return false;

    if (!allBlanksBetween(grid, r1, c1, r2, c2)) return false;

    return (v1 === v2) || (v1 + v2 === 10);
  }

  // ── Row consolidation ─────────────────────────────────────────────────────
  function consolidateRows(grid) {
    var nonEmpty = grid.filter(function (row) {
      return row.some(function (cell) { return cell !== null; });
    });
    var empty = grid.filter(function (row) {
      return row.every(function (cell) { return cell === null; });
    });
    return nonEmpty.concat(empty);
  }

  // ── No-moves detection ────────────────────────────────────────────────────
  function hasAnyValidPair(grid) {
    for (var r1 = 0; r1 < ROWS; r1++) {
      for (var c1 = 0; c1 < COLS; c1++) {
        if (grid[r1][c1] === null) continue;
        for (var r2 = 0; r2 < ROWS; r2++) {
          for (var c2 = 0; c2 < COLS; c2++) {
            if (r1 === r2 && c1 === c2) continue;
            if (isValidPair(grid, r1, c1, r2, c2)) return true;
          }
        }
      }
    }
    return false;
  }

  // ── Hint: first valid pair in row-major order ─────────────────────────────
  function findHintPair(grid) {
    for (var r1 = 0; r1 < ROWS; r1++) {
      for (var c1 = 0; c1 < COLS; c1++) {
        if (grid[r1][c1] === null) continue;
        for (var r2 = 0; r2 < ROWS; r2++) {
          for (var c2 = 0; c2 < COLS; c2++) {
            if (r1 === r2 && c1 === c2) continue;
            if (isValidPair(grid, r1, c1, r2, c2)) {
              return { r1: r1, c1: c1, r2: r2, c2: c2 };
            }
          }
        }
      }
    }
    return null;
  }

  // ── Score: count remaining non-null cells ─────────────────────────────────
  function countRemaining(grid) {
    var n = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (grid[r][c] !== null) n++;
      }
    }
    return n;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  global.Numeral = {
    ROWS:              ROWS,
    COLS:              COLS,
    initGrid:          initGrid,
    isValidPair:       isValidPair,
    isWrapPair:        isWrapPair,
    allBlanksBetween:  allBlanksBetween,
    consolidateRows:   consolidateRows,
    hasAnyValidPair:   hasAnyValidPair,
    countRemaining:    countRemaining,
    findHintPair:      findHintPair,
  };

}(window));
