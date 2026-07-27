/* slope.js — Slope game simulation engine */
(function (global) {
  'use strict';

  // ── Cell type constants ───────────────────────────────────────────────────
  var CELL = {
    EMPTY:        'empty',
    WALL:         'wall',
    PLATFORM:     'platform',
    RAMP_LEFT:    'ramp_left',
    RAMP_RIGHT:   'ramp_right',
    SLOT:         'slot',
    TARGET:       'target',
    MARBLE_START: 'marble_start',
  };

  var ROWS = 8;
  var COLS = 8;

  // ── Marble simulation ─────────────────────────────────────────────────────
  function simulateMarble(grid, startCol) {
    var r = 0;
    var c = startCol;
    var dr = 1;   // starts falling down
    var dc = 0;   // no horizontal movement
    var visited = new Set();
    var path = [{ r: r, c: c }];
    var MAX_STEPS = 200;

    for (var step = 0; step < MAX_STEPS; step++) {
      var nextR = r + dr;
      var nextC = c + dc;

      // Out of bounds → fail
      if (nextR < 0 || nextR >= ROWS || nextC < 0 || nextC >= COLS) {
        return { result: 'fail', path: path };
      }

      var nextCell = grid[nextR][nextC];

      // Win condition
      if (nextCell === CELL.TARGET) {
        path.push({ r: nextR, c: nextC });
        return { result: 'win', path: path };
      }

      // Solid obstacle (wall or platform)
      if (nextCell === CELL.WALL || nextCell === CELL.PLATFORM) {
        if (dc !== 0) {
          // Moving horizontally — stop horizontal, resume falling
          dc = 0;
          dr = 1;
          continue; // retry from same position
        } else {
          // Falling straight into a solid — stuck
          return { result: 'fail', path: path };
        }
      }

      // Ramp right ◢ — deflect diagonal right+down
      if (nextCell === CELL.RAMP_RIGHT) {
        path.push({ r: nextR, c: nextC });
        r = nextR; c = nextC;
        dr = 1; dc = 1;
        continue;
      }

      // Ramp left ◣ — deflect diagonal left+down
      if (nextCell === CELL.RAMP_LEFT) {
        path.push({ r: nextR, c: nextC });
        r = nextR; c = nextC;
        dr = 1; dc = -1;
        continue;
      }

      // Empty / slot / marble_start — marble passes through
      path.push({ r: nextR, c: nextC });
      r = nextR;
      c = nextC;

      // Cycle detection
      var key = r + ',' + c + ',' + dr + ',' + dc;
      if (visited.has(key)) return { result: 'fail', path: path };
      visited.add(key);
    }

    return { result: 'fail', path: path }; // exceeded MAX_STEPS
  }

  // ── Grid helpers ──────────────────────────────────────────────────────────
  function makeGrid(rows) {
    // rows: 8-element array of 8-element arrays of CELL values
    return rows;
  }

  function emptyGrid() {
    var g = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) row.push(CELL.EMPTY);
      g.push(row);
    }
    return g;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  global.Slope = {
    CELL:           CELL,
    ROWS:           ROWS,
    COLS:           COLS,
    simulateMarble: simulateMarble,
    emptyGrid:      emptyGrid,
    makeGrid:       makeGrid,
  };

}(window));
