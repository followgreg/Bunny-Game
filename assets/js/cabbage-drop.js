// cabbage-drop.js — Cabbage Drop timed arcade mode

const DIRECTIONS_TEXT = '60 seconds. Full board. Click groups of two or more to score points. Cabbages are double. The clock is always running. Good luck!';

const TILE_TYPES = ['blue-bunny', 'red-bunny', 'mushroom', 'cabbage', 'carrot'];

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
// GAME LOGIC — Classic base
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

  _hasValidMoves() { return true; }
}

// =============================================================================
// GAME LOGIC — Cabbage Drop
// Timed arcade mode. Board always full. Cabbages score 2×. 60-second clock.
// =============================================================================
class CabbageDropGame extends BunnyGame {
  constructor() {
    super(10, 20);
    this.score     = 0;
    this.started   = false;
    this.timeLeft  = 60;
    this.lastClear = null;
  }

  // No column collapse — board stays full-width
  _compactColumns() { /* intentionally empty */ }

  _refill() {
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++)
        if (this.grid[r][c] === null)
          this.grid[r][c] = TILE_TYPES[(Math.random() * TILE_TYPES.length) | 0];
  }

  click(row, col) {
    if (this.gameOver) return null;
    const group = this.findGroup(row, col);
    if (group.length < 2) return null;

    const type    = this.grid[row][col];
    const isBonus = type === 'cabbage';
    const points  = group.length * 10 * (isBonus ? 2 : 1);

    for (const [r, c] of group) this.grid[r][c] = null;
    this._applyGravity();
    this._refill();

    this.moves++;
    this.cleared += group.length;
    this.score   += points;
    this.lastClear = { group, points, isBonus };

    return group;
  }
}

// =============================================================================
// CANVAS RENDERER
// =============================================================================
const canvas  = document.getElementById('game-canvas');
const ctx     = canvas.getContext('2d');
let game      = null;
let cellSize  = 0;
let flashCell = null;

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
  ctx.fillStyle = '#3D1F0A';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const now      = Date.now();
  const useRound  = cellSize >= 5;
  const useImages = cellSize >= 10;
  const useGrid   = cellSize >= 14;

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

      const idx      = r * game.cols + c;
      const flashing = idx === flashIdx;

      ctx.shadowBlur  = 0;
      ctx.shadowColor = 'transparent';
      ctx.fillStyle   = '#ffffcc';

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
// CABBAGE DROP — timer, display, floating score popup
// =============================================================================
let cdTimerInterval = null;

function startCDTimer() {
  clearInterval(cdTimerInterval);
  cdTimerInterval = setInterval(() => {
    if (!game || game.gameOver) { clearInterval(cdTimerInterval); return; }
    game.timeLeft = Math.max(0, game.timeLeft - 0.1);
    updateCDDisplay();
    if (game.timeLeft <= 0) {
      game.gameOver = true;
      clearInterval(cdTimerInterval);
      setTimeout(() => showCabbageDropResult(), 150);
    }
  }, 100);
}

function stopCDTimer() { clearInterval(cdTimerInterval); }

function showCDStartOverlay() {
  document.getElementById('cd-start-overlay').classList.add('cd-start-visible');
}
function hideCDStartOverlay() {
  document.getElementById('cd-start-overlay').classList.remove('cd-start-visible');
}

function updateCDDisplay() {
  if (!game) return;
  const t       = Math.max(0, game.timeLeft);
  const mins    = Math.floor(t / 60) | 0;
  const secs    = Math.floor(t % 60) | 0;
  const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;

  const timerEl = document.getElementById('val-cd-timer');
  timerEl.textContent = timeStr;
  timerEl.classList.remove('cd-warn', 'cd-blink-slow', 'cd-blink-fast');

  const hudTimer = document.getElementById('cd-hud-timer');
  if (hudTimer) {
    hudTimer.textContent = timeStr;
    hudTimer.classList.remove('cd-warn', 'cd-blink-slow', 'cd-blink-fast');
  }

  if (t <= 10) {
    timerEl.classList.add('cd-warn', 'cd-blink-fast');
    if (hudTimer) hudTimer.classList.add('cd-warn', 'cd-blink-fast');
  } else if (t <= 30) {
    timerEl.classList.add('cd-warn', 'cd-blink-slow');
    if (hudTimer) hudTimer.classList.add('cd-warn', 'cd-blink-slow');
  }

  const scoreStr = game.score.toLocaleString();
  document.getElementById('val-score').textContent = scoreStr;
  const hudScore = document.getElementById('cd-hud-score');
  if (hudScore) hudScore.textContent = scoreStr;
}

function spawnScorePopup(group, points, isBonus) {
  if (!group || group.length === 0) return;
  const avgRow = group.reduce((s, [r])   => s + r, 0) / group.length;
  const avgCol = group.reduce((s, [, c]) => s + c, 0) / group.length;

  const wrap       = document.getElementById('canvas-wrap');
  const wrapRect   = wrap.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();

  const offX = canvasRect.left - wrapRect.left;
  const offY = canvasRect.top  - wrapRect.top;

  const px = offX + (avgCol + 0.5) * cellSize;
  const py = offY + (avgRow + 0.5) * cellSize;

  const el = document.createElement('div');
  el.className = 'cd-popup' + (isBonus ? ' cd-popup-bonus' : '');
  el.textContent = `+${points}`;
  el.style.left  = `${px}px`;
  el.style.top   = `${py}px`;
  wrap.appendChild(el);
  const lifespan = isBonus ? 820 : 560;
  setTimeout(() => el.remove(), lifespan);

  if (isBonus) {
    const flash = document.getElementById('cd-flash');
    if (flash) {
      flash.style.animation = 'none';
      void flash.offsetHeight;
      flash.style.animation = 'cd-flash-anim 0.48s ease-out forwards';
    }

    const hudScore = document.getElementById('cd-hud-score');
    if (hudScore) {
      hudScore.classList.remove('cd-score-bounce');
      void hudScore.offsetHeight;
      hudScore.classList.add('cd-score-bounce');
      setTimeout(() => hudScore.classList.remove('cd-score-bounce'), 450);
    }

    const badge = document.createElement('div');
    badge.className = 'cd-popup cd-popup-badge';
    badge.textContent = '2×';
    badge.style.left = `${px + cellSize * 0.9}px`;
    badge.style.top  = `${py - cellSize * 0.4}px`;
    wrap.appendChild(badge);
    setTimeout(() => badge.remove(), 820);
  }
}

// =============================================================================
// STATS
// =============================================================================
function updateStats() {
  if (!game) return;
  document.getElementById('val-moves').textContent = game.moves;
  const best = parseInt(localStorage.getItem('cabbageDrop_bestScore') || '0');
  document.getElementById('val-cd-best').textContent = best > 0 ? best.toLocaleString() : '—';
  updateCDDisplay();
}

// =============================================================================
// RESULT MODAL
// =============================================================================
function showCabbageDropResult() {
  const score   = game ? game.score : 0;
  const stored  = parseInt(localStorage.getItem('cabbageDrop_bestScore') || '0');
  const isNewBest = score > stored;
  if (isNewBest) localStorage.setItem('cabbageDrop_bestScore', String(score));
  const best = isNewBest ? score : stored;

  const perfEl = document.getElementById('perf-banner');
  if (isNewBest) {
    perfEl.style.background = 'linear-gradient(135deg, #14532d, #16a34a)';
    perfEl.textContent = '🥬 NEW PERSONAL BEST!';
    perfEl.classList.remove('hidden');
    document.getElementById('modal-title').textContent = 'NEW PERSONAL BEST';
  } else {
    perfEl.classList.add('hidden');
    document.getElementById('modal-title').textContent = "TIME'S UP";
  }

  document.getElementById('modal-score').textContent = `Score: ${score.toLocaleString()} pts`;
  document.getElementById('modal-sub').textContent   = `Personal Best: ${best.toLocaleString()} pts`;

  const cleared = game ? game.cleared : 0;
  const moves   = game ? game.moves   : 0;
  document.getElementById('modal-breakdown').innerHTML =
    `<div class="bd-row"><span>Tiles cleared: <strong>${cleared}</strong></span></div>` +
    `<div class="bd-row"><span>Groups cleared: <strong>${moves}</strong></span></div>`;

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
  if (!game.started) return;  // waiting for START tap
  const cell = cellFromEvent(e);
  if (!cell) return;
  const [row, col] = cell;
  if (!game.grid[row][col]) return;

  const group = game.click(row, col);
  if (!group) {
    flashCell = { r: row, c: col, expiry: Date.now() + 380 };
    render();
    setTimeout(() => { flashCell = null; render(); }, 390);
    return;
  }

  if (game.lastClear) {
    const { group: g, points, isBonus } = game.lastClear;
    game.lastClear = null;
    spawnScorePopup(g, points, isBonus);
  }

  updateStats();
  render();
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

// Dismiss end screen without restarting (inspect the frozen board)
document.getElementById('modal-close-btn').addEventListener('click', () => {
  document.getElementById('overlay').classList.add('hidden');
});

// START button — begin the countdown on first tap
document.getElementById('cd-start-btn').addEventListener('click', () => {
  if (!game || game.started) return;
  game.started = true;
  hideCDStartOverlay();
  startCDTimer();
});

document.getElementById('share-btn').addEventListener('click', () => {
  const score    = game ? game.score : 0;
  const stored   = parseInt(localStorage.getItem('cabbageDrop_bestScore') || '0');
  const isNewBest = score >= stored && score > 0;
  const text = isNewBest
    ? `Cabbage Drop — NEW PERSONAL BEST: ${score.toLocaleString()} points in 1 minute. Can you beat it? https://www.thebunnygame.com/cabbage-drop`
    : `Cabbage Drop — scored ${score.toLocaleString()} points in 1 minute. https://www.thebunnygame.com/cabbage-drop`;
  shareText(text, 'Cabbage Drop — Bunny Game');
});

// =============================================================================
// START GAME & BOOTSTRAP
// =============================================================================
let dirsSeen = false;

function startGame() {
  stopCDTimer();
  game      = new CabbageDropGame();
  flashCell = null;
  document.getElementById('overlay').classList.add('hidden');
  resizeCanvas();
  updateStats();
  showCDStartOverlay();
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
