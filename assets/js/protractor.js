(function (global) {
  'use strict';

  // ── Geometry ─────────────────────────────────────────────────────────────────
  // The brief put the vertex at cx=150 in a 350-wide canvas with 180-long rays.
  // The sweep needs 180px either side of the vertex — 360px of room — so the
  // angled ray ran off the left edge for every angle above 146.4 degrees, which
  // is 29 of the 171 possible values including the 170 the brief asks to test.
  // The vertex is centred here and the canvas sized to the full sweep instead.
  var RAY   = 180;
  var PAD_X = 12;
  var PAD_T = 14;    // above the topmost point of a 90 degree ray
  var PAD_B = 26;    // below the vertex, for the dot and breathing room

  var W  = RAY * 2 + PAD_X * 2;   // 384
  var H  = RAY + PAD_T + PAD_B;   // 220
  var CX = W / 2;                 // 192
  var CY = RAY + PAD_T;           // 194

  var ARC_R = 55;

  var COLOURS = {
    arc:  '#FF6B35',
    base: '#2C3E50',
    ray:  '#3498DB',
  };

  var MIN_ANGLE = 5;
  var MAX_ANGLE = 175;
  var ROUNDS    = 3;

  // ── Angle generation ─────────────────────────────────────────────────────────
  function generateAngle() {
    return Math.floor(Math.random() * (MAX_ANGLE - MIN_ANGLE + 1)) + MIN_ANGLE;
  }

  // ── Diagram ──────────────────────────────────────────────────────────────────
  // Returns markup so it can be checked without a DOM. Maths is done in normal
  // orientation and flipped only on the y axis at the end, because SVG's y grows
  // downward — so "up" on screen is a subtraction.
  function buildAngleSVG(angleDegrees, opts) {
    opts = opts || {};
    var showAnswer = !!opts.showAnswer;

    var rad = (angleDegrees * Math.PI) / 180;
    var cos = Math.cos(rad);
    var sin = Math.sin(rad);

    var hx = CX + RAY;                 // horizontal ray tip
    var ax = CX + RAY * cos;           // angled ray tip
    var ay = CY - RAY * sin;

    var arcStartX = CX + ARC_R;
    var arcEndX   = CX + ARC_R * cos;
    var arcEndY   = CY - ARC_R * sin;

    // Angles are capped at 175, so the arc is always the minor one
    var largeArc = angleDegrees > 180 ? 1 : 0;
    // sweep 0: with y flipped, decreasing theta sweeps anticlockwise on screen
    var sweep = 0;

    // Arrowhead sits on the ray, 12 back from the tip, 5 either side.
    // perpendicular of (cos, -sin) is (sin, cos)
    function head(tipX, tipY, dx, dy) {
      var bx = tipX - 12 * dx, by = tipY - 12 * dy;
      var px = -dy, py = dx;      // unit perpendicular
      return [
        tipX + ',' + tipY,
        (bx + 5 * px) + ',' + (by + 5 * py),
        (bx - 5 * px) + ',' + (by - 5 * py),
      ].join(' ');
    }

    // Label sits on the bisector, but a narrow wedge cannot hold it: the wedge
    // half-width there is R*sin(a/2), which is under the text's ~12px half-height
    // below about 16 degrees, and pushing the radius out cannot rescue 5 degrees
    // (it would need 275px against a 180px ray). So for narrow angles the label
    // is nudged perpendicular, out of the wedge, where it stays readable.
    var label  = showAnswer ? (angleDegrees + '°') : '?°';
    var labelR = ARC_R * 1.6;
    var half   = rad / 2;

    // Distance from the bisector to either ray at the label radius. When that is
    // narrower than the text needs, the label is moved perpendicular far enough
    // to land clear on the far side of the angled ray — nudging it only part way
    // would swap a collision with one ray for a collision with the other.
    var inWedge = labelR * Math.sin(half);
    var NEEDED  = 14;
    var offset  = inWedge >= NEEDED ? 0 : inWedge + NEEDED;

    var lx = CX + labelR * Math.cos(half) - offset * Math.sin(half);
    var ly = CY - labelR * Math.sin(half) - offset * Math.cos(half) + 6;

    return [
      '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg"',
      '     class="pt-diagram" role="img"',
      '     aria-label="' + (showAnswer ? 'An angle of ' + angleDegrees + ' degrees'
                                        : 'An angle to estimate') + '">',
      // arc first, so the rays sit on top of it
      '  <path d="M ' + f(arcStartX) + ' ' + f(CY) +
             ' A ' + ARC_R + ' ' + ARC_R + ' 0 ' + largeArc + ' ' + sweep +
             ' ' + f(arcEndX) + ' ' + f(arcEndY) + '"',
      '        fill="none" stroke="' + COLOURS.arc + '" stroke-width="3" stroke-linecap="round"/>',
      // horizontal ray
      '  <line x1="' + f(CX) + '" y1="' + f(CY) + '" x2="' + f(hx) + '" y2="' + f(CY) + '"',
      '        stroke="' + COLOURS.base + '" stroke-width="3" stroke-linecap="round"/>',
      '  <polygon points="' + head(f(hx), f(CY), 1, 0) + '" fill="' + COLOURS.base + '"/>',
      // angled ray
      '  <line x1="' + f(CX) + '" y1="' + f(CY) + '" x2="' + f(ax) + '" y2="' + f(ay) + '"',
      '        stroke="' + COLOURS.ray + '" stroke-width="3" stroke-linecap="round"/>',
      '  <polygon points="' + head(f(ax), f(ay), cos, -sin) + '" fill="' + COLOURS.ray + '"/>',
      // vertex
      '  <circle cx="' + f(CX) + '" cy="' + f(CY) + '" r="5" fill="' + COLOURS.base + '"/>',
      // label on the bisector
      '  <text x="' + f(lx) + '" y="' + f(ly) + '" font-size="20" font-weight="700"',
      '        fill="' + COLOURS.arc + '" text-anchor="middle"',
      '        font-family="DM Sans, system-ui, sans-serif">' + label + '</text>',
      '</svg>',
    ].join('\n');
  }

  function f(n) { return Math.round(n * 100) / 100; }

  function renderAngleDiagram(angleDegrees, el, opts) {
    if (!el) return '';
    var markup = buildAngleSVG(angleDegrees, opts);
    el.innerHTML = markup;
    return markup;
  }

  // ── Scoring ──────────────────────────────────────────────────────────────────
  function scoreRound(correctAngle, guessedAngle) {
    return Math.abs(correctAngle - guessedAngle);
  }

  function getBadge(totalScore) {
    if (totalScore <= 9)  return { title: 'Protractor',      emoji: '📐', color: '#2ECC71' };
    if (totalScore <= 30) return { title: 'Semi-Protractor', emoji: '📏', color: '#3498DB' };
    if (totalScore <= 50) return { title: 'Amateurtractor',  emoji: '📎', color: '#F39C12' };
    return                       { title: 'Tractor',         emoji: '🚜', color: '#E74C3C' };
  }

  // ── Guess parsing ────────────────────────────────────────────────────────────
  // A free text field admits blanks, words, negatives and absurd numbers. None of
  // those should be scored as if they were a guess, so they are rejected with a
  // reason rather than silently becoming 0.
  var GUESS_MIN = 1;
  var GUESS_MAX = 359;

  function parseGuess(raw) {
    var s = String(raw == null ? '' : raw).trim().replace(/°$/, '').trim();
    if (!s) return { ok: false, reason: 'Enter a number of degrees.' };
    if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, reason: 'Numbers only — try again.' };
    var n = parseFloat(s);
    if (!isFinite(n)) return { ok: false, reason: 'Numbers only — try again.' };
    if (!Number.isInteger(n)) return { ok: false, reason: 'Whole degrees only.' };
    if (n < GUESS_MIN || n > GUESS_MAX) {
      return { ok: false, reason: 'Pick a number between ' + GUESS_MIN + ' and ' + GUESS_MAX + '.' };
    }
    return { ok: true, value: n };
  }

  // ── Per-round feedback band ──────────────────────────────────────────────────
  function scoreBand(score) {
    if (score <= 3)  return { label: 'Nearly perfect!',  color: '#2ECC71', key: 'great' };
    if (score <= 10) return { label: 'Great eye!',       color: '#3498DB', key: 'good' };
    if (score <= 20) return { label: 'Not bad!',         color: '#F39C12', key: 'ok'   };
    return                  { label: 'Keep practicing!', color: '#E74C3C', key: 'poor' };
  }

  // ── Game state ───────────────────────────────────────────────────────────────
  var gameState = {
    rounds:       [],
    currentRound: 0,
    currentAngle: null,
    totalScore:   null,
  };

  function startGame() {
    gameState = { rounds: [], currentRound: 0, currentAngle: generateAngle(), totalScore: null };
    return gameState;
  }

  // Records the guess, advances, and returns what just happened so the UI can
  // show it. Returns null if the round is invalid or the game is already over.
  function submitGuess(raw) {
    if (gameState.currentAngle === null) return null;
    if (gameState.currentRound >= ROUNDS) return null;

    var parsed = parseGuess(raw);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };

    var angle = gameState.currentAngle;
    var score = scoreRound(angle, parsed.value);
    gameState.rounds.push({ angle: angle, guess: parsed.value, score: score });
    gameState.currentRound++;

    var done = gameState.currentRound >= ROUNDS;
    if (done) {
      gameState.totalScore = gameState.rounds.reduce(function (a, r) { return a + r.score; }, 0);
      gameState.currentAngle = null;
    } else {
      gameState.currentAngle = generateAngle();
    }

    return {
      ok: true, angle: angle, guess: parsed.value, score: score,
      roundIndex: gameState.currentRound - 1, done: done,
      totalScore: done ? gameState.totalScore : null,
      badge: done ? getBadge(gameState.totalScore) : null,
    };
  }

  // ── Page controller ──────────────────────────────────────────────────────────
  // Everything above is DOM-free so it can be exercised headlessly. This half
  // wires it to the page, and no-ops when the elements aren't there.

  // Splash and the how-to-play popup show the same words — one copy, two places.
  var DIRECTIONS_TEXT =
    'Protractor shows you an angle made of two rays. One ray always points ' +
    'right. Your job is to estimate how many degrees the other ray makes with ' +
    'it. Type your best guess and submit. Three rounds, and your score is how ' +
    'far off you were in total across all three angles — lower is better. ' +
    'After three rounds you\'ll earn a title based on your accuracy. Perfect ' +
    'geometry students earn the coveted Protractor. Everyone else... well, ' +
    'there\'s always the tractor.';

  var el = {};
  var LAST_LABEL = 'See Results';
  var SHARE_URL  = 'https://www.thebunnygame.com/protractor';
  var BEST_KEY   = 'protractor_bestScore';

  function q(id) { return document.getElementById(id); }

  // ── Personal best ────────────────────────────────────────────────────────────
  // Lower is better. Storage can throw (private mode, quota) and a stored value
  // can be anything a previous version or a hand-edit left behind, so a bad
  // reading is treated as "no best yet" rather than poisoning the comparison.
  function loadBest() {
    try {
      var raw = localStorage.getItem(BEST_KEY);
      if (raw === null) return null;
      var n = parseInt(raw, 10);
      return (isFinite(n) && n >= 0) ? n : null;
    } catch (e) { return null; }
  }

  function saveBest(total) {
    try { localStorage.setItem(BEST_KEY, String(total)); } catch (e) { /* not fatal */ }
  }

  // ── Share ────────────────────────────────────────────────────────────────────
  function getShareText(totalScore, badge) {
    var url = SHARE_URL;
    return 'Protractor — ' + totalScore + '° off total. Rated: ' + badge.emoji + ' ' +
           badge.title + '. Can you beat that? ' + url;
  }

  function show(screen) {
    ['splash', 'round', 'results'].forEach(function (name) {
      if (el[name]) el[name].classList.toggle('pt-hide', name !== screen);
    });
  }

  function setError(msg) {
    if (!el.error) return;
    el.error.textContent = msg || '';
    el.error.classList.toggle('pt-hide', !msg);
    if (el.input) el.input.classList.toggle('pt-input-bad', !!msg);
  }

  // Draws the live round: fresh diagram with the answer hidden, empty input,
  // guess form back in place of the previous round's result.
  function renderRound() {
    if (gameState.currentAngle === null) return;
    el.roundLabel.textContent = 'Round ' + (gameState.currentRound + 1) + ' of ' + ROUNDS;
    renderAngleDiagram(gameState.currentAngle, el.diagram, { showAnswer: false });
    setError('');
    el.input.value = '';
    el.input.disabled = false;
    el.submit.disabled = false;
    el.guess.classList.remove('pt-hide');
    el.result.classList.add('pt-hide');
    show('round');
  }

  function renderResult(res) {
    // Same diagram, answer now filled in
    renderAngleDiagram(res.angle, el.diagram, { showAnswer: true });

    var band = scoreBand(res.score);
    el.yourGuess.textContent = res.guess + '°';
    el.actual.textContent    = res.angle + '°';
    el.off.textContent       = 'Off by ' + res.score + '°';
    el.off.style.color       = band.color;
    el.band.textContent      = band.label;
    el.next.textContent      = res.done ? LAST_LABEL : 'Next Round';

    el.guess.classList.add('pt-hide');
    el.result.classList.remove('pt-hide');
  }

  // ── Badge reveal ─────────────────────────────────────────────────────────────

  var revealTimers = [];
  var counterRaf   = null;
  var revealTotal  = 0;
  var revealActive = false;

  function reducedMotion() {
    return typeof matchMedia === 'function' &&
           matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function after(ms, fn) { revealTimers.push(setTimeout(fn, ms)); }

  function clearRevealTimers() {
    revealTimers.forEach(clearTimeout);
    revealTimers = [];
    if (counterRaf) { cancelAnimationFrame(counterRaf); counterRaf = null; }
  }

  function scrim(on) {
    if (!el.scrim) return;
    if (on) {
      el.scrim.classList.remove('pt-hide');
      void el.scrim.offsetWidth;              // commit the un-hide before the fade
      el.scrim.classList.add('pt-scrim-on');
    } else {
      el.scrim.classList.remove('pt-scrim-on');
      after(320, function () { el.scrim.classList.add('pt-hide'); });
    }
  }

  function countTo(total, ms) {
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / ms);
      var eased = 1 - Math.pow(1 - t, 3);     // ease-out: fast, then settles
      el.total.textContent = Math.round(total * eased) + '°';
      if (t < 1) { counterRaf = requestAnimationFrame(step); }
      else { counterRaf = null; el.total.textContent = total + '°'; }
    }
    counterRaf = requestAnimationFrame(step);
  }

  // Jumps to the end state. Safe to call at any point in the sequence — it is
  // both the natural finish and the skip handler.
  function finishReveal() {
    clearRevealTimers();
    revealActive = false;
    el.total.textContent = revealTotal + '°';
    el.badge.classList.remove('pt-hide');
    el.badgeTitle.classList.remove('pt-anim');
    el.badgeEmoji.classList.remove('pt-anim');
    el.results.classList.remove('pt-revealing', 'pt-tail-in');
    if (el.scrim) {
      el.scrim.classList.remove('pt-scrim-on');
      el.scrim.classList.add('pt-hide');
    }
  }

  function playReveal(total) {
    clearRevealTimers();
    revealTotal  = total;
    revealActive = true;

    el.results.classList.add('pt-revealing');
    el.results.classList.remove('pt-tail-in');
    el.badge.classList.add('pt-hide');
    el.badgeTitle.classList.remove('pt-anim');
    el.badgeEmoji.classList.remove('pt-anim');
    el.total.textContent = '0°';

    if (reducedMotion()) { finishReveal(); return; }

    scrim(true);                                        // 0–300ms  dim
    after(300,  function () { countTo(total, 800); });  // 300–1100 count up
    after(1600, function () {                           // 1100–1600 pause, then slam
      // requestAnimationFrame stops in a backgrounded tab while setTimeout keeps
      // going, which can land the badge on top of a counter still reading 0.
      // The total is settled here rather than trusted to have counted itself.
      if (counterRaf) { cancelAnimationFrame(counterRaf); counterRaf = null; }
      el.total.textContent = total + '°';
      el.badge.classList.remove('pt-hide');
      el.badgeTitle.classList.add('pt-anim');
    });
    after(1900, function () { el.badgeEmoji.classList.add('pt-anim'); });
    after(2320, function () {                           // badge landed — hand back the page
      el.results.classList.add('pt-tail-in');
      scrim(false);
      after(400, finishReveal);
    });
  }

  function renderResults() {
    var total = gameState.totalScore || 0;
    var badge = getBadge(total);

    // Read the old best before overwriting it, or every game looks like a tie
    var prevBest = loadBest();
    var improved = prevBest === null || total < prevBest;
    if (improved) saveBest(total);
    var best = improved ? total : prevBest;

    el.badgeTitle.textContent = badge.title;
    el.badgeTitle.style.color = badge.color;
    el.badgeEmoji.textContent = badge.emoji;

    el.best.innerHTML = improved
      ? '<span class="pt-best-new">New personal best!</span> Your best: ' + best + '°'
      : 'Your best: ' + best + '°';

    el.recap.innerHTML = gameState.rounds.map(function (r, i) {
      var band = scoreBand(r.score);
      return '<li>' +
        '<span class="pt-recap-round">Round ' + (i + 1) + '</span>' +
        '<span class="pt-recap-detail">' + r.angle + '° &rarr; ' + r.guess + '°</span>' +
        '<span class="pt-recap-score" style="color:' + band.color + '">off by ' + r.score + '°</span>' +
      '</li>';
    }).join('');

    show('results');
    playReveal(total);
  }

  function onSubmit(e) {
    if (e) e.preventDefault();
    var res = submitGuess(el.input.value);
    if (!res) return;                       // no live round
    if (!res.ok) { setError(res.reason); el.input.focus(); return; }
    setError('');
    // The next angle is already drawn but not yet shown — lock the field so a
    // stray keystroke can't land on a round the player hasn't seen.
    el.input.disabled = true;
    el.submit.disabled = true;
    renderResult(res);
    el.next.focus();
  }

  function onNext() {
    if (gameState.currentRound >= ROUNDS) renderResults();
    else renderRound();
  }

  function begin() {
    clearRevealTimers();
    revealActive = false;
    el.results.classList.remove('pt-revealing', 'pt-tail-in');
    if (el.scrim) { el.scrim.classList.remove('pt-scrim-on'); el.scrim.classList.add('pt-hide'); }
    startGame();
    renderRound();
  }

  function onShare() {
    var total = gameState.totalScore;
    if (total === null) return;
    if (typeof shareText === 'function') {
      shareText(getShareText(total, getBadge(total)), 'Protractor');
    }
  }

  // Tapping during the hand-out skips to the end — a player who has seen the
  // animation shouldn't have to sit through it again.
  function onRevealTap() { if (revealActive) finishReveal(); }

  function init() {
    el = {
      splash:     q('pt-splash'),
      round:      q('pt-round'),
      results:    q('pt-results'),
      roundLabel: q('pt-round-label'),
      diagram:    q('pt-diagram'),
      guess:      q('pt-guess'),
      input:      q('pt-input'),
      error:      q('pt-error'),
      submit:     q('pt-submit-btn'),
      result:     q('pt-result'),
      yourGuess:  q('pt-your-guess'),
      actual:     q('pt-actual'),
      off:        q('pt-off'),
      band:       q('pt-band'),
      next:       q('pt-next-btn'),
      total:      q('pt-total'),
      recap:      q('pt-recap'),
      badge:      q('pt-badge'),
      badgeTitle: q('pt-badge-title'),
      badgeEmoji: q('pt-badge-emoji'),
      best:       q('pt-best'),
      share:      q('pt-share-btn'),
      scrim:      q('pt-scrim'),
    };
    if (!el.round || !el.guess || !el.input) return;   // not the game page

    q('pt-start-btn').addEventListener('click', begin);
    q('pt-again-btn').addEventListener('click', begin);
    el.share.addEventListener('click', onShare);
    el.guess.addEventListener('submit', onSubmit);
    el.next.addEventListener('click', onNext);
    el.results.addEventListener('click', onRevealTap);
    if (el.scrim) el.scrim.addEventListener('click', onRevealTap);
    el.input.addEventListener('input', function () { if (el.error && el.error.textContent) setError(''); });

    var splashDir = q('pt-splash-dir');
    if (splashDir) splashDir.textContent = DIRECTIONS_TEXT;

    var help = q('help-btn');
    if (help && typeof openDirections === 'function') {
      help.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });
    }

    // The splash is mandatory on every load — there is no "seen it" shortcut.
    show('splash');
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  global.Protractor = {
    // geometry, exposed so tests can check the diagram fits
    W: W, H: H, CX: CX, CY: CY, RAY: RAY, ARC_R: ARC_R,
    MIN_ANGLE: MIN_ANGLE, MAX_ANGLE: MAX_ANGLE, ROUNDS: ROUNDS,
    generateAngle:      generateAngle,
    buildAngleSVG:      buildAngleSVG,
    renderAngleDiagram: renderAngleDiagram,
    scoreRound:         scoreRound,
    scoreBand:          scoreBand,
    getBadge:           getBadge,
    parseGuess:         parseGuess,
    startGame:          startGame,
    submitGuess:        submitGuess,
    getState:           function () { return gameState; },
    getShareText:  getShareText,
    loadBest:      loadBest,
    saveBest:      saveBest,
    BEST_KEY:      BEST_KEY,
    // page controller, exposed for verification
    begin:         begin,
    renderRound:   renderRound,
    renderResults: renderResults,
    onSubmit:      onSubmit,
    onNext:        onNext,
    playReveal:    playReveal,
    finishReveal:  finishReveal,
  };

}(typeof window !== 'undefined' ? window : globalThis));
