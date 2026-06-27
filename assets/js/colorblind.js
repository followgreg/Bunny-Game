(function () {
  'use strict';

  var DIRECTIONS_TEXT =
    'One square in the grid is a slightly different shade from all the others. ' +
    'Select the one you think is the odd one out, then tap Submit. ' +
    'You only get one chance per attempt — if you\'re wrong, the board stays ' +
    'unchanged so you can look again. ' +
    'The differences get harder to spot as you progress through all 100 levels.';

  // ── State ─────────────────────────────────────────────────────────────────
  var levels        = null;
  var currentIdx    = 0;   // 0-based index into levels array
  var selectedCell  = null; // currently selected cell index (0-based, row-major)

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var loadingEl, errorEl, gameEl;
  var boardEl, levelLabelEl, submitBtn;
  var correctEl, incorrectEl, winEl;
  var nextLevelBtn, tryAgainBtn, playAgainBtn, correctSubEl;

  // ── Screen helpers ────────────────────────────────────────────────────────
  function showScreen(name) {
    // hide all screens and overlays
    [loadingEl, errorEl, gameEl, winEl].forEach(function (el) {
      el.classList.add('cb-hide');
    });
    [correctEl, incorrectEl].forEach(function (el) {
      el.classList.add('cb-hide');
    });
    if (name === 'loading') loadingEl.classList.remove('cb-hide');
    if (name === 'error')   errorEl.classList.remove('cb-hide');
    if (name === 'game')    gameEl.classList.remove('cb-hide');
    if (name === 'win')     winEl.classList.remove('cb-hide');
  }

  function showOverlay(name) {
    correctEl.classList.add('cb-hide');
    incorrectEl.classList.add('cb-hide');
    if (name === 'correct')   correctEl.classList.remove('cb-hide');
    if (name === 'incorrect') incorrectEl.classList.remove('cb-hide');
  }

  function hideOverlays() {
    correctEl.classList.add('cb-hide');
    incorrectEl.classList.add('cb-hide');
  }

  // ── Board rendering ───────────────────────────────────────────────────────
  function renderLevel(levelData) {
    var size  = levelData.boardSize;
    var total = size * size;

    selectedCell = null;
    submitBtn.disabled = true;
    hideOverlays();

    levelLabelEl.textContent = 'Level ' + levelData.level + ' of 100';

    // Set grid columns — cells auto-size to fill the fixed board width
    boardEl.style.gridTemplateColumns = 'repeat(' + size + ', 1fr)';
    boardEl.innerHTML = '';

    for (var i = 0; i < total; i++) {
      var cell = document.createElement('div');
      cell.className = 'cb-cell';
      cell.style.backgroundColor =
        i === levelData.oddCellIndex ? levelData.oddColor : levelData.baseColor;
      cell.dataset.idx = String(i);
      cell.addEventListener('click', handleCellClick);
      boardEl.appendChild(cell);
    }
  }

  // ── Interaction ───────────────────────────────────────────────────────────
  function handleCellClick(e) {
    var cells = boardEl.querySelectorAll('.cb-cell');
    cells.forEach(function (c) { c.classList.remove('cb-selected'); });
    e.currentTarget.classList.add('cb-selected');
    selectedCell = parseInt(e.currentTarget.dataset.idx, 10);
    submitBtn.disabled = false;
  }

  function handleSubmit() {
    // Part 4 — wired up in the next part
  }

  // ── Level data fetch ──────────────────────────────────────────────────────
  function loadLevels(callback) {
    fetch('assets/data/colorblind-levels.json')
      .then(function (r) { return r.json(); })
      .then(callback)
      .catch(function () { showScreen('error'); });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    loadingEl     = document.getElementById('cb-loading');
    errorEl       = document.getElementById('cb-error');
    gameEl        = document.getElementById('cb-game');
    boardEl       = document.getElementById('cb-board');
    levelLabelEl  = document.getElementById('cb-level-label');
    submitBtn     = document.getElementById('cb-submit');
    correctEl     = document.getElementById('cb-correct');
    incorrectEl   = document.getElementById('cb-incorrect');
    winEl         = document.getElementById('cb-win');
    nextLevelBtn  = document.getElementById('cb-next-level');
    tryAgainBtn   = document.getElementById('cb-try-again');
    playAgainBtn  = document.getElementById('cb-play-again');
    correctSubEl  = document.getElementById('cb-correct-sub');

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () {
      openDirections(DIRECTIONS_TEXT);
    });

    submitBtn.addEventListener('click', handleSubmit);

    // Part 4 — overlay button handlers omitted intentionally

    showScreen('loading');

    loadLevels(function (data) {
      levels = data;
      currentIdx = 0;
      showScreen('game');
      renderLevel(levels[currentIdx]);
    });
  });

})();
