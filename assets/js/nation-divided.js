/* ============================================================
   Nation Divided — split the country as close to exactly in half as you can.

   Same engine as Top Cut (cut-engine.js); the shapes are the world's coastlines
   instead of a hot dog, and a flag and a name sit above the board so the player
   always knows what they are cutting. The levels come from nation-levels.json,
   built by generate-nation-levels.mjs out of Natural Earth boundaries.
   ============================================================ */
(function (global) {
  'use strict';

  var DATA_URL = 'nation-levels.json?v=1';

  // Warm khaki over the shared linen board — an atlas, in Top Cut's palette.
  var LAND   = '#B3A585';
  var COAST  = '#4E4636';

  var SHARE_URL = 'https://www.thebunnygame.com/nation-divided';

  var DIRECTIONS_TEXT =
    'A country sits at the top of the board, named and flagged — this is not a ' +
    'guessing game, you always know what you are looking at. Drag one straight ' +
    'line across it, starting and finishing outside the border, and on release ' +
    'it splits along that line. The two pieces drop into the pans of a balance, ' +
    'and the beam tilts toward whichever piece has more land. Your score is how ' +
    'far off equal you were: split within 5% and the next country unlocks. ' +
    'A hundred countries, ordered by how awkward their borders are — compact ' +
    'ones first, shredded coastlines last. Every level stays open to replay, ' +
    'and your best split on each one is kept.';

  function q(id) { return document.getElementById(id); }

  // The board is a fixed-size canvas scaled to fit, so the header above it has
  // to be scaled by hand to stay in proportion with the shape underneath.
  function trackStageSize(stage) {
    var ident = q('nd-ident');
    if (!ident) return;
    function apply() {
      var h = stage.clientHeight;
      if (!h) return;
      ident.style.fontSize = Math.max(10, Math.round(h * 0.0265)) + 'px';
    }
    apply();
    if (typeof ResizeObserver === 'function') new ResizeObserver(apply).observe(stage);
    window.addEventListener('resize', apply);
  }

  function start(levels) {
    var flagEl = q('nd-flag');
    var nameEl = q('nd-name');

    var game = global.CutEngine.mount({
      levels: levels.map(function (l) {
        return {
          name: l.name, cc: l.cc, outer: l.outer, holes: l.holes,
          fill: LAND, stroke: COAST,
        };
      }),
      passPct: 5,
      storeKey: 'nationdivided_progress',
      noun: 'country',
      shareTitle: 'Nation Divided',
      directions: DIRECTIONS_TEXT,
      // The board reserves this slice of its own height for the flag and name.
      headerFrac: 0.075,
      prompt: function (lv) { return 'Drag a straight cut across ' + lv.name; },
      shareText: function (lv, pct) {
        return 'I split ' + lv.name + ' ' + pct +
               '% off on Nation Divided 🌍 — think you can beat it? ' + SHARE_URL;
      },
      onLevel: function (lv) {
        if (nameEl) nameEl.textContent = lv.name;
        if (flagEl) {
          flagEl.src = 'assets/flags/' + lv.cc + '.svg';
          flagEl.alt = 'Flag of ' + lv.name;
        }
      },
    });
    if (!game) return;

    trackStageSize(q('cut-stage'));
    global.NationDivided = Object.assign({}, global.CutEngine, game);

    var play = q('cut-play-btn');
    if (play) { play.disabled = false; play.textContent = 'Play'; }
  }

  function fail(msg) {
    var line = q('nd-splash-line');
    if (line) line.textContent = msg;
    var play = q('cut-play-btn');
    if (play) { play.disabled = true; play.textContent = 'Unavailable'; }
  }

  function boot() {
    var play = q('cut-play-btn');
    // Play stays shut until the boundaries are actually here — the splash is
    // the only screen that can honestly be shown without them.
    if (play) { play.disabled = true; play.textContent = 'Loading…'; }

    fetch(DATA_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        if (!d || !d.levels || !d.levels.length) throw new Error('empty');
        start(d.levels);
      })
      .catch(function () {
        fail('Could not load the country boundaries. Check your connection and reload.');
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

}(typeof window !== 'undefined' ? window : globalThis));
