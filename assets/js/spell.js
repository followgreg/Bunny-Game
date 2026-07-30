(function () {
  'use strict';

  // Structure and state model are carried over from assets/js/snek.js. Spell
  // adds: letters rendered on cells, the Hangman-style blanks row above the
  // board, an ordered trail (SNEK only kept a visited set), the connecting
  // path line drawn from it, and letter-sequence validation.
  //
  // Letters are spread along the solution path as ordered gates — most cells
  // are blank. Stepping on a blank cell is always fine; stepping on a lettered
  // cell only works if it is the next letter of the word.
  //
  // Where Spell diverges from SNEK's movement: SNEK silently ignored an
  // illegal move. Spell fails the trace on a wrong letter or a revisit, and
  // turns SNEK's "stuck" state into a fail. A fail flashes red and resets the
  // level; there is no stuck overlay.

  var DIRECTIONS_TEXT = "Spell gives you a grid of letters and a row of blanks above it. Trace a path through every cell exactly once — but the letters must spell a word in the right order. Click or tap an adjacent cell to move there. If it's the next letter in the word, it fills in above. If it's wrong, you start over. Get stuck with nowhere valid to go and you start over too. Find the path that spells the word and visits every cell.";

  var LS_KEY     = 'spell_highestLevel';
  var SHARE_URL  = 'https://www.thebunnygame.com/spell';
  var CELL_GAP   = 4;
  var MAX_CELL   = 84;   // Spell's boards are 3–7 cells; without a cap a
                         // two-column board would stretch a cell to ~230px.
  var NUM_LEVELS = 50;

  var levels     = [];
  var currentLvl = 1;  // 1-based
  var highestLvl = 1;

  // Current level state
  var shape      = [];  // [{r,c}]
  var cellSet    = {};  // key(r,c) → true
  var letterMap  = {};  // key(r,c) → letter
  var word       = '';
  var startCell  = null;
  var headR      = 0;
  var headC      = 0;
  var visited    = {};  // key(r,c) → true
  var trail      = [];  // [{r,c}] in visit order — drives the path line
  var visitCount = 0;
  var lettersFound = 0; // how many of the word's letters have been collected

  var levelsReady = false;   // level JSON has landed
  var pendingPlay = false;   // Play was tapped before it landed

  // DOM
  var splashEl, splashBtnsEl, startEl, gameEl, completeEl, winEl;
  var startBtnsEl, hudLevelEl, hudFurthestEl, revealBtnEl;
  var boardEl, stageEl, pathEl, blanksEl, completeLevelEl, completeWordEl;
  var revealing = false;
  var failing   = false;   // input is locked between the fail flash and reset

  function key(r, c) { return r + ',' + c; }

  document.addEventListener('DOMContentLoaded', function () {
    splashEl      = document.getElementById('sp-splash');
    splashBtnsEl  = document.getElementById('sp-splash-btns');
    startEl       = document.getElementById('sp-start');
    gameEl        = document.getElementById('sp-game');
    completeEl    = document.getElementById('sp-complete');
    winEl         = document.getElementById('sp-win');
    startBtnsEl   = document.getElementById('sp-start-btns');
    hudLevelEl    = document.getElementById('sp-level-label');
    hudFurthestEl = document.getElementById('sp-furthest-label');
    revealBtnEl   = document.getElementById('sp-reveal');
    boardEl       = document.getElementById('sp-board');
    stageEl       = document.getElementById('sp-board-stage');
    pathEl        = document.getElementById('sp-path');
    blanksEl      = document.getElementById('sp-blanks');
    completeLevelEl = document.getElementById('sp-complete-level');
    completeWordEl  = document.getElementById('sp-complete-word');

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });

    // Splash carries the same directions text as the ? popup — single source.
    document.getElementById('sp-splash-dir').textContent = DIRECTIONS_TEXT;
    document.getElementById('sp-splash-play').addEventListener('click', playFromSplash);

    document.getElementById('sp-up').addEventListener('click',    function () { move(-1,  0); });
    document.getElementById('sp-down').addEventListener('click',  function () { move( 1,  0); });
    document.getElementById('sp-left').addEventListener('click',  function () { move( 0, -1); });
    document.getElementById('sp-right').addEventListener('click', function () { move( 0,  1); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp')    { e.preventDefault(); move(-1,  0); }
      if (e.key === 'ArrowDown')  { e.preventDefault(); move( 1,  0); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); move( 0, -1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); move( 0,  1); }
    });

    window.addEventListener('resize', function () {
      if (!gameEl.classList.contains('sp-hide')) renderBoard();
    });

    revealBtnEl.addEventListener('click', revealAnswer);
    document.getElementById('sp-next').addEventListener('click',  nextLevel);
    document.getElementById('sp-play-again').addEventListener('click', function () { currentLvl = 1; showStart(); });
    document.getElementById('sp-share').addEventListener('click', function () {
      shareText('Spell — traced all 50 words without missing a letter. Can you find the path? ' + SHARE_URL, 'Spell');
    });

    highestLvl = parseInt(localStorage.getItem(LS_KEY) || '1', 10);

    fetch('/assets/data/spell-levels.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        levels = data;
        levelsReady = true;
        // If Play was tapped while the JSON was still in flight, honour it now.
        if (pendingPlay) enterFromSplash();
      })
      .catch(function () {
        levels = [];
        splashBtnsEl.innerHTML = '';
        var errP = document.createElement('p');
        errP.className = 'sp-sub';
        errP.style.cssText = 'color:#f87171;margin:0 0 10px;';
        errP.textContent = 'Levels failed to load. Try reloading the page.';
        splashBtnsEl.appendChild(errP);
        splashBtnsEl.appendChild(btn('sp-btn-primary', 'Reload', function () { location.reload(); }));
      });
  });

  // ── Splash ───────────────────────────────────────────────────────────────────

  function playFromSplash() {
    if (!levelsReady) { pendingPlay = true; return; }
    enterFromSplash();
  }

  function enterFromSplash() {
    pendingPlay = false;
    hide(splashEl);
    // Mid-run: let the player choose Continue or restart. Otherwise straight in,
    // so a first-time player isn't asked to press Play and then Start.
    if (highestLvl > 1 && highestLvl < NUM_LEVELS) {
      showStart();
    } else {
      currentLvl = 1;
      startGame();
    }
  }

  // ── Screens ──────────────────────────────────────────────────────────────────

  function showStart() {
    hide(gameEl); hide(winEl);
    startBtnsEl.innerHTML = '';

    if (highestLvl > 1 && highestLvl < NUM_LEVELS) {
      var cont = btn('sp-btn-primary', 'Continue from Level ' + (highestLvl + 1), function () {
        currentLvl = highestLvl + 1;
        startGame();
      });
      startBtnsEl.appendChild(cont);

      var fresh = btn('sp-btn-ghost', 'Start from Level 1', function () {
        currentLvl = 1;
        startGame();
      });
      startBtnsEl.appendChild(fresh);
    } else if (highestLvl >= NUM_LEVELS) {
      var again = btn('sp-btn-primary', 'Play Again', function () {
        currentLvl = 1;
        startGame();
      });
      startBtnsEl.appendChild(again);
    } else {
      var start = btn('sp-btn-primary', 'Start', function () {
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
    hide(completeEl);

    var data = levels[n - 1];
    if (!data) { hide(gameEl); show(startEl); return; }

    shape   = data.cells.map(function (c) { return { r: c[0], c: c[1] }; });
    cellSet = {};
    shape.forEach(function (cell) { cellSet[key(cell.r, cell.c)] = true; });

    // letterMap keys are "q,r" where q is the row and r the column — the same
    // "row,col" string used everywhere else, so no remapping is needed.
    letterMap = data.letterMap;
    word      = data.word;

    startCell  = { r: data.start.q, c: data.start.r };
    headR      = startCell.r;
    headC      = startCell.c;
    visited    = {};
    visited[key(headR, headC)] = true;
    trail      = [{ r: headR, c: headC }];
    visitCount = 1;
    lettersFound = 0;

    revealing = false;
    failing   = false;
    revealBtnEl.disabled = false;
    hudLevelEl.textContent    = 'Level ' + n;
    hudFurthestEl.textContent = 'Furthest: ' + highestLvl;

    buildBlanks();
    renderBoard();
    collectLetterAt(headR, headC);   // the start cell always carries letter 1
  }

  // If this cell holds a letter, bank it and fill the next blank.
  function collectLetterAt(r, c) {
    var letter = letterMap[key(r, c)];
    if (!letter) return;
    fillBlank(lettersFound, letter);
    lettersFound++;
  }

  // Clears the path, resets every blank to an underscore and puts the cursor
  // back on the start cell. Same shape as SNEK's retry.
  function resetLevel() {
    loadLevel(currentLvl);
  }

  function nextLevel() {
    if (currentLvl >= NUM_LEVELS) {
      showWin();
    } else {
      currentLvl++;
      hide(completeEl);
      loadLevel(currentLvl);
    }
  }

  // ── Blanks row ───────────────────────────────────────────────────────────────

  function buildBlanks() {
    blanksEl.innerHTML = '';
    for (var i = 0; i < word.length; i++) {
      var slot = document.createElement('span');
      slot.className = 'sp-blank';
      slot.dataset.index = String(i);
      blanksEl.appendChild(slot);
    }
  }

  // Fills slot `index` with `letter`, bouncing it in.
  function fillBlank(index, letter) {
    var slot = blanksEl.children[index];
    if (!slot) return;
    slot.textContent = letter || '';
    slot.classList.add('sp-blank-full');
    // Restart the animation if the slot is being refilled.
    slot.classList.remove('blank-filled');
    void slot.offsetWidth;
    slot.classList.add('blank-filled');
  }

  // ── Reveal answer ─────────────────────────────────────────────────────────────

  function revealAnswer() {
    if (revealing || failing) return;
    var solution = levels[currentLvl - 1].solution;
    if (!solution) return;

    // Reset to fresh state first, then auto-play
    hide(completeEl);
    headR      = startCell.r;
    headC      = startCell.c;
    visited    = {};
    visited[key(headR, headC)] = true;
    trail      = [{ r: headR, c: headC }];
    visitCount = 1;
    lettersFound = 0;
    buildBlanks();
    renderBoard();
    collectLetterAt(headR, headC);

    revealing = true;
    revealBtnEl.disabled = true;

    var step = 1;

    function playStep() {
      if (step >= solution.length) {
        revealing = false;
        triggerWin();
        return;
      }
      headR = solution[step].q;
      headC = solution[step].r;
      visited[key(headR, headC)] = true;
      trail.push({ r: headR, c: headC });
      visitCount++;
      renderBoard();
      collectLetterAt(headR, headC);
      step++;
      setTimeout(playStep, 60);
    }

    setTimeout(playStep, 180);
  }

  // ── Movement ─────────────────────────────────────────────────────────────────

  var DIRS = [[-1,0],[1,0],[0,-1],[0,1]];

  function move(dr, dc) {
    attemptMove(headR + dr, headC + dc);
  }

  function attemptMove(nr, nc) {
    // Ignore input while the complete overlay is up, or a reveal or fail
    // animation is running.
    if (revealing || failing) return;
    if (!completeEl.classList.contains('sp-hide')) return;

    var k = key(nr, nc);

    // Step 1 — must be a real cell, adjacent to where we are.
    if (!cellSet[k]) return;
    if (Math.abs(nr - headR) + Math.abs(nc - headC) !== 1) return;

    // Step 2 — already traced.
    if (visited[k]) {
      triggerFail(nr, nc);
      return;
    }

    // Step 3 — a lettered cell is a gate: it has to be the next letter of the
    // word. Blank cells are always walkable.
    var cellLetter = letterMap[k];
    if (cellLetter && cellLetter !== word[lettersFound]) {
      triggerFail(nr, nc);
      return;
    }

    // Valid move.
    headR = nr; headC = nc;
    visited[k] = true;
    trail.push({ r: nr, c: nc });
    visitCount++;

    renderBoard();
    collectLetterAt(nr, nc);

    // Win — every cell traced, which by construction means the word is spelled.
    if (trail.length === shape.length) {
      triggerWin();
      return;
    }

    // Boxed in with cells still uncovered — SNEK's stuck state, now a fail.
    if (isStuck()) {
      triggerFail(headR, headC);
    }
  }

  // No adjacent, untraced cell left to move to.
  function isStuck() {
    for (var i = 0; i < DIRS.length; i++) {
      var k = key(headR + DIRS[i][0], headC + DIRS[i][1]);
      if (cellSet[k] && !visited[k]) return false;
    }
    return true;
  }

  // ── Level outcomes ────────────────────────────────────────────────────────────

  // Flashes the cell that broke the trace, then resets the level. No lives,
  // no penalty — the player is back at the start cell and can go again.
  function triggerFail(r, c) {
    failing = true;

    var cellEl = boardEl.querySelector('[data-rc="' + key(r, c) + '"]');
    if (cellEl) cellEl.classList.add('sp-cell-fail');

    setTimeout(function () {
      failing = false;
      resetLevel();
    }, 400);
  }

  function triggerWin() {
    // Flash all trail cells green
    var cells = boardEl.querySelectorAll('.sp-cell-trail, .sp-cell-head');
    cells.forEach(function (el) {
      el.classList.add('sp-cell-flash');
    });

    if (currentLvl > highestLvl) {
      highestLvl = currentLvl;
      try { localStorage.setItem(LS_KEY, String(highestLvl)); } catch (e) {}
    }

    completeLevelEl.textContent = 'Level ' + currentLvl;
    completeWordEl.textContent  = word;

    setTimeout(function () {
      if (currentLvl >= NUM_LEVELS) {
        if (currentLvl > highestLvl) {
          highestLvl = NUM_LEVELS;
          try { localStorage.setItem(LS_KEY, String(NUM_LEVELS)); } catch (e) {}
        }
        showWin();
      } else {
        show(completeEl);
      }
    }, 500);
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
    cellSize     = Math.min(cellSize, MAX_CELL);
    cellSize     = Math.max(cellSize, 22);

    var boardW = cols * cellSize + CELL_GAP * (cols - 1);
    var boardH = rows * cellSize + CELL_GAP * (rows - 1);

    stageEl.style.width  = boardW + 'px';
    stageEl.style.height = boardH + 'px';

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
        div.className = 'sp-cell';

        if (!cellSet[k]) {
          div.classList.add('sp-cell-void');
        } else {
          div.dataset.rc = k;

          if (r === headR && c === headC) {
            div.classList.add('sp-cell-head');
          } else if (visited[k]) {
            div.classList.add('sp-cell-trail');
          } else if (r === startCell.r && c === startCell.c && visitCount === 1) {
            div.classList.add('sp-cell-start');
          } else {
            div.classList.add('sp-cell-empty');
          }

          var span = document.createElement('span');
          span.className = 'sp-letter';
          span.style.fontSize = Math.round(cellSize * 0.55) + 'px';
          span.textContent = letterMap[k] || '';
          div.appendChild(span);

          // Every active cell is tappable; attemptMove decides what happens.
          // Tapping a non-adjacent cell is ignored, an adjacent one either
          // advances the trace or fails it.
          (function (tr, tc) {
            div.addEventListener('click', function () { attemptMove(tr, tc); });
          })(r, c);

          // Pointer affordance on the cells a move could actually reach
          if (!visited[k] && Math.abs(r - headR) + Math.abs(c - headC) === 1) {
            div.classList.add('sp-cell-next');
          }
        }

        boardEl.appendChild(div);
      }
    }

    renderPath(cellSize, boardW, boardH);
  }

  // Connecting line through the centres of the traced cells.
  function renderPath(cellSize, boardW, boardH) {
    pathEl.setAttribute('width',  boardW);
    pathEl.setAttribute('height', boardH);
    pathEl.setAttribute('viewBox', '0 0 ' + boardW + ' ' + boardH);
    pathEl.innerHTML = '';

    if (trail.length < 2) return;

    var pts = trail.map(function (cell) {
      var x = cell.c * (cellSize + CELL_GAP) + cellSize / 2;
      var y = cell.r * (cellSize + CELL_GAP) + cellSize / 2;
      return x + ',' + y;
    }).join(' ');

    var line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('class', 'sp-path-line');
    line.setAttribute('points', pts);
    line.setAttribute('stroke-width', Math.max(3, Math.round(cellSize * 0.11)));
    pathEl.appendChild(line);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function show(el) { if (el) el.classList.remove('sp-hide'); }
  function hide(el) { if (el) el.classList.add('sp-hide'); }

  function btn(cls, text, onClick) {
    var el = document.createElement('button');
    el.className   = cls;
    el.textContent = text;
    el.addEventListener('click', onClick);
    return el;
  }

})();
