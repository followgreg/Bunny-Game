(function (global) {
  'use strict';

  // ── Cards ────────────────────────────────────────────────────────────────────
  var SUITS      = ['S', 'H', 'D', 'C'];
  var SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
  var SUIT_NAME  = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
  var RED        = { H: true, D: true };
  var RANK_LABEL = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  var COLS = 5, ROWS = 5, CELLS = COLS * ROWS;
  var TARGET = 13;

  // The deck partitions cleanly into six complementary pairs — A+Q, 2+J, 3+10,
  // 4+9, 5+8, 6+7 — plus the four kings, which are already 13 and answer to
  // nobody. 6 pairs x 8 cards + 4 kings = 52, so every card in the deck has a
  // way out. Whether it ever stands where it can reach that way out is the game.
  function buildDeck() {
    var deck = [];
    for (var s = 0; s < SUITS.length; s++) {
      for (var r = 1; r <= 13; r++) deck.push({ s: SUITS[s], r: r, id: SUITS[s] + r });
    }
    return deck;
  }

  function cardLabel(c) { return RANK_LABEL[c.r] + SUIT_GLYPH[c.s]; }
  function isRed(c)     { return !!RED[c.s]; }

  // ── Sight-lines ──────────────────────────────────────────────────────────────
  // Two cards can be matched when they SEE each other: same row, column or
  // diagonal, with nothing but empty cells in between. Another card blocks the
  // view.
  //
  // On a full grid every ray is blocked at distance one, so this is exactly the
  // eight-directional adjacency the game is built around — neighbours are the
  // eight touching cells and nothing else. The rule only starts to differ once
  // holes open, where a hole lets a line through instead of cutting it.
  //
  // That difference is the whole reason the game is finishable. Measured over
  // 6,000 headless deals with holes BLOCKING, the deck was cleared exactly zero
  // times, and a full-information search that was allowed to see the pile order
  // could not win one deal in sixty. The cause is structural rather than unlucky:
  // cards never move between cells, so if holes block, clearing one pair can
  // never change whether some other pair is adjacent, and the last twenty-five
  // cards have to partition into twelve disjoint touching pairs all at once. An
  // average of 18.9 of those last 25 cards had no complementary neighbour at all.
  // Letting lines through makes removal order matter, which is where what little
  // thinking this game asks for actually lives.
  var DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

  // The eight touching cells, fixed. Not the match rule — kept because a cell's
  // degree (3 in a corner, 5 on an edge, 8 in the middle) is worth having around.
  var NEIGHBORS = (function () {
    var table = [];
    for (var i = 0; i < CELLS; i++) {
      var r = (i / COLS) | 0, c = i % COLS, list = [];
      for (var d = 0; d < DIRS.length; d++) {
        var nr = r + DIRS[d][0], nc = c + DIRS[d][1];
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        list.push(nr * COLS + nc);
      }
      table.push(list);
    }
    return table;
  }());

  function sign(n) { return n > 0 ? 1 : (n < 0 ? -1 : 0); }

  function canSee(state, a, b) {
    if (a === b) return false;
    if (!state.grid[a] || !state.grid[b]) return false;
    var ra = (a / COLS) | 0, ca = a % COLS;
    var rb = (b / COLS) | 0, cb = b % COLS;
    var dr = rb - ra, dc = cb - ca;
    // Must lie on one of the eight rays: same row, same column, or true diagonal.
    if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return false;
    var sr = sign(dr), sc = sign(dc);
    var steps = Math.max(Math.abs(dr), Math.abs(dc));
    for (var k = 1; k < steps; k++) {
      if (state.grid[(ra + sr * k) * COLS + (ca + sc * k)]) return false;   // blocked
    }
    return true;
  }

  // Every card the given cell can currently see — at most eight, one per ray.
  function sightNeighbors(state, i) {
    var r = (i / COLS) | 0, c = i % COLS, out = [];
    for (var d = 0; d < DIRS.length; d++) {
      var nr = r + DIRS[d][0], nc = c + DIRS[d][1];
      while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        var j = nr * COLS + nc;
        if (state.grid[j]) { out.push(j); break; }
        nr += DIRS[d][0]; nc += DIRS[d][1];
      }
    }
    return out;
  }

  // ── Seeding ──────────────────────────────────────────────────────────────────
  // Same hash + LCG the other daily games use, so a date reproduces a deal for
  // everyone. Practice skips it and asks the platform for entropy instead.
  function getTodayKey() { return new Date().toISOString().slice(0, 10); }

  function hashString(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  function makePrng(seed) {
    var state = (seed >>> 0) || 2463534242;
    return function () {
      state = ((state * 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ── Deal ─────────────────────────────────────────────────────────────────────
  // Twenty-five cards face up, twenty-seven held back. Nothing is hidden except
  // the ORDER of the pile, so the board in front of the player is the whole of
  // what there is to reason about.
  function deal(opts) {
    opts = opts || {};
    var mode   = opts.mode === 'practice' ? 'practice' : 'daily';
    var dayKey = opts.dayKey || getTodayKey();
    var seed;

    if (mode === 'daily') {
      seed = hashString('thirteen-' + dayKey);
    } else if (typeof opts.seed === 'number') {
      seed = opts.seed >>> 0;                       // reproducible practice, for tests
    } else {
      seed = (Math.random() * 4294967296) >>> 0;
    }

    var deck = shuffle(buildDeck(), makePrng(seed));

    return {
      mode:        mode,
      dayKey:      dayKey,
      seed:        seed,
      cols:        COLS,
      rows:        ROWS,
      grid:        deck.slice(0, CELLS),   // index -> card or null; cards never move
      draw:        deck.slice(CELLS),      // index 0 is the next card out
      cleared:     0,
      matches:     0,
      misses:      0,
      streak:      0,
      best:        0,
      lastCleared: [],
      lastFilled:  [],
      status:      'playing',              // 'playing' | 'won' | 'lost'
    };
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  function cardAt(state, i) {
    return (i >= 0 && i < CELLS) ? state.grid[i] : null;
  }

  function isKing(card) { return !!card && card.r === TARGET; }

  // A king is already thirteen and clears on its own. Every other card needs a
  // partner it can see.
  function canClearSolo(state, i) { return isKing(cardAt(state, i)); }

  function isPair(state, a, b) {
    var ca = cardAt(state, a), cb = cardAt(state, b);
    if (!ca || !cb) return false;
    if (ca.r + cb.r !== TARGET) return false;
    return canSee(state, a, b);
  }

  function onBoard(state) {
    var n = 0;
    for (var i = 0; i < CELLS; i++) if (state.grid[i]) n++;
    return n;
  }

  function cardsLeft(state) { return state.draw.length + onBoard(state); }

  // Deliberately never reaches the renderer. The engine needs to know whether a
  // move exists so it can call the board dead; the player has to find that out by
  // looking. Nothing that consumes this ever writes it onto a cell.
  function findAnyMove(state) {
    for (var i = 0; i < CELLS; i++) {
      if (!state.grid[i]) continue;
      if (isKing(state.grid[i])) return { type: 'king', cells: [i] };
      var nb = sightNeighbors(state, i);
      for (var n = 0; n < nb.length; n++) {
        var j = nb[n];
        if (j > i && state.grid[i].r + state.grid[j].r === TARGET) {
          return { type: 'pair', cells: [i, j] };
        }
      }
    }
    return null;
  }

  function hasAnyMove(state) { return !!findAnyMove(state); }

  // The pile is not a move the player can spend — cards only leave it to refill a
  // cell a match just emptied. So a grid with no pair and no king can never be
  // changed by anything, whatever is still stacked beside it, and the brief's
  // "or no move would change by drawing" collapses into this one test.
  function isLocked(state) {
    return state.status === 'playing' && !hasAnyMove(state);
  }

  function checkEnd(state) {
    if (state.status !== 'playing') return state.status;
    if (state.cleared === 52) { state.status = 'won'; return 'won'; }
    if (!hasAnyMove(state))   { state.status = 'lost'; return 'lost'; }
    return 'playing';
  }

  // ── Moves ────────────────────────────────────────────────────────────────────
  // Both movers return true on success and leave state untouched on failure, so
  // the UI can call optimistically and re-render only when something changed.

  // Refill happens in place: the cell that emptied takes the next card off the
  // pile and the grid keeps its shape. No gravity, no collapse.
  function refill(state, cells) {
    var filled = [];
    for (var n = 0; n < cells.length; n++) {
      if (!state.draw.length) break;                // pile spent: the hole stays
      state.grid[cells[n]] = state.draw.shift();
      filled.push(cells[n]);
    }
    return filled;
  }

  function bumpStreak(state) {
    state.streak += 1;
    if (state.streak > state.best) state.best = state.streak;
  }

  function clearSolo(state, i) {
    if (state.status !== 'playing') return false;
    if (!canClearSolo(state, i)) return false;
    state.grid[i]   = null;
    state.cleared  += 1;
    state.matches  += 1;
    bumpStreak(state);
    state.lastCleared = [i];
    state.lastFilled  = refill(state, [i]);
    checkEnd(state);
    return true;
  }

  function clearPair(state, a, b) {
    if (state.status !== 'playing') return false;
    if (!isPair(state, a, b)) return false;
    state.grid[a]  = null;
    state.grid[b]  = null;
    state.cleared += 2;
    state.matches += 1;
    bumpStreak(state);
    var cells = a < b ? [a, b] : [b, a];            // lower cell takes the next card
    state.lastCleared = cells;
    state.lastFilled  = refill(state, cells);
    checkEnd(state);
    return true;
  }

  // A rejected attempt is the only thing that breaks a streak. Selecting, looking
  // and changing your mind cost nothing — see onCellTap for where the line sits.
  function registerMiss(state) {
    state.misses += 1;
    state.streak  = 0;
  }

  // ── Result ───────────────────────────────────────────────────────────────────
  // The result is the number and nothing else: "30 of 52 cleared". There is no
  // rating band and no title on top of it.
  //
  // An earlier build graded the run into named tiers. The number is the honest
  // unit here — it is what the daily board is actually comparable on, and a
  // label sitting above it only competes with it for attention and invites the
  // player to argue with the adjective instead of reading the score.
  //
  // For context when reading scores: over 1,500 simulated deals the spread was
  // p25 28, median 34, p75 38, p90 42, p97 46, and all 52 came up about once in
  // a thousand — so anything in the forties is a genuinely good board.
  function getResultText(state) {
    return state.cleared + ' of 52 cleared';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Page controller. Everything above is DOM-free so the engine can be played
  // out headlessly; everything below no-ops when the elements aren't present.
  // ══════════════════════════════════════════════════════════════════════════

  var DIRECTIONS_TEXT =
    'Thirteen deals twenty-five cards face up in a five by five grid, with the ' +
    'rest of the deck held back as a draw pile. Clear as much of the deck as you ' +
    'can by tapping two cards whose values add up to exactly thirteen. Aces are ' +
    'one, jacks eleven, queens twelve. So a queen takes an ace, a jack takes a ' +
    'two, a ten takes a three, and so on down to seven and six. Kings are already ' +
    'thirteen: tap one and it goes on its own. Two cards can only be matched if ' +
    'they can see each other — along a row, a column or a diagonal, with nothing ' +
    'in between. On a full board that means the eight cards touching it and no ' +
    'others. Every cell a match empties is refilled on the spot by the next card ' +
    'off the pile, so the grid keeps its shape. Once the pile runs out the holes ' +
    'stay open, and a hole lets a line through: cards that could never reach each ' +
    'other suddenly can, so the order you take the last cards in is what decides ' +
    'how far you get. Nothing on the board is ever marked as matchable — finding ' +
    'the pairs is the whole game. The game ends when there are no more moves to ' +
    'make. Clearing all fifty-two is rare. Not every deal can be won.';

  var SPLASH_TAGLINE =
    'Twenty-five cards, face up. Clear them two at a time — cards that add up to ' +
    'thirteen. Kings go alone.';

  var SHARE_URL = 'https://www.thebunnygame.com/thirteen';
  var LS_PREFIX = 'thirteen_result_';
  var MODE_KEY  = 'thirteen_mode';

  // Onboarding follows Molt, which follows Poise: set once, checked on boot,
  // never cleared.
  var TUTORIAL_KEY = 'thirteen_tutorial_seen';
  var GAMES_KEY    = 'thirteen_games_played';
  var LEGEND_GAMES = 3;      // the legend strip retires after this many deals

  var state    = null;
  var mode     = 'daily';
  var selected = null;       // cell the player has picked up, or null
  // One-shot animation state. render() rebuilds the grid wholesale, so effects
  // are re-triggered by tagging the cells that changed rather than by
  // transitioning elements that survive the rewrite.
  //
  // popCards holds the cards a match just took, keyed by the cell they were in.
  // The engine clears and refills a cell in the same call, so by the time the UI
  // hears about it those cells already hold their replacements — without keeping
  // the outgoing cards here there is nothing left to animate and they would
  // simply blink out. While it is set the board is inert.
  var popCards   = null;
  var popTimer   = null;
  var dealCells  = [];
  var shakeCells = [];
  var shakeTimer = null;
  var CLEAR_MS   = 300;      // keep in step with th-pop in thirteen.css
  var lockedShown = false;   // whether the locked bar was up on the last render
  var el = {};

  function q(id) { return document.getElementById(id); }

  // ── Storage ──────────────────────────────────────────────────────────────────
  // Only the daily deal is worth remembering — practice is explicitly unlimited
  // and a result from it means nothing tomorrow.
  function lsKey() { return LS_PREFIX + getTodayKey(); }

  function loadStored() {
    try { var r = localStorage.getItem(lsKey()); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }

  function saveResult() {
    if (state.mode !== 'daily') return;
    try {
      localStorage.setItem(lsKey(), JSON.stringify({
        day:     state.dayKey,
        status:  state.status,
        cleared: state.cleared,
        matches: state.matches,
        misses:  state.misses,
        best:    state.best,
      }));
    } catch (e) {}
  }

  function loadMode() {
    try { return localStorage.getItem(MODE_KEY) === 'practice' ? 'practice' : 'daily'; }
    catch (e) { return 'daily'; }
  }

  function saveMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch (e) {} }

  function tutorialSeen() {
    try { return !!localStorage.getItem(TUTORIAL_KEY); } catch (e) { return false; }
  }

  function markTutorialSeen() {
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (e) {}
  }

  function gamesPlayed() {
    try {
      var n = parseInt(localStorage.getItem(GAMES_KEY), 10);
      return (isFinite(n) && n >= 0) ? n : 0;
    } catch (e) { return 0; }
  }

  function bumpGamesPlayed() {
    var n = gamesPlayed() + 1;
    try { localStorage.setItem(GAMES_KEY, String(n)); } catch (e) {}
    return n;
  }

  function cleanupStale() {
    var today = lsKey(), doomed = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0 && k !== today) doomed.push(k);
      }
      doomed.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
    return doomed.length;
  }

  // ── Share ────────────────────────────────────────────────────────────────────
  // Daily only. A practice run is not a shared challenge and a score from one
  // would mean nothing to whoever received it.
  // The shared line leads with the same number the result screen does, so what
  // gets pasted into a chat is what the player just read.
  function getShareText(s) {
    if (s.mode !== 'daily') return '';
    return 'Thirteen ' + s.dayKey + ' — ' + getResultText(s) + '. ' +
           s.matches + ' matches, ' + s.misses + ' misses, best run ' +
           s.best + '. ' + SHARE_URL;
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  function cardFaceHTML(c, extraClass) {
    return '<div class="th-card th-face' + (isRed(c) ? ' th-red' : '') +
           (extraClass ? ' ' + extraClass : '') + '">' +
           '<span class="th-rank">' + RANK_LABEL[c.r] + '</span>' +
           '<span class="th-suit">' + SUIT_GLYPH[c.s] + '</span>' +
           '</div>';
  }

  // The one hard rule of this renderer: a cell's classes may say what the player
  // has selected and what just happened, and nothing else. There is no
  // "matchable", no "playable", no partner glow, and no sight-line overlay.
  // Reading the board is the game, and the stance Molt takes on its nests
  // applies here.
  function renderGrid() {
    if (!el.grid) return;
    var html = '';
    for (var i = 0; i < CELLS; i++) {
      // A cell mid-clear shows the card that is leaving, not the one the pile
      // has already put there. The replacement gets its own entrance once the
      // clear has finished playing.
      var popping = !!(popCards && popCards.hasOwnProperty(i));
      var c   = popping ? popCards[i] : state.grid[i];
      var cls = 'th-cell';
      if (!c)                            cls += ' th-cell-empty';
      if (selected === i)                cls += ' th-cell-sel';
      if (popping)                       cls += ' th-pop';
      else if (dealCells.indexOf(i) !== -1) cls += ' th-deal';
      if (shakeCells.indexOf(i) !== -1)  cls += ' th-shake';

      var where = 'row ' + (((i / COLS) | 0) + 1) + ' column ' + ((i % COLS) + 1);
      var label = c ? RANK_LABEL[c.r] + ' of ' + SUIT_NAME[c.s] + ', ' + where
                    : 'empty cell, ' + where;

      html += '<div class="' + cls + '" data-cell="' + i + '" ' +
              'role="button" tabindex="' + (c ? '0' : '-1') + '" ' +
              'aria-pressed="' + (selected === i ? 'true' : 'false') + '" ' +
              'aria-label="' + label + '">' +
              (c ? cardFaceHTML(c) : '<div class="th-card th-empty"></div>') +
              '</div>';
    }
    el.grid.innerHTML = html;
  }

  function renderHud() {
    if (!el.cleared) return;
    el.cleared.textContent   = state.cleared + '/52';
    el.matches.textContent   = state.matches;
    el.streak.textContent    = state.streak;
    el.drawCount.textContent = state.draw.length;
    el.draw.classList.toggle('th-draw-done', !state.draw.length);
    el.draw.setAttribute('aria-label', state.draw.length
      ? 'Draw pile, ' + state.draw.length + ' cards left to refill with'
      : 'Draw pile empty — cleared cells now stay empty');
  }

  // States the fact and offers the way out of the deal. It does not offer a
  // reshuffle and never rescues the board: a dead grid is a real result here,
  // and the brief is explicit that the player is not to be bailed out.
  function renderLocked() {
    if (!el.locked) return;
    // Held back while the last match is still playing. The bar takes height off
    // the board and so triggers a re-fit; letting that land mid-animation would
    // resize the cards out from under the clear the player is watching.
    var over = state.status !== 'playing' && !popCards;
    el.locked.classList.toggle('th-hide', !over);
    el.giveUp.classList.toggle('th-hide', over);
    if (!over) return;

    el.lockedMsg.textContent = state.status === 'won'
      ? 'All fifty-two cleared. That is the whole deck.'
      : (state.draw.length
          ? 'There are no more moves to make, with ' + state.draw.length +
            ' still in the pile.'
          : 'There are no more moves to make.');
  }

  function render() {
    renderGrid();
    renderHud();
    renderLocked();
    // The locked bar appears mid-deal and takes a strip of the board's height
    // with it. Without a re-fit here the grid keeps the card size it was given
    // for the taller viewport and spills over the pile — re-measure whenever the
    // bar comes or goes, and only then, so this stays off the per-tap path.
    var lockedNow = !!(el.locked && !el.locked.classList.contains('th-hide'));
    if (lockedNow !== lockedShown) { lockedShown = lockedNow; fitBoard(); }
    dealCells = [];
  }

  // ── Interaction ──────────────────────────────────────────────────────────────

  // Play the clear, then hand the cells over to whatever the pile put in them.
  // The board is inert for the duration so a fast tapper cannot act on cards
  // that are on their way out.
  function startClear(outgoing) {
    popCards = outgoing;
    selected = null;
    render();
    if (popTimer) clearTimeout(popTimer);
    popTimer = setTimeout(function () {
      popTimer  = null;
      popCards  = null;
      dealCells = state.lastFilled.slice();
      render();
      if (state.status !== 'playing') {
        saveResult();
        setTimeout(showEnd, 300);      // let the refill land before the overlay
      }
    }, CLEAR_MS);
  }

  function rejectCells(cells) {
    registerMiss(state);
    shakeCells = cells;
    render();
    if (shakeTimer) clearTimeout(shakeTimer);
    shakeTimer = setTimeout(function () {
      shakeCells = [];
      selected   = null;
      render();
    }, 360);
  }

  // Where the line between "an attempt" and "a change of mind" sits.
  //
  // A second tap counts as an ATTEMPT — and so can cost a streak — when the
  // player has plainly claimed those two cards make thirteen: either the cards
  // can see each other, or they add to thirteen. Anything else (a card across
  // the board that does not add up either) is someone browsing, and picking it
  // up instead is what they meant. Both rejected cases shake identically, so
  // nothing in the response tells them WHICH half of the rule they got wrong.
  function onCellTap(i) {
    if (state.status !== 'playing') return;
    if (popCards) return;                       // mid-clear, swallow the tap
    if (shakeCells.length) return;              // mid-reject, swallow the tap
    var card = cardAt(state, i);
    if (!card) { selected = null; render(); return; }

    // A king answers to nobody, so a tap on one can only mean one thing. It is
    // also always safe to take: kings pair with nothing, so clearing one can
    // never cost the board a move it needed.
    if (isKing(card)) {
      var solo = {};
      solo[i] = card;
      if (clearSolo(state, i)) startClear(solo);
      return;
    }

    if (selected === null) { selected = i; render(); return; }
    if (selected === i)    { selected = null; render(); return; }

    var other = cardAt(state, selected);
    var pair  = {};
    pair[selected] = other;
    pair[i]        = card;
    if (clearPair(state, selected, i)) { startClear(pair); return; }

    var claimed = canSee(state, selected, i) ||
                  (!!other && other.r + card.r === TARGET);
    if (claimed) { rejectCells([selected, i]); return; }

    selected = i;
    render();
  }

  // A locked board ends itself. This is for the player who cannot find the move
  // that is still there — with no hints anywhere, that has to have an exit.
  function onGiveUp() {
    if (state.status !== 'playing') { showEnd(); return; }
    state.status = 'lost';
    saveResult();
    render();
    showEnd();
  }

  // ── Tutorial ─────────────────────────────────────────────────────────────────
  // Three screens, because the rule set is one line long and padding it out
  // would only teach a player that these screens are worth skipping. Every
  // example is built from the same .th-card markup the board renders, so the
  // artwork cannot drift out of step with the game.

  function C(s, r) { return { s: s, r: r, id: s + r }; }

  function demoCell(card, cls) {
    return '<div class="th-cell th-demo-cell' + (cls ? ' ' + cls : '') + '">' +
           (card ? cardFaceHTML(card) : '<div class="th-card th-empty"></div>') +
           '</div>';
  }

  // A slab of board laid out on the real grid, so a diagonal reads as a diagonal
  // rather than as a diagram of one.
  function demoGrid(cards, marks) {
    var html = '';
    for (var i = 0; i < cards.length; i++) {
      html += demoCell(cards[i], marks && marks[i] ? marks[i] : '');
    }
    return '<div class="th-demo-grid">' + html + '</div>';
  }

  function demoNote(t) { return '<span class="th-tut-note">' + t + '</span>'; }

  var TUTORIAL = [
    {
      title: 'Add up to thirteen',
      copy:  'Tap two cards that add up to exactly thirteen — across, down, or ' +
             'corner to corner. Aces are one, jacks eleven, queens twelve. Here ' +
             'the nine and the four sit corner to corner, so they go.',
      build: function () {
        return demoGrid(
          [C('S', 9),  C('H', 2),  C('C', 7),
           C('D', 5),  C('S', 4),  C('H', 12),
           C('C', 3),  C('D', 10), C('S', 6)],
          ['th-cell-sel', '', '', '', 'th-cell-sel', '', '', '', '']
        ) + '<div class="th-tut-labels">' + demoNote('9 + 4 = 13, diagonally') + '</div>';
      },
    },
    {
      title: 'Kings go alone',
      copy:  'A king is already thirteen, so it needs no partner. One tap and it ' +
             'clears on its own — and taking one is never a mistake, because a ' +
             'king can never be anybody else\'s match.',
      build: function () {
        return '<div class="th-tut-row">' +
          demoCell(C('S', 13), 'th-cell-sel') +
          '<span class="th-tut-arrow" aria-hidden="true">&rarr;</span>' +
          demoCell(null) +
          '</div><div class="th-tut-labels th-tut-row">' +
            demoNote('tap the king') + demoNote('') + demoNote('gone on its own') +
          '</div>';
      },
    },
    {
      title: 'Holes open lines',
      copy:  'Every cell a match empties is refilled from the pile, so the grid ' +
             'keeps its shape. When the pile runs out the holes stay — and cards ' +
             'see each other straight through a hole. These two could not reach ' +
             'each other a moment ago. Nothing is ever marked as matchable, and ' +
             'the game ends when there are no more moves to make.',
      // One row before and one row after. A full 3x3 slab was tried and it made
      // the screen twice as tall as the other two for no extra clarity — the
      // whole idea is one card, then no card, in the same gap.
      build: function () {
        return demoGrid([C('C', 5), C('H', 6), C('D', 8)]) +
          '<div class="th-tut-labels">' + demoNote('the six is in the way') + '</div>' +
          '<div class="th-tut-sep" aria-hidden="true">&darr;</div>' +
          demoGrid(
            [C('C', 5), null, C('D', 8)],
            ['th-cell-sel', 'th-demo-hole', 'th-cell-sel']
          ) +
          '<div class="th-tut-labels">' + demoNote('5 + 8 = 13, straight through') + '</div>';
      },
    },
  ];

  var tutStep     = 0;
  var tutFromHelp = false;

  function renderTutorial() {
    var s = TUTORIAL[tutStep];
    el.tutTitle.textContent = s.title;
    el.tutCopy.textContent  = s.copy;
    el.tutVisual.innerHTML  = s.build();

    el.tutDots.innerHTML = TUTORIAL.map(function (_, i) {
      return '<span class="th-tut-dot' + (i === tutStep ? ' th-tut-dot-on' : '') + '"></span>';
    }).join('');
    el.tutDots.setAttribute('aria-label', 'Step ' + (tutStep + 1) + ' of ' + TUTORIAL.length);

    el.tutBack.disabled = tutStep === 0;
    var last = tutStep === TUTORIAL.length - 1;
    // Opened from the header the tutorial is a reference, so it closes; on a
    // first run it is the way in to the game, so the last button deals.
    el.tutNext.textContent = last ? (tutFromHelp ? 'Got it' : 'Play') : 'Next';
  }

  function gotoStep(n) {
    if (n < 0 || n >= TUTORIAL.length) return;
    tutStep = n;
    renderTutorial();
  }

  function showTutorial(fromHelp) {
    tutFromHelp = !!fromHelp;
    tutStep = 0;
    renderTutorial();
    el.tutorial.classList.remove('th-hide');
  }

  // Closing always records the tutorial as seen, read through or skipped — a
  // player who skipped has made their choice and should not be shown it again
  // unprompted.
  function closeTutorial(startGame) {
    el.tutorial.classList.add('th-hide');
    markTutorialSeen();
    if (startGame) begin();
  }

  function onTutNext() {
    if (tutStep < TUTORIAL.length - 1) { gotoStep(tutStep + 1); return; }
    closeTutorial(!tutFromHelp);
  }

  // ── Screens ──────────────────────────────────────────────────────────────────

  function show(screen) {
    ['splash', 'game'].forEach(function (name) {
      if (el[name]) el[name].classList.toggle('th-hide', name !== screen);
    });
  }

  function setMode(m) {
    mode = m === 'practice' ? 'practice' : 'daily';
    saveMode(mode);
    el.modeBtns.forEach(function (b) {
      var on = b.getAttribute('data-mode') === mode;
      b.classList.toggle('th-mode-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (el.modeNote) {
      el.modeNote.textContent = mode === 'daily'
        ? 'One deal a day, the same for everyone. Playing again gives you the same board.'
        : 'A fresh shuffle every time, as many as you like. Nothing to share.';
    }
    renderSplashNote();
  }

  function renderSplashNote() {
    if (!el.splashNote) return;
    var prior = mode === 'daily' ? loadStored() : null;
    if (!prior) { el.splashNote.classList.add('th-hide'); return; }
    el.splashNote.textContent = 'You played today\'s deal — ' +
      prior.cleared + ' of 52 cleared.';
    el.splashNote.classList.remove('th-hide');
  }

  function showEnd() {
    var daily = state.mode === 'daily';

    // The score IS the headline. The kicker above it only says how the deal
    // finished, which the number alone cannot: ran out of moves, or went all
    // the way. Clearing the whole deck is the one result that gets any emphasis,
    // and it earns it at roughly one deal in a thousand.
    el.endKicker.textContent = state.status === 'won'
      ? 'The whole deck'
      : 'No more moves';
    el.endScore.textContent = getResultText(state);
    el.endScore.style.color = state.status === 'won' ? '#5FD3A0' : '';
    el.endStats.innerHTML =
      '<li><span>Matches</span><strong>' + state.matches + '</strong></li>' +
      '<li><span>Misses</span><strong>' + state.misses + '</strong></li>' +
      '<li><span>Best run</span><strong>' + state.best + '</strong></li>';

    // Practice has nothing to share — it is not a shared challenge — so the
    // button is absent rather than present and inert.
    el.shareBtn.classList.toggle('th-hide', !daily);
    el.retryBtn.textContent = daily ? 'Play again — same board' : 'New shuffle';
    el.endNote.textContent  = daily
      ? 'A new deal tomorrow.'
      : 'Practice runs are not scored or shared.';
    el.end.classList.remove('th-hide');
  }

  function hideEnd() { el.end.classList.add('th-hide'); }

  function onShare() {
    if (state.mode !== 'daily') return;
    if (typeof shareText === 'function') shareText(getShareText(state), 'Thirteen');
  }

  function onRetry() { hideEnd(); begin(); }

  // ── Board sizing ─────────────────────────────────────────────────────────────
  // Twenty-five cells across five columns is the tightest board on the site, and
  // a diagonal tap has to land on the right one of eight neighbours. Cards are
  // sized from the room the board actually has and floored at 44px — the
  // smallest reliable touch target — rather than being allowed to shrink to fit.
  // At 320px wide the width math gives 56px, so the floor only bites on very
  // short screens, where the board scrolls instead of shrinking.
  var MIN_CW = 44;

  function fitBoard(retry) {
    if (!el.grid || !el.board) return;
    var rect = el.board.getBoundingClientRect();
    // The board can measure zero if it is asked before the browser has laid the
    // newly-shown game screen out. Rather than leave the grid on its fallback
    // width, come back on the next frame and measure again — once.
    if (!rect.width || !rect.height) {
      if (!retry && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () { fitBoard(true); });
      }
      return;
    }

    var gap = (global.innerWidth || 0) >= 720 ? 8 : 6;
    var byW = (rect.width  - gap * (COLS - 1)) / COLS;
    // A cell is a card, height = w / 0.74. Keep the divisor in step with the
    // aspect-ratio in thirteen.css or the bottom row clips.
    var byH = (rect.height - gap * (ROWS - 1)) / ROWS * 0.74;
    var cap = (global.innerWidth || 0) >= 720 ? 94 : 78;
    var w   = Math.max(MIN_CW, Math.min(byW, byH, cap));
    el.grid.style.setProperty('--th-cw', w.toFixed(1) + 'px');
    el.grid.style.setProperty('--th-gap', gap + 'px');
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────

  function begin() {
    hideEnd();
    selected    = null;
    popCards    = null;
    dealCells   = [];
    shakeCells  = [];
    lockedShown = false;
    if (shakeTimer) { clearTimeout(shakeTimer); shakeTimer = null; }
    if (popTimer)   { clearTimeout(popTimer);   popTimer   = null; }

    // Daily replays the same board by construction: the seed is the date, so
    // re-dealing it is re-dealing it. Practice asks for fresh entropy.
    state = deal({ mode: mode });

    var played = bumpGamesPlayed();
    if (el.legend)  el.legend.classList.toggle('th-hide', played > LEGEND_GAMES);
    if (el.modeTag) el.modeTag.textContent = mode === 'daily' ? state.dayKey : 'Practice';

    show('game');
    render();
    fitBoard();
    render();
  }

  function init() {
    el = {
      splash:     q('th-splash'),
      splashNote: q('th-splash-note'),
      game:       q('th-game'),
      board:      q('th-board'),
      grid:       q('th-grid'),
      cleared:    q('th-cleared'),
      matches:    q('th-matches'),
      streak:     q('th-streak'),
      draw:       q('th-draw'),
      drawCount:  q('th-draw-count'),
      modeTag:    q('th-mode-tag'),
      modeNote:   q('th-mode-note'),
      modeBtns:   [].slice.call(document.querySelectorAll('[data-mode]')),
      locked:     q('th-locked'),
      lockedMsg:  q('th-locked-msg'),
      giveUp:     q('th-giveup-btn'),
      legend:     q('th-legend'),
      end:        q('th-end'),
      endKicker:  q('th-end-kicker'),
      endScore:   q('th-end-score'),
      endStats:   q('th-end-stats'),
      endNote:    q('th-end-note'),
      shareBtn:   q('th-share-btn'),
      retryBtn:   q('th-retry-btn'),
      tutorial:   q('th-tutorial'),
      tutTitle:   q('th-tut-title'),
      tutCopy:    q('th-tut-copy'),
      tutVisual:  q('th-tut-visual'),
      tutDots:    q('th-tut-dots'),
      tutBack:    q('th-tut-back'),
      tutNext:    q('th-tut-next'),
    };
    if (!el.grid || !el.splash) return;              // not the game page

    el.grid.addEventListener('click', function (e) {
      var c = e.target.closest('.th-cell');
      if (c) onCellTap(+c.getAttribute('data-cell'));
    });
    el.grid.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var c = e.target.closest('.th-cell');
      if (c) { e.preventDefault(); onCellTap(+c.getAttribute('data-cell')); }
    });

    el.modeBtns.forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
    });

    q('th-play-btn').addEventListener('click', begin);
    q('th-result-btn').addEventListener('click', showEnd);
    el.giveUp.addEventListener('click', onGiveUp);
    el.shareBtn.addEventListener('click', onShare);
    el.retryBtn.addEventListener('click', onRetry);
    q('th-end-close').addEventListener('click', hideEnd);

    global.addEventListener('resize', function () { if (state) fitBoard(); });

    // ── Tutorial wiring ──
    el.tutBack.addEventListener('click', function () { gotoStep(tutStep - 1); });
    el.tutNext.addEventListener('click', onTutNext);
    q('th-tut-skip').addEventListener('click', function () { closeTutorial(false); });

    var fullRules = q('th-tut-rules');
    if (fullRules && typeof openDirections === 'function') {
      fullRules.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });
    }

    var swipeX = null;
    el.tutorial.addEventListener('touchstart', function (e) {
      swipeX = e.changedTouches[0].clientX;
    }, { passive: true });
    el.tutorial.addEventListener('touchend', function (e) {
      if (swipeX === null) return;
      var dx = e.changedTouches[0].clientX - swipeX;
      swipeX = null;
      if (Math.abs(dx) < 45) return;                 // a tap, not a swipe
      if (dx < 0 && tutStep < TUTORIAL.length - 1) gotoStep(tutStep + 1);
      else if (dx > 0) gotoStep(tutStep - 1);
    }, { passive: true });
    document.addEventListener('keydown', function (e) {
      if (el.tutorial.classList.contains('th-hide')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); onTutNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); gotoStep(tutStep - 1); }
      else if (e.key === 'Escape') { e.preventDefault(); closeTutorial(false); }
    });

    var splashDir = q('th-splash-dir');
    if (splashDir) splashDir.textContent = SPLASH_TAGLINE;
    var help = q('help-btn');
    if (help) help.addEventListener('click', function () { showTutorial(true); });

    cleanupStale();
    setMode(loadMode());
    show('splash');

    if (!tutorialSeen()) showTutorial(false);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  global.Thirteen = {
    SUITS: SUITS, RANK_LABEL: RANK_LABEL, SUIT_GLYPH: SUIT_GLYPH,
    COLS: COLS, ROWS: ROWS, CELLS: CELLS, TARGET: TARGET, NEIGHBORS: NEIGHBORS,
    buildDeck: buildDeck, cardLabel: cardLabel, isRed: isRed,
    hashString: hashString, makePrng: makePrng, shuffle: shuffle,
    getTodayKey: getTodayKey, deal: deal,
    cardAt: cardAt, isKing: isKing, canSee: canSee, sightNeighbors: sightNeighbors,
    canClearSolo: canClearSolo, isPair: isPair,
    cardsLeft: cardsLeft, onBoard: onBoard,
    findAnyMove: findAnyMove, hasAnyMove: hasAnyMove, isLocked: isLocked, checkEnd: checkEnd,
    clearSolo: clearSolo, clearPair: clearPair, registerMiss: registerMiss,
    getResultText: getResultText, getShareText: getShareText,
    // page controller, exposed for verification
    begin: begin, render: render, getState: function () { return state; },
    onCellTap: onCellTap, onGiveUp: onGiveUp,
    setMode: setMode, getMode: function () { return mode; },
    // onboarding
    TUTORIAL_KEY: TUTORIAL_KEY, GAMES_KEY: GAMES_KEY, LEGEND_GAMES: LEGEND_GAMES,
    TUTORIAL: TUTORIAL, tutorialSeen: tutorialSeen, gamesPlayed: gamesPlayed,
    showTutorial: showTutorial, closeTutorial: closeTutorial, gotoStep: gotoStep,
    getTutStep: function () { return tutStep; },
  };

}(typeof window !== 'undefined' ? window : globalThis));
