import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from './node_modules/sharp/dist/index.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The wordmark ships as near-black ink; the board is deep navy, so it goes white.
let logo = readFileSync(join(__dirname, 'assets/logos/gumball_logo.svg'), 'utf8');
logo = logo
  .replace(/<\?xml[^>]*\?>\s*/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<defs>[\s\S]*?<\/defs>/g, '')
  .replace(/class="st0"/g, 'fill="#F8FAFC"');

const W = 1200, H = 630;
const BG = '#080d18', BG_HI = '#152238';
const INK = '#F8FAFC';

// Three primaries, the same three the game ships.
const COLORS = ['#ef4444', '#facc15', '#3b82f6'];

const LOGO_VB_W = 113.177, LOGO_VB_H = 19.41;
const LOGO_W = 380;
const LOGO_H = LOGO_W * (LOGO_VB_H / LOGO_VB_W);

// The board hangs off the ceiling, so the picture does too: a slab of gumballs
// packed against the top of the frame, one seven-cell crater bitten out of it
// on the right, and the marble already below the hole on its way out. The open
// half underneath is where the wordmark lives — which is also, conveniently,
// exactly what the real board looks like.
const PAD = 46;
const RAIL_H = 10;
const R = 24, SP = R * 2, SQ3_2 = Math.sqrt(3) / 2;
const ROW_H = SP * SQ3_2;
const ROWS = 5;

const GRID_W = W - PAD * 2;
const COLS = Math.floor(GRID_W / SP);
const X0 = PAD + (GRID_W - COLS * SP) / 2;
const Y0 = PAD + RAIL_H;

// The cell the marble was sitting in — right of centre, clear of the copy.
const MROW = 3, MCOL = 17;

const NB_EVEN = [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
const NB_ODD  = [[0, -1], [0, 1], [-1,  0], [-1, 1], [1,  0], [1, 1]];

const rowCols = (row) => (row & 1) ? COLS - 1 : COLS;
const cellX = (row, col) => X0 + R + col * SP + ((row & 1) ? R : 0);
const cellY = (row) => Y0 + R + row * ROW_H;

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= (1 + amt); g *= (1 + amt); b *= (1 + amt); }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// Deterministic colouring so the image is identical on every regeneration.
let seed = 20260806;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

let defs = '';
COLORS.forEach((c, i) => {
  defs += `<radialGradient id="b${i}" cx="33%" cy="30%" r="72%">` +
          `<stop offset="0%" stop-color="${shade(c, 0.58)}"/>` +
          `<stop offset="55%" stop-color="${c}"/>` +
          `<stop offset="100%" stop-color="${shade(c, -0.36)}"/></radialGradient>`;
});

const hollow = new Set([`${MROW},${MCOL}`]);
for (const [dr, dc] of (MROW & 1) ? NB_ODD : NB_EVEN) hollow.add(`${MROW + dr},${MCOL + dc}`);

let balls = '';
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < rowCols(row); col++) {
    const i = (rnd() * COLORS.length) | 0;         // drawn from the same stream
    if (hollow.has(`${row},${col}`)) continue;     // the crater
    const x = cellX(row, col), y = cellY(row);
    balls += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${R}" fill="url(#b${i})" ` +
             `stroke="rgba(0,0,0,0.30)" stroke-width="1.1"/>` +
             `<ellipse cx="${(x - R * 0.30).toFixed(1)}" cy="${(y - R * 0.38).toFixed(1)}" ` +
             `rx="${(R * 0.30).toFixed(1)}" ry="${(R * 0.19).toFixed(1)}" ` +
             `fill="rgba(255,255,255,0.55)" transform="rotate(-34 ${(x - R * 0.30).toFixed(1)} ${(y - R * 0.38).toFixed(1)})"/>`;
  }
}

// The rail the whole mass hangs off — and the thing the marble pointedly does
// not hang off.
const rail =
  `<rect x="${PAD}" y="${PAD}" width="${GRID_W}" height="${RAIL_H}" fill="url(#railg)"/>`;

// The empty socket the marble was sitting in, ringed so the eye finds it.
const px = cellX(MROW, MCOL), py = cellY(MROW);
const socket =
  `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${R * 1.34}" fill="rgba(8,13,24,0.55)"/>` +
  `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${R * 1.34}" fill="none" ` +
  `stroke="rgba(250,204,21,0.55)" stroke-width="2.6" stroke-dasharray="7 9"/>`;

// The marble, already out and falling clear of the mass.
const MX = px + 14, MY = 452;
const trail =
  `<line x1="${px.toFixed(1)}" y1="${(py + R * 1.6).toFixed(1)}" x2="${(MX - 6).toFixed(1)}" ` +
  `y2="${(MY - R * 1.7).toFixed(1)}" stroke="${INK}" stroke-opacity="0.32" stroke-width="3" ` +
  `stroke-dasharray="9 11" stroke-linecap="round"/>`;
const MR = R * 1.18;      // a shade bigger out in the open, where nothing crowds it
const marble =
  `<circle cx="${MX.toFixed(1)}" cy="${MY}" r="${(MR + 8).toFixed(1)}" fill="none" ` +
  `stroke="rgba(250,204,21,0.35)" stroke-width="2"/>` +
  `<circle cx="${MX.toFixed(1)}" cy="${MY}" r="${MR.toFixed(1)}" fill="url(#marbleg)" ` +
  `stroke="rgba(0,0,0,0.55)" stroke-width="1.4"/>` +
  `<ellipse cx="${MX.toFixed(1)}" cy="${MY}" rx="${(MR * 0.74).toFixed(1)}" ` +
  `ry="${(MR * 0.24).toFixed(1)}" fill="none" stroke="rgba(226,232,240,0.20)" ` +
  `stroke-width="${(MR * 0.26).toFixed(1)}" transform="rotate(-32 ${MX.toFixed(1)} ${MY})"/>` +
  `<ellipse cx="${(MX - MR * 0.30).toFixed(1)}" cy="${(MY - MR * 0.38).toFixed(1)}" ` +
  `rx="${(MR * 0.28).toFixed(1)}" ry="${(MR * 0.17).toFixed(1)}" fill="rgba(255,255,255,0.72)" ` +
  `transform="rotate(-34 ${(MX - MR * 0.30).toFixed(1)} ${(MY - MR * 0.38).toFixed(1)})"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BG_HI}"/>
      <stop offset="100%" stop-color="${BG}"/>
    </linearGradient>
    <linearGradient id="railg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7c8ba1"/>
      <stop offset="100%" stop-color="#2b3a4f"/>
    </linearGradient>
    <radialGradient id="marbleg" cx="34%" cy="30%" r="72%">
      <stop offset="0%" stop-color="#c3ccd8"/>
      <stop offset="34%" stop-color="#6b7a90"/>
      <stop offset="72%" stop-color="#2c3e50"/>
      <stop offset="100%" stop-color="#0b1017"/>
    </radialGradient>
    ${defs}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="${PAD}" y="${PAD}" width="${W - PAD * 2}" height="${H - PAD * 2}" fill="none"
        stroke="${INK}" stroke-opacity="0.10" stroke-width="1"/>

  ${rail}
  ${balls}
  ${socket}
  ${trail}
  ${marble}

  <g transform="translate(78, 330) scale(${LOGO_W / LOGO_VB_W})">
    ${logo}
  </g>
  <text x="78" y="${330 + LOGO_H + 54}"
    font-family="DM Sans, Helvetica, Arial, sans-serif"
    font-size="29" fill="${INK}" fill-opacity="0.62">
    The marble never matches,
  </text>
  <text x="78" y="${330 + LOGO_H + 92}"
    font-family="DM Sans, Helvetica, Arial, sans-serif"
    font-size="29" fill="${INK}" fill-opacity="0.62">
    and nothing sticks to it.
  </text>

  <text x="78" y="${H - 62}"
    font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="22" font-weight="700"
    letter-spacing="3.2" fill="${INK}" fill-opacity="0.5">
    CLEAR ITS LAST SUPPORT AND IT DROPS
  </text>
</svg>`;

await sharp(Buffer.from(svg))
  .resize(W, H, { fit: 'fill' })
  .png()
  .toFile(join(__dirname, 'assets/og-images/gumball-og.png'));

console.log('✓ gumball-og.png written');
