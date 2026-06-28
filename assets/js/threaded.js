(function () {
  'use strict';

  var DIRECTIONS_TEXT = 'Threaded gives you a needle and a stack of moving threads. Each thread has a circle sliding back and forth — time your launch so the needle passes clean through every active thread’s circle in one shot. Miss even one, and you’ll need to try again — no penalty, just another attempt. Clear a round and a new thread joins the stack, up to three at once. Your progress is saved — come back anytime and pick up where you left off, or start over from the beginning if you’d rather.';

  // ── Tunable constants ──────────────────────────────────────────────────────

  var BASE_SWEEP_SECS  = 2.2;  // seconds per half-sweep (left→right) at round 1 reference thread
  var SWEEP_DECREMENT  = 0.12; // seconds reduction per round
  var MIN_SWEEP_SECS   = 0.55; // floor — fastest half-sweep at high rounds
  var FLIGHT_DURATION  = 0.90; // seconds, full needle arc (up + down)
  var PEAK_Y_FRAC      = 0.10; // needle tip reaches this fraction from play-area top at peak
  var NEEDLE_H         = 90;   // needle element height px (fixed)
  var EYE_SIZE         = 28;   // eye circle diameter px

  var TRANSITION_MS    = 1400; // ms to display round-number screen
  var HIT_X_TOL        = 16;   // px horizontal tolerance from needle centre to eye centre

  // Thread Y positions as fraction from top of play area.
  // Index 0 = thread 1 (lowest, nearest needle rest), index 2 = thread 3 (highest, nearest peak).
  var THREAD_Y_FRACS = [0.65, 0.44, 0.24];

  // Speed multipliers per thread slot — fixed spread ensures threads always run at
  // meaningfully different rates regardless of round or random noise.
  var SPEED_MULTS = [0.68, 1.02, 1.52];

  var LS_KEY = 'threaded_highestRound';

  // ── Layout globals ─────────────────────────────────────────────────────────

  var PLAY_W = 0, PLAY_H = 0;
  var PEAK_Y = 0;
  var NEEDLE_REST_TOP = 0;   // needle element top when at rest
  var PEAK_HEIGHT_PX  = 0;   // total vertical travel from rest to peak
  var NEEDLE_X        = 0;   // needle horizontal centre
  var THREAD_Y        = [0, 0, 0]; // absolute Y of each thread centre

  // ── Per-thread animation state ─────────────────────────────────────────────

  var threads = [
    { eyeX: 0, phaseTime: 0, sweepDuration: 1 },
    { eyeX: 0, phaseTime: 0, sweepDuration: 1 },
    { eyeX: 0, phaseTime: 0, sweepDuration: 1 },
  ];

  // ── Game state ─────────────────────────────────────────────────────────────

  var round             = 1;
  var bestRound         = 0;
  var activeCount       = 1;
  var isFlying          = false;
  var flightElapsed     = 0;
  var transitionTimeout = null;
  var missDetected      = false;
  var checkedThisLaunch = [false, false, false];

  var lastTime = null;
  var raf      = null;

  // ── DOM refs ───────────────────────────────────────────────────────────────

  var playAreaEl, needleEl, hitFlashEl;
  var roundDisplayEl, bestDisplayEl, launchBtnEl;
  var threadEls, eyeEls;
  var roundScreenEl, roundNumEl;

  // ── Init ───────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    playAreaEl     = document.getElementById('th-play-area');
    needleEl       = document.getElementById('th-needle');
    hitFlashEl     = document.getElementById('th-hit-flash');
    roundDisplayEl = document.getElementById('th-round-display');
    bestDisplayEl  = document.getElementById('th-best-display');
    launchBtnEl    = document.getElementById('th-launch-btn');
    roundScreenEl  = document.getElementById('th-round-screen');
    roundNumEl     = document.getElementById('th-round-num');

    threadEls = [
      document.getElementById('th-thread-0'),
      document.getElementById('th-thread-1'),
      document.getElementById('th-thread-2'),
    ];
    eyeEls = [
      document.getElementById('th-eye-0'),
      document.getElementById('th-eye-1'),
      document.getElementById('th-eye-2'),
    ];

    var resumeScreenEl = document.getElementById('th-resume-screen');
    var resumeRoundEl  = document.getElementById('th-resume-round');
    var continueBtnEl  = document.getElementById('th-continue-btn');
    var restartBtnEl   = document.getElementById('th-restart-btn');

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () {
      openDirections(DIRECTIONS_TEXT);
    });

    launchBtnEl.addEventListener('click', function () {
      if (!isFlying && !transitionTimeout) launch();
    });

    continueBtnEl.addEventListener('click', function () {
      resumeScreenEl.classList.add('th-hide');
      round = bestRound + 1;
      startRound();
    });

    restartBtnEl.addEventListener('click', function () {
      resumeScreenEl.classList.add('th-hide');
      startGame();
    });

    bestRound = parseInt(localStorage.getItem(LS_KEY) || '0', 10);

    computeLayout();
    updateHUD();

    if (bestRound > 0) {
      resumeRoundEl.textContent = String(bestRound + 1);
      resumeScreenEl.classList.remove('th-hide');
    } else {
      startGame();
    }

    window.addEventListener('resize', computeLayout);
  });

  // ── Layout ─────────────────────────────────────────────────────────────────

  function computeLayout() {
    PLAY_W = playAreaEl.offsetWidth;
    PLAY_H = playAreaEl.offsetHeight;

    PEAK_Y          = PLAY_H * PEAK_Y_FRAC;
    NEEDLE_REST_TOP = PLAY_H - NEEDLE_H;
    PEAK_HEIGHT_PX  = NEEDLE_REST_TOP - PEAK_Y;
    NEEDLE_X        = PLAY_W / 2;

    // Needle: centred, 4px wide, tip = element top
    needleEl.style.left   = (NEEDLE_X - 2) + 'px';
    needleEl.style.height = NEEDLE_H + 'px';
    setNeedleOffset(0);

    // Thread lines and eye circles
    for (var i = 0; i < 3; i++) {
      THREAD_Y[i] = PLAY_H * THREAD_Y_FRACS[i];
      threadEls[i].style.top = (THREAD_Y[i] - 1) + 'px'; // centre 2px line on THREAD_Y
      eyeEls[i].style.top    = (THREAD_Y[i] - EYE_SIZE / 2) + 'px'; // eye centred on THREAD_Y
    }
  }

  // ── Game control ───────────────────────────────────────────────────────────

  function startGame() {
    round     = 1;
    isFlying  = false;
    flightElapsed = 0;
    if (transitionTimeout) { clearTimeout(transitionTimeout); transitionTimeout = null; }
    roundScreenEl.classList.add('th-hide');
    startRound();
  }

  function startRound() {
    activeCount = Math.min(round, 3);

    for (var i = 0; i < 3; i++) {
      var on = i < activeCount;
      threadEls[i].classList.toggle('th-hide', !on);
      eyeEls[i].classList.toggle('th-hide', !on);
    }

    isFlying      = false;
    flightElapsed = 0;
    setNeedleOffset(0);
    launchBtnEl.disabled = false;

    updateHUD();
    randomizeThreads();

    if (raf) cancelAnimationFrame(raf);
    lastTime = null;
    raf = requestAnimationFrame(loop);
  }

  // ── Thread randomization ───────────────────────────────────────────────────

  function randomizeThreads() {
    var baseSecs = Math.max(BASE_SWEEP_SECS - (round - 1) * SWEEP_DECREMENT, MIN_SWEEP_SECS);

    for (var i = 0; i < activeCount; i++) {
      // Higher SPEED_MULT = faster = shorter sweep duration.
      // ±10% noise keeps each round feeling fresh without changing the motion model.
      var noise = 0.90 + Math.random() * 0.20;
      threads[i].sweepDuration = (baseSecs / SPEED_MULTS[i]) * noise;
      // Start each eye at a random point in its cycle so threads feel independent
      threads[i].phaseTime = Math.random() * threads[i].sweepDuration * 2;
    }
  }

  // ── Main loop ──────────────────────────────────────────────────────────────

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    for (var i = 0; i < activeCount; i++) {
      updateEye(i, dt);
      eyeEls[i].style.left = threads[i].eyeX + 'px';
    }

    if (isFlying) updateNeedle(dt);

    raf = requestAnimationFrame(loop);
  }

  // ── Eye movement — pure triangle-wave sweep ────────────────────────────────

  function updateEye(i, dt) {
    var t    = threads[i];
    var maxX = PLAY_W - EYE_SIZE;
    t.phaseTime += dt;
    // Triangle wave: 0→sweepDuration maps to left→right, sweepDuration→2× maps back
    var cycle = t.sweepDuration * 2;
    var pos   = t.phaseTime % cycle;
    t.eyeX = pos < t.sweepDuration
      ? (pos / t.sweepDuration) * maxX
      : (1 - (pos - t.sweepDuration) / t.sweepDuration) * maxX;
  }

  // ── Needle physics ─────────────────────────────────────────────────────────

  function launch() {
    isFlying      = true;
    flightElapsed = 0;
    missDetected  = false;
    checkedThisLaunch = [false, false, false];
    launchBtnEl.disabled = true;
  }

  function updateNeedle(dt) {
    flightElapsed += dt;
    var p = flightElapsed / FLIGHT_DURATION;

    if (p >= 1) {
      isFlying = false;
      setNeedleOffset(0);
      if (missDetected) {
        onMiss();
      } else {
        onSuccess();
      }
      return;
    }

    var offset = PEAK_HEIGHT_PX * 4 * p * (1 - p);
    setNeedleOffset(offset);

    // Only check thread hits during the upward phase
    if (p <= 0.5) {
      checkThreadHits(NEEDLE_REST_TOP - offset);
    }
  }

  // ── Hit detection ──────────────────────────────────────────────────────────

  function checkThreadHits(tipY) {
    for (var i = 0; i < activeCount; i++) {
      if (checkedThisLaunch[i]) continue;
      // Needle tip has risen past this thread's height
      if (tipY <= THREAD_Y[i]) {
        checkedThisLaunch[i] = true;
        var eyeCenterX = threads[i].eyeX + EYE_SIZE / 2;
        var hit = Math.abs(eyeCenterX - NEEDLE_X) <= HIT_X_TOL;
        if (hit) {
          // Flash gold immediately if all active threads are now threaded
          if (allThreaded()) {
            hitFlashEl.classList.remove('th-flashing', 'th-miss');
            void hitFlashEl.offsetWidth;
            hitFlashEl.classList.add('th-flashing');
          }
        } else if (!missDetected) {
          // Flash red on the first miss — needle completes its arc then re-enables
          missDetected = true;
          hitFlashEl.classList.remove('th-flashing', 'th-miss');
          void hitFlashEl.offsetWidth;
          hitFlashEl.classList.add('th-flashing', 'th-miss');
        }
      }
    }
  }

  function allThreaded() {
    for (var i = 0; i < activeCount; i++) {
      if (!checkedThisLaunch[i]) return false;
    }
    return !missDetected;
  }

  function onMiss() {
    missDetected = false;
    randomizeThreads();
    launchBtnEl.disabled = false;
  }

  function setNeedleOffset(offset) {
    // Needle tip (top of element) sits at NEEDLE_REST_TOP - offset
    needleEl.style.top = (NEEDLE_REST_TOP - offset) + 'px';
  }

  // ── Round advance ──────────────────────────────────────────────────────────

  function onSuccess() {
    hitFlashEl.classList.remove('th-flashing', 'th-miss');
    void hitFlashEl.offsetWidth;
    hitFlashEl.classList.add('th-flashing');

    if (round > bestRound) {
      bestRound = round;
      try { localStorage.setItem(LS_KEY, String(bestRound)); } catch (e) {}
    }

    round++;
    roundNumEl.textContent = String(round);
    roundScreenEl.classList.remove('th-hide');
    launchBtnEl.disabled = true;

    transitionTimeout = setTimeout(function () {
      transitionTimeout = null;
      roundScreenEl.classList.add('th-hide');
      startRound();
    }, TRANSITION_MS);
  }

  // ── HUD ────────────────────────────────────────────────────────────────────

  function updateHUD() {
    roundDisplayEl.textContent = 'Round ' + round;
    bestDisplayEl.textContent  = 'Best: ' + bestRound;
  }

}());
