(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  var ROWS = 16, COLS = 16, TOTAL_MINES = 40;

  // Standard Minesweeper number colors, adjusted for dark background
  var NUM_COLORS = [
    null,        // 0 – never shown
    '#60a5fa',   // 1 – blue
    '#34d399',   // 2 – green
    '#f87171',   // 3 – red
    '#818cf8',   // 4 – indigo
    '#fb7185',   // 5 – rose
    '#22d3ee',   // 6 – cyan
    '#f1f5f9',   // 7 – near-white
    '#94a3b8',   // 8 – slate
  ];

  var DIRECTIONS_TEXT =
    'Click to reveal a cell. Right-click — or long-press on mobile — to flag a ' +
    'suspected mine. Click a revealed number when the right number of flags surround ' +
    'it to chord-reveal its remaining neighbors. Your first click is always safe. ' +
    'Clear all 216 safe cells to win.';

  // ── State ──────────────────────────────────────────────────────────────────
  var cells      = [];
  var gameState  = 'idle';  // 'idle' | 'playing' | 'won' | 'lost'
  var flagCount  = 0;
  var revealCount = 0;
  var timerID    = null;
  var elapsed    = 0;

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
        cells.push({ r: r, c: c, mine: false, adj: 0, revealed: false, flagged: false, triggered: false, el: null });
      }
    }
  }

  // ── Mine placement: first click is always safe (cell + all 8 neighbors) ───
  function placeMines(safeR, safeC) {
    var excluded = new Set();
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        var nr = safeR + dr, nc = safeC + dc;
        if (inBounds(nr, nc)) excluded.add(idx(nr, nc));
      }
    }

    // Fisher-Yates sample from eligible positions
    var pool = [];
    for (var i = 0; i < ROWS * COLS; i++) {
      if (!excluded.has(i)) pool.push(i);
    }
    for (var j = pool.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var tmp = pool[j]; pool[j] = pool[k]; pool[k] = tmp;
    }
    for (var m = 0; m < TOTAL_MINES; m++) cells[pool[m]].mine = true;

    // Compute adjacency counts
    for (var ci = 0; ci < cells.length; ci++) {
      var cell = cells[ci];
      if (!cell.mine) {
        cell.adj = neighbors(cell.r, cell.c).filter(function (n) { return n.mine; }).length;
      }
    }
  }

  // ── Reveal (iterative BFS) ─────────────────────────────────────────────────
  function revealCell(startR, startC) {
    var start = cells[idx(startR, startC)];
    if (start.revealed || start.flagged) return;

    if (start.mine) {
      start.revealed = true;
      start.triggered = true;
      revealCount++;
      renderCell(start);
      endGame(false);
      return;
    }

    // BFS flood fill for zero-adjacent cells
    var queue = [start];
    var seen = new Set();
    seen.add(idx(startR, startC));

    while (queue.length > 0) {
      var cell = queue.shift();
      if (cell.revealed || cell.flagged) continue;

      cell.revealed = true;
      revealCount++;
      renderCell(cell);

      if (cell.adj === 0) {
        var ns = neighbors(cell.r, cell.c);
        for (var i = 0; i < ns.length; i++) {
          var n = ns[i];
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

  // ── Chord reveal (click numbered cell when flag count matches) ─────────────
  function chordReveal(r, c) {
    var cell = cells[idx(r, c)];
    if (!cell.revealed || cell.adj === 0) return;
    var ns = neighbors(r, c);
    var flagged = ns.filter(function (n) { return n.flagged; }).length;
    if (flagged !== cell.adj) return;
    for (var i = 0; i < ns.length; i++) {
      if (!ns[i].revealed && !ns[i].flagged) revealCell(ns[i].r, ns[i].c);
    }
  }

  // ── Flag toggle ────────────────────────────────────────────────────────────
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
      // Auto-flag remaining unflagged mines
      for (var i = 0; i < cells.length; i++) {
        if (cells[i].mine && !cells[i].flagged) {
          cells[i].flagged = true;
          renderCell(cells[i]);
        }
      }
      flagCount = TOTAL_MINES;
      updateHud();
    } else {
      // Reveal all mines and mark wrong flags
      for (var j = 0; j < cells.length; j++) {
        var cell = cells[j];
        if (cell.mine && !cell.flagged) { cell.revealed = true; renderCell(cell); }
        if (!cell.mine && cell.flagged)  { renderCell(cell); }
      }
    }

    var delay = won ? 350 : 600;
    setTimeout(function () {
      endHeadlineEl.textContent = won ? 'Board cleared!' : 'Boom.';
      endSubEl.textContent = won
        ? 'Cleared in ' + elapsed + 's.'
        : 'A mine was triggered. Give it another shot.';
      if (won) {
        shareBtn.classList.remove('cbomb-hide');
      } else {
        shareBtn.classList.add('cbomb-hide');
      }
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
    var remaining = TOTAL_MINES - flagCount;
    mineCountEl.textContent = String(remaining).padStart(3, '0');
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function renderCell(cell) {
    var el = cell.el;
    el.className = 'cbomb-cell';
    el.textContent = '';
    el.style.color = '';

    if (!cell.revealed) {
      if (cell.flagged) {
        // Show wrong flag indicator after loss
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

    if (cell.adj > 0) {
      el.textContent = cell.adj;
      el.style.color = NUM_COLORS[cell.adj];
    }
  }

  // ── Board rendering ────────────────────────────────────────────────────────
  function renderBoard() {
    boardEl.innerHTML = '';
    for (var i = 0; i < cells.length; i++) {
      var el = document.createElement('div');
      el.className = 'cbomb-cell cbomb-hidden';
      el.dataset.r = String(cells[i].r);
      el.dataset.c = String(cells[i].c);
      cells[i].el = el;
      boardEl.appendChild(el);
    }
  }

  // ── Event handling (delegated) ─────────────────────────────────────────────
  function setupBoardEvents() {

    boardEl.addEventListener('click', function (e) {
      if (gameState === 'won' || gameState === 'lost') return;
      var el = e.target.closest('.cbomb-cell');
      if (!el) return;
      var r = parseInt(el.dataset.r, 10);
      var c = parseInt(el.dataset.c, 10);
      var cell = cells[idx(r, c)];
      if (cell.flagged) return;

      if (gameState === 'idle') {
        placeMines(r, c);
        gameState = 'playing';
        startTimer();
      }

      if (cell.revealed) {
        chordReveal(r, c);
      } else {
        revealCell(r, c);
      }
    });

    boardEl.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (gameState !== 'playing') return;
      var el = e.target.closest('.cbomb-cell');
      if (!el) return;
      var r = parseInt(el.dataset.r, 10);
      var c = parseInt(el.dataset.c, 10);
      toggleFlag(r, c);
    });

    // Long-press flagging for mobile
    var lpTimer = null;
    var lpMoved = false;

    boardEl.addEventListener('touchstart', function (e) {
      lpMoved = false;
      var touch = e.touches[0];
      var target = document.elementFromPoint(touch.clientX, touch.clientY);
      lpTimer = setTimeout(function () {
        if (lpMoved || gameState !== 'playing') return;
        var el = target && target.closest('.cbomb-cell');
        if (!el) return;
        var r = parseInt(el.dataset.r, 10);
        var c = parseInt(el.dataset.c, 10);
        toggleFlag(r, c);
        // Suppress the subsequent click
        lpTimer = -1;
      }, 450);
    }, { passive: true });

    boardEl.addEventListener('touchmove', function () {
      lpMoved = true;
      clearTimeout(lpTimer);
    }, { passive: true });

    boardEl.addEventListener('touchend', function (e) {
      if (lpTimer === -1) {
        // Long-press fired: eat the click
        e.preventDefault();
        lpTimer = null;
        return;
      }
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
    gameState   = 'idle';

    endEl.classList.add('cbomb-hide');
    resetBtn.textContent = '🙂';
    timerEl.textContent  = '000';
    updateHud();
    initBoard();
    renderBoard();
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    boardEl      = document.getElementById('cbomb-board');
    mineCountEl  = document.getElementById('cbomb-mine-count');
    timerEl      = document.getElementById('cbomb-timer');
    resetBtn     = document.getElementById('cbomb-reset');
    endEl        = document.getElementById('cbomb-end');
    endHeadlineEl = document.getElementById('cbomb-end-headline');
    endSubEl     = document.getElementById('cbomb-end-sub');
    shareBtn     = document.getElementById('cbomb-share');
    replayBtn    = document.getElementById('cbomb-replay');

    resetBtn.addEventListener('click', resetGame);
    replayBtn.addEventListener('click', resetGame);

    shareBtn.addEventListener('click', function () {
      shareText(
        'Color Bomb — cleared the minefield in ' + elapsed + 's. https://www.thebunnygame.com/colorbomb',
        'Color Bomb'
      );
    });

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () {
      openDirections(DIRECTIONS_TEXT);
    });

    setupBoardEvents();
    resetGame();
  });

})();
