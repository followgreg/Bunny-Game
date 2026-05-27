// classic.js — Classic Mode

const DIRECTIONS_TEXT = 'Five characters. One grid. Click any two or more matching characters that touch side-by-side to clear them. Tiles fall. Columns collapse. Clear everything and you win. Leave any behind and that\'s your score. Lower is better. Zero is a legend.';

const GRID_COLS = 12;
const GRID_ROWS = 20;

const TILE_TYPES  = ['blue-bunny', 'red-bunny', 'mushroom', 'cabbage', 'carrot'];
const TILE_COLORS = {
  'blue-bunny': '#3b82f6',
  'red-bunny':  '#ef4444',
  'mushroom':   '#a855f7',
  'cabbage':    '#22c55e',
  'carrot':     '#f97316',
};
const TILE_LABELS = {
  'blue-bunny': 'Blue Bunny',
  'red-bunny':  'Red Bunny',
  'mushroom':   'Mushroom',
  'cabbage':    'Cabbage',
  'carrot':     'Carrot',
};

// =============================================================================
// IMAGE LOADING
// =============================================================================
const tileImages = {};
function loadImages() {
  for (const type of TILE_TYPES) {
    const img = new Image();
    img.onload  = () => render();
    img.onerror = () => {};
    img.src = `assets/icons/${type}.svg`;
    tileImages[type] = img;
  }
}

// =============================================================================
// GAME LOGIC — Classic
// =============================================================================
class BunnyGame {
  constructor(cols, rows) {
    this.cols     = cols;
    this.rows     = rows;
    this.moves    = 0;
    this.cleared  = 0;
    this.gameOver = false;
    this.history  = [];
    this.grid     = this._randomGrid();
  }

  _randomGrid() {
    return Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () =>
        TILE_TYPES[(Math.random() * TILE_TYPES.length) | 0]
      )
    );
  }

  findGroup(row, col) {
    const type = this.grid[row][col];
    if (!type) return [];
    const visited = new Uint8Array(this.rows * this.cols);
    const queue   = [row * this.cols + col];
    const group   = [];
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      if (visited[idx]) continue;
      visited[idx] = 1;
      const r = (idx / this.cols) | 0;
      const c = idx % this.cols;
      if (this.grid[r][c] !== type) continue;
      group.push([r, c]);
      if (r > 0)             queue.push((r - 1) * this.cols + c);
      if (r < this.rows - 1) queue.push((r + 1) * this.cols + c);
      if (c > 0)             queue.push(r * this.cols + (c - 1));
      if (c < this.cols - 1) queue.push(r * this.cols + (c + 1));
    }
    return group;
  }

  click(row, col) {
    if (this.gameOver) return null;
    const group = this.findGroup(row, col);
    if (group.length < 2) return null;
    this.history.push({ grid: this.grid.map(r => r.slice()), moves: this.moves, cleared: this.cleared });
    if (this.history.length > 50) this.history.shift();
    for (const [r, c] of group) this.grid[r][c] = null;
    this._applyGravity();
    this._compactColumns();
    this.moves++;
    this.cleared += group.length;
    if (!this._hasValidMoves()) this.gameOver = true;
    return group;
  }

  _applyGravity() {
    for (let c = 0; c < this.cols; c++) {
      const live = [];
      for (let r = 0; r < this.rows; r++)
        if (this.grid[r][c] !== null) live.push(this.grid[r][c]);
      const emptyRows = this.rows - live.length;
      for (let r = 0; r < this.rows; r++)
        this.grid[r][c] = r < emptyRows ? null : live[r - emptyRows];
    }
  }

  _compactColumns() {
    const active = [];
    for (let c = 0; c < this.cols; c++)
      if (this.grid.some(row => row[c] !== null)) active.push(c);
    if (active.length === this.cols) return;
    const newGrid = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));
    for (let newC = 0; newC < active.length; newC++) {
      const oldC = active[newC];
      for (let r = 0; r < this.rows; r++) newGrid[r][newC] = this.grid[r][oldC];
    }
    this.grid = newGrid;
  }

  _hasValidMoves() {
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const t = this.grid[r][c];
        if (!t) continue;
        if (c + 1 < this.cols && this.grid[r][c + 1] === t) return true;
        if (r + 1 < this.rows && this.grid[r + 1][c] === t) return true;
      }
    return false;
  }

  countRemaining() {
    let n = 0;
    for (const row of this.grid) for (const cell of row) if (cell) n++;
    return n;
  }

  countByType() {
    const counts = Object.fromEntries(TILE_TYPES.map(t => [t, 0]));
    for (const row of this.grid)
      for (const cell of row)
        if (cell && counts[cell] !== undefined) counts[cell]++;
    return counts;
  }

  undo() {
    if (!this.history.length) return false;
    const snap    = this.history.pop();
    this.grid     = snap.grid;
    this.moves    = snap.moves;
    this.cleared  = snap.cleared;
    this.gameOver = false;
    return true;
  }
}

// =============================================================================
// CANVAS RENDERER
// =============================================================================
const canvas  = document.getElementById('game-canvas');
const ctx     = canvas.getContext('2d');
let game      = null;
let cellSize  = 0;
let hoveredGroup = null;
let lastHoverKey = null;
let flashCell    = null;

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y,         x + r, y);
  ctx.closePath();
}

function computeCellSize(cols, rows) {
  const wrap   = document.getElementById('canvas-wrap');
  const availW = wrap.clientWidth  - 20;
  const availH = wrap.clientHeight - 24;
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
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const now      = Date.now();
  const useRound  = cellSize >= 5;
  const useImages = cellSize >= 10;
  const useGrid   = cellSize >= 14;

  const hlSet = new Set();
  if (hoveredGroup && hoveredGroup.length >= 2)
    for (const [r, c] of hoveredGroup) hlSet.add(r * game.cols + c);

  let flashIdx = -1;
  if (flashCell && now < flashCell.expiry) {
    flashIdx = flashCell.r * game.cols + flashCell.c;
  } else {
    flashCell = null;
  }

  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      const type = game.grid[r][c];
      const x    = c * cellSize;
      const y    = r * cellSize;
      if (!type) continue;

      const idx         = r * game.cols + c;
      const highlighted = hlSet.has(idx);
      const flashing    = idx === flashIdx;

      ctx.shadowBlur  = 0;
      ctx.shadowColor = 'transparent';
      ctx.fillStyle   = highlighted ? '#ffe066' : '#ffffcc';

      const rad = useRound ? Math.max(1, (cellSize * 0.18) | 0) : 0;
      if (useRound) { roundRect(ctx, x + 1, y + 1, cellSize - 2, cellSize - 2, rad); ctx.fill(); }
      else ctx.fillRect(x, y, cellSize, cellSize);

      if (useImages) {
        const img = tileImages[type];
        if (img && img.naturalWidth > 0)
          ctx.drawImage(img, x + 1, y + 1, cellSize - 2, cellSize - 2);
      }

      if (flashing) {
        ctx.fillStyle = 'rgba(255,50,50,0.55)';
        if (useRound) { roundRect(ctx, x + 1, y + 1, cellSize - 2, cellSize - 2, rad); ctx.fill(); }
        else ctx.fillRect(x, y, cellSize, cellSize);
      }

      if (highlighted) {
        ctx.strokeStyle = 'rgba(255,255,180,0.8)';
        ctx.lineWidth   = Math.max(1, (cellSize * 0.08) | 0);
        if (useRound) { roundRect(ctx, x + 1, y + 1, cellSize - 2, cellSize - 2, rad); ctx.stroke(); }
        else ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
      }
    }
  }

  if (useGrid) {
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    for (let r = 1; r < game.rows; r++) { ctx.moveTo(0, r * cellSize); ctx.lineTo(canvas.width, r * cellSize); }
    for (let c = 1; c < game.cols; c++) { ctx.moveTo(c * cellSize, 0); ctx.lineTo(c * cellSize, canvas.height); }
    ctx.stroke();
  }
}

// =============================================================================
// STATS
// =============================================================================
function updateStats() {
  if (!game) return;
  document.getElementById('val-remaining').textContent = game.countRemaining();
  document.getElementById('val-cleared').textContent   = game.cleared;
  document.getElementById('val-moves').textContent     = game.moves;
}

// =============================================================================
// RESULT MODAL
// =============================================================================
function showGameOver() {
  const remaining = game.countRemaining();
  const counts    = game.countByType();
  const perfEl    = document.getElementById('perf-banner');

  if (remaining === 0) {
    perfEl.style.background = 'linear-gradient(135deg, #065f46, #10b981)';
    perfEl.textContent = '🎉 PERFECT CLEAR! 🎉';
    perfEl.classList.remove('hidden');
  } else {
    perfEl.classList.add('hidden');
  }

  document.getElementById('modal-title').textContent =
    'Game Over';
  document.getElementById('modal-score').textContent =
    `Score: ${remaining} tile${remaining !== 1 ? 's' : ''} remaining`;
  document.getElementById('modal-sub').textContent =
    `${game.moves} move${game.moves !== 1 ? 's' : ''} · ${game.cleared} tiles cleared`;

  let html = '';
  for (const type of TILE_TYPES) {
    if (counts[type] <= 0) continue;
    const img  = tileImages[type];
    const icon = (img && img.naturalWidth > 0)
      ? `<img src="assets/icons/${type}.svg" alt="${TILE_LABELS[type]}">`
      : `<div class="bd-swatch" style="background:${TILE_COLORS[type]}"></div>`;
    html += `<div class="bd-row">${icon}<span>${TILE_LABELS[type]}: <strong>${counts[type]}</strong> remaining</span></div>`;
  }
  if (!html) html = '<p class="perfect-msg">All tiles cleared!</p>';
  document.getElementById('modal-breakdown').innerHTML = html;
  document.getElementById('overlay').classList.remove('hidden');
}

// =============================================================================
// INPUT HANDLERS
// =============================================================================
function cellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const col  = ((e.clientX - rect.left) / cellSize) | 0;
  const row  = ((e.clientY - rect.top)  / cellSize) | 0;
  if (col >= 0 && col < game.cols && row >= 0 && row < game.rows) return [row, col];
  return null;
}

canvas.addEventListener('click', e => {
  if (!game || game.gameOver) return;
  const cell = cellFromEvent(e);
  if (!cell) return;
  const [row, col] = cell;
  if (!game.grid[row][col]) return;

  const group = game.findGroup(row, col);
  if (group.length < 2) {
    flashCell = { r: row, c: col, expiry: Date.now() + 380 };
    render();
    setTimeout(() => { flashCell = null; render(); }, 390);
    return;
  }
  game.click(row, col);
  hoveredGroup = null;
  lastHoverKey = null;
  updateStats();
  render();
  if (game.gameOver) setTimeout(() => showGameOver(), 350);
});

canvas.addEventListener('mousemove', e => {
  if (!game || game.gameOver) return;
  const cell = cellFromEvent(e);
  const key  = cell ? `${cell[0]},${cell[1]}` : null;
  if (key === lastHoverKey) return;
  lastHoverKey = key;
  if (!cell || !game.grid[cell[0]][cell[1]]) {
    if (hoveredGroup) { hoveredGroup = null; render(); }
    return;
  }
  const group  = game.findGroup(cell[0], cell[1]);
  hoveredGroup = group.length >= 2 ? group : null;
  render();
});

canvas.addEventListener('mouseleave', () => {
  if (hoveredGroup) { hoveredGroup = null; lastHoverKey = null; render(); }
});

// =============================================================================
// CONTROLS
// =============================================================================
document.getElementById('new-btn').addEventListener('click', () => startGame());
document.getElementById('help-btn').addEventListener('click', () => openDirections(DIRECTIONS_TEXT));

document.getElementById('play-again-btn').addEventListener('click', () => {
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('play-again-btn').textContent = 'Play Again';
  startGame();
});

document.getElementById('share-btn').addEventListener('click', () => {
  const remaining = game ? game.countRemaining() : 0;
  const moves     = game ? game.moves : 0;
  const text = remaining === 0
    ? `🎉 PERFECT CLEAR! I cleared every tile in Bunny Game in ${moves} moves. Can you beat it? https://www.thebunnygame.com`
    : `I finished Bunny Game with ${remaining} tile${remaining !== 1 ? 's' : ''} remaining in ${moves} moves. Can you do better? https://www.thebunnygame.com`;
  shareText(text, 'Bunny Game');
});

// =============================================================================
// START GAME & BOOTSTRAP
// =============================================================================
let dirsSeen = false;

function startGame() {
  const wideCols = window.innerWidth >= 600 ? 25 : GRID_COLS;
  game         = new BunnyGame(wideCols, GRID_ROWS);
  hoveredGroup = null;
  lastHoverKey = null;
  flashCell    = null;
  document.getElementById('overlay').classList.add('hidden');
  resizeCanvas();
  updateStats();
  if (!dirsSeen) { dirsSeen = true; openDirections(DIRECTIONS_TEXT); }
}

loadImages();

(function bootstrap() {
  const wrap = document.getElementById('canvas-wrap');
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      if (!game) { if (wrap.clientHeight > 50) startGame(); }
      else resizeCanvas();
    }).observe(wrap);
  } else {
    window.addEventListener('resize', function () { if (game) resizeCanvas(); });
    requestAnimationFrame(function () { requestAnimationFrame(startGame); });
  }
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
