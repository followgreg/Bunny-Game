/* ── Lava — ice block puzzle ─────────────────────────────────────────────── */
'use strict';

const DIRECTIONS_TEXT =
  'Lava shows you a grid of ice blocks floating above molten lava. The blue bunny is perched ' +
  'on one of them. Your job is to knock out exactly the number of blocks shown -- no more, no ' +
  'less -- without ever leaving the bunny disconnected from the edge. A block stays safe as long ' +
  'as there\'s a path of neighboring blocks connecting it to the grid\'s outer edge. Remove the ' +
  'wrong one and the bunny falls. Figure out which blocks can go and which ones are holding ' +
  'everything together.';

const BUNNY_SRC = 'assets/icons/blue-bunny.svg';
const STORAGE_KEY = 'lava_highestLevel';

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

  // Bunny bounce celebration
  const bunnyCell = cellEl(bunny[0], bunny[1]);
  bunnyCell.classList.add('bunny-bounce');
  setTimeout(() => bunnyCell.classList.remove('bunny-bounce'), 800);

  // Glow filled cells
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (grid[r][c]) cellEl(r, c).classList.add('win-glow');

  // Show overlay after brief celebration
  setTimeout(() => {
    if (currentLevel >= levels.length - 1) {
      document.getElementById('lava-complete').classList.remove('hidden');
    } else {
      winSubEl.textContent = `Level ${currentLevel + 1} clear!`;
      winOverlay.classList.remove('hidden');
    }
  }, 500);
}

function triggerLose() {
  busy = true;
  animateBunnyFall(() => {
    loseOverlay.classList.remove('hidden');
    busy = false;
  });
}

// ── Solution / Give Up ────────────────────────────────────────────────────
function showSolution() {
  const lvl = levels[currentLevel];
  if (!lvl || !lvl.solution) return;
  const solSet = new Set(lvl.solution.map(([r, c]) => `${r},${c}`));
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (solSet.has(`${r},${c}`)) {
        const el = cellEl(r, c);
        el.classList.add('solution-highlight');
      }
}

function doGiveUp() {
  loseOverlay.classList.add('hidden');
  // Reload the level visually so solution is visible on a fresh grid
  loadLevel(currentLevel);
  showSolution();
  setTimeout(() => {
    if (currentLevel >= levels.length - 1) {
      document.getElementById('lava-complete').classList.remove('hidden');
    } else {
      loadLevel(currentLevel + 1);
    }
  }, 1500);
}

// ── Share (level 25 completion) ───────────────────────────────────────────
function doShare() {
  const text = 'Lava — kept the bunny safe through all 25 levels. Can you? https://www.thebunnygame.com/lava';
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('lava-share-btn');
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }).catch(() => {});
  }
}

// ── Load level ────────────────────────────────────────────────────────────
function loadLevel(index) {
  const lvl = levels[index];
  if (!lvl) return;

  currentLevel = index;
  bunny = [...lvl.bunny];
  remaining = lvl.removeCount;
  // Every level starts with all 16 cells filled — grid field is omitted from JSON
  grid = [[true,true,true,true],[true,true,true,true],[true,true,true,true],[true,true,true,true]];

  levelLabelEl.textContent = `Level ${lvl.level}`;
  updateCounter();
  buildGrid();

  winOverlay.classList.add('hidden');
  loseOverlay.classList.add('hidden');
  document.getElementById('lava-complete').classList.add('hidden');
  busy = false;
}

// ── Level select (continue prompt) ───────────────────────────────────────
function showLevelSelect(highestLevel) {
  const overlay = document.getElementById('lava-level-select');
  document.getElementById('lava-continue-label').textContent =
    `Continue from Level ${Math.min(highestLevel, levels.length)}`;
  overlay.classList.remove('hidden');
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

  // Check for saved progress
  const saved = parseInt(localStorage.getItem(STORAGE_KEY) || '1', 10);
  if (saved > 1) {
    loadLevel(0); // load level 1 behind the modal
    showLevelSelect(Math.min(saved, levels.length));
  } else {
    loadLevel(0);
  }

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
  document.getElementById('lava-lose-giveup').addEventListener('click', doGiveUp);

  // Level select overlay
  document.getElementById('lava-continue-btn').addEventListener('click', () => {
    const s = parseInt(localStorage.getItem(STORAGE_KEY) || '1', 10);
    document.getElementById('lava-level-select').classList.add('hidden');
    loadLevel(Math.min(s, levels.length) - 1); // 0-indexed
  });
  document.getElementById('lava-from-start-btn').addEventListener('click', () => {
    document.getElementById('lava-level-select').classList.add('hidden');
    loadLevel(0);
  });

  // Completion overlay (level 25)
  document.getElementById('lava-share-btn').addEventListener('click', doShare);
  document.getElementById('lava-play-again-btn').addEventListener('click', () => {
    document.getElementById('lava-complete').classList.add('hidden');
    loadLevel(0);
  });
});
