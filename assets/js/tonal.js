(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────────

  var N_BARS   = 5;
  var DIST_MIN = 60;   // minimum Euclidean RGB distance between any two bars

  var DIRECTIONS_TEXT = 'Tonal shows you five colors, one at a time, each paired with a musical note. Together they form a chord. Then they disappear. Your job is to recreate each color as accurately as you can from memory. When you submit, the chord plays again — but slightly out of tune based on how far off your colors are. The closer your picks, the purer the sound. Five bars, five chances, five hundred points possible.';

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

  function createPadVoice(frequency, peakGain, startTime, duration, extraDest) {
    var c = getCtx();

    var env = c.createGain();
    env.gain.setValueAtTime(0, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + 0.1);
    env.gain.setValueAtTime(peakGain, startTime + duration - 0.5);
    env.gain.linearRampToValueAtTime(0, startTime + duration);
    env.connect(c.destination);
    if (extraDest) env.connect(extraDest);

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

  function shiftedFrequency(baseFreq, accuracyPercent, direction, maxCents) {
    maxCents = maxCents || 50;
    var centsOff = (1 - accuracyPercent / 100) * maxCents * direction;
    return baseFreq * Math.pow(2, centsOff / 1200);
  }

  // Result chord: dramatically detuned (maxCents=150), longer (4s), with delay node
  function playResultChordFinal(scores, directions) {
    var c = getCtx();
    var t = c.currentTime;
    var duration = 4.0;
    var peakGain = 0.264; // 0.22 * 1.2

    // DelayNode for echo effect — result chord only
    var delay = c.createDelay(1.0);
    delay.delayTime.setValueAtTime(0.3, t);
    var feedback = c.createGain();
    feedback.gain.setValueAtTime(0.4, t);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(c.destination);

    NOTES.forEach(function (note, i) {
      var freq = shiftedFrequency(note.frequency, scores[i], directions[i], 150);
      createPadVoice(freq, peakGain, t, duration, delay);
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

  function generateColors() {
    var colors;
    for (var attempt = 0; attempt < 500; attempt++) {
      colors = [];
      for (var i = 0; i < N_BARS; i++) colors.push(generateColor());

      var ok = true;
      for (var a = 0; a < N_BARS - 1 && ok; a++) {
        for (var b = a + 1; b < N_BARS && ok; b++) {
          if (rgbDist(colors[a].rgb, colors[b].rgb) < DIST_MIN) ok = false;
        }
      }
      if (ok) return colors;
    }
    return colors;
  }

  function hexToGlow(hex) {
    var rgb = hexToRgb(hex);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.4)';
  }

  // ── Game state ────────────────────────────────────────────────────────────────

  var colors      = [];
  var pickedHexes = [];
  var scores      = [];
  var directions  = [];
  var currentBar  = 0;
  var countdownId = null;
  var revealTimer = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────────

  var splashEl, startBtn,
      revealEl, barEls, revealStatus,
      barShowEl, showLabel, showSwatch, showCountdown,
      barPickEl, pickLabel, singleInput, singleSwatch, singleSubmit,
      barResultEl, barResultLabel, barScoreLine, barOrigSwatch, barPickedSwatch, barNextBtn,
      resultEl, resultPairsEl, totalScoreEl, barScoresEl, shareBtn, againBtn;

  // ── Phase helpers ─────────────────────────────────────────────────────────────

  function hideAll() {
    [splashEl, revealEl, barShowEl, barPickEl, barResultEl, resultEl].forEach(function (el) {
      if (el) el.classList.add('tn-hide');
    });
  }

  // ── Reveal sequence ───────────────────────────────────────────────────────────

  var NOTE_DURATION  = 1500;
  var NOTE_GAP       = 200;
  var CHORD_PAUSE    = 500;
  var CHORD_DURATION = 2500;
  var FADE_DURATION  = 400;

  function startReveal() {
    colors      = generateColors();
    pickedHexes = [];
    scores      = [];
    directions  = NOTES.map(function () { return Math.random() < 0.5 ? 1 : -1; });
    currentBar  = 0;
    hideAll();

    barEls.forEach(function (el) {
      el.style.backgroundColor = '#1a1a1a';
      el.style.opacity = '1';
      el.style.transition = '';
      el.classList.remove('tn-bar--active', 'tn-bar--dimmed');
    });

    revealStatus.textContent = '';
    revealEl.classList.remove('tn-hide');
    revealBar(0);
  }

  function revealBar(index) {
    if (index >= N_BARS) {
      revealStatus.textContent = 'Listen...';
      revealTimer = setTimeout(function () {
        playChord();
        revealStatus.textContent = '';
        revealTimer = setTimeout(function () {
          fadeOutAndStartBarFlow();
        }, CHORD_DURATION);
      }, CHORD_PAUSE);
      return;
    }

    var bar   = barEls[index];
    var color = colors[index];

    bar.style.backgroundColor = color.hex;
    bar.style.setProperty('--bar-glow', hexToGlow(color.hex));
    bar.classList.add('tn-bar--active');
    bar.classList.remove('tn-bar--dimmed');

    playNote(index);

    revealTimer = setTimeout(function () {
      bar.classList.remove('tn-bar--active');
      bar.classList.add('tn-bar--dimmed');
      revealTimer = setTimeout(function () {
        revealBar(index + 1);
      }, NOTE_GAP);
    }, NOTE_DURATION);
  }

  function fadeOutAndStartBarFlow() {
    barEls.forEach(function (el) {
      el.style.transition = 'opacity ' + (FADE_DURATION / 1000) + 's ease';
      el.style.opacity = '0';
    });
    setTimeout(function () {
      startBarFlow(0);
    }, FADE_DURATION);
  }

  // ── Bar-by-bar pick flow ──────────────────────────────────────────────────────

  function startBarFlow(index) {
    currentBar = index;
    startBarShow(index);
  }

  function startBarShow(index) {
    hideAll();

    showLabel.textContent = 'Bar ' + (index + 1) + ' of ' + N_BARS;
    showSwatch.style.background = colors[index].hex;
    showSwatch.style.boxShadow = '0 0 32px 8px ' + hexToGlow(colors[index].hex);
    showCountdown.textContent = '3';

    barShowEl.classList.remove('tn-hide');

    var count = 3;
    countdownId = setInterval(function () {
      count--;
      if (count <= 0) {
        clearInterval(countdownId);
        countdownId = null;
        startBarPick(index);
      } else {
        showCountdown.textContent = String(count);
      }
    }, 1000);
  }

  function startBarPick(index) {
    hideAll();

    pickLabel.textContent = 'Bar ' + (index + 1) + ' of ' + N_BARS;
    singleInput.value = '#808080';
    singleSwatch.style.background = '#808080';

    barPickEl.classList.remove('tn-hide');

    // Auto-open native color picker; iOS Safari may block outside user gesture
    try { singleInput.click(); } catch (e) {}
  }

  function submitBarPick() {
    var pickedHex = singleInput.value;
    pickedHexes.push(pickedHex);
    var score = scoreAccuracy(colors[currentBar].hex, pickedHex);
    scores.push(score);

    showBarResult(currentBar, score, pickedHex);
  }

  function showBarResult(index, score, pickedHex) {
    hideAll();

    barResultLabel.textContent = 'Bar ' + (index + 1) + ' of ' + N_BARS;
    barScoreLine.textContent   = 'Bar ' + (index + 1) + ': ' + score + '/100';
    barOrigSwatch.style.background   = colors[index].hex;
    barPickedSwatch.style.background = pickedHex;

    // Last bar: button says "See Results", otherwise "Next"
    barNextBtn.textContent = (index === N_BARS - 1) ? 'See Results' : 'Next';

    barResultEl.classList.remove('tn-hide');
  }

  function advanceBar() {
    var next = currentBar + 1;
    if (next >= N_BARS) {
      // All bars done — play final chord, then show result screen
      playResultChordFinal(scores, directions);
      setTimeout(showFinalResult, 800);
    } else {
      startBarFlow(next);
    }
  }

  // ── Final result screen ───────────────────────────────────────────────────────

  function showFinalResult() {
    hideAll();

    resultPairsEl.innerHTML = '';
    scores.forEach(function (score, i) {
      var pair = document.createElement('div');
      pair.className = 'tn-result-pair';
      pair.innerHTML =
        '<p class="tn-result-label">Original</p>' +
        '<div class="tn-result-bar" style="background:' + colors[i].hex + '"></div>' +
        '<div class="tn-result-divider"></div>' +
        '<div class="tn-result-bar" style="background:' + pickedHexes[i] + '"></div>' +
        '<p class="tn-result-label">Your Pick</p>' +
        '<p class="tn-result-score">' + score + '/100</p>';
      resultPairsEl.appendChild(pair);
    });

    var total = scores.reduce(function (s, v) { return s + v; }, 0);
    totalScoreEl.textContent = 'Total: ' + total + ' / 500';
    barScoresEl.textContent  = scores.map(function (s) { return s + '/100'; }).join('  ·  ');

    resultEl.classList.remove('tn-hide');

    shareBtn.onclick = function () {
      shareText(
        'Tonal — scored ' + total + '/500. How well do you hear color? https://www.thebunnygame.com/tonal',
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

    barShowEl      = document.getElementById('tn-bar-show');
    showLabel      = document.getElementById('tn-show-label');
    showSwatch     = document.getElementById('tn-show-swatch');
    showCountdown  = document.getElementById('tn-show-countdown');

    barPickEl    = document.getElementById('tn-bar-pick');
    pickLabel    = document.getElementById('tn-pick-label');
    singleInput  = document.getElementById('tn-single-input');
    singleSwatch = document.getElementById('tn-single-swatch');
    singleSubmit = document.getElementById('tn-single-submit');

    barResultEl     = document.getElementById('tn-bar-result');
    barResultLabel  = document.getElementById('tn-bar-result-label');
    barScoreLine    = document.getElementById('tn-bar-score-text');
    barOrigSwatch   = document.getElementById('tn-bar-orig-swatch');
    barPickedSwatch = document.getElementById('tn-bar-picked-swatch');
    barNextBtn      = document.getElementById('tn-bar-next-btn');

    resultEl      = document.getElementById('tn-result');
    resultPairsEl = document.getElementById('tn-result-pairs');
    totalScoreEl  = document.getElementById('tn-total-score');
    barScoresEl   = document.getElementById('tn-bar-scores');
    shareBtn      = document.getElementById('tn-share-btn');
    againBtn      = document.getElementById('tn-again-btn');

    barEls = [0,1,2,3,4].map(function (i) { return document.getElementById('tn-bar-' + i); });

    // Directions text
    var dirEl = document.getElementById('tn-directions');
    if (dirEl) dirEl.textContent = DIRECTIONS_TEXT;

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });

    startBtn.addEventListener('click', startReveal);
    againBtn.addEventListener('click', startReveal);

    // Sync swatch preview as color input changes
    singleInput.addEventListener('input', function () {
      singleSwatch.style.background = singleInput.value;
    });
    singleInput.addEventListener('change', function () {
      singleSwatch.style.background = singleInput.value;
    });

    // Tap the large visible swatch to open picker (iOS fallback)
    singleSwatch.addEventListener('click', function () {
      try { singleInput.click(); } catch (e) {}
    });

    singleSubmit.addEventListener('click', submitBarPick);
    barNextBtn.addEventListener('click', advanceBar);
  });

  // ── Exports ───────────────────────────────────────────────────────────────────

  window.Tonal = {
    NOTES:                NOTES,
    playNote:             playNote,
    playChord:            playChord,
    playResultChordFinal: playResultChordFinal,
    shiftedFrequency:     shiftedFrequency,
    generateColors:       generateColors,
    scoreAccuracy:        scoreAccuracy,
    hexToRgb:             hexToRgb,
    getCtx:               getCtx,
  };

}());
