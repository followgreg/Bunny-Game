import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from './node_modules/sharp/dist/index.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Circuit logo — strip the CSS class and paint the paths white
let logo = readFileSync(join(__dirname, 'assets/logos/circuit_logo.svg'), 'utf8');
logo = logo
  .replace(/<\?xml[^>]*\?>\s*/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<defs>[\s\S]*?<\/defs>/g, '')
  .replace(/class="st0"/g, 'fill="#FFFFFF"');

const W = 1200, H = 630;
const LOGO_W = 620;
const LOGO_H = LOGO_W * (14.484 / 91.255);
const logoX = (W - LOGO_W) / 2;
const logoY = H / 2 - LOGO_H / 2 - 30;
const taglineY = logoY + LOGO_H + 66;

// Decorative hex-pipe lattice, echoing the board
const SQRT3 = Math.sqrt(3);
const S = 46;
const hexPts = (cx, cy) => Array.from({ length: 6 }, (_, i) => {
  const a = Math.PI * (30 + 60 * i) / 180;
  return `${(cx + S * Math.cos(a)).toFixed(1)},${(cy + S * Math.sin(a)).toFixed(1)}`;
}).join(' ');

let lattice = '';
for (let r = -3; r <= 3; r++) {
  for (let q = -5; q <= 5; q++) {
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) > 4) continue;
    const x = W / 2 + S * (SQRT3 * q + SQRT3 / 2 * r);
    const y = H / 2 + S * 1.5 * r;
    lattice += `<polygon points="${hexPts(x, y)}" fill="none" stroke="#00BFFF" stroke-width="1.2"/>`;
    // a couple of pipe stubs per cell
    const apo = S * SQRT3 / 2;
    [(q + r) % 6, (q * 2 + r) % 6].forEach(e => {
      const a = Math.PI * 60 * ((e + 6) % 6) / 180;
      lattice += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" ` +
                 `x2="${(x + apo * Math.cos(a)).toFixed(1)}" y2="${(y + apo * Math.sin(a)).toFixed(1)}" ` +
                 `stroke="#00BFFF" stroke-width="4" stroke-linecap="round"/>`;
    });
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0A0A0A"/>
  <g opacity="0.16">${lattice}</g>
  <!-- vignette so the logo reads clearly over the lattice -->
  <radialGradient id="v" cx="50%" cy="46%" r="52%">
    <stop offset="0%"   stop-color="#0A0A0A" stop-opacity="0.94"/>
    <stop offset="100%" stop-color="#0A0A0A" stop-opacity="0"/>
  </radialGradient>
  <rect width="${W}" height="${H}" fill="url(#v)"/>
  <g transform="translate(${logoX}, ${logoY}) scale(${LOGO_W / 91.255})">
    ${logo}
  </g>
  <text x="${W / 2}" y="${taglineY}"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="32" fill="#00BFFF" text-anchor="middle"
    letter-spacing="9">COMPLETE THE CIRCUIT.</text>
</svg>`;

await sharp(Buffer.from(svg))
  .resize(1200, 630, { fit: 'fill' })
  .png()
  .toFile(join(__dirname, 'assets/og-images/circuit-og.png'));

console.log('✓ circuit-og.png written');
