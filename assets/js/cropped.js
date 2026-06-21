(function () {
  'use strict';

  // ── Directions text ───────────────────────────────────────────────────────
  var DIRECTIONS_TEXT = 'Cropped shows you a tiny piece of a painting. Your job is to guess the whole thing from four choices. You can reveal more of the painting before you decide, but you only get one guess, so choose carefully. A new painting appears every day. Come back tomorrow for another.';

  // ── Constants ─────────────────────────────────────────────────────────────
  var IIIF_BASE  = 'https://www.artic.edu/iiif/2';
  var AIC_SEARCH = 'https://api.artic.edu/api/v1/artworks/search';
  var LS_PREFIX  = 'cropped_result_';

  // ── IIIF crop stage definitions ───────────────────────────────────────────
  var STAGES = [
    { region: 'pct:35,35,30,30', size: '!400,400' },  // ~10% area
    { region: 'pct:25,25,50,50', size: '!400,400' },  // ~25% area
    { region: 'pct:15,15,70,70', size: '!500,500' },  // ~50% area
    { region: 'full',            size: '!600,600'  },  // 100%
  ];

  // ── Flavor lines ──────────────────────────────────────────────────────────
  var FLAVOR = {
    correct1: [
      'You knew it from a brushstroke. Show-off.',
      "One glance. That's all you needed.",
      "Either you've seen this one before, or you're just that good."
    ],
    correct2: [
      "Didn't even need much. Impressive.",
      'A small clue was all it took.',
      'Sharp eye. You barely needed the reveal.'
    ],
    correct3: [
      'Took a little convincing, but you got there.',
      'Halfway there, and you found it.',
      "A few more clues than you'd like to admit, but a win's a win."
    ],
    correct4: [
      "You needed the whole painting. We don't judge. Much.",
      'Every last clue, and you still got there.',
      'Slow and steady. Eventually.'
    ],
    incorrect: [
      'Bold guess. Wrong, but bold.',
      'Close in spirit, wrong in fact.',
      'Art is subjective. Your answer, less so. Still wrong though.'
    ]
  };

  // ── Day-key system ────────────────────────────────────────────────────────
  function getTodayKey() {
    return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  }

  // ── Deterministic PRNG — seeded by date string only ───────────────────────
  // hashString → unsigned 32-bit integer from a string
  function hashString(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h >>> 0;
  }

  // LCG (Knuth/Numerical Recipes constants, 2^32 modulus)
  function makePrng(seed) {
    var state = (seed >>> 0) || 2463534242;
    return function () {
      // state is always kept as an unsigned 32-bit integer via >>> 0
      // Multiplication stays within JS float precision (state < 2^32, multiplier < 2^21)
      state = ((state * 1664525) + 1013904223) >>> 0;
      return state / 4294967296; // [0, 1)
    };
  }

  // ── IIIF URL helpers ──────────────────────────────────────────────────────
  function stageUrl(imageId, stageIdx) {
    var s = STAGES[stageIdx];
    return IIIF_BASE + '/' + imageId + '/' + s.region + '/' + s.size + '/0/default.jpg';
  }

  function fullUrl(imageId) {
    return IIIF_BASE + '/' + imageId + '/full/!600,600/0/default.jpg';
  }

  // ── localStorage helpers ──────────────────────────────────────────────────
  function loadStored(storageKey) {
    try {
      var raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveStored(storageKey, obj) {
    try { localStorage.setItem(storageKey, JSON.stringify(obj)); } catch (e) {}
  }

  function cleanupStale(todayKey) {
    var toDelete = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0 && k !== LS_PREFIX + todayKey) {
          toDelete.push(k);
        }
      }
      for (var j = 0; j < toDelete.length; j++) {
        localStorage.removeItem(toDelete[j]);
      }
    } catch (e) {}
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function firstLine(str) {
    return (str || '').split('\n')[0].trim();
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var STAGE_PCT = [10, 25, 50, 100]; // crop stage → revealed area %

  var loadingEl, errorEl, gameEl, resultEl;
  var cropImgEl, revealBtnEl, optionsEl;
  var outcomeEl, resultImgEl, resultTitleEl, resultArtistEl, flavorEl, timeEl, comebackEl, shareBtnEl;

  // ── Game state ────────────────────────────────────────────────────────────
  var currentStage   = 0;
  var correctArtwork = null;
  var guessLocked    = false;
  var startTime      = null;

  // ── DOMContentLoaded ──────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    loadingEl      = document.getElementById('cr-loading');
    errorEl        = document.getElementById('cr-error');
    gameEl         = document.getElementById('cr-game');
    resultEl       = document.getElementById('cr-result');
    cropImgEl      = document.getElementById('cr-crop-img');
    revealBtnEl    = document.getElementById('cr-reveal-btn');
    optionsEl      = document.getElementById('cr-options');
    outcomeEl      = document.getElementById('cr-outcome');
    resultImgEl    = document.getElementById('cr-result-img');
    resultTitleEl  = document.getElementById('cr-result-title');
    resultArtistEl = document.getElementById('cr-result-artist');
    flavorEl       = document.getElementById('cr-flavor');
    timeEl         = document.getElementById('cr-time');
    comebackEl     = document.getElementById('cr-comeback');
    shareBtnEl     = document.getElementById('cr-share-btn');

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) {
      helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });
    }

    var todayKey   = getTodayKey();
    var storageKey = LS_PREFIX + todayKey;

    cleanupStale(todayKey);

    // ── Same-day round-lock check ──────────────────────────────────────────
    var stored = loadStored(storageKey);
    if (stored && stored.correctImageId) {
      setState('result');
      renderResult(stored);
      return;
    }

    // ── Fresh round ────────────────────────────────────────────────────────
    setState('loading');

    var seed = hashString(todayKey);
    var rng  = makePrng(seed);

    // Use first PRNG draw to pick which page of AIC results to fetch (1–20)
    // ~2037 public-domain paintings available = 21 pages of 100; use 1–20 to stay safe
    var page = Math.floor(rng() * 20) + 1;

    fetchPaintings(page, function (paintings) {
      if (!paintings || paintings.length < 4) { setState('error'); return; }

      // Deterministic correct painting
      var correctIdx = Math.floor(rng() * paintings.length);
      correctArtwork = paintings[correctIdx];

      // Deterministic decoys (3 unique, excluding correct)
      var usedIdx = [correctIdx];
      var decoys  = [];
      while (decoys.length < 3 && usedIdx.length < paintings.length) {
        var di = Math.floor(rng() * paintings.length);
        if (usedIdx.indexOf(di) === -1) {
          usedIdx.push(di);
          decoys.push(paintings[di]);
        }
      }
      if (decoys.length < 3) { setState('error'); return; }

      // Shuffle button order with Math.random() — only painting/decoy selection is deterministic
      var options = shuffle([correctArtwork].concat(decoys));

      setState('game');
      renderGame(options);
      startTime = Date.now();
    });
  });

  // ── State machine ─────────────────────────────────────────────────────────
  function setState(name) {
    toggle(loadingEl, name === 'loading');
    toggle(errorEl,   name === 'error');
    toggle(gameEl,    name === 'game');
    toggle(resultEl,  name === 'result');
  }

  function toggle(el, show) {
    if (!el) return;
    if (show) el.classList.remove('cr-hide');
    else      el.classList.add('cr-hide');
  }

  // ── Fetch paintings from AIC ──────────────────────────────────────────────
  function fetchPaintings(page, callback) {
    var body = JSON.stringify({
      query: {
        bool: {
          filter: [
            { term:  { is_public_domain: true } },
            { exists: { field: 'image_id' } }
          ],
          must: [
            { match: { artwork_type_title: 'Painting' } }
          ]
        }
      },
      fields: ['id', 'title', 'artist_display', 'image_id'],
      limit: 100,
      page:  page
    });

    fetch(AIC_SEARCH, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    body
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var raw = data.data || [];
      var paintings = raw.filter(function (p) {
        return p.image_id && p.title && p.artist_display;
      });
      callback(paintings.length >= 4 ? paintings : null);
    })
    .catch(function () { callback(null); });
  }

  // ── Render game state ─────────────────────────────────────────────────────
  function renderGame(options) {
    currentStage = 0;
    guessLocked  = false;

    // Stage-1 crop
    setImg(cropImgEl, stageUrl(correctArtwork.image_id, 0));

    // Reveal button
    revealBtnEl.disabled    = false;
    revealBtnEl.textContent = 'Reveal More';
    revealBtnEl.onclick     = handleReveal;

    // Option buttons
    optionsEl.innerHTML = '';
    options.forEach(function (artwork) {
      var btn = document.createElement('button');
      btn.className             = 'cr-option';
      btn.dataset.artworkId     = String(artwork.id);
      btn.innerHTML =
        '<span class="cr-opt-title">“' + esc(artwork.title) + '”</span>' +
        '<span class="cr-opt-artist">— ' + esc(firstLine(artwork.artist_display)) + '</span>';
      btn.addEventListener('click', function () {
        if (!guessLocked) handleGuess(artwork);
      });
      optionsEl.appendChild(btn);
    });
  }

  // ── Reveal more ───────────────────────────────────────────────────────────
  function handleReveal() {
    if (guessLocked || currentStage >= STAGES.length - 1) return;
    currentStage++;
    setImg(cropImgEl, stageUrl(correctArtwork.image_id, currentStage));
    if (currentStage >= STAGES.length - 1) revealBtnEl.disabled = true;
  }

  // ── Guess submission ──────────────────────────────────────────────────────
  function handleGuess(chosen) {
    if (guessLocked) return;
    guessLocked = true;

    var isCorrect  = chosen.id === correctArtwork.id;
    var elapsedSec = Math.max(0, Math.round((Date.now() - startTime) / 1000));

    // Highlight all buttons
    var btns = optionsEl.querySelectorAll('.cr-option');
    btns.forEach(function (btn) {
      btn.disabled = true;
      var aid = btn.dataset.artworkId;
      if (aid === String(correctArtwork.id)) {
        btn.classList.add('cr-opt-correct');
      } else if (aid === String(chosen.id)) {
        btn.classList.add('cr-opt-wrong');
      } else {
        btn.classList.add('cr-opt-dim');
      }
    });
    revealBtnEl.disabled = true;

    var result = {
      outcome:        isCorrect ? 'correct' : 'incorrect',
      stage:          currentStage + 1,   // 1–4
      elapsedSec:     elapsedSec,
      correctTitle:   correctArtwork.title,
      correctArtist:  correctArtwork.artist_display,
      correctImageId: correctArtwork.image_id
    };

    saveStored(LS_PREFIX + getTodayKey(), result);

    setTimeout(function () {
      setState('result');
      renderResult(result);
    }, 900);
  }

  // ── Render result screen ──────────────────────────────────────────────────
  function renderResult(result) {
    var isCorrect  = result.outcome === 'correct';
    var flavorKey  = isCorrect ? ('correct' + result.stage) : 'incorrect';
    var flavorList = FLAVOR[flavorKey] || FLAVOR.incorrect;

    outcomeEl.textContent = isCorrect ? 'You got it.' : 'Not quite.';
    outcomeEl.className   = 'cr-outcome ' + (isCorrect ? 'cr-outcome-correct' : 'cr-outcome-incorrect');

    setImg(resultImgEl, fullUrl(result.correctImageId));

    resultTitleEl.textContent  = '“' + result.correctTitle + '”';
    resultArtistEl.textContent = '— ' + firstLine(result.correctArtist);
    flavorEl.textContent       = pickRandom(flavorList);
    timeEl.textContent         = 'You took ' + result.elapsedSec + ' seconds to decide.';
    comebackEl.textContent     = 'Come back tomorrow for a new piece.';

    var pct = STAGE_PCT[(result.stage || 1) - 1];
    var shareMsg = isCorrect
      ? 'Cropped — guessed today\'s painting correctly at the ' + pct + '% reveal in ' + result.elapsedSec + ' seconds. https://www.thebunnygame.com/cropped'
      : 'Cropped — missed today\'s painting at the ' + pct + '% reveal after ' + result.elapsedSec + ' seconds. https://www.thebunnygame.com/cropped';
    shareBtnEl.onclick = function () { shareText(shareMsg, 'Cropped'); };
  }

  // ── Image helper with fade-in ─────────────────────────────────────────────
  function setImg(imgEl, src) {
    imgEl.classList.remove('cr-img-loaded');
    imgEl.src   = src;
    imgEl.onload  = function () { imgEl.classList.add('cr-img-loaded'); };
    imgEl.onerror = function () { imgEl.classList.add('cr-img-loaded'); }; // show broken placeholder
  }

})();
