(function () {
  'use strict';

  var DIRECTIONS_TEXT = 'Threaded gives you a needle and up to two moving threads. Each thread has a circle sliding back and forth — tap or drag anywhere in the play area (or use the arrow buttons) to position the needle left and right, then press Launch to fire it straight up. The needle must pass clean through every active circle in one shot. Miss any one and try again — no penalty. Clear all 25 boards to win.';

  // ── Constants ──────────────────────────────────────────────────────────────

  var MAX_BOARDS     = 25;
  var FLIGHT_DURATION = 0.90;  // seconds for the parabolic arc
  var PEAK_Y_FRAC    = 0.10;  // needle tip reaches this fraction from top at peak
  var NEEDLE_H       = 90;    // needle element height px
  var EYE_SIZE       = 28;    // eye circle diameter px
  var TRANSITION_MS  = 1400;  // ms for round-number screen after success
  var HIT_X_TOL      = 16;    // px horizontal tolerance for threading
  var CLEAN_MISS_SPEED = 520; // px/s upward speed after clean miss
  var OUTCOME_DELAY_MS = { cleanMiss: 860, partial: 660, success: 460 };

  var SPEED_MULTS    = [0.75, 1.35];  // per-thread sweep speed multipliers (independent boards)
  var NEEDLE_STEP_PX = 18;
  var LS_KEY         = 'threaded_highestRound';

  // ── Board config ───────────────────────────────────────────────────────────
  // Returns { activeCount, threadYFracs, sweepSecs, synced } for board b (1-25)

  function getBoardConfig(b) {
    if (b <= 10) {
      // Single thread: height eases from low (0.78) to mid (0.52), speed increases
      var frac = 0.78 - (b - 1) * (0.26 / 9);
      var secs = 2.6  - (b - 1) * (1.4  / 9);
      return { activeCount: 1, threadYFracs: [frac, 0.44], sweepSecs: secs, synced: false };
    }
    if (b <= 20) {
      // Two threads, synced (visually move together): escalating speed
      var secs2 = 2.0 - (b - 11) * (1.1 / 9);
      return { activeCount: 2, threadYFracs: [0.65, 0.44], sweepSecs: secs2, synced: true };
    }
    // Boards 21-25: two threads, fully independent
    var secs3 = Math.max(1.2 - (b - 21) * 0.10, 0.80);
    return { activeCount: 2, threadYFracs: [0.65, 0.44], sweepSecs: secs3, synced: false };
  }

  // Current board config — initialized to board 1 defaults
  var boardConfig = getBoardConfig(1);

  // ── Layout globals ─────────────────────────────────────────────────────────

  var PLAY_W = 0, PLAY_H = 0;
  var PEAK_Y          = 0;
  var NEEDLE_REST_TOP = 0;
  var PEAK_HEIGHT_PX  = 0;
  var NEEDLE_X        = 0;
  var THREAD_Y        = [0, 0];

  // ── Per-thread state ───────────────────────────────────────────────────────

  var threads = [
    { eyeX: 0, phaseTime: 0, sweepDuration: 1 },
    { eyeX: 0, phaseTime: 0, sweepDuration: 1 },
  ];

  // ── Game state ─────────────────────────────────────────────────────────────

  var round       = 1;
  var bestRound   = 0;
  var activeCount = 1;

  // flightPhase: 'idle' | 'rising' | 'clean_miss_fly' | 'partial_hang' | 'success_ride'
  var flightPhase   = 'idle';
  var flightElapsed = 0;

  var checkedThisLaunch = [false, false];
  var hitThisLaunch     = [false, false];

  var launchAnchorX = 0;
  var needleTipX    = 0;
  var needleTipY    = 0;
  var needleRideIdx = -1;

  var transitionTimeout = null;
  var outcomeTimeout    = null;
  var isDraggingNeedle  = false;
  var navTimer          = null;

  var lastTime = null;
  var raf      = null;

  // ── DOM refs ───────────────────────────────────────────────────────────────

  var playAreaEl, needleEl;
  var roundDisplayEl, bestDisplayEl, launchBtnEl;
  var threadEls, eyeEls;
  var roundScreenEl, roundNumEl;
  var stringLineEl;
  var outcomeScreenEl, outcomeMsgEl, outcomeBtnEl;
  var winScreenEl;

  // ── Init ───────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    playAreaEl     = document.getElementById('th-play-area');
    needleEl       = document.getElementById('th-needle');
    roundDisplayEl = document.getElementById('th-round-display');
    bestDisplayEl  = document.getElementById('th-best-display');
    launchBtnEl    = document.getElementById('th-launch-btn');
    roundScreenEl  = document.getElementById('th-round-screen');
    roundNumEl     = document.getElementById('th-round-num');
    stringLineEl   = document.getElementById('th-string-line');
    outcomeScreenEl = document.getElementById('th-outcome-screen');
    outcomeMsgEl   = document.getElementById('th-outcome-msg');
    outcomeBtnEl   = document.getElementById('th-outcome-btn');
    winScreenEl    = document.getElementById('th-win-screen');

    threadEls = [
      document.getElementById('th-thread-0'),
      document.getElementById('th-thread-1'),
    ];
    eyeEls = [
      document.getElementById('th-eye-0'),
      document.getElementById('th-eye-1'),
    ];

    var resumeScreenEl = document.getElementById('th-resume-screen');
    var resumeRoundEl  = document.getElementById('th-resume-round');
    var continueBtnEl  = document.getElementById('th-continue-btn');
    var restartBtnEl   = document.getElementById('th-restart-btn');
    var winRestartBtnEl = document.getElementById('th-win-restart-btn');

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () {
      openDirections(DIRECTIONS_TEXT);
    });

    launchBtnEl.addEventListener('click', function () {
      if (flightPhase === 'idle' && !transitionTimeout) launch();
    });

    var leftBtnEl  = document.getElementById('th-left-btn');
    var rightBtnEl = document.getElementById('th-right-btn');
    leftBtnEl.addEventListener('pointerdown',  function (e) { e.preventDefault(); startNavMove(-1); });
    leftBtnEl.addEventListener('pointerup',    stopNavMove);
    leftBtnEl.addEventListener('pointerleave', stopNavMove);
    rightBtnEl.addEventListener('pointerdown',  function (e) { e.preventDefault(); startNavMove(1); });
    rightBtnEl.addEventListener('pointerup',    stopNavMove);
    rightBtnEl.addEventListener('pointerleave', stopNavMove);

    playAreaEl.addEventListener('pointerdown', function (e) {
      if (flightPhase !== 'idle') return;
      isDraggingNeedle = true;
      playAreaEl.setPointerCapture(e.pointerId);
      setNeedleX(e.clientX - playAreaEl.getBoundingClientRect().left);
    });
    playAreaEl.addEventListener('pointermove', function (e) {
      if (!isDraggingNeedle || flightPhase !== 'idle') return;
      setNeedleX(e.clientX - playAreaEl.getBoundingClientRect().left);
    });
    playAreaEl.addEventListener('pointerup',     function () { isDraggingNeedle = false; });
    playAreaEl.addEventListener('pointercancel', function () { isDraggingNeedle = false; });

    continueBtnEl.addEventListener('click', function () {
      resumeScreenEl.classList.add('th-hide');
      round = bestRound + 1;
      startRound();
    });

    restartBtnEl.addEventListener('click', function () {
      resumeScreenEl.classList.add('th-hide');
      startGame();
    });

    winRestartBtnEl.addEventListener('click', function () {
      winScreenEl.classList.add('th-hide');
      startGame();
    });

    bestRound = parseInt(localStorage.getItem(LS_KEY) || '0', 10);

    window.addEventListener('resize', computeLayout);

    requestAnimationFrame(function () {
      computeLayout();
      updateHUD();

      if (bestRound >= MAX_BOARDS) {
        showWinScreen();
      } else if (bestRound > 0) {
        resumeRoundEl.textContent = String(bestRound + 1);
        resumeScreenEl.classList.remove('th-hide');
      } else {
        startGame();
      }
    });
  });

  // ── Layout ─────────────────────────────────────────────────────────────────

  function computeLayout() {
    PLAY_W = playAreaEl.offsetWidth;
    PLAY_H = playAreaEl.offsetHeight;

    PEAK_Y          = PLAY_H * PEAK_Y_FRAC;
    NEEDLE_REST_TOP = PLAY_H - NEEDLE_H;
    PEAK_HEIGHT_PX  = NEEDLE_REST_TOP - PEAK_Y;

    setNeedleX(PLAY_W / 2);
    needleEl.style.height = NEEDLE_H + 'px';
    setNeedleTop(NEEDLE_REST_TOP);

    for (var i = 0; i < threadEls.length; i++) {
      THREAD_Y[i] = PLAY_H * boardConfig.threadYFracs[i];
      threadEls[i].style.top = (THREAD_Y[i] - 1) + 'px';
      eyeEls[i].style.top    = (THREAD_Y[i] - EYE_SIZE / 2) + 'px';
    }
  }

  // ── Game control ───────────────────────────────────────────────────────────

  function startGame() {
    round         = 1;
    flightPhase   = 'idle';
    flightElapsed = 0;
    if (transitionTimeout) { clearTimeout(transitionTimeout); transitionTimeout = null; }
    if (outcomeTimeout)    { clearTimeout(outcomeTimeout);    outcomeTimeout    = null; }
    roundScreenEl.classList.add('th-hide');
    winScreenEl.classList.add('th-hide');
    hideOutcome();
    startRound();
  }

  function startRound() {
    boardConfig = getBoardConfig(round);
    activeCount = boardConfig.activeCount;

    // Update thread positions for this board's config
    for (var i = 0; i < threadEls.length; i++) {
      THREAD_Y[i] = PLAY_H * boardConfig.threadYFracs[i];
      threadEls[i].style.top = (THREAD_Y[i] - 1) + 'px';
      eyeEls[i].style.top    = (THREAD_Y[i] - EYE_SIZE / 2) + 'px';
    }

    needleEl.style.transform = '';
    setNeedleX(PLAY_W / 2);
    setNeedleTop(NEEDLE_REST_TOP);
    clearString();
    hideOutcome();

    for (var j = 0; j < threadEls.length; j++) {
      var on = j < activeCount;
      threadEls[j].classList.toggle('th-hide', !on);
      eyeEls[j].classList.toggle('th-hide', !on);
    }

    flightPhase       = 'idle';
    flightElapsed     = 0;
    checkedThisLaunch = [false, false];
    hitThisLaunch     = [false, false];
    needleRideIdx     = -1;
    launchBtnEl.disabled = false;

    updateHUD();
    randomizeThreads();

    if (raf) cancelAnimationFrame(raf);
    lastTime = null;
    raf = requestAnimationFrame(loop);
  }

  // ── Thread randomisation ───────────────────────────────────────────────────

  function randomizeThreads() {
    var cfg = boardConfig;

    if (cfg.synced) {
      // Both threads move identically (same X every frame)
      var noise = 0.90 + Math.random() * 0.20;
      var sd    = cfg.sweepSecs * noise;
      var pt    = Math.random() * sd * 2;
      threads[0].sweepDuration = sd;
      threads[0].phaseTime     = pt;
      threads[1].sweepDuration = sd;
      threads[1].phaseTime     = pt;
      return;
    }

    if (activeCount === 1) {
      var noise1 = 0.90 + Math.random() * 0.20;
      threads[0].sweepDuration = cfg.sweepSecs * noise1;
      threads[0].phaseTime     = Math.random() * threads[0].sweepDuration * 2;
      return;
    }

    // Independent two-thread (boards 21-25): solvability check
    var MAX_TRIES = 12;
    for (var attempt = 0; attempt < MAX_TRIES; attempt++) {
      for (var i = 0; i < activeCount; i++) {
        var noise2 = 0.90 + Math.random() * 0.20;
        threads[i].sweepDuration = (cfg.sweepSecs / SPEED_MULTS[i]) * noise2;
        threads[i].phaseTime     = Math.random() * threads[i].sweepDuration * 2;
      }
      if (isSolvable()) break;
    }
  }

  // ── Solvability check ─────────────────────────────────────────────────────

  function computeFlightTime(threadIdx) {
    if (PEAK_HEIGHT_PX <= 0) return 0;
    var k = (NEEDLE_REST_TOP - THREAD_Y[threadIdx]) / PEAK_HEIGHT_PX;
    var p = (1 - Math.sqrt(Math.max(0, 1 - k))) / 2;
    return p * FLIGHT_DURATION;
  }

  function isSolvable() {
    var t0  = computeFlightTime(0);
    var t1  = computeFlightTime(1);
    var tol = 2 * HIT_X_TOL;
    for (var launchT = 0; launchT <= 15; launchT += 0.04) {
      var ex0 = eyePosAtPhaseTime(0, threads[0].phaseTime + launchT + t0);
      var ex1 = eyePosAtPhaseTime(1, threads[1].phaseTime + launchT + t1);
      if (Math.abs(ex0 - ex1) <= tol) return true;
    }
    return false;
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

    if      (flightPhase === 'rising')         updateRising(dt);
    else if (flightPhase === 'clean_miss_fly') updateCleanMissFly(dt);
    else if (flightPhase === 'partial_hang')   updatePartialHang();
    else if (flightPhase === 'success_ride')   updateSuccessRide();

    raf = requestAnimationFrame(loop);
  }

  // ── Eye movement ───────────────────────────────────────────────────────────

  function eyePosAtPhaseTime(threadIdx, pt) {
    var sd   = threads[threadIdx].sweepDuration;
    var maxX = PLAY_W - EYE_SIZE;
    var pos  = pt % (sd * 2);
    return pos < sd ? (pos / sd) * maxX : (1 - (pos - sd) / sd) * maxX;
  }

  function updateEye(i, dt) {
    threads[i].phaseTime += dt;
    threads[i].eyeX = eyePosAtPhaseTime(i, threads[i].phaseTime);
  }

  // ── Needle positioning helpers ─────────────────────────────────────────────

  function setNeedleX(x) {
    NEEDLE_X = Math.max(0, Math.min(PLAY_W, x));
    needleEl.style.left = (NEEDLE_X - 2) + 'px';
  }

  function setNeedleTop(y) {
    needleEl.style.top = y + 'px';
  }

  function startNavMove(dir) {
    if (flightPhase !== 'idle') return;
    moveNeedleStep(dir);
    navTimer = setInterval(function () { moveNeedleStep(dir); }, 60);
  }

  function stopNavMove() {
    if (navTimer) { clearInterval(navTimer); navTimer = null; }
  }

  function moveNeedleStep(dir) {
    if (flightPhase !== 'idle') { stopNavMove(); return; }
    setNeedleX(NEEDLE_X + dir * NEEDLE_STEP_PX);
  }

  // ── Launch ────────────────────────────────────────────────────────────────

  function launch() {
    flightPhase       = 'rising';
    flightElapsed     = 0;
    checkedThisLaunch = [false, false];
    hitThisLaunch     = [false, false];
    launchAnchorX     = NEEDLE_X;
    needleTipX        = NEEDLE_X;
    needleTipY        = NEEDLE_REST_TOP;
    needleRideIdx     = -1;
    launchBtnEl.disabled = true;
    clearString();
  }

  // ── Phase: rising ─────────────────────────────────────────────────────────

  function updateRising(dt) {
    flightElapsed += dt;
    var p = flightElapsed / FLIGHT_DURATION;

    if (p >= 0.5) {
      if (flightPhase === 'rising') startCleanMiss();
      return;
    }

    var offset = PEAK_HEIGHT_PX * 4 * p * (1 - p);
    var tipY   = NEEDLE_REST_TOP - offset;

    needleTipX = NEEDLE_X;
    needleTipY = tipY;
    setNeedleTop(tipY);

    checkThreadHits(tipY);

    if (flightPhase === 'rising') {
      setStringPoints([[launchAnchorX, PLAY_H], [needleTipX, needleTipY]]);
    }
  }

  // ── Phase: clean miss ─────────────────────────────────────────────────────

  function startCleanMiss() {
    flightPhase = 'clean_miss_fly';
    outcomeTimeout = setTimeout(function () {
      showOutcome('Miss', 'Try Again', retryRound);
    }, OUTCOME_DELAY_MS.cleanMiss);
  }

  function updateCleanMissFly(dt) {
    needleTipY -= CLEAN_MISS_SPEED * dt;
    needleTipX  = launchAnchorX;
    setNeedleTop(needleTipY);
    needleEl.style.left = (needleTipX - 2) + 'px';
    setStringPoints([[launchAnchorX, PLAY_H], [needleTipX, needleTipY]]);
  }

  // ── Phase: partial hang ───────────────────────────────────────────────────

  function startPartial() {
    flightPhase = 'partial_hang';
    needleRideIdx = 0;
    needleEl.style.transform = 'rotate(180deg)';
    outcomeTimeout = setTimeout(function () {
      showOutcome('So close', 'Try Again', retryRound);
    }, OUTCOME_DELAY_MS.partial);
  }

  function updatePartialHang() {
    var cx0     = threads[0].eyeX + EYE_SIZE / 2;
    var elemTop = THREAD_Y[0] + EYE_SIZE / 2 + 4;
    setNeedleTop(elemTop);
    needleEl.style.left = (cx0 - 2) + 'px';
    var visualTipY = elemTop + NEEDLE_H;
    setStringPoints([
      [launchAnchorX, PLAY_H],
      [cx0, THREAD_Y[0]],
      [cx0, visualTipY],
    ]);
  }

  // ── Phase: success ride ───────────────────────────────────────────────────

  function startSuccess() {
    flightPhase   = 'success_ride';
    needleRideIdx = activeCount - 1;
    needleTipY    = THREAD_Y[needleRideIdx];

    if (round > bestRound) {
      bestRound = round;
      try { localStorage.setItem(LS_KEY, String(bestRound)); } catch (e) {}
    }
    updateHUD();

    outcomeTimeout = setTimeout(function () {
      showOutcome('Threaded!', 'Next Round', advanceRound);
    }, OUTCOME_DELAY_MS.success);
  }

  function updateSuccessRide() {
    var rideX = threads[needleRideIdx].eyeX + EYE_SIZE / 2;
    needleTipX = rideX;
    setNeedleTop(needleTipY);
    needleEl.style.left = (rideX - 2) + 'px';

    if (activeCount === 1) {
      setStringPoints([
        [launchAnchorX, PLAY_H],
        [rideX, needleTipY],
      ]);
    } else {
      var cx0 = threads[0].eyeX + EYE_SIZE / 2;
      setStringPoints([
        [launchAnchorX, PLAY_H],
        [cx0, THREAD_Y[0]],
        [rideX, needleTipY],
      ]);
    }
  }

  // ── Hit detection ──────────────────────────────────────────────────────────

  function checkThreadHits(tipY) {
    for (var i = 0; i < activeCount; i++) {
      if (checkedThisLaunch[i]) continue;
      if (tipY > THREAD_Y[i]) continue;

      checkedThisLaunch[i] = true;
      var eyeCenterX = threads[i].eyeX + EYE_SIZE / 2;
      var hit = Math.abs(eyeCenterX - NEEDLE_X) <= HIT_X_TOL;
      hitThisLaunch[i] = hit;

      if (hit) {
        if (allThreaded()) { startSuccess(); return; }
      } else {
        if (i === 0) {
          startCleanMiss();
        } else {
          startPartial();
        }
        return;
      }
    }
  }

  function allThreaded() {
    for (var i = 0; i < activeCount; i++) {
      if (!hitThisLaunch[i]) return false;
    }
    return true;
  }

  // ── String drawing ─────────────────────────────────────────────────────────

  function setStringPoints(pts) {
    stringLineEl.setAttribute('points',
      pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ')
    );
  }

  function clearString() {
    stringLineEl.setAttribute('points', '');
  }

  // ── Outcome overlay ────────────────────────────────────────────────────────

  function showOutcome(msg, btnText, onContinue) {
    outcomeMsgEl.textContent = msg;
    outcomeBtnEl.textContent = btnText;
    outcomeBtnEl.onclick     = onContinue;
    outcomeScreenEl.classList.remove('th-hide');
  }

  function hideOutcome() {
    outcomeScreenEl.classList.add('th-hide');
    if (outcomeTimeout) { clearTimeout(outcomeTimeout); outcomeTimeout = null; }
  }

  // ── Win screen ─────────────────────────────────────────────────────────────

  function showWinScreen() {
    launchBtnEl.disabled = true;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    winScreenEl.classList.remove('th-hide');
    updateHUD();
  }

  // ── Round flow ────────────────────────────────────────────────────────────

  function retryRound() {
    if (outcomeTimeout) { clearTimeout(outcomeTimeout); outcomeTimeout = null; }
    hideOutcome();
    flightPhase              = 'idle';
    needleEl.style.transform = '';
    setNeedleX(launchAnchorX);
    setNeedleTop(NEEDLE_REST_TOP);
    clearString();
    checkedThisLaunch = [false, false];
    hitThisLaunch     = [false, false];
    randomizeThreads();
    launchBtnEl.disabled = false;
  }

  function advanceRound() {
    if (outcomeTimeout) { clearTimeout(outcomeTimeout); outcomeTimeout = null; }
    hideOutcome();
    flightPhase              = 'idle';
    needleEl.style.transform = '';

    round++;

    if (round > MAX_BOARDS) {
      showWinScreen();
      return;
    }

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
