/* ── Lava — rotate & gravity puzzle (player-chosen direction) ─────────────── */
'use strict';

const DIRECTIONS_TEXT =
  'Lava gives you a 4×4 grid of ice blocks floating above lava. The blue bunny is perched on one of them. ' +
  'Each turn: click a block to remove it, then choose which way to rotate the grid — clockwise or counterclockwise. ' +
  'After every rotation, gravity pulls everything down, and any block that hits the bottom of the frame ' +
  'with nothing beneath it falls into the lava and is gone. If the bunny\'s block hits the frame, it\'s over. ' +
  'Every puzzle is exactly four moves. Think carefully — your rotation choice changes everything.';

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
      if (r === bunnyPos[0] && c === bunnyPos[1]) newBunnyPos = [c, size-1-r];
    }
  }
  return { newGrid, newBunnyPos };
}

function rotateGrid90CCW(grid, bunnyPos) {
  const size = 4;
  const newGrid = Array.from({length: size}, () => Array(size).fill(0));
  let newBunnyPos = [0, 0];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      newGrid[size-1-c][r] = grid[r][c];
      if (r === bunnyPos[0] && c === bunnyPos[1]) newBunnyPos = [size-1-c, r];
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
        if (r === bunnyPos[0] && c === bunnyPos[1]) bunnyIndexInColumn = blocks.length;
        blocks.push(1);
      }
    }
    if (blocks.length === 0) continue;
    if (blocks.length === 1) {
      if (bunnyIndexInColumn === 0) bunnySurvived = false;
      continue;
    }
    const bottomBlockIsBunny = (bunnyIndexInColumn === blocks.length - 1);
    if (bottomBlockIsBunny) { bunnySurvived = false; continue; }
    const surviving = blocks.length - 1;
    for (let i = 0; i < surviving; i++) {
      const newRow = size - 1 - i;
      newGrid[newRow][c] = 1;
      const originalIndex = surviving - 1 - i;
      if (bunnyIndexInColumn === originalIndex) newBunnyPos = [newRow, c];
    }
  }

  if (!bunnySurvived) return { newGrid, newBunnyPos: null, bunnySurvived: false };
  return { newGrid, newBunnyPos: newBunnyPos || bunnyPos, bunnySurvived: true };
}

function simulateTurn(grid, bunnyPos, removePos, direction) {
  const afterRemove = grid.map(r => [...r]);
  afterRemove[removePos[0]][removePos[1]] = 0;
  const { newGrid: rotated, newBunnyPos: bunnyAfterRotate } =
    direction === 'CW'
      ? rotateGrid90CW(afterRemove, bunnyPos)
      : rotateGrid90CCW(afterRemove, bunnyPos);
  return applyGravity(rotated, bunnyAfterRotate);
}

function isWin(grid, bunnyPos) {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (grid[r][c] && !(r === bunnyPos[0] && c === bunnyPos[1])) return false;
  return true;
}

// ── State ─────────────────────────────────────────────────────────────────────
let levels = [];
let currentLevel = 0;
let grid = [];
let bunny = [0, 0];
// Turn state machine: 'IDLE' | 'AWAITING_DIRECTION' | 'ANIMATING'
let turnState = 'IDLE';
let pendingRemovePos = null;
let moveCount = 0;

// ── DOM ───────────────────────────────────────────────────────────────────────
let gridEl, countEl, levelLabelEl, winOverlay, loseOverlay, winSubEl;
let cwBtn, ccwBtn, rotatePromptEl;

// ── Helpers ───────────────────────────────────────────────────────────────────
function cellEl(r, c) { return gridEl.children[r * 4 + c]; }

function updateCounter() {
  countEl.textContent = moveCount;
}

function setRotateButtons(active) {
  cwBtn.disabled  = !active;
  ccwBtn.disabled = !active;
  cwBtn.classList.toggle('lava-rotate-active', active);
  ccwBtn.classList.toggle('lava-rotate-active', active);
  rotatePromptEl.classList.toggle('hidden', !active);
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

// ── Block click (Step 1 of turn) ─────────────────────────────────────────────
function onCellClick(r, c) {
  if (turnState !== 'IDLE') return;
  if (!grid[r][c]) return;
  if (r === bunny[0] && c === bunny[1]) return;

  // Visually pop the block off immediately
  const el = cellEl(r, c);
  el.classList.remove('filled');
  el.classList.add('empty');
  el.innerHTML = '';

  pendingRemovePos = [r, c];
  moveCount++;
  updateCounter();
  turnState = 'AWAITING_DIRECTION';
  setRotateButtons(true);
}

// ── Direction click (Step 2 of turn) ─────────────────────────────────────────
function onDirectionClick(direction) {
  if (turnState !== 'AWAITING_DIRECTION') return;
  turnState = 'ANIMATING';
  setRotateButtons(false);

  const result = simulateTurn(grid, bunny, pendingRemovePos, direction);

  // Identify which original DOM cells gravity will remove.
  // CW:  rotated[rotR][rotC] came from original[3-rotC][rotR]
  // CCW: rotated[rotR][rotC] came from original[rotC][3-rotR]
  const afterRemove = grid.map(row => [...row]);
  afterRemove[pendingRemovePos[0]][pendingRemovePos[1]] = 0;
  const { newGrid: rotatedGrid } = direction === 'CW'
    ? rotateGrid90CW(afterRemove, bunny)
    : rotateGrid90CCW(afterRemove, bunny);

  const fallenDomCells = [];
  for (let rotC = 0; rotC < 4; rotC++) {
    let bottomRotR = -1;
    for (let rotR = 3; rotR >= 0; rotR--) {
      if (rotatedGrid[rotR][rotC]) { bottomRotR = rotR; break; }
    }
    if (bottomRotR === -1) continue;
    let origR, origC;
    if (direction === 'CW') {
      origR = 3 - rotC;
      origC = bottomRotR;
    } else {
      origR = rotC;
      origC = 3 - bottomRotR;
    }
    if (origR === pendingRemovePos[0] && origC === pendingRemovePos[1]) continue;
    fallenDomCells.push([origR, origC]);
  }

  // CSS rotation animation
  const deg = direction === 'CW' ? 90 : -90;
  setTimeout(() => {
    gridEl.style.transition = 'transform 0.5s ease-in-out';
    void gridEl.offsetWidth;
    gridEl.style.transform = `rotate(${deg}deg)`;

    let rotationHandled = false;
    const afterRotation = () => {
      if (rotationHandled) return;
      rotationHandled = true;
      gridEl.removeEventListener('transitionend', onTransitionEnd);

      if (!result.bunnySurvived) {
        gridEl.style.transition = 'none';
        gridEl.style.transform = '';
        void gridEl.offsetWidth;
        gridEl.style.transition = '';
        grid[pendingRemovePos[0]][pendingRemovePos[1]] = 0;
        refreshAllCells();
        triggerLose();
        return;
      }

      // Capture screen positions of gravity-fallen cells while grid is rotated
      const fallenRects = fallenDomCells.map(([dr, dc]) => ({
        rect: cellEl(dr, dc).getBoundingClientRect(),
        isBunnyCell: dr === bunny[0] && dc === bunny[1],
      }));

      // Snap grid back to 0°, apply physics state
      gridEl.style.transition = 'none';
      gridEl.style.transform = '';
      void gridEl.offsetWidth;
      gridEl.style.transition = '';

      grid = result.newGrid;
      bunny = result.newBunnyPos;
      refreshAllCells();

      // Gravity-fall clone animation
      const clones = fallenRects.map(({ rect, isBunnyCell }) => {
        const clone = document.createElement('div');
        clone.className = 'lava-cell lava-gravity-clone ' + (isBunnyCell ? 'bunny' : 'filled');
        clone.style.cssText =
          `position:fixed;left:${rect.left}px;top:${rect.top}px;` +
          `width:${rect.width}px;height:${rect.height}px;` +
          `z-index:50;pointer-events:none;margin:0;box-sizing:border-box;`;
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
        pendingRemovePos = null;
        if (isWin(grid, bunny)) {
          triggerWin();
        } else {
          turnState = 'IDLE';
        }
      }, 260);
    };

    const onTransitionEnd = (e) => { if (e.target === gridEl) afterRotation(); };
    gridEl.addEventListener('transitionend', onTransitionEnd);
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
  turnState = 'ANIMATING';
  animateBunnyFall(() => {
    loseOverlay.classList.remove('hidden');
    turnState = 'IDLE';
  });
}

// ── Solution / Give Up ────────────────────────────────────────────────────────
function showSolution() {
  const lvl = levels[currentLevel];
  if (!lvl || !lvl.solution) return;
  // Highlight removal blocks and show direction pattern
  const dirPattern = lvl.solution.map(s => s.direction).join(' → ');
  const hintEl = document.getElementById('lava-solution-hint');
  if (hintEl) { hintEl.textContent = `Rotations: ${dirPattern}`; hintEl.classList.remove('hidden'); }
  lvl.solution.forEach(({ remove }) => {
    if (grid[remove[0]][remove[1]]) cellEl(remove[0], remove[1]).classList.add('solution-highlight');
  });
}

function doGiveUp() {
  loseOverlay.classList.add('hidden');
  loadLevel(currentLevel);
  showSolution();
  setTimeout(() => {
    document.getElementById('lava-solution-hint')?.classList.add('hidden');
    if (currentLevel >= levels.length - 1) {
      document.getElementById('lava-complete').classList.remove('hidden');
    } else {
      loadLevel(currentLevel + 1);
    }
  }, 2000);
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
  turnState = 'IDLE';
  pendingRemovePos = null;
  moveCount = 0;

  gridEl.style.transition = 'none';
  gridEl.style.transform = '';

  levelLabelEl.textContent = `Level ${lvl.level}`;
  updateCounter();
  buildGrid();
  setRotateButtons(false);

  winOverlay.classList.add('hidden');
  loseOverlay.classList.add('hidden');
  document.getElementById('lava-complete').classList.add('hidden');
  document.getElementById('lava-solution-hint')?.classList.add('hidden');
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
  gridEl        = document.getElementById('lava-grid');
  countEl       = document.getElementById('lava-count');
  levelLabelEl  = document.getElementById('lava-level-label');
  winOverlay    = document.getElementById('lava-win');
  loseOverlay   = document.getElementById('lava-lose');
  winSubEl      = document.getElementById('lava-win-sub');
  cwBtn         = document.getElementById('lava-cw-btn');
  ccwBtn        = document.getElementById('lava-ccw-btn');
  rotatePromptEl = document.getElementById('lava-rotate-prompt');

  try {
    const res = await fetch('assets/data/lava-levels.json');
    levels = await res.json();
  } catch (e) {
    console.error('Lava: could not load levels', e);
    levelLabelEl.textContent = 'Error loading levels';
    return;
  }

  // Splash: shown on every fresh page load
  const splashEl = document.getElementById('lava-splash');
  loadLevel(0);

  document.getElementById('lava-splash-play').addEventListener('click', () => {
    splashEl.classList.add('hidden');
    const saved = parseInt(localStorage.getItem(STORAGE_KEY) || '1', 10);
    if (saved > 1) showLevelSelect(Math.min(saved, levels.length));
  });

  document.getElementById('help-btn').addEventListener('click', () => openDirections(DIRECTIONS_TEXT));

  cwBtn.addEventListener('click',  () => onDirectionClick('CW'));
  ccwBtn.addEventListener('click', () => onDirectionClick('CCW'));

  document.getElementById('lava-restart-btn').addEventListener('click', () => {
    if (turnState === 'ANIMATING') return;
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
