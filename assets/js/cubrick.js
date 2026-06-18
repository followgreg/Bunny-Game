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
var puzzles        = [];
var currentPuzzle  = null;
var moveCount      = 0;
var selectedPiece  = null;
var selectedCells  = null;   // normalized+rotated [r,c] pairs for selected piece
var placedPieces   = {};     // { pieceId: [[r,c],...] } absolute coords
var pieceRotations = {};     // { pieceId: 0|1|2|3 }
var undoStack      = [];
var winState       = false;
var lastPuzzleId   = null;
var hoverCell      = null;   // {r,c} or null

// ── Canvas ─────────────────────────────────────────────────────────────────
var canvas     = document.getElementById('cub-canvas');
var ctx        = canvas.getContext('2d');
var canvasWrap = document.getElementById('cub-canvas-wrap');

// Hit canvas — offscreen, never displayed
var hitCanvas = document.createElement('canvas');
var hitCtx    = hitCanvas.getContext('2d');

// ── Isometric layout ───────────────────────────────────────────────────────
var CELL    = 32;
var originX = 0;
var originY = 0;

function computeIsoLayout() {
  var dpr  = window.devicePixelRatio || 1;
  var W    = canvas.width  / dpr;
  var H    = canvas.height / dpr;
  var base = W < 600 ? 24 : 36;
  CELL    = Math.min(base, Math.floor(W * 0.94 / 16));
  originX = W / 2;
  // visual height: 1.5*CELL headroom + 8*CELL grid + 2*CELL slab = 11.5*CELL
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
  hitCanvas.width  = canvas.width;
  hitCanvas.height = canvas.height;
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

// ── Path builders (use global ctx, CELL, originX, originY) ─────────────────
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
  ctx.beginPath();
  ctx.moveTo(originX,          originY);
  ctx.lineTo(originX + 8*CELL, originY + 4*CELL);
  ctx.lineTo(originX,          originY + 8*CELL);
  ctx.lineTo(originX - 8*CELL, originY + 4*CELL);
  ctx.closePath();
  ctx.fillStyle = '#0A0A0A';
  ctx.fill();

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
function drawSlab() {
  var slabH = 4 * (CELL / 2);
  var pL    = { x: originX - 8*CELL, y: originY + 4*CELL };
  var pBot  = { x: originX,          y: originY + 8*CELL };
  var pR    = { x: originX + 8*CELL, y: originY + 4*CELL };

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

// ── Hit map ────────────────────────────────────────────────────────────────
// Draw every cell as a unique solid color encoding [row,col].
// R=row+1, G=col+1, B=255 (sentinel). Never displayed.
function renderHitMap() {
  var dpr = window.devicePixelRatio || 1;
  var W   = canvas.width  / dpr;
  var H   = canvas.height / dpr;

  // Build placed-height lookup
  var placedH = {};
  if (currentPuzzle) {
    for (var pid in placedPieces) {
      var piece = findPiece(pid);
      if (!piece) continue;
      placedPieces[pid].forEach(function (cell) {
        placedH[cell[0] + ',' + cell[1]] = piece.height;
      });
    }
  }

  // Temporarily redirect ctx → hitCtx
  var sCtx = ctx;
  ctx = hitCtx;
  hitCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  hitCtx.clearRect(0, 0, W, H);

  for (var row = 0; row < 8; row++) {
    for (var col = 0; col < 8; col++) {
      var h    = placedH[row + ',' + col] || 1;
      var enc  = 'rgb(' + (row + 1) + ',' + (col + 1) + ',255)';

      pathLeftFace(row, col, h);
      hitCtx.fillStyle = enc;
      hitCtx.fill();

      pathRightFace(row, col, h);
      hitCtx.fillStyle = enc;
      hitCtx.fill();

      pathTopFace(row, col, h);
      hitCtx.fillStyle = enc;
      hitCtx.fill();
    }
  }

  ctx = sCtx;
}

// ── Render helpers ─────────────────────────────────────────────────────────
function normalizeCells(cells) {
  var minR = Math.min.apply(null, cells.map(function (c) { return c[0]; }));
  var minC = Math.min.apply(null, cells.map(function (c) { return c[1]; }));
  return cells.map(function (c) { return [c[0] - minR, c[1] - minC]; });
}

function rotateCells(cells) {
  var maxR = Math.max.apply(null, cells.map(function (c) { return c[0]; }));
  return cells.map(function (cell) { return [cell[1], maxR - cell[0]]; });
}

function findPiece(id) {
  return currentPuzzle && currentPuzzle.pieces.find(function (p) { return p.id === id; });
}

function getPieceCells(pieceId) {
  var piece = findPiece(pieceId);
  if (!piece) return null;
  var cells = normalizeCells(piece.cells.map(function (c) { return [c[0], c[1]]; }));
  var rot   = pieceRotations[pieceId] || 0;
  for (var i = 0; i < rot; i++) {
    cells = normalizeCells(rotateCells(cells));
  }
  return cells;
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

  // Pass 1 — ghost cubes for all empty cells
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

  // Pass 2 — placed pieces
  for (var r2 = 0; r2 < 8; r2++) {
    for (var c2 = 0; c2 < 8; c2++) {
      var key2 = r2 + ',' + c2;
      if (placed[key2]) {
        drawIsoCube(r2, c2, placed[key2].color, placed[key2].height, 1);
      }
    }
  }

  drawSlab();
  renderHitMap();
}

// ── Tray isometric mini-render ─────────────────────────────────────────────
// Temporarily overrides CELL/originX/originY/ctx to draw into a mini canvas.
function renderTrayIso(mc, cells, color, h) {
  var mctx = mc.getContext('2d');
  var dpr  = window.devicePixelRatio || 1;
  var SIZE = mc.width / dpr;

  var norm = normalizeCells(cells.map(function (c) { return [c[0], c[1]]; }));
  var maxR = Math.max.apply(null, norm.map(function (c) { return c[0]; }));
  var maxC = Math.max.apply(null, norm.map(function (c) { return c[1]; }));

  // Fit in SIZE × SIZE with padding
  var cw       = SIZE / (maxR + maxC + 2);
  var ch       = 2 * SIZE / (maxR + maxC + 1 + h);
  var cellMini = Math.min(cw, ch) * 0.82;

  // Center vertically accounting for block height
  var totalHVis = (maxR + maxC + 1 + h) * cellMini / 2;
  var cx        = SIZE / 2;
  var cy        = (SIZE - totalHVis) / 2 + h * cellMini / 2;

  mctx.clearRect(0, 0, SIZE, SIZE);
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Temporarily override iso globals
  var sCell = CELL, sOX = originX, sOY = originY, sCtx = ctx;
  CELL    = cellMini;
  originX = cx;
  originY = cy;
  ctx     = mctx;

  // Draw in diagonal back-to-front order
  var sorted = norm.slice().sort(function (a, b) {
    return (a[0] + a[1]) - (b[0] + b[1]) || a[1] - b[1];
  });
  sorted.forEach(function (cell) {
    drawIsoCube(cell[0], cell[1], color, h, 1);
  });

  // Restore
  CELL    = sCell;
  originX = sOX;
  originY = sOY;
  ctx     = sCtx;
}

// ── Tray DOM ───────────────────────────────────────────────────────────────
function buildTray() {
  var tray = document.getElementById('cub-tray');
  tray.innerHTML = '';
  if (!currentPuzzle || !CELL) return;

  var TRAY_SIZE = window.innerWidth < 600 ? 70 : 90;

  currentPuzzle.pieces.forEach(function (piece) {
    var item = document.createElement('div');
    item.className = 'cub-tray-item';
    item.dataset.pieceId = piece.id;

    var mc  = document.createElement('canvas');
    var dpr = window.devicePixelRatio || 1;
    mc.width  = TRAY_SIZE * dpr;
    mc.height = TRAY_SIZE * dpr;
    mc.style.width  = TRAY_SIZE + 'px';
    mc.style.height = TRAY_SIZE + 'px';
    mc.style.display = 'block';
    renderTrayIso(mc, getPieceCells(piece.id), piece.color, piece.height);
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

function updateTrayItemCanvas(pieceId) {
  var item = document.querySelector('[data-piece-id="' + pieceId + '"]');
  if (!item) return;
  var mc    = item.querySelector('canvas');
  var piece = findPiece(pieceId);
  if (!mc || !piece) return;
  renderTrayIso(mc, getPieceCells(pieceId), piece.color, piece.height);
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
    selectedCells = getPieceCells(id);
  }
  updateTrayUI();
  updateRotateButton();
  render();
}

// ── Hit-canvas cell detection ──────────────────────────────────────────────
function getEventCell(e) {
  var rect = canvas.getBoundingClientRect();
  var src  = e.touches ? e.touches[0] : e;
  var mx   = src.clientX - rect.left;
  var my   = src.clientY - rect.top;
  var dpr  = window.devicePixelRatio || 1;
  var px   = Math.round(mx * dpr);
  var py   = Math.round(my * dpr);
  if (px < 0 || py < 0 || px >= hitCanvas.width || py >= hitCanvas.height) return null;
  var data = hitCtx.getImageData(px, py, 1, 1).data;
  if (data[2] !== 255) return null;   // not a valid cell (sentinel check)
  var r = data[0] - 1;
  var c = data[1] - 1;
  if (r < 0 || r > 7 || c < 0 || c > 7) return null;
  return { r: r, c: c };
}

// ── Pointer events ─────────────────────────────────────────────────────────
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
  var cell = getEventCell(e);
  console.log('Cubrick hit:', cell ? '[' + cell.r + ',' + cell.c + ']' : 'miss');
  if (winState || !selectedPiece || placedPieces[selectedPiece]) return;
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

  pieceRotations = {};
  currentPuzzle.pieces.forEach(function (p) { pieceRotations[p.id] = 0; });

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
function doUndo()            { /* Part 5 */ }
function doReset()           { /* Part 5 */ }

function doRotate() {
  if (!selectedPiece) return;
  pieceRotations[selectedPiece] = ((pieceRotations[selectedPiece] || 0) + 1) % 4;
  selectedCells = getPieceCells(selectedPiece);
  updateTrayItemCanvas(selectedPiece);
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
