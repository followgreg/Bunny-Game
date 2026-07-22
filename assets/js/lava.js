/* ── Lava — ice block puzzle ─────────────────────────────────────────────── */
'use strict';

const DIRECTIONS_TEXT =
  'Ice blocks float above the lava. The bunny is safe as long as its block stays ' +
  'connected to the outer edge. Tap a block to remove it — but be careful: ' +
  'if removing a block would cut the bunny off from the edge, it won\'t budge. ' +
  'Remove exactly the number shown at the top. Any blocks that lose their connection ' +
  'to the edge will fall into the lava too. Good luck!';

const BUNNY_SRC = 'assets/icons/blue-bunny.svg';
const STORAGE_KEY = 'lava_progress'; // stores highest unlocked level

// ── State ─────────────────────────────────────────────────────────────────
let levels = [];
let currentLevel = 0;
let grid = [];          // live 4×4 boolean grid
let bunny = [0, 0];
let remaining = 0;
let busy = false;       // lock during animations

// ── DOM ───────────────────────────────────────────────────────────────────
let gridEl, countEl, levelLabelEl, winOverlay, loseOverlay, winSubEl;

// ── Connectivity ──────────────────────────────────────────────────────────
function stableSet(g) {
  const visited = new Set();
  const queue = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if ((r === 0 || r === 3 || c === 0 || c === 3) && g[r][c]) {
        const k = `${r},${c}`;
        if (!visited.has(k)) { visited.add(k); queue.push([r, c]); }
      }
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  while (queue.length) {
    const [r, c] = queue.pop();
    for (const [dr, dc] of dirs) {
      const nr = r+dr, nc = c+dc;
      if (nr < 0 || nr > 3 || nc < 0 || nc > 3) continue;
      const k = `${nr},${nc}`;
      if (!visited.has(k) && g[nr][nc]) { visited.add(k); queue.push([nr, nc]); }
    }
  }
  return visited;
}

function isBunnyConnected(g) {
  return stableSet(g).has(`${bunny[0]},${bunny[1]}`);
}

// Returns array of [r,c] cells that would fall if cell [tr,tc] is removed
function fallingAfterRemoval(g, tr, tc) {
  const next = g.map(row => [...row]);
  next[tr][tc] = false;
  const stable = stableSet(next);
  const fallen = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (next[r][c] && !stable.has(`${r},${c}`)) {
        fallen.push([r, c]);
        next[r][c] = false; // remove cascade cells from grid state too
      }
  return { next, fallen };
}

// ── Cell elements ─────────────────────────────────────────────────────────
function cellEl(r, c) {
  return gridEl.children[r * 4 + c];
}

// ── Render / Build grid ───────────────────────────────────────────────────
function buildGrid() {
  gridEl.innerHTML = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const div = document.createElement('div');
      div.className = 'lava-cell';
      div.dataset.r = r;
      div.dataset.c = c;
      refreshCell(div, r, c);
      div.addEventListener('click', () => onCellClick(r, c));
      gridEl.appendChild(div);
    }
  }
}

function refreshCell(div, r, c) {
  div.className = 'lava-cell';
  if (!grid[r][c]) {
    div.classList.add('empty');
    div.innerHTML = '';
    return;
  }
  const isBunny = r === bunny[0] && c === bunny[1];
  div.classList.add(isBunny ? 'bunny' : 'filled');
  if (isBunny) {
    const img = document.createElement('img');
    img.src = BUNNY_SRC;
    img.className = 'lava-bunny-img';
    img.alt = 'bunny';
    div.innerHTML = '';
    div.appendChild(img);
  } else {
    div.innerHTML = '';
  }
}

function refreshAllCells() {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      refreshCell(cellEl(r, c), r, c);
}

// ── Click handler ─────────────────────────────────────────────────────────
function onCellClick(r, c) {
  if (busy) return;
  if (!grid[r][c]) return;                          // empty
  if (r === bunny[0] && c === bunny[1]) return;     // bunny block

  // Simulate removal: check if bunny stays connected
  const nextG = grid.map(row => [...row]);
  nextG[r][c] = false;

  if (!isBunnyConnected(nextG)) {
    flashInvalid(r, c);
    return;
  }

  // Valid removal
  busy = true;
  const { next, fallen } = fallingAfterRemoval(grid, r, c);
  grid = next;
  remaining--;
  updateCounter();

  // Animate: clicked block + any cascade fallers
  const toFall = [[r, c], ...fallen];
  animateFalling(toFall, () => {
    // After fall animations, apply grid state to DOM
    refreshAllCells();
    busy = false;

    // Check win
    if (remaining === 0) {
      if (isBunnyConnected(grid)) {
        triggerWin();
      }
      // if somehow bunny disconnected at exactly 0 (shouldn't happen with guards), treat as lose
    }
  });
}

// ── Animations ────────────────────────────────────────────────────────────
function flashInvalid(r, c) {
  const el = cellEl(r, c);
  el.classList.remove('flash-invalid');
  void el.offsetWidth; // reflow
  el.classList.add('flash-invalid');
  el.addEventListener('animationend', () => el.classList.remove('flash-invalid'), { once: true });
}

function animateFalling(cells, done) {
  if (cells.length === 0) { done(); return; }
  for (const [r, c] of cells) cellEl(r, c).classList.add('falling');
  // blockFall animation is 0.45s; allow 550ms then call done regardless
  setTimeout(done, 550);
}

function animateBunnyFall(done) {
  cellEl(bunny[0], bunny[1]).classList.add('bunny-falling');
  // bunnyFall animation is 0.35s; allow 450ms
  setTimeout(done, 450);
}

// ── Counter ───────────────────────────────────────────────────────────────
function updateCounter() {
  countEl.textContent = remaining;
}

// ── Win / Lose ────────────────────────────────────────────────────────────
function triggerWin() {
  // Save progress
  const saved = parseInt(localStorage.getItem(STORAGE_KEY) || '1', 10);
  const next = currentLevel + 2; // 1-based next level
  if (next > saved) localStorage.setItem(STORAGE_KEY, Math.min(next, levels.length));

  winSubEl.textContent = currentLevel < levels.length - 1
    ? `Level ${currentLevel + 1} complete!`
    : 'You cleared all 25 levels!';

  const nextBtn = document.getElementById('lava-win-next');
  if (currentLevel >= levels.length - 1) {
    nextBtn.style.display = 'none';
  } else {
    nextBtn.style.display = '';
  }

  winOverlay.classList.remove('hidden');
}

function triggerLose() {
  busy = true;
  animateBunnyFall(() => {
    loseOverlay.classList.remove('hidden');
    busy = false;
  });
}

// ── Load level ────────────────────────────────────────────────────────────
function loadLevel(index) {
  const lvl = levels[index];
  if (!lvl) return;

  currentLevel = index;
  bunny = [...lvl.bunny];
  remaining = lvl.removeCount;
  grid = lvl.grid.map(row => row.map(v => v === 1));

  levelLabelEl.textContent = `Level ${lvl.level}`;
  updateCounter();
  buildGrid();

  winOverlay.classList.add('hidden');
  loseOverlay.classList.add('hidden');
  busy = false;
}

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  gridEl        = document.getElementById('lava-grid');
  countEl       = document.getElementById('lava-count');
  levelLabelEl  = document.getElementById('lava-level-label');
  winOverlay    = document.getElementById('lava-win');
  loseOverlay   = document.getElementById('lava-lose');
  winSubEl      = document.getElementById('lava-win-sub');

  // Load levels
  try {
    const res = await fetch('assets/data/lava-levels.json');
    levels = await res.json();
  } catch (e) {
    console.error('Lava: could not load levels', e);
    levelLabelEl.textContent = 'Error loading levels';
    return;
  }

  // Start at first level (could extend to last unlocked)
  loadLevel(0);

  // Help
  document.getElementById('help-btn').addEventListener('click', () => openDirections(DIRECTIONS_TEXT));

  // Restart
  document.getElementById('lava-restart-btn').addEventListener('click', () => {
    if (busy) return;
    loadLevel(currentLevel);
  });

  // Win overlay buttons
  document.getElementById('lava-win-next').addEventListener('click', () => {
    if (currentLevel < levels.length - 1) loadLevel(currentLevel + 1);
  });
  document.getElementById('lava-win-restart').addEventListener('click', () => loadLevel(currentLevel));

  // Lose overlay
  document.getElementById('lava-lose-restart').addEventListener('click', () => loadLevel(currentLevel));
});
