// cubrick.js — Cubrick isometric city puzzle

var CUBRICK_DIRECTIONS = 'Select a piece from the tray. Tap the grid to place it. Fill every cell to build the city. Use Rotate to spin the selected piece before placing. Undo takes back your last move.';

// ── Button event listeners ─────────────────────────────────────────────────
document.getElementById('help-btn').addEventListener('click', function () { openDirections(CUBRICK_DIRECTIONS); });
document.getElementById('new-btn').addEventListener('click', loadNewPuzzle);
document.getElementById('cub-undo-btn').addEventListener('click', doUndo);
document.getElementById('cub-reset-btn').addEventListener('click', doReset);
document.getElementById('cub-rotate-btn').addEventListener('click', doRotate);
document.getElementById('cub-new-puzzle-btn').addEventListener('click', loadNewPuzzle);
document.getElementById('share-btn').addEventListener('click', doShare);

// ── State ──────────────────────────────────────────────────────────────────
var puzzles       = [];
var currentPuzzle = null;
var moveCount     = 0;
var selectedPiece = null;   // piece id ('A'–'G') or null
var selectedCells = null;   // normalized [r,c] pairs for selected piece (may be rotated)
var placedPieces  = {};     // { pieceId: [[r,c],...] } absolute grid coords
var undoStack     = [];     // [{pieceId, cells}]
var winState      = false;
var lastPuzzleId  = null;
var hoverCell     = null;   // {r,c} under pointer, or null

// ── Canvas ─────────────────────────────────────────────────────────────────
var canvas     = document.getElementById('cub-canvas');
var ctx        = canvas.getContext('2d');
var canvasWrap = document.getElementById('cub-canvas-wrap');

function resizeCanvas() {
  var rect = canvasWrap.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  var dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width  = rect.width  + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

// ── Layout ─────────────────────────────────────────────────────────────────
function computeLayout() {
  var dpr = window.devicePixelRatio || 1;
  var W = canvas.width  / dpr;
  var H = canvas.height / dpr;
  // iso diamond: hw = tileW/2, hh = tileW/4 (2:1 ratio)
  // grid spans 8*tileW wide, 4*tileW tall + 3*hh headroom for max height
  var tileFromW = (W * 0.88) / 8;
  var tileFromH = (H * 0.88) / (4 + 3 * 0.25);
  var tileW  = Math.min(tileFromW, tileFromH);
  var hw     = tileW / 2;
  var hh     = tileW / 4;   // = hw/2, standard 2:1 iso
  var floorH = hh;           // pixels per height unit

  var headroom = 3 * floorH;
  var gridH    = 4 * tileW;
  var originX  = W / 2;
  var originY  = (H - headroom - gridH) / 2 + headroom;

  return { tileW: tileW, hw: hw, hh: hh, floorH: floorH, originX: originX, originY: originY, W: W, H: H };
}

// ── Coordinate transforms ──────────────────────────────────────────────────
function toScreen(r, c, L) {
  return {
    x: L.originX + (c - r) * L.hw,
    y: L.originY + (c + r) * L.hh
  };
}

function screenToCell(mx, my, L) {
  var dx = mx - L.originX;
  var dy = my - L.originY;
  var c = Math.floor((dx / L.hw + dy / L.hh) / 2);
  var r = Math.floor((dy / L.hh - dx / L.hw) / 2);
  if (r < 0 || r > 7 || c < 0 || c > 7) return null;
  return { r: r, c: c };
}

// ── Color helpers ──────────────────────────────────────────────────────────
function darkenHex(hex, factor) {
  var r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * factor));
  var g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * factor));
  var b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * factor));
  return '#' + [r, g, b].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
}

// ── Drawing primitives ─────────────────────────────────────────────────────
function drawDiamond(t, L, style) {
  ctx.beginPath();
  ctx.moveTo(t.x,        t.y);
  ctx.lineTo(t.x + L.hw, t.y + L.hh);
  ctx.lineTo(t.x,        t.y + 2 * L.hh);
  ctx.lineTo(t.x - L.hw, t.y + L.hh);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

function drawBlock(r, c, color, floors, L, alpha) {
  var t    = toScreen(r, c, L);
  var rise = floors * L.floorH;
  ctx.globalAlpha = (alpha === undefined) ? 1 : alpha;

  // Left (SW) face
  ctx.beginPath();
  ctx.moveTo(t.x - L.hw, t.y + L.hh - rise);
  ctx.lineTo(t.x,        t.y + 2 * L.hh - rise);
  ctx.lineTo(t.x,        t.y + 2 * L.hh);
  ctx.lineTo(t.x - L.hw, t.y + L.hh);
  ctx.closePath();
  ctx.fillStyle = darkenHex(color, 0.52);
  ctx.fill();

  // Right (SE) face
  ctx.beginPath();
  ctx.moveTo(t.x + L.hw, t.y + L.hh - rise);
  ctx.lineTo(t.x,        t.y + 2 * L.hh - rise);
  ctx.lineTo(t.x,        t.y + 2 * L.hh);
  ctx.lineTo(t.x + L.hw, t.y + L.hh);
  ctx.closePath();
  ctx.fillStyle = darkenHex(color, 0.70);
  ctx.fill();

  // Top face
  ctx.beginPath();
  ctx.moveTo(t.x,        t.y - rise);
  ctx.lineTo(t.x + L.hw, t.y + L.hh - rise);
  ctx.lineTo(t.x,        t.y + 2 * L.hh - rise);
  ctx.lineTo(t.x - L.hw, t.y + L.hh - rise);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  ctx.globalAlpha = 1;
}

// ── Monolith base ──────────────────────────────────────────────────────────
function drawGridBase(L) {
  // Grid boundary key points
  var pL   = { x: L.originX - 8 * L.hw, y: L.originY + 8  * L.hh };  // leftmost
  var pBot = { x: L.originX,             y: L.originY + 16 * L.hh };  // bottommost
  var pR   = { x: L.originX + 8 * L.hw, y: L.originY + 8  * L.hh };  // rightmost
  var SLAB = L.floorH * 0.5;

  // Top face cells — back-to-front by diagonal
  for (var d = 0; d <= 14; d++) {
    for (var r = Math.max(0, d - 7); r <= Math.min(7, d); r++) {
      var c = d - r;
      if (c < 0 || c > 7) continue;
      var t = toScreen(r, c, L);
      drawDiamond(t, L, '#1C1C1C');
      ctx.beginPath();
      ctx.moveTo(t.x,        t.y);
      ctx.lineTo(t.x + L.hw, t.y + L.hh);
      ctx.lineTo(t.x,        t.y + 2 * L.hh);
      ctx.lineTo(t.x - L.hw, t.y + L.hh);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  // Left (SW) slab face
  ctx.beginPath();
  ctx.moveTo(pL.x,   pL.y);
  ctx.lineTo(pBot.x, pBot.y);
  ctx.lineTo(pBot.x, pBot.y + SLAB);
  ctx.lineTo(pL.x,   pL.y   + SLAB);
  ctx.closePath();
  ctx.fillStyle = '#0D0D0D';
  ctx.fill();

  // Right (SE) slab face
  ctx.beginPath();
  ctx.moveTo(pBot.x, pBot.y);
  ctx.lineTo(pR.x,   pR.y);
  ctx.lineTo(pR.x,   pR.y   + SLAB);
  ctx.lineTo(pBot.x, pBot.y + SLAB);
  ctx.closePath();
  ctx.fillStyle = '#141414';
  ctx.fill();
}

// Back-to-front render order for 8×8 grid
function renderOrder() {
  var order = [];
  for (var d = 0; d <= 14; d++) {
    for (var r = Math.max(0, d - 7); r <= Math.min(7, d); r++) {
      var c = d - r;
      if (c >= 0 && c <= 7) order.push([r, c]);
    }
  }
  return order;
}

// ── Ghost helpers ──────────────────────────────────────────────────────────
function ghostCells(hr, hc) {
  if (!selectedCells) return null;
  return selectedCells.map(function (cell) { return [cell[0] + hr, cell[1] + hc]; });
}

function isGhostValid(cells) {
  if (!cells) return false;
  for (var i = 0; i < cells.length; i++) {
    var r = cells[i][0], c = cells[i][1];
    if (r < 0 || r > 7 || c < 0 || c > 7) return false;
    for (var pid in placedPieces) {
      var pcells = placedPieces[pid];
      for (var j = 0; j < pcells.length; j++) {
        if (pcells[j][0] === r && pcells[j][1] === c) return false;
      }
    }
  }
  return true;
}

// ── Main render ────────────────────────────────────────────────────────────
function render() {
  if (!canvas.width || !canvas.height) return;
  var L = computeLayout();
  ctx.clearRect(0, 0, L.W, L.H);

  drawGridBase(L);
  if (!currentPuzzle) return;

  // Build cell lookup for placed pieces
  var cellInfo = {};  // "r,c" → {color, height}
  for (var pid in placedPieces) {
    var piece = findPiece(pid);
    if (!piece) continue;
    placedPieces[pid].forEach(function (cell) {
      cellInfo[cell[0] + ',' + cell[1]] = { color: piece.color, height: piece.height };
    });
  }

  // Ghost
  var ghostSet = {};
  if (selectedPiece && hoverCell && !placedPieces[selectedPiece]) {
    var gCells = ghostCells(hoverCell.r, hoverCell.c);
    if (isGhostValid(gCells)) {
      var gPiece = findPiece(selectedPiece);
      gCells.forEach(function (cell) {
        ghostSet[cell[0] + ',' + cell[1]] = { color: gPiece.color, height: gPiece.height };
      });
    }
  }

  // Draw blocks back-to-front
  var order = renderOrder();
  for (var oi = 0; oi < order.length; oi++) {
    var r = order[oi][0], c = order[oi][1];
    var key = r + ',' + c;
    if (cellInfo[key]) {
      drawBlock(r, c, cellInfo[key].color, cellInfo[key].height, L, 1);
    } else if (ghostSet[key]) {
      drawBlock(r, c, ghostSet[key].color, ghostSet[key].height, L, 0.55);
    }
  }
}

function findPiece(id) {
  return currentPuzzle && currentPuzzle.pieces.find(function (p) { return p.id === id; });
}

// ── Tray ───────────────────────────────────────────────────────────────────
function normalizeCells(cells) {
  var minR = Math.min.apply(null, cells.map(function (c) { return c[0]; }));
  var minC = Math.min.apply(null, cells.map(function (c) { return c[1]; }));
  return cells.map(function (c) { return [c[0] - minR, c[1] - minC]; });
}

function renderTrayMini(mc, cells, color) {
  var mctx = mc.getContext('2d');
  var dpr  = window.devicePixelRatio || 1;
  var size = mc.width / dpr;
  mctx.clearRect(0, 0, size, size);
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  var norm = normalizeCells(cells);
  var maxR = Math.max.apply(null, norm.map(function (c) { return c[0]; }));
  var maxC = Math.max.apply(null, norm.map(function (c) { return c[1]; }));
  var cs   = Math.floor(Math.min(size / (maxC + 1), size / (maxR + 1)) * 0.9);
  var padX = (size - (maxC + 1) * cs) / 2;
  var padY = (size - (maxR + 1) * cs) / 2;
  var gap  = 1.5;

  mctx.fillStyle = color;
  norm.forEach(function (cell) {
    mctx.fillRect(
      padX + cell[1] * cs + gap / 2,
      padY + cell[0] * cs + gap / 2,
      cs - gap, cs - gap
    );
  });
}

function buildTray() {
  var tray = document.getElementById('cub-tray');
  tray.innerHTML = '';
  if (!currentPuzzle) return;

  var MINI = 56;
  currentPuzzle.pieces.forEach(function (piece) {
    var item = document.createElement('div');
    item.className = 'cub-tray-item';
    item.dataset.pieceId = piece.id;

    var mc = document.createElement('canvas');
    var dpr = window.devicePixelRatio || 1;
    mc.width  = MINI * dpr;
    mc.height = MINI * dpr;
    mc.style.width  = MINI + 'px';
    mc.style.height = MINI + 'px';
    mc.style.display = 'block';
    renderTrayMini(mc, piece.cells, piece.color);
    item.appendChild(mc);

    var check = document.createElement('div');
    check.className = 'cub-tray-check';
    check.textContent = '✓';
    item.appendChild(check);

    item.addEventListener('click', function () {
      if (placedPieces[piece.id]) return;
      selectPiece(piece.id);
    });

    tray.appendChild(item);
  });
}

function updateTrayUI() {
  document.querySelectorAll('.cub-tray-item').forEach(function (item) {
    var id = item.dataset.pieceId;
    item.classList.toggle('cub-tray-selected', id === selectedPiece && !placedPieces[id]);
    item.classList.toggle('cub-tray-placed', !!placedPieces[id]);
  });
}

// ── Selection ──────────────────────────────────────────────────────────────
function selectPiece(id) {
  if (winState) return;
  if (selectedPiece === id) {
    selectedPiece = null;
    selectedCells = null;
  } else {
    selectedPiece = id;
    var piece = findPiece(id);
    selectedCells = normalizeCells(piece.cells.map(function (c) { return [c[0], c[1]]; }));
  }
  updateTrayUI();
  updateRotateButton();
  render();
}

// ── Pointer helpers ────────────────────────────────────────────────────────
function getEventCell(e) {
  var rect = canvas.getBoundingClientRect();
  var src  = e.touches ? e.touches[0] : e;
  var mx   = src.clientX - rect.left;
  var my   = src.clientY - rect.top;
  return screenToCell(mx, my, computeLayout());
}

canvas.addEventListener('mousemove', function (e) {
  var cell = getEventCell(e);
  var changed = JSON.stringify(cell) !== JSON.stringify(hoverCell);
  hoverCell = cell;
  if (selectedPiece && changed) render();
});

canvas.addEventListener('mouseleave', function () {
  if (hoverCell) { hoverCell = null; if (selectedPiece) render(); }
});

canvas.addEventListener('click', function (e) {
  if (winState || !selectedPiece || placedPieces[selectedPiece]) return;
  var cell = getEventCell(e);
  if (!cell) return;
  placePiece(cell.r, cell.c);
});

// ── Puzzle loading ─────────────────────────────────────────────────────────
function loadPuzzleData() {
  fetch('cubrick-puzzles.json')
    .then(function (res) { return res.json(); })
    .then(function (data) { puzzles = data; loadNewPuzzle(); })
    .catch(function (err) { console.error('Cubrick: failed to load puzzles:', err); });
}

function loadNewPuzzle() {
  if (!puzzles.length) return;
  var candidates = puzzles.length > 1
    ? puzzles.filter(function (p) { return p.id !== lastPuzzleId; })
    : puzzles;
  currentPuzzle = candidates[Math.floor(Math.random() * candidates.length)];
  lastPuzzleId  = currentPuzzle.id;
  moveCount     = 0;
  selectedPiece = null;
  selectedCells = null;
  placedPieces  = {};
  undoStack     = [];
  winState      = false;
  hoverCell     = null;

  document.getElementById('cub-canvas-area').style.display = '';
  document.getElementById('cub-tray').style.display = '';
  document.getElementById('cub-results').classList.remove('cub-results-visible');
  canvas.style.pointerEvents = '';

  updateMoveCounter();
  updateUndoButton();
  updateRotateButton();
  buildTray();
  render();
}

// ── HUD ────────────────────────────────────────────────────────────────────
function updateMoveCounter() {
  document.getElementById('cub-moves').textContent = moveCount;
}

function updateUndoButton() {
  document.getElementById('cub-undo-btn').disabled = (undoStack.length === 0);
}

function updateRotateButton() {
  document.getElementById('cub-rotate-btn').disabled = !selectedPiece || !!placedPieces[selectedPiece];
}

function shakeCanvas() {
  canvasWrap.classList.add('cub-shake');
  setTimeout(function () { canvasWrap.classList.remove('cub-shake'); }, 320);
}

// ── Actions ────────────────────────────────────────────────────────────────
function placePiece(hr, hc) { /* Part 5 */ }

function doUndo() { /* Part 5 */ }

function doReset() { /* Part 5 */ }

function doRotate() {
  if (!selectedPiece || !selectedCells) return;
  var maxR = Math.max.apply(null, selectedCells.map(function (c) { return c[0]; }));
  // 90° CW: (r, c) → (c, maxR - r), then re-normalize
  selectedCells = normalizeCells(
    selectedCells.map(function (cell) { return [cell[1], maxR - cell[0]]; })
  );
  render();
}

function doShare() {
  var n    = moveCount;
  var text = 'Cubrick — built the city in ' + n + ' move' + (n === 1 ? '' : 's') + '. https://www.thebunnygame.com/cubrick';
  shareText(text, 'Cubrick — Bunny Game');
}

// ── Resize ─────────────────────────────────────────────────────────────────
new ResizeObserver(function () { resizeCanvas(); }).observe(canvasWrap);
window.addEventListener('resize', function () { resizeCanvas(); });
window.addEventListener('orientationchange', function () { setTimeout(resizeCanvas, 120); });

// ── Init ───────────────────────────────────────────────────────────────────
requestAnimationFrame(function () {
  resizeCanvas();
  loadPuzzleData();
});

openDirections(CUBRICK_DIRECTIONS);
