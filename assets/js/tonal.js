(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────────

  var N_BARS = 5;
  var DIST_MIN = 60;   // minimum Euclidean RGB distance between any two bars

  var DIRECTIONS_TEXT = 'Five colors appear one by one, each paired with a musical note. Listen and look. Then the colors disappear and you recreate all five from memory. Tap each bar to pick its color, then submit. Your score is based on how close each pick is to the original — out of 500 total.';

  // ── Notes (C major 7 add 9) ───────────────────────────────────────────────────

  var NOTES = [
    { name: 'C4', frequency: 261.63 },
    { name: 'E4', frequency: 329.63 },
    { name: 'G4', frequency: 392.00 },
    { name: 'B4', frequency: 493.88 },
    { name: 'D5', frequency: 587.33 },
  ];

  // ── Audio context (lazy init on first user gesture) ───────────────────────────

  var ctx = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // ── Pad voice ─────────────────────────────────────────────────────────────────

  function createPadVoice(frequency, peakGain, startTime, duration) {
    var c = getCtx();

    var env = c.createGain();
    env.gain.setValueAtTime(0, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + 0.1);
    env.gain.setValueAtTime(peakGain, startTime + duration - 0.5);
    env.gain.linearRampToValueAtTime(0, startTime + duration);
    env.connect(c.destination);

    var osc1 = c.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(frequency, startTime);
    var g1 = c.createGain();
    g1.gain.setValueAtTime(0.75, startTime);
    osc1.connect(g1);
    g1.connect(env);

    // 4-cent-sharp chorus for warmth
    var osc2 = c.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(frequency * Math.pow(2, 4 / 1200), startTime);
    var g2 = c.createGain();
    g2.gain.setValueAtTime(0.25, startTime);
    osc2.connect(g2);
    g2.connect(env);

    osc1.start(startTime); osc1.stop(startTime + duration);
    osc2.start(startTime); osc2.stop(startTime + duration);
  }

  function playNote(barIndex) {
    var c = getCtx();
    createPadVoice(NOTES[barIndex].frequency, 0.28, c.currentTime, 1.5);
  }

  function playChord() {
    var c = getCtx();
    var t = c.currentTime;
    NOTES.forEach(function (note) {
      createPadVoice(note.frequency, 0.22, t, 2.5);
    });
  }

  function shiftedFrequency(baseFreq, accuracyPercent, direction) {
    var maxCents = 50;
    var centsOff = (1 - accuracyPercent / 100) * maxCents * direction;
    return baseFreq * Math.pow(2, centsOff / 1200);
  }

  function playResultChord(scores, directions) {
    var c = getCtx();
    var t = c.currentTime;
    NOTES.forEach(function (note, i) {
      createPadVoice(shiftedFrequency(note.frequency, scores[i], directions[i]), 0.22, t, 2.5);
    });
  }

  // ── Color utilities ───────────────────────────────────────────────────────────

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    var a = s * Math.min(l, 1 - l);
    function f(n) {
      var k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    }
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }

  function toHex(rgb) {
    return '#' + rgb.map(function (c) { return c.toString(16).padStart(2, '0'); }).join('');
  }

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbDist(a, b) {
    return Math.sqrt(
      (a[0]-b[0])*(a[0]-b[0]) +
      (a[1]-b[1])*(a[1]-b[1]) +
      (a[2]-b[2])*(a[2]-b[2])
    );
  }

  function scoreAccuracy(originalHex, pickedHex) {
    var a = hexToRgb(originalHex);
    var b = hexToRgb(pickedHex);
    var maxDist = Math.sqrt(255*255 + 255*255 + 255*255);
    return Math.round((1 - rgbDist(a, b) / maxDist) * 100);
  }

  function generateColor() {
    var h = Math.random() * 360;
    var s = 45 + Math.random() * 40;  // 45-85%
    var l = 25 + Math.random() * 45;  // 25-70%
    var rgb = hslToRgb(h, s, l);
    return { hex: toHex(rgb), rgb: rgb };
  }

  // Generate 5 colors with minimum pairwise distance enforcement

  function generateColors() {
    for (var attempt = 0; attempt < 500; attempt++) {
      var colors = [];
      for (var i = 0; i < N_BARS; i++) colors.push(generateColor());

      var ok = true;
      for (var a = 0; a < N_BARS - 1 && ok; a++) {
        for (var b = a + 1; b < N_BARS && ok; b++) {
          if (rgbDist(colors[a].rgb, colors[b].rgb) < DIST_MIN) ok = false;
        }
      }
      if (ok) return colors;
    }
    // Fallback: return last generated set (shouldn't happen in practice)
    return colors;
  }

  // ── Game state ────────────────────────────────────────────────────────────────

  var colors = [];          // [{hex, rgb}] — generated each session
  var revealTimer = null;   // setTimeout handle during reveal

  // ── DOM refs ──────────────────────────────────────────────────────────────────

  var splashEl, startBtn,
      revealEl, barEls, revealStatus,
      pickEl, swatchEls, colorInputEls, submitBtn,
      resultEl, resultPairsEl, totalScoreEl, barScoresEl, shareBtn, againBtn;

  // ── Phase helpers ─────────────────────────────────────────────────────────────

  function hideAll() {
    [splashEl, revealEl, pickEl, resultEl].forEach(function (el) {
      el.classList.add('tn-hide');
    });
  }

  // ── Reveal sequence ───────────────────────────────────────────────────────────

  function startReveal() {
    colors = generateColors();
    hideAll();

    // Reset all bars to dark placeholder
    barEls.forEach(function (el) {
      el.style.backgroundColor = '#1a1a1a';
      el.classList.remove('tn-bar--active', 'tn-bar--dimmed');
    });

    revealStatus.textContent = '';
    revealEl.classList.remove('tn-hide');

    revealBar(0);
  }

  // NOTE_DURATION: how long each bar stays fully lit before dimming
  var NOTE_DURATION  = 1500;  // ms — matches audio playNote 1.5s
  var NOTE_GAP       = 200;   // ms gap between bars
  var CHORD_PAUSE    = 500;   // ms pause after last note before chord
  var CHORD_DURATION = 2500;  // ms — matches audio playChord 2.5s
  var FADE_DURATION  = 400;   // ms for bars to fade out before pick phase

  function revealBar(index) {
    if (index >= N_BARS) {
      // All bars revealed — pause then play chord
      revealStatus.textContent = 'Listen...';
      revealTimer = setTimeout(function () {
        playChord();
        revealStatus.textContent = '';
        // After chord finishes, fade bars and enter pick phase
        revealTimer = setTimeout(function () {
          fadeOutAndPick();
        }, CHORD_DURATION);
      }, CHORD_PAUSE);
      return;
    }

    var bar = barEls[index];
    var color = colors[index];

    // Light up this bar
    bar.style.backgroundColor = color.hex;
    bar.style.setProperty('--bar-glow', hexToGlow(color.hex));
    bar.classList.add('tn-bar--active');
    bar.classList.remove('tn-bar--dimmed');

    // Play the corresponding note
    playNote(index);

    // After note duration, dim and move to next bar
    revealTimer = setTimeout(function () {
      bar.classList.remove('tn-bar--active');
      bar.classList.add('tn-bar--dimmed');

      revealTimer = setTimeout(function () {
        revealBar(index + 1);
      }, NOTE_GAP);
    }, NOTE_DURATION);
  }

  function hexToGlow(hex) {
    var rgb = hexToRgb(hex);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.4)';
  }

  function fadeOutAndPick() {
    barEls.forEach(function (el) {
      el.style.transition = 'opacity ' + (FADE_DURATION / 1000) + 's ease';
      el.style.opacity = '0';
    });
    setTimeout(function () {
      startPick();
    }, FADE_DURATION);
  }

  // ── Pick phase ────────────────────────────────────────────────────────────────

  function startPick() {
    hideAll();

    // Reset bar opacity (for replay)
    barEls.forEach(function (el) {
      el.style.opacity = '1';
      el.style.transition = '';
    });

    // Reset all pickers to neutral grey
    colorInputEls.forEach(function (input, i) {
      input.value = '#808080';
      swatchEls[i].style.background = '#808080';
    });

    pickEl.classList.remove('tn-hide');
  }

  // ── Score and result ──────────────────────────────────────────────────────────

  function submitPicks() {
    var scores = colorInputEls.map(function (input, i) {
      return scoreAccuracy(colors[i].hex, input.value);
    });
    var picked = colorInputEls.map(function (input) { return input.value; });

    // Random per-bar directions for result chord detuning
    var directions = NOTES.map(function () { return Math.random() < 0.5 ? 1 : -1; });

    showResult(scores, picked, directions);
  }

  function showResult(scores, picked, directions) {
    hideAll();

    // Build result pairs (original bar on top, picked bar below)
    resultPairsEl.innerHTML = '';
    scores.forEach(function (score, i) {
      var pair = document.createElement('div');
      pair.className = 'tn-result-pair';
      pair.innerHTML =
        '<p class="tn-result-label">Original</p>' +
        '<div class="tn-result-bar" style="background:' + colors[i].hex + '"></div>' +
        '<div class="tn-result-divider"></div>' +
        '<div class="tn-result-bar" style="background:' + picked[i] + '"></div>' +
        '<p class="tn-result-label">Your Pick</p>' +
        '<p class="tn-result-score">' + score + '/100</p>';
      resultPairsEl.appendChild(pair);
    });

    var total = scores.reduce(function (s, v) { return s + v; }, 0);
    totalScoreEl.textContent = 'Total: ' + total + ' / 500';
    barScoresEl.textContent = scores.map(function(s){ return s + '/100'; }).join('  ·  ');

    resultEl.classList.remove('tn-hide');

    // Play result chord with detuning after short delay
    setTimeout(function () { playResultChord(scores, directions); }, 600);

    // Wire share
    shareBtn.onclick = function () {
      shareText(
        'Tonal — ' + total + '/500. Can you hear color? https://www.thebunnygame.com/tonal',
        'Tonal — Bunny Game'
      );
    };
  }

  // ── DOM bootstrap ─────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    splashEl     = document.getElementById('tn-splash');
    startBtn     = document.getElementById('tn-start-btn');
    revealEl     = document.getElementById('tn-reveal');
    revealStatus = document.getElementById('tn-reveal-status');
    pickEl       = document.getElementById('tn-pick');
    resultEl     = document.getElementById('tn-result');
    resultPairsEl  = document.getElementById('tn-result-pairs');
    totalScoreEl   = document.getElementById('tn-total-score');
    barScoresEl    = document.getElementById('tn-bar-scores');
    shareBtn     = document.getElementById('tn-share-btn');
    againBtn     = document.getElementById('tn-again-btn');
    submitBtn    = document.getElementById('tn-submit-btn');

    barEls = [0,1,2,3,4].map(function (i) { return document.getElementById('tn-bar-' + i); });

    swatchEls = [0,1,2,3,4].map(function (i) { return document.getElementById('tn-swatch-' + i); });
    colorInputEls = [0,1,2,3,4].map(function (i) { return document.getElementById('tn-pick-' + i); });

    // Directions text
    var dirEl = document.getElementById('tn-directions');
    if (dirEl) dirEl.textContent = DIRECTIONS_TEXT;

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });

    startBtn.addEventListener('click', startReveal);
    againBtn.addEventListener('click', startReveal);
    submitBtn.addEventListener('click', submitPicks);

    // Tap swatch to open color picker; sync preview on change
    swatchEls.forEach(function (swatch, i) {
      var input = colorInputEls[i];

      swatch.addEventListener('click', function () {
        swatchEls.forEach(function (s) { s.classList.remove('tn-pick-swatch--selected'); });
        swatch.classList.add('tn-pick-swatch--selected');
        try { input.click(); } catch (e) {}
      });

      input.addEventListener('input', function () {
        swatch.style.background = input.value;
      });

      input.addEventListener('change', function () {
        swatch.style.background = input.value;
        swatch.classList.remove('tn-pick-swatch--selected');
      });
    });
  });

  // ── Exports ───────────────────────────────────────────────────────────────────

  window.Tonal = {
    NOTES:            NOTES,
    playNote:         playNote,
    playChord:        playChord,
    playResultChord:  playResultChord,
    shiftedFrequency: shiftedFrequency,
    generateColors:   generateColors,
    scoreAccuracy:    scoreAccuracy,
    hexToRgb:         hexToRgb,
    getCtx:           getCtx,
  };

}());
