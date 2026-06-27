(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  var ROWS = 16, COLS = 16, TOTAL_MINES = 40;
  var MAX_GEN_ATTEMPTS = 300;

  // 8 colors assigned to counts 1-8; order shuffled each game
  var BASE_COLORS = [
    '#ef4444',  // red
    '#60a5fa',  // blue
    '#fde047',  // yellow
    '#fb923c',  // orange
    '#4ade80',  // green
    '#c084fc',  // purple
    '#cd853f',  // brown
    '#f472b6',  // magenta
  ];

  var COLOR_NAMES = ['Red', 'Blue', 'Yellow', 'Orange', 'Green', 'Purple', 'Brown', 'Magenta'];

  var DIRECTIONS_TEXT =
    'Color Bomb plays like Minesweeper, but the numbers are gone. Each color stands for a ' +
    'count of nearby mines — you just don’t know which color means what yet. ' +
    'The mapping changes every game. Look for a color with only one possible neighbor left ' +
    'uncovered — that’s your way in. From there, it’s deduction, same as always. ' +
    'Clear the board without hitting a mine.';

  // ── State ──────────────────────────────────────────────────────────────────
  var cells       = [];
  var gameMapping = null;   // gameMapping[count 1-8] = CSS color string
  var gameState   = 'idle'; // 'idle' | 'playing' | 'won' | 'lost'
  var flagCount   = 0;
  var revealCount = 0;
  var timerID     = null;
  var elapsed     = 0;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  var boardEl, mineCountEl, timerEl, resetBtn;
  var endEl, endHeadlineEl, endSubEl, shareBtn, replayBtn;

  // ── Board helpers ──────────────────────────────────────────────────────────
  function idx(r, c) { return r * COLS + c; }
  function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

  function neighbors(r, c) {
    var ns = [];
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc)) ns.push(cells[idx(nr, nc)]);
      }
    }
    return ns;
  }

  // ── Board init ─────────────────────────────────────────────────────────────
  function initBoard() {
    cells = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        cells.push({
          r: r, c: c, mine: false, adj: 0,
          revealed: false, flagged: false, triggered: false, el: null
        });
      }
    }
  }

  // ── Color mapping (fresh shuffle each game) ────────────────────────────────
  function generateColorMapping() {
    var colors = BASE_COLORS.slice();
    for (var i = colors.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = colors[i]; colors[i] = colors[j]; colors[j] = tmp;
    }
    gameMapping = {};
    for (var c = 1; c <= 8; c++) {
      gameMapping[c] = colors[c - 1];
    }
  }

  // ── Solver — anchor-guarantee verification ─────────────────────────────────
  //
  // After placing mines, we simulate a safe-deduction playthrough:
  //   - BFS flood-fill from the first click (exactly as the real game does)
  //   - Repeat: flag all cells that must be mines; reveal all cells that must be safe
  //   - At each step, check for an ANCHOR: a revealed adj=1 cell with 0 adjacent flags
  //     and exactly 1 unrevealed unflagged neighbor (that 1 neighbor must be the mine,
  //     and the cell's color must therefore represent the count "1")
  //
  // If no anchor ever appears, the layout is rejected and regenerated.

  function bfsRevealSim(startR, startC, revealedSet) {
    var si = idx(startR, startC);
    if (cells[si].mine || revealedSet.has(si)) return;

    var queue = [si];
    var seen  = new Set(queue);

    while (queue.length > 0) {
      var i = queue.shift();
      revealedSet.add(i);
      var cell = cells[i];
      if (cell.adj === 0) {
        var ns = neighbors(cell.r, cell.c);
        for (var j = 0; j < ns.length; j++) {
          var n  = ns[j];
          var ni = idx(n.r, n.c);
          if (!n.mine && !seen.has(ni)) {
            seen.add(ni);
            queue.push(ni);
          }
        }
      }
    }
  }

  // Anchor: revealed adj=1 cell, 0 adjacent flags, exactly 1 unrevealed unflagged neighbor.
  // That neighbor is unambiguously the mine, and the cell's color unambiguously means "1".
  function hasAnchorCell(revealedSet, flaggedSet) {
    var revArr = Array.from(revealedSet);
    for (var ri = 0; ri < revArr.length; ri++) {
      var cell = cells[revArr[ri]];
      if (cell.adj !== 1) continue;

      var ns         = neighbors(cell.r, cell.c);
      var flaggedCnt = 0;
      var unrev      = 0;

      for (var j = 0; j < ns.length; j++) {
        var ni = idx(ns[j].r, ns[j].c);
        if (flaggedSet.has(ni))        { flaggedCnt++; }
        else if (!revealedSet.has(ni)) { unrev++; }
      }

      // Exactly: adj=1, no flags yet, 1 unrevealed unflagged → that cell is the mine
      if (flaggedCnt === 0 && unrev === 1) return true;
    }
    return false;
  }

  function verifyAnchorGuarantee(firstR, firstC) {
    var revealedSet = new Set();
    var flaggedSet  = new Set();

    bfsRevealSim(firstR, firstC, revealedSet);
    if (hasAnchorCell(revealedSet, flaggedSet)) return true;

    var changed = true;
    while (changed) {
      changed = false;
      var revArr = Array.from(revealedSet);

      for (var ri = 0; ri < revArr.length; ri++) {
        var cell = cells[revArr[ri]];
        var ns   = neighbors(cell.r, cell.c);

        var flaggedCnt  = 0;
        var unrevUnflag = [];

        for (var j = 0; j < ns.length; j++) {
          var ni = idx(ns[j].r, ns[j].c);
          if (flaggedSet.has(ni)) {
            flaggedCnt++;
          } else if (!revealedSet.has(ni)) {
            unrevUnflag.push(ns[j]);
          }
        }

        var remaining = cell.adj - flaggedCnt;

        // Deduction 1 — all unrevealed unflagged neighbors must be mines
        if (remaining > 0 && remaining === unrevUnflag.length) {
          for (var fi = 0; fi < unrevUnflag.length; fi++) {
            var fni = idx(unrevUnflag[fi].r, unrevUnflag[fi].c);
            if (!flaggedSet.has(fni)) {
              flaggedSet.add(fni);
              changed = true;
            }
          }
          if (hasAnchorCell(revealedSet, flaggedSet)) return true;
        }

        // Deduction 2 — no remaining mines: reveal all unrevealed unflagged neighbors
        if (remaining === 0 && unrevUnflag.length > 0) {
          for (var si = 0; si < unrevUnflag.length; si++) {
            var sni = idx(unrevUnflag[si].r, unrevUnflag[si].c);
            if (!revealedSet.has(sni)) {
              bfsRevealSim(unrevUnflag[si].r, unrevUnflag[si].c, revealedSet);
              changed = true;
            }
          }
          if (hasAnchorCell(revealedSet, flaggedSet)) return true;
        }
      }
    }

    return false;
  }

  // ── Mine placement with anchor guarantee ───────────────────────────────────
  function placeMines(safeR, safeC) {
    var excluded = new Set();
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        var nr = safeR + dr, nc = safeC + dc;
        if (inBounds(nr, nc)) excluded.add(idx(nr, nc));
      }
    }

    var pool = [];
    for (var i = 0; i < ROWS * COLS; i++) {
      if (!excluded.has(i)) pool.push(i);
    }

    for (var attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
      // Clear previous placement
      for (var ci = 0; ci < cells.length; ci++) {
        cells[ci].mine = false;
        cells[ci].adj  = 0;
      }

      // Shuffle pool → take first TOTAL_MINES as mine positions
      var poolCopy = pool.slice();
      for (var j = poolCopy.length - 1; j > 0; j--) {
        var k = Math.floor(Math.random() * (j + 1));
        var tmp = poolCopy[j]; poolCopy[j] = poolCopy[k]; poolCopy[k] = tmp;
      }
      for (var m = 0; m < TOTAL_MINES; m++) cells[poolCopy[m]].mine = true;

      // Compute adjacency counts
      for (var ai = 0; ai < cells.length; ai++) {
        if (cells[ai].mine) continue;
        var adjNs  = neighbors(cells[ai].r, cells[ai].c);
        var adjCnt = 0;
        for (var an = 0; an < adjNs.length; an++) {
          if (adjNs[an].mine) adjCnt++;
        }
        cells[ai].adj = adjCnt;
      }

      // Accept this layout if an anchor can be reached by safe deduction
      if (verifyAnchorGuarantee(safeR, safeC)) {
        if (attempt > 0) {
          console.debug('[Color Bomb] Anchor guarantee satisfied — attempts needed:', attempt + 1);
        }
        return;
      }
    }

    console.warn('[Color Bomb] Could not satisfy anchor guarantee in', MAX_GEN_ATTEMPTS, 'attempts — using current layout');
  }

  // ── Reveal (iterative BFS, game-state) ────────────────────────────────────
  function revealCell(startR, startC) {
    var start = cells[idx(startR, startC)];
    if (start.revealed || start.flagged) return;

    if (start.mine) {
      start.revealed  = true;
      start.triggered = true;
      revealCount++;
      renderCell(start);
      endGame(false);
      return;
    }

    var queue = [start];
    var seen  = new Set([idx(startR, startC)]);

    while (queue.length > 0) {
      var cell = queue.shift();
      if (cell.revealed || cell.flagged) continue;

      cell.revealed = true;
      revealCount++;
      renderCell(cell);

      if (cell.adj === 0) {
        var ns = neighbors(cell.r, cell.c);
        for (var i = 0; i < ns.length; i++) {
          var n  = ns[i];
          var ni = idx(n.r, n.c);
          if (!n.mine && !n.revealed && !n.flagged && !seen.has(ni)) {
            seen.add(ni);
            queue.push(n);
          }
        }
      }
    }

    checkWin();
  }

  // ── Chord reveal ───────────────────────────────────────────────────────────
  function chordReveal(r, c) {
    var cell = cells[idx(r, c)];
    if (!cell.revealed || cell.adj === 0) return;
    var ns      = neighbors(r, c);
    var flagged = 0;
    for (var i = 0; i < ns.length; i++) {
      if (ns[i].flagged) flagged++;
    }
    if (flagged !== cell.adj) return;
    for (var j = 0; j < ns.length; j++) {
      if (!ns[j].revealed && !ns[j].flagged) revealCell(ns[j].r, ns[j].c);
    }
  }

  // ── Flag ───────────────────────────────────────────────────────────────────
  function toggleFlag(r, c) {
    var cell = cells[idx(r, c)];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    flagCount += cell.flagged ? 1 : -1;
    renderCell(cell);
    updateHud();
  }

  // ── Win / Loss ─────────────────────────────────────────────────────────────
  function checkWin() {
    if (revealCount === ROWS * COLS - TOTAL_MINES) endGame(true);
  }

  function endGame(won) {
    gameState = won ? 'won' : 'lost';
    stopTimer();
    resetBtn.textContent = won ? '😎' : '😵';

    if (won) {
      for (var i = 0; i < cells.length; i++) {
        if (cells[i].mine && !cells[i].flagged) {
          cells[i].flagged = true;
          renderCell(cells[i]);
        }
      }
      flagCount = TOTAL_MINES;
      updateHud();
    } else {
      for (var j = 0; j < cells.length; j++) {
        var cell = cells[j];
        if (cell.mine && !cell.flagged) { cell.revealed = true; renderCell(cell); }
        if (!cell.mine && cell.flagged) { renderCell(cell); }
      }
    }

    var delay = won ? 350 : 600;
    setTimeout(function () {
      endHeadlineEl.textContent = won ? 'Board cleared!' : 'Boom.';
      endSubEl.textContent      = won ? 'You cracked the code.' : 'Here’s what the colors meant:';
      buildMappingReveal();
      replayBtn.textContent = won ? 'Play Again' : 'Try Again';
      if (won) { shareBtn.classList.remove('cbomb-hide'); }
      else     { shareBtn.classList.add('cbomb-hide'); }
      closeKeyPanel();
      endEl.classList.remove('cbomb-hide');
    }, delay);
  }

  // ── Timer ──────────────────────────────────────────────────────────────────
  function startTimer() {
    elapsed = 0;
    timerEl.textContent = '000';
    timerID = setInterval(function () {
      elapsed = Math.min(elapsed + 1, 999);
      timerEl.textContent = String(elapsed).padStart(3, '0');
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerID);
    timerID = null;
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  function updateHud() {
    mineCountEl.textContent = String(TOTAL_MINES - flagCount).padStart(3, '0');
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function renderCell(cell) {
    var el = cell.el;
    el.className             = 'cbomb-cell';
    el.textContent           = '';
    el.style.color           = '';
    el.style.backgroundColor = '';

    if (!cell.revealed) {
      if (cell.flagged) {
        if (gameState === 'lost' && !cell.mine) {
          el.classList.add('cbomb-wrong-flag');
          el.textContent = '✕';
        } else {
          el.classList.add('cbomb-flagged');
          el.textContent = '🚩';
        }
      } else {
        el.classList.add('cbomb-hidden');
      }
      return;
    }

    el.classList.add('cbomb-revealed');

    if (cell.mine) {
      el.classList.add('cbomb-mine');
      if (cell.triggered) el.classList.add('cbomb-triggered');
      el.textContent = '💣';
      return;
    }

    // adj 1-8: fill cell with the mapped color (the twist — no numbers shown)
    if (cell.adj > 0) {
      el.classList.add('cbomb-swatch');
      el.style.backgroundColor = gameMapping[cell.adj];
    }
    // adj 0: empty dark revealed cell — no content, no color
  }

  // ── Board rendering ────────────────────────────────────────────────────────
  function renderBoard() {
    boardEl.innerHTML = '';
    for (var i = 0; i < cells.length; i++) {
      var el       = document.createElement('div');
      el.className = 'cbomb-cell cbomb-hidden';
      el.dataset.r = String(cells[i].r);
      el.dataset.c = String(cells[i].c);
      cells[i].el  = el;
      boardEl.appendChild(el);
    }
  }

  // ── Color key panel ────────────────────────────────────────────────────────
  function buildKeyPanel() {
    var grid = document.getElementById('cbomb-key-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < BASE_COLORS.length; i++) {
      var row    = document.createElement('div');
      row.className = 'cbomb-key-row';

      var swatch = document.createElement('div');
      swatch.className = 'cbomb-key-swatch';
      swatch.style.backgroundColor = BASE_COLORS[i];

      var input  = document.createElement('input');
      input.type        = 'text';
      input.className   = 'cbomb-key-input';
      input.placeholder = '?';
      input.maxLength   = 6;
      input.setAttribute('aria-label', COLOR_NAMES[i]);

      row.appendChild(swatch);
      row.appendChild(input);
      grid.appendChild(row);
    }
  }

  function clearKeyPanel() {
    var inputs = document.querySelectorAll('.cbomb-key-input');
    for (var i = 0; i < inputs.length; i++) inputs[i].value = '';
  }

  function openKeyPanel()   { var p = document.getElementById('cbomb-key-panel'); if (p) p.classList.add('cbomb-panel-open'); }
  function closeKeyPanel()  { var p = document.getElementById('cbomb-key-panel'); if (p) p.classList.remove('cbomb-panel-open'); }
  function toggleKeyPanel() { var p = document.getElementById('cbomb-key-panel'); if (p) p.classList.toggle('cbomb-panel-open'); }

  // ── Mapping reveal (shown in end overlay) ─────────────────────────────────
  function buildMappingReveal() {
    var container = document.getElementById('cbomb-mapping');
    if (!container || !gameMapping) return;
    container.innerHTML = '';
    for (var count = 1; count <= 8; count++) {
      var entry  = document.createElement('div');
      entry.className = 'cbomb-map-entry';

      var swatch = document.createElement('div');
      swatch.className = 'cbomb-map-swatch';
      swatch.style.backgroundColor = gameMapping[count];

      var label = document.createElement('span');
      label.className  = 'cbomb-map-label';
      label.textContent = '= ' + count;

      entry.appendChild(swatch);
      entry.appendChild(label);
      container.appendChild(entry);
    }
  }

  // ── Events (delegated) ─────────────────────────────────────────────────────
  function setupBoardEvents() {

    boardEl.addEventListener('click', function (e) {
      if (gameState === 'won' || gameState === 'lost') return;
      var el = e.target.closest('.cbomb-cell');
      if (!el) return;
      var r    = parseInt(el.dataset.r, 10);
      var c    = parseInt(el.dataset.c, 10);
      var cell = cells[idx(r, c)];
      if (cell.flagged) return;

      if (gameState === 'idle') {
        generateColorMapping();
        placeMines(r, c);
        gameState = 'playing';
        startTimer();
      }

      if (cell.revealed) { chordReveal(r, c); }
      else               { revealCell(r, c);  }
    });

    boardEl.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (gameState !== 'playing') return;
      var el = e.target.closest('.cbomb-cell');
      if (!el) return;
      toggleFlag(parseInt(el.dataset.r, 10), parseInt(el.dataset.c, 10));
    });

    // Long-press flag for mobile
    var lpTimer = null;
    var lpMoved = false;

    boardEl.addEventListener('touchstart', function (e) {
      lpMoved = false;
      var touch  = e.touches[0];
      var target = document.elementFromPoint(touch.clientX, touch.clientY);
      lpTimer = setTimeout(function () {
        if (lpMoved || gameState !== 'playing') return;
        var el = target && target.closest('.cbomb-cell');
        if (!el) return;
        toggleFlag(parseInt(el.dataset.r, 10), parseInt(el.dataset.c, 10));
        lpTimer = -1;
      }, 450);
    }, { passive: true });

    boardEl.addEventListener('touchmove', function () {
      lpMoved = true;
      clearTimeout(lpTimer);
    }, { passive: true });

    boardEl.addEventListener('touchend', function (e) {
      if (lpTimer === -1) { e.preventDefault(); lpTimer = null; return; }
      clearTimeout(lpTimer);
      lpTimer = null;
    });
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function resetGame() {
    stopTimer();
    flagCount   = 0;
    revealCount = 0;
    elapsed     = 0;
    gameMapping = null;
    gameState   = 'idle';

    closeKeyPanel();
    clearKeyPanel();
    endEl.classList.add('cbomb-hide');
    resetBtn.textContent = '🙂';
    timerEl.textContent  = '000';
    updateHud();
    initBoard();
    renderBoard();
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    boardEl       = document.getElementById('cbomb-board');
    mineCountEl   = document.getElementById('cbomb-mine-count');
    timerEl       = document.getElementById('cbomb-timer');
    resetBtn      = document.getElementById('cbomb-reset');
    endEl         = document.getElementById('cbomb-end');
    endHeadlineEl = document.getElementById('cbomb-end-headline');
    endSubEl      = document.getElementById('cbomb-end-sub');
    shareBtn      = document.getElementById('cbomb-share');
    replayBtn     = document.getElementById('cbomb-replay');

    resetBtn.addEventListener('click', resetGame);
    replayBtn.addEventListener('click', resetGame);

    shareBtn.addEventListener('click', function () {
      shareText(
        'Color Bomb — cleared the board and cracked the color code. https://www.thebunnygame.com/color-bomb',
        'Color Bomb'
      );
    });

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () {
      openDirections(DIRECTIONS_TEXT);
    });

    var keyBtn = document.getElementById('key-btn');
    if (keyBtn) keyBtn.addEventListener('click', toggleKeyPanel);

    var keyClose = document.getElementById('cbomb-key-close');
    if (keyClose) keyClose.addEventListener('click', closeKeyPanel);

    buildKeyPanel();
    setupBoardEvents();
    resetGame();
  });

})();
