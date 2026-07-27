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
  // State machine: 'falling' | 'moving_left' | 'moving_right'
  //
  // Falling: check cell directly below.
  //   empty/slot   → continue falling
  //   ramp_right   → jump one cell right, enter moving_right
  //   ramp_left    → jump one cell left,  enter moving_left
  //   target       → win
  //   anything else / grid edge → fail
  //
  // Horizontal: each step checks cell AHEAD and cell BELOW CURRENT position.
  //   ahead = target              → win
  //   ahead = ramp/wall/platform  → fail immediately
  //   ahead = grid edge           → fail immediately
  //   ahead = empty/slot:
  //     below current is solid    → continue horizontal (move forward)
  //     below current is not solid → switch to falling from CURRENT position
  function simulateMarble(grid, startCol) {
    var r = 0;
    var c = startCol;
    var state = 'falling';
    var path = [{ r: r, c: c, state: state }];
    var visited = new Set();
    var MAX_STEPS = 500;
    var SOLID = { wall: 1, platform: 1, ramp_left: 1, ramp_right: 1 };

    for (var step = 0; step < MAX_STEPS; step++) {
      var key = r + ',' + c + ',' + state;
      if (visited.has(key)) return { result: 'fail', path: path };
      visited.add(key);

      if (state === 'falling') {
        var fallingBelowR = r + 1;
        var fallingBelowC = c;

        if (fallingBelowR >= ROWS) return { result: 'fail', path: path };

        var below = grid[fallingBelowR][fallingBelowC];

        if (below === 'target') {
          path.push({ r: fallingBelowR, c: fallingBelowC, state: state });
          return { result: 'win', path: path };
        }

        if (below === 'empty' || below === 'slot') {
          r = fallingBelowR;
          path.push({ r: r, c: c, state: state });
          continue;
        }

        if (below === 'ramp_left') {
          var rampLeftC = c - 1;
          if (rampLeftC < 0) return { result: 'fail', path: path };
          r = fallingBelowR; c = rampLeftC; state = 'moving_left';
          path.push({ r: r, c: c, state: state });
          continue;
        }

        if (below === 'ramp_right') {
          var rampRightC = c + 1;
          if (rampRightC >= COLS) return { result: 'fail', path: path };
          r = fallingBelowR; c = rampRightC; state = 'moving_right';
          path.push({ r: r, c: c, state: state });
          continue;
        }

        // wall / platform / marble_start / anything else → fail
        return { result: 'fail', path: path };
      }

      // ── Horizontal ────────────────────────────────────────────────────────
      var dc = (state === 'moving_right') ? 1 : -1;
      var aheadC = c + dc;

      if (aheadC < 0 || aheadC >= COLS) return { result: 'fail', path: path };

      var ahead = grid[r][aheadC];

      if (ahead === CELL.TARGET) {
        path.push({ r: r, c: aheadC, state: state });
        return { result: 'win', path: path };
      }
      if (ahead === CELL.RAMP_LEFT || ahead === CELL.RAMP_RIGHT ||
          ahead === CELL.WALL    || ahead === CELL.PLATFORM) {
        return { result: 'fail', path: path };
      }

      // ahead is empty/slot — check below CURRENT position
      var belowR = r + 1;
      if (belowR >= ROWS || !SOLID[grid[belowR][c]]) {
        // Nothing solid below — fall from current position (don't move forward)
        state = 'falling';
        continue;
      }
      // Solid below — continue horizontal
      c = aheadC;
      path.push({ r: r, c: c, state: state });
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
