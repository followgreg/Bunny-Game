// bomb-mode.js — Bomb Mode

const DIRECTIONS_TEXT = 'There\'s a bomb on the board. Don\'t clear everything — get the bomb to the bottom row. Clear characters strategically and let gravity do the work. The bomb rides with its column. You can\'t click it. Groups of three or more to clear — pairs don\'t count in this mode. Get the bomb to the bottom, you win. Run out of moves before that, you lose.';

const GRID_COLS      = 12;
const GRID_ROWS      = 20;
const BOMB_MIN_GROUP = 3;
const BOMB_MAX_START = Math.floor(GRID_ROWS / 4);

const TILE_TYPES  = ['blue-bunny', 'red-bunny', 'mushroom', 'cabbage', 'carrot'];
const TILE_COLORS = {
  'blue-bunny': '#3b82f6', 'red-bunny': '#ef4444', 'mushroom': '#a855f7',
  'cabbage': '#22c55e', 'carrot': '#f97316', 'bomb': '#dc2626',
};
const TILE_LABELS = {
  'blue-bunny': 'Blue Bunny', 'red-bunny': 'Red Bunny',
  'mushroom': 'Mushroom', 'cabbage': 'Cabbage', 'carrot': 'Carrot',
};

// =============================================================================
// IMAGE LOADING
// =============================================================================
const tileImages = {};
function loadImages() {
  for (const type of TILE_TYPES) {
    const img = new Image();
    img.onload = () => render(); img.onerror = () => {};
    img.src = `assets/icons/${type}.svg`; tileImages[type] = img;
  }
  const bombImg = new Image();
  bombImg.onload = () => render(); bombImg.onerror = () => {};
  bombImg.src = 'assets/icons/bomb.png'; tileImages['bomb'] = bombImg;
}

// =============================================================================
// GAME LOGIC — BunnyGame base
// =============================================================================
class BunnyGame {
  constructor(cols, rows) {
    this.cols = cols; this.rows = rows;
    this.moves = 0; this.cleared = 0; this.gameOver = false;
    this.history = []; this.grid = this._randomGrid();
  }
  _randomGrid() {
    return Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => TILE_TYPES[(Math.random() * TILE_TYPES.length) | 0]));
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
  countRemaining() {
    let n = 0;
    for (const row of this.grid) for (const cell of row) if (cell && cell !== 'bomb') n++;
    return n;
  }
}

// =============================================================================
// SOLVABILITY CHECKER
// =============================================================================
function checkBombSolvable(initGrid, initBp, rows, cols) {
  let grid = initGrid.map(r => r.slice());
  let bp   = { row: initBp.row, col: initBp.col };
  function gravity() {
    for (let c = 0; c < cols; c++) {
      const live = [];
      for (let r = 0; r < rows; r++) if (grid[r][c] !== null) live.push(grid[r][c]);
      const empty = rows - live.length;
      for (let r = 0; r < rows; r++) grid[r][c] = r < empty ? null : live[r - empty];
      if (c === bp.col) { const bi = live.indexOf('bomb'); if (bi !== -1) bp.row = empty + bi; }
    }
  }
  function compact() {
    const active = [];
    for (let c = 0; c < cols; c++) if (grid.some(row => row[c] !== null)) active.push(c);
    if (active.length === cols) return;
    const newBc = active.indexOf(bp.col);
    const ng = Array.from({ length: rows }, () => new Array(cols).fill(null));
    for (let nc = 0; nc < active.length; nc++) for (let r = 0; r < rows; r++) ng[r][nc] = grid[r][active[nc]];
    grid = ng; if (newBc !== -1) bp.col = newBc;
  }
  for (let move = 0; move < rows * cols; move++) {
    if (bp.row === rows - 1) return true;
    let bestGroup = null, bestScore = -1;
    const done = new Uint8Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const type = grid[r][c];
        if (!type || type === 'bomb' || done[r * cols + c]) continue;
        const group = [], vis = new Uint8Array(rows * cols);
        const q = [r * cols + c]; let h = 0;
        while (h < q.length) {
          const idx = q[h++]; if (vis[idx]) continue; vis[idx] = 1;
          const gr = (idx / cols) | 0, gc = idx % cols;
          if (grid[gr][gc] !== type) continue;
          group.push([gr, gc]); done[idx] = 1;
          if (gr > 0)        q.push((gr-1)*cols+gc);
          if (gr < rows - 1) q.push((gr+1)*cols+gc);
          if (gc > 0)        q.push(gr*cols+(gc-1));
          if (gc < cols - 1) q.push(gr*cols+(gc+1));
        }
        if (group.length < BOMB_MIN_GROUP) continue;
        let score = 0;
        for (const [gr, gc] of group) {
          if (gc === bp.col && gr > bp.row) score += 100;
          else if (gr > bp.row)             score += 5;
          else if (gc === bp.col)           score += 10;
          else                              score += 1;
        }
        if (score > bestScore) { bestScore = score; bestGroup = group; }
      }
    }
    if (!bestGroup) return false;
    for (const [r, c] of bestGroup) grid[r][c] = null;
    gravity(); compact();
  }
  return bp.row === rows - 1;
}

// =============================================================================
// GAME LOGIC — Bomb Mode
// =============================================================================
class BombGame extends BunnyGame {
  constructor(cols, rows) {
    super(cols, rows);
    this.gameWon = false;
    let br, bc;
    for (let attempt = 0; attempt < 20; attempt++) {
      if (attempt > 0) this.grid = this._randomGrid();
      br = Math.floor(Math.random() * BOMB_MAX_START);
      bc = Math.floor(Math.random() * cols);
      this.grid[br][bc] = 'bomb';
      if (checkBombSolvable(this.grid, { row: br, col: bc }, rows, cols)) break;
    }
    this.bombPosition = { row: br, col: bc };
  }
  findGroup(row, col) {
    if (this.grid[row][col] === 'bomb') return [];
    return super.findGroup(row, col);
  }
  click(row, col) {
    if (this.gameOver) return null;
    if (this.grid[row][col] === 'bomb') return 'bomb';
    const group = this.findGroup(row, col);
    if (group.length < BOMB_MIN_GROUP) return null;
    this.history.push({
      grid: this.grid.map(r => r.slice()), moves: this.moves,
      cleared: this.cleared, bombPosition: { ...this.bombPosition },
    });
    if (this.history.length > 50) this.history.shift();
    for (const [r, c] of group) this.grid[r][c] = null;
    this._applyGravity(); this._compactColumns();
    this.moves++; this.cleared += group.length;
    if (this.bombPosition.row === this.rows - 1) { this.gameOver = true; this.gameWon = true; }
    else if (!this._hasValidMoves()) { this.gameOver = true; this.gameWon = false; }
    return group;
  }
  _applyGravity() {
    const bc = this.bombPosition.col;
    for (let c = 0; c < this.cols; c++) {
      const live = [];
      for (let r = 0; r < this.rows; r++) if (this.grid[r][c] !== null) live.push(this.grid[r][c]);
      const empty = this.rows - live.length;
      for (let r = 0; r < this.rows; r++) this.grid[r][c] = r < empty ? null : live[r - empty];
      if (c === bc) { const bi = live.indexOf('bomb'); if (bi !== -1) this.bombPosition.row = empty + bi; }
    }
  }
  _compactColumns() {
    const active = [];
    for (let c = 0; c < this.cols; c++) if (this.grid.some(row => row[c] !== null)) active.push(c);
    if (active.length === this.cols) return;
    const newBombCol = active.indexOf(this.bombPosition.col);
    const ng = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));
    for (let nc = 0; nc < active.length; nc++) {
      const oc = active[nc];
      for (let r = 0; r < this.rows; r++) ng[r][nc] = this.grid[r][oc];
    }
    this.grid = ng; if (newBombCol !== -1) this.bombPosition.col = newBombCol;
  }
  _hasValidMoves() {
    const visited = new Uint8Array(this.rows * this.cols);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const t = this.grid[r][c];
        if (!t || t === 'bomb' || visited[r * this.cols + c]) continue;
        const group = this.findGroup(r, c);
        for (const [gr, gc] of group) visited[gr * this.cols + gc] = 1;
        if (group.length >= BOMB_MIN_GROUP) return true;
      }
    }
    return false;
  }
  undo() {
    if (!this.history.length) return false;
    const snap = this.history.pop();
    this.grid = snap.grid; this.moves = snap.moves; this.cleared = snap.cleared;
    this.bombPosition = { ...snap.bombPosition }; this.gameOver = false; this.gameWon = false;
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
let animLoopId   = null;

function startAnimLoop() {
  if (animLoopId !== null) return;
  function tick() { render(); animLoopId = requestAnimationFrame(tick); }
  animLoopId = requestAnimationFrame(tick);
}
function stopAnimLoop() {
  if (animLoopId !== null) { cancelAnimationFrame(animLoopId); animLoopId = null; }
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function computeCellSize(cols, rows) {
  const wrap = document.getElementById('canvas-wrap');
  return Math.max(4, Math.floor(Math.min((wrap.clientWidth - 20) / cols, (wrap.clientHeight - 24) / rows)));
}

function resizeCanvas() {
  if (!game) return;
  cellSize = computeCellSize(game.cols, game.rows);
  canvas.width = cellSize * game.cols; canvas.height = cellSize * game.rows;
  render();
}

function render() {
  if (!game) return;
  const now    = Date.now();
  const tPulse = (Math.sin(now / 250) + 1) / 2;
  const useRound  = cellSize >= 5;
  const useImages = cellSize >= 10;
  const useGrid   = cellSize >= 14;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#2A2A2A'; ctx.fillRect(0, 0, canvas.width, canvas.height);

  const hlSet = new Set();
  if (hoveredGroup && hoveredGroup.length >= BOMB_MIN_GROUP)
    for (const [r, c] of hoveredGroup) hlSet.add(r * game.cols + c);

  let flashIdx = -1;
  if (flashCell && now < flashCell.expiry) flashIdx = flashCell.r * game.cols + flashCell.c;
  else flashCell = null;

  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      const type = game.grid[r][c];
      const x = c * cellSize, y = r * cellSize;
      if (!type) continue;
      const idx = r * game.cols + c;
      const isBomb      = type === 'bomb';
      const highlighted = !isBomb && hlSet.has(idx);
      const flashing    = idx === flashIdx;

      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';

      if (isBomb) {
        const rb = Math.round(220 + tPulse * 35), gb = Math.round(38 + tPulse * 102);
        ctx.fillStyle = `rgb(${rb},${gb},38)`;
      } else {
        ctx.fillStyle = highlighted ? '#ffe066' : '#000000';
      }

      const rad = useRound ? Math.max(1, (cellSize * 0.18) | 0) : 0;
      if (useRound) { roundRect(ctx, x+1, y+1, cellSize-2, cellSize-2, rad); ctx.fill(); }
      else ctx.fillRect(x, y, cellSize, cellSize);

      if (isBomb && useRound) {
        ctx.strokeStyle = `rgba(255,215,0,${0.25 + tPulse * 0.75})`;
        ctx.lineWidth   = Math.max(1, cellSize * 0.09);
        roundRect(ctx, x+1, y+1, cellSize-2, cellSize-2, rad); ctx.stroke();
      }

      if (useImages) {
        const img = tileImages[type];
        if (img && img.naturalWidth > 0) {
          if (isBomb) {
            const enlarge = Math.round(tPulse * cellSize * 0.12);
            ctx.drawImage(img, x+1-enlarge, y+1-enlarge, cellSize-2+enlarge*2, cellSize-2+enlarge*2);
          } else {
            ctx.drawImage(img, x+1, y+1, cellSize-2, cellSize-2);
          }
        } else if (isBomb) {
          ctx.save();
          const fs = Math.max(8, Math.round(cellSize * (0.62 + tPulse * 0.12)));
          ctx.font = `${fs}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('💣', x + cellSize/2, y + cellSize/2); ctx.restore();
        }
      }

      if (flashing) {
        ctx.fillStyle = 'rgba(255,50,50,0.55)';
        if (useRound) { roundRect(ctx, x+1, y+1, cellSize-2, cellSize-2, rad); ctx.fill(); }
        else ctx.fillRect(x, y, cellSize, cellSize);
      }

      if (highlighted) {
        ctx.strokeStyle = 'rgba(255,255,180,0.8)';
        ctx.lineWidth   = Math.max(1, (cellSize * 0.08) | 0);
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

// =============================================================================
// STATS
// =============================================================================
function updateStats() {
  if (!game) return;
  document.getElementById('val-remaining').textContent = game.countRemaining();
  document.getElementById('val-cleared').textContent   = game.cleared;
  document.getElementById('val-moves').textContent     = game.moves;
  const rowsLeft = game.rows - 1 - game.bombPosition.row;
  document.getElementById('val-bomb').textContent = rowsLeft === 0 ? '✓' : rowsLeft;
}

// =============================================================================
// RESULT MODAL
// =============================================================================
function showBombResult(won) {
  const remaining = game.countRemaining();
  const rowsLeft  = game.rows - 1 - game.bombPosition.row;
  const perfEl    = document.getElementById('perf-banner');
  if (won) {
    perfEl.style.background = 'linear-gradient(135deg, #92400e, #f97316)';
    perfEl.textContent = '💣 BOMB REACHED THE BOTTOM!';
    perfEl.classList.remove('hidden');
    document.getElementById('modal-title').textContent  = 'You Win!';
    document.getElementById('modal-score').textContent  = `${game.moves} move${game.moves !== 1 ? 's' : ''}`;
    document.getElementById('modal-sub').textContent    = `${game.cleared} tiles cleared · ${remaining} tile${remaining !== 1 ? 's' : ''} remain`;
    document.getElementById('modal-breakdown').innerHTML = '<p class="perfect-msg">The bomb reached the bottom row!</p>';
  } else {
    perfEl.classList.add('hidden');
    document.getElementById('modal-title').textContent  = 'Game Over';
    document.getElementById('modal-score').textContent  = `Bomb was ${rowsLeft} row${rowsLeft !== 1 ? 's' : ''} from the bottom`;
    document.getElementById('modal-sub').textContent    = `${game.moves} move${game.moves !== 1 ? 's' : ''} · ${remaining} tile${remaining !== 1 ? 's' : ''} remaining`;
    document.getElementById('modal-breakdown').innerHTML = '<p style="color:#94a3b8;font-size:0.85rem;padding:8px 0;text-align:center;">No moves left — the bomb didn\'t make it.</p>';
  }
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
  if (game.grid[row][col] === 'bomb') return;
  const group = game.findGroup(row, col);
  if (group.length < BOMB_MIN_GROUP) {
    flashCell = { r: row, c: col, expiry: Date.now() + 380 };
    render(); setTimeout(() => { flashCell = null; render(); }, 390);
    return;
  }
  game.click(row, col);
  hoveredGroup = null; lastHoverKey = null;
  updateStats(); render();
  if (game.gameOver) {
    stopAnimLoop();
    setTimeout(() => showBombResult(game.gameWon), 350);
  }
});

canvas.addEventListener('mousemove', e => {
  if (!game || game.gameOver) return;
  const cell = cellFromEvent(e);
  const key  = cell ? `${cell[0]},${cell[1]}` : null;
  if (key === lastHoverKey) return;
  lastHoverKey = key;
  if (!cell || !game.grid[cell[0]][cell[1]] || game.grid[cell[0]][cell[1]] === 'bomb') {
    if (hoveredGroup) { hoveredGroup = null; render(); } return;
  }
  const group  = game.findGroup(cell[0], cell[1]);
  hoveredGroup = group.length >= BOMB_MIN_GROUP ? group : null;
  render();
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
  let text;
  if (game && game.gameWon) {
    text = `💣 I guided the bomb to the bottom in ${moves} move${moves !== 1 ? 's' : ''} in Bunny Game Bomb Mode! Can you do it? https://www.thebunnygame.com/bomb-mode`;
  } else {
    const rowsLeft = game ? game.rows - 1 - game.bombPosition.row : 0;
    text = `I tried Bunny Game Bomb Mode but the bomb stopped ${rowsLeft} row${rowsLeft !== 1 ? 's' : ''} from the bottom. Can you beat it? https://www.thebunnygame.com/bomb-mode`;
  }
  shareText(text, 'Bomb Mode — Bunny Game');
});

// =============================================================================
// START GAME & BOOTSTRAP
// =============================================================================
let dirsSeen = false;

function startGame() {
  stopAnimLoop();
  game = new BombGame(GRID_COLS, GRID_ROWS);
  hoveredGroup = null; lastHoverKey = null; flashCell = null;
  document.getElementById('overlay').classList.add('hidden');
  resizeCanvas(); updateStats();
  startAnimLoop();
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

if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js'); }
