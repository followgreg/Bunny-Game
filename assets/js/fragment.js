// fragment.js — Fragment 3D polycube puzzle
// Part 3: isometric rendering engine — empty ghost cube only.

var FRAGMENT_DIRECTIONS = 'Fragment is a 3D assembly puzzle. Your goal is to fill the cube completely using all eight pieces. Each piece is a unique three-dimensional shape that spans multiple layers of the cube. Select a piece from the tray, choose which layer to place it on using the dots on the left, then tap a cell on the cube to place it. Pieces anchor at the cell you tap and extend through the cube according to their shape. If a piece does not fit where you tapped, try a different cell or a different layer. Use undo to take back your last placement. Use reset to start the puzzle over. There is no time limit. Your score is how many moves it took to fill the cube. Every puzzle is different. The satisfaction is in the solve.';

document.getElementById('help-btn').addEventListener('click', function () {
  openDirections(FRAGMENT_DIRECTIONS);
});

document.getElementById('new-btn').addEventListener('click', function () {
  loadNewPuzzle();
});

// ── State ──────────────────────────────────────────────────────────────────
var puzzles = [];
var currentPuzzle = null;

// ── Isometric helpers ──────────────────────────────────────────────────────
function getCellSize() {
  return window.innerWidth < 600 ? 22 : 32;
}

// Screen X of the "top vertex" of a cube at grid (l, r, c). Origin at (0, 0).
function isoX(l, r, c, S) {
  return (c - r) * S;
}

// Screen Y of the "top vertex" of a cube at grid (l, r, c). Origin at (0, 0).
// col axis: right+down (S, S/2); row axis: left+down (-S, S/2); layer axis: up (0, -S)
function isoY(l, r, c, S) {
  return (c + r) * (S / 2) - l * S;
}

// Darken a #rrggbb hex color by pct (0–1).
function darkenHex(hex, pct) {
  var n = parseInt(hex.replace('#', ''), 16);
  var r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - pct)));
  var g = Math.max(0, Math.round(((n >> 8) & 0xff) * (1 - pct)));
  var b = Math.max(0, Math.round((n & 0xff) * (1 - pct)));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

// Draw one isometric cube whose top vertex is at screen (px, py).
// topColor / rightColor / leftColor: CSS fill colors for each face.
// edgeColor: CSS stroke color for all edges.
function drawCube(ctx, px, py, S, topColor, rightColor, leftColor, edgeColor) {
  // Top-face vertices (rhombus)
  var t0x = px,      t0y = py;           // top (apex)
  var t1x = px + S,  t1y = py + S / 2;  // right
  var t2x = px,      t2y = py + S;       // bottom (front)
  var t3x = px - S,  t3y = py + S / 2;  // left

  // Side-face bottom vertices (top-face bottom vertex extended down by S)
  var b1x = px + S,  b1y = py + S / 2 + S;  // right-bottom
  var b2x = px,      b2y = py + 2 * S;       // front-bottom
  var b3x = px - S,  b3y = py + S / 2 + S;  // left-bottom

  ctx.lineWidth = 1;

  // Top face
  ctx.beginPath();
  ctx.moveTo(t0x, t0y);
  ctx.lineTo(t1x, t1y);
  ctx.lineTo(t2x, t2y);
  ctx.lineTo(t3x, t3y);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();
  ctx.strokeStyle = edgeColor;
  ctx.stroke();

  // Right face (col side — faces toward viewer-right)
  ctx.beginPath();
  ctx.moveTo(t1x, t1y);
  ctx.lineTo(b1x, b1y);
  ctx.lineTo(b2x, b2y);
  ctx.lineTo(t2x, t2y);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();
  ctx.strokeStyle = edgeColor;
  ctx.stroke();

  // Left face (row side — faces toward viewer-left)
  ctx.beginPath();
  ctx.moveTo(t3x, t3y);
  ctx.lineTo(b3x, b3y);
  ctx.lineTo(b2x, b2y);
  ctx.lineTo(t2x, t2y);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();
  ctx.strokeStyle = edgeColor;
  ctx.stroke();
}

// ── Canvas setup ───────────────────────────────────────────────────────────
var canvas = document.getElementById('frag-cube-canvas');
var ctx = canvas.getContext('2d');
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
  render();
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  var dpr = window.devicePixelRatio || 1;
  var W = canvas.width  / dpr;
  var H = canvas.height / dpr;
  ctx.clearRect(0, 0, W, H);
  renderGhostCube(W, H);
}

// Generate all 64 grid cells sorted back-to-front (painter's algorithm).
// Sort ascending by (l + r + c): lower sum = further from viewer.
var GRID_CELLS = (function () {
  var cells = [];
  for (var l = 0; l < 4; l++) {
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 4; c++) {
        cells.push([l, r, c, l + r + c]);
      }
    }
  }
  cells.sort(function (a, b) { return a[3] - b[3]; });
  return cells;
}());

function renderGhostCube(W, H) {
  var S = getCellSize();

  // Visual bounding box of the full 4×4×4 grid (accounting for face extents):
  //   X: top-vertex isoX ∈ [-3S, 3S], faces extend ±S  → visual X ∈ [-4S, 4S], center = 0
  //   Y: top-vertex isoY ∈ [-3S, 3S], faces extend +2S → visual Y ∈ [-3S, 5S], center = S
  // Center at canvas center → originX = W/2, originY = H/2 − S
  var originX = W / 2;
  var originY = H / 2 - S;

  // Ghost face: same hue as bg (#E8DCC8 = 232,220,200) at 30% opacity — subtle volume
  var ghostFace = 'rgba(232,220,200,0.30)';
  // Ghost edge: dark at 20% opacity — visible wireframe
  var ghostEdge = 'rgba(26,26,26,0.20)';

  for (var i = 0; i < GRID_CELLS.length; i++) {
    var cell = GRID_CELLS[i];
    var lv = cell[0], rv = cell[1], cv = cell[2];
    var px = originX + isoX(lv, rv, cv, S);
    var py = originY + isoY(lv, rv, cv, S);
    drawCube(ctx, px, py, S, ghostFace, ghostFace, ghostFace, ghostEdge);
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
      // Ghost cube already rendered by resizeCanvas(); nothing else to do.
    });
}

function loadNewPuzzle() {
  if (!puzzles.length) return;
  var idx = Math.floor(Math.random() * puzzles.length);
  currentPuzzle = puzzles[idx];
  render();
}

// ── Init ───────────────────────────────────────────────────────────────────
var resizeObserver = new ResizeObserver(function () {
  resizeCanvas();
});
resizeObserver.observe(cubeWrap);

// Fallback for environments where ResizeObserver fires late
window.addEventListener('resize', function () {
  resizeCanvas();
});

// Defer initial size+render until layout is settled
requestAnimationFrame(function () {
  resizeCanvas();
  loadPuzzleData();
});

// Show directions on first load each session.
openDirections(FRAGMENT_DIRECTIONS);
