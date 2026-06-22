'use strict';

var ICONS      = ['blue-bunny', 'red-bunny', 'mushroom', 'cabbage', 'carrot'];
var BG_COLORS  = ['#3b82f6', '#ef4444', '#a855f7', '#22c55e', '#f97316'];
var BOARD_GAP  = 8;
var LS_KEY     = 'whiskers_bestRound';

// 18 entries: six 2×2, six 4×4, six 6×6
var PROGRESSION = [
  { grid: 2, pairs: 2,  revealMs: 5000 },  // round 1
  { grid: 2, pairs: 2,  revealMs: 4000 },  // round 2
  { grid: 2, pairs: 2,  revealMs: 3000 },  // round 3
  { grid: 2, pairs: 2,  revealMs: 2000 },  // round 4
  { grid: 2, pairs: 2,  revealMs: 1500 },  // round 5
  { grid: 2, pairs: 2,  revealMs: 1000 },  // round 6
  { grid: 4, pairs: 8,  revealMs: 3000 },  // round 7
  { grid: 4, pairs: 8,  revealMs: 2500 },  // round 8
  { grid: 4, pairs: 8,  revealMs: 2000 },  // round 9
  { grid: 4, pairs: 8,  revealMs: 1500 },  // round 10
  { grid: 4, pairs: 8,  revealMs: 1000 },  // round 11
  { grid: 4, pairs: 8,  revealMs: 800  },  // round 12
  { grid: 6, pairs: 18, revealMs: 2000 },  // round 13
  { grid: 6, pairs: 18, revealMs: 1600 },  // round 14
  { grid: 6, pairs: 18, revealMs: 1200 },  // round 15
  { grid: 6, pairs: 18, revealMs: 900  },  // round 16
  { grid: 6, pairs: 18, revealMs: 700  },  // round 17
  { grid: 6, pairs: 18, revealMs: 500  },  // round 18
];

// DOM refs
var boardEl, hudRoundEl, hudBestEl, revealLabelEl, revealBarFillEl, statusEl;
var gameEl, startEl, endEl, endHeadlineEl, endSubEl, wrongFlashEl;
var countdownEl, countdownNumEl;
var overlayClearEl, overlayRoundEl, overlayRoundNumEl;

// State
var currentRound  = 1;
var bestRound     = 0;
var gameState     = 'idle';
var cards         = [];
var firstSelected = null;
var pairsFound    = 0;
var totalPairs    = 0;
var timers        = [];

// ── Utilities ──────────────────────────────────────────────────────────────

function clearTimers() {
  for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
  timers = [];
}

function after(ms, fn) {
  var id = setTimeout(fn, ms);
  timers.push(id);
}

function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function comboFromId(id) {
  return { icon: ICONS[Math.floor(id / 5)], bg: BG_COLORS[id % 5] };
}

function generateCardIds(pairs) {
  var ids = [];
  for (var i = 0; i < 25; i++) ids.push(i);
  var selected = shuffle(ids).slice(0, pairs);
  return shuffle(selected.concat(selected.slice()));
}

function getCardSize(grid) {
  var avail = Math.min(window.innerWidth, 480) - 24;
  var size  = (avail - BOARD_GAP * (grid - 1)) / grid;
  if (grid === 2) size = Math.min(size, 140);
  if (grid === 4) size = Math.min(size, 100);
  if (grid === 6) size = Math.min(size, 64);
  return Math.floor(size);
}

// ── Board ──────────────────────────────────────────────────────────────────

function buildBoard(comboIds, grid) {
  var size = getCardSize(grid);
  boardEl.innerHTML = '';
  boardEl.style.gridTemplateColumns = 'repeat(' + grid + ', ' + size + 'px)';
  boardEl.style.gap = BOARD_GAP + 'px';
  cards = [];

  for (var i = 0; i < comboIds.length; i++) {
    var combo  = comboFromId(comboIds[i]);
    var cardEl = document.createElement('div');
    cardEl.className = 'wh-card';
    cardEl.style.width  = size + 'px';
    cardEl.style.height = size + 'px';

    var inner = document.createElement('div');
    inner.className = 'wh-card-inner';

    var back = document.createElement('div');
    back.className = 'wh-card-back';
    var backImg = document.createElement('img');
    backImg.src = 'Icons/BunnyGameLogo.svg';
    backImg.alt = '';
    back.appendChild(backImg);

    var front = document.createElement('div');
    front.className = 'wh-card-front';
    front.style.background = combo.bg;
    var frontImg = document.createElement('img');
    frontImg.src = 'assets/icons/' + combo.icon + '.svg';
    frontImg.alt = combo.icon;
    front.appendChild(frontImg);

    inner.appendChild(back);
    inner.appendChild(front);
    cardEl.appendChild(inner);
    boardEl.appendChild(cardEl);

    (function(el, idx) {
      el.addEventListener('click', function() { onCardClick(idx); });
    })(cardEl, i);

    cards.push({ el: cardEl, comboId: comboIds[i], matched: false, flipped: false });
  }
}

// ── Card helpers ───────────────────────────────────────────────────────────

function setAllFaceUp(faceUp) {
  for (var i = 0; i < cards.length; i++) {
    if (!cards[i].matched) {
      if (faceUp) cards[i].el.classList.add('wh-face-up');
      else        cards[i].el.classList.remove('wh-face-up');
    }
  }
}

// ── Countdown ─────────────────────────────────────────────────────────────

function showCountdown(n, onDone) {
  if (n <= 0) {
    countdownEl.classList.add('wh-hide');
    onDone();
    return;
  }
  countdownEl.classList.remove('wh-hide');
  // clone to re-trigger CSS animation each tick
  var old   = countdownNumEl;
  var fresh = old.cloneNode(false);
  fresh.textContent = n;
  old.parentNode.replaceChild(fresh, old);
  countdownNumEl = fresh;
  after(1000, function() { showCountdown(n - 1, onDone); });
}

// ── Reveal phase ───────────────────────────────────────────────────────────

function startReveal(revealMs) {
  gameState = 'revealing';
  statusEl.textContent = '';
  revealLabelEl.classList.remove('wh-hide');
  setAllFaceUp(true);

  revealBarFillEl.style.transition = 'none';
  revealBarFillEl.style.width = '100%';
  revealBarFillEl.getBoundingClientRect(); // force reflow
  revealBarFillEl.style.transition = 'width ' + revealMs + 'ms linear';
  revealBarFillEl.style.width = '0%';

  after(revealMs, function() {
    revealLabelEl.classList.add('wh-hide');
    revealBarFillEl.style.transition = 'none';
    revealBarFillEl.style.width = '0%';
    setAllFaceUp(false);
    after(360, startSelection);
  });
}

// ── Selection phase ────────────────────────────────────────────────────────

function startSelection() {
  gameState = 'selecting';
  firstSelected = null;
  updateStatus();
}

function updateStatus() {
  var left = totalPairs - pairsFound;
  statusEl.textContent = left === totalPairs
    ? 'Find the pairs'
    : left + ' pair' + (left === 1 ? '' : 's') + ' left';
}

function onCardClick(idx) {
  if (gameState !== 'selecting') return;
  var card = cards[idx];
  if (card.matched || card.flipped) return;

  card.flipped = true;
  card.el.classList.add('wh-face-up');

  if (firstSelected === null) {
    // First pick — highlight as selected
    card.el.classList.add('wh-selected');
    firstSelected = idx;
    return;
  }

  // Second pick — remove selected highlight from first card
  gameState = 'checking';
  var first = cards[firstSelected];
  first.el.classList.remove('wh-selected');

  if (first.comboId === card.comboId && firstSelected !== idx) {
    // ── Correct match ──
    // Mark immediately so no further clicks land on these cards
    first.matched = true;
    card.matched  = true;
    first.flipped = false;
    card.flipped  = false;
    firstSelected = null;

    // Brief green flash, then disappear (keeping grid gap)
    first.el.classList.add('wh-match-flash');
    card.el.classList.add('wh-match-flash');

    after(450, function() {
      first.el.classList.add('wh-matched');
      card.el.classList.add('wh-matched');
      pairsFound++;

      if (pairsFound >= totalPairs) {
        after(150, onRoundComplete);
      } else {
        updateStatus();
        gameState = 'selecting';
      }
    });

  } else {
    // ── Wrong match ──
    // Both are face-up; show red feedback, then flip both back down, then end run
    first.el.classList.add('wh-wrong');
    card.el.classList.add('wh-wrong');
    wrongFlashEl.classList.add('wh-flashing');

    after(600, function() {
      // Flip both face-down
      first.el.classList.remove('wh-face-up', 'wh-wrong');
      card.el.classList.remove('wh-face-up', 'wh-wrong');
      first.flipped = false;
      card.flipped  = false;
      // Wait for flip animation to complete, then show end
      after(360, function() {
        wrongFlashEl.classList.remove('wh-flashing');
        showEnd(false);
      });
    });
  }
}

// ── Round flow ─────────────────────────────────────────────────────────────

function onRoundComplete() {
  clearTimers();
  gameState = 'transition';

  // Screen 1 — Board Cleared! (1.5s)
  overlayClearEl.classList.remove('wh-hide');

  after(1500, function() {
    overlayClearEl.classList.add('wh-hide');

    // Last round completed — go straight to win screen
    if (currentRound >= PROGRESSION.length) {
      showEnd(true);
      return;
    }

    // Advance round counter
    currentRound++;
    updateHud();

    // Screen 2 — Round X title card (1.75s)
    overlayRoundNumEl.textContent = currentRound;
    overlayRoundEl.classList.remove('wh-hide');

    after(1750, function() {
      overlayRoundEl.classList.add('wh-hide');
      startRound();
    });
  });
}

function startRound() {
  clearTimers();
  var prog = PROGRESSION[currentRound - 1];
  console.log('WHISKers round', currentRound, '— grid:', prog.grid + 'x' + prog.grid, '— reveal:', prog.revealMs + 'ms');

  firstSelected = null;
  pairsFound    = 0;
  totalPairs    = prog.pairs;
  statusEl.textContent = '';
  revealLabelEl.classList.add('wh-hide');
  revealBarFillEl.style.transition = 'none';
  revealBarFillEl.style.width = '0%';

  updateHud();

  var comboIds = generateCardIds(prog.pairs);
  buildBoard(comboIds, prog.grid);

  gameState = 'countdown';
  showCountdown(3, function() { startReveal(prog.revealMs); });
}

function updateHud() {
  hudRoundEl.textContent = 'Round ' + currentRound;
  hudBestEl.textContent  = 'Best: ' + bestRound;
}

// ── End screen ─────────────────────────────────────────────────────────────

function showEnd(won) {
  clearTimers();
  gameState = 'gameover';

  var roundsCleared = won ? PROGRESSION.length : currentRound - 1;
  if (roundsCleared > bestRound) {
    bestRound = roundsCleared;
    try { localStorage.setItem(LS_KEY, bestRound); } catch(e) {}
  }

  gameEl.classList.add('wh-hide');
  endEl.classList.remove('wh-hide');

  if (won) {
    endHeadlineEl.textContent = 'Perfect Run!';
    endSubEl.innerHTML = 'You cleared all 18 rounds.<br>Unreal memory.';
  } else if (roundsCleared === 0) {
    endHeadlineEl.textContent = 'Round 1';
    endSubEl.innerHTML = "Wrong match on the first try.<br>You'll get it!";
  } else if (roundsCleared === 1) {
    endHeadlineEl.textContent = '1 Round';
    endSubEl.innerHTML = 'One round cleared.<br>Can you beat that?';
  } else {
    endHeadlineEl.textContent = roundsCleared + ' Rounds';
    endSubEl.innerHTML = 'You cleared ' + roundsCleared + ' rounds in a row.<br>Can you beat that?';
  }
}

// ── Start ─────────────────────────────────────────────────────────────────

function startGame() {
  currentRound = 1;
  startEl.classList.add('wh-hide');
  endEl.classList.add('wh-hide');
  gameEl.classList.remove('wh-hide');
  startRound();
}

// ── Init ──────────────────────────────────────────────────────────────────

function init() {
  boardEl          = document.getElementById('wh-board');
  hudRoundEl       = document.getElementById('wh-round');
  hudBestEl        = document.getElementById('wh-best');
  revealLabelEl    = document.getElementById('wh-reveal-label');
  revealBarFillEl  = document.getElementById('wh-reveal-bar-fill');
  statusEl         = document.getElementById('wh-status');
  gameEl           = document.getElementById('wh-game');
  startEl          = document.getElementById('wh-start');
  endEl            = document.getElementById('wh-end');
  endHeadlineEl    = document.getElementById('wh-end-headline');
  endSubEl         = document.getElementById('wh-end-sub');
  wrongFlashEl     = document.getElementById('wh-wrong-flash');
  countdownEl      = document.getElementById('wh-countdown');
  countdownNumEl   = document.getElementById('wh-countdown-num');
  overlayClearEl   = document.getElementById('wh-overlay-clear');
  overlayRoundEl   = document.getElementById('wh-overlay-round');
  overlayRoundNumEl = document.getElementById('wh-overlay-round-num');

  try { bestRound = parseInt(localStorage.getItem(LS_KEY)) || 0; } catch(e) {}

  document.getElementById('wh-start-btn').addEventListener('click', startGame);
  document.getElementById('wh-play-again-btn').addEventListener('click', startGame);

  document.getElementById('wh-share-btn').addEventListener('click', function() {
    var text = bestRound >= PROGRESSION.length
      ? 'I got a perfect run on WHISKers — all 18 rounds! 🐰🧠 thebunnygame.com/whiskers'
      : bestRound === 0
        ? 'I just tried WHISKers — a speed memory game! 🐰🧠 thebunnygame.com/whiskers'
        : 'I cleared ' + bestRound + ' round' + (bestRound === 1 ? '' : 's') + ' on WHISKers! Can you beat me? 🐰🧠 thebunnygame.com/whiskers';
    shareText(text, 'WHISKers — Bunny Game');
  });

  var helpBtn = document.getElementById('help-btn');
  if (helpBtn) {
    helpBtn.addEventListener('click', function() {
      var el = document.getElementById('directions-text');
      if (el) el.innerHTML =
        'All cards are briefly revealed — memorize the pairs.<br><br>' +
        'After they flip face-down, tap to match them.<br><br>' +
        'One wrong match ends your run. How far can you get?';
      var overlay = document.getElementById('directions-overlay');
      if (overlay) overlay.classList.remove('hidden');
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
