(function () {
  'use strict';

  var DIRECTIONS_TEXT = 'A school logo sweeps past in a narrow strip, over and over. Watch closely and name the school before you decide — you’ve got four choices. Get it right and the next logo appears. Get it wrong and your streak ends. This is fan-made trivia, not affiliated with or endorsed by the NCAA or any school. How many can you name?';

  var LS_KEY   = 'mascotWave_bestStreak';
  var LOGO_BASE = 'https://ncaa-api.henrygd.me/logo/';

  var schools      = [];
  var shuffledOrder = [];
  var currentIndex = 0;
  var streak       = 0;
  var bestStreak   = 0;
  var locked       = false;

  // DOM refs
  var loadingEl, gameEl, endEl, winEl;
  var infoEl, logoWrapEl, logoRevealEl, logoImgEl, optionsEl;
  var streakDisplayEl, revealTextEl, shareEl, playAgainEl;
  var winSubEl, winShareEl, winPlayAgainEl;

  document.addEventListener('DOMContentLoaded', function () {
    loadingEl       = document.getElementById('mw-loading');
    gameEl          = document.getElementById('mw-game');
    endEl           = document.getElementById('mw-end');
    winEl           = document.getElementById('mw-win');
    infoEl          = document.getElementById('mw-info');
    logoWrapEl      = document.getElementById('mw-logo-wrap') || document.querySelector('.mw-logo-wrap');
    logoRevealEl    = document.getElementById('mw-logo-reveal');
    logoImgEl       = document.getElementById('mw-logo-img');
    optionsEl       = document.getElementById('mw-options');
    streakDisplayEl = document.getElementById('mw-streak-display');
    revealTextEl    = document.getElementById('mw-reveal-text');
    shareEl         = document.getElementById('mw-share');
    playAgainEl     = document.getElementById('mw-play-again');
    winSubEl        = document.getElementById('mw-win-sub');
    winShareEl      = document.getElementById('mw-win-share');
    winPlayAgainEl  = document.getElementById('mw-win-play-again');

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) {
      helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });
    }

    playAgainEl.addEventListener('click', startRun);
    winPlayAgainEl.addEventListener('click', startRun);

    bestStreak = parseInt(localStorage.getItem(LS_KEY) || '0', 10);

    setState('loading');
    fetch('/assets/data/schools.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        schools = data;
        startRun();
      })
      .catch(function () {
        var t = loadingEl.querySelector('.mw-loading-text');
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
    if (show) el.classList.remove('mw-hide');
    else      el.classList.add('mw-hide');
  }

  // ── Run management ─────────────────────────────────────────────────────────

  function startRun() {
    shuffledOrder = fisherYates(schools.length);
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
    if (currentIndex >= schools.length) {
      showWin();
      return;
    }

    var correct = schools[shuffledOrder[currentIndex]];
    var options = buildOptions(correct);

    infoEl.textContent = 'Streak: ' + streak + ' · Best: ' + bestStreak;

    // Load logo — restart sweep from left edge
    logoImgEl.src = LOGO_BASE + correct.slug + '.svg?dark=true';
    logoImgEl.onload  = null;
    logoImgEl.onerror = function () { handleLogoError(); };
    restartSweep();

    // Render answer buttons
    optionsEl.innerHTML = '';
    locked = false;
    options.forEach(function (school) {
      var btn = document.createElement('button');
      btn.className    = 'mw-option';
      btn.dataset.slug = school.slug;
      btn.textContent  = school.name;
      btn.addEventListener('click', function () {
        if (locked) return;
        handleGuess(school, correct);
      });
      optionsEl.appendChild(btn);
    });
  }

  function buildOptions(correct) {
    var used    = {};
    used[shuffledOrder[currentIndex]] = true;
    var options = [correct];

    while (options.length < 4) {
      var idx = Math.floor(Math.random() * schools.length);
      if (!used[idx]) {
        used[idx] = true;
        options.push(schools[idx]);
      }
    }

    for (var i = options.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = options[i]; options[i] = options[j]; options[j] = t;
    }

    return options;
  }

  // ── Logo load error — skip this school silently ───────────────────────────

  function handleLogoError() {
    stopSweep();
    locked = true;
    // Disable all buttons and show skip message
    var btns = optionsEl.querySelectorAll('.mw-option');
    btns.forEach(function (b) { b.disabled = true; });
    infoEl.textContent = 'Logo unavailable, skipping…';
    setTimeout(function () {
      currentIndex++;
      locked = false;
      loadRound();
    }, 900);
  }

  // ── Guess handling ─────────────────────────────────────────────────────────

  function handleGuess(chosen, correct) {
    locked = true;
    var isCorrect = chosen.slug === correct.slug;

    var btns = optionsEl.querySelectorAll('.mw-option');
    btns.forEach(function (btn) {
      btn.disabled = true;
      var slug = btn.dataset.slug;
      if (slug === correct.slug) {
        btn.classList.add('mw-opt-correct');
      } else if (!isCorrect && slug === chosen.slug) {
        btn.classList.add('mw-opt-wrong');
      } else if (!isCorrect) {
        btn.classList.add('mw-opt-dim');
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

    var msg = 'Mascot Wave — streak of ' + streak + '. Think you know college mascots better? https://www.thebunnygame.com/mascot-wave';
    shareEl.onclick = function () { shareText(msg, 'Mascot Wave'); };

    setState('end');
  }

  function showWin() {
    stopSweep();
    updateBest();

    winSubEl.textContent = 'Every school. Zero misses. Streak: ' + streak;

    var msg = 'Mascot Wave — named every school’s mascot. Zero misses. https://www.thebunnygame.com/mascot-wave';
    winShareEl.onclick = function () { shareText(msg, 'Mascot Wave'); };

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
    logoRevealEl.classList.remove('mw-sweeping');
    void logoRevealEl.offsetWidth; // force reflow so animation restarts at 0%
    logoRevealEl.classList.add('mw-sweeping');
  }

  function stopSweep() {
    logoRevealEl.classList.remove('mw-sweeping');
  }

})();
