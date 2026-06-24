(function () {
'use strict';

var DIRECTIONS_TEXT = 'Digits fill the board. Click 2 or more matching digits that touch side-by-side to clear them — tiles fall, columns collapse. When a cleared group touches the bottom row, its total is subtracted from 100. Reach exactly zero to win. Go below zero or run out of moves and you lose.';

var GRID_COLS  = 12;
var GRID_ROWS  = 20;
var SHARE_URL  = 'https://www.thebunnygame.com/race-to-zero';

var DIGIT_COLORS = {
  1: '#ef4444',
  2: '#f97316',
  3: '#f59e0b',
  4: '#84cc16',
  5: '#22c55e',
  6: '#14b8a6',
  7: '#3b82f6',
  8: '#6366f1',
  9: '#a855f7',
};

// Odd digits appear twice, even digits once
var WEIGHTED_POOL = [1,1,2,3,3,4,5,5,6,7,7,8,9,9];

function randomDigit() {
  return WEIGHTED_POOL[(Math.random() * WEIGHTED_POOL.length) | 0];
}

// ── Game logic ─────────────────────────────────────────────────────────────────

function RaceGame(cols, rows) {
  this.cols     = cols;
  this.rows     = rows;
  this.total    = 100;
  this.moves    = 0;
  this.gameOver = false;
  this.result   = null; // 'win', 'overshoot', 'stuck'
  this.grid     = this._randomGrid();
}

RaceGame.prototype._randomGrid = function () {
  return Array.from({ length: this.rows }, function () {
    return Array.from({ length: this.cols }, function () { return randomDigit(); }, this);
  }, this);
};

RaceGame.prototype.findGroup = function (row, col) {
  var digit   = this.grid[row][col];
  if (!digit) return [];
  var visited = new Uint8Array(this.rows * this.cols);
  var queue   = [row * this.cols + col];
  var group   = [];
  var head    = 0;
  while (head < queue.length) {
    var idx = queue[head++];
    if (visited[idx]) continue;
    visited[idx] = 1;
    var r = (idx / this.cols) | 0;
    var c = idx % this.cols;
    if (this.grid[r][c] !== digit) continue;
    group.push([r, c]);
    if (r > 0)             queue.push((r - 1) * this.cols + c);
    if (r < this.rows - 1) queue.push((r + 1) * this.cols + c);
    if (c > 0)             queue.push(r * this.cols + (c - 1));
    if (c < this.cols - 1) queue.push(r * this.cols + (c + 1));
  }
  return group;
};

RaceGame.prototype.click = function (row, col) {
  if (this.gameOver) return null;
  var group = this.findGroup(row, col);
  if (group.length < 2) return null;

  var digit         = this.grid[row][col];
  var rows          = this.rows;
  var touchesBottom = group.some(function (rc) { return rc[0] === rows - 1; });

  for (var i = 0; i < group.length; i++) this.grid[group[i][0]][group[i][1]] = null;
  this._applyGravity();
  this._compactColumns();
  this.moves++;

  if (touchesBottom) {
    this.total -= digit * group.length;
    if (this.total === 0) { this.gameOver = true; this.result = 'win';      return group; }
    if (this.total < 0)  { this.gameOver = true; this.result = 'overshoot'; return group; }
  }

  if (!this._hasValidMoves()) {
    this.gameOver = true;
    this.result   = 'stuck';
  }

  return group;
};

RaceGame.prototype._applyGravity = function () {
  for (var c = 0; c < this.cols; c++) {
    var live = [];
    for (var r = 0; r < this.rows; r++)
      if (this.grid[r][c] !== null) live.push(this.grid[r][c]);
    var empty = this.rows - live.length;
    for (var r2 = 0; r2 < this.rows; r2++)
      this.grid[r2][c] = r2 < empty ? null : live[r2 - empty];
  }
};

RaceGame.prototype._compactColumns = function () {
  var active = [];
  for (var c = 0; c < this.cols; c++)
    if (this.grid.some(function (row) { return row[c] !== null; })) active.push(c);
  if (active.length === this.cols) return;
  var newGrid = Array.from({ length: this.rows }, function () { return new Array(this.cols).fill(null); }, this);
  for (var newC = 0; newC < active.length; newC++) {
    var oldC = active[newC];
    for (var r = 0; r < this.rows; r++) newGrid[r][newC] = this.grid[r][oldC];
  }
  this.grid = newGrid;
};

RaceGame.prototype._hasValidMoves = function () {
  for (var r = 0; r < this.rows; r++)
    for (var c = 0; c < this.cols; c++) {
      var t = this.grid[r][c];
      if (!t) continue;
      if (c + 1 < this.cols && this.grid[r][c + 1] === t) return true;
      if (r + 1 < this.rows && this.grid[r + 1][c] === t) return true;
    }
  return false;
};

RaceGame.prototype.countRemaining = function () {
  var n = 0;
  for (var r = 0; r < this.rows; r++)
    for (var c = 0; c < this.cols; c++)
      if (this.grid[r][c]) n++;
  return n;
};

// ── Canvas renderer ────────────────────────────────────────────────────────────

var canvas = document.getElementById('game-canvas');
var ctx    = canvas.getContext('2d');
var game   = null;
var cellSize     = 0;
var hoveredGroup = null;
var lastHoverKey = null;
var flashCell    = null;

function roundRect(cx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  cx.beginPath();
  cx.moveTo(x + r, y);
  cx.lineTo(x + w - r, y);
  cx.quadraticCurveTo(x + w, y,     x + w, y + r);
  cx.lineTo(x + w, y + h - r);
  cx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  cx.lineTo(x + r, y + h);
  cx.quadraticCurveTo(x, y + h,     x, y + h - r);
  cx.lineTo(x, y + r);
  cx.quadraticCurveTo(x, y,         x + r, y);
  cx.closePath();
}

function computeCellSize(cols, rows) {
  var wrap   = document.getElementById('canvas-wrap');
  var availW = wrap.clientWidth  - 20;
  var availH = wrap.clientHeight - 24;
  return Math.max(4, Math.floor(Math.min(availW / cols, availH / rows)));
}

function resizeCanvas() {
  if (!game) return;
  cellSize      = computeCellSize(game.cols, game.rows);
  canvas.width  = cellSize * game.cols;
  canvas.height = cellSize * game.rows;
  render();
}

function render() {
  if (!game) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  var useRound = cellSize >= 5;
  var showText = cellSize >= 9;
  var useGrid  = cellSize >= 14;

  var hlSet = {};
  if (hoveredGroup && hoveredGroup.length >= 2)
    for (var hi = 0; hi < hoveredGroup.length; hi++)
      hlSet[hoveredGroup[hi][0] * game.cols + hoveredGroup[hi][1]] = true;

  var now      = Date.now();
  var flashIdx = -1;
  if (flashCell && now < flashCell.expiry) {
    flashIdx = flashCell.r * game.cols + flashCell.c;
  } else {
    flashCell = null;
  }

  for (var r = 0; r < game.rows; r++) {
    for (var c = 0; c < game.cols; c++) {
      var digit = game.grid[r][c];
      if (!digit) continue;

      var x    = c * cellSize;
      var y    = r * cellSize;
      var idx  = r * game.cols + c;
      var hl   = !!hlSet[idx];
      var fl   = idx === flashIdx;
      var btm  = r === game.rows - 1;
      var rad  = useRound ? Math.max(1, (cellSize * 0.15) | 0) : 0;

      // Background
      ctx.fillStyle = hl ? '#ffe066' : DIGIT_COLORS[digit];
      if (useRound) { roundRect(ctx, x + 1, y + 1, cellSize - 2, cellSize - 2, rad); ctx.fill(); }
      else ctx.fillRect(x, y, cellSize, cellSize);

      // Digit
      if (showText) {
        ctx.fillStyle    = hl ? '#1a1a1a' : 'rgba(255,255,255,0.95)';
        ctx.font         = 'bold ' + ((cellSize * 0.52) | 0) + 'px -apple-system,BlinkMacSystemFont,sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(digit), x + cellSize / 2, y + cellSize / 2);
      }

      // Flash
      if (fl) {
        ctx.fillStyle = 'rgba(255,50,50,0.55)';
        if (useRound) { roundRect(ctx, x + 1, y + 1, cellSize - 2, cellSize - 2, rad); ctx.fill(); }
        else ctx.fillRect(x, y, cellSize, cellSize);
      }

      // Bottom row accent: bright top stripe
      if (btm && !hl) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(x + 1, y + 1, cellSize - 2, Math.max(2, (cellSize * 0.12) | 0));
      }
    }
  }

  if (useGrid) {
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    for (var gr = 1; gr < game.rows; gr++) { ctx.moveTo(0, gr * cellSize); ctx.lineTo(canvas.width, gr * cellSize); }
    for (var gc = 1; gc < game.cols; gc++) { ctx.moveTo(gc * cellSize, 0); ctx.lineTo(gc * cellSize, canvas.height); }
    ctx.stroke();
  }
}

// ── Stats ──────────────────────────────────────────────────────────────────────

function updateStats() {
  if (!game) return;
  var totalEl = document.getElementById('val-total');
  if (totalEl) {
    totalEl.textContent = game.total;
    totalEl.style.color = game.total > 0 && game.total <= 20 ? '#22c55e'
                        : game.total < 0                     ? '#ef4444'
                        : '';
  }
  var movesEl = document.getElementById('val-moves');
  if (movesEl) movesEl.textContent = game.moves;
}

// ── Result modal ───────────────────────────────────────────────────────────────

function showGameOver() {
  var perfEl = document.getElementById('perf-banner');

  if (game.result === 'win') {
    perfEl.style.background = 'linear-gradient(135deg, #065f46, #10b981)';
    perfEl.textContent = '🎯 ZERO! 🎯';
    perfEl.classList.remove('hidden');
    document.getElementById('modal-title').textContent = 'You hit zero.';
    document.getElementById('modal-score').textContent = 'Exactly right.';
    document.getElementById('modal-sub').textContent   = game.moves + ' move' + (game.moves !== 1 ? 's' : '');
  } else if (game.result === 'overshoot') {
    perfEl.classList.add('hidden');
    document.getElementById('modal-title').textContent = 'Overshot.';
    document.getElementById('modal-score').textContent = Math.abs(game.total) + ' past zero';
    document.getElementById('modal-sub').textContent   = game.moves + ' move' + (game.moves !== 1 ? 's' : '');
  } else {
    perfEl.classList.add('hidden');
    var remaining = game.countRemaining();
    document.getElementById('modal-title').textContent = remaining === 0 ? 'Board cleared.' : 'No moves left.';
    document.getElementById('modal-score').textContent = game.total + ' away from zero';
    document.getElementById('modal-sub').textContent   = game.moves + ' move' + (game.moves !== 1 ? 's' : '');
  }

  document.getElementById('modal-breakdown').innerHTML = '';
  document.getElementById('overlay').classList.remove('hidden');
}

// ── Input ──────────────────────────────────────────────────────────────────────

function cellFromEvent(e) {
  var rect    = canvas.getBoundingClientRect();
  var clientX = e.clientX;
  var clientY = e.clientY;
  var col = ((clientX - rect.left) / cellSize) | 0;
  var row = ((clientY - rect.top)  / cellSize) | 0;
  if (col >= 0 && col < game.cols && row >= 0 && row < game.rows) return [row, col];
  return null;
}

canvas.addEventListener('click', function (e) {
  if (!game || game.gameOver) return;
  var cell = cellFromEvent(e);
  if (!cell) return;
  var row = cell[0], col = cell[1];
  if (!game.grid[row][col]) return;

  var group = game.findGroup(row, col);
  if (group.length < 2) {
    flashCell = { r: row, c: col, expiry: Date.now() + 380 };
    render();
    setTimeout(function () { flashCell = null; render(); }, 390);
    return;
  }
  game.click(row, col);
  hoveredGroup = null;
  lastHoverKey = null;
  updateStats();
  render();
  if (game.gameOver) setTimeout(showGameOver, 350);
});

canvas.addEventListener('mousemove', function (e) {
  if (!game || game.gameOver) return;
  var cell = cellFromEvent(e);
  var key  = cell ? (cell[0] + ',' + cell[1]) : null;
  if (key === lastHoverKey) return;
  lastHoverKey = key;
  if (!cell || !game.grid[cell[0]][cell[1]]) {
    if (hoveredGroup) { hoveredGroup = null; render(); }
    return;
  }
  var group = game.findGroup(cell[0], cell[1]);
  hoveredGroup = group.length >= 2 ? group : null;
  render();
});

canvas.addEventListener('mouseleave', function () {
  if (hoveredGroup) { hoveredGroup = null; lastHoverKey = null; render(); }
});

// ── Controls ───────────────────────────────────────────────────────────────────

document.getElementById('new-btn').addEventListener('click', function () { startGame(); });
document.getElementById('help-btn').addEventListener('click', function () { openDirections(DIRECTIONS_TEXT); });

document.getElementById('play-again-btn').addEventListener('click', function () {
  document.getElementById('overlay').classList.add('hidden');
  startGame();
});

document.getElementById('share-btn').addEventListener('click', function () {
  var text;
  if (game.result === 'win') {
    text = '🎯 I hit zero in Race to Zero in ' + game.moves + ' move' + (game.moves !== 1 ? 's' : '') + '. Perfect math. Can you do it? ' + SHARE_URL;
  } else if (game.result === 'overshoot') {
    text = 'I overshot Race to Zero by ' + Math.abs(game.total) + '. So close. Can you hit zero? ' + SHARE_URL;
  } else {
    text = 'Race to Zero: stuck at ' + game.total + ' away from zero in ' + game.moves + ' move' + (game.moves !== 1 ? 's' : '') + '. ' + SHARE_URL;
  }
  shareText(text, 'Race to Zero');
});

// ── Start ──────────────────────────────────────────────────────────────────────

var dirsSeen = false;

function startGame() {
  var wideCols = window.innerWidth >= 600 ? 25 : GRID_COLS;
  game         = new RaceGame(wideCols, GRID_ROWS);
  hoveredGroup = null;
  lastHoverKey = null;
  flashCell    = null;
  document.getElementById('overlay').classList.add('hidden');
  resizeCanvas();
  updateStats();
  if (!dirsSeen) { dirsSeen = true; openDirections(DIRECTIONS_TEXT); }
}

(function bootstrap() {
  var wrap = document.getElementById('canvas-wrap');
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      if (!game) { if (wrap.clientHeight > 50) startGame(); }
      else resizeCanvas();
    }).observe(wrap);
  } else {
    window.addEventListener('resize', function () { if (game) resizeCanvas(); });
    requestAnimationFrame(function () { requestAnimationFrame(startGame); });
  }
}());

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

}());
