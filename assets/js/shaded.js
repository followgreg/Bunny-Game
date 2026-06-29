(function () {
  'use strict';

  var DIRECTIONS_TEXT = 'Shaded gives you five bars, all the same color, all different shades. Drag them into order — lightest on one side, darkest on the other. The moment you\'ve got it right, you\'ll know. As you go, the shades get closer and closer together. By the end, you\'ll really need to look.';

  var LS_KEY = 'shaded_highestLevel';
  var N       = 5;
  var BAR_W   = 25;
  var BAR_GAP = 10;
  var SLOT_STEP = BAR_W + BAR_GAP;  // 35px per slot

  var levels        = null;
  var currentLevel  = 1;
  var highestLevel  = 0;  // highest level ever completed

  // ── Drag state ─────────────────────────────────────────────────────────────
  var dragging = false;
  var dragEl   = null;
  var ptrX0    = 0;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  var loadingEl, errorEl, startEl, startBtnsEl, gameEl, levelLabel, barsEl;
  var solvedEl, solvedSub, nextBtn, winEl, shareBtn, replayBtn, helpBtn;

  // ── Boot ───────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    loadingEl   = document.getElementById('sh-loading');
    errorEl     = document.getElementById('sh-error');
    startEl     = document.getElementById('sh-start');
    startBtnsEl = document.getElementById('sh-start-btns');
    gameEl      = document.getElementById('sh-game');
    levelLabel  = document.getElementById('sh-level-label');
    barsEl      = document.getElementById('sh-bars');
    solvedEl    = document.getElementById('sh-solved');
    solvedSub   = document.getElementById('sh-solved-sub');
    nextBtn     = document.getElementById('sh-next-btn');
    winEl       = document.getElementById('sh-win');
    shareBtn    = document.getElementById('sh-share-btn');
    replayBtn   = document.getElementById('sh-replay-btn');
    helpBtn     = document.getElementById('help-btn');

    helpBtn.addEventListener('click', function () {
      openDirections(DIRECTIONS_TEXT);
    });

    nextBtn.addEventListener('click', advanceLevel);

    shareBtn.addEventListener('click', function () {
      shareText(
        'Shaded — sorted fifty boards from lightest to darkest. https://www.thebunnygame.com/shaded',
        'Shaded — Bunny Game'
      );
    });

    replayBtn.addEventListener('click', function () {
      highestLevel = 0;
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      winEl.classList.add('sh-hide');
      currentLevel = 1;
      showGame();
    });

    highestLevel = parseInt(localStorage.getItem(LS_KEY) || '0', 10);
    if (isNaN(highestLevel) || highestLevel < 0) highestLevel = 0;

    fetch('assets/data/shaded-levels.json')
      .then(function (r) {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then(function (data) {
        levels = data;
        loadingEl.classList.add('sh-hide');

        if (highestLevel >= levels.length) {
          // Completed everything — show win screen directly
          winEl.classList.remove('sh-hide');
        } else if (highestLevel >= 1) {
          // Returning player — offer resume or restart
          showStartScreen();
        } else {
          // First visit — jump straight in
          currentLevel = 1;
          showGame();
        }
      })
      .catch(function () {
        loadingEl.classList.add('sh-hide');
        errorEl.classList.remove('sh-hide');
      });
  });

  // ── Start / resume screen ──────────────────────────────────────────────────

  function showStartScreen() {
    startBtnsEl.innerHTML = '';

    var continueBtn = document.createElement('button');
    continueBtn.className = 'sh-btn-primary';
    continueBtn.textContent = 'Continue from Level ' + (highestLevel + 1);
    continueBtn.addEventListener('click', function () {
      startEl.classList.add('sh-hide');
      currentLevel = highestLevel + 1;
      showGame();
    });

    var restartBtn = document.createElement('button');
    restartBtn.className = 'sh-btn-ghost';
    restartBtn.textContent = 'Start from Level 1';
    restartBtn.addEventListener('click', function () {
      startEl.classList.add('sh-hide');
      currentLevel = 1;
      showGame();
    });

    startBtnsEl.appendChild(continueBtn);
    startBtnsEl.appendChild(restartBtn);
    startEl.classList.remove('sh-hide');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function showGame() {
    solvedEl.classList.add('sh-hide');
    startEl.classList.add('sh-hide');
    winEl.classList.add('sh-hide');
    gameEl.classList.remove('sh-hide');

    var entry = levels[currentLevel - 1];
    levelLabel.textContent = 'Level ' + currentLevel + ' of ' + levels.length;

    barsEl.innerHTML = '';
    entry.shuffledOrder.forEach(function (hex) {
      var bar = document.createElement('div');
      bar.className = 'sh-bar';
      bar.style.backgroundColor = hex;
      bar.dataset.color = hex;
      bar.addEventListener('pointerdown', onPointerDown);
      barsEl.appendChild(bar);
    });
  }

  // ── Drag helpers ───────────────────────────────────────────────────────────

  function slotAtPointer(clientX) {
    var rect = barsEl.getBoundingClientRect();
    var x    = clientX - rect.left;
    var best = 0, bestDist = Infinity;
    for (var i = 0; i < N; i++) {
      var center = i * SLOT_STEP + BAR_W / 2;
      var d = Math.abs(x - center);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  function dragElSlot() {
    return Array.from(barsEl.children).indexOf(dragEl);
  }

  // ── Pointer events ─────────────────────────────────────────────────────────

  function onPointerDown(e) {
    if (dragging) return;
    if (!solvedEl.classList.contains('sh-hide')) return;

    e.preventDefault();
    dragging = true;
    dragEl   = e.currentTarget;
    ptrX0    = e.clientX;

    dragEl.setPointerCapture(e.pointerId);
    dragEl.addEventListener('pointermove', onPointerMove);
    dragEl.addEventListener('pointerup',   onPointerUp);
    dragEl.addEventListener('pointercancel', onPointerUp);

    dragEl.classList.add('sh-bar--dragging');
    dragEl.style.transform = 'scale(1.08)';
  }

  function onPointerMove(e) {
    if (!dragging) return;

    var dx   = e.clientX - ptrX0;
    dragEl.style.transform = 'translateX(' + dx + 'px) scale(1.08)';

    var target = slotAtPointer(e.clientX);
    var curr   = dragElSlot();

    if (target !== curr) {
      var children = Array.from(barsEl.children);
      if (target < curr) {
        barsEl.insertBefore(dragEl, children[target]);
      } else {
        var after = children[target].nextSibling;
        if (after) {
          barsEl.insertBefore(dragEl, after);
        } else {
          barsEl.appendChild(dragEl);
        }
      }
      ptrX0 += (target - curr) * SLOT_STEP;
      dx = e.clientX - ptrX0;
      dragEl.style.transform = 'translateX(' + dx + 'px) scale(1.08)';
    }
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;

    dragEl.removeEventListener('pointermove', onPointerMove);
    dragEl.removeEventListener('pointerup',   onPointerUp);
    dragEl.removeEventListener('pointercancel', onPointerUp);

    dragEl.classList.remove('sh-bar--dragging');
    dragEl.style.transition = 'transform 0.12s ease';
    dragEl.style.transform  = '';

    var dropped = dragEl;
    dragEl = null;

    setTimeout(function () {
      dropped.style.transition = '';
      checkWin();
    }, 120);
  }

  // ── Win detection ──────────────────────────────────────────────────────────

  function checkWin() {
    var entry = levels[currentLevel - 1];
    var bars  = Array.from(barsEl.children);
    var correct = bars.every(function (bar, i) {
      return bar.dataset.color === entry.correctOrder[i];
    });
    if (correct) triggerSuccess();
  }

  function triggerSuccess() {
    // Update highest level completed
    if (currentLevel > highestLevel) {
      highestLevel = currentLevel;
      try { localStorage.setItem(LS_KEY, String(highestLevel)); } catch (e) {}
    }

    // Brief flash, then show accomplishment overlay
    Array.from(barsEl.children).forEach(function (bar) {
      bar.classList.add('sh-bar--solved');
    });
    setTimeout(function () {
      Array.from(barsEl.children).forEach(function (bar) {
        bar.classList.remove('sh-bar--solved');
      });
      solvedSub.textContent = 'Level ' + currentLevel + ' complete!';
      solvedEl.classList.remove('sh-hide');
    }, 320);
  }

  // ── Level advance ──────────────────────────────────────────────────────────

  function advanceLevel() {
    solvedEl.classList.add('sh-hide');
    currentLevel++;
    if (currentLevel > levels.length) {
      gameEl.classList.add('sh-hide');
      winEl.classList.remove('sh-hide');
      return;
    }
    showGame();
  }

}());
