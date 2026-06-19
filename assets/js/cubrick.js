// cubrick.js — Cubrick 8-level flat polyomino puzzle

var CUBRICK_DIRECTIONS = 'Cubrick is an 8-level puzzle. Each level is a flat board with seven pieces that must fill it completely. Select a piece from the tray — the highlighted square marks exactly where it will land when you tap the board. Rotate if needed, then tap a cell to place it. Fill the board to complete the level and move to the next. Watch the cube in the corner grow with every level you finish. Complete all eight levels to finish the game. Undo and reset only affect your current level. There is no time limit.';

// ── State ──────────────────────────────────────────────────────────────────
var PUZZLES         = null;
var currentLevel    = 0;       // 0-indexed
var pieces          = [];      // [{id, color, cells, placed}]
var board           = [];      // 8×8 array, null or piece id string
var selectedId      = null;
var moveCount       = 0;
var undoStack       = [];
var completedLevels = [];      // [{levelIdx, color}] — grows as levels finish
var totalMoves      = 0;
var revealsLeft     = 3;       // resets to 3 each level (including on Reset)
var levelCompleting = false;   // blocks interaction during transition

// ── Boot ───────────────────────────────────────────────────────────────────
fetch('cubrick-puzzles.json')
  .then(function (r) { return r.json(); })
  .then(function (data) {
    PUZZLES = data;
    initGame();
    openDirections(CUBRICK_DIRECTIONS);
  });

// ── Game init ──────────────────────────────────────────────────────────────
function initGame() {
  completedLevels = [];
  totalMoves      = 0;
  initLevel(0);
}

// ── Level init ─────────────────────────────────────────────────────────────
function initLevel(levelIdx) {
  currentLevel    = levelIdx;
  selectedId      = null;
  moveCount       = 0;
  undoStack       = [];
  revealsLeft     = 3;
  levelCompleting = false;

  board = [];
  for (var r = 0; r < 8; r++) {
    board.push([null, null, null, null, null, null, null, null]);
  }

  var levelData = PUZZLES[levelIdx];
  pieces = levelData.pieces.map(function (p) {
    return {
      id:          p.id,
      color:       p.color,
      cells:       normalizeCells(p.cells.map(function (c) { return [c[0], c[1]]; })),
      solvedCells: p.cells.map(function (c) { return [c[0], c[1]]; }), // absolute solved position
      placed:      false,
    };
  });

  document.getElementById('cub-level').textContent = levelIdx + 1;
  document.getElementById('cub-moves').textContent = '0';

  document.getElementById('cub-level-complete').classList.add('hidden');
  document.getElementById('cub-win').classList.add('hidden');

  buildGrid();
  buildTray();
  refreshProgressCube();
  updateHudButtons();
}

// ── Level completion ────────────────────────────────────────────────────────
function checkLevelComplete() {
  if (!pieces.every(function (p) { return p.placed; })) return;

  levelCompleting = true;

  // Use piece A's color as this level's slab color
  var primaryColor = pieces.find(function (p) { return p.id === 'A'; }).color;
  completedLevels.push({ levelIdx: currentLevel, color: primaryColor });
  totalMoves += moveCount;
  refreshProgressCube();

  setTimeout(function () {
    levelCompleting = false;
    if (currentLevel === 7) {
      showWin();
    } else {
      showLevelComplete();
    }
  }, 500);
}

function showLevelComplete() {
  document.getElementById('cub-lc-num').textContent = currentLevel + 1;
  var m = moveCount;
  document.getElementById('cub-lc-moves').textContent = m + ' move' + (m === 1 ? '' : 's');
  document.getElementById('cub-level-complete').classList.remove('hidden');
}

function showWin() {
  var m = totalMoves;
  document.getElementById('cub-win-moves').textContent =
    'All 8 levels · ' + m + ' total move' + (m === 1 ? '' : 's');

  var winCanvas = document.getElementById('cub-win-cube');
  if (winCanvas) drawCubeOnCanvas(winCanvas, 120, completedLevels);

  document.getElementById('cub-win').classList.remove('hidden');
}

// ── Grid ───────────────────────────────────────────────────────────────────
function buildGrid() {
  var grid = document.getElementById('cub-grid');
  grid.innerHTML = '';
  for (var i = 0; i < 64; i++) {
    var cell = document.createElement('div');
    cell.className = 'cub-cell';
    cell.dataset.row = Math.floor(i / 8);
    cell.dataset.col = i % 8;
    cell.addEventListener('click', onCellTap);
    grid.appendChild(cell);
  }
}

// ── Cell tap / placement ────────────────────────────────────────────────────
function onCellTap(e) {
  if (!selectedId || levelCompleting) return;
  var piece = getPiece(selectedId);
  if (!piece || piece.placed) return;

  var targetRow = parseInt(e.currentTarget.dataset.row, 10);
  var targetCol = parseInt(e.currentTarget.dataset.col, 10);

  var anchor = orientationSquare(piece.cells);
  var dr = targetRow - anchor[0];
  var dc = targetCol - anchor[1];

  var placed = piece.cells.map(function (c) { return [c[0] + dr, c[1] + dc]; });

  var valid = placed.every(function (c) {
    return c[0] >= 0 && c[0] < 8 && c[1] >= 0 && c[1] < 8 && board[c[0]][c[1]] === null;
  });

  if (!valid) {
    shakeBoard();
    return;
  }

  placed.forEach(function (c) { board[c[0]][c[1]] = piece.id; });
  piece.placed = true;
  piece.cells  = placed;
  moveCount++;
  undoStack.push({ pieceId: piece.id, cells: placed });
  selectedId = null;

  document.getElementById('cub-moves').textContent = moveCount;
  renderBoard();
  refreshTrayItem(piece.id);
  updateHudButtons();
  checkLevelComplete();
}

// ── Board rendering ─────────────────────────────────────────────────────────
function renderBoard() {
  var cellEls = document.getElementById('cub-grid').querySelectorAll('.cub-cell');
  cellEls.forEach(function (el) {
    var r   = parseInt(el.dataset.row, 10);
    var c   = parseInt(el.dataset.col, 10);
    var pid = board[r][c];
    if (pid) {
      var p = getPiece(pid);
      el.style.background = p.color;
      el.style.border     = '1px solid rgba(26,26,26,0.25)';
      el.style.boxSizing  = 'border-box';
    } else {
      el.style.background = '';
      el.style.border     = '';
      el.style.boxSizing  = '';
    }
  });
}

// ── Shake animation ─────────────────────────────────────────────────────────
function shakeBoard() {
  var area = document.getElementById('cub-board-area');
  area.classList.remove('cub-shake');
  void area.offsetWidth;
  area.classList.add('cub-shake');
  area.addEventListener('animationend', function handler() {
    area.classList.remove('cub-shake');
    area.removeEventListener('animationend', handler);
  });
}

// ── Tray ───────────────────────────────────────────────────────────────────
function buildTray() {
  var tray = document.getElementById('cub-tray');
  tray.innerHTML = '';
  pieces.forEach(function (p) { tray.appendChild(makeTrayItem(p)); });
}

function makeTrayItem(p) {
  var item = document.createElement('div');
  item.className = 'cub-tray-item' +
    (p.placed          ? ' cub-placed'   : '') +
    (p.id === selectedId ? ' cub-selected' : '');
  item.dataset.pieceId = p.id;

  item.appendChild(makePieceCanvas(p));

  var check = document.createElement('div');
  check.className = 'cub-tray-check';
  check.textContent = '✓';
  item.appendChild(check);

  if (!p.placed) {
    item.addEventListener('click', function () { onTrayTap(p.id); });
  }
  return item;
}

// ── Piece canvas for tray ───────────────────────────────────────────────────
var CELL_PX    = 10;
var CELL_GAP   = 1;
var CANVAS_PAD = 4;

function makePieceCanvas(p) {
  var drawCells = p.placed
    ? normalizeCells(p.cells.map(function (c) { return [c[0], c[1]]; }))
    : p.cells;

  var rows = drawCells.map(function (c) { return c[0]; });
  var cols = drawCells.map(function (c) { return c[1]; });
  var maxR = Math.max.apply(null, rows);
  var maxC = Math.max.apply(null, cols);

  var step   = CELL_PX + CELL_GAP;
  var width  = CANVAS_PAD * 2 + (maxC + 1) * step - CELL_GAP;
  var height = CANVAS_PAD * 2 + (maxR + 1) * step - CELL_GAP;

  var canvas = document.createElement('canvas');
  var dpr    = window.devicePixelRatio || 1;
  canvas.width  = Math.round(width  * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width  = width  + 'px';
  canvas.style.height = height + 'px';

  var ctx    = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  var anchor = orientationSquare(drawCells);

  drawCells.forEach(function (cell) {
    var r = cell[0], c = cell[1];
    var x = CANVAS_PAD + c * step;
    var y = CANVAS_PAD + r * step;
    ctx.fillStyle = p.color;
    ctx.fillRect(x, y, CELL_PX, CELL_PX);

    if (r === anchor[0] && c === anchor[1]) {
      var dotX = x + CELL_PX / 2, dotY = y + CELL_PX / 2, dotR = CELL_PX * 0.24;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(26,26,26,0.28)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  });

  return canvas;
}

// ── Orientation square: topmost then leftmost ───────────────────────────────
function orientationSquare(cells) {
  var best = cells[0];
  for (var i = 1; i < cells.length; i++) {
    var c = cells[i];
    if (c[0] < best[0] || (c[0] === best[0] && c[1] < best[1])) best = c;
  }
  return best;
}

// ── Rotation helpers ───────────────────────────────────────────────────────
function rotateCells(cells) {
  var maxRow = Math.max.apply(null, cells.map(function (c) { return c[0]; }));
  return cells.map(function (c) { return [c[1], maxRow - c[0]]; });
}

function normalizeCells(cells) {
  var minR = Math.min.apply(null, cells.map(function (c) { return c[0]; }));
  var minC = Math.min.apply(null, cells.map(function (c) { return c[1]; }));
  return cells.map(function (c) { return [c[0] - minR, c[1] - minC]; });
}

// ── Tray interaction ───────────────────────────────────────────────────────
function onTrayTap(id) {
  var prev = selectedId;
  selectedId = (selectedId === id) ? null : id;
  if (prev && prev !== id) refreshTrayItem(prev);
  refreshTrayItem(id);
  updateHudButtons();
}

function refreshTrayItem(id) {
  var p    = getPiece(id);
  var tray = document.getElementById('cub-tray');
  var old  = tray.querySelector('[data-piece-id="' + id + '"]');
  if (old) tray.replaceChild(makeTrayItem(p), old);
}

function getPiece(id) {
  for (var i = 0; i < pieces.length; i++) {
    if (pieces[i].id === id) return pieces[i];
  }
  return null;
}

// ── Rotate button ──────────────────────────────────────────────────────────
document.getElementById('cub-rotate-btn').addEventListener('click', function () {
  if (!selectedId) return;
  var p = getPiece(selectedId);
  if (!p || p.placed) return;
  p.cells = normalizeCells(rotateCells(p.cells));
  refreshTrayItem(p.id);
});

// ── Undo button ────────────────────────────────────────────────────────────
document.getElementById('cub-undo-btn').addEventListener('click', function () {
  if (undoStack.length === 0) return;
  var entry = undoStack.pop();
  var p = getPiece(entry.pieceId);

  entry.cells.forEach(function (c) { board[c[0]][c[1]] = null; });
  p.placed = false;
  p.cells  = normalizeCells(entry.cells);

  moveCount = Math.max(0, moveCount - 1);
  document.getElementById('cub-moves').textContent = moveCount;

  renderBoard();
  refreshTrayItem(p.id);
  updateHudButtons();
});

// ── Reset / New Game / Next Level ──────────────────────────────────────────
document.getElementById('cub-reset-btn').addEventListener('click', function () {
  initLevel(currentLevel);
});

// ── Reveal button ──────────────────────────────────────────────────────────
document.getElementById('cub-reveal-btn').addEventListener('click', doReveal);

function doReveal() {
  if (revealsLeft <= 0 || levelCompleting) return;
  var unplaced = pieces.filter(function (p) { return !p.placed; });
  if (unplaced.length === 0) return;

  // Pick a random unplaced piece
  var p = unplaced[Math.floor(Math.random() * unplaced.length)];

  // Place at the original solved absolute position from the puzzle JSON
  p.solvedCells.forEach(function (c) { board[c[0]][c[1]] = p.id; });
  p.placed = true;
  p.cells  = p.solvedCells;  // update for tray thumbnail

  moveCount++;
  revealsLeft--;
  // Do NOT push to undoStack — revealed pieces cannot be undone

  if (selectedId === p.id) selectedId = null;

  document.getElementById('cub-moves').textContent = moveCount;
  renderBoard();
  refreshTrayItem(p.id);
  updateHudButtons();
  checkLevelComplete();
}

document.getElementById('cub-next-btn').addEventListener('click', function () {
  document.getElementById('cub-level-complete').classList.add('hidden');
  initLevel(currentLevel + 1);
});

document.getElementById('cub-play-again-btn').addEventListener('click', function () {
  document.getElementById('cub-win').classList.add('hidden');
  initGame();
});

document.getElementById('new-btn').addEventListener('click', function () {
  initGame();
});

document.getElementById('help-btn').addEventListener('click', function () {
  openDirections(CUBRICK_DIRECTIONS);
});

// ── Share button ───────────────────────────────────────────────────────────
document.getElementById('cub-share-btn').addEventListener('click', function () {
  var text = 'I just completed Cubrick in ' + totalMoves +
    ' moves across all 8 levels! Can you fill the cube? thebunnygame.com/cubrick';
  shareText(text, 'Cubrick — Bunny Game');
});

// ── HUD button state ───────────────────────────────────────────────────────
function updateHudButtons() {
  document.getElementById('cub-rotate-btn').disabled = !selectedId;
  document.getElementById('cub-undo-btn').disabled   = undoStack.length === 0;

  var revealBtn  = document.getElementById('cub-reveal-btn');
  var hasUnplaced = pieces.some(function (p) { return !p.placed; });
  revealBtn.disabled   = revealsLeft <= 0 || !hasUnplaced;
  revealBtn.textContent = 'Reveal (' + revealsLeft + ')';
}

// ── Progress cube widget ────────────────────────────────────────────────────
function refreshProgressCube() {
  var canvas = document.getElementById('cub-progress-cube');
  drawCubeOnCanvas(canvas, 60, completedLevels);
  var label = document.getElementById('cub-progress-label');
  if (label) label.textContent = completedLevels.length + ' / 8';
}

// ── Color helpers ──────────────────────────────────────────────────────────
function darkenColor(hex, factor) {
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return 'rgb(' +
    Math.min(255, Math.round(r * factor)) + ',' +
    Math.min(255, Math.round(g * factor)) + ',' +
    Math.min(255, Math.round(b * factor)) + ')';
}

// ── Isometric cube canvas renderer ─────────────────────────────────────────
// completedArr: [{levelIdx (0-7), color}] — levelIdx 0=bottom slab, 7=top slab
function drawCubeOnCanvas(canvas, logicalSize, completedArr) {
  var dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(logicalSize * dpr);
  canvas.height = Math.round(logicalSize * dpr);
  canvas.style.width  = logicalSize + 'px';
  canvas.style.height = logicalSize + 'px';

  var ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, logicalSize, logicalSize);

  var S  = logicalSize;
  var hw = Math.round(S * 0.43);   // half-width of top face
  var hh = Math.round(hw * 0.50);  // half-height (2:1 isometric)
  var sh = Math.round(S * 0.43);   // side face height
  var cx = Math.round(S * 0.50);
  var ty = Math.round(S * 0.04);

  // Key vertex coords
  // Left face: L → BL (left edge), M → BC (right edge), both purely vertical
  // Right face: M → BC (left edge), R → BR (right edge), both purely vertical

  // For a slab at level i (0=bottom, 7=top):
  // fraction from TOP of side face: ft = (7-i)/8, fb = (8-i)/8
  function slabFt(i) { return (7 - i) / 8; }
  function slabFb(i) { return (8 - i) / 8; }

  // Point on left edge of left face at fraction t from top
  function leftFaceL(t) { return [cx - hw, ty + hh + t * sh]; }
  // Point on right edge of left face (= left edge of right face) at fraction t
  function leftFaceR(t) { return [cx,      ty + 2 * hh + t * sh]; }
  // Point on right edge of right face at fraction t
  function rightFaceR(t) { return [cx + hw, ty + hh + t * sh]; }

  // ── 1. Draw faint slab dividers (ghost lines for empty slots) ────────────
  ctx.strokeStyle = 'rgba(26,26,26,0.10)';
  ctx.lineWidth   = 0.75;
  for (var k = 1; k < 8; k++) {
    var fd = k / 8;
    var ll = leftFaceL(fd), lr = leftFaceR(fd), rr = rightFaceR(fd);
    ctx.beginPath();
    ctx.moveTo(ll[0], ll[1]); ctx.lineTo(lr[0], lr[1]);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lr[0], lr[1]); ctx.lineTo(rr[0], rr[1]);
    ctx.stroke();
  }

  // ── 2. Fill completed slabs ───────────────────────────────────────────────
  completedArr.forEach(function (entry) {
    var i  = entry.levelIdx;
    var ft = slabFt(i);
    var fb = slabFb(i);
    var ll_t = leftFaceL(ft), lr_t = leftFaceR(ft);
    var ll_b = leftFaceL(fb), lr_b = leftFaceR(fb);
    var rr_t = rightFaceR(ft), rr_b = rightFaceR(fb);

    // Left face slab (darker)
    ctx.fillStyle = darkenColor(entry.color, 0.78);
    ctx.beginPath();
    ctx.moveTo(ll_t[0], ll_t[1]);
    ctx.lineTo(lr_t[0], lr_t[1]);
    ctx.lineTo(lr_b[0], lr_b[1]);
    ctx.lineTo(ll_b[0], ll_b[1]);
    ctx.closePath();
    ctx.fill();

    // Right face slab (full color)
    ctx.fillStyle = entry.color;
    ctx.beginPath();
    ctx.moveTo(lr_t[0], lr_t[1]);
    ctx.lineTo(rr_t[0], rr_t[1]);
    ctx.lineTo(rr_b[0], rr_b[1]);
    ctx.lineTo(lr_b[0], lr_b[1]);
    ctx.closePath();
    ctx.fill();
  });

  // ── 3. Top face fill (if top slab / level 8 complete) ────────────────────
  var topEntry = null;
  for (var j = 0; j < completedArr.length; j++) {
    if (completedArr[j].levelIdx === 7) { topEntry = completedArr[j]; break; }
  }
  if (topEntry) {
    ctx.fillStyle = darkenColor(topEntry.color, 1.25);
    ctx.beginPath();
    ctx.moveTo(cx,      ty);
    ctx.lineTo(cx + hw, ty + hh);
    ctx.lineTo(cx,      ty + 2 * hh);
    ctx.lineTo(cx - hw, ty + hh);
    ctx.closePath();
    ctx.fill();
  }

  // ── 4. Wireframe outline (drawn last, on top of fills) ───────────────────
  ctx.strokeStyle = 'rgba(26,26,26,0.55)';
  ctx.lineWidth   = logicalSize > 80 ? 1.5 : 1.25;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  // Top face
  ctx.beginPath();
  ctx.moveTo(cx, ty);
  ctx.lineTo(cx + hw, ty + hh);
  ctx.lineTo(cx,      ty + 2 * hh);
  ctx.lineTo(cx - hw, ty + hh);
  ctx.closePath();
  ctx.stroke();

  // Left face
  ctx.beginPath();
  ctx.moveTo(cx - hw, ty + hh);
  ctx.lineTo(cx - hw, ty + hh + sh);
  ctx.lineTo(cx,      ty + 2 * hh + sh);
  ctx.lineTo(cx,      ty + 2 * hh);
  ctx.closePath();
  ctx.stroke();

  // Right face
  ctx.beginPath();
  ctx.moveTo(cx,      ty + 2 * hh);
  ctx.lineTo(cx,      ty + 2 * hh + sh);
  ctx.lineTo(cx + hw, ty + hh + sh);
  ctx.lineTo(cx + hw, ty + hh);
  ctx.closePath();
  ctx.stroke();
}
