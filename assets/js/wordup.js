(function (root) {
  'use strict';

  // ── Standard Boggle 16-die set ─────────────────────────────────────────────
  var BOGGLE_DICE = [
    ['A', 'A', 'E', 'E', 'G', 'N'],   //  0
    ['E', 'L', 'R', 'T', 'T', 'Y'],   //  1
    ['A', 'O', 'O', 'T', 'T', 'W'],   //  2
    ['A', 'B', 'B', 'J', 'O', 'O'],   //  3
    ['E', 'H', 'R', 'T', 'V', 'W'],   //  4
    ['C', 'I', 'M', 'O', 'T', 'U'],   //  5
    ['D', 'I', 'S', 'T', 'T', 'Y'],   //  6
    ['E', 'I', 'O', 'S', 'S', 'T'],   //  7
    ['D', 'E', 'L', 'R', 'V', 'Y'],   //  8
    ['A', 'C', 'H', 'O', 'P', 'S'],   //  9
    ['H', 'I', 'M', 'N', 'Qu', 'U'],  // 10 — Q face displayed as 'Qu'
    ['E', 'E', 'I', 'N', 'S', 'U'],   // 11
    ['E', 'E', 'G', 'H', 'N', 'W'],   // 12
    ['A', 'F', 'F', 'K', 'P', 'S'],   // 13
    ['H', 'L', 'N', 'N', 'R', 'Z'],   // 14
    ['D', 'E', 'I', 'L', 'R', 'X'],   // 15
  ];

  // ── ET calendar date — resets at 12:01 AM ET daily ───────────────────────
  function getEtDateKey() {
    var ts   = Date.now() - 60000;
    var year = new Date(ts).getUTCFullYear();
    var mar1     = new Date(Date.UTC(year,  2, 1)).getUTCDay();
    var dstStart = Date.UTC(year,  2, 1 + (7 - mar1) % 7 + 7, 7, 0, 0);
    var nov1     = new Date(Date.UTC(year, 10, 1)).getUTCDay();
    var dstEnd   = Date.UTC(year, 10, 1 + (7 - nov1) % 7,     6, 0, 0);
    var offsetMs = (ts >= dstStart && ts < dstEnd) ? -4 * 3600000 : -5 * 3600000;
    var et       = new Date(ts + offsetMs);
    return (
      et.getUTCFullYear() + '-' +
      String(et.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(et.getUTCDate()).padStart(2, '0')
    );
  }

  // ── Seedable PRNG — 32-bit LCG ─────────────────────────────────────────────
  function hashString(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  function makePrng(seed) {
    var state = (seed >>> 0) || 2463534242;
    return function () {
      state = ((state * 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  // ── Daily grid ─────────────────────────────────────────────────────────────
  function getDailyGrid(dateKey) {
    var seed = hashString('wordup-' + dateKey);
    var rng  = makePrng(seed);
    var dice = BOGGLE_DICE.map(function (d) { return d.slice(); });
    for (var i = dice.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = dice[i]; dice[i] = dice[j]; dice[j] = tmp;
    }
    var grid = [];
    for (var k = 0; k < 9; k++) grid.push(dice[k][Math.floor(rng() * 6)]);
    return grid;
  }

  // ── Adjacency (logical, never changes with rotation) ───────────────────────
  //   0 1 2
  //   3 4 5
  //   6 7 8
  var ADJACENCY = [
    [1, 3, 4],
    [0, 2, 3, 4, 5],
    [1, 4, 5],
    [0, 1, 4, 6, 7],
    [0, 1, 2, 3, 5, 6, 7, 8],
    [1, 2, 4, 7, 8],
    [3, 4, 7],
    [3, 4, 5, 6, 8],
    [4, 5, 7],
  ];

  // ── Visual rotation orders ─────────────────────────────────────────────────
  //   display-position → logical cell index
  var VISUAL_ORDERS = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8],  // rot 0 — identity
    [6, 3, 0, 7, 4, 1, 8, 5, 2],  // rot 1 — 90° CW
    [8, 7, 6, 5, 4, 3, 2, 1, 0],  // rot 2 — 180°
    [2, 5, 8, 1, 4, 7, 0, 3, 6],  // rot 3 — 270° CW
  ];

  var GAME_DURATION = 60;
  var LS_PREFIX     = 'wordup_bestScore_';
  var SHARE_URL     = 'https://www.thebunnygame.com/word-up';

  var DIRECTIONS_TEXT =
    'Word Up! gives everyone the same nine letters today. ' +
    'Click through adjacent letters — including diagonals — to spell real words, ' +
    'three letters or longer. Find a full nine-letter word and score a 50-point bonus. ' +
    'You’ve got sixty seconds. Play as many rounds as you want; only your best score ' +
    'today counts. Come back tomorrow for nine new letters.';

  // ── DOM refs ────────────────────────────────────────────────────────────────
  var gridEl        = null;
  var svgEl         = null;
  var rotateBtnEl   = null;
  var timerEl       = null;
  var scoreEl       = null;
  var feedbackEl    = null;
  var foundListEl   = null;
  var startOverlay  = null;
  var startBtn      = null;
  var endOverlay    = null;
  var endScoreEl    = null;
  var endBestEl     = null;
  var endWordCount  = null;
  var endWordsEl    = null;
  var playAgainBtn  = null;
  var shareBtnEl    = null;

  // ── Game state ──────────────────────────────────────────────────────────────
  var dailyKey   = null;
  var dailyGrid  = null;
  var rotation   = 0;
  var trace      = [];

  var gamePhase  = 'idle';  // 'idle' | 'playing' | 'ended'
  var score      = 0;
  var foundWords = {};      // lower-case word → pts, ordered by insertion
  var timeLeft   = GAME_DURATION;
  var timerHandle = null;
  var feedbackTimer = null;

  // ── Per-tile cosmetic rotation ───────────────────────────────────────────────
  var tileRots = [0, 0, 0, 0, 0, 0, 0, 0, 0];  // degrees per logical cell index

  function applyTileRotations() {
    for (var i = 0; i < 9; i++) {
      var el = getCellEl(i);
      if (!el) continue;
      el.classList.remove('wu-r90', 'wu-r180', 'wu-r270');
      if (tileRots[i] === 90)  el.classList.add('wu-r90');
      if (tileRots[i] === 180) el.classList.add('wu-r180');
      if (tileRots[i] === 270) el.classList.add('wu-r270');
    }
  }

  function randomizeTileRots() {
    var choices = [0, 90, 180, 270];
    for (var i = 0; i < 9; i++) {
      var el = getCellEl(i);
      if (el) el.classList.add('wu-tumbling');
      tileRots[i] = choices[Math.floor(Math.random() * 4)];
    }
    applyTileRotations();
    setTimeout(function () {
      for (var i = 0; i < 9; i++) {
        var el = getCellEl(i);
        if (el) el.classList.remove('wu-tumbling');
      }
    }, 450);
  }

  // ── Dictionary ──────────────────────────────────────────────────────────────
  var wordSet = null;  // null = loading, Set = ready

  function loadDictionary() {
    fetch('assets/data/words.txt')
      .then(function (r) { return r.text(); })
      .then(function (text) {
        var lines = text.split('\n');
        var s = Object.create(null);
        for (var i = 0; i < lines.length; i++) {
          var w = lines[i].trim();
          if (w) s[w] = true;
        }
        wordSet = s;
        if (startBtn) { startBtn.textContent = 'START'; startBtn.disabled = false; }
      })
      .catch(function () {
        wordSet = {};  // fail open — empty object means nothing validates
        if (startBtn) { startBtn.textContent = 'START'; startBtn.disabled = false; }
      });
  }

  function isValidWord(lower) {
    if (wordSet === null) return false;
    return !!wordSet[lower];
  }

  // ── localStorage best-score tracking ───────────────────────────────────────
  function loadStored(key) {
    try { var r = localStorage.getItem(key); return r !== null ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }

  function saveStored(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function cleanupStale(todayKey) {
    var toDelete = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0 && k !== LS_PREFIX + todayKey) toDelete.push(k);
      }
      for (var j = 0; j < toDelete.length; j++) localStorage.removeItem(toDelete[j]);
    } catch (e) {}
  }

  function getBestScore() {
    return loadStored(LS_PREFIX + dailyKey) || 0;
  }

  // Returns true if newScore is a new daily best (and saves it).
  function updateBestScore(newScore) {
    if (newScore <= 0) return false;
    var current = getBestScore();
    if (newScore > current) { saveStored(LS_PREFIX + dailyKey, newScore); return true; }
    return false;
  }

  // ── Share ───────────────────────────────────────────────────────────────────
  function shareResult() {
    var text = 'Word Up! — scored ' + score + ' point' + (score !== 1 ? 's' : '') +
               ' today. Think you can beat it? ' + SHARE_URL;
    if (navigator.share) {
      navigator.share({ title: 'Word Up! — Bunny Game', text: text }).catch(function () {});
    } else {
      navigator.clipboard.writeText(text).then(function () {
        if (!shareBtnEl) return;
        var orig = shareBtnEl.textContent;
        shareBtnEl.textContent = '✓ COPIED!';
        setTimeout(function () { shareBtnEl.textContent = orig; }, 2500);
      }).catch(function () {});
    }
  }

  // ── Cell helpers ────────────────────────────────────────────────────────────
  function getCellEl(idx) {
    return gridEl ? gridEl.querySelector('[data-idx="' + idx + '"]') : null;
  }

  function cellCenter(idx) {
    var wR = svgEl.parentElement.getBoundingClientRect();
    var cR = getCellEl(idx).getBoundingClientRect();
    return { x: cR.left + cR.width / 2 - wR.left, y: cR.top + cR.height / 2 - wR.top };
  }

  // ── SVG trace ──────────────────────────────────────────────────────────────
  function redrawSVG() {
    svgEl.innerHTML = '';
    if (trace.length === 0) return;
    var ns = 'http://www.w3.org/2000/svg';
    var linesG = document.createElementNS(ns, 'g');
    for (var i = 1; i < trace.length; i++) {
      var a = cellCenter(trace[i - 1]), b = cellCenter(trace[i]);
      var line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      line.setAttribute('stroke', 'rgba(255,16,240,0.75)');
      line.setAttribute('stroke-width', '5');
      line.setAttribute('stroke-linecap', 'round');
      linesG.appendChild(line);
    }
    svgEl.appendChild(linesG);
    var dotsG = document.createElementNS(ns, 'g');
    for (var j = 0; j < trace.length; j++) {
      var p = cellCenter(trace[j]);
      var isTail = (j === trace.length - 1), isStart = (j === 0 && trace.length > 1);
      var dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
      dot.setAttribute('r',    isTail ? 9 : isStart ? 7 : 5);
      dot.setAttribute('fill', isTail ? '#FF10F0' : 'rgba(255,16,240,0.60)');
      dotsG.appendChild(dot);
    }
    svgEl.appendChild(dotsG);
  }

  // ── Cell state classes ──────────────────────────────────────────────────────
  function refreshCellStates() {
    for (var i = 0; i < 9; i++) {
      var el = getCellEl(i);
      if (!el) continue;
      el.classList.remove('wu-used', 'wu-active', 'wu-submitted');
    }
    for (var j = 0; j < trace.length; j++) {
      var cel = getCellEl(trace[j]);
      if (!cel) continue;
      cel.classList.add(j === trace.length - 1 ? 'wu-active' : 'wu-used');
    }
  }

  // ── Grid render ─────────────────────────────────────────────────────────────
  function renderGrid(grid, rot) {
    if (!gridEl) return;
    gridEl.innerHTML = '';
    var order = VISUAL_ORDERS[rot || 0];
    for (var v = 0; v < 9; v++) {
      var idx  = order[v];
      var cell = document.createElement('div');
      cell.className   = 'wu-cell' + (grid[idx] === 'Qu' ? ' wu-cell--qu' : '');
      cell.dataset.idx = String(idx);
      cell.textContent = grid[idx];
      gridEl.appendChild(cell);
    }
    refreshCellStates();
    applyTileRotations();
    redrawSVG();
  }

  // ── Word building ───────────────────────────────────────────────────────────
  function buildWordFromTrace() {
    return trace.map(function (i) {
      return dailyGrid[i] === 'Qu' ? 'QU' : dailyGrid[i];
    }).join('');
  }

  function traceLetterCount() {
    return trace.reduce(function (n, i) {
      return n + (dailyGrid[i] === 'Qu' ? 2 : 1);
    }, 0);
  }

  function scoreWord(word) {
    return word.length >= 9 ? 50 : word.length;
  }

  // ── Feedback ────────────────────────────────────────────────────────────────
  function showFeedback(text, type) {
    if (!feedbackEl) return;
    clearTimeout(feedbackTimer);
    feedbackEl.className = 'wu-feedback wu-feedback--' + type;
    feedbackEl.textContent = text;
    feedbackTimer = setTimeout(function () {
      feedbackEl.className = 'wu-feedback';
      feedbackEl.textContent = '';
    }, type === 'bonus' ? 2000 : 1400);
  }

  // ── Score display ───────────────────────────────────────────────────────────
  function updateScoreDisplay() {
    if (!scoreEl) return;
    scoreEl.innerHTML = score + '<span class="wu-pts-label"> pts</span>';
  }

  // ── Found words list ────────────────────────────────────────────────────────
  function makeChip(word, pts) {
    var chip = document.createElement('span');
    var cls  = pts >= 50 ? 'bonus' : pts >= 6 ? 'long' : 'short';
    chip.className   = 'wu-word-chip wu-word-chip--' + cls;
    chip.textContent = word.toLowerCase();
    return chip;
  }

  function addFoundWord(word, pts) {
    if (!foundListEl) return;
    var chip = makeChip(word, pts);
    foundListEl.insertBefore(chip, foundListEl.firstChild);
  }

  // ── Timer ───────────────────────────────────────────────────────────────────
  function formatTime(secs) {
    var m = Math.floor(secs / 60);
    var s = secs % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateTimerDisplay() {
    if (!timerEl) return;
    timerEl.textContent = formatTime(timeLeft);
    if (timeLeft <= 10) {
      timerEl.classList.add('wu-timer--urgent');
    } else {
      timerEl.classList.remove('wu-timer--urgent');
    }
  }

  // ── Flash-and-reset on valid submit ─────────────────────────────────────────
  function flashAndReset(cells) {
    cells.forEach(function (idx) {
      var el = getCellEl(idx);
      if (el) { el.classList.remove('wu-used', 'wu-active'); el.classList.add('wu-submitted'); }
    });
    setTimeout(function () {
      cells.forEach(function (idx) {
        var el = getCellEl(idx);
        if (el) el.classList.remove('wu-submitted');
      });
    }, 320);
  }

  // ── Word handler (fully wired in Part 4) ────────────────────────────────────
  function handleWord(word) {
    if (gamePhase !== 'playing') return;
    var lower = word.toLowerCase();

    if (foundWords[lower] !== undefined) {
      showFeedback('Already found', 'duplicate');
      return;
    }

    if (!isValidWord(lower)) {
      showFeedback('Not a Word', 'invalid');
      return;
    }

    var pts = scoreWord(word);
    foundWords[lower] = pts;
    score += pts;
    updateScoreDisplay();
    addFoundWord(word, pts);

    if (pts >= 50) {
      showFeedback('⭐ BONUS! +' + pts, 'bonus');
    } else {
      showFeedback('+' + pts, 'valid');
    }
  }

  // ── Submit trace ─────────────────────────────────────────────────────────────
  function resetTrace() {
    trace = [];
    svgEl.innerHTML = '';
    refreshCellStates();
  }

  function submitTrace(nextIdx) {
    var letters  = traceLetterCount();
    var word     = (letters >= 3) ? buildWordFromTrace() : null;
    var tooShort = (letters > 0 && letters < 3);
    var submitted = trace.slice();

    trace = [];
    svgEl.innerHTML = '';

    if (nextIdx !== undefined) {
      trace.push(nextIdx);
      refreshCellStates();
      redrawSVG();
    } else {
      refreshCellStates();
      if (word) flashAndReset(submitted);
    }

    if (word) {
      handleWord(word);
    } else if (tooShort && gamePhase === 'playing') {
      showFeedback('3+ letters', 'short');
    }
  }

  // ── Click handler ───────────────────────────────────────────────────────────
  function handleCellClick(idx) {
    if (gamePhase !== 'playing') return;

    if (trace.length > 0 && trace[trace.length - 1] === idx) {
      submitTrace(); return;
    }
    if (trace.indexOf(idx) !== -1) {
      submitTrace(); return;
    }
    if (trace.length > 0 && ADJACENCY[trace[trace.length - 1]].indexOf(idx) === -1) {
      submitTrace(idx); return;
    }
    trace.push(idx);
    refreshCellStates();
    redrawSVG();
  }

  // ── Rotate ──────────────────────────────────────────────────────────────────
  function rotateGrid() {
    rotation = (rotation + 1) % 4;
    gridEl.classList.remove('wu-rotating');
    void gridEl.offsetWidth;
    gridEl.classList.add('wu-rotating');
    gridEl.addEventListener('animationend', function onEnd() {
      gridEl.classList.remove('wu-rotating');
      gridEl.removeEventListener('animationend', onEnd);
    });
    if (rotateBtnEl) rotateBtnEl.dataset.rot = String(rotation);
    renderGrid(dailyGrid, rotation);
  }

  // ── Game lifecycle ───────────────────────────────────────────────────────────
  function startGame() {
    if (gamePhase === 'playing') return;
    gamePhase  = 'playing';
    score      = 0;
    foundWords = {};
    timeLeft   = GAME_DURATION;
    trace      = [];

    updateScoreDisplay();
    updateTimerDisplay();
    if (foundListEl) foundListEl.innerHTML = '';
    if (feedbackEl)  { feedbackEl.className = 'wu-feedback'; feedbackEl.textContent = ''; }

    resetTrace();

    // Hide start overlay
    if (startOverlay) startOverlay.classList.add('wu-hide');

    // Start countdown
    timerHandle = setInterval(function () {
      timeLeft--;
      updateTimerDisplay();
      if (timeLeft <= 0) {
        clearInterval(timerHandle);
        timerHandle = null;
        endGame();
      }
    }, 1000);
  }

  function endGame() {
    gamePhase = 'ended';
    clearInterval(timerHandle);
    timerHandle = null;

    resetTrace();
    clearTimeout(feedbackTimer);
    if (feedbackEl) { feedbackEl.className = 'wu-feedback'; feedbackEl.textContent = ''; }

    // Best score
    var prevBest  = getBestScore();
    var isNewBest = updateBestScore(score);

    if (endScoreEl) endScoreEl.textContent = String(score);

    if (endBestEl) {
      if (isNewBest) {
        endBestEl.textContent = '⭐ NEW BEST! ⭐';
        endBestEl.className   = 'wu-end-best wu-end-best--new';
      } else if (prevBest > 0) {
        endBestEl.textContent = 'Best today: ' + prevBest + ' pts';
        endBestEl.className   = 'wu-end-best';
      } else {
        endBestEl.textContent = '';
        endBestEl.className   = 'wu-end-best';
      }
    }

    var wordList  = Object.keys(foundWords);
    var wordCount = wordList.length;

    if (endWordCount) {
      endWordCount.textContent = wordCount === 0
        ? 'No words found'
        : wordCount === 1 ? '1 word found' : wordCount + ' words found';
    }

    if (endWordsEl) {
      endWordsEl.innerHTML = '';
      wordList.sort(function (a, b) {
        return (foundWords[b] - foundWords[a]) || a.localeCompare(b);
      });
      wordList.forEach(function (w) { endWordsEl.appendChild(makeChip(w, foundWords[w])); });
    }

    if (endOverlay) endOverlay.classList.remove('wu-hide');
  }

  function resetGame() {
    clearInterval(timerHandle);
    timerHandle = null;
    gamePhase = 'idle';
    score = 0;
    foundWords = {};
    timeLeft = GAME_DURATION;
    trace = [];
    rotation = 0;

    updateScoreDisplay();
    updateTimerDisplay();
    if (timerEl) timerEl.classList.remove('wu-timer--urgent');
    if (foundListEl) foundListEl.innerHTML = '';
    if (feedbackEl)  { feedbackEl.className = 'wu-feedback'; feedbackEl.textContent = ''; }

    if (rotateBtnEl) rotateBtnEl.dataset.rot = '0';
    renderGrid(dailyGrid, 0);
    randomizeTileRots();

    if (endBestEl)    { endBestEl.textContent = ''; endBestEl.className = 'wu-end-best'; }
    if (endOverlay)   endOverlay.classList.add('wu-hide');
    if (startOverlay) startOverlay.classList.remove('wu-hide');
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      gridEl       = document.getElementById('wu-grid');
      svgEl        = document.getElementById('wu-svg');
      rotateBtnEl  = document.getElementById('wu-rotate-btn');
      timerEl      = document.getElementById('wu-timer');
      scoreEl      = document.getElementById('wu-score-display');
      feedbackEl   = document.getElementById('wu-feedback');
      foundListEl  = document.getElementById('wu-found-list');
      startOverlay = document.getElementById('wu-start-overlay');
      startBtn     = document.getElementById('wu-start-btn');
      endOverlay   = document.getElementById('wu-end-overlay');
      endScoreEl   = document.getElementById('wu-end-score-val');
      endBestEl    = document.getElementById('wu-end-best');
      endWordCount = document.getElementById('wu-end-word-count');
      endWordsEl   = document.getElementById('wu-end-words');
      playAgainBtn = document.getElementById('wu-play-again-btn');
      shareBtnEl   = document.getElementById('wu-share-btn');

      dailyKey  = getEtDateKey();
      dailyGrid = getDailyGrid(dailyKey);
      cleanupStale(dailyKey);
      renderGrid(dailyGrid, 0);
      randomizeTileRots();
      setInterval(randomizeTileRots, 10000);
      updateScoreDisplay();
      updateTimerDisplay();

      // Disable start until dictionary loads
      if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = 'LOADING…';
      }
      loadDictionary();

      if (rotateBtnEl) {
        rotateBtnEl.dataset.rot = '0';
        rotateBtnEl.addEventListener('click', rotateGrid);
      }

      gridEl.addEventListener('click', function (e) {
        var cell = e.target.closest('.wu-cell');
        if (!cell) return;
        handleCellClick(parseInt(cell.dataset.idx, 10));
      });

      if (startBtn)     startBtn.addEventListener('click', startGame);
      if (playAgainBtn) playAgainBtn.addEventListener('click', resetGame);
      if (shareBtnEl)   shareBtnEl.addEventListener('click', shareResult);

      var helpBtn = document.getElementById('help-btn');
      if (helpBtn) helpBtn.addEventListener('click', function () {
        openDirections(DIRECTIONS_TEXT);
      });
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  var WordUp = {
    getEtDateKey : getEtDateKey,
    getDailyGrid : getDailyGrid,
    ADJACENCY    : ADJACENCY,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WordUp;
  } else {
    root.WordUp = WordUp;
  }

}(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {})));

// ── Node.js test ───────────────────────────────────────────────────────────
if (typeof require === 'function' && typeof module !== 'undefined' && require.main === module) {
  var wu = module.exports;
  var key  = wu.getEtDateKey();
  var grid = wu.getDailyGrid(key);
  console.log('ET date key : ' + key);
  console.log('Grid:');
  console.log('  ' + grid.slice(0, 3).join('  '));
  console.log('  ' + grid.slice(3, 6).join('  '));
  console.log('  ' + grid.slice(6, 9).join('  '));
  var grid2 = wu.getDailyGrid(key);
  var det = grid.every(function (l, i) { return l === grid2[i]; });
  console.log('\nDeterminism : ' + (det ? 'PASS' : 'FAIL'));
  var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  var gridY = wu.getDailyGrid(yesterday);
  var diff  = grid.some(function (l, i) { return l !== gridY[i]; });
  console.log('Cross-day   : ' + (diff ? 'PASS — grids differ' : 'NOTE — identical (rare)'));
}
