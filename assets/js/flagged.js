(function () {
  'use strict';

  var DIRECTIONS_TEXT = 'Eight flags appear on screen. Somewhere in that group, two capitals are closer to each other than any other pair on the board. Select those two flags and tap Submit. Get it right and your streak grows. Get it wrong and the run ends. Every round is completely random — no two players see the same board.';

  var LS_BEST         = 'flagged_bestStreak';
  var MIN_GAP_MILES   = 500;
  var MAX_RETRIES     = 200;
  var EASY_ROUNDS     = 10;
  var HAVERSINE_R     = 3958.8; // miles

  // ── State ──────────────────────────────────────────────────────────────────
  var capitals      = null;
  var streak        = 0;
  var bestStreak    = 0;
  var roundNumber   = 0;
  var currentRound  = null; // { countries, pairs }
  var selected      = [];   // up to 2 indices into currentRound.countries

  // ── DOM refs ───────────────────────────────────────────────────────────────
  var loadingEl, gameEl, revealEl, endEl;
  var infoEl, flagsEl, submitEl;
  var revealOutcomeEl, mapWrapEl, distanceEl, nextBtnEl;
  var streakDisplayEl, shareBtnEl, playAgainBtnEl;

  // ── DOMContentLoaded ───────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    loadingEl       = document.getElementById('fl-loading');
    gameEl          = document.getElementById('fl-game');
    revealEl        = document.getElementById('fl-reveal');
    endEl           = document.getElementById('fl-end');
    infoEl          = document.getElementById('fl-info');
    flagsEl         = document.getElementById('fl-flags');
    submitEl        = document.getElementById('fl-submit');
    revealOutcomeEl = document.getElementById('fl-reveal-outcome');
    mapWrapEl       = document.getElementById('fl-map-wrap');
    distanceEl      = document.getElementById('fl-distance');
    nextBtnEl       = document.getElementById('fl-next');
    streakDisplayEl = document.getElementById('fl-streak-display');
    shareBtnEl      = document.getElementById('fl-share');
    playAgainBtnEl  = document.getElementById('fl-play-again');

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) {
      helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });
    }

    bestStreak = parseInt(localStorage.getItem(LS_BEST) || '0', 10) || 0;

    fetch('/assets/data/capitals.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        capitals = data;
        startRun();
      })
      .catch(function () {
        setState('loading');
        if (loadingEl) loadingEl.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:40px 20px;">Couldn\'t load data. Check your connection and refresh.</p>';
      });
  });

  // ── Haversine ──────────────────────────────────────────────────────────────
  function haversine(lat1, lng1, lat2, lng2) {
    var R    = HAVERSINE_R;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a    = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Get all C(8,2)=28 pairs sorted by distance ASC ────────────────────────
  function getAllPairs(countries) {
    var pairs = [];
    for (var i = 0; i < countries.length; i++) {
      for (var j = i + 1; j < countries.length; j++) {
        pairs.push({
          i:    i,
          j:    j,
          dist: haversine(countries[i].lat, countries[i].lng, countries[j].lat, countries[j].lng)
        });
      }
    }
    pairs.sort(function (a, b) { return a.dist - b.dist; });
    return pairs;
  }

  // ── Pick 8 random countries (Fisher-Yates partial shuffle) ────────────────
  function pick8() {
    var pool = capitals.slice();
    var out  = [];
    for (var k = 0; k < 8 && pool.length > 0; k++) {
      var idx = Math.floor(Math.random() * pool.length);
      out.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return out;
  }

  // ── Generate a round, applying difficulty gate for early rounds ────────────
  function generateRound(roundNum) {
    var countries, pairs;
    var applyGate = roundNum <= EASY_ROUNDS;
    var maxTries  = applyGate ? MAX_RETRIES : 1;

    for (var attempt = 0; attempt < maxTries; attempt++) {
      countries = pick8();
      pairs     = getAllPairs(countries);
      if (!applyGate) break;
      if (pairs.length >= 2 && (pairs[1].dist - pairs[0].dist) >= MIN_GAP_MILES) break;
    }
    return { countries: countries, pairs: pairs };
  }

  // ── Run / round control ────────────────────────────────────────────────────
  function startRun() {
    streak      = 0;
    roundNumber = 0;
    startRound();
  }

  function startRound() {
    roundNumber++;
    selected     = [];
    currentRound = generateRound(roundNumber);
    setState('game');
    renderGame();
  }

  // ── Render flag grid ───────────────────────────────────────────────────────
  function renderGame() {
    infoEl.textContent  = 'Round ' + roundNumber + ' · Streak: ' + streak + ' · Best: ' + Math.max(streak, bestStreak);
    submitEl.disabled   = true;
    submitEl.onclick    = handleSubmit;
    flagsEl.innerHTML   = '';
    selected            = [];

    currentRound.countries.forEach(function (country, idx) {
      var div       = document.createElement('div');
      div.className = 'fl-flag-tile';
      div.dataset.idx = String(idx);
      div.innerHTML =
        '<img class="fl-flag-img" src="https://flagcdn.com/w320/' + esc(country.iso2) + '.png" ' +
        'alt="Flag" loading="lazy">';
      div.addEventListener('click', function () { handleFlagClick(idx); });
      flagsEl.appendChild(div);
    });
  }

  // ── Selection logic ────────────────────────────────────────────────────────
  function handleFlagClick(idx) {
    var pos = selected.indexOf(idx);
    if (pos !== -1) {
      selected.splice(pos, 1);
    } else if (selected.length < 2) {
      selected.push(idx);
    }
    var tiles = flagsEl.querySelectorAll('.fl-flag-tile');
    tiles.forEach(function (tile) {
      var ti = parseInt(tile.dataset.idx, 10);
      if (selected.indexOf(ti) !== -1) tile.classList.add('fl-selected');
      else                             tile.classList.remove('fl-selected');
    });
    submitEl.disabled = (selected.length !== 2);
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  function handleSubmit() {
    if (selected.length !== 2) return;

    var winner     = currentRound.pairs[0];
    var sa         = Math.min(selected[0], selected[1]);
    var sb         = Math.max(selected[0], selected[1]);
    var wa         = Math.min(winner.i, winner.j);
    var wb         = Math.max(winner.i, winner.j);
    var isCorrect  = (sa === wa && sb === wb);

    if (isCorrect) {
      streak++;
      if (streak > bestStreak) {
        bestStreak = streak;
        try { localStorage.setItem(LS_BEST, String(bestStreak)); } catch (e) {}
      }
    }

    showReveal(isCorrect, winner);
  }

  // ── Reveal screen ──────────────────────────────────────────────────────────
  function showReveal(isCorrect, winner) {
    setState('reveal');

    revealOutcomeEl.textContent = isCorrect ? 'Correct!' : 'Not quite.';
    revealOutcomeEl.className   = 'fl-reveal-outcome ' + (isCorrect ? 'fl-outcome-correct' : 'fl-outcome-wrong');

    mapWrapEl.innerHTML = buildMapSvg(currentRound.countries, winner);

    var c1 = currentRound.countries[winner.i];
    var c2 = currentRound.countries[winner.j];
    var mi = Math.round(winner.dist).toLocaleString();
    var km = Math.round(winner.dist * 1.60934).toLocaleString();
    distanceEl.innerHTML =
      '<div class="fl-result-pair">' +
        '<div class="fl-result-country">' +
          '<img class="fl-result-flag" src="https://flagcdn.com/w320/' + esc(c1.iso2) + '.png" alt="' + esc(c1.name) + ' flag">' +
          '<div class="fl-result-capital">' + esc(c1.capital) + '</div>' +
          '<div class="fl-result-name">' + esc(c1.name) + '</div>' +
        '</div>' +
        '<div class="fl-result-arrow">&rarr;</div>' +
        '<div class="fl-result-country">' +
          '<img class="fl-result-flag" src="https://flagcdn.com/w320/' + esc(c2.iso2) + '.png" alt="' + esc(c2.name) + ' flag">' +
          '<div class="fl-result-capital">' + esc(c2.capital) + '</div>' +
          '<div class="fl-result-name">' + esc(c2.name) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="fl-result-dist">' + mi + ' mi &nbsp;·&nbsp; ' + km + ' km</div>';

    if (isCorrect) {
      nextBtnEl.textContent = 'Next Round';
      nextBtnEl.onclick     = startRound;
    } else {
      nextBtnEl.textContent = 'See Results';
      nextBtnEl.onclick     = showEnd;
    }
  }

  // ── End screen ─────────────────────────────────────────────────────────────
  function showEnd() {
    setState('end');

    var best = Math.max(streak, bestStreak);
    streakDisplayEl.innerHTML =
      'Streak<strong>' + streak + '</strong>' +
      '<span class="fl-best">Best: ' + best + '</span>';

    shareBtnEl.onclick     = function () {
      shareText(
        'Flagged — streak of ' + streak + '. Can you guess closer? https://www.thebunnygame.com/flagged',
        'Flagged'
      );
    };
    playAgainBtnEl.onclick = startRun;
  }

  // ── State machine ──────────────────────────────────────────────────────────
  function setState(name) {
    toggle(loadingEl, name === 'loading');
    toggle(gameEl,    name === 'game');
    toggle(revealEl,  name === 'reveal');
    toggle(endEl,     name === 'end');
  }

  function toggle(el, show) {
    if (!el) return;
    if (show) el.classList.remove('fl-hide');
    else      el.classList.add('fl-hide');
  }

  // ── Map SVG (equirectangular projection) ───────────────────────────────────
  function buildMapSvg(countries, winner) {
    var SVG_W = 560, SVG_H = 280;
    var PAD   = 18;
    var W     = SVG_W - PAD * 2;
    var H     = SVG_H - PAD * 2;

    function project(lat, lng) {
      return {
        x: PAD + (lng + 180) / 360 * W,
        y: PAD + (90 - lat) / 180 * H
      };
    }

    var s = '<svg viewBox="0 0 ' + SVG_W + ' ' + SVG_H + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">';

    // Ocean background
    s += '<rect x="0" y="0" width="' + SVG_W + '" height="' + SVG_H + '" fill="#0a1628"/>';

    // Grid: every 30°
    s += '<g stroke="#152440" stroke-width="0.5">';
    var lng, lat, gx, gy;
    for (lng = -180; lng <= 180; lng += 30) {
      gx = PAD + (lng + 180) / 360 * W;
      s += '<line x1="' + gx + '" y1="' + PAD + '" x2="' + gx + '" y2="' + (SVG_H - PAD) + '"/>';
    }
    for (lat = -90; lat <= 90; lat += 30) {
      gy = PAD + (90 - lat) / 180 * H;
      s += '<line x1="' + PAD + '" y1="' + gy + '" x2="' + (SVG_W - PAD) + '" y2="' + gy + '"/>';
    }
    s += '</g>';

    // Equator: slightly brighter
    var eqY = PAD + H / 2;
    s += '<line x1="' + PAD + '" y1="' + eqY + '" x2="' + (SVG_W - PAD) + '" y2="' + eqY + '" stroke="#1e3a5c" stroke-width="1.2"/>';

    // Map border
    s += '<rect x="' + PAD + '" y="' + PAD + '" width="' + W + '" height="' + H + '" fill="none" stroke="#1e3a5c" stroke-width="1"/>';

    // Connecting line between winner pair
    var p1 = project(countries[winner.i].lat, countries[winner.i].lng);
    var p2 = project(countries[winner.j].lat, countries[winner.j].lng);
    s += '<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" stroke="#f5c518" stroke-width="1.8" stroke-dasharray="5,4" opacity="0.85"/>';

    // Non-winner dots first (so winners render on top)
    for (var i = 0; i < countries.length; i++) {
      if (i === winner.i || i === winner.j) continue;
      var pt = project(countries[i].lat, countries[i].lng);
      s += '<circle cx="' + pt.x + '" cy="' + pt.y + '" r="3.5" fill="#64748b"/>';
      s += '<text x="' + (pt.x + 5) + '" y="' + (pt.y + 3.5) + '" font-size="6.5" fill="#64748b" font-family="DM Sans,sans-serif">' + svgEsc(countries[i].capital) + '</text>';
    }

    // Winner dots
    [winner.i, winner.j].forEach(function (wi) {
      var wp = project(countries[wi].lat, countries[wi].lng);
      s += '<circle cx="' + wp.x + '" cy="' + wp.y + '" r="6" fill="#f5c518"/>';
      s += '<circle cx="' + wp.x + '" cy="' + wp.y + '" r="2.5" fill="#0a1628"/>';
      s += '<text x="' + (wp.x + 8) + '" y="' + (wp.y + 4) + '" font-size="8" font-weight="700" fill="#f5c518" font-family="DM Sans,sans-serif">' + svgEsc(countries[wi].capital) + '</text>';
    });

    s += '</svg>';
    return s;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function svgEsc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

})();
