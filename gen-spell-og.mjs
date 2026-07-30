import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from './node_modules/sharp/dist/index.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Spell logo — strip the CSS class and paint the paths in the game's accent
let logo = readFileSync(join(__dirname, 'assets/logos/spell_logo.svg'), 'utf8');
logo = logo
  .replace(/<\?xml[^>]*\?>\s*/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<defs>[\s\S]*?<\/defs>/g, '')
  .replace(/class="st0"/g, 'fill="#60A5FA"');

// Real level data, so the image shows the game as it actually plays: a wide
// SNEK board, mostly blank cells, the word's letters spread along the path.
const LEVELS = JSON.parse(readFileSync(join(__dirname, 'assets/data/spell-levels.json'), 'utf8'));
const LEVEL = LEVELS.find(l => l.level === 24);   // GARDEN — 36 cells, 12x5
const TRACED = Math.round(LEVEL.solution.length * 0.55);

const W = 1200, H = 630;

// Layout: logo (left) over tagline, board to the right of centre
const LOGO_W = 380;
const LOGO_H = LOGO_W * (25.686 / 98.388);
const logoX = 84;
const logoY = 150;
const taglineY = logoY + LOGO_H + 52;

const cellSet = new Set(LEVEL.cells.map(([r, c]) => `${r},${c}`));
const rows = Math.max(...LEVEL.cells.map(([r]) => r)) + 1;
const cols = Math.max(...LEVEL.cells.map(([, c]) => c)) + 1;

const CELL = 34, GAP = 5;
const boardW = cols * CELL + GAP * (cols - 1);
const boardH = rows * CELL + GAP * (rows - 1);
const boardX = W - boardW - 84;
const boardY = (H - boardH) / 2;

// Path state up to the traced point
const path = LEVEL.solution.slice(0, TRACED);
const visited = new Map(path.map((c, i) => [`${c.q},${c.r}`, i]));
const head = path[path.length - 1];
const headKey = `${head.q},${head.r}`;

const FILL = { trail: '#166534', head: '#22C55E', empty: '#1E293B' };
const EDGE = { trail: '#22C55E', head: '#86EFAC', empty: '#334155' };
const TEXT = { trail: '#DCFCE7', head: '#0F172A', empty: '#E2E8F0' };

const px = c => boardX + c * (CELL + GAP);
const py = r => boardY + r * (CELL + GAP);
const cx = c => px(c) + CELL / 2;
const cy = r => py(r) + CELL / 2;

let cells = '', glyphs = '';
for (const [r, c] of LEVEL.cells) {
  const k = `${r},${c}`;
  const state = k === headKey ? 'head' : visited.has(k) ? 'trail' : 'empty';
  cells += `<rect x="${px(c)}" y="${py(r)}" width="${CELL}" height="${CELL}" rx="6" ` +
           `fill="${FILL[state]}" stroke="${EDGE[state]}" stroke-width="1.5"/>`;
  const letter = LEVEL.letterMap[k];
  if (letter) {
    glyphs += `<text x="${cx(c)}" y="${cy(r)}" font-family="DM Sans, Helvetica, Arial, sans-serif" ` +
              `font-size="20" font-weight="800" fill="${TEXT[state]}" ` +
              `text-anchor="middle" dominant-baseline="central">${letter}</text>`;
  }
}

const linePts = path.map(c => `${cx(c.r)},${cy(c.q)}`).join(' ');
const line = `<polyline points="${linePts}" fill="none" stroke="#60A5FA" ` +
             `stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;

// Blanks row under the logo — filled for letters already collected
const collected = LEVEL.word.split('').filter((_, i) => {
  const step = LEVEL.letterSteps[i];
  return step < TRACED;
}).length;

const SLOT_W = 34, SLOT_GAP = 12;
const blanksW = LEVEL.word.length * SLOT_W + (LEVEL.word.length - 1) * SLOT_GAP;
const blanksX = logoX;
const blanksY = taglineY + 74;
let blanks = '';
LEVEL.word.split('').forEach((ch, i) => {
  const x = blanksX + i * (SLOT_W + SLOT_GAP);
  const on = i < collected;
  if (on) {
    blanks += `<text x="${x + SLOT_W / 2}" y="${blanksY}" font-family="DM Sans, Helvetica, Arial, sans-serif" ` +
              `font-size="30" font-weight="800" fill="#E2E8F0" text-anchor="middle">${ch}</text>`;
  }
  blanks += `<rect x="${x}" y="${blanksY + 11}" width="${SLOT_W}" height="4" rx="2" ` +
            `fill="${on ? '#60A5FA' : '#334155'}"/>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0F172A"/>
  <g transform="translate(${logoX}, ${logoY}) scale(${LOGO_W / 98.388})">
    ${logo}
  </g>
  <text x="${logoX}" y="${taglineY}"
    font-family="DM Sans, Helvetica, Arial, sans-serif"
    font-size="23" font-weight="700" fill="rgba(148,163,184,0.9)"
    letter-spacing="1.5">TRACE THE PATH. SPELL THE WORD.</text>
  ${blanks}
  ${cells}
  ${line}
  ${glyphs}
</svg>`;

await sharp(Buffer.from(svg))
  .resize(1200, 630, { fit: 'fill' })
  .png()
  .toFile(join(__dirname, 'assets/og-images/spell-og.png'));

console.log(`✓ spell-og.png written — level ${LEVEL.level} (${LEVEL.word}), ` +
            `${LEVEL.cells.length} cells, ${TRACED} traced, ${collected}/${LEVEL.word.length} letters`);
