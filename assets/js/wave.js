(function () {
  'use strict';

  var DIRECTIONS_TEXT = 'A flag sweeps past in a narrow strip, over and over. Watch closely and name the country before you decide — you’ve got four choices. Get it right and the next flag appears. Get it wrong and your streak ends. Answer every flag in the world without a miss, and you’ve done something special. How far can you get?';

  var LS_KEY  = 'wave_bestStreak';
  var FLAG_URL = 'https://flagcdn.com/w320/';

  var countries    = [];
  var shuffledOrder = [];
  var currentIndex = 0;
  var streak       = 0;
  var bestStreak   = 0;
  var locked       = false;

  // DOM refs
  var loadingEl, gameEl, endEl, winEl;
  var infoEl, flagRevealEl, flagImgEl, optionsEl;
  var streakDisplayEl, revealTextEl, shareEl, playAgainEl;
  var winSubEl, winShareEl, winPlayAgainEl;

  document.addEventListener('DOMContentLoaded', function () {
    loadingEl       = document.getElementById('wv-loading');
    gameEl          = document.getElementById('wv-game');
    endEl           = document.getElementById('wv-end');
    winEl           = document.getElementById('wv-win');
    infoEl          = document.getElementById('wv-info');
    flagRevealEl    = document.getElementById('wv-flag-reveal');
    flagImgEl       = document.getElementById('wv-flag-img');
    optionsEl       = document.getElementById('wv-options');
    streakDisplayEl = document.getElementById('wv-streak-display');
    revealTextEl    = document.getElementById('wv-reveal-text');
    shareEl         = document.getElementById('wv-share');
    playAgainEl     = document.getElementById('wv-play-again');
    winSubEl        = document.getElementById('wv-win-sub');
    winShareEl      = document.getElementById('wv-win-share');
    winPlayAgainEl  = document.getElementById('wv-win-play-again');

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) {
      helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });
    }

    playAgainEl.addEventListener('click', startRun);
    winPlayAgainEl.addEventListener('click', startRun);

    bestStreak = parseInt(localStorage.getItem(LS_KEY) || '0', 10);

    setState('loading');
    fetch('/assets/data/capitals.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        countries = data;
        startRun();
      })
      .catch(function () {
        var t = loadingEl.querySelector('.wv-loading-text');
        if (t) t.textContent = 'Failed to load. Refresh to try again.';
      });
  });

  // ── State machine ─────────────────────────────────────────────────────────

  function setState(name) {
    toggle(loadingEl, name === 'loading');
    toggle(gameEl,    name === 'game');
    toggle(endEl,     name === 'end');
    toggle(winEl,     name === 'win');
  }

  function toggle(el, show) {
    if (!el) return;
    if (show) el.classList.remove('wv-hide');
    else      el.classList.add('wv-hide');
  }

  // ── Run management ─────────────────────────────────────────────────────────

  function startRun() {
    shuffledOrder = fisherYates(countries.length);
    currentIndex  = 0;
    streak        = 0;
    locked        = false;
    setState('game');
    loadRound();
  }

  function fisherYates(n) {
    var arr = [];
    for (var i = 0; i < n; i++) arr.push(i);
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ── Round ─────────────────────────────────────────────────────────────────

  function loadRound() {
    if (currentIndex >= countries.length) {
      showWin();
      return;
    }

    var correct = countries[shuffledOrder[currentIndex]];
    var options = buildOptions(correct);

    infoEl.textContent = 'Streak: ' + streak + ' · Best: ' + bestStreak;

    // Set flag image and restart sweep from left edge
    flagImgEl.src = FLAG_URL + correct.iso2 + '.png';
    restartSweep();

    // Render buttons
    optionsEl.innerHTML = '';
    locked = false;
    options.forEach(function (country) {
      var btn = document.createElement('button');
      btn.className        = 'wv-option';
      btn.dataset.iso2     = country.iso2;
      btn.textContent      = country.name;
      btn.addEventListener('click', function () {
        if (locked) return;
        handleGuess(country, correct);
      });
      optionsEl.appendChild(btn);
    });
  }

  function buildOptions(correct) {
    var used    = {};
    used[shuffledOrder[currentIndex]] = true;
    var options = [correct];

    while (options.length < 4) {
      var idx = Math.floor(Math.random() * countries.length);
      if (!used[idx]) {
        used[idx] = true;
        options.push(countries[idx]);
      }
    }

    // Shuffle the 4 options
    for (var i = options.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = options[i]; options[i] = options[j]; options[j] = t;
    }

    return options;
  }

  // ── Guess handling ─────────────────────────────────────────────────────────

  function handleGuess(chosen, correct) {
    locked = true;
    var isCorrect = chosen.iso2 === correct.iso2;

    var btns = optionsEl.querySelectorAll('.wv-option');
    btns.forEach(function (btn) {
      btn.disabled = true;
      var iso = btn.dataset.iso2;
      if (iso === correct.iso2) {
        btn.classList.add('wv-opt-correct');
      } else if (!isCorrect && iso === chosen.iso2) {
        btn.classList.add('wv-opt-wrong');
      } else if (!isCorrect) {
        btn.classList.add('wv-opt-dim');
      }
    });

    if (isCorrect) {
      streak++;
      currentIndex++;
      setTimeout(loadRound, 650);
    } else {
      setTimeout(function () { showEnd(correct); }, 850);
    }
  }

  // ── End / Win ─────────────────────────────────────────────────────────────

  function showEnd(correct) {
    stopSweep();
    updateBest();

    streakDisplayEl.innerHTML = '<strong>' + streak + '</strong>Streak';
    revealTextEl.textContent  = 'That one was ' + correct.name + '.';

    var msg = 'Wave — streak of ' + streak + '. Can you name more flags than that? https://www.thebunnygame.com/wave';
    shareEl.onclick = function () { shareText(msg, 'Wave'); };

    setState('end');
  }

  function showWin() {
    stopSweep();
    updateBest();

    winSubEl.textContent = 'Every flag. Zero misses. Streak: ' + streak;

    var msg = 'Wave — completed the world. Every flag, zero misses. https://www.thebunnygame.com/wave';
    winShareEl.onclick = function () { shareText(msg, 'Wave'); };

    setState('win');
  }

  function updateBest() {
    if (streak > bestStreak) {
      bestStreak = streak;
      try { localStorage.setItem(LS_KEY, String(bestStreak)); } catch (e) {}
    }
  }

  // ── Sweep animation ────────────────────────────────────────────────────────

  function restartSweep() {
    flagRevealEl.classList.remove('wv-sweeping');
    void flagRevealEl.offsetWidth; // force reflow so animation restarts at 0%
    flagRevealEl.classList.add('wv-sweeping');
  }

  function stopSweep() {
    flagRevealEl.classList.remove('wv-sweeping');
  }

})();
