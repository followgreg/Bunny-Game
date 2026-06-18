// cubrick.js — Cubrick isometric city puzzle
// Part 2: page scaffold, event listeners, puzzle data loading

var CUBRICK_DIRECTIONS = 'Select a piece from the tray. Tap the grid to place it. Fill every cell to build the city. Use Rotate to spin the selected piece before placing. Undo takes back your last move.';

// ── Button event listeners ─────────────────────────────────────────────────
document.getElementById('help-btn').addEventListener('click', function () { openDirections(CUBRICK_DIRECTIONS); });
document.getElementById('new-btn').addEventListener('click', loadNewPuzzle);
document.getElementById('cub-undo-btn').addEventListener('click', doUndo);
document.getElementById('cub-reset-btn').addEventListener('click', doReset);
document.getElementById('cub-rotate-btn').addEventListener('click', doRotate);
document.getElementById('cub-new-puzzle-btn').addEventListener('click', loadNewPuzzle);
document.getElementById('share-btn').addEventListener('click', doShare);

// ── State ──────────────────────────────────────────────────────────────────
var puzzles       = [];
var currentPuzzle = null;
var moveCount     = 0;
var selectedPiece = null;   // piece id string ('A'–'G'), or null
var placedPieces  = {};     // { pieceId: [[r,c],...] } — final placed cells
var undoStack     = [];     // [{ pieceId, cells }]
var winState      = false;
var lastPuzzleId  = null;

// ── Canvas ─────────────────────────────────────────────────────────────────
var canvas     = document.getElementById('cub-canvas');
var ctx        = canvas.getContext('2d');
var canvasWrap = document.getElementById('cub-canvas-wrap');

function resizeCanvas() {
  var rect = canvasWrap.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  var dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width  = rect.width  + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // render() wired up in Part 3
}

// ── Puzzle loading ─────────────────────────────────────────────────────────
function loadPuzzleData() {
  fetch('cubrick-puzzles.json')
    .then(function (res) { return res.json(); })
    .then(function (data) { puzzles = data; loadNewPuzzle(); })
    .catch(function (err) { console.error('Cubrick: failed to load puzzles:', err); });
}

function loadNewPuzzle() {
  if (!puzzles.length) return;
  var candidates = puzzles.length > 1
    ? puzzles.filter(function (p) { return p.id !== lastPuzzleId; })
    : puzzles;
  currentPuzzle = candidates[Math.floor(Math.random() * candidates.length)];
  lastPuzzleId  = currentPuzzle.id;
  moveCount     = 0;
  selectedPiece = null;
  placedPieces  = {};
  undoStack     = [];
  winState      = false;

  // Restore play area if coming from results screen
  document.getElementById('cub-canvas-area').style.display = '';
  document.getElementById('cub-tray').style.display = '';
  document.getElementById('cub-results').classList.remove('cub-results-visible');
  canvas.style.pointerEvents = '';

  updateMoveCounter();
  updateUndoButton();
  updateRotateButton();
  // buildTray() and render() wired up in Parts 3–4
}

// ── HUD updates ────────────────────────────────────────────────────────────
function updateMoveCounter() {
  document.getElementById('cub-moves').textContent = moveCount;
}

function updateUndoButton() {
  document.getElementById('cub-undo-btn').disabled = (undoStack.length === 0);
}

function updateRotateButton() {
  document.getElementById('cub-rotate-btn').disabled = !selectedPiece || !!placedPieces[selectedPiece];
}

function shakeCanvas() {
  canvasWrap.classList.add('cub-shake');
  setTimeout(function () { canvasWrap.classList.remove('cub-shake'); }, 320);
}

// ── Placeholder actions (implemented in Parts 3–6) ─────────────────────────
function doUndo()  { /* Part 5 */ }
function doReset() { /* Part 5 */ }
function doRotate(){ /* Part 4 */ }

function doShare() {
  var text = 'Cubrick — built the city in ' + moveCount + ' move' + (moveCount === 1 ? '' : 's') + '. https://www.thebunnygame.com/cubrick';
  shareText(text, 'Cubrick — Bunny Game');
}

// ── Resize handling ────────────────────────────────────────────────────────
new ResizeObserver(function () { resizeCanvas(); }).observe(canvasWrap);
window.addEventListener('resize', function () { resizeCanvas(); });
window.addEventListener('orientationchange', function () { setTimeout(resizeCanvas, 120); });

// ── Init ───────────────────────────────────────────────────────────────────
requestAnimationFrame(function () {
  resizeCanvas();
  loadPuzzleData();
});

openDirections(CUBRICK_DIRECTIONS);
