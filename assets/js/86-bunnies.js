// 86-bunnies.js — 86 Bunnies Mode

const DIRECTIONS_TEXT = 'The blue bunnies must go. All of them. But you can\'t click them directly — clear everything else strategically until the board collapses and brings bunnies together. Once two or more blue bunnies are touching, they\'re yours. Hunt them down. Your score is however many got away.';

const TILE_TYPES  = ['blue-bunny', 'red-bunny', 'mushroom', 'cabbage', 'carrot'];
const TILE_COLORS = {
  'blue-bunny': '#3b82f6', 'red-bunny': '#ef4444', 'mushroom': '#a855f7',
  'cabbage': '#22c55e', 'carrot': '#f97316',
};
const TILE_LABELS = {
  'blue-bunny': 'Blue Bunny', 'red-bunny': 'Red Bunny',
  'mushroom': 'Mushroom', 'cabbage': 'Cabbage', 'carrot': 'Carrot',
};

const tileImages = {};
function loadImages() {
  for (const type of TILE_TYPES) {
    const img = new Image();
    img.onload = () => render(); img.onerror = () => {};
    img.src = `assets/icons/${type}.svg`; tileImages[type] = img;
  }
}

// =============================================================================
// BASE GAME CLASS
// =============================================================================
class BunnyGame {
  constructor(cols, rows) {
    this.cols = cols; this.rows = rows;
    this.moves = 0; this.cleared = 0; this.gameOver = false; this.history = [];
  }
  findGroup(row, col) {
    const type = this.grid[row][col];
    if (!type) return [];
    const visited = new Uint8Array(this.rows * this.cols);
    const queue = [row * this.cols + col]; const group = []; let head = 0;
    while (head < queue.length) {
      const idx = queue[head++]; if (visited[idx]) continue; visited[idx] = 1;
      const r = (idx / this.cols) | 0, c = idx % this.cols;
      if (this.grid[r][c] !== type) continue;
      group.push([r, c]);
      if (r > 0)             queue.push((r-1)*this.cols+c);
      if (r < this.rows - 1) queue.push((r+1)*this.cols+c);
      if (c > 0)             queue.push(r*this.cols+(c-1));
      if (c < this.cols - 1) queue.push(r*this.cols+(c+1));
    }
    return group;
  }
  _applyGravity() {
    for (let c = 0; c < this.cols; c++) {
      const live = [];
      for (let r = 0; r < this.rows; r++) if (this.grid[r][c] !== null) live.push(this.grid[r][c]);
      const empty = this.rows - live.length;
      for (let r = 0; r < this.rows; r++) this.grid[r][c] = r < empty ? null : live[r - empty];
    }
  }
  _compactColumns() {
    const active = [];
    for (let c = 0; c < this.cols; c++) if (this.grid.some(row => row[c] !== null)) active.push(c);
    if (active.length === this.cols) return;
    const ng = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));
    for (let nc = 0; nc < active.length; nc++) {
      const oc = active[nc];
      for (let r = 0; r < this.rows; r++) ng[r][nc] = this.grid[r][oc];
    }
    this.grid = ng;
  }
  _hasValidMoves() {
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const t = this.grid[r][c]; if (!t) continue;
        if (c + 1 < this.cols && this.grid[r][c+1] === t) return true;
        if (r + 1 < this.rows && this.grid[r+1][c] === t) return true;
      }
    return false;
  }
}

// =============================================================================
// GAME LOGIC — 86 Bunnies
// =============================================================================
class EightySixGame extends BunnyGame {
  constructor() {
    super(10, 10);
    this.gameWon = false;
    const result = EightySixGame._generateGrid(this.rows, this.cols);
    this.grid = result.grid; this.totalBlueBunnies = result.count;
  }
  static _generateGrid(rows, cols) {
    const FILLER = ['mushroom', 'cabbage', 'carrot'];
    const BMIN = 15, BMAX = 25, MIN_GROUPS = 4;
    for (;;) {
      const target = BMIN + Math.floor(Math.random() * (BMAX - BMIN + 1));
      const grid = Array.from({ length: rows }, () => new Array(cols).fill(null));
      const cells = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([r, c]);
      for (let i = cells.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [cells[i], cells[j]] = [cells[j], cells[i]];
      }
      let placed = 0;
      for (const [r, c] of cells) {
        if (placed >= target) break;
        const adj =
          (r > 0      && grid[r-1][c] === 'blue-bunny') ||
          (r < rows-1 && grid[r+1][c] === 'blue-bunny') ||
          (c > 0      && grid[r][c-1] === 'blue-bunny') ||
          (c < cols-1 && grid[r][c+1] === 'blue-bunny');
        if (!adj) { grid[r][c] = 'blue-bunny'; placed++; }
      }
      if (placed < target) continue;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (!grid[r][c]) grid[r][c] = FILLER[(Math.random() * FILLER.length) | 0];
      const vis = new Uint8Array(rows * cols); let groups = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const t = grid[r][c];
          if (!t || t === 'blue-bunny' || vis[r*cols+c]) continue;
          const q = [r*cols+c]; let h = 0, sz = 0;
          while (h < q.length) {
            const idx = q[h++]; if (vis[idx]) continue; vis[idx] = 1;
            const gr = (idx/cols)|0, gc = idx%cols;
            if (grid[gr][gc] !== t) continue; sz++;
            if (gr > 0)        q.push((gr-1)*cols+gc);
            if (gr < rows - 1) q.push((gr+1)*cols+gc);
            if (gc > 0)        q.push(gr*cols+(gc-1));
            if (gc < cols - 1) q.push(gr*cols+(gc+1));
          }
          if (sz >= 2) groups++;
        }
      }
      if (groups < MIN_GROUPS) continue;
      return { grid, count: placed };
    }
  }
  click(row, col) {
    if (this.gameOver) return null;
    const group = this.findGroup(row, col);
    if (group.length < 2) return null;
    this.history.push({ grid: this.grid.map(r => r.slice()), moves: this.moves, cleared: this.cleared });
    if (this.history.length > 50) this.history.shift();
    for (const [r, c] of group) this.grid[r][c] = null;
    this._applyGravity(); this._compactColumns();
    this.moves++; this.cleared += group.length;
    if (this.countBlueBunnies() === 0) { this.gameOver = true; this.gameWon = true; }
    else if (!this._hasValidMoves()) { this.gameOver = true; this.gameWon = false; }
    return group;
  }
  countBlueBunnies() {
    let n = 0;
    for (const row of this.grid) for (const cell of row) if (cell === 'blue-bunny') n++;
    return n;
  }
  countRemaining() { return this.countBlueBunnies(); }
}

// =============================================================================
// CANVAS RENDERER
// =============================================================================
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');
let game = null, cellSize = 0;
let hoveredGroup = null, lastHoverKey = null, flashCell = null;

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r); ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h); ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r); ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y); ctx.closePath();
}

function computeCellSize(cols, rows) {
  const wrap = document.getElementById('canvas-wrap');
  return Math.max(4, Math.floor(Math.min((wrap.clientWidth-20)/cols, (wrap.clientHeight-24)/rows)));
}

function resizeCanvas() {
  if (!game) return;
  cellSize = computeCellSize(game.cols, game.rows);
  canvas.width = cellSize * game.cols; canvas.height = cellSize * game.rows;
  render();
}

function render() {
  if (!game) return;
  const now = Date.now();
  const useRound = cellSize >= 5, useImages = cellSize >= 10, useGrid = cellSize >= 14;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1A2B3C'; ctx.fillRect(0, 0, canvas.width, canvas.height);

  const hlSet = new Set();
  if (hoveredGroup && hoveredGroup.length >= 2) for (const [r, c] of hoveredGroup) hlSet.add(r*game.cols+c);

  let flashIdx = -1;
  if (flashCell && now < flashCell.expiry) flashIdx = flashCell.r * game.cols + flashCell.c;
  else flashCell = null;

  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      const type = game.grid[r][c]; if (!type) continue;
      const x = c * cellSize, y = r * cellSize;
      const idx = r * game.cols + c;
      const isTarget = type === 'blue-bunny';
      const highlighted = hlSet.has(idx);
      const flashing    = idx === flashIdx;

      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      if (isTarget && !highlighted) { ctx.shadowColor = 'rgba(59,130,246,0.55)'; ctx.shadowBlur = 10; }
      ctx.fillStyle = highlighted ? '#ffe066' : isTarget ? '#dbeafe' : '#ffffcc';

      const rad = useRound ? Math.max(1, (cellSize * 0.18) | 0) : 0;
      if (useRound) { roundRect(ctx, x+1, y+1, cellSize-2, cellSize-2, rad); ctx.fill(); }
      else ctx.fillRect(x, y, cellSize, cellSize);

      if (isTarget && !highlighted) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }

      if (useImages) {
        const img = tileImages[type];
        if (img && img.naturalWidth > 0) ctx.drawImage(img, x+1, y+1, cellSize-2, cellSize-2);
      }

      if (flashing) {
        ctx.fillStyle = 'rgba(255,50,50,0.55)';
        if (useRound) { roundRect(ctx, x+1, y+1, cellSize-2, cellSize-2, rad); ctx.fill(); }
        else ctx.fillRect(x, y, cellSize, cellSize);
      }
      if (highlighted) {
        ctx.strokeStyle = 'rgba(255,255,180,0.8)'; ctx.lineWidth = Math.max(1, (cellSize * 0.08) | 0);
        if (useRound) { roundRect(ctx, x+1, y+1, cellSize-2, cellSize-2, rad); ctx.stroke(); }
        else ctx.strokeRect(x+0.5, y+0.5, cellSize-1, cellSize-1);
      }
    }
  }
  if (useGrid) {
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.5; ctx.beginPath();
    for (let r = 1; r < game.rows; r++) { ctx.moveTo(0, r*cellSize); ctx.lineTo(canvas.width, r*cellSize); }
    for (let c = 1; c < game.cols; c++) { ctx.moveTo(c*cellSize, 0); ctx.lineTo(c*cellSize, canvas.height); }
    ctx.stroke();
  }
}

function updateStats() {
  if (!game) return;
  const rem = game.countBlueBunnies();
  document.getElementById('val-remaining').textContent = `${rem} / ${game.totalBlueBunnies}`;
  document.getElementById('val-cleared').textContent   = game.cleared;
  document.getElementById('val-moves').textContent     = game.moves;
}

function show86Result(won) {
  const remaining = game.countBlueBunnies(), total = game.totalBlueBunnies;
  const perfEl = document.getElementById('perf-banner');
  if (won) {
    perfEl.style.background = 'linear-gradient(135deg, #1d4ed8, #3b82f6)';
    perfEl.textContent = 'ALL BUNNIES ELIMINATED!'; perfEl.classList.remove('hidden');
    document.getElementById('modal-title').textContent  = 'You Win!';
    document.getElementById('modal-score').textContent  = `All ${total} blue bunnies cleared`;
    document.getElementById('modal-sub').textContent    = `${game.moves} move${game.moves !== 1 ? 's' : ''} · ${game.cleared} tiles cleared`;
    document.getElementById('modal-breakdown').innerHTML = '<p class="perfect-msg">Every last bunny is gone!</p>';
  } else {
    perfEl.classList.add('hidden');
    document.getElementById('modal-title').textContent  = 'Game Over';
    document.getElementById('modal-score').textContent  = `${remaining} blue ${remaining !== 1 ? 'bunnies' : 'bunny'} remain`;
    document.getElementById('modal-sub').textContent    = `${game.moves} move${game.moves !== 1 ? 's' : ''} · eliminated ${total - remaining} of ${total}`;
    document.getElementById('modal-breakdown').innerHTML = `<p style="color:#94a3b8;font-size:0.85rem;padding:8px 0;text-align:center;">${remaining} ${remaining !== 1 ? 'bunnies' : 'bunny'} got away.</p>`;
  }
  document.getElementById('overlay').classList.remove('hidden');
}

function cellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const col  = ((e.clientX - rect.left) / cellSize) | 0;
  const row  = ((e.clientY - rect.top)  / cellSize) | 0;
  if (col >= 0 && col < game.cols && row >= 0 && row < game.rows) return [row, col];
  return null;
}

canvas.addEventListener('click', e => {
  if (!game || game.gameOver) return;
  const cell = cellFromEvent(e); if (!cell) return;
  const [row, col] = cell;
  if (!game.grid[row][col]) return;
  const group = game.findGroup(row, col);
  if (group.length < 2) {
    flashCell = { r: row, c: col, expiry: Date.now() + 380 };
    render(); setTimeout(() => { flashCell = null; render(); }, 390); return;
  }
  game.click(row, col); hoveredGroup = null; lastHoverKey = null;
  updateStats(); render();
  if (game.gameOver) setTimeout(() => show86Result(game.gameWon), 350);
});

canvas.addEventListener('mousemove', e => {
  if (!game || game.gameOver) return;
  const cell = cellFromEvent(e);
  const key  = cell ? `${cell[0]},${cell[1]}` : null;
  if (key === lastHoverKey) return; lastHoverKey = key;
  if (!cell || !game.grid[cell[0]][cell[1]]) {
    if (hoveredGroup) { hoveredGroup = null; render(); } return;
  }
  // No hover highlight in 86 Bunnies — just clear
  if (hoveredGroup) { hoveredGroup = null; render(); }
});

canvas.addEventListener('mouseleave', () => {
  if (hoveredGroup) { hoveredGroup = null; lastHoverKey = null; render(); }
});

document.getElementById('new-btn').addEventListener('click', () => startGame());
document.getElementById('help-btn').addEventListener('click', () => openDirections(DIRECTIONS_TEXT));
document.getElementById('play-again-btn').addEventListener('click', () => {
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('play-again-btn').textContent = 'Play Again';
  startGame();
});
document.getElementById('share-btn').addEventListener('click', () => {
  const moves = game ? game.moves : 0;
  const remaining = game ? game.countBlueBunnies() : 0;
  const total     = game ? game.totalBlueBunnies : 0;
  let text;
  if (game && game.gameWon) {
    text = `🐰 I eliminated all ${total} blue bunnies in 86 Bunnies in ${moves} move${moves !== 1 ? 's' : ''}! Can you do it? https://www.thebunnygame.com/86-bunnies`;
  } else {
    text = `86 Bunnies — ${remaining} of ${total} blue bunnies remained after ${moves} move${moves !== 1 ? 's' : ''}. Can you do better? https://www.thebunnygame.com/86-bunnies`;
  }
  shareText(text, '86 Bunnies — Bunny Game');
});

let dirsSeen = false;
function startGame() {
  game = new EightySixGame();
  hoveredGroup = null; lastHoverKey = null; flashCell = null;
  document.getElementById('overlay').classList.add('hidden');
  resizeCanvas(); updateStats();
  if (!dirsSeen) { dirsSeen = true; openDirections(DIRECTIONS_TEXT); }
}

loadImages();
(function bootstrap() {
  const wrap = document.getElementById('canvas-wrap');
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      if (!game) { if (wrap.clientHeight > 50) startGame(); } else resizeCanvas();
    }).observe(wrap);
  } else {
    window.addEventListener('resize', function () { if (game) resizeCanvas(); });
    requestAnimationFrame(function () { requestAnimationFrame(startGame); });
  }
})();
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js'); }
