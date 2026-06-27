(function () {
  'use strict';

  // ── Part 1 — Word list ─────────────────────────────────────────────────────
  var WORDS = [
    'ADVENTURE', 'AFTERNOON', 'ALONGSIDE', 'APARTMENT', 'ATTENTION',
    'AVAILABLE', 'BEAUTIFUL', 'BEGINNING', 'BREAKFAST', 'BRILLIANT',
    'BUTTERFLY', 'CAREFULLY', 'CELEBRATE', 'CHALLENGE', 'CHARACTER',
    'CHOCOLATE', 'CLASSROOM', 'COMMUNITY', 'COMPANION', 'CONFIDENT',
    'COUNTRIES', 'DANGEROUS', 'DAUGHTERS', 'DEDICATED', 'DETERMINE',
    'DIFFERENT', 'DIRECTION', 'DISCOVERY', 'EMOTIONAL', 'ENCOURAGE',
    'ESTABLISH', 'EVERYBODY', 'EXCELLENT', 'EXTREMELY', 'FANTASTIC',
    'FINANCIAL', 'FIREWORKS', 'FOLLOWING', 'GEOGRAPHY', 'HALLOWEEN',
    'HANDSHAKE', 'HAPPENING', 'HOPEFULLY', 'HOUSEHOLD', 'HURRICANE',
    'IDENTICAL', 'IMAGINARY', 'IMMEDIATE', 'IMPORTANT', 'INCLUDING',
    'INSPIRING', 'INTRODUCE', 'INVENTION', 'INVISIBLE', 'KNOWLEDGE',
    'LANDSCAPE', 'LIGHTNING', 'LISTENING', 'MARKETING', 'MEANWHILE',
    'MEMORABLE', 'MOUNTAINS', 'NATURALLY', 'NECESSARY', 'NEWSPAPER',
    'NIGHTMARE', 'OBVIOUSLY', 'OPERATION', 'ORCHESTRA', 'OTHERWISE',
    'OVERNIGHT', 'PERFECTLY', 'PERMANENT', 'PINEAPPLE', 'POTENTIAL',
    'PRESIDENT', 'QUESTIONS', 'RASPBERRY', 'RELIGIOUS', 'SEPTEMBER',
    'SITUATION', 'SOMETHING', 'SOMETIMES', 'SOMEWHERE', 'STAIRCASE',
    'STARLIGHT', 'STRUCTURE', 'SUPERHERO', 'TELEPHONE', 'TERRITORY',
    'THEREFORE', 'THOUSANDS', 'TRADITION', 'TRAVELING', 'TREATMENT',
    'UNCERTAIN', 'VEGETABLE', 'VOLUNTEER', 'WATERFALL', 'YESTERDAY',
  ];

  // ── Part 2 — Grid constants & generation ───────────────────────────────────
  //
  //   Cell layout (row-major):
  //   0  1  2
  //   3  4  5
  //   6  7  8
  //
  var ADJACENCY = [
    [1, 3, 4],                    // 0  top-left
    [0, 2, 3, 4, 5],              // 1  top-center
    [1, 4, 5],                    // 2  top-right
    [0, 1, 4, 6, 7],              // 3  mid-left
    [0, 1, 2, 3, 5, 6, 7, 8],    // 4  center
    [1, 2, 4, 7, 8],              // 5  mid-right
    [3, 4, 7],                    // 6  bottom-left
    [3, 4, 5, 6, 8],              // 7  bottom-center
    [4, 5, 7],                    // 8  bottom-right
  ];

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function randomWord() {
    return WORDS[Math.floor(Math.random() * WORDS.length)];
  }

  function randomHamiltonianPath() {
    var path    = [];
    var visited = new Array(9).fill(false);

    function bt(cell) {
      path.push(cell);
      visited[cell] = true;
      if (path.length === 9) return true;
      var ns = shuffle(ADJACENCY[cell].slice());
      for (var i = 0; i < ns.length; i++) {
        if (!visited[ns[i]] && bt(ns[i])) return true;
      }
      path.pop();
      visited[cell] = false;
      return false;
    }

    var starts = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (var s = 0; s < starts.length; s++) {
      path    = [];
      visited = new Array(9).fill(false);
      if (bt(starts[s])) return path;
    }
    return [0, 1, 2, 3, 4, 5, 6, 7, 8];
  }

  // Returns { word, grid[9], path[9] }
  //   grid[cellIndex] = letter at that cell
  //   path[i]         = cell index holding word[i]
  function buildGrid(word) {
    var path = randomHamiltonianPath();
    var grid = new Array(9).fill('');
    for (var i = 0; i < 9; i++) grid[path[i]] = word[i];
    return { word: word, grid: grid, path: path };
  }

  // ── Part 3 — Game state ────────────────────────────────────────────────────
  var DIRECTIONS_TEXT =
    'A 9-letter word is shown at the top. Find it hiding in the grid and tap ' +
    'the letters in order to trace the path. Each step must connect to an ' +
    'adjacent cell — including diagonals. Every cell is used exactly once. ' +
    'If your path hits a dead end, tap Try Again to start over with the same word.';

  var currentGame = null;  // { word, grid, path }
  var trace       = [];    // cell indices in trace order
  var gameActive  = false;

  // DOM refs (set in DOMContentLoaded)
  var gridEl, slotsEl, svgEl, targetEl, tryBtn, newBtn;

  // ── Cell helpers ───────────────────────────────────────────────────────────
  function getCellEl(idx) {
    return gridEl.querySelector('[data-idx="' + idx + '"]');
  }

  // Returns { x, y } of a cell's center relative to the board-wrap (= SVG origin)
  function cellCenter(idx) {
    var wrap = svgEl.parentElement;
    var wR   = wrap.getBoundingClientRect();
    var cR   = getCellEl(idx).getBoundingClientRect();
    return {
      x: cR.left + cR.width  / 2 - wR.left,
      y: cR.top  + cR.height / 2 - wR.top,
    };
  }

  // ── SVG trace drawing ──────────────────────────────────────────────────────
  function redrawSVG() {
    svgEl.innerHTML = '';
    if (trace.length === 0) return;

    var ns = 'http://www.w3.org/2000/svg';

    // Lines drawn first (under dots)
    var linesG = document.createElementNS(ns, 'g');
    for (var i = 1; i < trace.length; i++) {
      var a    = cellCenter(trace[i - 1]);
      var b    = cellCenter(trace[i]);
      var line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', a.x);
      line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x);
      line.setAttribute('y2', b.y);
      line.setAttribute('stroke', 'rgba(255,255,255,0.55)');
      line.setAttribute('stroke-width', '5');
      line.setAttribute('stroke-linecap', 'round');
      linesG.appendChild(line);
    }
    svgEl.appendChild(linesG);

    // Dots on top so they show through cell centers
    var dotsG = document.createElementNS(ns, 'g');
    for (var j = 0; j < trace.length; j++) {
      var p   = cellCenter(trace[j]);
      var dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', p.x);
      dot.setAttribute('cy', p.y);
      dot.setAttribute('r', j === 0 ? 8 : 5);
      dot.setAttribute('fill',
        j === trace.length - 1
          ? 'rgba(255,255,255,0.95)'
          : 'rgba(255,255,255,0.55)'
      );
      dotsG.appendChild(dot);
    }
    svgEl.appendChild(dotsG);
  }

  // ── Slot helpers ───────────────────────────────────────────────────────────
  function renderSlots() {
    slotsEl.innerHTML = '';
    for (var i = 0; i < 9; i++) {
      var div       = document.createElement('div');
      div.className = 'niner-slot';
      div.id        = 'nslot-' + i;
      slotsEl.appendChild(div);
    }
  }

  function fillSlot(pos, letter) {
    var el = document.getElementById('nslot-' + pos);
    if (el) el.textContent = letter;
  }

  function setSlotsState(state) {
    for (var i = 0; i < trace.length; i++) {
      var el = document.getElementById('nslot-' + i);
      if (!el) continue;
      el.classList.remove('error', 'correct');
      if (state) el.classList.add(state);
    }
  }

  function clearSlots() {
    for (var i = 0; i < 9; i++) {
      var el = document.getElementById('nslot-' + i);
      if (el) { el.textContent = ''; el.classList.remove('error', 'correct'); }
    }
  }

  // ── Cell visual state ──────────────────────────────────────────────────────
  function refreshCellStates() {
    for (var i = 0; i < 9; i++) {
      var el = getCellEl(i);
      if (!el) continue;
      el.classList.remove('used', 'active', 'solved');
    }
    for (var j = 0; j < trace.length; j++) {
      var cel = getCellEl(trace[j]);
      if (!cel) continue;
      if (j === trace.length - 1) {
        cel.classList.add('active');
      } else {
        cel.classList.add('used');
      }
    }
  }

  function markAllSolved() {
    for (var i = 0; i < 9; i++) {
      var el = getCellEl(i);
      if (el) { el.classList.remove('used', 'active'); el.classList.add('solved'); }
    }
  }

  // ── Grid rendering ─────────────────────────────────────────────────────────
  function renderGrid(game) {
    gridEl.innerHTML = '';
    for (var i = 0; i < 9; i++) {
      var div         = document.createElement('div');
      div.className   = 'niner-cell';
      div.dataset.idx = String(i);
      div.textContent = game.grid[i];
      gridEl.appendChild(div);
    }
  }

  // ── Win / dead-end states ──────────────────────────────────────────────────
  function handleWin() {
    gameActive = false;
    markAllSolved();
    setSlotsState('correct');
    targetEl.classList.add('solved');
    tryBtn.classList.add('n-hide');
    // Part 4 will add a proper win overlay
  }

  function triggerDeadEnd() {
    gameActive = false;
    setSlotsState('error');
    tryBtn.classList.remove('n-hide');
  }

  // ── Click handling ─────────────────────────────────────────────────────────
  function handleCellClick(idx) {
    if (!gameActive) return;

    // Already in trace — ignore
    if (trace.indexOf(idx) !== -1) return;

    // After the first click, must be adjacent to the tail
    if (trace.length > 0 && ADJACENCY[trace[trace.length - 1]].indexOf(idx) === -1) return;

    // Commit the step
    trace.push(idx);
    fillSlot(trace.length - 1, currentGame.grid[idx]);
    refreshCellStates();
    redrawSVG();

    // Win check: all 9 cells traced
    if (trace.length === 9) {
      var spelled = trace.map(function (ci) { return currentGame.grid[ci]; }).join('');
      if (spelled === currentGame.word) {
        handleWin();
      } else {
        // Traced all 9 but wrong word — treat as dead-end
        triggerDeadEnd();
      }
      return;
    }

    // Dead-end detection injected here in Part 4
  }

  // ── Try Again — reset trace, keep same word/grid ───────────────────────────
  function resetTrace() {
    trace      = [];
    gameActive = true;
    svgEl.innerHTML = '';
    clearSlots();
    refreshCellStates();
    targetEl.classList.remove('solved');
    tryBtn.classList.add('n-hide');
  }

  // ── New Word — fresh word, fresh grid ─────────────────────────────────────
  function startNewGame() {
    currentGame = buildGrid(randomWord());
    trace       = [];
    gameActive  = true;

    targetEl.textContent = currentGame.word;
    targetEl.classList.remove('solved');
    svgEl.innerHTML = '';
    renderGrid(currentGame);
    renderSlots();
    tryBtn.classList.add('n-hide');
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    gridEl   = document.getElementById('niner-grid');
    slotsEl  = document.getElementById('niner-slots');
    svgEl    = document.getElementById('niner-svg');
    targetEl = document.getElementById('niner-target');
    tryBtn   = document.getElementById('niner-try');
    newBtn   = document.getElementById('niner-new');

    gridEl.addEventListener('click', function (e) {
      var cell = e.target.closest('.niner-cell');
      if (!cell) return;
      handleCellClick(parseInt(cell.dataset.idx, 10));
    });

    tryBtn.addEventListener('click', resetTrace);
    newBtn.addEventListener('click', startNewGame);

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () {
      openDirections(DIRECTIONS_TEXT);
    });

    startNewGame();
  });

  // ── Dev hook ───────────────────────────────────────────────────────────────
  window._niner = {
    ADJACENCY : ADJACENCY,
    buildGrid : buildGrid,
    game      : function () { return currentGame; },
    trace     : function () { return trace; },
  };

})();
