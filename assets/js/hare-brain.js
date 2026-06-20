(function () {
  'use strict';

  var DIRECTIONS_TEXT = 'Hare Brain is a race against multiplication. Bunnies multiply on their own, faster and faster the longer you survive. Solve the problem on screen and type your answer — get it right and that many bunnies disappear. Get it wrong and you\'ll need to try again, no harm done except lost time. If your answer is ever big enough to cover every bunny left on the board, you clear it instantly and win. Let the board fill up completely, and the bunnies win instead. The math gets harder the longer you last. Can you keep up?';

  // ── Grid constants — match Classic mode (GRID_COLS=12, GRID_ROWS=20) ─────
  var COLS = 12;
  var ROWS = 20;
  var TOTAL = COLS * ROWS;

  // ── Game state ────────────────────────────────────────────────────────────
  var cells    = [];   // {filled:bool, color:'blue'|'red'} × TOTAL
  var cellEls  = [];   // DOM element references
  var bunnyCount      = 0;
  var lowestBunnyCount = TOTAL;
  var spawnMs         = 1000;
  var factorMax       = 5;
  var currentA        = 0;
  var currentB        = 0;
  var spawnTimer      = null;
  var diffTimer       = null;
  var gameRunning     = false;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var boardEl, inputEl, problemEl, countEl, inputWrapEl;
  var overlayEl, modalTitleEl, modalScoreEl, modalSubEl, playAgainBtn, shareBtn;
  var flashTimeout   = null;
  var debounceTimer  = null;

  // ── DOMContentLoaded ──────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    boardEl      = document.getElementById('hb-board');
    inputEl      = document.getElementById('hb-input');
    problemEl    = document.getElementById('hb-problem-text');
    countEl      = document.getElementById('hb-count');
    inputWrapEl  = document.getElementById('hb-input-wrap');
    overlayEl    = document.getElementById('overlay');
    modalTitleEl = document.getElementById('modal-title');
    modalScoreEl = document.getElementById('modal-score');
    modalSubEl   = document.getElementById('modal-sub');
    playAgainBtn = document.getElementById('play-again-btn');
    shareBtn     = document.getElementById('share-btn');

    buildBoard();
    resizeBoard();
    showStartScreen();

    document.getElementById('hb-submit').addEventListener('click', checkAnswer);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') checkAnswer();
    });
    inputEl.addEventListener('input', function () {
      if (debounceTimer !== null) { clearTimeout(debounceTimer); debounceTimer = null; }
      var typed = inputEl.value.trim();
      if (typed.length === 0) return;
      var correct = currentA * currentB;
      if (typed.length >= String(correct).length) {
        checkAnswer();
      } else {
        debounceTimer = setTimeout(checkAnswer, 200);
      }
    });

    var newBtn = document.getElementById('new-btn');
    if (newBtn) newBtn.addEventListener('click', resetGame);

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () {
      openDirections(DIRECTIONS_TEXT);
    });

    window.addEventListener('resize', resizeBoard);
    window.addEventListener('pagehide', clearTimers);
  });

  // ── Board setup ───────────────────────────────────────────────────────────
  function buildBoard() {
    boardEl.innerHTML = '';
    cells   = [];
    cellEls = [];
    for (var i = 0; i < TOTAL; i++) {
      cells.push({ filled: false, color: 'blue' });
      var el = document.createElement('div');
      el.className = 'hb-cell';
      boardEl.appendChild(el);
      cellEls.push(el);
    }
  }

  function resizeBoard() {
    var wrap        = document.getElementById('canvas-wrap');
    var problemArea = document.getElementById('hb-problem-area');
    var availW = wrap.clientWidth  - 16;
    var availH = wrap.clientHeight - 16 - (problemArea ? problemArea.offsetHeight + 8 : 0);
    var sz = Math.max(5, Math.floor(Math.min(availW / COLS, availH / ROWS)));
    boardEl.style.width                 = (sz * COLS) + 'px';
    boardEl.style.height                = (sz * ROWS) + 'px';
    boardEl.style.gridTemplateColumns   = 'repeat(' + COLS + ', ' + sz + 'px)';
    boardEl.style.gridAutoRows          = sz + 'px';
  }

  function renderCell(i) {
    var c = cells[i];
    cellEls[i].className = 'hb-cell' + (c.filled ? ' hb-' + c.color : '');
  }

  function updateCount() {
    if (countEl) countEl.textContent = bunnyCount;
    if (bunnyCount < lowestBunnyCount) lowestBunnyCount = bunnyCount;
  }

  // ── Screen management ─────────────────────────────────────────────────────
  function showStartScreen() {
    setOverlay('Hare Brain', 'Bunnies multiply. Solve the math to clear them.', '', 'Start', null);
    shareBtn.style.display = 'none';
    playAgainBtn.onclick = startGame;
  }

  function showWinScreen() {
    setOverlay('Cleared!', 'You out-multiplied the multiplying.', '', 'New Game', function () {
      shareText(
        'Hare Brain — outpaced the bunnies and cleared the board. https://www.thebunnygame.com/hare-brain',
        'Hare Brain'
      );
    });
    playAgainBtn.onclick = resetGame;
  }

  function showLoseScreen() {
    setOverlay('Overrun', 'The bunnies won this time.', 'Lowest you got the board to: ' + lowestBunnyCount + ' bunnies', 'New Game', function () {
      shareText(
        'Hare Brain — got the board down to ' + lowestBunnyCount + ' bunnies before getting overrun. Can you clear it? https://www.thebunnygame.com/hare-brain',
        'Hare Brain'
      );
    });
    playAgainBtn.onclick = resetGame;
  }

  function setOverlay(title, score, sub, btnLabel, onShare) {
    overlayEl.classList.remove('hidden');
    modalTitleEl.textContent = title;
    modalScoreEl.textContent = score;
    modalSubEl.textContent   = sub;
    document.getElementById('modal-breakdown').innerHTML = '';
    playAgainBtn.textContent = btnLabel;
    if (onShare) {
      shareBtn.style.display = 'block';
      shareBtn.onclick = onShare;
    } else {
      shareBtn.style.display = 'none';
    }
  }

  // ── Game flow ─────────────────────────────────────────────────────────────
  function startGame() {
    overlayEl.classList.add('hidden');
    gameRunning = true;

    // Reset board
    bunnyCount = 0;
    for (var i = 0; i < TOTAL; i++) {
      cells[i].filled = false;
      renderCell(i);
    }
    updateCount();

    spawnMs          = 500;
    factorMax        = 5;
    lowestBunnyCount = TOTAL;
    resizeBoard();

    // Seed 20 bunnies instantly before the first spawn tick
    seedBunnies(20);

    generateProblem();

    spawnTimer = setInterval(spawnBatch, spawnMs);
    diffTimer  = setInterval(escalate, 20000);
  }

  function resetGame() {
    clearTimers();
    gameRunning      = false;
    bunnyCount       = 0;
    lowestBunnyCount = TOTAL;
    for (var i = 0; i < TOTAL; i++) {
      cells[i].filled = false;
      renderCell(i);
    }
    updateCount();
    if (problemEl) problemEl.textContent = '—';
    if (inputEl)   inputEl.value = '';
    showStartScreen();
  }

  function clearTimers() {
    if (spawnTimer !== null) { clearInterval(spawnTimer); spawnTimer = null; }
    if (diffTimer  !== null) { clearInterval(diffTimer);  diffTimer  = null; }
  }

  // ── Spawning ──────────────────────────────────────────────────────────────
  var BATCH_OPTS = [3, 5, 7];

  // Place exactly n bunnies into random empty cells (used for initial seed)
  function seedBunnies(n) {
    var empty = [];
    for (var i = 0; i < TOTAL; i++) {
      if (!cells[i].filled) empty.push(i);
    }
    n = Math.min(n, empty.length);
    for (var j = empty.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = empty[j]; empty[j] = empty[k]; empty[k] = t;
    }
    for (var m = 0; m < n; m++) {
      cells[empty[m]].filled = true;
      cells[empty[m]].color  = Math.random() < 0.5 ? 'blue' : 'red';
      renderCell(empty[m]);
    }
    bunnyCount += n;
    updateCount();
  }

  function spawnBatch() {
    if (!gameRunning) return;

    var empty = [];
    for (var i = 0; i < TOTAL; i++) {
      if (!cells[i].filled) empty.push(i);
    }

    if (empty.length === 0) { triggerLose(); return; }

    var batch = BATCH_OPTS[Math.floor(Math.random() * 3)];
    batch = Math.min(batch, empty.length);

    // Fisher-Yates shuffle empty array, take first `batch` indices
    for (var j = empty.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = empty[j]; empty[j] = empty[k]; empty[k] = t;
    }
    for (var n = 0; n < batch; n++) {
      var idx = empty[n];
      cells[idx].filled = true;
      cells[idx].color  = Math.random() < 0.5 ? 'blue' : 'red';
      renderCell(idx);
    }
    bunnyCount += batch;
    updateCount();

    if (bunnyCount >= TOTAL) triggerLose();
  }

  // ── Difficulty escalation ─────────────────────────────────────────────────
  function escalate() {
    if (!gameRunning) return;
    // Spawn faster (floor: 400ms)
    if (spawnMs > 400) {
      spawnMs = Math.max(400, spawnMs - 100);
      clearInterval(spawnTimer);
      spawnTimer = setInterval(spawnBatch, spawnMs);
    }
    // Harder multiplication (ceiling: 1–12)
    if (factorMax < 12) factorMax++;
  }

  // ── Problem generation ────────────────────────────────────────────────────
  function generateProblem() {
    if (debounceTimer !== null) { clearTimeout(debounceTimer); debounceTimer = null; }
    currentA = 1 + Math.floor(Math.random() * factorMax);
    currentB = 1 + Math.floor(Math.random() * factorMax);
    if (problemEl) problemEl.textContent = currentA + ' × ' + currentB;
    if (inputEl) { inputEl.value = ''; inputEl.focus(); }
  }

  // ── Answer checking ───────────────────────────────────────────────────────
  function checkAnswer() {
    if (!gameRunning) return;
    if (debounceTimer !== null) { clearTimeout(debounceTimer); debounceTimer = null; }
    var raw = inputEl.value.trim();
    if (raw === '') return;  // debounce fired on empty field — ignore silently
    var val = parseInt(raw, 10);
    if (isNaN(val) || val < 0) { flashBad(); return; }

    var correct = currentA * currentB;
    if (val !== correct) { flashBad(); inputEl.value = ''; inputEl.focus(); return; }

    // Correct — remove up to 5 bunnies, then check for win
    removeBunnies(Math.min(5, bunnyCount));
    flashGood();
    if (bunnyCount === 0) { triggerWin(); return; }
    generateProblem();
  }

  // ── Board mutation ────────────────────────────────────────────────────────
  function removeBunnies(n) {
    var filled = [];
    for (var i = 0; i < TOTAL; i++) {
      if (cells[i].filled) filled.push(i);
    }
    // Shuffle
    for (var j = filled.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = filled[j]; filled[j] = filled[k]; filled[k] = t;
    }
    var toRemove = Math.min(n, filled.length);
    for (var m = 0; m < toRemove; m++) {
      cells[filled[m]].filled = false;
      renderCell(filled[m]);
    }
    bunnyCount -= toRemove;
    updateCount();
  }

  function clearBoard() {
    for (var i = 0; i < TOTAL; i++) {
      cells[i].filled = false;
      renderCell(i);
    }
    bunnyCount = 0;
    updateCount();
  }

  // ── Win / Lose ────────────────────────────────────────────────────────────
  function triggerWin() {
    if (!gameRunning) return;
    gameRunning = false;
    clearTimers();
    setTimeout(showWinScreen, 300);
  }

  function triggerLose() {
    if (!gameRunning) return;
    gameRunning = false;
    clearTimers();
    inputEl.disabled = true;
    setTimeout(function () {
      inputEl.disabled = false;
      showLoseScreen();
    }, 400);
  }

  // ── Input flash feedback ──────────────────────────────────────────────────
  function flashGood() {
    if (flashTimeout) clearTimeout(flashTimeout);
    inputEl.classList.remove('hb-correct', 'hb-wrong');
    inputEl.classList.add('hb-correct');
    flashTimeout = setTimeout(function () {
      inputEl.classList.remove('hb-correct');
    }, 400);
  }

  function flashBad() {
    if (flashTimeout) clearTimeout(flashTimeout);
    inputEl.classList.remove('hb-correct', 'hb-wrong');
    inputWrapEl.classList.remove('hb-shake');
    void inputWrapEl.offsetWidth; // force reflow to restart animation
    inputWrapEl.classList.add('hb-shake');
    inputEl.classList.add('hb-wrong');
    flashTimeout = setTimeout(function () {
      inputEl.classList.remove('hb-wrong');
      inputWrapEl.classList.remove('hb-shake');
    }, 500);
  }

})();
