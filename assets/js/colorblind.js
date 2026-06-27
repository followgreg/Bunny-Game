(function () {
  'use strict';

  var LS_KEY = 'colorblind_highestLevel';

  var DIRECTIONS_TEXT =
    'One square in the grid is a slightly different shade from all the others. ' +
    'Select the one you think is the odd one out, then tap Submit. ' +
    'You only get one chance per attempt — if you\'re wrong, the board stays ' +
    'unchanged so you can look again. ' +
    'The differences get harder to spot as you progress through all 100 levels.';

  var SHARE_MSG =
    'Color Blind — found the odd one out, all 100 times. ' +
    'https://www.thebunnygame.com/color-blind';

  // ── State ─────────────────────────────────────────────────────────────────
  var levels       = null;
  var currentIdx   = 0;
  var selectedCell = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var loadingEl, errorEl, startEl, gameEl, winEl;
  var boardEl, levelLabelEl, submitBtn;
  var correctEl, correctSubEl, incorrectEl;
  var nextLevelBtn, tryAgainBtn, startBtnsEl, playAgainBtn, shareBtnEl;

  // ── Screen / overlay helpers ──────────────────────────────────────────────
  var ALL_SCREENS = ['cb-loading', 'cb-error', 'cb-start', 'cb-game', 'cb-win'];

  function showScreen(id) {
    ALL_SCREENS.forEach(function (sid) {
      document.getElementById(sid).classList.add('cb-hide');
    });
    hideOverlays();
    document.getElementById(id).classList.remove('cb-hide');
  }

  function showOverlay(id) {
    correctEl.classList.add('cb-hide');
    incorrectEl.classList.add('cb-hide');
    document.getElementById(id).classList.remove('cb-hide');
  }

  function hideOverlays() {
    if (correctEl)   correctEl.classList.add('cb-hide');
    if (incorrectEl) incorrectEl.classList.add('cb-hide');
  }

  // ── Progress ──────────────────────────────────────────────────────────────
  function getHighest() {
    return parseInt(localStorage.getItem(LS_KEY) || '0', 10);
  }

  function saveProgress(level) {
    if (level > getHighest()) localStorage.setItem(LS_KEY, String(level));
  }

  // ── Board rendering ───────────────────────────────────────────────────────
  function renderLevel(levelData) {
    var size  = levelData.boardSize;
    var total = size * size;

    selectedCell = null;
    submitBtn.disabled = true;
    hideOverlays();

    levelLabelEl.textContent = 'Level ' + levelData.level + ' of 100';
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

  // ── Cell selection ────────────────────────────────────────────────────────
  function handleCellClick(e) {
    boardEl.querySelectorAll('.cb-cell').forEach(function (c) {
      c.classList.remove('cb-selected');
    });
    e.currentTarget.classList.add('cb-selected');
    selectedCell = parseInt(e.currentTarget.dataset.idx, 10);
    submitBtn.disabled = false;
  }

  function clearSelection() {
    boardEl.querySelectorAll('.cb-cell').forEach(function (c) {
      c.classList.remove('cb-selected');
    });
    selectedCell = null;
    submitBtn.disabled = true;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  function handleSubmit() {
    if (selectedCell === null) return;

    var levelData = levels[currentIdx];

    if (selectedCell === levelData.oddCellIndex) {
      saveProgress(levelData.level);
      correctSubEl.textContent = 'Level ' + levelData.level + ' cleared.';
      setTimeout(function () { showOverlay('cb-correct'); }, 350);
    } else {
      setTimeout(function () { showOverlay('cb-incorrect'); }, 200);
    }
  }

  // ── Start screen ──────────────────────────────────────────────────────────
  function buildStartBtns(highestLevel) {
    startBtnsEl.innerHTML = '';

    var continueBtn = document.createElement('button');
    continueBtn.className = 'cb-btn-primary';
    continueBtn.textContent = 'Continue from Level ' + (highestLevel + 1);
    continueBtn.addEventListener('click', function () {
      currentIdx = highestLevel; // highestLevel = last completed (1-based) → index = highestLevel
      showScreen('cb-game');
      renderLevel(levels[currentIdx]);
    });

    var restartBtn = document.createElement('button');
    restartBtn.className = 'cb-btn-ghost';
    restartBtn.textContent = 'Start from Level 1';
    restartBtn.addEventListener('click', function () {
      currentIdx = 0;
      showScreen('cb-game');
      renderLevel(levels[currentIdx]);
    });

    startBtnsEl.appendChild(continueBtn);
    startBtnsEl.appendChild(restartBtn);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    loadingEl    = document.getElementById('cb-loading');
    errorEl      = document.getElementById('cb-error');
    startEl      = document.getElementById('cb-start');
    gameEl       = document.getElementById('cb-game');
    winEl        = document.getElementById('cb-win');
    boardEl      = document.getElementById('cb-board');
    levelLabelEl = document.getElementById('cb-level-label');
    submitBtn    = document.getElementById('cb-submit');
    correctEl    = document.getElementById('cb-correct');
    correctSubEl = document.getElementById('cb-correct-sub');
    incorrectEl  = document.getElementById('cb-incorrect');
    nextLevelBtn = document.getElementById('cb-next-level');
    tryAgainBtn  = document.getElementById('cb-try-again');
    startBtnsEl  = document.getElementById('cb-start-btns');
    playAgainBtn = document.getElementById('cb-play-again');
    shareBtnEl   = document.getElementById('cb-share');

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () {
      openDirections(DIRECTIONS_TEXT);
    });

    submitBtn.addEventListener('click', handleSubmit);

    nextLevelBtn.addEventListener('click', function () {
      if (currentIdx >= levels.length - 1) {
        showScreen('cb-win');
      } else {
        currentIdx++;
        showScreen('cb-game');
        renderLevel(levels[currentIdx]);
      }
    });

    tryAgainBtn.addEventListener('click', function () {
      hideOverlays();
      clearSelection();
    });

    playAgainBtn.addEventListener('click', function () {
      currentIdx = 0;
      showScreen('cb-game');
      renderLevel(levels[currentIdx]);
    });

    shareBtnEl.addEventListener('click', function () {
      shareText(SHARE_MSG, 'Color Blind');
    });

    showScreen('cb-loading');

    fetch('assets/data/colorblind-levels.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        levels = data;
        var highest = getHighest();
        if (highest >= levels.length) {
          // All 100 already beaten — go straight to win screen
          showScreen('cb-win');
        } else if (highest > 0) {
          buildStartBtns(highest);
          showScreen('cb-start');
        } else {
          currentIdx = 0;
          showScreen('cb-game');
          renderLevel(levels[currentIdx]);
        }
      })
      .catch(function () { showScreen('cb-error'); });
  });

})();
