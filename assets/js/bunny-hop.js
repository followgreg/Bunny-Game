// bunny-hop.js — Bunny Hop peg solitaire

const DIRECTIONS_TEXT = 'One bunny stays. Everyone else hops out. Jump any blue bunny over an adjacent blue bunny into the empty space beyond — the bunny you jumped over disappears. You can only jump in a straight line, north south east or west, one bunny at a time. Chain your jumps wisely. The board starts with one empty space in the center. Your goal is to end with exactly one bunny remaining. That\'s enlightenment. Anything more than one is your score — lower is better. There is no time limit. Only the puzzle.';

// =============================================================================
// BOARD SHAPE
// 7×7 English cross: rows 0–1 & 5–6 use cols 2–4; rows 2–4 use all cols 0–6.
// =============================================================================
const BH_ACTIVE_GRID = (() => {
  const g = Array.from({ length: 7 }, () => new Array(7).fill(false));
  for (let c = 2; c <= 4; c++) { g[0][c] = true; g[1][c] = true; g[5][c] = true; g[6][c] = true; }
  for (let r = 2; r <= 4; r++) for (let c = 0; c <= 6; c++) g[r][c] = true;
  return g;
})();

// =============================================================================
// GAME LOGIC — Bunny Hop
// =============================================================================
class BunnyHopGame {
  constructor() {
    this.moves    = 0;
    this.gameOver = false;
    this.selected = null;   // [row, col] or null
    this.history  = [];
    this.grid     = this._freshBoard();
  }

  _freshBoard() {
    const g = Array.from({ length: 7 }, () => new Array(7).fill(null));
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++)
        if (BH_ACTIVE_GRID[r][c])
          g[r][c] = (r === 3 && c === 3) ? 0 : 1;  // 0 = empty hole, 1 = peg
    return g;
  }

  _isActive(r, c) {
    return r >= 0 && r < 7 && c >= 0 && c < 7 && BH_ACTIVE_GRID[r][c];
  }

  _validJumps(r, c) {
    if (!this._isActive(r, c) || this.grid[r][c] !== 1) return [];
    const jumps = [];
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const mr = r + dr,  mc = c + dc;
      const lr = r + 2*dr, lc = c + 2*dc;
      if (this._isActive(mr, mc) && this._isActive(lr, lc) &&
          this.grid[mr][mc] === 1 && this.grid[lr][lc] === 0) {
        jumps.push([lr, lc, mr, mc]);
      }
    }
    return jumps;
  }

  countPegs() {
    let n = 0;
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++)
        if (BH_ACTIVE_GRID[r][c] && this.grid[r][c] === 1) n++;
    return n;
  }

  _hasAnyJump() {
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++)
        if (BH_ACTIVE_GRID[r][c] && this.grid[r][c] === 1 && this._validJumps(r, c).length > 0)
          return true;
    return false;
  }

  // Returns 'select' | 'reselect' | 'deselect' | 'jump' | 'win' | 'stuck' | null
  click(row, col) {
    if (this.gameOver) return null;
    if (!this._isActive(row, col)) return null;

    if (this.grid[row][col] === 1) {
      if (this.selected && this.selected[0] === row && this.selected[1] === col) {
        this.selected = null;
        return 'deselect';
      }
      const had = this.selected !== null;
      this.selected = [row, col];
      return had ? 'reselect' : 'select';
    }

    if (this.grid[row][col] === 0 && this.selected !== null) {
      const [sr, sc] = this.selected;
      const jump = this._validJumps(sr, sc).find(([lr, lc]) => lr === row && lc === col);
      if (!jump) return null;

      const [lr, lc, mr, mc] = jump;
      this.history.push({ grid: this.grid.map(r => r.slice()), moves: this.moves });
      this.grid[sr][sc] = 0;
      this.grid[mr][mc] = 0;
      this.grid[lr][lc] = 1;
      this.moves++;
      this.selected = null;

      if (this.countPegs() === 1)  { this.gameOver = true; return 'win'; }
      if (!this._hasAnyJump())     { this.gameOver = true; return 'stuck'; }
      return 'jump';
    }

    return null;
  }

  undo() {
    if (!this.history.length) return false;
    const snap    = this.history.pop();
    this.grid     = snap.grid;
    this.moves    = snap.moves;
    this.selected = null;
    this.gameOver = false;
    return true;
  }
}

// =============================================================================
// DOM RENDERER
// =============================================================================
let game = null;

function renderBunnyHop() {
  const board = document.getElementById('bunnyhop-board');
  board.innerHTML = '';
  if (!(game instanceof BunnyHopGame)) return;

  const landings = new Set();
  if (game.selected && !game.gameOver) {
    const [sr, sc] = game.selected;
    for (const [lr, lc] of game._validJumps(sr, sc)) landings.add(`${lr},${lc}`);
  }

  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const cell = document.createElement('div');
      cell.className = 'bh-cell';

      if (!BH_ACTIVE_GRID[r][c]) {
        cell.classList.add('bh-inactive');
        board.appendChild(cell);
        continue;
      }

      const hasPeg     = game.grid[r][c] === 1;
      const isSelected = game.selected && game.selected[0] === r && game.selected[1] === c;
      const isLanding  = landings.has(`${r},${c}`);

      if (hasPeg) {
        cell.classList.add('bh-peg');
        if (isSelected) cell.classList.add('bh-selected');
        const img = document.createElement('img');
        img.src = 'assets/icons/blue-bunny.svg';
        img.alt = 'bunny';
        cell.appendChild(img);
      } else {
        cell.classList.add('bh-hole');
        if (isLanding) cell.classList.add('bh-landing');
      }

      if (!game.gameOver) {
        cell.addEventListener('click', (function(row, col) {
          return function() {
            const result = game.click(row, col);
            if (result === null) return;
            renderBunnyHop();
            updateStats();
            if (result === 'win' || result === 'stuck') {
              setTimeout(() => showBunnyHopResult(result), 350);
            }
          };
        })(r, c));
      }

      board.appendChild(cell);
    }
  }
}

// =============================================================================
// STATS
// =============================================================================
function updateStats() {
  if (!game) return;
  document.getElementById('val-remaining').textContent = game.countPegs();
  document.getElementById('val-moves').textContent     = game.moves;
}

// =============================================================================
// RESULT MODAL
// =============================================================================
function showBunnyHopResult(result) {
  const pegs   = game.countPegs();
  const moves  = game.moves;
  const perfEl = document.getElementById('perf-banner');

  if (result === 'win') {
    perfEl.style.background = 'linear-gradient(135deg, #14532d, #22c55e)';
    perfEl.textContent = '🐰 ONE BUNNY REMAINS!';
    perfEl.classList.remove('hidden');
    document.getElementById('modal-title').textContent  = 'One Bunny Remains.';
    document.getElementById('modal-score').textContent  = 'Perfect solve.';
    document.getElementById('modal-sub').textContent    = `${moves} move${moves !== 1 ? 's' : ''}`;
    document.getElementById('modal-breakdown').innerHTML =
      '<p class="perfect-msg">One bunny standing!</p>';
  } else {
    perfEl.classList.add('hidden');
    document.getElementById('modal-title').textContent  = `${pegs} ${pegs !== 1 ? 'Bunnies' : 'Bunny'} Remain.`;
    document.getElementById('modal-score').textContent  = `${moves} move${moves !== 1 ? 's' : ''} taken`;
    document.getElementById('modal-sub').textContent    = 'No more jumps available.';
    document.getElementById('modal-breakdown').innerHTML =
      `<p style="color:#94a3b8;font-size:0.85rem;padding:8px 0;text-align:center;">${pegs} ${pegs !== 1 ? 'bunnies' : 'bunny'} left with nowhere to jump.</p>`;
  }

  document.getElementById('overlay').classList.remove('hidden');
}

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
  const pegs  = game ? game.countPegs() : 0;
  const moves = game ? game.moves : 0;
  const text = pegs === 1
    ? `Bunny Hop — perfect solve. One bunny standing in ${moves} move${moves !== 1 ? 's' : ''}. https://www.thebunnygame.com/bunny-hop`
    : `Bunny Hop — ${pegs} bunnies remaining after ${moves} move${moves !== 1 ? 's' : ''}. https://www.thebunnygame.com/bunny-hop`;
  shareText(text, 'Bunny Hop — Bunny Game');
});

// =============================================================================
// START GAME & BOOTSTRAP
// =============================================================================
let dirsSeen = false;

function startGame() {
  game = new BunnyHopGame();
  document.getElementById('overlay').classList.add('hidden');
  renderBunnyHop();
  updateStats();
  if (!dirsSeen) { dirsSeen = true; openDirections(DIRECTIONS_TEXT); }
}

(function bootstrap() {
  requestAnimationFrame(function () { startGame(); });
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
