(function () {
  'use strict';

  var DIRECTIONS = 'Each day, a passage from a classic work of literature is loaded for all players. One word has been deliberately mistyped — either a letter changed or two adjacent letters swapped. Click Start — the clock begins immediately. Scan the passage carefully and click the word you think is wrong. Clicking the wrong word adds 3 seconds to your time. When you find it, the clock stops. Come back tomorrow for a new passage.';

  var SHARE_URL = 'https://www.thebunnygame.com/proof';
  var LS_PREFIX = 'proof_result_';
  var FETCH_TIMEOUT_MS = 7000;

  // ── Day key ─────────────────────────────────────────────────────────────────
  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function hashString(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h >>> 0;
  }

  function getDailyEntry(index) {
    var key = getTodayKey();
    var hash = hashString(key);
    return index[hash % index.length];
  }

  // ── localStorage ─────────────────────────────────────────────────────────────
  function loadStored(key) {
    try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch (e) { return null; }
  }

  function saveStored(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }

  function cleanupStale(todayKey) {
    var toDelete = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0 && k !== LS_PREFIX + todayKey) toDelete.push(k);
      }
      toDelete.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }

  // ── Fetch with AbortController timeout ───────────────────────────────────────
  function fetchWithTimeout(url, ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    var opts = ctrl ? { signal: ctrl.signal } : {};
    return fetch(url, opts).then(function (r) {
      if (timer) clearTimeout(timer);
      return r;
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      throw e;
    });
  }

  // ── Escape string for use in RegExp constructor ───────────────────────────────
  function escRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ── Clean raw Gutenberg text slice ────────────────────────────────────────────
  function cleanSlice(raw) {
    return raw
      .replace(/\r/g, '')
      .replace(/\n/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/_/g, '')        // strip Gutenberg italic underscores
      .trim();
  }

  // ── Format elapsed ms as "X.XXs" ─────────────────────────────────────────────
  function formatTime(ms) {
    return (ms / 1000).toFixed(2) + 's';
  }

  // ── Render passage into container as clickable word-spans (or plain text) ─────
  function renderPassage(container, text, clickable, typoWord) {
    container.innerHTML = '';

    // Split preserving whitespace tokens
    var parts = text.split(/(\s+)/);

    parts.forEach(function (part) {
      if (/^\s+$/.test(part)) {
        container.appendChild(document.createTextNode(part));
        return;
      }
      if (!part) return;

      // Separate leading/trailing punctuation from the alphabetic word core
      // Include apostrophe inside words (contractions, possessives)
      var m = part.match(/^([^A-Za-z']*)([A-Za-z][A-Za-z'-]*)([^A-Za-z']*)$/);
      if (!m || !m[2]) {
        container.appendChild(document.createTextNode(part));
        return;
      }

      if (m[1]) container.appendChild(document.createTextNode(m[1]));

      var word = m[2];

      if (clickable) {
        var span = document.createElement('span');
        span.className = 'pf-word';
        span.textContent = word;
        span.dataset.word = word;
        if (word === typoWord) span.dataset.isTypo = '1';
        container.appendChild(span);
      } else {
        // Result view: highlight only the typo word
        if (word === typoWord) {
          var mark = document.createElement('mark');
          mark.className = 'pf-highlight';
          mark.textContent = word;
          container.appendChild(mark);
        } else {
          container.appendChild(document.createTextNode(word));
        }
      }

      if (m[3]) container.appendChild(document.createTextNode(m[3]));
    });
  }

  // ── State ─────────────────────────────────────────────────────────────────────
  var todayKey    = getTodayKey();
  var lsKey       = LS_PREFIX + todayKey;
  var entry       = null;
  var passageText = '';
  var gameActive  = false;
  var startTime   = null;
  var penaltyMs   = 0;
  var timerRAF    = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────────
  var loadingEl    = document.getElementById('pf-loading');
  var errorEl      = document.getElementById('pf-error');
  var splashEl     = document.getElementById('pf-splash');
  var gameEl       = document.getElementById('pf-game');
  var resultEl     = document.getElementById('pf-result');
  var timerEl      = document.getElementById('pf-timer');
  var passageEl    = document.getElementById('pf-passage');
  var startBtnEl   = document.getElementById('pf-start-btn');
  var retryBtnEl   = document.getElementById('pf-retry-btn');
  var resultTimeEl = document.getElementById('pf-result-time');
  var resultPassEl = document.getElementById('pf-result-passage');
  var resultSrcEl  = document.getElementById('pf-result-source');
  var shareBtnEl   = document.getElementById('pf-share-btn');
  var splashSrcEl  = document.getElementById('pf-splash-source');

  // ── Section visibility ────────────────────────────────────────────────────────
  function show(el) {
    [loadingEl, errorEl, splashEl, gameEl, resultEl].forEach(function (e) {
      if (e) e.classList.add('pf-hide');
    });
    if (el) el.classList.remove('pf-hide');
  }

  // ── Timer (rAF loop) ──────────────────────────────────────────────────────────
  function tickTimer() {
    if (!gameActive) return;
    var elapsed = Date.now() - startTime + penaltyMs;
    if (timerEl) timerEl.textContent = formatTime(elapsed);
    timerRAF = requestAnimationFrame(tickTimer);
  }

  function startTimer() {
    startTime  = Date.now();
    penaltyMs  = 0;
    gameActive = true;
    timerRAF   = requestAnimationFrame(tickTimer);
  }

  function stopTimer() {
    gameActive = false;
    if (timerRAF) { cancelAnimationFrame(timerRAF); timerRAF = null; }
    return Date.now() - startTime + penaltyMs;
  }

  // ── Word click handler ────────────────────────────────────────────────────────
  function onWordClick(e) {
    if (!gameActive) return;
    var target = e.target;
    if (!target.classList.contains('pf-word')) return;

    if (target.dataset.isTypo === '1') {
      // Correct!
      var elapsed = stopTimer();
      target.classList.add('pf-correct');
      saveStored(lsKey, { elapsed: elapsed, solved: true });
      setTimeout(function () { showResult(elapsed); }, 700);

    } else {
      // Penalty: +3s, brief red flash
      penaltyMs += 3000;
      target.classList.add('pf-penalty');
      setTimeout(function () { target.classList.remove('pf-penalty'); }, 420);
    }
  }

  // ── Show splash with game-ready passage ───────────────────────────────────────
  function showSplash() {
    if (splashSrcEl) splashSrcEl.textContent = entry.title + ' — ' + entry.author;
    show(splashEl);

    if (startBtnEl) {
      startBtnEl.onclick = function () {
        show(gameEl);
        if (passageEl) {
          renderPassage(passageEl, passageText, true, entry.typoWordCorrupted);
          passageEl.addEventListener('click', onWordClick);
        }
        startTimer();
      };
    }
  }

  // ── Show result screen ────────────────────────────────────────────────────────
  function showResult(elapsed) {
    show(resultEl);
    if (resultTimeEl) resultTimeEl.textContent = formatTime(elapsed);
    if (resultSrcEl)  resultSrcEl.textContent  = entry.title + ' — ' + entry.author;
    if (resultPassEl) renderPassage(resultPassEl, passageText, false, entry.typoWordCorrupted);
    if (shareBtnEl) {
      shareBtnEl.onclick = function () {
        shareText('Proof — ' + formatTime(elapsed) + '\n' + SHARE_URL, 'Proof');
      };
    }
  }

  // ── Load today's passage from the index (no external fetch needed) ───────────
  function loadPassage(storedResult) {
    show(loadingEl);

    fetch('assets/data/proof-index.json')
      .then(function (r) { return r.json(); })
      .then(function (index) {
        entry       = getDailyEntry(index);
        passageText = entry.passage;

        if (storedResult && storedResult.solved) {
          showResult(storedResult.elapsed);
        } else {
          showSplash();
        }
      })
      .catch(function (err) {
        console.error('Proof load error:', err);
        show(errorEl);
      });
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  function init() {
    cleanupStale(todayKey);

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS); });

    if (retryBtnEl) retryBtnEl.addEventListener('click', function () { loadPassage(null); });

    var stored = loadStored(lsKey);
    loadPassage(stored);
  }

  document.addEventListener('DOMContentLoaded', init);

}());
