(function () {
  'use strict';

  var DIRECTIONS_TEXT = 'A nose drifts back and forth — and eventually up and down too. A pickle waits below, ready to launch. Time your press so the pickle tip sticks right into one of the two nostrils at the top of its arc. Miss three times in a round and you’re back to round one. Land it and the next round gets trickier. How far can you go?';

  // ── Tunable constants ────────────────────────────────────────────

  var BASE_SPEED             = 120;   // px/sec horizontal speed at round 1
  var SPEED_INCREMENT        = 22;    // px/sec added per round (rounds 2-10)
  var VERT_SPEED_BASE        = 75;    // px/sec vertical speed introduced at round 11
  var FLIGHT_DURATION_MS     = 900;   // ms total pickle flight (up + down)
  var NOSTRIL_HIT_X_TOL      = 18;   // px horizontal tolerance per nostril (all rounds)
  var NOSTRIL_HIT_Y_TOL      = 14;   // px vertical tolerance per nostril (all rounds)
  var PEAK_Y_FRAC            = 0.28;  // pickle tip reaches this fraction from play-area top at peak
  var STICK_DURATION_MS      = 2500;  // ms pickle stays attached before transition screen
  var TRANSITION_DURATION_MS = 1600;  // ms round-number screen is shown

  // Nostril positions as fractions of nose image dimensions.
  // Derived from st82 path centroid analysis of nose.svg (viewBox 0 0 91.21 111.989).
  // Left centroid: (0.285, 0.796), right centroid: (0.723, 0.789) — averaged Y to 0.79.
  var NOSTRIL_LEFT_X_REL  = 0.285;
  var NOSTRIL_RIGHT_X_REL = 0.723;
  var NOSTRIL_Y_REL       = 0.79;

  // SVG intrinsic aspect ratios (viewBox: nose 91.21x111.989, pickle 36.847x111.989)
  var NOSE_ASPECT   = 111.989 / 91.21;
  var PICKLE_ASPECT = 111.989 / 36.847;
  var PICKLE_W_FRAC = 36.847 / 91.21;

  var LS_KEY = 'pickler_bestRound';

  // ── Layout (computed in computeLayout) ──────────────────────────────

  var PLAY_W = 0, PLAY_H = 0;
  var NOSE_W = 0, NOSE_H = 0;
  var PICKLE_W = 0, PICKLE_H = 0;
  var PICKLE_REST_TOP = 0;
  var PICKLE_CENTER_X = 0;
  var PEAK_Y = 0;
  var PEAK_HEIGHT_PX = 0;
  var NOSE_Y_FIXED = 0;
  var NOSE_Y_MIN = 0, NOSE_Y_MAX = 0;

  // ── Game state ───────────────────────────────────────────────

  var round      = 1;
  var lives      = 3;
  var bestRound  = 0;
  var gameActive = false;
  var nosePaused = false;

  var noseX = 0, noseY = 0;
  var noseVX = 0, noseVY = 0;
  var moveStyle    = 'bounce';
  var jitterTimerX = 0, jitterTimerY = 0;

  var isFlying      = false;
  var flightElapsed = 0;
  var hitChecked    = false;

  var stickPhase        = false;
  var stickElapsed      = 0;
  var stickNostrilXRel  = 0;   // NOSTRIL_LEFT_X_REL or NOSTRIL_RIGHT_X_REL of the hit nostril
  var transitionTimeout = null;

  var lastTime = null;
  var raf      = null;

  // ── DOM refs ───────────────────────────────────────────────────────

  var playAreaEl, noseEl, pickleEl, hitFlashEl;
  var roundDisplay, livesDisplay, launchBtn;
  var gameEl, endEl, endSubEl, shareBtn, playAgainBtn;
  var roundScreenEl, roundScreenNumEl;

  document.addEventListener('DOMContentLoaded', function () {
    playAreaEl       = document.getElementById('pk-play-area');
    noseEl           = document.getElementById('pk-nose');
    pickleEl         = document.getElementById('pk-pickle');
    hitFlashEl       = document.getElementById('pk-hit-flash');
    roundDisplay     = document.getElementById('pk-round-display');
    livesDisplay     = document.getElementById('pk-lives-display');
    launchBtn        = document.getElementById('pk-launch-btn');
    gameEl           = document.getElementById('pk-game');
    endEl            = document.getElementById('pk-end');
    endSubEl         = document.getElementById('pk-end-sub');
    shareBtn         = document.getElementById('pk-share');
    playAgainBtn     = document.getElementById('pk-play-again');
    roundScreenEl    = document.getElementById('pk-round-screen');
    roundScreenNumEl = document.getElementById('pk-round-screen-num');

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });

    launchBtn.addEventListener('click', function () {
      if (!isFlying && gameActive && !nosePaused && !stickPhase) launch();
    });

    playAgainBtn.addEventListener('click', startGame);

    bestRound = parseInt(localStorage.getItem(LS_KEY) || '0', 10);

    computeLayout();
    startGame();
  });

  // ── Layout ──────────────────────────────────────────────────────────────

  function computeLayout() {
    PLAY_W = playAreaEl.offsetWidth;
    PLAY_H = playAreaEl.offsetHeight;

    NOSE_W   = Math.min(150, PLAY_W * 0.39);
    NOSE_H   = NOSE_W * NOSE_ASPECT;
    PICKLE_W = NOSE_W * PICKLE_W_FRAC;
    PICKLE_H = PICKLE_W * PICKLE_ASPECT;

    noseEl.style.width   = NOSE_W + 'px';
    pickleEl.style.width = PICKLE_W + 'px';

    PEAK_Y          = PLAY_H * PEAK_Y_FRAC;
    NOSE_Y_FIXED    = PEAK_Y - NOSTRIL_Y_REL * NOSE_H;
    PICKLE_REST_TOP = PLAY_H - PICKLE_H;
    PEAK_HEIGHT_PX  = PICKLE_REST_TOP - PEAK_Y;
    PICKLE_CENTER_X = PLAY_W / 2;

    pickleEl.style.left = (PICKLE_CENTER_X - PICKLE_W / 2) + 'px';

    var vRange = PLAY_H * 0.13;
    NOSE_Y_MIN = Math.max(-NOSE_H * 0.2, NOSE_Y_FIXED - vRange);
    NOSE_Y_MAX = Math.min(PLAY_H - NOSE_H * 0.5, NOSE_Y_FIXED + vRange);
  }

  // ── Game control ───────────────────────────────────────────────────

  function startGame() {
    round        = 1;
    lives        = 3;
    isFlying     = false;
    nosePaused   = false;
    gameActive   = true;
    stickPhase   = false;
    stickElapsed = 0;

    if (transitionTimeout) { clearTimeout(transitionTimeout); transitionTimeout = null; }

    roundScreenEl.classList.add('pk-hide');
    endEl.classList.add('pk-hide');
    gameEl.classList.remove('pk-hide');

    pickleEl.style.left = (PICKLE_CENTER_X - PICKLE_W / 2) + 'px';
    setPicklePos(0);
    startRound();
  }

  function startRound() {
    updateBest();
    updateHUD();

    isFlying      = false;
    flightElapsed = 0;
    hitChecked    = false;
    nosePaused    = false;
    stickPhase    = false;
    launchBtn.disabled = false;

    pickleEl.style.left = (PICKLE_CENTER_X - PICKLE_W / 2) + 'px';
    setPicklePos(0);

    noseX = (PLAY_W - NOSE_W) / 2;
    noseY = NOSE_Y_FIXED;

    randomizeMovement();

    if (raf) cancelAnimationFrame(raf);
    lastTime = null;
    raf = requestAnimationFrame(loop);
  }

  function randomizeMovement() {
    var r     = Math.min(round, 10);
    var speed = BASE_SPEED + (r - 1) * SPEED_INCREMENT;
    noseVX    = speed * (Math.random() < 0.5 ? 1 : -1);

    noseVY = (round >= 11) ? VERT_SPEED_BASE * (Math.random() < 0.5 ? 1 : -1) : 0;

    moveStyle    = Math.random() < 0.5 ? 'bounce' : 'jitter';
    jitterTimerX = randomInterval();
    jitterTimerY = randomInterval();
  }

  function randomInterval() {
    return 0.35 + Math.random() * 1.1;
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    if (!nosePaused) updateNose(dt);
    if (isFlying)    updatePickle(dt);
    if (stickPhase)  updateStick(dt);

    // Position nose
    noseEl.style.left = noseX + 'px';
    noseEl.style.top  = noseY + 'px';

    // During stick phase: pickle follows the hit nostril's position exactly
    if (stickPhase) {
      var sAbsX = noseX + stickNostrilXRel * NOSE_W;
      var sAbsY = noseY + NOSTRIL_Y_REL * NOSE_H;
      pickleEl.style.left = (sAbsX - PICKLE_W / 2) + 'px';
      pickleEl.style.top  = sAbsY + 'px';
    }

    raf = requestAnimationFrame(loop);
  }

  // ── Nose movement ───────────────────────────────────────────────────────

  function updateNose(dt) {
    if (moveStyle === 'bounce') {
      noseX += noseVX * dt;
      if (noseX <= 0)              { noseX = 0;               noseVX =  Math.abs(noseVX); }
      if (noseX + NOSE_W >= PLAY_W){ noseX = PLAY_W - NOSE_W; noseVX = -Math.abs(noseVX); }
    } else {
      jitterTimerX -= dt;
      if (jitterTimerX <= 0) { noseVX = -noseVX; jitterTimerX = randomInterval(); }
      noseX += noseVX * dt;
      if (noseX <= 0)              { noseX = 0;               noseVX =  Math.abs(noseVX); jitterTimerX = randomInterval(); }
      if (noseX + NOSE_W >= PLAY_W){ noseX = PLAY_W - NOSE_W; noseVX = -Math.abs(noseVX); jitterTimerX = randomInterval(); }
    }

    if (round >= 11) {
      if (moveStyle === 'bounce') {
        noseY += noseVY * dt;
        if (noseY <= NOSE_Y_MIN) { noseY = NOSE_Y_MIN; noseVY =  Math.abs(noseVY); }
        if (noseY >= NOSE_Y_MAX) { noseY = NOSE_Y_MAX; noseVY = -Math.abs(noseVY); }
      } else {
        jitterTimerY -= dt;
        if (jitterTimerY <= 0) { noseVY = -noseVY; jitterTimerY = randomInterval(); }
        noseY += noseVY * dt;
        if (noseY <= NOSE_Y_MIN) { noseY = NOSE_Y_MIN; noseVY =  Math.abs(noseVY); jitterTimerY = randomInterval(); }
        if (noseY >= NOSE_Y_MAX) { noseY = NOSE_Y_MAX; noseVY = -Math.abs(noseVY); jitterTimerY = randomInterval(); }
      }
    }
  }

  // ── Pickle physics ──────────────────────────────────────────────────────

  function launch() {
    isFlying      = true;
    flightElapsed = 0;
    hitChecked    = false;
    launchBtn.disabled = true;
  }

  function updatePickle(dt) {
    flightElapsed += dt;
    var T = FLIGHT_DURATION_MS / 1000;
    var p = flightElapsed / T;

    if (p >= 1) {
      isFlying = false;
      setPicklePos(0);
      onMiss();
      return;
    }

    var offset = PEAK_HEIGHT_PX * 4 * p * (1 - p);
    setPicklePos(offset);

    if (p >= 0.5 && !hitChecked) {
      hitChecked = true;
      checkHit();
    }
  }

  function setPicklePos(offset) {
    pickleEl.style.top = (PICKLE_REST_TOP - offset) + 'px';
  }

  // ── Hit detection — 2D per-nostril check, applied in all rounds ─────────────

  function checkHit() {
    // Pickle tip position at peak: horizontally centred, vertically at PEAK_Y
    var pickleX = PICKLE_CENTER_X;
    var pickleY = PEAK_Y;

    // Absolute nostril centres based on nose's current on-screen position
    var lnX = noseX + NOSTRIL_LEFT_X_REL  * NOSE_W;
    var lnY = noseY + NOSTRIL_Y_REL        * NOSE_H;
    var rnX = noseX + NOSTRIL_RIGHT_X_REL * NOSE_W;
    var rnY = noseY + NOSTRIL_Y_REL        * NOSE_H;

    // Both X and Y must fall within tolerance of the specific nostril centre.
    // Contact with the nose bridge, forehead, or cheeks will NOT satisfy this
    // because those areas have different X positions (bridge: ~50% of NOSE_W)
    // and different Y positions (forehead: <50% of NOSE_H).
    var leftHit  = Math.abs(lnX - pickleX) <= NOSTRIL_HIT_X_TOL &&
                   Math.abs(lnY - pickleY) <= NOSTRIL_HIT_Y_TOL;
    var rightHit = Math.abs(rnX - pickleX) <= NOSTRIL_HIT_X_TOL &&
                   Math.abs(rnY - pickleY) <= NOSTRIL_HIT_Y_TOL;

    if (leftHit || rightHit) {
      stickNostrilXRel = leftHit ? NOSTRIL_LEFT_X_REL : NOSTRIL_RIGHT_X_REL;
      onHit();
    }
    // On miss: pickle continues its arc and registers when p >= 1 in updatePickle
  }

  // ── Hit — pickle attaches to nostril, nose keeps moving ────────────────────

  function onHit() {
    isFlying     = false;
    stickPhase   = true;
    stickElapsed = 0;
    launchBtn.disabled = true;
    // nosePaused stays false — nose continues moving throughout stick phase

    hitFlashEl.classList.remove('pk-flashing');
    void hitFlashEl.offsetWidth;
    hitFlashEl.classList.add('pk-flashing');

    noseEl.classList.remove('pk-bounce');
    void noseEl.offsetWidth;
    noseEl.classList.add('pk-bounce');
    noseEl.addEventListener('animationend', function clearBounce() {
      noseEl.classList.remove('pk-bounce');
      noseEl.removeEventListener('animationend', clearBounce);
    });
  }

  function updateStick(dt) {
    stickElapsed += dt;
    if (stickElapsed >= STICK_DURATION_MS / 1000) {
      stickPhase = false;
      // Return pickle to resting centre before showing transition
      pickleEl.style.left = (PICKLE_CENTER_X - PICKLE_W / 2) + 'px';
      setPicklePos(0);
      showTransition();
    }
  }

  // ── Round transition screen ────────────────────────────────────────────

  function showTransition() {
    round++;
    roundScreenNumEl.textContent = round;
    roundScreenEl.classList.remove('pk-hide');

    transitionTimeout = setTimeout(function () {
      transitionTimeout = null;
      roundScreenEl.classList.add('pk-hide');
      lives = 3;
      startRound();
    }, TRANSITION_DURATION_MS);
  }

  // ── Miss ───────────────────────────────────────────────────────────────────

  function onMiss() {
    lives--;
    updateHUD();

    if (lives <= 0) {
      showEnd();
    } else {
      hitChecked    = false;
      flightElapsed = 0;
      launchBtn.disabled = false;
    }
  }

  // ── End screen ────────────────────────────────────────────────────────────

  function showEnd() {
    gameActive = false;
    nosePaused = true;
    if (raf) { cancelAnimationFrame(raf); raf = null; }

    updateBest();

    gameEl.classList.add('pk-hide');
    endEl.classList.remove('pk-hide');
    endSubEl.textContent = 'You made it to round ' + round;

    var msg = 'Pickler — made it to round ' + round + '. Think you can do better? https://www.thebunnygame.com/pickler';
    shareBtn.onclick = function () { shareText(msg, 'Pickler'); };
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  function updateHUD() {
    roundDisplay.textContent = 'Round ' + round + ' \xb7 Best: ' + Math.max(round, bestRound);
    var h = '';
    for (var i = 0; i < 3; i++) h += (i < lives ? '♥' : '♡') + (i < 2 ? ' ' : '');
    livesDisplay.textContent = h;
  }

  function updateBest() {
    if (round > bestRound) {
      bestRound = round;
      try { localStorage.setItem(LS_KEY, String(bestRound)); } catch (e) {}
    }
  }

})();
