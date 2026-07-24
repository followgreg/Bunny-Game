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

  // ── Fan damage formula ────────────────────────────────────────────────────────
  // Returns {columns, rows} — both dimensions scale with accuracy.
  function getFanDimensions(accuracyScore) {
    if (accuracyScore >= 98) return { columns: 10, rows: 10 };
    if (accuracyScore >= 93) return { columns: 8,  rows: 9  };
    if (accuracyScore >= 85) return { columns: 6,  rows: 7  };
    if (accuracyScore >= 75) return { columns: 4,  rows: 5  };
    if (accuracyScore >= 63) return { columns: 3,  rows: 4  };
    if (accuracyScore >= 50) return { columns: 2,  rows: 3  };
    if (accuracyScore >= 35) return { columns: 1,  rows: 2  };
    return { columns: 0, rows: 0 };                           // miss
  }

  // ── Fan geometry ─────────────────────────────────────────────────────────────
  // Returns array of {row, col} objects the fan destroys.
  // Fan tapers from 1 column wide at the base to maxColumns wide at the top.
  function getFanCellsDestroyed(aimedColumn, accuracyScore, totalColumns) {
    totalColumns = totalColumns !== undefined ? totalColumns : 10;
    var dims = getFanDimensions(accuracyScore);
    if (dims.columns === 0 || dims.rows === 0) return [];

    var maxColumns = dims.columns;
    var maxRows    = dims.rows;
    var result     = [];
    var bottomRow  = 9;
    var topRow     = bottomRow - maxRows + 1;

    for (var row = bottomRow; row >= topRow; row--) {
      var rowsFromBottom = bottomRow - row;
      var widthAtRow = maxRows <= 1
        ? maxColumns
        : Math.round(1 + (rowsFromBottom / (maxRows - 1)) * (maxColumns - 1));
      var halfSpread = Math.floor(widthAtRow / 2);
      var leftCol    = Math.max(0, aimedColumn - halfSpread);
      var rightCol   = Math.min(totalColumns - 1, aimedColumn + halfSpread);
      for (var col = leftCol; col <= rightCol; col++) {
        result.push({ row: row, col: col });
      }
    }
    return result;
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  global.SoundDestroyer = {
    ROUND_CONFIG:           ROUND_CONFIG,
    getRoundConfig:         getRoundConfig,
    getFanDimensions:       getFanDimensions,
    getFanCellsDestroyed:   getFanCellsDestroyed,
  };

}(window));
