// hexflip.js — HexFlip logic puzzle

const DIRECTIONS_TEXT = 'A hex grid. All black is the goal. Click any hex and it flips -- along with every hex touching it. You get exactly 3 clicks. If the board isn\'t all black after 3 clicks it resets and you try again. No time limit. No penalty for trying. The puzzle has exactly one solution. Find it.';

// =============================================================================
// HEXFLIP — level helpers, seeded RNG, game class
// =============================================================================

function hfRingsForLevel(lvl) {
  if (lvl <= 6)  return 1;
  if (lvl <= 14) return 2;
  if (lvl <= 24) return 3;
  return 3 + Math.floor((lvl - 15) / 10);
}

function hfBuildHexList(rings) {
  const hexes = [];
  for (let q = -rings; q <= rings; q++) {
    const r1 = Math.max(-rings, -q - rings);
    const r2 = Math.min( rings, -q + rings);
    for (let r = r1; r <= r2; r++) hexes.push({ q, r });
  }
  return hexes;
}

function hfBuildFlipMasks(hexes) {
  const DIRS   = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
  const idxMap = new Map(hexes.map((h, i) => [`${h.q},${h.r}`, i]));
  return hexes.map((h, i) => {
    const mask = [i];
    for (const [dq, dr] of DIRS) {
      const ni = idxMap.get(`${h.q + dq},${h.r + dr}`);
      if (ni !== undefined) mask.push(ni);
    }
    return mask;
  });
}

function hfSeededRng(seed) {
  let s = (seed ^ 0xDEADBEEF) >>> 0;
  return function() {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

// Display level is offset by 9: internal level 10 → shown as #1
function hfDisplayLevel(internal) { return internal - 9; }

let hfCurrentLevel    = Math.max(10, parseInt(localStorage.getItem('hexflip_level') || '10'));
let hfCompletedLevels = new Set(JSON.parse(localStorage.getItem('hexflip_completed') || '[]'));

class HexFlipGame {
  constructor(level) {
    this.level      = level;
    this.rings      = hfRingsForLevel(level);
    this.hexes      = hfBuildHexList(this.rings);
    this.N          = this.hexes.length;
    this.flipMasks  = hfBuildFlipMasks(this.hexes);
    this.state      = null;
    this.startState = null;
    this.solution   = null;
    this.noSolution = false;
    this.movesMade      = [];
    this.tries          = 0;
    this.solved         = false;
    this.failed         = false;
    this.showingSolution = false;
    this.highlightedHex  = -1;
    this.pendingReset    = false;
    this._generate();
  }

  _generate() {
    const N   = this.N;
    const fm  = this.flipMasks;
    const rng = hfSeededRng(this.level * 9973 + 31337);

    const flipBM = fm.map(mask => {
      let bm = 0n;
      for (const idx of mask) bm |= (1n << BigInt(idx));
      return bm;
    });
    const flipBMMap = new Map(flipBM.map((bm, i) => [bm, i]));

    for (let attempt = 0; attempt < 5000; attempt++) {
      let a = (rng() * N) | 0;
      let b; do { b = (rng() * N) | 0; } while (b === a);
      let c; do { c = (rng() * N) | 0; } while (c === a || c === b);

      const startBM = flipBM[a] ^ flipBM[b] ^ flipBM[c];
      if (startBM === 0n) continue;

      let solCount = 0;
      let solFound = null;
      found:
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const target = startBM ^ flipBM[i] ^ flipBM[j];
          const k = flipBMMap.get(target);
          if (k !== undefined && k > j) {
            solCount++;
            if (solFound === null) solFound = [i, j, k];
            if (solCount > 1) break found;
          }
        }
      }
      if (solCount !== 1) continue;

      const state = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        if (startBM & (1n << BigInt(i))) state[i] = 1;
      }

      this.solution  = solFound;
      this.state     = state;
      this.startState = new Uint8Array(state);
      return;
    }

    // Fallback: unsolvable placeholder
    this.noSolution = true;
    this.state      = new Uint8Array(N).fill(1);
    this.startState = new Uint8Array(N).fill(1);
  }

  click(hexIndex) {
    if (this.solved || this.showingSolution || this.pendingReset) return null;
    if (this.movesMade.length >= 3) return null;
    this.movesMade.push(hexIndex);
    for (const idx of this.flipMasks[hexIndex]) this.state[idx] ^= 1;
    if (this.movesMade.length === 3) {
      this.tries++;
      if (!this.state.some(v => v)) { this.solved = true; return 'solved'; }
      this.failed = true; this.pendingReset = true; return 'failed';
    }
    return 'click';
  }

  resetToStart() {
    this.state        = new Uint8Array(this.startState);
    this.movesMade    = [];
    this.pendingReset = false;
  }

  blackCount() { let n = 0; for (const v of this.state) if (!v) n++; return n; }
  whiteCount() { let n = 0; for (const v of this.state) if (v)  n++; return n; }
}

// =============================================================================
// HEXFLIP — renderer and animation
// =============================================================================
const HF_SQRT3 = Math.sqrt(3);
let hfAnimTimeout = null;
let game = null;

function hfHexCornerPoints(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i - Math.PI / 6;
    pts.push(`${(cx + size * Math.cos(a)).toFixed(2)},${(cy + size * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

function hfHexToPixel(h, size) {
  return [
    size * HF_SQRT3 * (h.q + h.r / 2),
    size * 1.5 * h.r,
  ];
}

function renderHexFlip() {
  if (!(game instanceof HexFlipGame)) return;

  const boardWrap = document.getElementById('hf-board-wrap');
  const svg       = document.getElementById('hf-svg');
  if (!svg || !boardWrap) return;

  const hexWrap  = document.getElementById('hexflip-wrap');
  const wrapRect = hexWrap.getBoundingClientRect();
  const availW   = (wrapRect.width  || window.innerWidth)  - 24;
  const availH   = (wrapRect.height || (window.innerHeight - 148)) - 110;
  const rings    = game.rings;

  const maxByW  = availW / (HF_SQRT3 * (2 * rings + 1));
  const maxByH  = availH / (1.5 * (2 * rings) + 1);
  const sizeCap = rings <= 1 ? 54 : rings <= 2 ? 40 : rings <= 3 ? 30 : 24;
  const size    = Math.max(15, Math.min(Math.floor(Math.min(maxByW, maxByH)), sizeCap));

  svg.innerHTML = '';

  const N  = game.N;
  const hs = game.hexes;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const h of hs) {
    const [px, py] = hfHexToPixel(h, size);
    minX = Math.min(minX, px - size); maxX = Math.max(maxX, px + size);
    minY = Math.min(minY, py - size); maxY = Math.max(maxY, py + size);
  }
  const pad = 3;
  const bW  = maxX - minX + pad * 2;
  const bH  = maxY - minY + pad * 2;

  svg.setAttribute('width',   bW);
  svg.setAttribute('height',  bH);
  svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${bW} ${bH}`);

  const gap = Math.max(1, size * 0.06);

  for (let i = 0; i < N; i++) {
    const [px, py] = hfHexToPixel(hs[i], size);
    const isWhite   = game.state[i] === 1;
    const isHighlit = game.highlightedHex === i;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('hf-hex');
    if (game.solved || game.showingSolution || game.pendingReset) g.classList.add('hf-solving');

    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', hfHexCornerPoints(px, py, size - gap));
    poly.setAttribute('fill',
      isHighlit ? '#9ca3af'
      : isWhite  ? '#ffffff'
      :             '#111827');
    poly.setAttribute('stroke',       '#111827');
    poly.setAttribute('stroke-width', isHighlit ? '2.5' : '1.5');
    g.appendChild(poly);

    if (!game.solved && !game.showingSolution && !game.pendingReset) {
      g.addEventListener('click', (idx => () => hfHandleClick(idx))(i));
    }

    svg.appendChild(g);
  }

  hfUpdatePips();
  hfUpdateProgress();
  hfUpdateControls();
}

function hfHandleClick(hexIndex) {
  if (!(game instanceof HexFlipGame)) return;
  const result = game.click(hexIndex);
  if (!result) return;

  renderHexFlip();
  updateStats();

  if (result === 'solved') {
    hfCompletedLevels.add(game.level);
    localStorage.setItem('hexflip_completed', JSON.stringify([...hfCompletedLevels]));
    setTimeout(() => hfShowWin(), 420);
  } else if (result === 'failed') {
    const wrap = document.getElementById('hexflip-wrap');
    wrap.classList.remove('hf-shake');
    void wrap.offsetHeight;
    wrap.classList.add('hf-shake');
    const fb = document.getElementById('hf-feedback');
    fb.textContent = 'not quite';
    fb.style.opacity = '1';
    setTimeout(() => {
      game.resetToStart();
      fb.style.opacity = '0';
      wrap.classList.remove('hf-shake');
      document.getElementById('hf-solution-panel').style.display = 'none';
      renderHexFlip();
      updateStats();
    }, 1000);
  }
}

// Load any level by internal number (10 = display #1)
function hfLoadLevel(internalLevel) {
  hfCurrentLevel = internalLevel;
  localStorage.setItem('hexflip_level', String(hfCurrentLevel));
  hfHideWin();
  startGame();
}

function hfAdvanceLevel() { hfLoadLevel(hfCurrentLevel + 1); }

function hfShowWin() {
  if (!(game instanceof HexFlipGame)) return;
  const tries = game.tries;
  const lvl   = game.level;

  document.getElementById('hf-board-wrap').style.display     = 'none';
  document.getElementById('hf-controls').style.display       = 'none';
  document.getElementById('hf-feedback').style.opacity       = '0';
  document.getElementById('hf-solution-panel').style.display = 'none';

  document.getElementById('hf-win-headline').textContent =
    tries === 1 ? 'perfect — first try' : `solved in ${tries} ${tries === 1 ? 'try' : 'tries'}`;
  document.getElementById('hf-win-subline').textContent = `level ${hfDisplayLevel(lvl)} complete`;
  document.getElementById('hf-win-state').classList.add('hf-win-visible');

  hfUpdateProgress();
}

function hfHideWin() {
  document.getElementById('hf-win-state').classList.remove('hf-win-visible');
  document.getElementById('hf-board-wrap').style.display = '';
  document.getElementById('hf-controls').style.display   = '';
}

function hfUpdatePips() {
  const n = (game instanceof HexFlipGame) ? game.movesMade.length : 0;
  for (let i = 0; i < 3; i++) {
    const pip = document.getElementById(`hf-pip-${i}`);
    if (pip) pip.classList.toggle('hf-pip-filled', i < n);
  }
  const lbl = document.getElementById('hf-level-label');
  if (lbl && game instanceof HexFlipGame) {
    lbl.textContent = `#${hfDisplayLevel(game.level)}`;
  }
}

function hfUpdateProgress() {
  const prog = document.getElementById('hf-progress');
  if (!prog || !(game instanceof HexFlipGame)) return;
  const lvl   = game.level;
  const start = Math.max(10, lvl - 4);
  const end   = lvl + 4;
  prog.innerHTML = '';
  for (let l = start; l <= end; l++) {
    const done = hfCompletedLevels.has(l);
    const cur  = l === lvl;
    const dot  = document.createElement('span');
    dot.className = cur ? 'hf-dot hf-dot-current' : done ? 'hf-dot hf-dot-done' : 'hf-dot';
    dot.title = `Level ${hfDisplayLevel(l)}`;
    if (done && !cur) {
      dot.addEventListener('click', (lvlCopy => () => hfLoadLevel(lvlCopy))(l));
    }
    prog.appendChild(dot);
  }
}

function hfUpdateControls() {
  const btn = document.getElementById('hf-show-solution-btn');
  if (btn) btn.style.display = (game && game.failed && !game.solved && game.solution) ? '' : 'none';
}

function hfShowSolution() {
  if (!(game instanceof HexFlipGame) || !game.solution) return;
  clearTimeout(hfAnimTimeout);

  game.showingSolution = true;
  game.resetToStart();
  game.highlightedHex = -1;
  hfUpdateControls();

  const solPanel = document.getElementById('hf-solution-panel');
  solPanel.textContent = `Solution: ${game.solution.map(i => `hex ${i + 1}`).join(', ')}`;
  solPanel.style.display = '';
  renderHexFlip();

  const steps = [...game.solution];
  let s = 0;

  function tick() {
    if (s >= steps.length) {
      game.highlightedHex  = -1;
      game.showingSolution = false;
      renderHexFlip();
      solPanel.textContent = steps.map((idx, i) => `move ${i + 1}: hex ${idx + 1}`).join('  ·  ');
      solPanel.style.display = '';
      document.getElementById('hf-skip-btn').style.display = '';
      hfUpdateControls();
      return;
    }
    game.highlightedHex = steps[s];
    renderHexFlip();

    hfAnimTimeout = setTimeout(() => {
      for (const idx of game.flipMasks[steps[s]]) game.state[idx] ^= 1;
      game.highlightedHex = -1;
      s++;
      renderHexFlip();
      hfAnimTimeout = setTimeout(tick, 250);
    }, 900);
  }
  tick();
}

// =============================================================================
// STATS
// =============================================================================
function updateStats() {
  if (!game) return;
  document.getElementById('val-hf-black').textContent = game.blackCount();
  document.getElementById('val-hf-white').textContent = game.whiteCount();
  document.getElementById('val-hf-tries').textContent = game.tries;
}

// =============================================================================
// CONTROLS
// =============================================================================
document.getElementById('new-btn').addEventListener('click', () => startGame());
document.getElementById('help-btn').addEventListener('click', () => openDirections(DIRECTIONS_TEXT));

document.getElementById('hf-reset-btn').addEventListener('click', () => {
  if (!game || game.solved || game.showingSolution) return;
  clearTimeout(hfAnimTimeout);
  game.resetToStart();
  document.getElementById('hf-feedback').style.opacity       = '0';
  document.getElementById('hf-solution-panel').style.display = 'none';
  document.getElementById('hf-skip-btn').style.display       = 'none';
  document.getElementById('hexflip-wrap').classList.remove('hf-shake');
  renderHexFlip();
  updateStats();
});

document.getElementById('hf-show-solution-btn').addEventListener('click', () => hfShowSolution());
document.getElementById('hf-next-level-btn').addEventListener('click', () => hfAdvanceLevel());
document.getElementById('hf-skip-btn').addEventListener('click', () => hfAdvanceLevel());

document.getElementById('hf-copy-result-btn').addEventListener('click', () => {
  if (!game) return;
  const tries = game.tries;
  const lvl   = game.level;
  const text  = tries === 1
    ? `HexFlip level ${hfDisplayLevel(lvl)} -- solved first try https://www.thebunnygame.com/hexflip`
    : `HexFlip level ${hfDisplayLevel(lvl)} -- solved in ${tries} tries https://www.thebunnygame.com/hexflip`;
  const btn = document.getElementById('hf-copy-result-btn');
  if (navigator.share) {
    navigator.share({ title: 'HexFlip', text });
  } else {
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = 'Copy Result'; }, 2500);
    });
  }
});

document.getElementById('share-btn').addEventListener('click', () => {
  if (!game) return;
  const tries = game.tries;
  const lvl   = game.level;
  const text  = tries === 1
    ? `HexFlip level ${hfDisplayLevel(lvl)} -- solved first try https://www.thebunnygame.com/hexflip`
    : `HexFlip level ${hfDisplayLevel(lvl)} -- solved in ${tries} tries https://www.thebunnygame.com/hexflip`;
  shareText(text, 'HexFlip — Bunny Game');
});

// =============================================================================
// START GAME & BOOTSTRAP
// =============================================================================
let dirsSeen = false;

function startGame() {
  clearTimeout(hfAnimTimeout);
  game = null;
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('hf-solution-panel').style.display = 'none';
  document.getElementById('hf-skip-btn').style.display       = 'none';
  document.getElementById('hf-feedback').style.opacity       = '0';
  document.getElementById('hexflip-wrap').classList.remove('hf-shake');
  document.getElementById('hf-win-state').classList.remove('hf-win-visible');
  document.getElementById('hf-board-wrap').style.display = '';
  document.getElementById('hf-controls').style.display   = '';

  // Brief async gap so the UI can clear before heavy puzzle generation
  setTimeout(() => {
    game = new HexFlipGame(hfCurrentLevel);
    renderHexFlip();
    updateStats();
    if (!dirsSeen) { dirsSeen = true; openDirections(DIRECTIONS_TEXT); }
  }, 30);
}

(function bootstrap() {
  const hfWrap = document.getElementById('hf-board-wrap');
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      if (!game) startGame();
      else if (game instanceof HexFlipGame) renderHexFlip();
    }).observe(hfWrap);
  } else {
    window.addEventListener('resize', function () { if (game) renderHexFlip(); });
    requestAnimationFrame(function () { requestAnimationFrame(startGame); });
  }
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
