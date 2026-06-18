// cubrick.js — Cubrick isometric city puzzle

var CUBRICK_DIRECTIONS = 'Select a piece from the tray. Tap the grid to place it. Fill every cell to build the city. Use Rotate to spin the selected piece before placing. Undo takes back your last move.';

// ── Event listeners ────────────────────────────────────────────────────────
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
var selectedPiece = null;
var selectedCells = null;   // normalized [r,c] pairs for selected piece (may be rotated)
var placedPieces  = {};     // { pieceId: [[r,c],...] } absolute coords
var undoStack     = [];
var winState      = false;
var lastPuzzleId  = null;
var hoverCell     = null;   // {r,c} or null

// ── Canvas ─────────────────────────────────────────────────────────────────
var canvas     = document.getElementById('cub-canvas');
var ctx        = canvas.getContext('2d');
var canvasWrap = document.getElementById('cub-canvas-wrap');

// ── Isometric layout ───────────────────────────────────────────────────────
var CELL    = 32;   // updated in computeIsoLayout
var originX = 0;
var originY = 0;

function computeIsoLayout() {
  var dpr = window.devicePixelRatio || 1;
  var W   = canvas.width  / dpr;
  var H   = canvas.height / dpr;

  // Base cell: 36 desktop, 24 mobile — clamped so 8×8 diamond (16*CELL wide) fits
  var base = W < 600 ? 24 : 36;
  CELL = Math.min(base, Math.floor(W * 0.94 / 16));

  // Center horizontally; grid spans ±8*CELL from originX
  originX = W / 2;

  // Visual height: 1.5*CELL block headroom + 8*CELL grid + 2*CELL slab = 11.5*CELL
  originY = (H - 11.5 * CELL) / 2 + 1.5 * CELL;
}

function isoX(row, col)  { return originX + (col - row) * CELL; }
function isoY(row, col)  { return originY + (col + row) * (CELL / 2); }
function heightOffset(h) { return h * (CELL / 2); }

// ── Canvas resize ──────────────────────────────────────────────────────────
function resizeCanvas() {
  var rect = canvasWrap.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  var dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width  = rect.width  + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  computeIsoLayout();
  render();
}

// ── Color utility ──────────────────────────────────────────────────────────
function darken(hex, pct) {
  var f = 1 - pct / 100;
  var r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * f));
  var g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * f));
  var b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * f));
  return '#' + [r, g, b].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
}

// ── Path builders ──────────────────────────────────────────────────────────
// h = block height (lifts top face upward by heightOffset(h))
function pathTopFace(row, col, h) {
  var x = isoX(row, col);
  var y = isoY(row, col) - heightOffset(h);
  ctx.beginPath();
  ctx.moveTo(x,        y);
  ctx.lineTo(x + CELL, y + CELL / 2);
  ctx.lineTo(x,        y + CELL);
  ctx.lineTo(x - CELL, y + CELL / 2);
  ctx.closePath();
}

function pathLeftFace(row, col, h) {
  var x    = isoX(row, col);
  var y    = isoY(row, col);
  var rise = heightOffset(h);
  ctx.beginPath();
  ctx.moveTo(x - CELL, y + CELL / 2 - rise);
  ctx.lineTo(x,        y + CELL - rise);
  ctx.lineTo(x,        y + CELL);
  ctx.lineTo(x - CELL, y + CELL / 2);
  ctx.closePath();
}

function pathRightFace(row, col, h) {
  var x    = isoX(row, col);
  var y    = isoY(row, col);
  var rise = heightOffset(h);
  ctx.beginPath();
  ctx.moveTo(x + CELL, y + CELL / 2 - rise);
  ctx.lineTo(x,        y + CELL - rise);
  ctx.lineTo(x,        y + CELL);
  ctx.lineTo(x + CELL, y + CELL / 2);
  ctx.closePath();
}

// ── Face drawing ───────────────────────────────────────────────────────────
function drawTopFace(row, col, color, opacity, h) {
  pathTopFace(row, col, h || 0);
  ctx.globalAlpha = opacity;
  ctx.fillStyle   = color;
  ctx.fill();
  ctx.strokeStyle = '#1A1A1A';
  ctx.lineWidth   = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawLeftFace(row, col, color, h, opacity) {
  pathLeftFace(row, col, h || 0);
  ctx.globalAlpha = opacity;
  ctx.fillStyle   = color;
  ctx.fill();
  ctx.strokeStyle = '#1A1A1A';
  ctx.lineWidth   = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawRightFace(row, col, color, h, opacity) {
  pathRightFace(row, col, h || 0);
  ctx.globalAlpha = opacity;
  ctx.fillStyle   = color;
  ctx.fill();
  ctx.strokeStyle = '#1A1A1A';
  ctx.lineWidth   = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawIsoCube(row, col, baseColor, h, opacity) {
  drawLeftFace(row,  col, darken(baseColor, 20), h, opacity);
  drawRightFace(row, col, darken(baseColor, 35), h, opacity);
  drawTopFace(row,   col, baseColor, opacity, h);
}

// Ghost cube: tan at low opacity — all empty cells
function drawGhostCube(row, col) {
  pathLeftFace(row, col, 1);
  ctx.globalAlpha = 0.08;
  ctx.fillStyle   = '#E8DCC8';
  ctx.fill();
  ctx.globalAlpha = 1;

  pathRightFace(row, col, 1);
  ctx.globalAlpha = 0.08;
  ctx.fillStyle   = '#E8DCC8';
  ctx.fill();
  ctx.globalAlpha = 1;

  pathTopFace(row, col, 1);
  ctx.globalAlpha = 0.15;
  ctx.fillStyle   = '#E8DCC8';
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ── Monolith surface ───────────────────────────────────────────────────────
function drawMonolithSurface() {
  // Solid dark diamond
  ctx.beginPath();
  ctx.moveTo(originX,          originY);
  ctx.lineTo(originX + 8*CELL, originY + 4*CELL);
  ctx.lineTo(originX,          originY + 8*CELL);
  ctx.lineTo(originX - 8*CELL, originY + 4*CELL);
  ctx.closePath();
  ctx.fillStyle = '#0A0A0A';
  ctx.fill();

  // Grid lines
  ctx.strokeStyle = 'rgba(26,26,26,0.25)';
  ctx.lineWidth   = 0.5;
  ctx.beginPath();
  for (var r = 0; r <= 8; r++) {
    ctx.moveTo(isoX(r, 0), isoY(r, 0));
    ctx.lineTo(isoX(r, 8), isoY(r, 8));
  }
  for (var c = 0; c <= 8; c++) {
    ctx.moveTo(isoX(0, c), isoY(0, c));
    ctx.lineTo(isoX(8, c), isoY(8, c));
  }
  ctx.stroke();
}

// ── Slab ───────────────────────────────────────────────────────────────────
// Drawn last so slab faces appear in front of the grid edge
function drawSlab() {
  var slabH = 4 * (CELL / 2);   // 4 iso units → 2*CELL px
  var pL    = { x: originX - 8*CELL, y: originY + 4*CELL };
  var pBot  = { x: originX,          y: originY + 8*CELL };
  var pR    = { x: originX + 8*CELL, y: originY + 4*CELL };

  // Left (SW) face — darkest
  ctx.beginPath();
  ctx.moveTo(pL.x,   pL.y);
  ctx.lineTo(pBot.x, pBot.y);
  ctx.lineTo(pBot.x, pBot.y + slabH);
  ctx.lineTo(pL.x,   pL.y   + slabH);
  ctx.closePath();
  ctx.fillStyle   = '#050505';
  ctx.fill();
  ctx.strokeStyle = '#1A1A1A';
  ctx.lineWidth   = 0.5;
  ctx.stroke();

  // Front-right (SE) face — slightly lighter
  ctx.beginPath();
  ctx.moveTo(pBot.x, pBot.y);
  ctx.lineTo(pR.x,   pR.y);
  ctx.lineTo(pR.x,   pR.y   + slabH);
  ctx.lineTo(pBot.x, pBot.y + slabH);
  ctx.closePath();
  ctx.fillStyle   = '#080808';
  ctx.fill();
  ctx.strokeStyle = '#1A1A1A';
  ctx.lineWidth   = 0.5;
  ctx.stroke();
}

// ── Render helpers ─────────────────────────────────────────────────────────
function normalizeCells(cells) {
  var minR = Math.min.apply(null, cells.map(function (c) { return c[0]; }));
  var minC = Math.min.apply(null, cells.map(function (c) { return c[1]; }));
  return cells.map(function (c) { return [c[0] - minR, c[1] - minC]; });
}

function findPiece(id) {
  return currentPuzzle && currentPuzzle.pieces.find(function (p) { return p.id === id; });
}

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
      var pc = placedPieces[pid];
      for (var j = 0; j < pc.length; j++) {
        if (pc[j][0] === r && pc[j][1] === c) return false;
      }
    }
  }
  return true;
}

// ── Main render ────────────────────────────────────────────────────────────
function render() {
  if (!canvas.width || !canvas.height || !CELL) return;
  var dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

  drawMonolithSurface();

  // Build placed-cell lookup
  var placed = {};
  if (currentPuzzle) {
    for (var pid in placedPieces) {
      var piece = findPiece(pid);
      if (!piece) continue;
      placedPieces[pid].forEach(function (cell) {
        placed[cell[0] + ',' + cell[1]] = { color: piece.color, height: piece.height };
      });
    }
  }

  // Build hover-ghost lookup
  var hoverGhost = {};
  if (currentPuzzle && selectedPiece && hoverCell && !placedPieces[selectedPiece]) {
    var gc = ghostCells(hoverCell.r, hoverCell.c);
    if (isGhostValid(gc)) {
      var gPiece = findPiece(selectedPiece);
      gc.forEach(function (cell) {
        hoverGhost[cell[0] + ',' + cell[1]] = { color: gPiece.color, height: gPiece.height };
      });
    }
  }

  // Pass 1 — ghost cubes for all empty cells (row 0→7, col 0→7)
  for (var row = 0; row < 8; row++) {
    for (var col = 0; col < 8; col++) {
      var key = row + ',' + col;
      if (!placed[key]) {
        if (hoverGhost[key]) {
          drawIsoCube(row, col, hoverGhost[key].color, hoverGhost[key].height, 0.55);
        } else {
          drawGhostCube(row, col);
        }
      }
    }
  }

  // Pass 2 — placed piece cubes
  for (var r2 = 0; r2 < 8; r2++) {
    for (var c2 = 0; c2 < 8; c2++) {
      var key2 = r2 + ',' + c2;
      if (placed[key2]) {
        drawIsoCube(r2, c2, placed[key2].color, placed[key2].height, 1);
      }
    }
  }

  drawSlab();
}

// ── Tray ───────────────────────────────────────────────────────────────────
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

  mctx.fillStyle = color;
  norm.forEach(function (cell) {
    mctx.fillRect(padX + cell[1] * cs + 0.75, padY + cell[0] * cs + 0.75, cs - 1.5, cs - 1.5);
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

    var mc  = document.createElement('canvas');
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

// ── Pointer handling ───────────────────────────────────────────────────────
function getEventCell(e) {
  var rect = canvas.getBoundingClientRect();
  var src  = e.touches ? e.touches[0] : e;
  var mx   = src.clientX - rect.left;
  var my   = src.clientY - rect.top;
  // Inverse iso: dx=(c-r)*CELL, dy=(c+r)*CELL/2
  var dx = mx - originX;
  var dy = my - originY;
  var c  = Math.floor((dx / CELL + dy / (CELL / 2)) / 2);
  var r  = Math.floor((dy / (CELL / 2) - dx / CELL) / 2);
  if (r < 0 || r > 7 || c < 0 || c > 7) return null;
  return { r: r, c: c };
}

canvas.addEventListener('mousemove', function (e) {
  var cell    = getEventCell(e);
  var changed = JSON.stringify(cell) !== JSON.stringify(hoverCell);
  hoverCell   = cell;
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

// ── Actions (stubs filled in Part 5) ──────────────────────────────────────
function placePiece(hr, hc) { /* Part 5 */ }
function doUndo()            { /* Part 5 */ }
function doReset()           { /* Part 5 */ }

function doRotate() {
  if (!selectedPiece || !selectedCells) return;
  var maxR = Math.max.apply(null, selectedCells.map(function (c) { return c[0]; }));
  selectedCells = normalizeCells(
    selectedCells.map(function (cell) { return [cell[1], maxR - cell[0]]; })
  );
  render();
}

function doShare() {
  var n = moveCount;
  shareText(
    'Cubrick — built the city in ' + n + ' move' + (n === 1 ? '' : 's') + '. https://www.thebunnygame.com/cubrick',
    'Cubrick — Bunny Game'
  );
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
