/* ── Sixty — sequence memory game ──────────────────────────────────────── */
'use strict';

const SIXTY_URL = 'https://www.thebunnygame.com/sixty';
const STORAGE_KEY = 'sixty_bestRound';

const BUTTONS = [
  { id: 1, color: '#E63946', litColor: '#FF6B75', note: 261.63 },
  { id: 2, color: '#2196F3', litColor: '#64B5F6', note: 329.63 },
  { id: 3, color: '#4CAF50', litColor: '#81C784', note: 392.00 },
  { id: 4, color: '#FF9800', litColor: '#FFB74D', note: 523.25 },
  { id: 5, color: '#9C27B0', litColor: '#CE93D8', note: 659.25 },
  { id: 6, color: '#FFEB3B', litColor: '#FFF176', note: 783.99 },
];

const DIRECTIONS_TEXT =
  'Sixty is Simon with six buttons and one goal: reach round sixty without a single mistake. ' +
  'Watch the sequence light up, then repeat it exactly. Each round adds one more step to the same growing sequence. ' +
  'Miss a step and it\'s over. The buttons always play the same sounds — use your ears as much as your eyes. ' +
  'How far can you get?';

// ── State ────────────────────────────────────────────────────────────────
let audioCtx = null;
let sequence = [];       // 60-step sequence, generated per run
let round = 0;           // current round (1-based)
let stepIndex = 0;       // player's position within current round
let playing = false;     // true during sequence playback
let gameActive = false;
let bestRound = 0;

// ── DOM refs ─────────────────────────────────────────────────────────────
const btnEls = {};
let roundEl, bestEl, statusEl, startBtn, overlay, modalTitle, modalScore, modalBest, modalEmoji;

// ── Audio ─────────────────────────────────────────────────────────────────
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(note, duration) {
  ensureAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.value = note;
  const t = audioCtx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.35, t + 0.02);
  gain.gain.setValueAtTime(0.35, t + duration / 1000 - 0.1);
  gain.gain.linearRampToValueAtTime(0, t + duration / 1000);
  osc.start(t);
  osc.stop(t + duration / 1000);
}

// ── Button flash ──────────────────────────────────────────────────────────
function lightBtn(id, duration) {
  const el = btnEls[id];
  if (!el) return;
  el.classList.add('lit');
  playTone(BUTTONS[id - 1].note, duration);
  return new Promise(res => setTimeout(() => {
    el.classList.remove('lit');
    res();
  }, duration));
}

function flashAllDark(duration) {
  Object.values(btnEls).forEach(el => el.classList.add('dark'));
  return new Promise(res => setTimeout(() => {
    Object.values(btnEls).forEach(el => el.classList.remove('dark'));
    res();
  }, duration));
}

// ── Sequence generation ───────────────────────────────────────────────────
function generateSequence() {
  sequence = Array.from({ length: 60 }, () => Math.floor(Math.random() * 6) + 1);
}

// ── Sequence playback ─────────────────────────────────────────────────────
async function playSequence(upToRound) {
  playing = true;
  setInputEnabled(false);
  setStatus('Watch the sequence…');

  for (let i = 0; i < upToRound; i++) {
    await lightBtn(sequence[i], 400);
    await delay(200);
  }

  playing = false;
  setInputEnabled(true);
  stepIndex = 0;
  setStatus('Your turn!');
}

// ── Player input ──────────────────────────────────────────────────────────
async function onButtonPress(id) {
  if (!gameActive || playing) return;

  await lightBtn(id, 400);

  const expected = sequence[stepIndex];

  if (id !== expected) {
    await handleFail();
    return;
  }

  stepIndex++;

  if (stepIndex === round) {
    // Completed round
    if (round === 60) {
      await handleWin();
    } else {
      setInputEnabled(false);
      setStatus('✓ Nice! Next round…');
      await delay(500);
      round++;
      updateRoundDisplay();
      await playSequence(round);
    }
  }
}

// ── Win / fail ────────────────────────────────────────────────────────────
async function handleWin() {
  gameActive = false;
  setInputEnabled(false);
  saveBest(60);

  // Celebratory pattern: cycle all buttons for ~3s
  ensureAudio();
  const celebEnd = Date.now() + 3000;
  let ci = 0;
  while (Date.now() < celebEnd) {
    const b = BUTTONS[ci % BUTTONS.length];
    const el = btnEls[b.id];
    el.classList.add('lit');
    playTone(b.note, 200);
    await delay(180);
    el.classList.remove('lit');
    await delay(40);
    ci++;
  }

  showModal(true);
}

async function handleFail() {
  gameActive = false;
  setInputEnabled(false);
  saveBest(round);

  await flashAllDark(300);
  await lightBtn(sequence[stepIndex], 500);
  await delay(300);

  showModal(false);
}

// ── Modal ─────────────────────────────────────────────────────────────────
function showModal(win) {
  if (win) {
    modalEmoji.textContent = '🎉';
    modalTitle.textContent = 'You reached Sixty!';
    modalScore.textContent = 'All 60 steps. Flawless.';
    modalBest.textContent = '';
    document.getElementById('sixty-share-btn').onclick = () => {
      shareText(
        `Sixty — reached all 60 steps without a single mistake. Can you? ${SIXTY_URL}`,
        'Sixty'
      );
    };
  } else {
    modalEmoji.textContent = '💀';
    modalTitle.textContent = 'Game Over';
    modalScore.textContent = `You reached round ${round}`;
    modalBest.textContent = `Best: ${bestRound}`;
    document.getElementById('sixty-share-btn').onclick = () => {
      shareText(
        `Sixty — made it to round ${round} before slipping up. Think you can beat that? ${SIXTY_URL}`,
        'Sixty'
      );
    };
  }
  overlay.classList.remove('hidden');
}

// ── New run ───────────────────────────────────────────────────────────────
async function startRun() {
  ensureAudio();
  overlay.classList.add('hidden');
  startBtn.classList.add('hidden');
  generateSequence();
  round = 1;
  stepIndex = 0;
  gameActive = true;
  updateRoundDisplay();
  await playSequence(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────
function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

function setInputEnabled(enabled) {
  Object.values(btnEls).forEach(el => {
    el.disabled = !enabled;
  });
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function updateRoundDisplay() {
  if (roundEl) roundEl.textContent = round;
}

function saveBest(r) {
  if (r > bestRound) {
    bestRound = r;
    localStorage.setItem(STORAGE_KEY, bestRound);
    if (bestEl) bestEl.textContent = bestRound;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  roundEl    = document.getElementById('sixty-round');
  bestEl     = document.getElementById('sixty-best');
  statusEl   = document.getElementById('sixty-status');
  startBtn   = document.getElementById('sixty-start-btn');
  overlay    = document.getElementById('sixty-overlay');
  modalTitle = document.getElementById('sixty-modal-title');
  modalScore = document.getElementById('sixty-modal-score');
  modalBest  = document.getElementById('sixty-modal-best');
  modalEmoji = document.getElementById('sixty-modal-emoji');

  // Load best
  bestRound = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
  if (bestEl) bestEl.textContent = bestRound || '—';

  // Wire game buttons
  document.querySelectorAll('.sixty-btn').forEach(el => {
    const id = parseInt(el.dataset.id, 10);
    btnEls[id] = el;
    el.disabled = true;
    el.addEventListener('click', () => onButtonPress(id));
  });

  // Start button
  startBtn.addEventListener('click', startRun);

  // Play Again
  document.getElementById('sixty-again-btn').addEventListener('click', startRun);

  // Help
  document.getElementById('help-btn').addEventListener('click', () => openDirections(DIRECTIONS_TEXT));

  setStatus('Press Start to begin');
});
