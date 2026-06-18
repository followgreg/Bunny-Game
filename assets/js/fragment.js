// fragment.js — Fragment 3D polycube puzzle
// Part 4: layer selector + piece tray

var FRAGMENT_DIRECTIONS = 'Fragment is a 3D assembly puzzle. Your goal is to fill the cube completely using all eight pieces. Each piece is a unique three-dimensional shape that spans multiple layers of the cube. Select a piece from the tray, choose which layer to place it on using the dots on the left, then tap a cell on the cube to place it. Pieces anchor at the cell you tap and extend through the cube according to their shape. If a piece does not fit where you tapped, try a different cell or a different layer. Use undo to take back your last placement. Use reset to start the puzzle over. There is no time limit. Your score is how many moves it took to fill the cube. Every puzzle is different. The satisfaction is in the solve.';

document.getElementById('help-btn').addEventListener('click', function () {
  openDirections(FRAGMENT_DIRECTIONS);
});

document.getElementById('new-btn').addEventListener('click', function () {
  loadNewPuzzle();
});

// ── State ──────────────────────────────────────────────────────────────────
var puzzles       = [];
var currentPuzzle = null;
var activeLayer   = 0;    // 0 = bottom (L1), 3 = top (L4)
var selectedPiece = null; // piece.id string or null
var placedPieces  = {};   // piece.id → true

// ── Size helpers ───────────────────────────────────────────────────────────
function getCellSize()       { return window.innerWidth < 600 ? 22 : 32; }
function getTrayCanvasSize() { return window.innerWidth < 600 ? 60 : 80; }

// ── Isometric projection ───────────────────────────────────────────────────
// col axis: right+down (S, S/2); row axis: left+down (-S, S/2); layer axis: up (0, -S)

function isoX(l, r, c, S) { return (c - r) * S; }
function isoY(l, r, c, S) { return (c + r) * (S / 2) - l * S; }

function darkenHex(hex, pct) {
  var n = parseInt(hex.replace('#', ''), 16);
  var rv = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - pct)));
  var gv = Math.max(0, Math.round(((n >> 8)  & 0xff) * (1 - pct)));
  var bv = Math.max(0, Math.round((n & 0xff)         * (1 - pct)));
  return 'rgb(' + rv + ',' + gv + ',' + bv + ')';
}

// Draw one isometric cube; top vertex at screen (px, py).
function drawCube(ctx, px, py, S, topColor, rightColor, leftColor, edgeColor) {
  var t0x = px,      t0y = py;
  var t1x = px + S,  t1y = py + S / 2;
  var t2x = px,      t2y = py + S;
  var t3x = px - S,  t3y = py + S / 2;
  var b1x = px + S,  b1y = py + S / 2 + S;
  var b2x = px,      b2y = py + 2 * S;
  var b3x = px - S,  b3y = py + S / 2 + S;

  ctx.lineWidth = 1;

  // Top face
  ctx.beginPath();
  ctx.moveTo(t0x, t0y); ctx.lineTo(t1x, t1y);
  ctx.lineTo(t2x, t2y); ctx.lineTo(t3x, t3y);
  ctx.closePath();
  ctx.fillStyle = topColor;   ctx.fill();
  ctx.strokeStyle = edgeColor; ctx.stroke();

  // Right face (col side)
  ctx.beginPath();
  ctx.moveTo(t1x, t1y); ctx.lineTo(b1x, b1y);
  ctx.lineTo(b2x, b2y); ctx.lineTo(t2x, t2y);
  ctx.closePath();
  ctx.fillStyle = rightColor;  ctx.fill();
  ctx.strokeStyle = edgeColor; ctx.stroke();

  // Left face (row side)
  ctx.beginPath();
  ctx.moveTo(t3x, t3y); ctx.lineTo(b3x, b3y);
  ctx.lineTo(b2x, b2y); ctx.lineTo(t2x, t2y);
  ctx.closePath();
  ctx.fillStyle = leftColor;   ctx.fill();
  ctx.strokeStyle = edgeColor; ctx.stroke();
}

// ── Layer selector ─────────────────────────────────────────────────────────
function buildLayerDots() {
  var container = document.getElementById('frag-layers');
  container.innerHTML = '';
  // Top-to-bottom: L4 (layer index 3) down to L1 (layer index 0)
  for (var i = 3; i >= 0; i--) {
    var dot = document.createElement('div');
    dot.className = 'frag-layer-dot' + (i === activeLayer ? ' frag-dot-active' : '');
    dot.dataset.layer = i;
    dot.innerHTML =
      '<div class="frag-dot-circle"></div>' +
      '<span class="frag-dot-label">L' + (i + 1) + '</span>';
    dot.addEventListener('click', (function (layer) {
      return function () { setActiveLayer(layer); };
    })(i));
    container.appendChild(dot);
  }
}

function setActiveLayer(layer) {
  activeLayer = layer;
  document.querySelectorAll('.frag-layer-dot').forEach(function (dot) {
    dot.classList.toggle('frag-dot-active', parseInt(dot.dataset.layer) === activeLayer);
  });
  render();
}

// ── Main canvas ────────────────────────────────────────────────────────────
var canvas   = document.getElementById('frag-cube-canvas');
var ctx      = canvas.getContext('2d');
var cubeWrap = document.getElementById('frag-cube-wrap');

function resizeCanvas() {
  var rect = cubeWrap.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  var dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width  = rect.width  + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (currentPuzzle) buildTray(); // tray canvas size may change between breakpoints
  render();
}

// ── Main render ─────────────────────────────────────────────────────────────

// All 64 grid cells pre-sorted back-to-front (ascending l+r+c) for painter's algorithm.
var GRID_CELLS = (function () {
  var cells = [];
  for (var l = 0; l < 4; l++)
    for (var r = 0; r < 4; r++)
      for (var c = 0; c < 4; c++)
        cells.push([l, r, c, l + r + c]);
  cells.sort(function (a, b) { return a[3] - b[3]; });
  return cells;
}());

function render() {
  var dpr = window.devicePixelRatio || 1;
  var W = canvas.width  / dpr;
  var H = canvas.height / dpr;
  ctx.clearRect(0, 0, W, H);
  renderGhostCube(W, H);
}

function renderGhostCube(W, H) {
  var S       = getCellSize();
  // Visual bbox center of 4×4×4 grid is at isoX=0, isoY=S → origin offsets
  var originX = W / 2;
  var originY = H / 2 - S;

  for (var i = 0; i < GRID_CELLS.length; i++) {
    var cell = GRID_CELLS[i];
    var lv = cell[0], rv = cell[1], cv = cell[2];
    var isActive  = (lv === activeLayer);
    var ghostFace = isActive ? 'rgba(232,220,200,0.60)' : 'rgba(232,220,200,0.30)';
    var ghostEdge = isActive ? 'rgba(26,26,26,0.35)'    : 'rgba(26,26,26,0.20)';
    drawCube(
      ctx,
      originX + isoX(lv, rv, cv, S),
      originY + isoY(lv, rv, cv, S),
      S, ghostFace, ghostFace, ghostFace, ghostEdge
    );
  }
}

// ── Piece tray ─────────────────────────────────────────────────────────────
function buildTray() {
  var tray = document.getElementById('frag-tray');
  tray.innerHTML = '';
  if (!currentPuzzle) return;

  var sz  = getTrayCanvasSize();
  var dpr = window.devicePixelRatio || 1;

  currentPuzzle.pieces.forEach(function (piece) {
    var item = document.createElement('div');
    item.className = 'frag-tray-item' +
      (piece.id === selectedPiece ? ' frag-tray-selected' : '') +
      (placedPieces[piece.id]     ? ' frag-tray-placed'   : '');
    item.dataset.pieceId = piece.id;

    // Piece mini-canvas
    var pc = document.createElement('canvas');
    pc.width  = Math.round(sz * dpr);
    pc.height = Math.round(sz * dpr);
    pc.style.cssText = 'display:block;width:' + sz + 'px;height:' + sz + 'px;';

    var pctx = pc.getContext('2d');
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderPieceTray(pctx, piece, sz);

    // Checkmark overlay — visible only when placed (CSS controls display)
    var check = document.createElement('div');
    check.className = 'frag-tray-check';
    check.textContent = '✓';

    item.appendChild(pc);
    item.appendChild(check);

    item.addEventListener('click', (function (p) {
      return function () {
        if (placedPieces[p.id]) return;
        selectedPiece = (selectedPiece === p.id) ? null : p.id;
        updateTraySelection();
      };
    })(piece));

    tray.appendChild(item);
  });
}

function updateTraySelection() {
  document.querySelectorAll('.frag-tray-item').forEach(function (item) {
    var id = item.dataset.pieceId;
    item.classList.toggle('frag-tray-selected', id === selectedPiece);
    item.classList.toggle('frag-tray-placed',   !!placedPieces[id]);
  });
}

// Render a piece scaled and centered within a sz×sz canvas.
function renderPieceTray(pctx, piece, sz) {
  pctx.clearRect(0, 0, sz, sz);
  var cells = piece.cells; // [[l, r, c], ...]

  // Compute iso bounding box with S=1 (includes face extents)
  var minX = Infinity, maxX = -Infinity;
  var minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < cells.length; i++) {
    var lv = cells[i][0], rv = cells[i][1], cv = cells[i][2];
    var px = cv - rv;                    // isoX with S=1
    var py = (cv + rv) / 2 - lv;        // isoY with S=1
    minX = Math.min(minX, px - 1);      // left face edge
    maxX = Math.max(maxX, px + 1);      // right face edge
    minY = Math.min(minY, py);          // top apex
    maxY = Math.max(maxY, py + 2);      // bottom of side faces
  }

  var pW = maxX - minX;
  var pH = maxY - minY;
  var S  = Math.max(4, Math.floor(Math.min(sz * 0.82 / pW, sz * 0.82 / pH)));

  // Center piece in the mini-canvas
  var originX = sz / 2 - ((minX + maxX) / 2) * S;
  var originY = sz / 2 - ((minY + maxY) / 2) * S;

  // Paint back-to-front
  var sorted = cells.slice().sort(function (a, b) {
    return (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]);
  });

  var topColor   = piece.color;
  var rightColor = darkenHex(piece.color, 0.15);
  var leftColor  = darkenHex(piece.color, 0.30);
  var edgeColor  = 'rgba(26,26,26,0.45)';

  for (var j = 0; j < sorted.length; j++) {
    var sl = sorted[j][0], sr = sorted[j][1], sc = sorted[j][2];
    drawCube(
      pctx,
      originX + isoX(sl, sr, sc, S),
      originY + isoY(sl, sr, sc, S),
      S, topColor, rightColor, leftColor, edgeColor
    );
  }
}

// ── Puzzle loading ─────────────────────────────────────────────────────────
function loadPuzzleData() {
  fetch('fragment-puzzles.json')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      puzzles = data;
      loadNewPuzzle();
    })
    .catch(function (err) {
      console.error('Fragment: failed to load puzzles:', err);
      render();
    });
}

function loadNewPuzzle() {
  if (!puzzles.length) return;
  currentPuzzle = puzzles[Math.floor(Math.random() * puzzles.length)];
  activeLayer   = 0;
  selectedPiece = null;
  placedPieces  = {};
  buildLayerDots();
  buildTray();
  render();
}

// ── Init ───────────────────────────────────────────────────────────────────
var resizeObserver = new ResizeObserver(function () { resizeCanvas(); });
resizeObserver.observe(cubeWrap);
window.addEventListener('resize', function () { resizeCanvas(); });

requestAnimationFrame(function () {
  resizeCanvas();
  loadPuzzleData();
});

openDirections(FRAGMENT_DIRECTIONS);
