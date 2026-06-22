(function () {
  'use strict';

  var DIRECTIONS_TEXT = 'SNEK gives you a shape and a starting point. Move up, down, left, or right to trace a path through every cell — visit each one exactly once. You can’t double back over where you’ve already been, and walking into a wall just does nothing, no harm done. The only way to lose is to corner yourself with nowhere left to go. Twenty-five levels, each one trickier than the last.';

  var LS_KEY     = 'snek_highestLevel';
  var SHARE_URL  = 'https://www.thebunnygame.com/snek';
  var CELL_GAP   = 4;

  var levels     = [];
  var currentLvl = 1;  // 1-based
  var highestLvl = 1;

  // Current level state
  var shape      = [];  // [{r,c}]
  var cellSet    = {};  // key(r,c) → true
  var startCell  = null;
  var headR      = 0;
  var headC      = 0;
  var visited    = {};  // key(r,c) → true
  var visitCount = 0;

  // DOM
  var startEl, gameEl, stuckEl, completeEl, winEl;
  var startBtnsEl, hudLevelEl, hudFurthestEl, revealBtnEl;
  var boardEl, stuckCountEl, completeLabelEl;
  var revealing = false;

  function key(r, c) { return r + ',' + c; }

  document.addEventListener('DOMContentLoaded', function () {
    startEl       = document.getElementById('sn-start');
    gameEl        = document.getElementById('sn-game');
    stuckEl       = document.getElementById('sn-stuck');
    completeEl    = document.getElementById('sn-complete');
    winEl         = document.getElementById('sn-win');
    startBtnsEl   = document.getElementById('sn-start-btns');
    hudLevelEl    = document.getElementById('sn-level-label');
    hudFurthestEl = document.getElementById('sn-furthest-label');
    revealBtnEl   = document.getElementById('sn-reveal');
    boardEl       = document.getElementById('sn-board');
    stuckCountEl  = document.getElementById('sn-stuck-count');
    completeLabelEl = document.getElementById('sn-complete-label');

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });

    document.getElementById('sn-up').addEventListener('click',    function () { move(-1,  0); });
    document.getElementById('sn-down').addEventListener('click',  function () { move( 1,  0); });
    document.getElementById('sn-left').addEventListener('click',  function () { move( 0, -1); });
    document.getElementById('sn-right').addEventListener('click', function () { move( 0,  1); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp')    { e.preventDefault(); move(-1,  0); }
      if (e.key === 'ArrowDown')  { e.preventDefault(); move( 1,  0); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); move( 0, -1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); move( 0,  1); }
    });

    revealBtnEl.addEventListener('click', revealAnswer);
    document.getElementById('sn-retry').addEventListener('click', retryLevel);
    document.getElementById('sn-next').addEventListener('click',  nextLevel);
    document.getElementById('sn-play-again').addEventListener('click', function () { currentLvl = 1; showStart(); });
    document.getElementById('sn-share').addEventListener('click', function () {
      shareText('SNEK — traced all 25 levels without a single restart… or maybe a few. Either way, done. ' + SHARE_URL, 'SNEK');
    });

    highestLvl = parseInt(localStorage.getItem(LS_KEY) || '1', 10);

    fetch('/assets/data/snek-levels.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        levels = data;
        showStart();
      })
      .catch(function () {
        // Fallback: just start level 1 with empty data
        levels = [];
        showStart();
      });
  });

  // ── Screens ──────────────────────────────────────────────────────────────────

  function showStart() {
    hide(gameEl); hide(winEl);
    startBtnsEl.innerHTML = '';

    if (highestLvl > 1 && highestLvl < 25) {
      var cont = btn('sn-btn-primary', 'Continue from Level ' + (highestLvl + 1), function () {
        currentLvl = highestLvl + 1;
        startGame();
      });
      startBtnsEl.appendChild(cont);

      var fresh = btn('sn-btn-ghost', 'Start from Level 1', function () {
        currentLvl = 1;
        startGame();
      });
      startBtnsEl.appendChild(fresh);
    } else if (highestLvl >= 25) {
      var again = btn('sn-btn-primary', 'Play Again', function () {
        currentLvl = 1;
        startGame();
      });
      startBtnsEl.appendChild(again);
    } else {
      var start = btn('sn-btn-primary', 'Start', function () {
        currentLvl = 1;
        startGame();
      });
      startBtnsEl.appendChild(start);
    }

    show(startEl);
  }

  function startGame() {
    hide(startEl); hide(winEl);
    loadLevel(currentLvl);
    show(gameEl);
  }

  function showWin() {
    hide(gameEl);
    show(winEl);
  }

  // ── Level management ─────────────────────────────────────────────────────────

  function loadLevel(n) {
    hide(stuckEl); hide(completeEl);

    var data   = levels[n - 1];
    shape      = data.cells.map(function (c) { return { r: c[0], c: c[1] }; });
    cellSet    = {};
    shape.forEach(function (cell) { cellSet[key(cell.r, cell.c)] = true; });

    startCell  = { r: data.start[0], c: data.start[1] };
    headR      = startCell.r;
    headC      = startCell.c;
    visited    = {};
    visited[key(headR, headC)] = true;
    visitCount = 1;

    revealing = false;
    revealBtnEl.disabled = false;
    hudLevelEl.textContent    = 'Level ' + n;
    hudFurthestEl.textContent = 'Furthest: ' + highestLvl;

    renderBoard();
  }

  function retryLevel() {
    loadLevel(currentLvl);
  }

  function nextLevel() {
    if (currentLvl >= 25) {
      showWin();
    } else {
      currentLvl++;
      hide(completeEl);
      loadLevel(currentLvl);
    }
  }

  // ── Reveal answer ─────────────────────────────────────────────────────────────

  function revealAnswer() {
    if (revealing) return;
    var solution = levels[currentLvl - 1].solution;
    if (!solution) return;

    // Reset to fresh state first, then auto-play
    hide(stuckEl); hide(completeEl);
    headR      = startCell.r;
    headC      = startCell.c;
    visited    = {};
    visited[key(headR, headC)] = true;
    visitCount = 1;
    renderBoard();

    revealing = true;
    revealBtnEl.disabled = true;

    var step = 1;

    function playStep() {
      if (step >= solution.length) {
        revealing = false;
        onLevelComplete();
        return;
      }
      headR = solution[step][0];
      headC = solution[step][1];
      visited[key(headR, headC)] = true;
      visitCount++;
      renderBoard();
      step++;
      setTimeout(playStep, 180);
    }

    setTimeout(playStep, 180);
  }

  // ── Movement ─────────────────────────────────────────────────────────────────

  function move(dr, dc) {
    // Ignore input while overlays are showing or reveal is running
    if (revealing) return;
    if (!stuckEl.classList.contains('sn-hide') ||
        !completeEl.classList.contains('sn-hide')) return;

    var nr = headR + dr;
    var nc = headC + dc;
    var k  = key(nr, nc);

    if (!cellSet[k] || visited[k]) return;  // illegal — silent no-op

    headR = nr; headC = nc;
    visited[k] = true;
    visitCount++;

    renderBoard();

    if (visitCount === shape.length) {
      onLevelComplete();
      return;
    }

    if (isStuck()) {
      onStuck();
    }
  }

  function isStuck() {
    var DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
    for (var i = 0; i < DIRS.length; i++) {
      var nr = headR + DIRS[i][0];
      var nc = headC + DIRS[i][1];
      var k  = key(nr, nc);
      if (cellSet[k] && !visited[k]) return false;
    }
    return true;
  }

  // ── Level outcomes ────────────────────────────────────────────────────────────

  function onLevelComplete() {
    // Flash all trail cells green
    var cells = boardEl.querySelectorAll('.sn-cell-trail, .sn-cell-head');
    cells.forEach(function (el) {
      el.classList.add('sn-cell-flash');
    });

    if (currentLvl > highestLvl) {
      highestLvl = currentLvl;
      try { localStorage.setItem(LS_KEY, String(highestLvl)); } catch (e) {}
    }

    completeLabelEl.textContent = 'Level ' + currentLvl + ' Complete';

    setTimeout(function () {
      if (currentLvl >= 25) {
        if (currentLvl > highestLvl) {
          highestLvl = 25;
          try { localStorage.setItem(LS_KEY, '25'); } catch (e) {}
        }
        showWin();
      } else {
        show(completeEl);
      }
    }, 500);
  }

  function onStuck() {
    stuckCountEl.textContent = visitCount + ' of ' + shape.length + ' cells covered';
    show(stuckEl);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────

  function renderBoard() {
    var maxR = 0, maxC = 0;
    shape.forEach(function (cell) {
      if (cell.r > maxR) maxR = cell.r;
      if (cell.c > maxC) maxC = cell.c;
    });
    var rows = maxR + 1;
    var cols = maxC + 1;

    var avail    = Math.min(window.innerWidth, 480) - 24;
    var cellSize = Math.floor((avail - CELL_GAP * (cols - 1)) / cols);
    cellSize     = Math.min(cellSize, Math.floor((window.innerHeight * 0.42 - CELL_GAP * (rows - 1)) / rows));
    cellSize     = Math.max(cellSize, 22);

    boardEl.style.gridTemplateColumns = 'repeat(' + cols + ', ' + cellSize + 'px)';
    boardEl.style.gridTemplateRows    = 'repeat(' + rows + ', ' + cellSize + 'px)';
    boardEl.style.gap = CELL_GAP + 'px';

    boardEl.innerHTML = '';

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var k   = key(r, c);
        var div = document.createElement('div');
        div.style.width  = cellSize + 'px';
        div.style.height = cellSize + 'px';
        div.className = 'sn-cell';

        if (!cellSet[k]) {
          div.classList.add('sn-cell-void');
        } else if (r === headR && c === headC) {
          div.classList.add('sn-cell-head');
        } else if (visited[k]) {
          div.classList.add('sn-cell-trail');
        } else if (r === startCell.r && c === startCell.c && visitCount === 1) {
          div.classList.add('sn-cell-start');
        } else {
          div.classList.add('sn-cell-empty');
        }

        boardEl.appendChild(div);
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function show(el) { if (el) el.classList.remove('sn-hide'); }
  function hide(el) { if (el) el.classList.add('sn-hide'); }

  function btn(cls, text, onClick) {
    var el = document.createElement('button');
    el.className   = cls;
    el.textContent = text;
    el.addEventListener('click', onClick);
    return el;
  }

})();
