import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from './node_modules/sharp/dist/index.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Relation wordmark — already dark ink, so it needs no recolouring on parchment
let logo = readFileSync(join(__dirname, 'assets/logos/relation_logo.svg'), 'utf8');
logo = logo
  .replace(/<\?xml[^>]*\?>\s*/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<defs>[\s\S]*?<\/defs>/g, '')
  .replace(/class="st0"/g, 'fill="#1F1A14"');

const W = 1200, H = 630;
const LOGO_W = 560;
const LOGO_H = LOGO_W * (17.778 / 115.646);
const logoX = (W - LOGO_W) / 2;
const logoY = H / 2 - LOGO_H / 2 - 52;
const taglineY = logoY + LOGO_H + 66;

// A small 5x5 grid beneath the tagline, showing the game's actual shape:
// 18 letter tiles, 7 walls, and a winding path threaded through them.
const CELL = 52, GAP = 7;
const gridW = 5 * CELL + 4 * GAP;
const gx = (W - gridW) / 2;
const gy = H - 178;

// wall positions and a path, mirroring a real puzzle layout
const walls = new Set(['0,2','0,3','0,4','1,4','2,2','3,2','4,2']);
const pathCells = ['1,3','2,3','3,3','3,4','2,4'];   // a sample winding run

let tiles = '';
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 5; c++) {
    const x = gx + c * (CELL + GAP);
    const y = gy + r * (CELL + GAP);
    const key = r + ',' + c;
    const isWall = walls.has(key);
    const onPath = pathCells.includes(key);
    const fill   = isWall ? '#CFC7B6' : (onPath ? '#E9B93C' : '#FDFBF6');
    const stroke = isWall ? 'rgba(31,26,20,0.14)' : (onPath ? '#C8912A' : 'rgba(31,26,20,0.20)');
    tiles += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="7" ` +
             `fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
  }
}

// the connecting line through the path cells
const pts = pathCells.map(k => {
  const [r, c] = k.split(',').map(Number);
  return (gx + c * (CELL + GAP) + CELL / 2) + ',' + (gy + r * (CELL + GAP) + CELL / 2);
}).join(' ');
const line = `<polyline points="${pts}" fill="none" stroke="#C8912A" stroke-width="6" ` +
             `stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#F2ECDF"/>
  <rect x="46" y="46" width="${W - 92}" height="${H - 92}" fill="none"
        stroke="#1F1A14" stroke-opacity="0.10" stroke-width="1"/>
  <g transform="translate(${logoX}, ${logoY}) scale(${LOGO_W / 115.646})">
    ${logo}
  </g>
  <text x="${W / 2}" y="${taglineY}"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="34" fill="#1F1A14" fill-opacity="0.62" text-anchor="middle">
    Four words. One theme.
  </text>
  ${tiles}
  ${line}
</svg>`;

await sharp(Buffer.from(svg))
  .resize(1200, 630, { fit: 'fill' })
  .png()
  .toFile(join(__dirname, 'assets/og-images/relation-og.png'));

console.log('✓ relation-og.png written');
