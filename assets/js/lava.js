/* ── Lava — rotate & gravity puzzle ──────────────────────────────────────── */
'use strict';

const DIRECTIONS_TEXT =
  'Lava gives you a 4×4 grid of ice blocks floating above lava. The blue bunny is perched on one of them. ' +
  'Each turn, click a block to remove it — then the whole grid rotates 90° clockwise and gravity pulls everything down. ' +
  'Any block that hits the bottom of the frame with nothing beneath it falls into the lava and is gone. ' +
  'If the bunny\'s block hits the frame, the bunny falls in too and the round is over. ' +
  'Clear every block except the bunny\'s and you win. Think carefully — every rotation changes everything.';

const BUNNY_SRC = 'assets/icons/blue-bunny.svg';
const STORAGE_KEY = 'lava_highestLevel';

// ── Physics — identical to generate-lava-levels.js ────────────────────────────

function rotateGrid90CW(grid, bunnyPos) {
  const size = 4;
  const newGrid = Array.from({length: size}, () => Array(size).fill(0));
  let newBunnyPos = [0, 0];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      newGrid[c][size-1-r] = grid[r][c];
      if (r === bunnyPos[0] && c === bunnyPos[1]) {
        newBunnyPos = [c, size-1-r];
      }
    }
  }
  return { newGrid, newBunnyPos };
}

function applyGravity(grid, bunnyPos) {
  const size = 4;
  const newGrid = Array.from({length: size}, () => Array(size).fill(0));
  let newBunnyPos = null;
  let bunnySurvived = true;

  for (let c = 0; c < size; c++) {
    const blocks = [];
    let bunnyIndexInColumn = -1;
    for (let r = 0; r < size; r++) {
      if (grid[r][c] !== 0) {
        if (r === bunnyPos[0] && c === bunnyPos[1]) {
          bunnyIndexInColumn = blocks.length;
        }
        blocks.push(1);
      }
    }
    if (blocks.length === 0) continue;
    if (blocks.length === 1) {
      if (bunnyIndexInColumn === 0) bunnySurvived = false;
      continue;
    }
    const surviving = blocks.length - 1;
    const bottomBlockWasBunny = (bunnyIndexInColumn === blocks.length - 1);
    if (bottomBlockWasBunny) { bunnySurvived = false; continue; }
    for (let i = 0; i < surviving; i++) {
      const newRow = size - 1 - i;
      newGrid[newRow][c] = 1;
      const originalIndexInSurviving = surviving - 1 - i;
      if (bunnyIndexInColumn === originalIndexInSurviving) {
        newBunnyPos = [newRow, c];
      }
    }
  }
  if (!bunnySurvived) return { newGrid, newBunnyPos: null, bunnySurvived: false };
  return { newGrid, newBunnyPos: newBunnyPos || bunnyPos, bunnySurvived: true };
}

function simulateTurn(grid, bunnyPos, removePos) {
  const afterRemove = grid.map(r => [...r]);
  afterRemove[removePos[0]][removePos[1]] = 0;
  const { newGrid: rotated, newBunnyPos: bunnyAfterRotate } = rotateGrid90CW(afterRemove, bunnyPos);
  const { newGrid: final, newBunnyPos: finalBunny, bunnySurvived } = applyGravity(rotated, bunnyAfterRotate);
  return { grid: final, bunnyPos: finalBunny, bunnySurvived };
}

function isWin(grid, bunnyPos) {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (grid[r][c] && !(r === bunnyPos[0] && c === bunnyPos[1]))
        return false;
  return true;
}

// ── State ─────────────────────────────────────────────────────────────────────
let levels = [];
let currentLevel = 0;
let grid = [];
let bunny = [0, 0];
let busy = false;
let moveCount = 0;

// ── DOM ───────────────────────────────────────────────────────────────────────
let gridEl, countEl, levelLabelEl, winOverlay, loseOverlay, winSubEl;

// ── Helpers ───────────────────────────────────────────────────────────────────
function cellEl(r, c) {
  return gridEl.children[r * 4 + c];
}

function blockCount() {
  let n = 0;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (grid[r][c] && !(r === bunny[0] && c === bunny[1])) n++;
  return n;
}

function updateCounter() {
  countEl.textContent = moveCount;
}

// ── Render ────────────────────────────────────────────────────────────────────
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
  if (!grid[r][c]) { div.classList.add('empty'); div.innerHTML = ''; return; }
  const isBunny = r === bunny[0] && c === bunny[1];
  div.classList.add(isBunny ? 'bunny' : 'filled');
  div.innerHTML = '';
  if (isBunny) {
    const img = document.createElement('img');
    img.src = BUNNY_SRC;
    img.className = 'lava-bunny-img';
    img.alt = 'bunny';
    div.appendChild(img);
  }
}

function refreshAllCells() {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      refreshCell(cellEl(r, c), r, c);
}

// ── Click handler with rotation animation ─────────────────────────────────────
function onCellClick(r, c) {
  if (busy) return;
  if (!grid[r][c]) return;
  if (r === bunny[0] && c === bunny[1]) return;
  busy = true;
  moveCount++;
  updateCounter();

  // Pre-compute the full turn result
  const result = simulateTurn(grid, bunny, [r, c]);

  // Identify which original DOM cells gravity will remove (for post-rotation clone animation).
  // rotateGrid90CW maps original[r][c] → rotated[c][3-r],
  // so rotated[rotR][rotC] came from original[3-rotC][rotR].
  const afterRemove = grid.map(row => [...row]);
  afterRemove[r][c] = 0;
  const { newGrid: rotatedGrid } = rotateGrid90CW(afterRemove, bunny);

  const fallenDomCells = []; // [origR, origC] for each cell gravity removes
  for (let rotC = 0; rotC < 4; rotC++) {
    let bottomRotR = -1;
    for (let rotR = 3; rotR >= 0; rotR--) {
      if (rotatedGrid[rotR][rotC]) { bottomRotR = rotR; break; }
    }
    if (bottomRotR === -1) continue;
    const origR = 3 - rotC;
    const origC = bottomRotR;
    if (origR === r && origC === c) continue; // already removed
    fallenDomCells.push([origR, origC]);
  }

  // Step 1: visually pop the clicked cell off immediately
  const clickedEl = cellEl(r, c);
  clickedEl.classList.remove('filled');
  clickedEl.classList.add('empty');
  clickedEl.innerHTML = '';

  // Step 2: brief pause then start grid CSS rotation
  setTimeout(() => {
    gridEl.style.transition = 'transform 0.5s ease-in-out';
    void gridEl.offsetWidth; // force reflow so transition takes effect
    gridEl.style.transform = 'rotate(90deg)';

    let rotationHandled = false;

    const afterRotation = () => {
      if (rotationHandled) return;
      rotationHandled = true;
      gridEl.removeEventListener('transitionend', onTransitionEnd);

      if (!result.bunnySurvived) {
        // Snap grid back, re-render with bunny still visible, play lose animation
        gridEl.style.transition = 'none';
        gridEl.style.transform = '';
        void gridEl.offsetWidth;
        gridEl.style.transition = '';
        refreshAllCells();
        triggerLose();
        return;
      }

      // Capture screen positions of gravity-fallen cells while grid is still at 90°
      const fallenRects = fallenDomCells.map(([dr, dc]) => ({
        rect: cellEl(dr, dc).getBoundingClientRect(),
        isBunnyCell: dr === bunny[0] && dc === bunny[1],
      }));

      // Step 3: snap grid back to 0°, re-render final state
      gridEl.style.transition = 'none';
      gridEl.style.transform = '';
      void gridEl.offsetWidth;
      gridEl.style.transition = '';

      grid = result.grid;
      bunny = result.bunnyPos;
      refreshAllCells();
      updateCounter();

      // Step 4: create fixed-position clones of fallen cells and animate them down
      const clones = fallenRects.map(({ rect, isBunnyCell }) => {
        const clone = document.createElement('div');
        clone.className = 'lava-cell lava-gravity-clone ' + (isBunnyCell ? 'bunny' : 'filled');
        clone.style.cssText =
          `position:fixed;left:${rect.left}px;top:${rect.top}px;` +
          `width:${rect.width}px;height:${rect.height}px;` +
          `z-index:50;pointer-events:none;margin:0;padding:0;box-sizing:border-box;`;
        document.body.appendChild(clone);
        return clone;
      });

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          clones.forEach(cl => cl.classList.add('gravity-falling'));
        });
      });

      setTimeout(() => {
        clones.forEach(cl => cl.remove());
        if (isWin(grid, bunny)) {
          triggerWin();
        } else {
          busy = false;
        }
      }, 260);
    };

    const onTransitionEnd = (e) => { if (e.target === gridEl) afterRotation(); };
    gridEl.addEventListener('transitionend', onTransitionEnd);
    // Fallback: if transitionend never fires, proceed after transition duration
    setTimeout(afterRotation, 560);
  }, 80);
}

// ── Animations ────────────────────────────────────────────────────────────────
function animateBunnyFall(done) {
  const el = cellEl(bunny[0], bunny[1]);
  if (el) el.classList.add('bunny-falling');
  setTimeout(done, 450);
}

// ── Win / Lose ────────────────────────────────────────────────────────────────
function triggerWin() {
  const saved = parseInt(localStorage.getItem(STORAGE_KEY) || '1', 10);
  const next = currentLevel + 2;
  if (next > saved) localStorage.setItem(STORAGE_KEY, Math.min(next, levels.length));

  const bunnyCell = cellEl(bunny[0], bunny[1]);
  bunnyCell.classList.add('bunny-bounce');
  setTimeout(() => bunnyCell.classList.remove('bunny-bounce'), 800);

  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (grid[r][c]) cellEl(r, c).classList.add('win-glow');

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

// ── Solution / Give Up ────────────────────────────────────────────────────────
function showSolution() {
  const lvl = levels[currentLevel];
  if (!lvl || !lvl.solution) return;
  const solSet = new Set(lvl.solution.map(([r, c]) => `${r},${c}`));
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (solSet.has(`${r},${c}`)) cellEl(r, c).classList.add('solution-highlight');
}

function doGiveUp() {
  loseOverlay.classList.add('hidden');
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

// ── Share ─────────────────────────────────────────────────────────────────────
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

// ── Load level ────────────────────────────────────────────────────────────────
function loadLevel(index) {
  const lvl = levels[index];
  if (!lvl) return;

  currentLevel = index;
  bunny = [...lvl.bunny];
  grid = [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]];
  moveCount = 0;

  // Reset any in-progress grid rotation
  gridEl.style.transition = 'none';
  gridEl.style.transform = '';

  levelLabelEl.textContent = `Level ${lvl.level}`;
  updateCounter();
  buildGrid();

  winOverlay.classList.add('hidden');
  loseOverlay.classList.add('hidden');
  document.getElementById('lava-complete').classList.add('hidden');
  busy = false;
}

// ── Level select ──────────────────────────────────────────────────────────────
function showLevelSelect(highestLevel) {
  const overlay = document.getElementById('lava-level-select');
  document.getElementById('lava-continue-label').textContent =
    `Continue from Level ${Math.min(highestLevel, levels.length)}`;
  overlay.classList.remove('hidden');
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  gridEl       = document.getElementById('lava-grid');
  countEl      = document.getElementById('lava-count');
  levelLabelEl = document.getElementById('lava-level-label');
  winOverlay   = document.getElementById('lava-win');
  loseOverlay  = document.getElementById('lava-lose');
  winSubEl     = document.getElementById('lava-win-sub');

  try {
    const res = await fetch('assets/data/lava-levels.json');
    levels = await res.json();
  } catch (e) {
    console.error('Lava: could not load levels', e);
    levelLabelEl.textContent = 'Error loading levels';
    return;
  }

  // Splash: shown on every fresh page load; Play button dismisses it
  const splashEl = document.getElementById('lava-splash');
  loadLevel(0); // pre-load so grid is ready behind splash

  document.getElementById('lava-splash-play').addEventListener('click', () => {
    splashEl.classList.add('hidden');
    const saved = parseInt(localStorage.getItem(STORAGE_KEY) || '1', 10);
    if (saved > 1) {
      showLevelSelect(Math.min(saved, levels.length));
    }
  });

  document.getElementById('help-btn').addEventListener('click', () => openDirections(DIRECTIONS_TEXT));

  document.getElementById('lava-restart-btn').addEventListener('click', () => {
    if (busy) return;
    loadLevel(currentLevel);
  });

  document.getElementById('lava-win-next').addEventListener('click', () => {
    if (currentLevel < levels.length - 1) loadLevel(currentLevel + 1);
  });
  document.getElementById('lava-win-restart').addEventListener('click', () => loadLevel(currentLevel));

  document.getElementById('lava-lose-restart').addEventListener('click', () => loadLevel(currentLevel));
  document.getElementById('lava-lose-giveup').addEventListener('click', doGiveUp);

  document.getElementById('lava-continue-btn').addEventListener('click', () => {
    const s = parseInt(localStorage.getItem(STORAGE_KEY) || '1', 10);
    document.getElementById('lava-level-select').classList.add('hidden');
    loadLevel(Math.min(s, levels.length) - 1);
  });
  document.getElementById('lava-from-start-btn').addEventListener('click', () => {
    document.getElementById('lava-level-select').classList.add('hidden');
    loadLevel(0);
  });

  document.getElementById('lava-share-btn').addEventListener('click', doShare);
  document.getElementById('lava-play-again-btn').addEventListener('click', () => {
    document.getElementById('lava-complete').classList.add('hidden');
    loadLevel(0);
  });
});
