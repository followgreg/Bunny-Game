/* coil.js — Coil sliding puzzle logic */
(function (global) {
  'use strict';

  // ── Spiral path generation ────────────────────────────────────────────────

  var _pathCache = {};

  function buildSpiralPath(totalSize) {
    if (_pathCache[totalSize]) return _pathCache[totalSize];

    var cx            = totalSize / 2;
    var cy            = totalSize / 2;
    var maxRadius     = totalSize * 0.46;
    var turns         = 11;
    var pointsPerTurn = 240;
    var totalPoints   = Math.floor(turns * pointsPerTurn);
    var d             = '';

    for (var i = 0; i <= totalPoints; i++) {
      var angle  = (i / pointsPerTurn) * Math.PI * 2;
      var radius = (i / totalPoints) * maxRadius;
      var x      = Math.round((cx + Math.cos(angle) * radius) * 10) / 10;
      var y      = Math.round((cy + Math.sin(angle) * radius) * 10) / 10;
      d += i === 0 ? ('M ' + x + ' ' + y) : (' L ' + x + ' ' + y);
    }
    _pathCache[totalSize] = d;
    return d;
  }

  function generateSpiralSVG(size) {
    var d = buildSpiralPath(size);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">'
      + '<rect width="' + size + '" height="' + size + '" fill="#E8E8E8"/>'
      + '<path d="' + d + '" stroke="#1A3A6B" stroke-width="' + (size * 0.006) + '" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg>';
  }

  // ── Tile SVG generation ───────────────────────────────────────────────────

  function generateTileSVG(totalSize, tileSize, offsetX, offsetY) {
    var d = buildSpiralPath(totalSize);
    // Unique clip ID per tile to avoid collisions when many tile SVGs are in the DOM
    var clipId = 'cl-' + offsetX + '-' + offsetY;
    return '<svg xmlns="http://www.w3.org/2000/svg"'
      + ' width="' + tileSize + '" height="' + tileSize + '"'
      + ' viewBox="' + offsetX + ' ' + offsetY + ' ' + tileSize + ' ' + tileSize + '">'
      + '<defs><clipPath id="' + clipId + '">'
      + '<rect x="' + offsetX + '" y="' + offsetY + '" width="' + tileSize + '" height="' + tileSize + '"/>'
      + '</clipPath></defs>'
      + '<rect x="' + offsetX + '" y="' + offsetY + '" width="' + tileSize + '" height="' + tileSize + '" fill="#E8E8E8"/>'
      + '<path d="' + d + '" stroke="#1A3A6B" stroke-width="' + (totalSize * 0.006) + '" fill="none"'
      + ' stroke-linecap="round" stroke-linejoin="round"'
      + ' clip-path="url(#' + clipId + ')"/>'
      + '</svg>';
  }

  // ── Tile data generation ──────────────────────────────────────────────────

  function generateTiles(gridPixelSize) {
    var tileSize = gridPixelSize / 5;
    var tiles    = [];

    for (var row = 0; row < 5; row++) {
      for (var col = 0; col < 5; col++) {
        var id      = row * 5 + col;
        var isBlank = id === 24; // bottom-right tile is the blank sliding space
        tiles.push({
          id:              id,
          solvedRow:       row,
          solvedCol:       col,
          svgContent:      isBlank ? null : generateTileSVG(gridPixelSize, tileSize, col * tileSize, row * tileSize),
          currentRotation: 0,  // 0 | 1 | 2 | 3  (× 90°)
          locked:          false,
        });
      }
    }
    return tiles;
  }

  // ── Puzzle state ──────────────────────────────────────────────────────────

  var puzzleState = null;

  function initState(gridPixelSize) {
    var tiles = generateTiles(gridPixelSize);
    puzzleState = {
      grid:     Array.from({length: 5}, function (_, r) {
                  return Array.from({length: 5}, function (_, c) { return r * 5 + c; });
                }),
      blankPos: { row: 4, col: 4 },
      tiles:    tiles,
    };
    return puzzleState;
  }

  // ── Shuffle with parity fix ───────────────────────────────────────────────

  function countInversions(arr) {
    var inv = 0;
    for (var i = 0; i < arr.length; i++)
      for (var j = i + 1; j < arr.length; j++)
        if (arr[i] > arr[j]) inv++;
    return inv;
  }

  function shuffle() {
    // Flatten and remove blank
    var flat = [];
    for (var r = 0; r < 5; r++)
      for (var c = 0; c < 5; c++)
        if (puzzleState.grid[r][c] !== 24) flat.push(puzzleState.grid[r][c]);

    // Fisher-Yates
    for (var i = flat.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = flat[i]; flat[i] = flat[j]; flat[j] = tmp;
    }

    // Fix parity so puzzle is solvable (blank in bottom-right → even inversions)
    if (countInversions(flat) % 2 !== 0) {
      var t = flat[0]; flat[0] = flat[1]; flat[1] = t;
    }

    // Rebuild grid with blank fixed at [4][4]
    var idx = 0;
    var newGrid = [];
    for (var row = 0; row < 5; row++) {
      newGrid.push([]);
      for (var col = 0; col < 5; col++) {
        if (row === 4 && col === 4) newGrid[row].push(24);
        else                        newGrid[row].push(flat[idx++]);
      }
    }
    puzzleState.grid     = newGrid;
    puzzleState.blankPos = { row: 4, col: 4 };

    // Random starting rotations for all non-blank tiles
    puzzleState.tiles.forEach(function (tile, id) {
      if (id !== 24) {
        tile.currentRotation = Math.floor(Math.random() * 4);
        tile.displayDeg      = tile.currentRotation * 90;
      }
      tile.locked = false;
    });

    return newGrid;
  }

  // ── Move execution ────────────────────────────────────────────────────────

  function executeMove(tileRow, tileCol) {
    var blankRow = puzzleState.blankPos.row;
    var blankCol = puzzleState.blankPos.col;
    var dr = Math.abs(tileRow - blankRow);
    var dc = Math.abs(tileCol - blankCol);

    if (!((dr === 1 && dc === 0) || (dr === 0 && dc === 1))) return false;

    var tileId = puzzleState.grid[tileRow][tileCol];
    if (puzzleState.tiles[tileId].locked) return false;

    // Slide tile into blank
    puzzleState.grid[blankRow][blankCol] = tileId;
    puzzleState.grid[tileRow][tileCol]   = 24;
    puzzleState.blankPos = { row: tileRow, col: tileCol };

    // Rotate every unlocked non-blank tile 90° CW
    puzzleState.tiles.forEach(function (t, id) {
      if (id !== 24 && !t.locked) {
        t.currentRotation = (t.currentRotation + 1) % 4;
        t.displayDeg      = (t.displayDeg !== undefined ? t.displayDeg : 0) + 90;
      }
    });

    return true;
  }

  // ── Lock / unlock ─────────────────────────────────────────────────────────

  function toggleLock(tileRow, tileCol) {
    var tileId = puzzleState.grid[tileRow][tileCol];
    if (tileId === 24) return;
    var tile = puzzleState.tiles[tileId];
    tile.locked = !tile.locked;
  }

  // ── Win detection ─────────────────────────────────────────────────────────

  function checkWin() {
    for (var r = 0; r < 5; r++) {
      for (var c = 0; c < 5; c++) {
        var tileId = puzzleState.grid[r][c];
        if (tileId === 24) continue;
        var tile = puzzleState.tiles[tileId];
        if (tile.solvedRow !== r || tile.solvedCol !== c) return false;
        if (tile.currentRotation !== 0)                   return false;
        if (!tile.locked)                                  return false;
      }
    }
    return true;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  global.Coil = {
    buildSpiralPath:   buildSpiralPath,
    generateSpiralSVG: generateSpiralSVG,
    generateTileSVG:   generateTileSVG,
    generateTiles:     generateTiles,
    initState:         initState,
    shuffle:           shuffle,
    executeMove:       executeMove,
    toggleLock:        toggleLock,
    checkWin:          checkWin,
    getState:          function () { return puzzleState; },
  };

}(window));
