// fragment.js — Fragment 3D polycube puzzle
// Part 5: placement, undo, reset, win detection + rotation animation

var FRAGMENT_DIRECTIONS = 'Fragment is a 3D assembly puzzle. Your goal is to fill the cube completely using all eight pieces. Each piece is a unique three-dimensional shape that spans multiple layers of the cube. Select a piece from the tray, choose which layer to place it on using the dots on the left, then tap a cell on the cube to place it. Pieces anchor at the cell you tap and extend through the cube according to their shape. If a piece does not fit where you tapped, try a different cell or a different layer. Use undo to take back your last placement. Use reset to start the puzzle over. There is no time limit. Your score is how many moves it took to fill the cube. Every puzzle is different. The satisfaction is in the solve.';

document.getElementById('help-btn').addEventListener('click', function () { openDirections(FRAGMENT_DIRECTIONS); });
document.getElementById('new-btn').addEventListener('click', loadNewPuzzle);
document.getElementById('frag-undo-btn').addEventListener('click', doUndo);
document.getElementById('frag-reset-btn').addEventListener('click', doReset);
document.getElementById('frag-new-puzzle-btn').addEventListener('click', loadNewPuzzle);
document.getElementById('share-btn').addEventListener('click', doShare);

// ── State ──────────────────────────────────────────────────────────────────
var puzzles       = [];
var currentPuzzle = null;
var activeLayer   = 0;
var selectedPiece = null;
var placedPieces  = {};
var board         = [];   // board[l][r][c] = pieceId | null
var undoStack     = [];   // [{pieceId, cells: [[l,r,c],...]}]
var moveCount     = 0;
var winState      = false;
var lastPuzzleId  = null;

// ── Size helpers ───────────────────────────────────────────────────────────
function getCellSize()       { return window.innerWidth < 600 ? 22 : 32; }
function getTrayCanvasSize() { return window.innerWidth < 600 ? 60 : 80; }

// ── Isometric projection ───────────────────────────────────────────────────
function isoX(l, r, c, S) { return (c - r) * S; }
function isoY(l, r, c, S) { return (c + r) * (S / 2) - l * S; }

function darkenHex(hex, pct) {
  var n = parseInt(hex.replace('#', ''), 16);
  var rv = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - pct)));
  var gv = Math.max(0, Math.round(((n >> 8)  & 0xff) * (1 - pct)));
  var bv = Math.max(0, Math.round((n & 0xff)         * (1 - pct)));
  return 'rgb(' + rv + ',' + gv + ',' + bv + ')';
}

function drawCube(ctx, px, py, S, topColor, rightColor, leftColor, edgeColor) {
  var t0x = px,      t0y = py;
  var t1x = px + S,  t1y = py + S / 2;
  var t2x = px,      t2y = py + S;
  var t3x = px - S,  t3y = py + S / 2;
  var b1x = px + S,  b1y = py + S / 2 + S;
  var b2x = px,      b2y = py + 2 * S;
  var b3x = px - S,  b3y = py + S / 2 + S;

  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(t0x,t0y); ctx.lineTo(t1x,t1y); ctx.lineTo(t2x,t2y); ctx.lineTo(t3x,t3y); ctx.closePath();
  ctx.fillStyle = topColor; ctx.fill(); ctx.strokeStyle = edgeColor; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(t1x,t1y); ctx.lineTo(b1x,b1y); ctx.lineTo(b2x,b2y); ctx.lineTo(t2x,t2y); ctx.closePath();
  ctx.fillStyle = rightColor; ctx.fill(); ctx.strokeStyle = edgeColor; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(t3x,t3y); ctx.lineTo(b3x,b3y); ctx.lineTo(b2x,b2y); ctx.lineTo(t2x,t2y); ctx.closePath();
  ctx.fillStyle = leftColor; ctx.fill(); ctx.strokeStyle = edgeColor; ctx.stroke();
}

// ── Board helpers ──────────────────────────────────────────────────────────
function initBoard() {
  board = [];
  for (var l = 0; l < 4; l++) {
    board[l] = [];
    for (var r = 0; r < 4; r++) { board[l][r] = [null, null, null, null]; }
  }
}

function getPieceById(id) {
  if (!currentPuzzle) return null;
  for (var i = 0; i < currentPuzzle.pieces.length; i++) {
    if (currentPuzzle.pieces[i].id === id) return currentPuzzle.pieces[i];
  }
  return null;
}

// ── Layer selector ─────────────────────────────────────────────────────────
function buildLayerDots() {
  var container = document.getElementById('frag-layers');
  container.innerHTML = '';
  for (var i = 3; i >= 0; i--) {
    var dot = document.createElement('div');
    dot.className = 'frag-layer-dot' + (i === activeLayer ? ' frag-dot-active' : '');
    dot.dataset.layer = i;
    dot.innerHTML = '<div class="frag-dot-circle"></div><span class="frag-dot-label">L' + (i + 1) + '</span>';
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
  if (currentPuzzle) buildTray();
  render();
}

// ── Pre-sorted grid cells ──────────────────────────────────────────────────
var GRID_CELLS = (function () {
  var cells = [];
  for (var l = 0; l < 4; l++)
    for (var r = 0; r < 4; r++)
      for (var c = 0; c < 4; c++)
        cells.push([l, r, c, l + r + c]);
  cells.sort(function (a, b) { return a[3] - b[3]; });
  return cells;
}());

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  var dpr = window.devicePixelRatio || 1;
  var W = canvas.width  / dpr;
  var H = canvas.height / dpr;
  ctx.clearRect(0, 0, W, H);
  renderBoard(W, H);
}

function renderBoard(W, H) {
  var S       = getCellSize();
  var originX = W / 2;
  var originY = H / 2 - S;

  for (var i = 0; i < GRID_CELLS.length; i++) {
    var cell = GRID_CELLS[i];
    var lv = cell[0], rv = cell[1], cv = cell[2];
    var px = originX + isoX(lv, rv, cv, S);
    var py = originY + isoY(lv, rv, cv, S);
    var pid = board[lv] && board[lv][rv] && board[lv][rv][cv];
    if (pid) {
      var piece = getPieceById(pid);
      drawCube(ctx, px, py, S, piece.color, darkenHex(piece.color, 0.15), darkenHex(piece.color, 0.30), 'rgba(26,26,26,0.45)');
    } else {
      var active   = (lv === activeLayer);
      var gFace = active ? 'rgba(232,220,200,0.60)' : 'rgba(232,220,200,0.30)';
      var gEdge = active ? 'rgba(26,26,26,0.35)'    : 'rgba(26,26,26,0.20)';
      drawCube(ctx, px, py, S, gFace, gFace, gFace, gEdge);
    }
  }
}

// ── Inverse iso → grid cell ────────────────────────────────────────────────
function getCellAtClick(pixX, pixY, W, H) {
  var S = getCellSize();
  var dx = pixX - W / 2;
  var dy = pixY - (H / 2 - S);
  var l  = activeLayer;
  // Forward: dx=(c-r)*S, dy=(c+r)*S/2 - l*S
  var cMinusR = dx / S;
  var cPlusR  = (dy + l * S) * 2 / S;
  var c = Math.round((cMinusR + cPlusR) / 2);
  var r = Math.round((cPlusR  - cMinusR) / 2);
  if (c < 0 || c > 3 || r < 0 || r > 3) return null;
  return [l, r, c];
}

// ── Click to place ─────────────────────────────────────────────────────────
canvas.addEventListener('click', function (e) {
  if (winState || !selectedPiece) return;
  var rect = canvas.getBoundingClientRect();
  var dpr  = window.devicePixelRatio || 1;
  var W = canvas.width  / dpr;
  var H = canvas.height / dpr;
  var cell = getCellAtClick(e.clientX - rect.left, e.clientY - rect.top, W, H);
  if (!cell) return;
  tryPlace(cell);
});

function tryPlace(clickCell) {
  var piece = getPieceById(selectedPiece);
  if (!piece) return;

  var anchor = piece.cells[0];
  var dl = clickCell[0] - anchor[0];
  var dr = clickCell[1] - anchor[1];
  var dc = clickCell[2] - anchor[2];

  var newCells = [];
  for (var i = 0; i < piece.cells.length; i++) {
    newCells.push([piece.cells[i][0] + dl, piece.cells[i][1] + dr, piece.cells[i][2] + dc]);
  }

  // Validate bounds and occupancy
  for (var j = 0; j < newCells.length; j++) {
    var lv = newCells[j][0], rv = newCells[j][1], cv = newCells[j][2];
    if (lv < 0 || lv > 3 || rv < 0 || rv > 3 || cv < 0 || cv > 3) { shakeCanvas(); return; }
    if (board[lv][rv][cv] !== null) { shakeCanvas(); return; }
  }

  // Write to board
  var pid = piece.id;
  for (var k = 0; k < newCells.length; k++) {
    board[newCells[k][0]][newCells[k][1]][newCells[k][2]] = pid;
  }

  placedPieces[pid] = true;
  undoStack.push({ pieceId: pid, cells: newCells });
  moveCount++;
  selectedPiece = null;

  updateTraySelection();
  updateMoveCounter();
  updateUndoButton();
  render();
  checkWin();
}

// ── Undo / Reset ───────────────────────────────────────────────────────────
function doUndo() {
  if (!undoStack.length) return;
  var entry = undoStack.pop();
  for (var i = 0; i < entry.cells.length; i++) {
    var c = entry.cells[i];
    board[c[0]][c[1]][c[2]] = null;
  }
  delete placedPieces[entry.pieceId];
  moveCount--;
  updateTraySelection();
  updateMoveCounter();
  updateUndoButton();
  render();
}

function doReset() {
  initBoard();
  placedPieces  = {};
  undoStack     = [];
  moveCount     = 0;
  selectedPiece = null;
  updateTraySelection();
  updateMoveCounter();
  updateUndoButton();
  render();
}

// ── HUD updates ────────────────────────────────────────────────────────────
function updateMoveCounter() {
  document.getElementById('frag-moves').textContent = moveCount;
}

function updateUndoButton() {
  document.getElementById('frag-undo-btn').disabled = (undoStack.length === 0);
}

function shakeCanvas() {
  cubeWrap.classList.add('frag-shake');
  setTimeout(function () { cubeWrap.classList.remove('frag-shake'); }, 350);
}

// ── Win detection ──────────────────────────────────────────────────────────
function checkWin() {
  if (Object.keys(placedPieces).length === 8) {
    winState = true;
    canvas.style.pointerEvents = 'none';
    document.getElementById('frag-layers').style.pointerEvents = 'none';
    playWinAnimation(showResults);
  }
}

// ── Win animation: 360° isometric rotation ─────────────────────────────────
function playWinAnimation(onComplete) {
  var duration = 2000;
  var startTime = null;
  var S   = getCellSize();
  var dpr = window.devicePixelRatio || 1;
  var W   = canvas.width  / dpr;
  var H   = canvas.height / dpr;

  function frame(ts) {
    if (!startTime) startTime = ts;
    var elapsed = Math.min(ts - startTime, duration);
    var theta   = (elapsed / duration) * Math.PI * 2;
    ctx.clearRect(0, 0, W, H);
    renderAtAngle(W, H, theta, S);
    if (elapsed < duration) { requestAnimationFrame(frame); } else { onComplete(); }
  }
  requestAnimationFrame(frame);
}

// Render all cells with iso projection rotated by theta around the vertical axis.
// The 3D grid centre (1.5,1.5,1.5) stays pinned to its normal screen position.
function renderAtAngle(W, H, theta, S) {
  var cosT = Math.cos(theta), sinT = Math.sin(theta);

  // Keep 3D centre at (W/2, H/2−S) — same as static rendering
  var originX = W / 2 - 3 * sinT * S;
  var originY = H / 2 + 0.5 * S - 3 * cosT * S / 2;

  // Build cells with rotated depth key and sort back→front
  var cells = [];
  for (var l = 0; l < 4; l++)
    for (var r = 0; r < 4; r++)
      for (var c = 0; c < 4; c++)
        cells.push([l, r, c, c * (cosT - sinT) + r * (sinT + cosT) + l]);
  cells.sort(function (a, b) { return a[3] - b[3]; });

  var pieceCache = {};   // memoize getPieceById within this frame
  for (var i = 0; i < cells.length; i++) {
    var lv = cells[i][0], rv = cells[i][1], cv = cells[i][2];
    var px = originX + (cv * (cosT + sinT) + rv * (sinT - cosT)) * S;
    var py = originY + (cv * (cosT - sinT) + rv * (sinT + cosT)) * S / 2 - lv * S;
    var pid = board[lv][rv][cv];
    if (pid) {
      if (!pieceCache[pid]) pieceCache[pid] = getPieceById(pid);
      var piece = pieceCache[pid];
      drawCube(ctx, px, py, S, piece.color, darkenHex(piece.color, 0.15), darkenHex(piece.color, 0.30), 'rgba(26,26,26,0.45)');
    } else {
      drawCube(ctx, px, py, S, 'rgba(232,220,200,0.30)', 'rgba(232,220,200,0.30)', 'rgba(232,220,200,0.30)', 'rgba(26,26,26,0.20)');
    }
  }
}

function showResults() {
  document.getElementById('frag-play-area').style.display = 'none';
  document.getElementById('frag-tray').style.display = 'none';
  document.getElementById('frag-results-subline').textContent =
    'Assembled in ' + moveCount + ' move' + (moveCount === 1 ? '' : 's');
  document.getElementById('frag-results').classList.add('frag-results-visible');
}

function doShare() {
  var text = 'Fragment — assembled the cube in ' + moveCount + ' move' + (moveCount === 1 ? '' : 's') +
             '. https://www.thebunnygame.com/fragment';
  shareText(text, 'Fragment — Bunny Game');
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

    var pc = document.createElement('canvas');
    pc.width  = Math.round(sz * dpr);
    pc.height = Math.round(sz * dpr);
    pc.style.cssText = 'display:block;width:' + sz + 'px;height:' + sz + 'px;';
    var pctx = pc.getContext('2d');
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderPieceTray(pctx, piece, sz);

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

function renderPieceTray(pctx, piece, sz) {
  pctx.clearRect(0, 0, sz, sz);
  var cells = piece.cells;
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < cells.length; i++) {
    var lv = cells[i][0], rv = cells[i][1], cv = cells[i][2];
    var px = cv - rv;
    var py = (cv + rv) / 2 - lv;
    minX = Math.min(minX, px - 1); maxX = Math.max(maxX, px + 1);
    minY = Math.min(minY, py);     maxY = Math.max(maxY, py + 2);
  }
  var S = Math.max(4, Math.floor(Math.min(sz * 0.82 / (maxX - minX), sz * 0.82 / (maxY - minY))));
  var originX = sz / 2 - ((minX + maxX) / 2) * S;
  var originY = sz / 2 - ((minY + maxY) / 2) * S;
  var sorted = cells.slice().sort(function (a, b) { return (a[0]+a[1]+a[2]) - (b[0]+b[1]+b[2]); });
  var topColor = piece.color, rightColor = darkenHex(piece.color, 0.15), leftColor = darkenHex(piece.color, 0.30);
  for (var j = 0; j < sorted.length; j++) {
    drawCube(pctx, originX + isoX(sorted[j][0], sorted[j][1], sorted[j][2], S),
                   originY + isoY(sorted[j][0], sorted[j][1], sorted[j][2], S),
                   S, topColor, rightColor, leftColor, 'rgba(26,26,26,0.45)');
  }
}

// ── Puzzle loading ─────────────────────────────────────────────────────────
function loadPuzzleData() {
  fetch('fragment-puzzles.json')
    .then(function (res) { return res.json(); })
    .then(function (data) { puzzles = data; loadNewPuzzle(); })
    .catch(function (err) { console.error('Fragment: failed to load puzzles:', err); render(); });
}

function loadNewPuzzle() {
  if (!puzzles.length) return;
  var candidates = puzzles.length > 1
    ? puzzles.filter(function (p) { return p.id !== lastPuzzleId; })
    : puzzles;
  currentPuzzle = candidates[Math.floor(Math.random() * candidates.length)];
  lastPuzzleId  = currentPuzzle.id;
  activeLayer   = 0;
  selectedPiece = null;
  placedPieces  = {};
  undoStack     = [];
  moveCount     = 0;
  winState      = false;

  // Restore play area if coming from results screen
  document.getElementById('frag-play-area').style.display = '';
  document.getElementById('frag-tray').style.display = '';
  document.getElementById('frag-results').classList.remove('frag-results-visible');
  canvas.style.pointerEvents = '';
  document.getElementById('frag-layers').style.pointerEvents = '';

  initBoard();
  buildLayerDots();
  buildTray();
  updateMoveCounter();
  updateUndoButton();
  render();
}

// ── Init ───────────────────────────────────────────────────────────────────
var resizeObserver = new ResizeObserver(function () { resizeCanvas(); });
resizeObserver.observe(cubeWrap);
window.addEventListener('resize', function () { resizeCanvas(); });
// iOS fires orientationchange before the layout has settled; short defer ensures correct dimensions
window.addEventListener('orientationchange', function () { setTimeout(resizeCanvas, 120); });

requestAnimationFrame(function () {
  resizeCanvas();
  loadPuzzleData();
});

openDirections(FRAGMENT_DIRECTIONS);
