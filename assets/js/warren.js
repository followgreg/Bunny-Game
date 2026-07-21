/* ── Warren — 8×8 region-queens puzzle ─────────────────────────────────── */
'use strict';

const N = 8;
const STORAGE_KEY = 'warren_progress';

// ── Solver (win-check only) ──────────────────────────────────────────────
function countSolutions(regionGrid, maxCount = 2) {
  const reg = new Uint8Array(N * N);
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      reg[r * N + c] = regionGrid[r][c];

  let count = 0;
  const placed = new Int8Array(N).fill(-1);
  let ucb = 0, urb = 0;

  function hasFeasible(row, prevCol, u, v) {
    for (let c = 0; c < N; c++) {
      if (u & (1 << c)) continue;
      if (Math.abs(c - prevCol) <= 1) continue;
      const r = reg[row * N + c];
      if (!r || (v & (1 << (r - 1)))) continue;
      return true;
    }
    return false;
  }

  function bt(row) {
    if (count >= maxCount) return;
    if (row === N) { count++; return; }
    const prevCol = row > 0 ? placed[row - 1] : -99;
    for (let col = 0; col < N; col++) {
      if (ucb & (1 << col)) continue;
      if (Math.abs(col - prevCol) <= 1) continue;
      const region = reg[row * N + col];
      if (!region) continue;
      const rb = 1 << (region - 1);
      if (urb & rb) continue;
      const nu = ucb | (1 << col), nv = urb | rb;
      let ok = true;
      for (let fr = row + 1; fr < N && ok; fr++) {
        if (!hasFeasible(fr, fr === row + 1 ? col : -99, nu, nv)) ok = false;
      }
      if (!ok) continue;
      placed[row] = col; ucb = nu; urb = nv;
      bt(row + 1);
      placed[row] = -1; ucb ^= (1 << col); urb ^= rb;
    }
  }

  bt(0);
  return count;
}

// ── State ────────────────────────────────────────────────────────────────
let boards = [];
let boardIndex = 0;
let board = null;          // current board object
let cells = [];            // flat array of {state: 'empty'|'marked'|'bunny'}
let timerSecs = 0;
let timerInterval = null;
let gameDone = false;
let doubleTapTracker = {};  // cellIdx → lastTapTime
let lastTapTime = {};

// ── DOM refs ─────────────────────────────────────────────────────────────
let gridEl, timerEl, boardNumEl, winEl, winTimeEl, splashEl, giveupEl;

// ── Boot ─────────────────────────────────────────────────────────────────
async function init() {
  gridEl     = document.getElementById('warren-grid');
  timerEl    = document.getElementById('warren-timer');
  boardNumEl = document.getElementById('warren-board-num');
  winEl      = document.getElementById('warren-win');
  winTimeEl  = document.getElementById('warren-win-time');
  splashEl   = document.getElementById('warren-splash');
  giveupEl   = document.getElementById('warren-giveup');

  try {
    const resp = await fetch('assets/data/warren-boards.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    boards = await resp.json();
  } catch (err) {
    console.error('Warren: could not load boards:', err);
    // Show error in meta bar rather than silently hanging
    if (boardNumEl) boardNumEl.textContent = 'Error loading puzzles';
    return;
  }

  loadProgress();
  buildDemoGrid();
  showSplash();
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    boardIndex = Math.min(saved.boardIndex || 0, boards.length - 1);
  } catch { boardIndex = 0; }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ boardIndex }));
}

// ── Splash ───────────────────────────────────────────────────────────────
function showSplash() {
  splashEl.classList.add('show');
}

function hideSplash() {
  splashEl.classList.remove('show');
  startGame();
}

// ── Demo 4×4 grid ────────────────────────────────────────────────────────
function buildDemoGrid() {
  const demoEl = document.getElementById('warren-demo-grid');
  if (!demoEl) return;

  // Simple 4×4 illustration: 4 regions, valid placement shown
  const regionMap = [
    [1,1,2,2],
    [1,3,2,2],
    [3,3,4,2],
    [3,4,4,4],
  ];
  const solution = [[0,3],[1,1],[2,3],[3,2]]; // not used here — just show a demo state
  const bunnies = new Set(['0,3','1,0','2,2','3,1']); // one valid 4-queen arrangement
  const marks   = new Set(['0,0','0,1','0,2','1,2','1,3','2,0','2,1','2,3','3,0','3,3']);

  const colors = ['','#e07b54','#5b8dd9','#4caa82','#8b6240'];
  demoEl.innerHTML = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const d = document.createElement('div');
      d.className = 'splash-demo-cell';
      d.style.background = colors[regionMap[r][c]];
      const key = `${r},${c}`;
      if (bunnies.has(key)) d.classList.add('bunny');
      else if (marks.has(key)) d.classList.add('x');
      demoEl.appendChild(d);
    }
  }
}

// ── Game start ───────────────────────────────────────────────────────────
function startGame(idx) {
  if (idx !== undefined) boardIndex = idx;
  board = boards[boardIndex];
  cells = Array(N * N).fill(null).map(() => ({ state: 'empty' }));
  gameDone = false;

  boardNumEl.textContent = `Puzzle ${board.board}`;
  renderGrid();
  resetTimer();
  startTimer();
  saveProgress();
}

// ── Grid render ──────────────────────────────────────────────────────────
function renderGrid() {
  gridEl.innerHTML = '';
  const { regionGrid } = board;

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const idx = r * N + c;
      const region = regionGrid[r][c];
      const cellEl = document.createElement('div');
      cellEl.className = 'warren-cell';
      cellEl.dataset.region = region;
      cellEl.dataset.idx = idx;

      // Thick borders where region changes
      if (r === 0 || regionGrid[r-1][c] !== region) cellEl.classList.add('border-top');
      if (c === 0 || regionGrid[r][c-1] !== region) cellEl.classList.add('border-left');
      if (r === N-1 || regionGrid[r+1][c] !== region) cellEl.classList.add('border-bottom');
      if (c === N-1 || regionGrid[r][c+1] !== region) cellEl.classList.add('border-right');

      cellEl.addEventListener('click', () => onCellTap(idx, r, c));
      gridEl.appendChild(cellEl);
    }
  }
  updateCellDisplay();
}

function updateCellDisplay() {
  const cellEls = gridEl.querySelectorAll('.warren-cell');
  const conflictSet = findConflicts();

  cellEls.forEach((el, idx) => {
    const state = cells[idx].state;
    el.classList.remove('marked', 'bunny', 'conflict', 'error');
    if (state === 'marked') el.classList.add('marked');
    else if (state === 'bunny') {
      el.classList.add('bunny');
      if (conflictSet.has(idx)) el.classList.add('conflict');
    }
  });
}

// ── Conflict detection (live feedback) ───────────────────────────────────
function findConflicts() {
  const conflicts = new Set();
  const bunnyIndices = [];
  cells.forEach((c, i) => { if (c.state === 'bunny') bunnyIndices.push(i); });

  // Row conflicts
  const rowCount = new Array(N).fill(0);
  const colCount = new Array(N).fill(0);
  const regCount = new Array(N + 1).fill(0);
  for (const idx of bunnyIndices) {
    const r = Math.floor(idx / N), c = idx % N;
    rowCount[r]++;
    colCount[c]++;
    regCount[board.regionGrid[r][c]]++;
  }

  for (const idx of bunnyIndices) {
    const r = Math.floor(idx / N), c = idx % N;
    const reg = board.regionGrid[r][c];
    if (rowCount[r] > 1 || colCount[c] > 1 || regCount[reg] > 1) {
      conflicts.add(idx);
    }
    // diagonal adjacency with other bunnies
    for (const idx2 of bunnyIndices) {
      if (idx2 === idx) continue;
      const r2 = Math.floor(idx2 / N), c2 = idx2 % N;
      if (Math.abs(r - r2) === 1 && Math.abs(c - c2) === 1) {
        conflicts.add(idx);
        conflicts.add(idx2);
      }
    }
  }

  return conflicts;
}

// ── Tap handling (single = X, double = bunny) ────────────────────────────
function onCellTap(idx, r, c) {
  if (gameDone) return;

  const now = Date.now();
  const last = lastTapTime[idx] || 0;
  const isDouble = (now - last) < 380;
  lastTapTime[idx] = now;

  const current = cells[idx].state;

  if (isDouble) {
    // double-tap cycles: marked→bunny, empty→bunny, bunny→empty
    cells[idx].state = current === 'bunny' ? 'empty' : 'bunny';
  } else {
    // single tap cycles: empty→marked, marked→empty, bunny→empty
    if (current === 'empty') cells[idx].state = 'marked';
    else if (current === 'marked') cells[idx].state = 'empty';
    else cells[idx].state = 'empty'; // bunny → remove on single tap too
  }

  updateCellDisplay();
  checkWin();
}

// ── Win detection ─────────────────────────────────────────────────────────
function checkWin() {
  const bunnies = cells.map((c, i) => c.state === 'bunny' ? i : -1).filter(i => i >= 0);
  if (bunnies.length !== N) return;
  if (findConflicts().size > 0) return;

  // Build grid with only placed bunnies
  const testGrid = board.regionGrid;
  if (countSolutions(testGrid, 2) === 1) {
    // Verify bunnies match the unique solution
    const sol = board.solution;
    const solSet = new Set(sol.map(([r, c]) => r * N + c));
    const bunnySet = new Set(bunnies);
    const match = [...solSet].every(i => bunnySet.has(i));
    if (match) triggerWin();
  }
}

// ── Win ──────────────────────────────────────────────────────────────────
function triggerWin() {
  gameDone = true;
  stopTimer();

  const mins = Math.floor(timerSecs / 60);
  const secs = timerSecs % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  winTimeEl.textContent = `Solved in ${timeStr}`;

  winEl.classList.add('show');
}

// ── Timer ─────────────────────────────────────────────────────────────────
function resetTimer() {
  stopTimer();
  timerSecs = 0;
  updateTimerDisplay();
}

function startTimer() {
  timerInterval = setInterval(() => {
    timerSecs++;
    updateTimerDisplay();
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimerDisplay() {
  const m = Math.floor(timerSecs / 60).toString().padStart(2, '0');
  const s = (timerSecs % 60).toString().padStart(2, '0');
  timerEl.textContent = `${m}:${s}`;
}

// ── Give Up ───────────────────────────────────────────────────────────────
function showGiveUp() {
  if (gameDone) return;
  giveupEl.classList.add('show');
}

function hideGiveUp() {
  giveupEl.classList.remove('show');
}

function revealSolution() {
  hideGiveUp();
  gameDone = true;
  stopTimer();

  // Clear all cells and place solution bunnies
  cells = Array(N * N).fill(null).map(() => ({ state: 'empty' }));
  for (const [r, c] of board.solution) {
    cells[r * N + c].state = 'bunny';
  }
  updateCellDisplay();
}

function restartPuzzle() {
  hideGiveUp();
  startGame();
}

// ── Next puzzle ──────────────────────────────────────────────────────────
function nextPuzzle() {
  winEl.classList.remove('show');
  boardIndex = (boardIndex + 1) % boards.length;
  startGame();
}

// ── Share ─────────────────────────────────────────────────────────────────
function shareSolve() {
  const mins = Math.floor(timerSecs / 60);
  const secs = timerSecs % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  const emoji = '🐇';
  const regionEmojis = ['🟧','🟦','🟨','🟥','🟩','🟫','⬜','🟪'];

  // Build grid emoji
  const lines = [];
  for (let r = 0; r < N; r++) {
    let line = '';
    for (let c = 0; c < N; c++) {
      const region = board.regionGrid[r][c] - 1;
      const isBunny = cells[r * N + c].state === 'bunny';
      line += isBunny ? emoji : regionEmojis[region];
    }
    lines.push(line);
  }

  const text = `Warren Puzzle ${board.board} ✓\n${timeStr}\n\n${lines.join('\n')}\n\nhttps://www.thebunnygame.com/warren`;
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!'));
  }
}

function showToast(msg) {
  const toast = document.getElementById('warren-toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Export to window for HTML onclick ────────────────────────────────────
window.warrenHideSplash  = hideSplash;
window.warrenShowGiveUp  = showGiveUp;
window.warrenHideGiveUp  = hideGiveUp;
window.warrenReveal      = revealSolution;
window.warrenRestart     = restartPuzzle;
window.warrenNextPuzzle  = nextPuzzle;
window.warrenShare       = shareSolve;
window.warrenShowHelp    = () => splashEl.classList.add('show');

document.addEventListener('DOMContentLoaded', init);
