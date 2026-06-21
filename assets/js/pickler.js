(function () {
  'use strict';

  var DIRECTIONS_TEXT = 'A nose drifts back and forth — and eventually up and down too. A pickle waits below, ready to launch. Time your press so it sticks one of the nostrils when it reaches the top. Miss three times in a round and you’re back to round one. Land it, and the next round gets trickier. How far can you go?';

  // ── Tunable constants ────────────────────────────────────────────────────

  var BASE_SPEED            = 120;  // px/sec horizontal speed at round 1
  var SPEED_INCREMENT       = 22;   // px/sec added per round (rounds 2-10)
  var VERT_SPEED_BASE       = 75;   // px/sec vertical speed introduced at round 11
  var FLIGHT_DURATION_MS    = 900;  // ms total pickle flight (up + down)
  var NOSTRIL_HIT_TOLERANCE = 36;   // px radius for horizontal hit (~= display pickle width)
  var VERT_HIT_TOLERANCE    = 28;   // px radius for vertical hit (round 11+)
  var HIT_PAUSE_MS          = 700;  // ms nose pauses after a successful hit
  var PEAK_Y_FRAC           = 0.28; // pickle tip reaches this fraction from play-area top at peak

  // Nostril positions as fractions of nose image dimensions (tune to match nose.svg)
  var NOSTRIL_LEFT_X_REL  = 0.29;
  var NOSTRIL_RIGHT_X_REL = 0.71;
  var NOSTRIL_Y_REL       = 0.74;

  // SVG intrinsic aspect ratios (from viewBox: nose 91.21×111.989, pickle 36.847×111.989)
  var NOSE_ASPECT   = 111.989 / 91.21;   // height/width
  var PICKLE_ASPECT = 111.989 / 36.847;  // height/width
  var PICKLE_W_FRAC = 36.847 / 91.21;    // pickle width relative to nose width

  var LS_KEY = 'pickler_bestRound';

  // ── Layout (computed in computeLayout) ──────────────────────────────────

  var PLAY_W = 0, PLAY_H = 0;
  var NOSE_W = 0, NOSE_H = 0;
  var PICKLE_W = 0, PICKLE_H = 0;
  var PICKLE_REST_TOP = 0;
  var PICKLE_CENTER_X = 0;
  var PEAK_Y = 0;
  var PEAK_HEIGHT_PX = 0;
  var NOSE_Y_FIXED = 0;
  var NOSE_Y_MIN = 0, NOSE_Y_MAX = 0;

  // ── Game state ───────────────────────────────────────────────────────────

  var round      = 1;
  var lives      = 3;
  var bestRound  = 0;
  var gameActive = false;
  var nosePaused = false;

  var noseX = 0, noseY = 0;
  var noseVX = 0, noseVY = 0;
  var moveStyle  = 'bounce';
  var jitterTimerX = 0, jitterTimerY = 0;

  var isFlying      = false;
  var flightElapsed = 0;
  var hitChecked    = false;

  var lastTime = null;
  var raf      = null;

  // ── DOM refs ─────────────────────────────────────────────────────────────

  var playAreaEl, noseEl, pickleEl, hitFlashEl;
  var roundDisplay, livesDisplay, launchBtn;
  var gameEl, endEl, endSubEl, shareBtn, playAgainBtn;

  document.addEventListener('DOMContentLoaded', function () {
    playAreaEl   = document.getElementById('pk-play-area');
    noseEl       = document.getElementById('pk-nose');
    pickleEl     = document.getElementById('pk-pickle');
    hitFlashEl   = document.getElementById('pk-hit-flash');
    roundDisplay = document.getElementById('pk-round-display');
    livesDisplay = document.getElementById('pk-lives-display');
    launchBtn    = document.getElementById('pk-launch-btn');
    gameEl       = document.getElementById('pk-game');
    endEl        = document.getElementById('pk-end');
    endSubEl     = document.getElementById('pk-end-sub');
    shareBtn     = document.getElementById('pk-share');
    playAgainBtn = document.getElementById('pk-play-again');

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });

    launchBtn.addEventListener('click', function () {
      if (!isFlying && gameActive && !nosePaused) launch();
    });

    playAgainBtn.addEventListener('click', startGame);

    bestRound = parseInt(localStorage.getItem(LS_KEY) || '0', 10);

    computeLayout();
    startGame();
  });

  // ── Layout ───────────────────────────────────────────────────────────────

  function computeLayout() {
    PLAY_W = playAreaEl.offsetWidth;
    PLAY_H = playAreaEl.offsetHeight;

    NOSE_W   = Math.min(100, PLAY_W * 0.26);
    NOSE_H   = NOSE_W * NOSE_ASPECT;
    PICKLE_W = NOSE_W * PICKLE_W_FRAC;
    PICKLE_H = PICKLE_W * PICKLE_ASPECT; // equals NOSE_H (same SVG height)

    noseEl.style.width   = NOSE_W + 'px';
    pickleEl.style.width = PICKLE_W + 'px';

    PEAK_Y          = PLAY_H * PEAK_Y_FRAC;
    NOSE_Y_FIXED    = PEAK_Y - NOSTRIL_Y_REL * NOSE_H;
    PICKLE_REST_TOP = PLAY_H - PICKLE_H;
    PEAK_HEIGHT_PX  = PICKLE_REST_TOP - PEAK_Y;
    PICKLE_CENTER_X = PLAY_W / 2;

    // Fix pickle horizontal center permanently
    pickleEl.style.left = (PICKLE_CENTER_X - PICKLE_W / 2) + 'px';

    // Vertical range for nose in round 11+
    var vRange   = PLAY_H * 0.13;
    NOSE_Y_MIN   = Math.max(-NOSE_H * 0.2, NOSE_Y_FIXED - vRange);
    NOSE_Y_MAX   = Math.min(PLAY_H - NOSE_H * 0.5, NOSE_Y_FIXED + vRange);
  }

  // ── Game control ─────────────────────────────────────────────────────────

  function startGame() {
    round      = 1;
    lives      = 3;
    isFlying   = false;
    nosePaused = false;
    gameActive = true;

    endEl.classList.add('pk-hide');
    gameEl.classList.remove('pk-hide');

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
    launchBtn.disabled = false;

    setPicklePos(0);

    // Centre nose initially
    noseX = (PLAY_W - NOSE_W) / 2;
    noseY = NOSE_Y_FIXED;

    randomizeMovement();

    if (raf) cancelAnimationFrame(raf);
    lastTime = null;
    raf = requestAnimationFrame(loop);
  }

  function randomizeMovement() {
    // Horizontal speed: capped at round 10, then held constant
    var r     = Math.min(round, 10);
    var speed = BASE_SPEED + (r - 1) * SPEED_INCREMENT;
    noseVX    = speed * (Math.random() < 0.5 ? 1 : -1);

    // Vertical (round 11+)
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

    noseEl.style.left = noseX + 'px';
    noseEl.style.top  = noseY + 'px';

    raf = requestAnimationFrame(loop);
  }

  // ── Nose movement ─────────────────────────────────────────────────────────

  function updateNose(dt) {
    // Horizontal
    if (moveStyle === 'bounce') {
      noseX += noseVX * dt;
      if (noseX <= 0)              { noseX = 0;             noseVX =  Math.abs(noseVX); }
      if (noseX + NOSE_W >= PLAY_W){ noseX = PLAY_W - NOSE_W; noseVX = -Math.abs(noseVX); }
    } else {
      jitterTimerX -= dt;
      if (jitterTimerX <= 0) {
        noseVX = -noseVX;
        jitterTimerX = randomInterval();
      }
      noseX += noseVX * dt;
      if (noseX <= 0)              { noseX = 0;             noseVX =  Math.abs(noseVX); jitterTimerX = randomInterval(); }
      if (noseX + NOSE_W >= PLAY_W){ noseX = PLAY_W - NOSE_W; noseVX = -Math.abs(noseVX); jitterTimerX = randomInterval(); }
    }

    // Vertical (round 11+)
    if (round >= 11) {
      if (moveStyle === 'bounce') {
        noseY += noseVY * dt;
        if (noseY <= NOSE_Y_MIN) { noseY = NOSE_Y_MIN; noseVY =  Math.abs(noseVY); }
        if (noseY >= NOSE_Y_MAX) { noseY = NOSE_Y_MAX; noseVY = -Math.abs(noseVY); }
      } else {
        jitterTimerY -= dt;
        if (jitterTimerY <= 0) {
          noseVY = -noseVY;
          jitterTimerY = randomInterval();
        }
        noseY += noseVY * dt;
        if (noseY <= NOSE_Y_MIN) { noseY = NOSE_Y_MIN; noseVY =  Math.abs(noseVY); jitterTimerY = randomInterval(); }
        if (noseY >= NOSE_Y_MAX) { noseY = NOSE_Y_MAX; noseVY = -Math.abs(noseVY); jitterTimerY = randomInterval(); }
      }
    }
  }

  // ── Pickle physics ────────────────────────────────────────────────────────

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
      // Returned to rest — register miss
      isFlying = false;
      setPicklePos(0);
      onMiss();
      return;
    }

    // Parabolic curve: offset = PEAK_HEIGHT * 4p(1-p)
    var offset = PEAK_HEIGHT_PX * 4 * p * (1 - p);
    setPicklePos(offset);

    // Hit check fires once as pickle crosses peak
    if (p >= 0.5 && !hitChecked) {
      hitChecked = true;
      checkHit();
    }
  }

  function setPicklePos(offset) {
    // offset = pixels above rest position
    pickleEl.style.top = (PICKLE_REST_TOP - offset) + 'px';
  }

  // ── Hit detection ─────────────────────────────────────────────────────────

  function checkHit() {
    // Nostril X centres (absolute in play area)
    var lnX = noseX + NOSTRIL_LEFT_X_REL  * NOSE_W;
    var rnX = noseX + NOSTRIL_RIGHT_X_REL * NOSE_W;

    var hitX = (Math.abs(lnX - PICKLE_CENTER_X) <= NOSTRIL_HIT_TOLERANCE) ||
               (Math.abs(rnX - PICKLE_CENTER_X) <= NOSTRIL_HIT_TOLERANCE);

    // Vertical check only round 11+
    var hitY = true;
    if (round >= 11) {
      var nostrilY = noseY + NOSTRIL_Y_REL * NOSE_H;
      hitY = Math.abs(nostrilY - PEAK_Y) <= VERT_HIT_TOLERANCE;
    }

    if (hitX && hitY) onHit();
    // else: miss registers naturally when pickle lands (p >= 1)
  }

  // ── Hit / Miss ────────────────────────────────────────────────────────────

  function onHit() {
    isFlying   = false;
    nosePaused = true;
    launchBtn.disabled = true;

    // Yellow flash overlay
    hitFlashEl.classList.remove('pk-flashing');
    void hitFlashEl.offsetWidth; // reflow to restart animation
    hitFlashEl.classList.add('pk-flashing');

    // Nose bounce
    noseEl.classList.remove('pk-bounce');
    void noseEl.offsetWidth;
    noseEl.classList.add('pk-bounce');
    noseEl.addEventListener('animationend', function clearBounce() {
      noseEl.classList.remove('pk-bounce');
      noseEl.removeEventListener('animationend', clearBounce);
    });

    setTimeout(function () {
      round++;
      lives      = 3;
      isFlying   = false;
      hitChecked = false;
      setPicklePos(0);
      startRound();
    }, HIT_PAUSE_MS);
  }

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
    roundDisplay.textContent = 'Round ' + round + ' · Best: ' + Math.max(round, bestRound);
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
