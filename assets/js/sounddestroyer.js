/* sounddestroyer.js — Sound Destroyer game logic */
(function (global) {
  'use strict';

  // ── Round scaling table ──────────────────────────────────────────────────────
  // Each entry: [shotsPerRound, toneDurationSeconds]
  var ROUND_CONFIG = [
    // Rounds 1-10
    [5, 3.0], [5, 3.0], [5, 3.0], [5, 3.0], [5, 3.0],
    [5, 3.0], [5, 3.0], [5, 3.0], [5, 3.0], [5, 3.0],
    // Rounds 11-20
    [5, 2.5], [5, 2.5], [5, 2.5], [5, 2.5], [5, 2.5],
    [5, 2.5], [5, 2.5], [5, 2.5], [5, 2.5], [5, 2.5],
    // Rounds 21-30
    [4, 2.5], [4, 2.5], [4, 2.5], [4, 2.5], [4, 2.5],
    [4, 2.5], [4, 2.5], [4, 2.5], [4, 2.5], [4, 2.5],
    // Rounds 31-40
    [4, 2.0], [4, 2.0], [4, 2.0], [4, 2.0], [4, 2.0],
    [4, 2.0], [4, 2.0], [4, 2.0], [4, 2.0], [4, 2.0],
    // Rounds 41-50
    [3, 2.0], [3, 2.0], [3, 2.0], [3, 2.0], [3, 2.0],
    [3, 2.0], [3, 2.0], [3, 2.0], [3, 2.0], [3, 2.0],
    // Rounds 51-60
    [3, 1.5], [3, 1.5], [3, 1.5], [3, 1.5], [3, 1.5],
    [3, 1.5], [3, 1.5], [3, 1.5], [3, 1.5], [3, 1.5],
    // Rounds 61-70
    [2, 1.5], [2, 1.5], [2, 1.5], [2, 1.5], [2, 1.5],
    [2, 1.5], [2, 1.5], [2, 1.5], [2, 1.5], [2, 1.5],
    // Rounds 71-80
    [2, 1.0], [2, 1.0], [2, 1.0], [2, 1.0], [2, 1.0],
    [2, 1.0], [2, 1.0], [2, 1.0], [2, 1.0], [2, 1.0],
    // Rounds 81-90
    [1, 1.0], [1, 1.0], [1, 1.0], [1, 1.0], [1, 1.0],
    [1, 1.0], [1, 1.0], [1, 1.0], [1, 1.0], [1, 1.0],
    // Rounds 91-100
    [1, 0.5], [1, 0.5], [1, 0.5], [1, 0.5], [1, 0.5],
    [1, 0.5], [1, 0.5], [1, 0.5], [1, 0.5], [1, 0.5],
  ];

  // 1-indexed: getRoundConfig(1) → [5, 3.0], getRoundConfig(100) → [1, 0.5]
  function getRoundConfig(roundNumber) {
    return ROUND_CONFIG[roundNumber - 1];
  }

  // ── Damage formula ───────────────────────────────────────────────────────────
  // Steep curve — only high accuracy produces meaningful damage
  function calculateColumnsDestroyed(accuracyScore) {
    if (accuracyScore >= 98) return 10; // near-perfect: full grid width
    if (accuracyScore >= 93) return 8;  // excellent
    if (accuracyScore >= 85) return 6;  // very good
    if (accuracyScore >= 75) return 4;  // good
    if (accuracyScore >= 63) return 3;  // decent
    if (accuracyScore >= 50) return 2;  // mediocre
    if (accuracyScore >= 35) return 1;  // weak
    return 0;                           // miss — beam fires but nothing dies
  }

  // ── Column spread ────────────────────────────────────────────────────────────
  // Returns sorted array of 0-indexed column indices destroyed by a shot.
  // Spreads outward left+right from aimedColumn until columnsCount reached.
  function getDestroyedColumns(aimedColumn, columnsCount, totalColumns) {
    totalColumns = totalColumns !== undefined ? totalColumns : 10;
    if (columnsCount <= 0) return [];
    var columns = {};
    columns[aimedColumn] = true;
    var left  = aimedColumn - 1;
    var right = aimedColumn + 1;
    while (Object.keys(columns).length < columnsCount) {
      if (right < totalColumns) { columns[right] = true; right++; }
      if (Object.keys(columns).length < columnsCount && left >= 0) { columns[left] = true; left--; }
      if (left < 0 && right >= totalColumns) break;
    }
    return Object.keys(columns).map(Number).sort(function (a, b) { return a - b; });
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  global.SoundDestroyer = {
    ROUND_CONFIG:            ROUND_CONFIG,
    getRoundConfig:          getRoundConfig,
    calculateColumnsDestroyed: calculateColumnsDestroyed,
    getDestroyedColumns:     getDestroyedColumns,
  };

}(window));
