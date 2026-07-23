// lexi.js -- Lexi vocabulary game

(function () {
  'use strict';

  const DIRECTIONS_TEXT = 'Lexi gives you a definition and four possible words. Only one means what the definition says. The others are real words chosen to deceive -- sharing roots, sounding similar, or belonging to the same field as the correct answer. Get it right and move on. Get it wrong and the run ends. Checkpoints save your progress every ten levels, so you won\'t have to start completely from scratch. One hundred levels, each more obscure than the last.';

  const SHARE_URL = 'https://www.thebunnygame.com/lexi';
  const LABELS = ['A', 'B', 'C', 'D'];

  // ── State ────────────────────────────────────────────────────────────────
  let questions = [];
  let currentLevel = 1;
  let checkpoint = 0;
  let gameState = 'IDLE'; // IDLE | PLAYING | RESULT | FAIL | WIN
  let currentQuestion = null;
  let currentOrder = []; // shuffled positions of [correct, d1, d2, d3]
  let tabSwitchOccurred = false;
  let failShareText = '';

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const splashEl       = document.getElementById('lexi-splash');
  const levelSelectEl  = document.getElementById('lexi-level-select');
  const failEl         = document.getElementById('lexi-fail');
  const winEl          = document.getElementById('lexi-win');
  const levelLabelEl   = document.getElementById('lexi-level-label');
  const checkpointEl   = document.getElementById('lexi-checkpoint-label');
  const definitionEl   = document.getElementById('lexi-definition');
  const answerBtns     = Array.from(document.querySelectorAll('.lexi-answer-btn'));

  // ── Init ─────────────────────────────────────────────────────────────────
  fetch('assets/data/lexi-questions.json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      questions = data;

      // Populate directions text
      document.getElementById('lexi-splash-text').textContent = DIRECTIONS_TEXT;
      var dirEl = document.getElementById('directions-text');
      if (dirEl) dirEl.textContent = DIRECTIONS_TEXT;

      // Wire help button
      document.getElementById('help-btn').addEventListener('click', function () {
        openDirections(DIRECTIONS_TEXT);
      });

      // Read stored progress
      checkpoint = parseInt(localStorage.getItem('lexi_checkpoint') || '0');
      var savedLevel = parseInt(localStorage.getItem('lexi_currentLevel') || '0');

      if (savedLevel > 1) {
        showLevelSelect(savedLevel);
      } else {
        showOverlay(splashEl);
      }
    });

  // ── Overlay helpers ───────────────────────────────────────────────────────
  function showOverlay(el) {
    [splashEl, levelSelectEl, failEl, winEl].forEach(function (o) {
      o.classList.add('hidden');
    });
    el.classList.remove('hidden');
  }

  function hideAllOverlays() {
    [splashEl, levelSelectEl, failEl, winEl].forEach(function (o) {
      o.classList.add('hidden');
    });
  }

  // ── Level select (resume prompt) ──────────────────────────────────────────
  function showLevelSelect(savedLevel) {
    document.getElementById('lexi-resume-sub').textContent =
      'You were on level ' + savedLevel + '. Pick up where you left off?';
    document.getElementById('lexi-continue-btn').textContent =
      'Continue from Level ' + savedLevel;
    document.getElementById('lexi-continue-btn').onclick = function () {
      hideAllOverlays();
      startLevel(savedLevel);
    };
    document.getElementById('lexi-from-start-btn').onclick = function () {
      hideAllOverlays();
      startLevel(1);
    };
    showOverlay(levelSelectEl);
  }

  // ── Splash ────────────────────────────────────────────────────────────────
  document.getElementById('lexi-splash-begin').addEventListener('click', function () {
    hideAllOverlays();
    startLevel(1);
  });

  // ── Game logic ────────────────────────────────────────────────────────────
  function getQuestion(level) {
    return questions.find(function (q) { return q.level === level; });
  }

  function getChoices(question) {
    // choices[0] is always the correct word; choices[1-3] are distractors
    return [question.correct].concat(question.distractors);
  }

  function shuffleOrder() {
    var arr = [0, 1, 2, 3];
    for (var i = 3; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function startLevel(level) {
    currentLevel = level;
    localStorage.setItem('lexi_currentLevel', level);
    gameState = 'PLAYING';
    currentQuestion = getQuestion(level);
    currentOrder = shuffleOrder();
    renderLevel();
  }

  function renderLevel() {
    // Info bar
    levelLabelEl.textContent = 'Level ' + currentLevel;
    checkpointEl.textContent = checkpoint > 0
      ? 'Checkpoint: Level ' + checkpoint
      : 'No checkpoint yet';

    // Definition
    definitionEl.textContent = currentQuestion.definition;

    // Answer buttons
    renderAnswerButtons();
  }

  function renderAnswerButtons() {
    var choices = getChoices(currentQuestion);
    answerBtns.forEach(function (btn, i) {
      var choiceIdx = currentOrder[i];
      btn.innerHTML =
        '<span class="lexi-btn-label">' + LABELS[i] + '</span>' +
        '<span class="lexi-btn-word">' + escapeHTML(choices[choiceIdx]) + '</span>';
      btn.dataset.choiceIdx = choiceIdx;
      btn.className = 'lexi-answer-btn';
      btn.disabled = false;
      btn.style.visibility = 'visible';
    });
  }

  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Answer click ──────────────────────────────────────────────────────────
  answerBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (gameState !== 'PLAYING') return;
      gameState = 'RESULT';
      answerBtns.forEach(function (b) { b.disabled = true; });

      var choiceIdx = parseInt(btn.dataset.choiceIdx);
      var isCorrect = choiceIdx === 0; // index 0 = correct word

      if (isCorrect) {
        btn.classList.add('lexi-correct');
        setTimeout(function () { advanceLevel(); }, 800);
      } else {
        btn.classList.add('lexi-wrong');
        // Reveal correct
        answerBtns.forEach(function (b) {
          if (parseInt(b.dataset.choiceIdx) === 0) b.classList.add('lexi-correct');
        });
        setTimeout(function () { showFail(); }, 1200);
      }
    });
  });

  // ── Advance level ─────────────────────────────────────────────────────────
  function advanceLevel() {
    // Instantly clear highlight before new question loads (suppress CSS transition
    // so the green/wrong state never flashes on top of the new question's text)
    answerBtns.forEach(function (btn) {
      btn.style.transition = 'none';
      btn.className = 'lexi-answer-btn';
      btn.disabled = false;
    });

    // Save checkpoint at multiples of 10
    if (currentLevel % 10 === 0) {
      checkpoint = currentLevel;
      localStorage.setItem('lexi_checkpoint', checkpoint);
    }

    if (currentLevel === 100) {
      localStorage.removeItem('lexi_currentLevel');
      showWin();
      return;
    }

    startLevel(currentLevel + 1);

    // Re-enable transitions after the clean state has painted
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        answerBtns.forEach(function (btn) { btn.style.transition = ''; });
      });
    });
  }

  // ── Fail screen ───────────────────────────────────────────────────────────
  function showFail() {
    gameState = 'FAIL';
    var q = currentQuestion;

    document.getElementById('lexi-fail-level').textContent = currentLevel;
    document.getElementById('lexi-fail-word').textContent = q.correct;
    document.getElementById('lexi-fail-def').textContent = q.definition;

    var restartLevel = checkpoint > 0 ? checkpoint + 1 : 1;
    document.getElementById('lexi-restart-btn').textContent =
      'Restart from Level ' + restartLevel;

    failShareText = 'Lexi -- made it to level ' + currentLevel +
      ' before falling. The word was "' + q.correct +
      '." Think you can do better? ' + SHARE_URL;

    showOverlay(failEl);
  }

  document.getElementById('lexi-fail-share-btn').addEventListener('click', function () {
    shareText(failShareText, 'Lexi');
  });

  document.getElementById('lexi-restart-btn').addEventListener('click', function () {
    var restartLevel = checkpoint > 0 ? checkpoint + 1 : 1;
    hideAllOverlays();
    startLevel(restartLevel);
  });

  // ── Win screen ────────────────────────────────────────────────────────────
  function showWin() {
    gameState = 'WIN';
    showOverlay(winEl);
  }

  document.getElementById('lexi-win-share-btn').addEventListener('click', function () {
    shareText('Lexi -- completed all 100 levels. Can you? ' + SHARE_URL, 'Lexi');
  });

  document.getElementById('lexi-play-again-btn').addEventListener('click', function () {
    localStorage.removeItem('lexi_currentLevel');
    localStorage.removeItem('lexi_checkpoint');
    checkpoint = 0;
    hideAllOverlays();
    showOverlay(splashEl);
  });

  // ── Tab-switch detection ──────────────────────────────────────────────────
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && gameState === 'PLAYING') {
      hideAnswerChoices();
      tabSwitchOccurred = true;
    }
    if (!document.hidden && tabSwitchOccurred) {
      currentOrder = shuffleOrder();
      showAnswerChoices();
      tabSwitchOccurred = false;
    }
  });

  function hideAnswerChoices() {
    answerBtns.forEach(function (btn) {
      btn.style.visibility = 'hidden';
    });
  }

  function showAnswerChoices() {
    renderAnswerButtons();
  }

}());
