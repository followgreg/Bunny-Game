/* zone.js — Zone game logic */
(function (global) {
  'use strict';

  // ── Grid structure ────────────────────────────────────────────────────────

  function makeGrid() {
    return Array.from({ length: 9 }, function () { return Array(9).fill(null); });
  }

  function getZone(r, c) {
    return Math.floor(r / 3) * 3 + Math.floor(c / 3);
  }

  function isZoneFull(grid, zoneIndex) {
    var startRow = Math.floor(zoneIndex / 3) * 3;
    var startCol = (zoneIndex % 3) * 3;
    for (var r = startRow; r < startRow + 3; r++) {
      for (var c = startCol; c < startCol + 3; c++) {
        if (grid[r][c] === null) return false;
      }
    }
    return true;
  }

  // ── Piece definitions ─────────────────────────────────────────────────────

  var PIECES = [
    // 1×1
    { shape: [[1]], color: '#E74C3C' },

    // 1×2, 2×1
    { shape: [[1, 1]], color: '#3498DB' },
    { shape: [[1], [1]], color: '#3498DB' },

    // 1×3, 3×1
    { shape: [[1, 1, 1]], color: '#2ECC71' },
    { shape: [[1], [1], [1]], color: '#2ECC71' },

    // 1×4, 4×1
    { shape: [[1, 1, 1, 1]], color: '#9B59B6' },
    { shape: [[1], [1], [1], [1]], color: '#9B59B6' },

    // 1×5, 5×1
    { shape: [[1, 1, 1, 1, 1]], color: '#E67E22' },
    { shape: [[1], [1], [1], [1], [1]], color: '#E67E22' },

    // 2×2
    { shape: [[1, 1], [1, 1]], color: '#F1C40F' },

    // 2×3, 3×2
    { shape: [[1, 1, 1], [1, 1, 1]], color: '#1ABC9C' },
    { shape: [[1, 1], [1, 1], [1, 1]], color: '#1ABC9C' },

    // L-shapes and mirrors
    { shape: [[1, 0], [1, 0], [1, 1]], color: '#E74C3C' },
    { shape: [[0, 1], [0, 1], [1, 1]], color: '#E74C3C' },
    { shape: [[1, 1, 1], [1, 0, 0]], color: '#E74C3C' },
    { shape: [[1, 1, 1], [0, 0, 1]], color: '#E74C3C' },
    { shape: [[1, 1], [1, 0], [1, 0]], color: '#3498DB' },
    { shape: [[1, 1], [0, 1], [0, 1]], color: '#3498DB' },
    { shape: [[1, 0, 0], [1, 1, 1]], color: '#3498DB' },
    { shape: [[0, 0, 1], [1, 1, 1]], color: '#3498DB' },

    // T-shapes
    { shape: [[1, 1, 1], [0, 1, 0]], color: '#9B59B6' },
    { shape: [[0, 1, 0], [1, 1, 1]], color: '#9B59B6' },
    { shape: [[1, 0], [1, 1], [1, 0]], color: '#9B59B6' },
    { shape: [[0, 1], [1, 1], [0, 1]], color: '#9B59B6' },

    // S/Z shapes
    { shape: [[0, 1, 1], [1, 1, 0]], color: '#2ECC71' },
    { shape: [[1, 1, 0], [0, 1, 1]], color: '#2ECC71' },
    { shape: [[1, 0], [1, 1], [0, 1]], color: '#2ECC71' },
    { shape: [[0, 1], [1, 1], [1, 0]], color: '#2ECC71' },
  ];

  // ── Piece placement ───────────────────────────────────────────────────────

  function canPlace(grid, piece, startRow, startCol) {
    for (var r = 0; r < piece.shape.length; r++) {
      for (var c = 0; c < piece.shape[r].length; c++) {
        if (piece.shape[r][c] === 0) continue;
        var gr = startRow + r;
        var gc = startCol + c;
        if (gr < 0 || gr >= 9 || gc < 0 || gc >= 9) return false;
        if (grid[gr][gc] !== null) return false;
      }
    }
    return true;
  }

  function placePiece(grid, piece, startRow, startCol) {
    var newGrid = grid.map(function (row) { return row.slice(); });
    for (var r = 0; r < piece.shape.length; r++) {
      for (var c = 0; c < piece.shape[r].length; c++) {
        if (piece.shape[r][c] === 0) continue;
        newGrid[startRow + r][startCol + c] = piece.color;
      }
    }
    return newGrid;
  }

  // ── Always-solvable piece generation ─────────────────────────────────────

  function isPiecePlaceable(grid, piece) {
    for (var r = 0; r <= 9 - piece.shape.length; r++) {
      for (var c = 0; c <= 9 - piece.shape[0].length; c++) {
        if (canPlace(grid, piece, r, c)) return true;
      }
    }
    return false;
  }

  function generateThreePieces(grid) {
    var pieces = [];
    var attempts = 0;
    while (pieces.length < 3 && attempts < 1000) {
      attempts++;
      var candidate = PIECES[Math.floor(Math.random() * PIECES.length)];
      if (isPiecePlaceable(grid, candidate)) {
        pieces.push({
          shape: candidate.shape.map(function (row) { return row.slice(); }),
          color: candidate.color,
        });
      }
    }
    if (pieces.length < 3) return null;
    return pieces;
  }

  // ── Zone clearing and scoring ─────────────────────────────────────────────

  function clearFullZones(grid) {
    var clearedZones = [];
    for (var z = 0; z < 9; z++) {
      if (isZoneFull(grid, z)) clearedZones.push(z);
    }
    if (clearedZones.length === 0) return { newGrid: grid, score: 0, clearedZones: [], megaBonus: 0 };

    var newGrid = grid.map(function (row) { return row.slice(); });
    clearedZones.forEach(function (z) {
      var startRow = Math.floor(z / 3) * 3;
      var startCol = (z % 3) * 3;
      for (var r = startRow; r < startRow + 3; r++) {
        for (var c = startCol; c < startCol + 3; c++) {
          newGrid[r][c] = null;
        }
      }
    });

    var comboMultiplier = clearedZones.length;
    var baseScore = clearedZones.length * 9;
    var score = baseScore * comboMultiplier;
    var megaBonus = clearedZones.length === 9 ? 500 : 0;

    return { newGrid: newGrid, score: score + megaBonus, clearedZones: clearedZones, megaBonus: megaBonus };
  }

  // ── Game over detection ───────────────────────────────────────────────────

  function isGameOver(grid, pieces) {
    return pieces.every(function (piece) { return !isPiecePlaceable(grid, piece); });
  }

  // ── Save / restore ────────────────────────────────────────────────────────

  var SAVE_KEY = 'zone_gameState';

  function saveState(grid, pieces, score, highScore) {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      grid: grid,
      pieces: pieces,
      score: score,
      highScore: highScore,
      savedAt: Date.now(),
    }));
  }

  function loadState() {
    var saved = localStorage.getItem(SAVE_KEY);
    return saved ? JSON.parse(saved) : null;
  }

  function clearState() {
    localStorage.removeItem(SAVE_KEY);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  global.Zone = {
    makeGrid: makeGrid,
    getZone: getZone,
    isZoneFull: isZoneFull,
    PIECES: PIECES,
    canPlace: canPlace,
    placePiece: placePiece,
    isPiecePlaceable: isPiecePlaceable,
    generateThreePieces: generateThreePieces,
    clearFullZones: clearFullZones,
    isGameOver: isGameOver,
    saveState: saveState,
    loadState: loadState,
    clearState: clearState,
  };

}(window));
