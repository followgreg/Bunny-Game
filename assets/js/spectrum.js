(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────────

  var ROWS = 5, COLS = 5;
  var N_ANCHORS = 10;
  var SAT = 70;       // fixed HSL saturation (%)
  var DIST_MIN = 8;   // minimum Euclidean RGB distance between any two tiles
  var GAP = 4;        // px gap between tiles in the grid

  var DIRECTIONS_TEXT = 'Spectrum gives you a 5×5 grid of colored tiles, all slightly out of place. Five tiles are already locked in their correct positions — use them as reference points. Click any free tile to select it, then click another to swap their positions. Keep rearranging until the colors flow smoothly across the whole grid. When every tile is exactly where it belongs, you\'ll know.';

  // ── Utilities ─────────────────────────────────────────────────────────────────

  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ── Color conversion ──────────────────────────────────────────────────────────

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

  function rgbDist(a, b) {
    var dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // ── Field generation ─────────────────────────────────────────────────────────
  //
  //   hue(x, y)   = (a1·x + b1·y + c1) mod 360
  //   value(x, y) = clamp(a2·x + b2·y + c2, 10, 90)
  //
  // x = column (0–4), y = row (0–4).
  // Coefficient constraints ensure a non-trivial diagonal gradient.

  function tryCoefficients() {
    var a1 = rand(-40, 40), b1 = rand(-40, 40), c1 = rand(0, 360);
    var a2 = rand(-7, 7),   b2 = rand(-7, 7),   c2 = rand(25, 75);

    if (Math.abs(a1) < 4 && Math.abs(b1) < 4) return null;
    if (Math.abs(a2) < 0.8 && Math.abs(b2) < 0.8) return null;

    var rhMin = Infinity, rhMax = -Infinity;
    var vMin  = Infinity, vMax  = -Infinity;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var rh = a1 * c + b1 * r;
        var v  = Math.min(90, Math.max(10, a2 * c + b2 * r + c2));
        if (rh < rhMin) rhMin = rh;
        if (rh > rhMax) rhMax = rh;
        if (v  < vMin)  vMin  = v;
        if (v  > vMax)  vMax  = v;
      }
    }

    if (rhMax - rhMin < 120) return null;
    if (vMax  - vMin  <  30) return null;

    return { a1: a1, b1: b1, c1: c1, a2: a2, b2: b2, c2: c2,
             hueSpan: rhMax - rhMin, valSpan: vMax - vMin };
  }

  function computeTiles(co) {
    var tiles = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var hue = ((co.a1 * c + co.b1 * r + co.c1) % 360 + 360) % 360;
        var val = Math.min(90, Math.max(10, co.a2 * c + co.b2 * r + co.c2));
        var rgb = hslToRgb(hue, SAT, val);
        tiles.push({
          id:       r * COLS + c,
          correctR: r,
          correctC: c,
          hue:      hue,
          val:      val,
          hex:      toHex(rgb),
          rgb:      rgb,
          isAnchor: false,
        });
      }
    }
    return tiles;
  }

  function minPairDist(tiles) {
    var min = Infinity;
    for (var i = 0; i < tiles.length - 1; i++) {
      for (var j = i + 1; j < tiles.length; j++) {
        var d = rgbDist(tiles[i].rgb, tiles[j].rgb);
        if (d < min) { min = d; if (min < DIST_MIN) return min; }
      }
    }
    return min;
  }

  // ── Anchor selection ──────────────────────────────────────────────────────────
  // Fixed anchors: four corners + center — same every game.

  var ANCHOR_IDS = new Set([
    0 * COLS + 0,   // (0,0) top-left
    0 * COLS + 4,   // (0,4) top-right
    2 * COLS + 2,   // (2,2) center
    4 * COLS + 0,   // (4,0) bottom-left
    4 * COLS + 4,   // (4,4) bottom-right
  ]);

  function selectAnchors(tiles) {
    tiles.forEach(function (t) { t.isAnchor = ANCHOR_IDS.has(t.id); });
  }

  // ── Board layout ──────────────────────────────────────────────────────────────

  function buildBoard(tiles) {
    var board = [];
    for (var r = 0; r < ROWS; r++) {
      board[r] = [];
      for (var c = 0; c < COLS; c++) board[r][c] = r * COLS + c;
    }

    var freePos = [], freeIds = [];
    for (var r2 = 0; r2 < ROWS; r2++) {
      for (var c2 = 0; c2 < COLS; c2++) {
        var id = r2 * COLS + c2;
        if (!tiles[id].isAnchor) { freePos.push([r2, c2]); freeIds.push(id); }
      }
    }

    for (var attempt = 0; attempt < 100; attempt++) {
      shuffle(freeIds);
      var displaced = freeIds.some(function (tid, i) {
        return tid !== freePos[i][0] * COLS + freePos[i][1];
      });
      if (displaced) break;
    }

    freeIds.forEach(function (tid, i) { board[freePos[i][0]][freePos[i][1]] = tid; });
    return { board: board, freePos: freePos, freeIds: freeIds.slice() };
  }

  // ── generateField ─────────────────────────────────────────────────────────────

  function generateField() {
    for (var attempt = 0; attempt < 100; attempt++) {
      var co = tryCoefficients();
      if (!co) continue;
      var tiles = computeTiles(co);
      if (minPairDist(tiles) < DIST_MIN) continue;
      selectAnchors(tiles);
      var bd = buildBoard(tiles);
      return { tiles: tiles, board: bd.board, freePos: bd.freePos, freeIds: bd.freeIds, coeffs: co };
    }
    throw new Error('Spectrum: failed to generate a valid field in 100 attempts');
  }

  // ── Tile size calculation ─────────────────────────────────────────────────────

  function calcTileSize() {
    var availW = window.innerWidth - 24;          // 12px each side
    var availH = window.innerHeight - 48 - 24;   // header + bottom pad
    var maxFromW = Math.floor((availW - GAP * 4) / 5);
    var maxFromH = Math.floor((availH - GAP * 4) / 5);
    return Math.min(maxFromW, maxFromH, 120);     // cap at 120px on large screens
  }

  // ── Grid rendering ────────────────────────────────────────────────────────────

  var field = null;
  var selectedCell = null; // { r, c } of currently-selected free tile, or null

  function renderGrid(f) {
    var tileSize = calcTileSize();

    gridEl.style.gridTemplateColumns = 'repeat(5, ' + tileSize + 'px)';
    gridEl.style.gridTemplateRows    = 'repeat(5, ' + tileSize + 'px)';
    gridEl.innerHTML = '';
    selectedCell = null;

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var tileId = f.board[r][c];
        var tile   = f.tiles[tileId];
        var el     = document.createElement('div');
        el.className = 'sp-tile ' + (tile.isAnchor ? 'sp-tile--anchor' : 'sp-tile--free');
        el.style.backgroundColor = tile.hex;
        el.dataset.r      = r;
        el.dataset.c      = c;
        el.dataset.tileId = tileId;
        gridEl.appendChild(el);
      }
    }
  }

  // ── Swap interaction ──────────────────────────────────────────────────────────

  function tileElAt(r, c) {
    return gridEl.querySelector('[data-r="' + r + '"][data-c="' + c + '"]');
  }

  function updateTileEl(el, tileId) {
    var tile = field.tiles[tileId];
    el.style.backgroundColor = tile.hex;
    el.dataset.tileId = tileId;
    el.className = 'sp-tile ' + (tile.isAnchor ? 'sp-tile--anchor' : 'sp-tile--free');
  }

  function checkWin() {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (field.board[r][c] !== r * COLS + c) return false;
      }
    }
    return true;
  }

  function handleTileClick(r, c) {
    var tileId = field.board[r][c];
    var tile   = field.tiles[tileId];

    if (tile.isAnchor) return; // anchors are locked

    if (selectedCell === null) {
      // First tap — select this tile
      selectedCell = { r: r, c: c };
      tileElAt(r, c).classList.add('sp-tile--selected');
    } else if (selectedCell.r === r && selectedCell.c === c) {
      // Tap same tile again — deselect
      tileElAt(r, c).classList.remove('sp-tile--selected');
      selectedCell = null;
    } else {
      // Second tap on a different free tile — swap
      var r1 = selectedCell.r, c1 = selectedCell.c;
      var r2 = r,              c2 = c;

      // Deselect first tile
      var el1 = tileElAt(r1, c1);
      el1.classList.remove('sp-tile--selected');

      // Swap board state
      var tmp = field.board[r1][c1];
      field.board[r1][c1] = field.board[r2][c2];
      field.board[r2][c2] = tmp;

      // Update just the two tile elements
      updateTileEl(el1, field.board[r1][c1]);
      updateTileEl(tileElAt(r2, c2), field.board[r2][c2]);

      selectedCell = null;

      // Check win
      if (checkWin()) {
        winEl.classList.remove('sp-hide');
      }
    }
  }

  // ── Hint helpers ─────────────────────────────────────────────────────────────

  function countCorrect() {
    var n = 0;
    for (var r = 0; r < ROWS; r++)
      for (var c = 0; c < COLS; c++)
        if (field.board[r][c] === r * COLS + c) n++;
    return n;
  }

  function clearSuperhint() {
    if (superhintTimer) { clearTimeout(superhintTimer); superhintTimer = null; }
    document.querySelectorAll('.sp-tile--correct').forEach(function (el) {
      el.classList.remove('sp-tile--correct');
    });
  }

  // ── DOM bootstrap ─────────────────────────────────────────────────────────────

  var splashEl, startBtn, gridWrap, gridEl, winEl, shareBtn, replayBtn,
      hintBar, hintBtn, superhintBtn, hintMsg;
  var superhintTimer = null;

  document.addEventListener('DOMContentLoaded', function () {
    splashEl     = document.getElementById('sp-splash');
    startBtn     = document.getElementById('sp-start-btn');
    gridWrap     = document.getElementById('sp-grid-wrap');
    gridEl       = document.getElementById('sp-grid');
    winEl        = document.getElementById('sp-win');
    shareBtn     = document.getElementById('sp-share-btn');
    replayBtn    = document.getElementById('sp-replay-btn');
    hintBar      = document.getElementById('sp-hint-bar');
    hintBtn      = document.getElementById('sp-hint-btn');
    superhintBtn = document.getElementById('sp-superhint-btn');
    hintMsg      = document.getElementById('sp-hint-msg');

    // Populate directions text on both splash and ? overlay
    var dirSplash = document.getElementById('sp-directions');
    if (dirSplash) dirSplash.textContent = DIRECTIONS_TEXT;

    var helpBtn = document.getElementById('help-btn');
    if (helpBtn) helpBtn.addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });

    // Start button → generate + render
    startBtn.addEventListener('click', function () {
      field = generateField();
      renderGrid(field);
      splashEl.classList.add('sp-hide');
      gridWrap.classList.remove('sp-hide');
      hintBar.classList.remove('sp-hide');
      hintMsg.textContent = '';
    });

    // Tile tap — event delegation on the grid
    gridEl.addEventListener('click', function (e) {
      var el = e.target;
      if (!el.classList.contains('sp-tile')) return;
      handleTileClick(parseInt(el.dataset.r, 10), parseInt(el.dataset.c, 10));
    });

    if (shareBtn) shareBtn.addEventListener('click', function () {
      shareText('Spectrum — solved it. Can you? https://www.thebunnygame.com/spectrum', 'Spectrum — Bunny Game');
    });

    // New Puzzle (win screen)
    if (replayBtn) replayBtn.addEventListener('click', function () {
      winEl.classList.add('sp-hide');
      field = generateField();
      renderGrid(field);
      hintMsg.textContent = '';
    });

    // Hint — count correct tiles
    hintBtn.addEventListener('click', function () {
      clearSuperhint();
      var correct = countCorrect();
      hintMsg.textContent = correct + ' / 25 correct';
    });

    // Super Hint — highlight correct tiles for 2s
    superhintBtn.addEventListener('click', function () {
      clearSuperhint();
      hintMsg.textContent = '';
      var correct = 0;
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          if (field.board[r][c] === r * COLS + c) {
            correct++;
            tileElAt(r, c).classList.add('sp-tile--correct');
          }
        }
      }
      superhintTimer = setTimeout(clearSuperhint, 2000);
    });
  });

  // ── Exports ───────────────────────────────────────────────────────────────────

  window.Spectrum = { generateField: generateField };

}());
