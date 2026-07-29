import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from './node_modules/sharp/dist/index.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read logo SVG and inline fills (strip CSS class + xml decl)
let logo = readFileSync(join(__dirname, 'assets/logos/coil_logo.svg'), 'utf8');
logo = logo
  .replace(/<\?xml[^>]*\?>\s*/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>/, '')
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/class="st0"/g, 'fill="#231f20"');

// Logo: 520px wide, proportional height
const LOGO_W = 520;
const LOGO_H = LOGO_W * (29.32 / 108.675); // ≈ 140px
const W = 1200, H = 630;
const logoX = (W - LOGO_W) / 2;
const logoY = (H / 2) - (LOGO_H / 2) - 36;
const taglineY = logoY + LOGO_H + 52;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- Background -->
  <rect width="${W}" height="${H}" fill="#E8E8E8"/>
  <!-- Subtle grid texture -->
  <rect width="${W}" height="${H}" fill="none" stroke="#D4D0C8" stroke-width="0.5" opacity="0.4"/>
  <!-- Decorative tile grid hint (bottom-left quadrant) -->
  <g opacity="0.07">
    ${Array.from({length:6}, (_,i) => Array.from({length:4}, (_,j) =>
      `<rect x="${40 + i*60}" y="${H-280 + j*60}" width="56" height="56" rx="4" fill="#1A3A6B"/>`
    ).join('')).join('')}
  </g>
  <!-- Decorative tile grid hint (top-right quadrant) -->
  <g opacity="0.07">
    ${Array.from({length:6}, (_,i) => Array.from({length:4}, (_,j) =>
      `<rect x="${W-400 + i*60}" y="${40 + j*60}" width="56" height="56" rx="4" fill="#1A3A6B"/>`
    ).join('')).join('')}
  </g>
  <!-- Coil logo -->
  <g transform="translate(${logoX}, ${logoY}) scale(${LOGO_W / 108.675})">
    ${logo}
  </g>
  <!-- Tagline -->
  <text x="${W/2}" y="${taglineY}"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="30" fill="#231f20" text-anchor="middle"
    letter-spacing="8" opacity="0.55">SLIDE. SPIN. LOCK.</text>
</svg>`;

await sharp(Buffer.from(svg))
  .resize(1200, 630, { fit: 'fill' })
  .png()
  .toFile(join(__dirname, 'assets/og-images/coil-og.png'));

console.log('✓ coil-og.png written');
