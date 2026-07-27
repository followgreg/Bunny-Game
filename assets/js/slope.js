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
  // Physics: marble moves ONLY vertically OR horizontally — never diagonally.
  // Ramps deflect a FALLING marble to horizontal; a horizontal marble ignores ramps.
  // Each horizontal step checks if cell below is empty — if so, marble starts falling.
  function simulateMarble(grid, startCol) {
    var r = 0;
    var c = startCol;
    var dr = 1;   // starts falling down
    var dc = 0;   // no horizontal movement
    var visited = new Set();
    var path = [{ r: r, c: c, dr: dr, dc: dc }];
    var MAX_STEPS = 500;

    for (var step = 0; step < MAX_STEPS; step++) {
      // Cycle detection at start of each step (includes direction)
      var key = r + ',' + c + ',' + dr + ',' + dc;
      if (visited.has(key)) return { result: 'fail', path: path };
      visited.add(key);

      var nextR = r + dr;
      var nextC = c + dc;

      // Out of bounds → fail
      if (nextR < 0 || nextR >= ROWS || nextC < 0 || nextC >= COLS) {
        return { result: 'fail', path: path };
      }

      var nextCell = grid[nextR][nextC];

      // Win condition
      if (nextCell === CELL.TARGET) {
        path.push({ r: nextR, c: nextC, dr: dr, dc: dc });
        return { result: 'win', path: path };
      }

      // Solid obstacle (wall or platform)
      if (nextCell === CELL.WALL || nextCell === CELL.PLATFORM) {
        if (dc !== 0) {
          // Moving horizontally — blocked ahead.
          // Check whether marble can fall from its current position.
          var belowR = r + 1;
          if (belowR >= ROWS) {
            // At bottom row — can't fall, truly stuck
            return { result: 'fail', path: path };
          }
          var belowCell = grid[belowR][c];
          if (belowCell === CELL.WALL || belowCell === CELL.PLATFORM ||
              belowCell === CELL.RAMP_LEFT || belowCell === CELL.RAMP_RIGHT) {
            // Solid/ramp below current position — marble is on a supported
            // surface, can't go forward and can't fall. Stuck.
            return { result: 'fail', path: path };
          }
          // Empty below — marble can fall
          dc = 0;
          dr = 1;
          continue;
        } else {
          // Falling straight into a solid — stuck
          return { result: 'fail', path: path };
        }
      }

      // Ramp right ◢ — only deflects a FALLING marble to move right
      if (nextCell === CELL.RAMP_RIGHT) {
        path.push({ r: nextR, c: nextC, dr: dr, dc: dc });
        r = nextR; c = nextC;
        if (dr === 1 && dc === 0) {
          dr = 0; dc = 1; // falling → slide right
        }
        // horizontal marble passes over ramp unchanged
        continue;
      }

      // Ramp left ◣ — only deflects a FALLING marble to move left
      if (nextCell === CELL.RAMP_LEFT) {
        path.push({ r: nextR, c: nextC, dr: dr, dc: dc });
        r = nextR; c = nextC;
        if (dr === 1 && dc === 0) {
          dr = 0; dc = -1; // falling → slide left
        }
        // horizontal marble passes over ramp unchanged
        continue;
      }

      // Empty / slot / marble_start — marble passes through
      path.push({ r: nextR, c: nextC, dr: dr, dc: dc });
      r = nextR;
      c = nextC;

      // Gravity check: horizontal marble drops into gaps (empty below)
      if (dc !== 0) {
        var belowR = r + 1;
        if (belowR >= ROWS) {
          return { result: 'fail', path: path };
        }
        var belowCell = grid[belowR][c];
        if (belowCell === 'empty' || belowCell === 'slot' ||
            belowCell === 'marble_start' || belowCell === 'target') {
          dr = 1; dc = 0; // switch to falling
        }
        // wall / platform / ramp below → continue sliding
      }
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
