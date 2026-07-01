(function () {
  'use strict';

  var DIRECTIONS_TEXT = 'Recall shows you a color for five seconds. Study it. Then it disappears and you pick the closest match you can from a color picker. Three rounds, each scored out of 100 based on how close your pick is to the original. Perfect score is 300. The closer you look, the better you\'ll do.';
  var TOTAL_ROUNDS = 3;

  // ── Color utilities ───────────────────────────────────────────────────────────

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    var a = s * Math.min(l, 1 - l);
    function f(n) {
      var k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    }
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }

  function toHex(rgb) {
    return '#' + rgb.map(function (c) { return c.toString(16).padStart(2, '0'); }).join('');
  }

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function generateColor() {
    var h = Math.random() * 360;
    var s = 45 + Math.random() * 40;  // 45–85%
    var l = 25 + Math.random() * 45;  // 25–70%
    var rgb = hslToRgb(h, s, l);
    return { hex: toHex(rgb), h: Math.round(h), s: Math.round(s), l: Math.round(l) };
  }

  function scoreAccuracy(shownHex, pickedHex) {
    var a = hexToRgb(shownHex);
    var b = hexToRgb(pickedHex);
    var maxDist = Math.sqrt(255 * 255 + 255 * 255 + 255 * 255);
    var dist = Math.sqrt(
      (a[0] - b[0]) * (a[0] - b[0]) +
      (a[1] - b[1]) * (a[1] - b[1]) +
      (a[2] - b[2]) * (a[2] - b[2])
    );
    return Math.round((1 - dist / maxDist) * 100);
  }

  // ── Game state ────────────────────────────────────────────────────────────────

  var rounds = [];        // [{color, picked, score}]
  var currentRound = 0;  // 0-indexed
  var countdownTimer = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────────

  var splashEl, startBtn,
      showEl, showLabel, colorBlock, countdownEl,
      pickEl, pickLabel, colorInput, submitBtn,
      resultEl, roundScoreEl, originalSwatch, pickedSwatch, nextBtn,
      endEl, totalScoreEl, endRoundsEl, roundScoresEl, shareBtn, againBtn;

  // ── Phase helpers ─────────────────────────────────────────────────────────────

  function hideAll() {
    [splashEl, showEl, pickEl, resultEl, endEl].forEach(function (el) {
      el.classList.add('rc-hide');
    });
  }

  function startSession() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    rounds = [];
    for (var i = 0; i < TOTAL_ROUNDS; i++) {
      rounds.push({ color: generateColor(), picked: null, score: null });
    }
    currentRound = 0;
    startShowPhase();
  }

  function startShowPhase() {
    hideAll();
    var round = rounds[currentRound];
    var num = currentRound + 1;
    showLabel.textContent = 'Round ' + num + ' of ' + TOTAL_ROUNDS;
    colorBlock.style.backgroundColor = round.color.hex;
    countdownEl.textContent = '5';
    showEl.classList.remove('rc-hide');

    var count = 5;
    countdownTimer = setInterval(function () {
      count--;
      if (count > 0) {
        countdownEl.textContent = count;
      } else {
        clearInterval(countdownTimer);
        countdownTimer = null;
        startPickPhase();
      }
    }, 1000);
  }

  function startPickPhase() {
    hideAll();
    var num = currentRound + 1;
    pickLabel.textContent = 'Round ' + num + ' of ' + TOTAL_ROUNDS;
    colorInput.value = '#808080';
    pickEl.classList.remove('rc-hide');
  }

  function submitPick() {
    var round = rounds[currentRound];
    round.picked = colorInput.value;
    round.score  = scoreAccuracy(round.color.hex, round.picked);
    showResult();
  }

  function showResult() {
    hideAll();
    var round = rounds[currentRound];
    var num   = currentRound + 1;
    roundScoreEl.textContent = 'Round ' + num + ': ' + round.score + ' / 100';
    originalSwatch.style.backgroundColor = round.color.hex;
    pickedSwatch.style.backgroundColor   = round.picked;
    nextBtn.textContent = (currentRound < TOTAL_ROUNDS - 1) ? 'Next Round' : 'See Final Score';
    resultEl.classList.remove('rc-hide');
  }

  function advanceRound() {
    currentRound++;
    if (currentRound < TOTAL_ROUNDS) {
      startShowPhase();
    } else {
      showEnd();
    }
  }

  function showEnd() {
    hideAll();
    var total = rounds.reduce(function (sum, r) { return sum + r.score; }, 0);
    totalScoreEl.textContent = 'Total: ' + total + ' / 300';

    roundScoresEl.textContent = rounds.map(function (r, i) {
      return 'Round ' + (i + 1) + ': ' + r.score;
    }).join('  ·  ');

    endRoundsEl.innerHTML = '';
    rounds.forEach(function (r, i) {
      var pair = document.createElement('div');
      pair.className = 'rc-end-pair';
      pair.innerHTML =
        '<p class="rc-end-round-label">Round ' + (i + 1) + '</p>' +
        '<div class="rc-end-swatches">' +
          '<div class="rc-end-swatch">' +
            '<div class="rc-swatch-box" style="background:' + r.color.hex + '"></div>' +
            '<p class="rc-swatch-label">Original</p>' +
          '</div>' +
          '<div class="rc-end-swatch">' +
            '<div class="rc-swatch-box" style="background:' + r.picked + '"></div>' +
            '<p class="rc-swatch-label">Your Pick</p>' +
          '</div>' +
        '</div>';
      endRoundsEl.appendChild(pair);
    });

    endEl.classList.remove('rc-hide');
  }

  // ── DOM bootstrap ─────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    splashEl       = document.getElementById('rc-splash');
    startBtn       = document.getElementById('rc-start-btn');
    showEl         = document.getElementById('rc-show');
    showLabel      = document.getElementById('rc-show-label');
    colorBlock     = document.getElementById('rc-color-block');
    countdownEl    = document.getElementById('rc-countdown');
    pickEl         = document.getElementById('rc-pick');
    pickLabel      = document.getElementById('rc-pick-label');
    colorInput     = document.getElementById('rc-color-input');
    submitBtn      = document.getElementById('rc-submit-btn');
    resultEl       = document.getElementById('rc-result');
    roundScoreEl   = document.getElementById('rc-round-score');
    originalSwatch = document.getElementById('rc-original-swatch');
    pickedSwatch   = document.getElementById('rc-picked-swatch');
    nextBtn        = document.getElementById('rc-next-btn');
    endEl          = document.getElementById('rc-end');
    totalScoreEl   = document.getElementById('rc-total-score');
    endRoundsEl    = document.getElementById('rc-end-rounds');
    roundScoresEl  = document.getElementById('rc-round-scores');
    shareBtn       = document.getElementById('rc-share-btn');
    againBtn       = document.getElementById('rc-again-btn');

    var dirEl = document.getElementById('rc-directions');
    if (dirEl) dirEl.textContent = DIRECTIONS_TEXT;

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });

    startBtn.addEventListener('click', startSession);
    submitBtn.addEventListener('click', submitPick);
    nextBtn.addEventListener('click', advanceRound);

    shareBtn.addEventListener('click', function () {
      var total = rounds.reduce(function (sum, r) { return sum + r.score; }, 0);
      var scores = rounds.map(function (r, i) { return 'R' + (i + 1) + ':' + r.score; }).join(' ');
      shareText(
        'Recall — scored ' + total + '/300. How well do you remember color? https://www.thebunnygame.com/recall',
        'Recall — Bunny Game'
      );
    });

    againBtn.addEventListener('click', startSession);
  });

  // ── Exports ───────────────────────────────────────────────────────────────────

  window.Recall = {
    generateColor: generateColor,
    scoreAccuracy: scoreAccuracy,
    hexToRgb:      hexToRgb,
  };

}());
