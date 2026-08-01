(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────────

  var DIRECTIONS_TEXT =
    'Relation gives you a theme and a grid of letters. Four words related to ' +
    'the theme are hidden inside, winding through adjacent tiles — up, down, ' +
    'left, or right, never diagonal. Every letter tile is used exactly once ' +
    'across all four words. Click tiles to trace a path. Click the last tile ' +
    "again to backtrack. Click a tile that isn't adjacent to cancel and " +
    'start over, or use the Clear button. Find all four words to complete the ' +
    'puzzle. A new theme drops every day.';

  var PUZZLES_URL      = 'assets/data/relation-puzzles.json';
  var LS_PREFIX        = 'relation_result_';
  var SHARE_URL        = 'https://www.thebunnygame.com/relation';
  var FETCH_TIMEOUT_MS = 5000;
  var N                = 5;
  var LENGTHS          = [3, 4, 5, 6];

  // ── Day key ──────────────────────────────────────────────────────────────────
  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  // Puzzles carry consecutive dayKeys from launch. Before launch we show the
  // first puzzle; past the end we wrap, so the game never renders an empty grid.
  function pickPuzzle(list) {
    var key = getTodayKey();
    for (var i = 0; i < list.length; i++) {
      if (list[i].dayKey === key) return { puzzle: list[i], status: 'today' };
    }
    var launch = Date.parse(list[0].dayKey + 'T00:00:00Z');
    var today  = Date.parse(key + 'T00:00:00Z');
    var offset = Math.floor((today - launch) / 86400000);
    if (offset < 0) return { puzzle: list[0], status: 'prelaunch' };
    return { puzzle: list[offset % list.length], status: 'wrapped' };
  }

  // ── Round lock (same shape as Proof, Excerpt and Cropped) ───────────────────

  function lsKey() { return LS_PREFIX + getTodayKey(); }

  function loadStored() {
    try { var r = localStorage.getItem(lsKey()); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }

  function saveProgress() {
    try {
      localStorage.setItem(lsKey(), JSON.stringify({
        day:    getTodayKey(),
        theme:  puzzle.theme,
        found:  Object.keys(found),
        solved: Object.keys(found).length === puzzle.words.length,
      }));
    } catch (e) {}
  }

  function cleanupStale() {
    var today = lsKey(), doomed = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0 && k !== today) doomed.push(k);
      }
      doomed.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
    return doomed.length;
  }

  // ── Share ────────────────────────────────────────────────────────────────────
  // Names the theme, which the puzzle already discloses up front, and the count.
  // Never the words.
  function getShareText(foundCount, totalWords) {
    if (foundCount === (totalWords || 4)) {
      return "Relation — found all four words in today's \"" + puzzle.theme +
             '" puzzle. Can you? ' + SHARE_URL;
    }
    return 'Relation — found ' + foundCount + ' of ' + (totalWords || 4) +
           " words in today's puzzle. Think you can do better? " + SHARE_URL;
  }

  // ── Fetch with timeout ───────────────────────────────────────────────────────
  function fetchWithTimeout(url, ms) {
    var ctrl  = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { if (timer) clearTimeout(timer); return r; })
      .catch(function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  // ── State ────────────────────────────────────────────────────────────────────
  var puzzle    = null;
  var pathSel   = [];    // indices 0..24, the word being traced
  var locked    = {};    // index -> word that claimed it
  var found     = {};    // word -> true
  var cellEls   = [];
  var rejecting = false; // true during the red-flash window, clicks ignored
  var solved    = false;
  var pending   = null;  // puzzle chosen at load, started when Play is pressed

  var idx = function (r, c) { return r * N + c; };
  var rOf = function (i) { return Math.floor(i / N); };
  var cOf = function (i) { return i % N; };
  var adjacent = function (a, b) {
    return Math.abs(rOf(a) - rOf(b)) + Math.abs(cOf(a) - cOf(b)) === 1;
  };
  var letterAt = function (i) { return puzzle.grid[rOf(i)][cOf(i)]; };

  // ── DOM ──────────────────────────────────────────────────────────────────────
  var loadingEl = document.getElementById('rl-loading');
  var errorEl   = document.getElementById('rl-error');
  var splashEl  = document.getElementById('rl-splash');
  var gameEl    = document.getElementById('rl-game');

  function show(el) {
    [loadingEl, errorEl, splashEl, gameEl].forEach(function (e) { if (e) e.classList.add('rl-hide'); });
    if (el) el.classList.remove('rl-hide');
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  function renderGrid() {
    var grid = document.getElementById('rl-grid');
    grid.innerHTML = '';
    cellEls = [];

    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        var i  = idx(r, c);
        var ch = puzzle.grid[r][c];
        var d  = document.createElement('div');
        d.className = 'rl-cell' + (ch === null ? ' rl-wall' : '');
        d.dataset.i = i;
        d.textContent = ch === null ? '' : ch;
        if (ch === null) d.setAttribute('aria-hidden', 'true');
        grid.appendChild(d);
        cellEls[i] = d;
      }
    }
  }

  function renderSlots() {
    var wrap = document.getElementById('rl-slots');
    wrap.innerHTML = '';
    LENGTHS.forEach(function (len) {
      var row = document.createElement('div');
      row.className = 'rl-slot-row';
      row.dataset.len = len;
      for (var k = 0; k < len; k++) {
        var s = document.createElement('span');
        s.className = 'rl-slot';
        row.appendChild(s);
      }
      wrap.appendChild(row);
    });
  }

  // Fill a length row with a found word, letters bouncing in one after another
  function fillSlotRow(word) {
    var row = document.querySelector('.rl-slot-row[data-len="' + word.length + '"]');
    if (!row || row.classList.contains('rl-done')) return;
    row.classList.add('rl-done');
    [].forEach.call(row.children, function (slot, k) {
      slot.textContent = word[k];
      slot.style.animationDelay = (k * 55) + 'ms';
      slot.classList.add('rl-filled');
    });
  }

  function renderCells() {
    cellEls.forEach(function (el, i) {
      if (!el || el.classList.contains('rl-wall')) return;
      el.classList.toggle('rl-locked', !!locked[i]);
      var at = pathSel.indexOf(i);
      el.classList.toggle('rl-sel',  at !== -1);
      el.classList.toggle('rl-head', at === pathSel.length - 1 && at !== -1);
    });
    renderPathLine();
    document.getElementById('rl-clear-btn').disabled = pathSel.length === 0;
  }

  // Polyline through the centres of the selected cells, in viewBox units so it
  // scales with the board rather than needing pixel measurement.
  function renderPathLine() {
    var line = document.getElementById('rl-path-line');
    if (pathSel.length < 2) { line.setAttribute('points', ''); return; }
    var step = 100 / N;
    line.setAttribute('points', pathSel.map(function (i) {
      return (cOf(i) * step + step / 2).toFixed(2) + ',' + (rOf(i) * step + step / 2).toFixed(2);
    }).join(' '));
  }

  function renderProgress() {
    var n = Object.keys(found).length;
    document.getElementById('rl-progress-label').textContent = n + ' of 4 found';
  }

  // ── Selection ────────────────────────────────────────────────────────────────
  // Click rules, per the brief: tap the last tile to step back one; tap a tile
  // that isn't adjacent to the head and the attempt is dropped.

  function onCellClick(i) {
    if (rejecting) return;                 // ignore clicks during the red flash
    if (locked[i]) return;
    if (letterAt(i) === null) return;

    if (!pathSel.length) { pathSel = [i]; renderCells(); return; }

    var head = pathSel[pathSel.length - 1];

    if (i === head) { pathSel.pop(); renderCells(); return; }          // backtrack
    if (pathSel.indexOf(i) !== -1) { pathSel = []; renderCells(); return; } // revisit -> cancel
    if (!adjacent(i, head)) { pathSel = []; renderCells(); return; }   // non-adjacent -> cancel

    pathSel.push(i);
    renderCells();
    attemptValidation();
  }

  function unfoundWords() {
    return puzzle.words.filter(function (w) { return !found[w]; });
  }

  // ── Validation ───────────────────────────────────────────────────────────────
  //
  // The brief validates the moment the path length matches ANY unfound word
  // length, and red-flashes plus cancels on a miss. That makes the game
  // unplayable: tracing CLOUDY, the path spells CLO at three tiles, which is not
  // FOG, so it is destroyed at step 3. Every word longer than the shortest
  // remaining one dies the same way.
  //
  // So a length match that spells nothing is simply not an answer yet — the path
  // survives and the player keeps going. A path is only rejected once it can no
  // longer become any remaining word, which is when it grows past the longest one
  // still unfound. Clear is always there to abandon an attempt deliberately.
  function attemptValidation() {
    var remaining = unfoundWords();
    if (!remaining.length) return;

    var spelled = currentWord();

    for (var k = 0; k < remaining.length; k++) {
      if (remaining[k].length === spelled.length && remaining[k] === spelled) {
        triggerWordFound(remaining[k], pathSel.slice());
        return;
      }
    }

    var longest = Math.max.apply(null, remaining.map(function (w) { return w.length; }));
    if (spelled.length >= longest) triggerWrongAttempt();
  }

  function triggerWrongAttempt() {
    if (rejecting) return;
    rejecting = true;
    var cells = pathSel.slice();
    cells.forEach(function (i) { if (cellEls[i]) cellEls[i].classList.add('rl-bad'); });
    setTimeout(function () {
      cells.forEach(function (i) { if (cellEls[i]) cellEls[i].classList.remove('rl-bad'); });
      rejecting = false;
      pathSel = [];
      renderCells();
    }, 600);
  }

  function triggerWordFound(word, cells) {
    lockWord(word, cells);
    saveProgress();
    if (Object.keys(found).length === puzzle.words.length) {
      setTimeout(function () { triggerWin(false); }, 340);
    }
  }

  // ── Win ──────────────────────────────────────────────────────────────────────
  // `restored` skips the celebration for a player returning to a finished grid —
  // they have already seen it.
  function triggerWin(restored) {
    solved = true;
    saveProgress();
    if (!restored) celebrateGrid();
    populateWinOverlay();
    setTimeout(function () { openWin(); }, restored ? 0 : 900);
    if (typeof window.__relationOnWin === 'function') window.__relationOnWin();
  }

  // Ripple the glow outward from the top-left so it reads as one motion
  function celebrateGrid() {
    Object.keys(locked).map(Number).sort(function (a, b) { return a - b; })
      .forEach(function (i, n) {
        var el = cellEls[i];
        if (!el) return;
        el.style.animationDelay = (n * 34) + 'ms';
        el.classList.add('rl-celebrate');
        setTimeout(function () {
          el.classList.remove('rl-celebrate');
          el.style.animationDelay = '';
        }, 700 + n * 34);
      });
  }

  function populateWinOverlay() {
    document.getElementById('rl-win-theme').textContent = puzzle.theme;
    var ul = document.getElementById('rl-win-words');
    ul.innerHTML = '';
    puzzle.words.forEach(function (w) {
      var li = document.createElement('li');
      li.textContent = w;
      ul.appendChild(li);
    });
  }

  function openWin()  {
    document.getElementById('rl-win').classList.remove('rl-hide');
  }
  function closeWin() {
    document.getElementById('rl-win').classList.add('rl-hide');
    document.getElementById('rl-done-bar').classList.remove('rl-hide');
  }

  function currentWord() {
    return pathSel.map(letterAt).join('');
  }

  function clearPath() { pathSel = []; renderCells(); }

  // Lock a word's tiles. Part 3 drives this from real path validation; exposed
  // now so the found/locked visual can be exercised.
  function lockWord(word, cells) {
    cells.forEach(function (i) { locked[i] = word; });
    found[word] = true;
    pathSel = [];
    fillSlotRow(word);
    renderCells();
    renderProgress();
  }

  // ── Start ────────────────────────────────────────────────────────────────────

  function startPuzzle(p, status) {
    puzzle    = p;
    pathSel   = [];
    locked    = {};
    found     = {};
    rejecting = false;
    solved    = false;

    document.getElementById('rl-theme').textContent = p.theme;
    var d = new Date(p.dayKey + 'T00:00:00Z');
    document.getElementById('rl-date-label').textContent =
      d.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
      + (status === 'prelaunch' ? ' · preview' : '');

    renderGrid();
    renderSlots();

    // Restore an in-progress or finished round. Each word has exactly one valid
    // tile set (guaranteed when the puzzles were generated), so replaying the
    // stored solution path is provably the same cells the player locked.
    var stored = loadStored();
    var restored = false;
    if (stored && stored.day === getTodayKey() && Array.isArray(stored.found)) {
      stored.found.forEach(function (w) {
        var cells = puzzle.solution[w];
        if (!cells) return;
        cells.forEach(function (cell) { locked[idx(cell.r, cell.c)] = w; });
        found[w] = true;
        fillSlotRow(w);
        restored = true;
      });
    }

    document.getElementById('rl-done-bar').classList.add('rl-hide');
    document.getElementById('rl-win').classList.add('rl-hide');

    renderCells();
    renderProgress();
    show(gameEl);

    if (restored && Object.keys(found).length === puzzle.words.length) {
      triggerWin(true);
    }
  }

  function load() {
    show(loadingEl);
    fetchWithTimeout(PUZZLES_URL, FETCH_TIMEOUT_MS)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (list) {
        if (!Array.isArray(list) || !list.length) throw new Error('empty puzzle file');
        pending = pickPuzzle(list);
        document.getElementById('rl-splash-dir').textContent = DIRECTIONS_TEXT;
        show(splashEl);   // splash on every load; Play starts the grid
      })
      .catch(function (err) {
        document.getElementById('rl-error-msg').textContent =
          (err && err.name === 'AbortError')
            ? 'That took too long. Check your connection and try again.'
            : "Something went wrong loading today's grid. Try again.";
        show(errorEl);
      });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('help-btn').addEventListener('click', function () {
      openDirections(DIRECTIONS_TEXT);
    });
    document.getElementById('rl-retry-btn').addEventListener('click', load);
    document.getElementById('rl-clear-btn').addEventListener('click', clearPath);
    document.getElementById('rl-play-btn').addEventListener('click', function () {
      if (pending) startPuzzle(pending.puzzle, pending.status);
    });
    document.getElementById('rl-win-close').addEventListener('click', closeWin);
    document.getElementById('rl-reopen-win').addEventListener('click', openWin);

    document.getElementById('rl-share-btn').addEventListener('click', function () {
      shareText(getShareText(Object.keys(found).length, puzzle.words.length), 'Relation');
    });

    cleanupStale();

    document.getElementById('rl-grid').addEventListener('click', function (e) {
      var cell = e.target.closest && e.target.closest('.rl-cell');
      if (!cell || cell.classList.contains('rl-wall')) return;
      onCellClick(+cell.dataset.i);
    });

    load();
  });

  // Exposed for verification
  window.Relation = {
    getTodayKey: getTodayKey,
    pickPuzzle:  pickPuzzle,
    startPuzzle: startPuzzle,
    onCellClick: onCellClick,
    clearPath:   clearPath,
    lockWord:    lockWord,
    currentWord: currentWord,
    idx:         idx,
    attemptValidation: attemptValidation,
    unfoundWords:      unfoundWords,
    getShareText:      getShareText,
    cleanupStale:      cleanupStale,
    saveProgress:      saveProgress,
    loadStored:        loadStored,
    lsKey:             lsKey,
    openWin:           openWin,
    closeWin:          closeWin,
    getState:    function () {
      return { puzzle: puzzle, pathSel: pathSel.slice(), locked: locked,
               found: found, rejecting: rejecting, solved: solved };
    },
  };

}());
