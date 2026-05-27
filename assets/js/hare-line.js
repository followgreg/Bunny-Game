// hare-line.js — Hare Line sliding puzzle

const DIRECTIONS_TEXT = 'One blank space. Twenty four characters. Five red bunnies that need to line up. Slide tiles into the empty space to move them around the board. You can only move a tile that is directly next to the blank — click it and it slides over. No free swaps. Get all five red bunnies into the same row or column to win. The blank doesn\'t count as a bunny. Your score is how many slides it took. There is no losing — only a new puzzle.';

// =============================================================================
// SOLVABILITY CHECK
// =============================================================================
function isSolvable(grid) {
  const VAL = { 'blue-bunny': 1, 'red-bunny': 2, 'mushroom': 3, 'cabbage': 4, 'carrot': 5 };
  const seq = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (grid[r][c] !== null) seq.push(VAL[grid[r][c]]);
  let inversions = 0;
  for (let i = 0; i < seq.length - 1; i++) for (let j = i + 1; j < seq.length; j++) if (seq[i] > seq[j]) inversions++;
  return inversions % 2 === 0;
}

// =============================================================================
// GAME LOGIC — Hare Line
// =============================================================================
class HareLineGame {
  constructor() {
    this.rows = 5; this.cols = 5; this.moves = 0; this.gameOver = false;
    const result = this._generateBoard();
    this.grid = result.grid; this.blankPos = result.blankPos;
  }
  _generateBoard() {
    const FILLERS = ['blue-bunny', 'mushroom', 'cabbage', 'carrot'];
    const nonCorners = [];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++)
        if (!((r === 0 || r === 4) && (c === 0 || c === 4))) nonCorners.push([r, c]);
    for (;;) {
      const [br, bc] = nonCorners[(Math.random() * nonCorners.length) | 0];
      const remaining = [];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!(r === br && c === bc)) remaining.push([r, c]);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      const grid = Array.from({ length: 5 }, () => new Array(5).fill(null));
      for (let i = 0; i < 5; i++) { const [r, c] = remaining[i]; grid[r][c] = 'red-bunny'; }
      for (let i = 5; i < 24; i++) { const [r, c] = remaining[i]; grid[r][c] = FILLERS[(Math.random() * FILLERS.length) | 0]; }
      if (this._checkWin(grid)) continue;
      if (!isSolvable(grid)) {
        let fixed = false;
        outer: for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 4; c++) {
            if (grid[r][c] !== null && grid[r][c+1] !== null) {
              const tmp = grid[r][c]; grid[r][c] = grid[r][c+1]; grid[r][c+1] = tmp;
              fixed = true; break outer;
            }
          }
        }
        if (!fixed) continue;
        if (this._checkWin(grid)) continue;
        if (!isSolvable(grid)) continue;
      }
      return { grid, blankPos: { row: br, col: bc } };
    }
  }
  _checkWin(grid) {
    for (let r = 0; r < 5; r++) if (grid[r].every(cell => cell === 'red-bunny')) return true;
    for (let c = 0; c < 5; c++) {
      let allRed = true;
      for (let r = 0; r < 5; r++) if (grid[r][c] !== 'red-bunny') { allRed = false; break; }
      if (allRed) return true;
    }
    return false;
  }
  click(row, col) {
    if (this.gameOver) return null;
    const { row: br, col: bc } = this.blankPos;
    const dr = Math.abs(row - br), dc = Math.abs(col - bc);
    if (!((dr === 1 && dc === 0) || (dr === 0 && dc === 1))) return null;
    this.grid[br][bc] = this.grid[row][col];
    this.grid[row][col] = null;
    this.blankPos = { row, col };
    this.moves++;
    if (this._checkWin(this.grid)) { this.gameOver = true; return 'win'; }
    return 'slide';
  }
}

// =============================================================================
// DOM RENDERER
// =============================================================================
let game = null;

function renderHareLine() {
  const board = document.getElementById('hareline-board');
  board.innerHTML = '';
  if (!(game instanceof HareLineGame)) return;
  const { row: br, col: bc } = game.blankPos;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const type      = game.grid[r][c];
      const isBlank   = type === null;
      const dr = Math.abs(r - br), dc = Math.abs(c - bc);
      const slideable = !isBlank && ((dr === 1 && dc === 0) || (dr === 0 && dc === 1));
      const cell = document.createElement('div');
      cell.className = 'hl-cell';
      if (isBlank) {
        cell.classList.add('hl-blank');
      } else {
        if (type === 'red-bunny') cell.classList.add('hl-red');
        if (slideable) cell.classList.add('hl-slideable');
        const img = document.createElement('img');
        img.src = `assets/icons/${type}.svg`; img.alt = type;
        cell.appendChild(img);
      }
      if (slideable && !game.gameOver) {
        cell.addEventListener('click', (function (row, col) {
          return function () {
            const result = game.click(row, col);
            if (result === null) return;
            renderHareLine(); updateStats();
            if (result === 'win') setTimeout(() => showHareLineResult(), 350);
          };
        })(r, c));
      }
      board.appendChild(cell);
    }
  }
}

function updateStats() {
  if (!game) return;
  document.getElementById('val-remaining').textContent = game.moves;
  document.getElementById('val-moves').textContent     = game.moves;
}

function showHareLineResult() {
  const moves = game.moves;
  document.getElementById('perf-banner').classList.add('hidden');
  document.getElementById('modal-title').textContent = 'Hare Line!';
  document.getElementById('modal-score').textContent = `Solved in ${moves} slide${moves !== 1 ? 's' : ''}`;
  document.getElementById('modal-sub').textContent   = '';
  document.getElementById('modal-breakdown').innerHTML = '<p class="perfect-msg">All five red bunnies lined up!</p>';
  document.getElementById('overlay').classList.remove('hidden');
}

document.getElementById('new-btn').addEventListener('click', () => startGame());
document.getElementById('help-btn').addEventListener('click', () => openDirections(DIRECTIONS_TEXT));
document.getElementById('play-again-btn').addEventListener('click', () => {
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('play-again-btn').textContent = 'Play Again';
  startGame();
});
document.getElementById('share-btn').addEventListener('click', () => {
  const moves = game ? game.moves : 0;
  const text = `Hare Line — slid into place in ${moves} move${moves !== 1 ? 's' : ''}. https://www.thebunnygame.com/hare-line`;
  shareText(text, 'Hare Line — Bunny Game');
});

let dirsSeen = false;
function startGame() {
  game = new HareLineGame();
  document.getElementById('overlay').classList.add('hidden');
  renderHareLine(); updateStats();
  if (!dirsSeen) { dirsSeen = true; openDirections(DIRECTIONS_TEXT); }
}

(function bootstrap() {
  // HareLine uses DOM, not canvas — start immediately via rAF
  requestAnimationFrame(function () { startGame(); });
})();
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js'); }
