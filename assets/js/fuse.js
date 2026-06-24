(function () {
  'use strict';

  var DIRECTIONS_TEXT = "Fuse gives you a shape, a starting point, and a spark waiting to be put out. Move up, down, left, or right, filling the shape with water as you go — visit every cell exactly once. The spark can only be reached as your very last move. Step on it too soon, and it ignites. Corner yourself with nowhere left to go, and the same thing happens. Trace carefully. Land the final step exactly on the spark.";

  var LS_KEY       = 'fuse_highestLevel';
  var SHARE_URL    = 'https://www.thebunnygame.com/fuse';
  var TOTAL_LEVELS = 25;
  var CELL_GAP     = 4;

  var levels     = [];
  var currentLvl = 1;
  var highestLvl = 1;

  // Current level state
  var shape      = [];   // [{r,c}]
  var cellSet    = {};   // key(r,c) → true
  var startCell  = null;
  var headR      = 0;
  var headC      = 0;
  var visited    = {};   // key(r,c) → true
  var visitCount = 0;
  var sparkR     = 0;
  var sparkC     = 0;
  var sparkKey   = '';
  var gameOver   = false;
  var failReason = '';   // 'stuck' or 'too-soon'

  // DOM
  var startEl, gameEl, failEl, completeEl, winEl;
  var startBtnsEl, hudLevelEl, hudFurthestEl;
  var boardWrapEl, boardEl, failLabelEl, failCountEl, completeLabelEl;

  function key(r, c) { return r + ',' + c; }

  document.addEventListener('DOMContentLoaded', function () {
    startEl        = document.getElementById('fz-start');
    gameEl         = document.getElementById('fz-game');
    failEl         = document.getElementById('fz-fail');
    completeEl     = document.getElementById('fz-complete');
    winEl          = document.getElementById('fz-win');
    startBtnsEl    = document.getElementById('fz-start-btns');
    hudLevelEl     = document.getElementById('fz-level-label');
    hudFurthestEl  = document.getElementById('fz-furthest-label');
    boardWrapEl    = document.getElementById('fz-board-wrap');
    boardEl        = document.getElementById('fz-board');
    failLabelEl    = document.getElementById('fz-fail-label');
    failCountEl    = document.getElementById('fz-fail-count');
    completeLabelEl = document.getElementById('fz-complete-label');

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });

    document.getElementById('fz-up').addEventListener('click',    function () { move(-1,  0); });
    document.getElementById('fz-down').addEventListener('click',  function () { move( 1,  0); });
    document.getElementById('fz-left').addEventListener('click',  function () { move( 0, -1); });
    document.getElementById('fz-right').addEventListener('click', function () { move( 0,  1); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp')    { e.preventDefault(); move(-1,  0); }
      if (e.key === 'ArrowDown')  { e.preventDefault(); move( 1,  0); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); move( 0, -1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); move( 0,  1); }
    });

    document.getElementById('fz-retry').addEventListener('click', retryLevel);
    document.getElementById('fz-next').addEventListener('click',  nextLevel);
    document.getElementById('fz-play-again').addEventListener('click', function () {
      currentLvl = 1;
      showStart();
    });
    document.getElementById('fz-share').addEventListener('click', function () {
      shareText('Fuse — extinguished all 25 fuses without a single misstep. Or maybe a few. ' + SHARE_URL, 'Fuse');
    });

    highestLvl = parseInt(localStorage.getItem(LS_KEY) || '1', 10);

    fetch('/assets/data/fuse-levels.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        levels = data;
        showStart();
      })
      .catch(function () {
        levels = [];
        startBtnsEl.innerHTML = '';
        var errP = document.createElement('p');
        errP.className = 'fz-sub';
        errP.style.color = '#f87171';
        errP.textContent = 'Levels failed to load. Try reloading the page.';
        startBtnsEl.appendChild(errP);
        startBtnsEl.appendChild(btn('fz-btn-primary', 'Reload', function () { location.reload(); }));
        show(startEl);
      });
  });

  // ── Screens ──────────────────────────────────────────────────────────────────

  function showStart() {
    hide(gameEl); hide(winEl);
    startBtnsEl.innerHTML = '';

    if (highestLvl >= TOTAL_LEVELS) {
      startBtnsEl.appendChild(btn('fz-btn-primary', 'Play Again', function () {
        currentLvl = 1;
        startGame();
      }));
    } else if (highestLvl > 1) {
      startBtnsEl.appendChild(btn('fz-btn-primary', 'Continue from Level ' + (highestLvl + 1), function () {
        currentLvl = highestLvl + 1;
        startGame();
      }));
      startBtnsEl.appendChild(btn('fz-btn-ghost', 'Start from Level 1', function () {
        currentLvl = 1;
        startGame();
      }));
    } else {
      startBtnsEl.appendChild(btn('fz-btn-primary', 'Start', function () {
        currentLvl = 1;
        startGame();
      }));
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
    hide(failEl); hide(completeEl);

    var data = levels[n - 1];
    if (!data) { hide(gameEl); show(startEl); return; }

    shape   = data.cells.map(function (c) { return { r: c[0], c: c[1] }; });
    cellSet = {};
    shape.forEach(function (cell) { cellSet[key(cell.r, cell.c)] = true; });

    startCell  = { r: data.start[0], c: data.start[1] };
    headR      = startCell.r;
    headC      = startCell.c;
    visited    = {};
    visited[key(headR, headC)] = true;
    visitCount = 1;

    sparkR   = data.spark[0];
    sparkC   = data.spark[1];
    sparkKey = key(sparkR, sparkC);

    gameOver   = false;
    failReason = '';

    hudLevelEl.textContent    = 'Level ' + n;
    hudFurthestEl.textContent = 'Furthest: ' + highestLvl;

    renderBoard();
  }

  function retryLevel() {
    loadLevel(currentLvl);
  }

  function nextLevel() {
    if (currentLvl >= TOTAL_LEVELS) {
      showWin();
    } else {
      currentLvl++;
      hide(completeEl);
      loadLevel(currentLvl);
    }
  }

  // ── Movement ─────────────────────────────────────────────────────────────────

  function move(dr, dc) {
    if (gameOver) return;
    if (!failEl.classList.contains('fz-hide') ||
        !completeEl.classList.contains('fz-hide')) return;

    var nr = headR + dr;
    var nc = headC + dc;
    var k  = key(nr, nc);

    if (!cellSet[k] || visited[k]) return;  // illegal — silent no-op

    headR = nr; headC = nc;
    visited[k] = true;
    visitCount++;

    renderBoard();

    if (k === sparkKey) {
      if (visitCount === shape.length) {
        // Win — landed on spark as last cell
        gameOver = true;
        onWin();
      } else {
        // Too soon
        gameOver = true;
        failReason = 'too-soon';
        onExplosion();
      }
      return;
    }

    if (isStuck()) {
      gameOver = true;
      failReason = 'stuck';
      onExplosion();
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

  function onExplosion() {
    // Flash the board
    boardWrapEl.classList.add('fz-exploding');

    // Set fail overlay text immediately (hidden behind flash)
    failLabelEl.textContent = (failReason === 'too-soon') ? 'Too Soon!' : 'Stuck!';
    failCountEl.textContent = visitCount + ' of ' + shape.length + ' cells covered';

    setTimeout(function () {
      boardWrapEl.classList.remove('fz-exploding');
      show(failEl);
    }, 450);
  }

  function onWin() {
    // Extinguish the spark cell
    var sparkDiv = boardEl.querySelector('[data-fz-spark]');
    if (sparkDiv) {
      sparkDiv.classList.remove('fz-cell-spark');
      sparkDiv.classList.add('fz-cell-extinguish');
    }

    // Update progress
    if (currentLvl > highestLvl) {
      highestLvl = currentLvl;
      try { localStorage.setItem(LS_KEY, String(highestLvl)); } catch (e) {}
    }
    if (currentLvl >= TOTAL_LEVELS && highestLvl < TOTAL_LEVELS) {
      highestLvl = TOTAL_LEVELS;
      try { localStorage.setItem(LS_KEY, String(TOTAL_LEVELS)); } catch (e) {}
    }

    completeLabelEl.textContent = 'Level ' + currentLvl + ' Complete';

    setTimeout(function () {
      if (currentLvl >= TOTAL_LEVELS) {
        showWin();
      } else {
        show(completeEl);
      }
    }, 650);
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

    var isHead  = key(headR, headC);

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var k   = key(r, c);
        var div = document.createElement('div');
        div.style.width  = cellSize + 'px';
        div.style.height = cellSize + 'px';
        div.className = 'fz-cell';

        if (!cellSet[k]) {
          div.classList.add('fz-cell-void');
        } else if (k === isHead) {
          div.classList.add('fz-cell-head');
        } else if (visited[k]) {
          // Trail (spark visited only on win — treat as trail)
          div.classList.add('fz-cell-trail');
        } else if (k === sparkKey) {
          // Unvisited spark — show flame
          div.classList.add('fz-cell-spark');
          div.setAttribute('data-fz-spark', 'true');
        } else if (r === startCell.r && c === startCell.c && visitCount === 1) {
          div.classList.add('fz-cell-start');
        } else {
          div.classList.add('fz-cell-empty');
        }

        boardEl.appendChild(div);
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function show(el) { if (el) el.classList.remove('fz-hide'); }
  function hide(el) { if (el) el.classList.add('fz-hide'); }

  function btn(cls, text, onClick) {
    var el = document.createElement('button');
    el.className   = cls;
    el.textContent = text;
    el.addEventListener('click', onClick);
    return el;
  }

})();
