import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from './node_modules/sharp/dist/index.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The wordmark ships as near-black ink. Thirteen's board is a dark blue felt
// table, so the fill is swapped for the card cream the game uses.
let logo = readFileSync(join(__dirname, 'assets/logos/thirteen_logo.svg'), 'utf8');
logo = logo
  .replace(/<\?xml[^>]*\?>\s*/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<defs>[\s\S]*?<\/defs>/g, '')
  .replace(/class="st0"/g, 'fill="#F7F3E6"');

const W = 1200, H = 630;
const FELT = '#16303F', FELT_HI = '#1C3D4F';
const CARD = '#F7F3E6', INK = '#1B1712', RED = '#C0392B';
const GOLD = '#E0B354';

// viewBox of the source wordmark, used to scale it without distortion
const LOGO_VB_W = 108.813, LOGO_VB_H = 17.825;
const LOGO_W = 430;
const LOGO_H = LOGO_W * (LOGO_VB_H / LOGO_VB_W);
const logoX = (W - LOGO_W) / 2;
const logoY = 92;
const taglineY = logoY + LOGO_H + 56;

// Three ways to make thirteen, side by side: a pair, a lone king, another pair.
// It states the entire rule of the game in one picture, which is the only job
// an OG image has.
const CW = 112, CH = Math.round(CW / 0.74);
const INNER_GAP = 10, GROUP_GAP = 36, PAD = 11;

const groups = [
  { cards: [{ r: 'Q', s: '♥', red: true }, { r: 'A', s: '♠', red: false }], note: '12 + 1 = 13' },
  { cards: [{ r: 'K', s: '♣', red: false }],                                note: 'K = 13' },
  { cards: [{ r: '8', s: '♦', red: true }, { r: '5', s: '♠', red: false }], note: '8 + 5 = 13' },
];

const groupW = g => g.cards.length * CW + (g.cards.length - 1) * INNER_GAP;
const totalW = groups.reduce((a, g) => a + groupW(g), 0) + GROUP_GAP * (groups.length - 1);

const rowY = 330;   // leaves the strapline clear of the inner border at H-46
let x = (W - totalW) / 2;
let board = '';

for (const g of groups) {
  const gw = groupW(g);
  // The gold surround is the game's selection colour, so the grouping reads as
  // "these go together" rather than as decoration.
  board += `<rect x="${x - PAD}" y="${rowY - PAD}" width="${gw + PAD * 2}" ` +
           `height="${CH + PAD * 2}" rx="16" fill="none" stroke="${GOLD}" ` +
           `stroke-width="2.5" stroke-opacity="0.85"/>`;

  g.cards.forEach((c, i) => {
    const cx = x + i * (CW + INNER_GAP);
    const fill = c.red ? RED : INK;
    board += `<rect x="${cx}" y="${rowY}" width="${CW}" height="${CH}" rx="11" fill="${CARD}"/>` +
             `<text x="${cx + CW / 2}" y="${rowY + CH / 2 - 4}" font-size="46" font-weight="700" ` +
             `fill="${fill}" text-anchor="middle" font-family="DM Sans, Helvetica, Arial, sans-serif">${c.r}</text>` +
             `<text x="${cx + CW / 2}" y="${rowY + CH / 2 + 42}" font-size="40" ` +
             `fill="${fill}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">${c.s}</text>`;
  });

  board += `<text x="${x + gw / 2}" y="${rowY + CH + PAD + 34}" font-size="23" font-weight="700" ` +
           `letter-spacing="1" fill="${GOLD}" fill-opacity="0.92" text-anchor="middle" ` +
           `font-family="DM Sans, Helvetica, Arial, sans-serif">${g.note}</text>`;

  x += gw + GROUP_GAP;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="felt" cx="50%" cy="12%" r="78%">
      <stop offset="0%" stop-color="${FELT_HI}"/>
      <stop offset="64%" stop-color="${FELT}"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#felt)"/>
  <rect x="46" y="46" width="${W - 92}" height="${H - 92}" fill="none"
        stroke="${CARD}" stroke-opacity="0.12" stroke-width="1"/>
  <g transform="translate(${logoX}, ${logoY}) scale(${LOGO_W / LOGO_VB_W})">
    ${logo}
  </g>
  <text x="${W / 2}" y="${taglineY}"
    font-family="DM Sans, Helvetica, Arial, sans-serif"
    font-size="31" fill="${CARD}" fill-opacity="0.62" text-anchor="middle">
    Clear the deck two cards at a time. Kings go alone.
  </text>
  ${board}
  <text x="${W / 2}" y="${H - 62}"
    font-family="DM Sans, Helvetica, Arial, sans-serif" font-size="23" font-weight="700"
    letter-spacing="3.4" fill="${CARD}" fill-opacity="0.5" text-anchor="middle">
    NOT EVERY DEAL CAN BE WON
  </text>
</svg>`;

await sharp(Buffer.from(svg))
  .resize(W, H, { fit: 'fill' })
  .png()
  .toFile(join(__dirname, 'assets/og-images/thirteen-og.png'));

console.log('✓ thirteen-og.png written');
