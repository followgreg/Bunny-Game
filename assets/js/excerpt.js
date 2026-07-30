(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────────

  var DIRECTIONS_TEXT =
    'Excerpt shows you a passage from a classic work of literature, revealed ' +
    'in stages. First, just three words. Then a sentence. Then two. Then the ' +
    'full paragraph. Four possible answers are shown from the start — the ' +
    'title and author of the work. Guess whenever you feel confident. You only ' +
    'get one guess, so choose your moment. The earlier you identify it, the ' +
    'more impressive the result. A new passage appears every day.';

  var INDEX_URL        = 'assets/data/excerpt-index.json';
  var LS_PREFIX        = 'excerpt_result_';
  var FETCH_TIMEOUT_MS = 5000;
  var TOTAL_STAGES     = 4;

  var STATES = {
    LOADING:        'loading',
    STAGE_1:        'stage_1',
    STAGE_2:        'stage_2',
    STAGE_3:        'stage_3',
    STAGE_4:        'stage_4',
    RESULT:         'result',
    ALREADY_PLAYED: 'already_played',
  };

  var STAGE_LABELS = [
    'First three words',
    'First sentence',
    'First two sentences',
    'Full paragraph',
  ];

  // Earlier is more impressive — the copy reflects that.
  var CORRECT_MSG = [
    'You identified it from just 3 words.',
    'You identified it from the first sentence.',
    'You identified it from the first two sentences.',
    'You needed the full paragraph.',
  ];

  var WRONG_MSG = [
    'You called it from just 3 words — bold, but not this time.',
    'You called it from the first sentence.',
    'You called it from the first two sentences.',
    'You had the full paragraph to go on.',
  ];

  // ── Day key — identical to Proof and Cropped ────────────────────────────────
  // toISOString() is always UTC, so every player worldwide gets the same passage
  // on the same calendar day.
  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  // NOTE: the brief's snippet used `Math.abs(hash | 0)`, but proof.js and
  // cropped.js both use `h >>> 0`. Those pick different passages for the same
  // date, so this matches the existing games as the brief actually asked.
  function hashString(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h >>> 0;
  }

  function getDailyPassage(index) {
    return index[hashString(getTodayKey()) % index.length];
  }

  // Deterministic PRNG so the option order is the same for every player all day
  function makePrng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ── Share ────────────────────────────────────────────────────────────────────
  // Reveals only how early the player committed, never the title, the author, or
  // any passage text — same principle as Proof.

  var SHARE_URL   = 'https://www.thebunnygame.com/excerpt';
  var SHARE_GRID  = true;   // set false to drop the emoji row

  var STAGE_DESCRIPTIONS = {
    1: 'from just 3 words',
    2: 'after one sentence',
    3: 'after two sentences',
    4: 'only after the full paragraph',
  };

  function getShareText(correct, stageGuessedAt, totalStages) {
    if (!correct) {
      return "Excerpt — couldn't place today's passage. Can you? " + SHARE_URL;
    }
    return "Excerpt — identified today's passage " +
           STAGE_DESCRIPTIONS[stageGuessedAt] +
           '. Think you can do better? ' + SHARE_URL;
  }

  // One square per stage: the stage the player committed at is green when right
  // and red when wrong; every other stage stays blank. Carries no information
  // about which book it was.
  function getShareGrid(correct, stageGuessedAt, totalStages) {
    var n = totalStages || TOTAL_STAGES;
    var out = '';
    for (var i = 1; i <= n; i++) {
      out += (i === stageGuessedAt) ? (correct ? '🟩' : '🟥') : '⬜';
    }
    return out;
  }

  function buildShareMessage(result) {
    var body = getShareText(result.correct, result.stage, TOTAL_STAGES);
    if (!SHARE_GRID) return body;
    return getShareGrid(result.correct, result.stage, TOTAL_STAGES) + '\n' + body;
  }

  // ── localStorage round lock (same shape as Cropped and Proof) ────────────────
  function loadStored(key) {
    try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }

  function saveStored(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }

  function cleanupStale(todayKey) {
    var doomed = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0 && k !== LS_PREFIX + todayKey) doomed.push(k);
      }
      doomed.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
    return doomed.length;
  }

  // ── Fetch with timeout ───────────────────────────────────────────────────────
  function fetchWithTimeout(url, ms) {
    var ctrl  = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { if (timer) clearTimeout(timer); return r; })
      .catch(function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  // ── Stage extraction ─────────────────────────────────────────────────────────
  // stage2SentenceEnd / stage3SentenceEnd are offsets WITHIN the passage, so no
  // charStart subtraction is needed.
  function buildStages(entry) {
    var p = entry.passage;
    var firstThree = p.trim().split(/\s+/).slice(0, 3).join(' ');
    return [
      firstThree + '…',
      p.slice(0, entry.stage2SentenceEnd).trim(),
      p.slice(0, entry.stage3SentenceEnd).trim(),
      p.trim(),
    ];
  }

  function buildOptions(entry) {
    var opts = entry.distractors.concat([entry.correctAnswer]);
    var rand = makePrng(hashString(getTodayKey() + '|' + entry.id));
    for (var i = opts.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = opts[i]; opts[i] = opts[j]; opts[j] = t;
    }
    return opts;
  }

  // ── State ────────────────────────────────────────────────────────────────────
  var entry    = null;
  var stages   = [];
  var options  = [];
  var stageIdx = 0;
  var state    = STATES.LOADING;
  var locked   = false;          // one guess only — set the instant a guess lands
  var todayKey = getTodayKey();
  var lsKey    = LS_PREFIX + todayKey;

  // ── DOM ──────────────────────────────────────────────────────────────────────
  var loadingEl  = document.getElementById('ex-loading');
  var errorEl    = document.getElementById('ex-error');
  var errorMsgEl = document.getElementById('ex-error-msg');
  var gameEl     = document.getElementById('ex-game');
  var resultEl   = document.getElementById('ex-result');

  function show(el) {
    [loadingEl, errorEl, gameEl, resultEl].forEach(function (e) {
      if (e) e.classList.add('ex-hide');
    });
    if (el) el.classList.remove('ex-hide');
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  function renderStage() {
    var passEl = document.getElementById('ex-passage');
    passEl.textContent = stages[stageIdx];
    passEl.className = 'ex-passage ex-stage-' + (stageIdx + 1);

    var pips = document.getElementById('ex-pips');
    pips.innerHTML = '';
    for (var i = 0; i < TOTAL_STAGES; i++) {
      var d = document.createElement('span');
      d.className = 'ex-pip' + (i <= stageIdx ? ' ex-on' : '');
      pips.appendChild(d);
    }

    document.getElementById('ex-stage-label').textContent = STAGE_LABELS[stageIdx];
    document.getElementById('ex-stage-count').textContent =
      'Stage ' + (stageIdx + 1) + ' of ' + TOTAL_STAGES;

    // Disabled rather than hidden on the last stage, so the layout doesn't jump
    var btn = document.getElementById('ex-reveal-btn');
    if (stageIdx >= TOTAL_STAGES - 1) {
      btn.disabled = true;
      btn.textContent = 'Nothing more to reveal';
    } else {
      btn.disabled = false;
      btn.textContent = 'Reveal more';
    }

    state = STATES['STAGE_' + (stageIdx + 1)];
  }

  function renderOptions() {
    var wrap = document.getElementById('ex-options');
    wrap.innerHTML = '';
    options.forEach(function (label) {
      var b = document.createElement('button');
      b.className = 'ex-option';
      b.dataset.answer = label;

      // "Title — Author" → styled separately
      var split = label.split(' — ');
      var t = document.createElement('span');
      t.className = 'ex-opt-title';
      t.textContent = split[0];
      b.appendChild(t);
      if (split[1]) {
        var a = document.createElement('span');
        a.className = 'ex-opt-author';
        a.textContent = ' — ' + split.slice(1).join(' — ');
        b.appendChild(a);
      }
      wrap.appendChild(b);
    });
  }

  function revealMore() {
    if (locked) return;
    if (stageIdx >= TOTAL_STAGES - 1) return;
    stageIdx++;
    renderStage();
  }

  // ── The one guess ────────────────────────────────────────────────────────────
  // Clicking any option commits immediately — no confirmation, no second attempt.
  function submitGuess(guessLabel) {
    if (locked) return;
    locked = true;

    var isCorrect = guessLabel === entry.correctAnswer;
    var result = {
      day:     todayKey,
      stage:   stageIdx + 1,
      guess:   guessLabel,
      answer:  entry.correctAnswer,
      correct: isCorrect,
    };
    saveStored(lsKey, result);

    // Mark up the options in place, then hand over to the result screen
    var wrap = document.getElementById('ex-options');
    wrap.classList.add('ex-locked');
    [].forEach.call(wrap.querySelectorAll('.ex-option'), function (b) {
      b.disabled = true;
      var isThisCorrect = b.dataset.answer === entry.correctAnswer;
      var isThisGuess   = b.dataset.answer === guessLabel;
      if (isThisGuess && isCorrect)  { b.classList.add('ex-picked-right'); addMark(b, 'Correct'); }
      else if (isThisGuess)          { b.classList.add('ex-picked-wrong'); addMark(b, 'Your guess'); }
      else if (isThisCorrect)        { b.classList.add('ex-was-right');    addMark(b, 'Answer'); }
    });
    document.getElementById('ex-reveal-btn').disabled = true;

    setTimeout(function () { showResult(result); }, 900);
  }

  function addMark(btn, text) {
    var s = document.createElement('span');
    s.className = 'ex-option-mark';
    s.textContent = text;
    btn.insertBefore(s, btn.firstChild);
  }

  // ── Result screen ────────────────────────────────────────────────────────────
  function showResult(result, returning) {
    state = returning ? STATES.ALREADY_PLAYED : STATES.RESULT;

    var v = document.getElementById('ex-verdict');
    v.textContent = result.correct ? 'Correct' : 'Not this one';
    v.className = 'ex-verdict ' + (result.correct ? 'ex-is-right' : 'ex-is-wrong');

    var msgs = result.correct ? CORRECT_MSG : WRONG_MSG;
    document.getElementById('ex-verdict-sub').textContent = msgs[result.stage - 1];

    // Always the full paragraph here, even if the player guessed at stage 1
    document.getElementById('ex-result-passage').textContent = stages[TOTAL_STAGES - 1];
    document.getElementById('ex-result-source').textContent =
      '— ' + entry.title + ', ' + entry.author;

    document.getElementById('ex-result-date').textContent =
      new Date().toLocaleDateString(undefined,
        { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById('ex-result-stagecount').textContent =
      'Guessed at stage ' + result.stage + ' of ' + TOTAL_STAGES;

    var lines = document.getElementById('ex-answer-lines');
    lines.innerHTML = '';
    function line(labelText, value, cls) {
      var d = document.createElement('div');
      d.className = 'ex-answer-line ' + cls;
      var l = document.createElement('span');
      l.className = 'ex-al-label';
      l.textContent = labelText;
      d.appendChild(l);
      d.appendChild(document.createTextNode(value));
      lines.appendChild(d);
    }
    if (result.correct) {
      line('Your answer', result.answer, 'ex-al-right');
    } else {
      line('Your guess', result.guess, 'ex-al-wrong');
      line('The answer', result.answer, 'ex-al-right');
    }

    show(resultEl);
  }

  function startGame() {
    stageIdx = 0;
    var d = new Date();
    document.getElementById('ex-date-label').textContent =
      d.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
    renderStage();
    renderOptions();
    show(gameEl);
  }

  // ── Load ─────────────────────────────────────────────────────────────────────

  function load() {
    show(loadingEl);
    fetchWithTimeout(INDEX_URL, FETCH_TIMEOUT_MS)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (index) {
        if (!Array.isArray(index) || !index.length) throw new Error('empty index');
        entry   = getDailyPassage(index);
        stages  = buildStages(entry);
        options = buildOptions(entry);

        cleanupStale(todayKey);

        // Already played today? Go straight to the stored outcome.
        var stored = loadStored(lsKey);
        if (stored && stored.day === todayKey &&
            typeof stored.correct === 'boolean' &&
            stored.stage >= 1 && stored.stage <= TOTAL_STAGES) {
          locked = true;
          showResult(stored, true);
          return;
        }

        // No splash — the passage and options are the entry point, as in Proof
        startGame();
      })
      .catch(function (err) {
        var aborted = err && (err.name === 'AbortError');
        errorMsgEl.textContent = aborted
          ? 'That took too long. Check your connection and try again.'
          : "Something went wrong reaching today's passage. Try again.";
        show(errorEl);
      });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('help-btn').addEventListener('click', function () {
      openDirections(DIRECTIONS_TEXT);
    });
    document.getElementById('ex-retry-btn').addEventListener('click', load);
    document.getElementById('ex-reveal-btn').addEventListener('click', revealMore);

    // Delegated so it survives re-rendering the option list
    document.getElementById('ex-options').addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.ex-option');
      if (!btn || btn.disabled) return;
      submitGuess(btn.dataset.answer);
    });

    document.getElementById('ex-share-btn').addEventListener('click', function () {
      var r = loadStored(lsKey);
      if (!r) return;
      shareText(buildShareMessage(r), 'Excerpt');
    });

    load();
  });

  // Exposed for verification
  window.Excerpt = {
    STATES:           STATES,
    getTodayKey:      getTodayKey,
    hashString:       hashString,
    getDailyPassage:  getDailyPassage,
    buildStages:      buildStages,
    buildOptions:     buildOptions,
    revealMore:       revealMore,
    startGame:        startGame,
    submitGuess:      submitGuess,
    cleanupStale:     cleanupStale,
    getShareText:     getShareText,
    getShareGrid:     getShareGrid,
    buildShareMessage: buildShareMessage,
    lsKey:            function () { return lsKey; },
    getState:         function () {
      return { entry: entry, stages: stages, options: options,
               stageIdx: stageIdx, state: state, locked: locked };
    },
    _setStage:        function (i) { stageIdx = i; renderStage(); },
  };

})();
