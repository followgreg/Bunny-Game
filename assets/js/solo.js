(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────────

  var N            = 5;
  var LS_KEY       = 'solo_highestLevel';
  var TOTAL_LEVELS = 25;

  var DIRECTIONS_TEXT =
    'Solo gives you a 5×5 grid split into five shapes. Place five stars — ' +
    'one in every row, one in every column, one in every shape — with no two stars ' +
    'touching, even diagonally. Click a cell to place a star, click it again to remove it. ' +
    'When you think you\'ve got it, submit. Get it right and the next board appears. ' +
    'Get it wrong, and you\'ll just need to take another look — nothing\'s given away.';

  var THICK = '2.5px solid rgba(255,255,255,0.68)';
  var THIN  = '1px solid rgba(255,255,255,0.07)';

  // ── Game state ────────────────────────────────────────────────────────────────

  var highestLvl = 0;

  var game = {
    levels: [],
    idx:    0,
    stars:  null,   // N×N boolean grid of placed stars
    solved: false,
  };

  // ── Screen management ─────────────────────────────────────────────────────────

  function show(id) {
    ['sl-start', 'sl-game', 'sl-win'].forEach(function (s) {
      document.getElementById(s).classList.toggle('sl-hide', s !== id);
    });
    hideOverlays();
  }

  function hideOverlays() {
    document.getElementById('sl-correct').classList.add('sl-hide');
    document.getElementById('sl-fail').classList.add('sl-hide');
  }

  function buildStartBtns() {
    var btns = document.getElementById('sl-start-btns');
    btns.innerHTML = '';

    function mkBtn(cls, label, fn) {
      var b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      btns.appendChild(b);
    }

    if (highestLvl >= TOTAL_LEVELS) {
      mkBtn('sl-btn-primary', 'Play Again', function () { startLevel(1); });
    } else if (highestLvl > 0) {
      mkBtn('sl-btn-primary', 'Continue — Level ' + (highestLvl + 1),
        function () { startLevel(highestLvl + 1); });
      mkBtn('sl-btn-ghost', 'Start from Level 1', function () { startLevel(1); });
    } else {
      mkBtn('sl-btn-primary', 'Start', function () { startLevel(1); });
    }
  }

  // ── Level management ──────────────────────────────────────────────────────────

  function startLevel(idx) {
    game.idx    = idx;
    game.stars  = Array.from({ length: N }, function () { return new Array(N).fill(false); });
    game.solved = false;

    document.getElementById('sl-level-label').textContent  = 'Level ' + idx;
    document.getElementById('sl-furthest-label').textContent =
      highestLvl > 0 ? 'Best: ' + highestLvl : '';
    document.getElementById('sl-grid').classList.remove('sl-correct-flash');

    show('sl-game');
    renderGrid(game.levels[idx - 1]);
  }

  // ── Board rendering ───────────────────────────────────────────────────────────

  function renderGrid(level) {
    var grid = document.getElementById('sl-grid');
    grid.innerHTML = '';

    var sg = level.shapeGrid;

    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        var shape = sg[r][c];
        var cell  = document.createElement('div');
        cell.className   = 'sl-cell sl-shape-' + shape;
        cell.dataset.row = r;
        cell.dataset.col = c;

        cell.style.borderTop    = (r === 0     || sg[r - 1][c] !== shape) ? THICK : THIN;
        cell.style.borderRight  = (c === N - 1 || sg[r][c + 1] !== shape) ? THICK : THIN;
        cell.style.borderBottom = (r === N - 1 || sg[r + 1][c] !== shape) ? THICK : THIN;
        cell.style.borderLeft   = (c === 0     || sg[r][c - 1] !== shape) ? THICK : THIN;

        if (game.stars[r][c]) {
          var star = document.createElement('span');
          star.className   = 'sl-star';
          star.textContent = '★';
          cell.appendChild(star);
        }

        grid.appendChild(cell);
      }
    }
  }

  // ── Validation ────────────────────────────────────────────────────────────────
  // Checks all rules independently — does NOT compare against the stored solution.

  function checkPlacement(stars, shapeGrid) {
    // Collect placed star positions
    var placed = [];
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        if (stars[r][c]) placed.push([r, c]);
      }
    }

    // Exactly N stars required
    if (placed.length !== N) return false;

    // One per row, one per column, one per shape
    var usedRows   = {};
    var usedCols   = {};
    var usedShapes = {};
    for (var i = 0; i < placed.length; i++) {
      var pr = placed[i][0], pc = placed[i][1];
      var ps = shapeGrid[pr][pc];
      if (usedRows[pr] || usedCols[pc] || usedShapes[ps]) return false;
      usedRows[pr]  = true;
      usedCols[pc]  = true;
      usedShapes[ps] = true;
    }

    // No two stars touch (orthogonally or diagonally)
    for (var i = 0; i < placed.length; i++) {
      for (var j = i + 1; j < placed.length; j++) {
        if (Math.abs(placed[i][0] - placed[j][0]) <= 1 &&
            Math.abs(placed[i][1] - placed[j][1]) <= 1) return false;
      }
    }

    return true;
  }

  // ── Submit flow ───────────────────────────────────────────────────────────────

  function onSubmit() {
    if (game.solved) return;
    var level = game.levels[game.idx - 1];
    if (checkPlacement(game.stars, level.shapeGrid)) {
      onCorrect();
    } else {
      onFail();
    }
  }

  function onCorrect() {
    game.solved = true;
    if (game.idx > highestLvl) {
      highestLvl = game.idx;
      try { localStorage.setItem(LS_KEY, highestLvl); } catch (e) {}
    }
    // Brief flash, then show the Correct overlay
    document.getElementById('sl-grid').classList.add('sl-correct-flash');
    setTimeout(function () {
      document.getElementById('sl-correct').classList.remove('sl-hide');
    }, 600);
  }

  function onFail() {
    document.getElementById('sl-fail').classList.remove('sl-hide');
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    highestLvl = parseInt(localStorage.getItem(LS_KEY) || '0', 10);

    document.getElementById('help-btn').addEventListener('click', function () {
      openDirections(DIRECTIONS_TEXT);
    });

    // Cell click — toggle star (blocked while solved)
    document.getElementById('sl-grid').addEventListener('click', function (e) {
      if (game.solved) return;
      var cell = e.target.closest && e.target.closest('.sl-cell');
      if (!cell) return;
      var r = parseInt(cell.dataset.row, 10);
      var c = parseInt(cell.dataset.col, 10);
      game.stars[r][c] = !game.stars[r][c];
      renderGrid(game.levels[game.idx - 1]);
    });

    document.getElementById('sl-submit').addEventListener('click', onSubmit);

    // Correct overlay: advance to next level (or win screen after level 25)
    document.getElementById('sl-next-level').addEventListener('click', function () {
      if (game.idx >= TOTAL_LEVELS) {
        show('sl-win');
      } else {
        startLevel(game.idx + 1);
      }
    });

    // Fail overlay: dismiss, leave board state unchanged
    document.getElementById('sl-try-again').addEventListener('click', function () {
      hideOverlays();
    });

    // Win screen share
    document.getElementById('sl-share').addEventListener('click', function () {
      shareText(
        'Solo — solved all 25 boards. https://www.thebunnygame.com/solo',
        'Solo'
      );
    });

    // Win screen play again
    document.getElementById('sl-play-again').addEventListener('click', function () {
      buildStartBtns();
      show('sl-start');
    });

    fetch('/assets/data/solo-levels.json')
      .then(function (r) { return r.json(); })
      .then(function (levels) {
        game.levels = levels;
        buildStartBtns();
        show('sl-start');
      });
  });

})();
