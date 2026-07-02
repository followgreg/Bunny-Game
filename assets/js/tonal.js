(function () {
  'use strict';

  // ── State machine ─────────────────────────────────────────────────────────────

  var STATES = {
    SPLASH:             'splash',
    REVEAL_SEQUENTIAL:  'reveal_sequential',  // bars 1-5 light up one by one
    REVEAL_CHORD:       'reveal_chord',        // all 5 play together
    PICK_COUNTDOWN:     'pick_countdown',      // current bar shows with 3-2-1
    PICK_INPUT:         'pick_input',          // color hidden, picker open
    PICK_RESULT:        'pick_result',         // per-bar result shown
    FINAL_CHORD:        'final_chord',         // pitch-shifted chord plays
    FINAL_RESULT:       'final_result',        // full result screen
  };

  var currentState = STATES.SPLASH;

  function inState(s) { return currentState === s; }

  function transition(to) {
    currentState = to;
  }

  // ── Constants ─────────────────────────────────────────────────────────────────

  var N_BARS   = 5;
  var DIST_MIN = 60;

  var DIRECTIONS_TEXT = 'Tonal shows you five colors, one at a time, each paired with a musical note. Together they form a chord. Then they disappear. Your job is to recreate each color as accurately as you can from memory. When you submit, the chord plays again — but slightly out of tune based on how far off your colors are. The closer your picks, the purer the sound. Five bars, five chances, five hundred points possible.';

  var NOTE_DURATION    = 1500;   // ms per bar during sequential reveal
  var NOTE_GAP         = 200;    // ms gap between bars
  var CHORD_PAUSE      = 500;    // ms pause before playing reveal chord
  var CHORD_DURATION   = 2500;   // ms duration of reveal chord (audio)
  var FADE_DURATION    = 400;    // ms for bars to fade after reveal chord
  var RESULT_CHORD_DUR = 4000;   // ms duration of final result chord (audio)
  var RESULT_CHORD_TAIL= 1200;   // ms extra for delay-node tail to fade
  var COUNTDOWN_START  = 3;      // seconds shown per bar in PICK_COUNTDOWN

  // ── Notes (C major 7 add 9) ───────────────────────────────────────────────────

  var NOTES = [
    { name: 'C4', frequency: 261.63 },
    { name: 'E4', frequency: 329.63 },
    { name: 'G4', frequency: 392.00 },
    { name: 'B4', frequency: 493.88 },
    { name: 'D5', frequency: 587.33 },
  ];

  // ── Audio ─────────────────────────────────────────────────────────────────────

  var audioCtx = null;

  function getCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function createPadVoice(frequency, peakGain, startTime, duration, extraDest) {
    var c   = getCtx();
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

  function playRevealChord() {
    var c = getCtx();
    var t = c.currentTime;
    NOTES.forEach(function (note) {
      createPadVoice(note.frequency, 0.22, t, 2.5);
    });
  }

  function shiftedFrequency(baseFreq, accuracyPercent, direction) {
    var maxCents = 150;
    var centsOff = (1 - accuracyPercent / 100) * maxCents * direction;
    return baseFreq * Math.pow(2, centsOff / 1200);
  }

  // Final chord: dramatically detuned, longer, with delay-node echo
  function playFinalChord(scores, directions) {
    var c        = getCtx();
    var t        = c.currentTime;
    var duration = RESULT_CHORD_DUR / 1000;
    var peakGain = 0.264; // 0.22 * 1.2

    var delay    = c.createDelay(1.0);
    delay.delayTime.setValueAtTime(0.3, t);
    var feedback = c.createGain();
    feedback.gain.setValueAtTime(0.4, t);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(c.destination);

    NOTES.forEach(function (note, i) {
      var freq = shiftedFrequency(note.frequency, scores[i], directions[i]);
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
    return '#' + rgb.map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
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
    var a       = hexToRgb(originalHex);
    var b       = hexToRgb(pickedHex);
    var maxDist = Math.sqrt(255*255 + 255*255 + 255*255);
    return Math.round((1 - rgbDist(a, b) / maxDist) * 100);
  }

  function generateColor() {
    var h   = Math.random() * 360;
    var s   = 45 + Math.random() * 40;
    var l   = 25 + Math.random() * 45;
    var rgb = hslToRgb(h, s, l);
    return { hex: toHex(rgb), rgb: rgb };
  }

  function generateColors() {
    var colors;
    for (var attempt = 0; attempt < 500; attempt++) {
      colors = [];
      for (var i = 0; i < N_BARS; i++) colors.push(generateColor());
      var ok = true;
      outer: for (var a = 0; a < N_BARS - 1; a++) {
        for (var b = a + 1; b < N_BARS; b++) {
          if (rgbDist(colors[a].rgb, colors[b].rgb) < DIST_MIN) { ok = false; break outer; }
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
  var timerId     = null;   // single active timer handle (cleared on reset)
  var countdownId = null;   // setInterval handle for 3-2-1

  function clearTimers() {
    if (timerId)     { clearTimeout(timerId);   timerId     = null; }
    if (countdownId) { clearInterval(countdownId); countdownId = null; }
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────────

  var splashEl, startBtn,
      revealEl, barEls, revealStatus,
      barShowEl, showLabel, showSwatch, showCountdown,
      barPickEl, pickLabel, singleInput, singleSwatch, singleSubmit,
      barResultEl, barResultLabel, barScoreLine, barOrigSwatch, barPickedSwatch, barNextBtn,
      resultEl, resultPairsEl, totalScoreEl, barScoresEl, shareBtn, againBtn,
      puzzleToneBtn, answerToneBtn, togetherBtn;

  // ── Show/hide helpers ─────────────────────────────────────────────────────────

  function hideAll() {
    [splashEl, revealEl, barShowEl, barPickEl, barResultEl, resultEl].forEach(function (el) {
      if (el) el.classList.add('tn-hide');
    });
  }

  // ── State: REVEAL_SEQUENTIAL ──────────────────────────────────────────────────
  // Bars 1-5 light up one by one, each paired with its note.

  function enterRevealSequential() {
    transition(STATES.REVEAL_SEQUENTIAL);
    hideAll();

    barEls.forEach(function (el) {
      el.style.backgroundColor = '#1a1a1a';
      el.style.opacity         = '1';
      el.style.transition      = '';
      el.classList.remove('tn-bar--active', 'tn-bar--dimmed');
    });

    revealStatus.textContent = '';
    revealEl.classList.remove('tn-hide');
    revealNextBar(0);
  }

  function revealNextBar(index) {
    if (!inState(STATES.REVEAL_SEQUENTIAL)) return;

    if (index >= N_BARS) {
      // All bars revealed — move to chord state
      enterRevealChord();
      return;
    }

    var bar   = barEls[index];
    var color = colors[index];

    bar.style.backgroundColor = color.hex;
    bar.style.setProperty('--bar-glow', hexToGlow(color.hex));
    bar.classList.add('tn-bar--active');
    bar.classList.remove('tn-bar--dimmed');
    playNote(index);

    timerId = setTimeout(function () {
      if (!inState(STATES.REVEAL_SEQUENTIAL)) return;
      bar.classList.remove('tn-bar--active');
      bar.classList.add('tn-bar--dimmed');
      timerId = setTimeout(function () {
        revealNextBar(index + 1);
      }, NOTE_GAP);
    }, NOTE_DURATION);
  }

  // ── State: REVEAL_CHORD ───────────────────────────────────────────────────────
  // All 5 bars visible (dimmed). Full chord plays. Then bars fade out.

  function enterRevealChord() {
    transition(STATES.REVEAL_CHORD);
    // Bars already visible from sequential reveal (dimmed)
    revealStatus.textContent = 'Listen...';

    timerId = setTimeout(function () {
      if (!inState(STATES.REVEAL_CHORD)) return;
      playRevealChord();
      revealStatus.textContent = '';

      // After chord finishes, fade bars and move to first bar's countdown
      timerId = setTimeout(function () {
        if (!inState(STATES.REVEAL_CHORD)) return;
        fadeBarsOut(function () {
          enterPickCountdown(0);
        });
      }, CHORD_DURATION);
    }, CHORD_PAUSE);
  }

  function fadeBarsOut(cb) {
    barEls.forEach(function (el) {
      el.style.transition = 'opacity ' + (FADE_DURATION / 1000) + 's ease';
      el.style.opacity    = '0';
    });
    timerId = setTimeout(cb, FADE_DURATION);
  }

  // ── State: PICK_COUNTDOWN ─────────────────────────────────────────────────────
  // Current bar's color shown with 3-2-1 countdown. Then color hides, picker opens.

  function enterPickCountdown(barIndex) {
    transition(STATES.PICK_COUNTDOWN);
    currentBar = barIndex;
    hideAll();

    showLabel.textContent = 'Bar ' + (barIndex + 1) + ' of ' + N_BARS;
    showSwatch.style.background  = colors[barIndex].hex;
    showSwatch.style.boxShadow   = '0 0 32px 8px ' + hexToGlow(colors[barIndex].hex);
    showCountdown.textContent    = String(COUNTDOWN_START);
    barShowEl.classList.remove('tn-hide');

    var count = COUNTDOWN_START;
    countdownId = setInterval(function () {
      if (!inState(STATES.PICK_COUNTDOWN)) { clearInterval(countdownId); return; }
      count--;
      if (count <= 0) {
        clearInterval(countdownId);
        countdownId = null;
        enterPickInput(barIndex);
      } else {
        showCountdown.textContent = String(count);
      }
    }, 1000);
  }

  // ── State: PICK_INPUT ─────────────────────────────────────────────────────────
  // Color hidden, picker auto-opens. Player chooses a color and hits Submit.

  function enterPickInput(barIndex) {
    transition(STATES.PICK_INPUT);
    hideAll();

    pickLabel.textContent      = 'Bar ' + (barIndex + 1) + ' of ' + N_BARS;
    singleInput.value          = '#808080';
    singleSwatch.style.background = '#808080';
    barPickEl.classList.remove('tn-hide');

    // iOS Safari may block programmatic .click() outside a user gesture;
    // the large visible swatch below serves as the tap fallback in that case.
    try { singleInput.click(); } catch (e) {}
  }

  function onSubmitPick() {
    if (!inState(STATES.PICK_INPUT)) return;

    var pickedHex = singleInput.value;
    var score     = scoreAccuracy(colors[currentBar].hex, pickedHex);
    pickedHexes.push(pickedHex);
    scores.push(score);

    enterPickResult(currentBar, score, pickedHex);
  }

  // ── State: PICK_RESULT ────────────────────────────────────────────────────────
  // Per-bar result: original vs picked swatches + score. Player clicks Next.

  function enterPickResult(barIndex, score, pickedHex) {
    transition(STATES.PICK_RESULT);
    hideAll();

    barResultLabel.textContent          = 'Bar ' + (barIndex + 1) + ' of ' + N_BARS;
    barScoreLine.textContent            = 'Bar ' + (barIndex + 1) + ': ' + score + '/100';
    barOrigSwatch.style.background      = colors[barIndex].hex;
    barPickedSwatch.style.background    = pickedHex;
    barNextBtn.textContent              = (barIndex === N_BARS - 1) ? 'See Results' : 'Next';
    barResultEl.classList.remove('tn-hide');
  }

  function onNextBar() {
    if (!inState(STATES.PICK_RESULT)) return;
    var next = currentBar + 1;
    if (next < N_BARS) {
      enterPickCountdown(next);
    } else {
      enterFinalChord();
    }
  }

  // ── State: FINAL_CHORD ────────────────────────────────────────────────────────
  // Pitch-shifted chord plays. Screen stays blank until chord + tail finish.
  // Only then does FINAL_RESULT render.

  function enterFinalChord() {
    transition(STATES.FINAL_CHORD);
    hideAll();   // blank screen while chord plays

    playFinalChord(scores, directions);

    // Wait for full chord duration plus delay-node tail before showing result
    timerId = setTimeout(function () {
      if (!inState(STATES.FINAL_CHORD)) return;
      enterFinalResult();
    }, RESULT_CHORD_DUR + RESULT_CHORD_TAIL);
  }

  // ── State: FINAL_RESULT ───────────────────────────────────────────────────────
  // All 5 pairs, total score, share + play again.

  function enterFinalResult() {
    transition(STATES.FINAL_RESULT);
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

    var total            = scores.reduce(function (s, v) { return s + v; }, 0);
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

  // ── Reset / new game ──────────────────────────────────────────────────────────

  function startNewGame() {
    clearTimers();
    colors      = generateColors();
    pickedHexes = [];
    scores      = [];
    directions  = NOTES.map(function () { return Math.random() < 0.5 ? 1 : -1; });
    currentBar  = 0;

    // Reset bar opacity from previous game
    barEls.forEach(function (el) {
      el.style.opacity    = '1';
      el.style.transition = '';
    });

    enterRevealSequential();
  }

  // ── DOM bootstrap ─────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    splashEl     = document.getElementById('tn-splash');
    startBtn     = document.getElementById('tn-start-btn');
    revealEl     = document.getElementById('tn-reveal');
    revealStatus = document.getElementById('tn-reveal-status');

    barShowEl     = document.getElementById('tn-bar-show');
    showLabel     = document.getElementById('tn-show-label');
    showSwatch    = document.getElementById('tn-show-swatch');
    showCountdown = document.getElementById('tn-show-countdown');

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
    puzzleToneBtn = document.getElementById('tn-puzzle-tone-btn');
    answerToneBtn = document.getElementById('tn-answer-tone-btn');
    togetherBtn   = document.getElementById('tn-together-btn');

    barEls = [0,1,2,3,4].map(function (i) { return document.getElementById('tn-bar-' + i); });

    var dirEl = document.getElementById('tn-directions');
    if (dirEl) dirEl.textContent = DIRECTIONS_TEXT;

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });

    startBtn.addEventListener('click', startNewGame);
    againBtn.addEventListener('click', startNewGame);

    singleInput.addEventListener('input',  function () { singleSwatch.style.background = singleInput.value; });
    singleInput.addEventListener('change', function () { singleSwatch.style.background = singleInput.value; });

    singleSubmit.addEventListener('click', onSubmitPick);
    barNextBtn.addEventListener('click', onNextBar);

    puzzleToneBtn.addEventListener('click', function () { playRevealChord(); });
    answerToneBtn.addEventListener('click', function () { playFinalChord(scores, directions); });
    togetherBtn.addEventListener('click',   function () { playRevealChord(); playFinalChord(scores, directions); });
  });

  // ── Exports ───────────────────────────────────────────────────────────────────

  window.Tonal = {
    STATES:           STATES,
    NOTES:            NOTES,
    playNote:         playNote,
    playRevealChord:  playRevealChord,
    playFinalChord:   playFinalChord,
    shiftedFrequency: shiftedFrequency,
    generateColors:   generateColors,
    scoreAccuracy:    scoreAccuracy,
    hexToRgb:         hexToRgb,
    getCtx:           getCtx,
    getState:         function () { return currentState; },
  };

}());
