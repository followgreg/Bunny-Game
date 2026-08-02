import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from './node_modules/sharp/dist/index.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The wordmark ships as near-black ink. Molt's board is a dark felt table, so
// the fill is swapped for the card cream the game uses.
let logo = readFileSync(join(__dirname, 'assets/logos/molt_logo.svg'), 'utf8');
logo = logo
  .replace(/<\?xml[^>]*\?>\s*/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<defs>[\s\S]*?<\/defs>/g, '')
  .replace(/class="st0"/g, 'fill="#F7F3E6"');

const W = 1200, H = 630;
const FELT = '#12352A', FELT_HI = '#17402F';
const CARD = '#F7F3E6', INK = '#1B1712', RED = '#C0392B';
const BACK = '#2C5F4C', BACK_LINE = 'rgba(247,243,230,0.18)';
const GOLD = '#D9A441';

const LOGO_W = 470;
const LOGO_H = LOGO_W * (29.816 / 117.561);
const logoX = (W - LOGO_W) / 2;
const logoY = 96;
const taglineY = logoY + LOGO_H + 58;

// A row of stacks in the game's real shape: a face-up top card sitting on the
// visible edges of the cards it molted. Depth varies so the fan reads as the
// point of the picture.
const CW = 118, CH = Math.round(CW / 0.7), GAP = 26, EO = 7;
const stacks = [
  { r: 'A', s: '♠', red: false, buried: 0 },
  { r: '6', s: '♦', red: true,  buried: 2 },
  { r: '9', s: '♣', red: false, buried: 4 },
  { r: 'Q', s: '♥', red: true,  buried: 1 },
  { r: '4', s: '♠', red: false, buried: 3 },
];

const rowW = stacks.length * CW + (stacks.length - 1) * GAP;
const rowX = (W - rowW) / 2;
const rowY = 344;   // clear of the caption baseline at H-58

let board = '';
stacks.forEach((st, i) => {
  const x = rowX + i * (CW + GAP);
  // Molted edges first, deepest highest, so the top card lands over them.
  for (let e = st.buried; e >= 1; e--) {
    const y = rowY - e * EO;
    board += `<rect x="${x + 4}" y="${y}" width="${CW - 8}" height="${CH}" rx="11" ` +
             `fill="${BACK}" stroke="${BACK_LINE}" stroke-width="1.5"/>`;
  }
  board += `<rect x="${x}" y="${rowY}" width="${CW}" height="${CH}" rx="11" fill="${CARD}"/>`;
  const fill = st.red ? RED : INK;
  board += `<text x="${x + CW / 2}" y="${rowY + CH / 2 - 2}" font-size="46" font-weight="700" ` +
           `fill="${fill}" text-anchor="middle" font-family="DM Sans, Helvetica, Arial, sans-serif">${st.r}</text>` +
           `<text x="${x + CW / 2}" y="${rowY + CH / 2 + 44}" font-size="40" ` +
           `fill="${fill}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">${st.s}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="felt" cx="50%" cy="14%" r="78%">
      <stop offset="0%" stop-color="${FELT_HI}"/>
      <stop offset="62%" stop-color="${FELT}"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#felt)"/>
  <rect x="46" y="46" width="${W - 92}" height="${H - 92}" fill="none"
        stroke="${CARD}" stroke-opacity="0.12" stroke-width="1"/>
  <g transform="translate(${logoX}, ${logoY}) scale(${LOGO_W / 117.561})">
    ${logo}
  </g>
  <text x="${W / 2}" y="${taglineY}"
    font-family="DM Sans, Helvetica, Arial, sans-serif"
    font-size="31" fill="${CARD}" fill-opacity="0.62" text-anchor="middle">
    Cover a card and it molts. Remember what you buried.
  </text>
  ${board}
  <text x="${W / 2}" y="${H - 58}"
    font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="23" font-weight="700"
    letter-spacing="3.4" fill="${GOLD}" fill-opacity="0.9" text-anchor="middle">
    A NEW DEAL EVERY DAY
  </text>
</svg>`;

await sharp(Buffer.from(svg))
  .resize(W, H, { fit: 'fill' })
  .png()
  .toFile(join(__dirname, 'assets/og-images/molt-og.png'));

console.log('✓ molt-og.png written');
