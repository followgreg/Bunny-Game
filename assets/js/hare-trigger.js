// hare-trigger.js — Hare Trigger Mode
// Classic mechanics + a periodic scramble that pulses then randomly reassigns cells.

const DIRECTIONS_TEXT = 'Hare Trigger plays just like Classic — click two or more matching characters that touch to clear them. But the board won\'t sit still. Every ten seconds, a handful of cells start pulsing. Watch closely — after two seconds, they\'ll randomly transform into something new. Clear them before they shift, or let the chaos create new opportunities. Once the board gets small enough, the shifting stops, so the finish is always in your hands. Your score is how many tiles remain when no moves are left. Lower is better. Zero is a perfect clear.';

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
// GAME LOGIC — identical to Classic
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
// SCRAMBLE STATE
// =============================================================================
let scrambleIntervalId   = null;
let scramblePulseTimeout = null;
let pendingScramble      = []; // Array of {row, col} mid-pulse
let scrambleStartTime    = 0;

const SCRAMBLE_INTERVAL  = 10000; // ms between ticks
const SCRAMBLE_PULSE_MS  = 2000;  // windup pulse duration
const SCRAMBLE_THRESHOLD = 30;    // min filled cells required to fire
const SCRAMBLE_MIN       = 4;
const SCRAMBLE_MAX       = 12;

function doScrambleTick() {
  if (!game || game.gameOver) return;

  // Collect all filled cells
  const filled = [];
  for (let r = 0; r < game.rows; r++)
    for (let c = 0; c < game.cols; c++)
      if (game.grid[r][c]) filled.push([r, c]);

  // Threshold check at tick start
  if (filled.length < SCRAMBLE_THRESHOLD) return;

  // Pick 4–12 random cells via Fisher-Yates partial shuffle
  const count = SCRAMBLE_MIN + Math.floor(Math.random() * (SCRAMBLE_MAX - SCRAMBLE_MIN + 1));
  for (let i = filled.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = filled[i]; filled[i] = filled[j]; filled[j] = tmp;
  }
  pendingScramble  = filled.slice(0, Math.min(count, filled.length)).map(([r, c]) => ({ row: r, col: c }));
  scrambleStartTime = Date.now();

  startAnimLoop(); // drive the pulse animation

  scramblePulseTimeout = setTimeout(() => {
    scramblePulseTimeout = null;
    if (!game || game.gameOver) {
      pendingScramble = [];
      stopAnimLoop();
      return;
    }
    // Apply swaps only to cells still present at their original coordinates
    for (const cell of pendingScramble) {
      if (game.grid[cell.row] && game.grid[cell.row][cell.col]) {
        game.grid[cell.row][cell.col] = TILE_TYPES[(Math.random() * TILE_TYPES.length) | 0];
      }
    }
    pendingScramble = [];
    stopAnimLoop();

    // Swap may have created or destroyed valid moves — re-evaluate
    if (!game._hasValidMoves()) {
      game.gameOver = true;
      setTimeout(() => showGameOver(), 350);
    } else {
      render();
    }
  }, SCRAMBLE_PULSE_MS);
}

function startScrambleTimer() {
  scrambleIntervalId = setInterval(doScrambleTick, SCRAMBLE_INTERVAL);
}

function stopScrambleTimer() {
  if (scrambleIntervalId !== null) { clearInterval(scrambleIntervalId); scrambleIntervalId = null; }
  if (scramblePulseTimeout !== null) { clearTimeout(scramblePulseTimeout); scramblePulseTimeout = null; }
  pendingScramble = [];
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

// rAF loop — runs only during the 2-second pulse window
let animLoopId = null;
function startAnimLoop() {
  if (animLoopId !== null) return;
  function tick() { render(); animLoopId = requestAnimationFrame(tick); }
  animLoopId = requestAnimationFrame(tick);
}
function stopAnimLoop() {
  if (animLoopId !== null) { cancelAnimationFrame(animLoopId); animLoopId = null; }
  render(); // one final frame to clear the overlay
}

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
  const rad       = useRound ? Math.max(1, (cellSize * 0.18) | 0) : 0;

  const hlSet = new Set();
  if (hoveredGroup && hoveredGroup.length >= 2)
    for (const [r, c] of hoveredGroup) hlSet.add(r * game.cols + c);

  // Build a Set of pulsing cell indices for fast lookup
  const pulseSet = new Set();
  for (const cell of pendingScramble) pulseSet.add(cell.row * game.cols + cell.col);

  let flashIdx = -1;
  if (flashCell && now < flashCell.expiry) {
    flashIdx = flashCell.r * game.cols + flashCell.c;
  } else {
    flashCell = null;
  }

  // Main cell pass
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

  // Grid lines
  if (useGrid) {
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    for (let r = 1; r < game.rows; r++) { ctx.moveTo(0, r * cellSize); ctx.lineTo(canvas.width, r * cellSize); }
    for (let c = 1; c < game.cols; c++) { ctx.moveTo(c * cellSize, 0); ctx.lineTo(c * cellSize, canvas.height); }
    ctx.stroke();
  }

  // Scramble pulse overlay — second pass drawn on top of cells
  if (pendingScramble.length > 0) {
    const pulseSin   = (Math.sin(now / 130) + 1) / 2; // 0–1, fast oscillation
    const fillAlpha  = (0.28 + pulseSin * 0.38).toFixed(2);
    const strokeAlpha = (0.55 + pulseSin * 0.45).toFixed(2);
    const strokeWidth = Math.max(1.5, (cellSize * 0.1) | 0);

    ctx.shadowColor = `rgba(251,191,36,${(pulseSin * 0.6).toFixed(2)})`;
    ctx.shadowBlur  = 2 + pulseSin * 8;

    for (const cell of pendingScramble) {
      if (!game.grid[cell.row] || !game.grid[cell.row][cell.col]) continue;
      const x = cell.col * cellSize;
      const y = cell.row * cellSize;

      ctx.fillStyle = `rgba(251,191,36,${fillAlpha})`;
      if (useRound) { roundRect(ctx, x + 1, y + 1, cellSize - 2, cellSize - 2, rad); ctx.fill(); }
      else ctx.fillRect(x, y, cellSize, cellSize);

      ctx.strokeStyle = `rgba(251,146,60,${strokeAlpha})`;
      ctx.lineWidth   = strokeWidth;
      if (useRound) { roundRect(ctx, x + 1, y + 1, cellSize - 2, cellSize - 2, rad); ctx.stroke(); }
      else ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
    }

    ctx.shadowBlur  = 0;
    ctx.shadowColor = 'transparent';
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
  stopScrambleTimer(); // no more ticks after game ends
  stopAnimLoop();

  const remaining = game.countRemaining();
  const counts    = game.countByType();
  const perfEl    = document.getElementById('perf-banner');

  if (remaining === 0) {
    perfEl.style.background = 'linear-gradient(135deg, #92400e, #d97706)';
    perfEl.textContent = '🐇 PERFECT CLEAR! 🐇';
    perfEl.classList.remove('hidden');
  } else {
    perfEl.classList.add('hidden');
  }

  document.getElementById('modal-title').textContent = 'Game Over';
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
    ? `🐇 PERFECT CLEAR in Hare Trigger! Cleared the whole board in ${moves} move${moves !== 1 ? 's' : ''}. The board never stops moving. https://www.thebunnygame.com/hare-trigger`
    : `Hare Trigger — ${remaining} tile${remaining !== 1 ? 's' : ''} remaining after ${moves} move${moves !== 1 ? 's' : ''}. The board never stops moving. https://www.thebunnygame.com/hare-trigger`;
  shareText(text, 'Hare Trigger — Bunny Game');
});

// =============================================================================
// START GAME & BOOTSTRAP
// =============================================================================
let dirsSeen = false;

function startGame() {
  stopScrambleTimer();
  stopAnimLoop();

  const wideCols = window.innerWidth >= 600 ? 25 : GRID_COLS;
  game         = new BunnyGame(wideCols, GRID_ROWS);
  hoveredGroup = null;
  lastHoverKey = null;
  flashCell    = null;
  document.getElementById('overlay').classList.add('hidden');
  resizeCanvas();
  updateStats();
  if (!dirsSeen) { dirsSeen = true; openDirections(DIRECTIONS_TEXT); }

  startScrambleTimer();
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
