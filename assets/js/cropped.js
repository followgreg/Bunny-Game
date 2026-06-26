(function () {
  'use strict';

  // ── Directions text ───────────────────────────────────────────────────────
  var DIRECTIONS_TEXT = 'Cropped shows you a tiny piece of a painting. Your job is to guess the whole thing from four choices. You can reveal more of the painting before you decide, but you only get one guess, so choose carefully. A new painting appears every day. Come back tomorrow for another.';

  // ── Constants ─────────────────────────────────────────────────────────────
  var MET_BASE          = 'https://collectionapi.metmuseum.org/public/collection/v1';
  var MET_IDS_CACHE_KEY = 'cropped_met_ids_v1';
  var MET_IDS_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
  var LS_PREFIX         = 'cropped_result_';

  // ── Crop stage bg-sizes ───────────────────────────────────────────────────
  // Simulate centered IIIF pct crops via CSS background-size at 50% 50%:
  //   333% ≈ pct:35,35,30,30  (~10% area)
  //   200% ≈ pct:25,25,50,50  (~25% area)
  //   143% ≈ pct:15,15,70,70  (~50% area)
  //   contain = full painting
  var STAGE_BG_SIZES = ['333%', '200%', '143%', 'contain'];
  var STAGE_PCT      = [10, 25, 50, 100];

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
    return new Date().toISOString().slice(0, 10);
  }

  // ── Deterministic PRNG — seeded by date string ────────────────────────────
  function hashString(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h >>> 0;
  }

  function makePrng(seed) {
    var state = (seed >>> 0) || 2463534242;
    return function () {
      state = ((state * 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  // ── localStorage helpers ──────────────────────────────────────────────────
  function loadStored(key) {
    try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
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
      for (var j = 0; j < toDelete.length; j++) localStorage.removeItem(toDelete[j]);
    } catch (e) {}
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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

  function firstLine(str) { return (str || '').split('\n')[0].trim(); }

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var loadingEl, errorEl, gameEl, resultEl;
  var cropImgEl, revealBtnEl, optionsEl;
  var outcomeEl, resultImgEl, resultTitleEl, resultArtistEl, flavorEl, timeEl, comebackEl, shareBtnEl;

  // ── Game state ────────────────────────────────────────────────────────────
  var currentStage   = 0;
  var correctArtwork = null;
  var guessLocked    = false;
  var startTime      = null;

  // ── MET API ───────────────────────────────────────────────────────────────

  // Fetch and cache the full list of public-domain European Paintings object IDs.
  function getMetPaintingIds(callback) {
    try {
      var raw = localStorage.getItem(MET_IDS_CACHE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Date.now() - parsed.ts < MET_IDS_CACHE_TTL && parsed.ids && parsed.ids.length) {
          callback(parsed.ids);
          return;
        }
      }
    } catch (e) {}

    fetch(MET_BASE + '/objects?departmentIds=11&isPublicDomain=true')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.objectIDs || !data.objectIDs.length) { callback(null); return; }
        var ids = data.objectIDs.slice().sort(function (a, b) { return a - b; });
        try { localStorage.setItem(MET_IDS_CACHE_KEY, JSON.stringify({ ids: ids, ts: Date.now() })); } catch (e) {}
        callback(ids);
      })
      .catch(function () { callback(null); });
  }

  // Fetch a single MET object; callback receives artwork object or null.
  function fetchMetArtwork(objectId, callback) {
    fetch(MET_BASE + '/objects/' + objectId)
      .then(function (r) { return r.json(); })
      .then(function (obj) {
        var imageUrl = obj.primaryImageSmall || obj.primaryImage;
        if (!imageUrl || !obj.isPublicDomain) { callback(null); return; }
        var artist = obj.artistDisplayName
          ? (obj.artistDisplayName + (obj.artistDisplayBio ? ' (' + obj.artistDisplayBio + ')' : ''))
          : 'Unknown Artist';
        callback({
          id:             obj.objectID,
          title:          obj.title || 'Untitled',
          artist_display: artist,
          image_url:      imageUrl
        });
      })
      .catch(function () { callback(null); });
  }

  // Use PRNG to generate candidate IDs (synchronous), then fetch sequentially
  // until we have 'needed' valid artworks with images.
  function pickArtworks(ids, rng, needed, callback) {
    var used       = {};
    var candidates = [];
    var tries      = 0;
    var maxTries   = needed * 8;
    while (candidates.length < maxTries && tries < maxTries * 3) {
      tries++;
      var idx = Math.floor(rng() * ids.length);
      if (!used[idx]) {
        used[idx] = true;
        candidates.push(ids[idx]);
      }
    }

    var results = [];
    var ci      = 0;

    function next() {
      if (results.length >= needed || ci >= candidates.length) {
        callback(results.length >= needed ? results : null);
        return;
      }
      fetchMetArtwork(candidates[ci++], function (artwork) {
        if (artwork) results.push(artwork);
        next();
      });
    }

    next();
  }

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

  // ── Crop image helpers ────────────────────────────────────────────────────

  // Load url into a hidden Image; once loaded set it as background-image on cropImgEl.
  function setCropImg(url, stageIdx) {
    cropImgEl.classList.remove('cr-img-loaded');
    var img   = new Image();
    img.onload = function () {
      cropImgEl.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
      cropImgEl.style.backgroundSize  = STAGE_BG_SIZES[stageIdx];
      cropImgEl.classList.add('cr-img-loaded');
    };
    img.onerror = function () {
      cropImgEl.classList.add('cr-img-loaded');
    };
    img.src = url;
  }

  // Update the crop zoom level without reloading the image.
  function applyCropStage(stageIdx) {
    cropImgEl.style.backgroundSize = STAGE_BG_SIZES[stageIdx];
  }

  // ── Render game state ─────────────────────────────────────────────────────
  function renderGame(options) {
    currentStage = 0;
    guessLocked  = false;

    setCropImg(correctArtwork.image_url, 0);

    revealBtnEl.disabled    = false;
    revealBtnEl.textContent = 'Reveal More';
    revealBtnEl.onclick     = handleReveal;

    optionsEl.innerHTML = '';
    options.forEach(function (artwork) {
      var btn = document.createElement('button');
      btn.className         = 'cr-option';
      btn.dataset.artworkId = String(artwork.id);
      btn.innerHTML =
        '<span class="cr-opt-title">"' + esc(artwork.title) + '"</span>' +
        '<span class="cr-opt-artist">— ' + esc(firstLine(artwork.artist_display)) + '</span>';
      btn.addEventListener('click', function () {
        if (!guessLocked) handleGuess(artwork);
      });
      optionsEl.appendChild(btn);
    });
  }

  // ── Reveal more ───────────────────────────────────────────────────────────
  function handleReveal() {
    if (guessLocked || currentStage >= STAGE_BG_SIZES.length - 1) return;
    currentStage++;
    applyCropStage(currentStage);
    if (currentStage >= STAGE_BG_SIZES.length - 1) revealBtnEl.disabled = true;
  }

  // ── Guess submission ──────────────────────────────────────────────────────
  function handleGuess(chosen) {
    if (guessLocked) return;
    guessLocked = true;

    var isCorrect  = chosen.id === correctArtwork.id;
    var elapsedSec = Math.max(0, Math.round((Date.now() - startTime) / 1000));

    var btns = optionsEl.querySelectorAll('.cr-option');
    btns.forEach(function (btn) {
      btn.disabled = true;
      var aid = btn.dataset.artworkId;
      if (aid === String(correctArtwork.id))   btn.classList.add('cr-opt-correct');
      else if (aid === String(chosen.id))       btn.classList.add('cr-opt-wrong');
      else                                      btn.classList.add('cr-opt-dim');
    });
    revealBtnEl.disabled = true;

    var result = {
      outcome:         isCorrect ? 'correct' : 'incorrect',
      stage:           currentStage + 1,
      elapsedSec:      elapsedSec,
      correctTitle:    correctArtwork.title,
      correctArtist:   correctArtwork.artist_display,
      correctImageUrl: correctArtwork.image_url
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

    setImg(resultImgEl, result.correctImageUrl);

    resultTitleEl.textContent  = '"' + result.correctTitle + '"';
    resultArtistEl.textContent = '— ' + firstLine(result.correctArtist);
    flavorEl.textContent       = pickRandom(flavorList);
    timeEl.textContent         = 'You took ' + result.elapsedSec + ' seconds to decide.';
    comebackEl.textContent     = 'Come back tomorrow for a new piece.';

    var pct      = STAGE_PCT[(result.stage || 1) - 1];
    var shareMsg = isCorrect
      ? 'Cropped — guessed today\'s painting correctly at the ' + pct + '% reveal in ' + result.elapsedSec + ' seconds. https://www.thebunnygame.com/cropped'
      : 'Cropped — missed today\'s painting at the ' + pct + '% reveal after ' + result.elapsedSec + ' seconds. https://www.thebunnygame.com/cropped';
    shareBtnEl.onclick = function () { shareText(shareMsg, 'Cropped'); };
  }

  // ── Image helper with fade-in (result img only) ───────────────────────────
  function setImg(imgEl, src) {
    imgEl.classList.remove('cr-img-loaded');
    imgEl.src     = src;
    imgEl.onload  = function () { imgEl.classList.add('cr-img-loaded'); };
    imgEl.onerror = function () { imgEl.classList.add('cr-img-loaded'); };
  }

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
    if (helpBtn) helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });

    var todayKey   = getTodayKey();
    var storageKey = LS_PREFIX + todayKey;

    cleanupStale(todayKey);

    // ── Same-day round-lock check ──────────────────────────────────────────
    var stored = loadStored(storageKey);
    if (stored && stored.correctImageUrl) {
      setState('result');
      renderResult(stored);
      return;
    }

    // ── Fresh round ────────────────────────────────────────────────────────
    setState('loading');

    var seed = hashString(todayKey);
    var rng  = makePrng(seed);

    getMetPaintingIds(function (ids) {
      if (!ids || ids.length < 4) { setState('error'); return; }

      pickArtworks(ids, rng, 4, function (artworks) {
        if (!artworks || artworks.length < 4) { setState('error'); return; }

        correctArtwork = artworks[0];
        var options    = shuffle([correctArtwork].concat(artworks.slice(1)));

        setState('game');
        renderGame(options);
        startTime = Date.now();
      });
    });
  });

})();
