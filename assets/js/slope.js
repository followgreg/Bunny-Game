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
  // Cell-by-cell physics. The marble completely re-evaluates its situation on
  // every step — no assumptions carry between cells beyond position + direction.
  // Exactly one adjacent cell is inspected per decision, so diagonal movement is
  // structurally impossible.
  //
  // State machine: 'falling' | 'moving_left' | 'moving_right'
  //
  // FALLING — look only at the cell directly below:
  //   target                    → win
  //   empty/slot                → move down, keep falling
  //   ramp_right                → ENTER the ramp cell, THEN move one cell right
  //                               (two distinct path steps), switch to horizontal
  //   ramp_left                 → same, one cell left
  //   wall/platform/other       → fail
  //   below grid                → fail
  //
  // HORIZONTAL — check support BELOW CURRENT position first, then the cell ahead:
  //   no solid below            → switch to falling from CURRENT position
  //                               (do NOT move horizontally this step)
  //   solid below + target ahead → win
  //   solid below + empty/slot   → move forward, stay horizontal
  //   solid below + ramp ahead   → fail
  //   solid below + wall ahead   → fail
  //   solid below + grid edge    → fail
  function simulateMarble(grid, startCol) {
    var ROWS_N = grid.length;
    var COLS_N = grid[0].length;

    var r = 0;
    var c = startCol;
    var state = 'falling';

    var path = [{ r: r, c: c, state: state }];
    var visited = new Set();
    var MAX_STEPS = 300;
    var SOLID = { wall: 1, platform: 1, ramp_left: 1, ramp_right: 1 };

    for (var step = 0; step < MAX_STEPS; step++) {
      // Cycle detection — same position + direction means an infinite loop
      var key = r + ',' + c + ',' + state;
      if (visited.has(key)) return { result: 'fail', path: path };
      visited.add(key);

      if (state === 'falling') {
        var nextR = r + 1;

        // Fell off the bottom of the grid
        if (nextR >= ROWS_N) return { result: 'fail', path: path };

        var below = grid[nextR][c];

        if (below === CELL.TARGET) {
          path.push({ r: nextR, c: c, state: state });
          return { result: 'win', path: path };
        }

        if (below === CELL.EMPTY || below === CELL.SLOT) {
          r = nextR;
          path.push({ r: r, c: c, state: state });
          continue;
        }

        if (below === CELL.RAMP_RIGHT || below === CELL.RAMP_LEFT) {
          var rampDir  = (below === CELL.RAMP_RIGHT) ? 1 : -1;
          var destC    = c + rampDir;
          var destSt   = (rampDir === 1) ? 'moving_right' : 'moving_left';

          if (destC < 0 || destC >= COLS_N) return { result: 'fail', path: path };

          // Step 1: enter the ramp cell itself
          r = nextR;
          path.push({ r: r, c: c, state: state });

          // Step 2: evaluate the destination before moving into it
          var dest = grid[r][destC];

          if (dest === CELL.TARGET) {
            path.push({ r: r, c: destC, state: destSt });
            return { result: 'win', path: path };
          }

          // Anything solid blocks the marble — it cannot move into that cell
          if (dest !== CELL.EMPTY && dest !== CELL.SLOT) {
            return { result: 'fail', path: path };
          }

          c = destC;
          state = destSt;
          path.push({ r: r, c: c, state: state });
          continue;
        }

        // wall / platform / marble_start / anything else → fail
        return { result: 'fail', path: path };
      }

      // ── Horizontal ────────────────────────────────────────────────────────
      var dc = (state === 'moving_right') ? 1 : -1;
      var nextC = c + dc;

      // Check support below CURRENT position FIRST. With nothing solid below,
      // the marble stops moving sideways and falls — it does not advance first.
      var belowR = r + 1;
      if (belowR >= ROWS_N) return { result: 'fail', path: path };

      if (!SOLID[grid[belowR][c]]) {
        state = 'falling';
        continue; // re-evaluate from the same cell, now falling
      }

      // Solid below — check what is ahead
      if (nextC < 0 || nextC >= COLS_N) return { result: 'fail', path: path };

      var ahead = grid[r][nextC];

      if (ahead === CELL.TARGET) {
        path.push({ r: r, c: nextC, state: state });
        return { result: 'win', path: path };
      }

      if (ahead === CELL.EMPTY || ahead === CELL.SLOT) {
        c = nextC;
        path.push({ r: r, c: c, state: state });
        continue;
      }

      // ramp / wall / platform / anything else ahead → fail
      return { result: 'fail', path: path };
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
